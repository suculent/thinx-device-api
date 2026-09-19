#!/usr/bin/env node
/*
 * Plain-node test for the GitHub OAuth token-exchange request builder.
 *
 * The jasmine suite in this repo is Docker-gated, so this runs standalone:
 *   node scripts/test-oauth-github-url.js
 * Exits 0 on success, 1 on the first failure.
 *
 * What it pins down:
 *  - `code` arrives URL-DECODED from url.parse(req.url, true).query, so a value
 *    like `x&client_secret=attacker` must NOT be able to add or override an
 *    outbound parameter (the old string-concatenated URL allowed exactly that).
 *  - the client secret must not appear in the request URL (it belongs in the
 *    POST body, where access logs / proxies / Referer do not see it).
 */

'use strict';

// The module under test only needs `axios` for the network call, which this
// test never makes. Stub it so the test runs without an installed node_modules.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'axios') {
    try {
      return originalLoad.call(this, request, parent, isMain);
    } catch (e) {
      return { post: () => { throw new Error('axios stub: no network in this test'); } };
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};

const oauth = require('../lib/thinx/oauth-github.js');
Module._load = originalLoad;
const buildTokenRequest = oauth.buildTokenRequest;
const parseResponse = oauth.parseResponse;

let failures = 0;
let checks = 0;

function check(name, condition, detail) {
  checks += 1;
  if (condition) {
    console.log('  ok   - ' + name);
  } else {
    failures += 1;
    console.log('  FAIL - ' + name + (detail ? '\n         ' + detail : ''));
  }
}

const CLIENT = 'iot-client-id';
const SECRET = 's3cr3t-value';
const STATE = 'deadbeefcafebabe';

// Hostile `code` values, already URL-decoded exactly as Express/url.parse hands them over.
const HOSTILE_CODES = [
  'x&client_secret=attacker',
  'x&client_id=attacker&scope=admin',
  'x&state=attacker',
  'x#fragment',
  'x?client_secret=attacker',
  'has space and+plus',
  'has"double" and \'single\' quotes',
  'x\n&client_secret=attacker',
  'x%26client_secret=attacker',
  'x=y&z',
  'x/../../evil',
];

function paramsOf(encodedBody) {
  // Parse strictly: collect every occurrence of every key, so a duplicated
  // parameter is visible rather than silently collapsed.
  const out = new Map();
  for (const pair of encodedBody.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent((eq === -1 ? pair : pair.slice(0, eq)).replace(/\+/g, ' '));
    const val = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(val);
  }
  return out;
}

console.log('buildTokenRequest — benign code');
{
  const r = buildTokenRequest({ githubClient: CLIENT, githubSecret: SECRET, code: 'abc123', state: STATE });
  const p = paramsOf(r.body);
  check('url is the bare GitHub token endpoint (no query string)',
    r.url === 'https://github.com/login/oauth/access_token', 'got: ' + r.url);
  check('client_secret is absent from the url',
    r.url.indexOf(SECRET) === -1 && r.url.indexOf('client_secret') === -1, 'got: ' + r.url);
  check('body carries exactly the four expected parameters',
    p.size === 4 && p.has('client_id') && p.has('client_secret') && p.has('code') && p.has('state'),
    'got keys: ' + JSON.stringify([...p.keys()]));
  check('values round-trip', p.get('client_id')[0] === CLIENT && p.get('client_secret')[0] === SECRET &&
    p.get('code')[0] === 'abc123' && p.get('state')[0] === STATE);
  check('Accept header requests JSON', r.headers.Accept === 'application/json');
  check('Content-Type is form-urlencoded', r.headers['Content-Type'] === 'application/x-www-form-urlencoded');
}

console.log('buildTokenRequest — hostile code values cannot inject parameters');
for (const code of HOSTILE_CODES) {
  const label = JSON.stringify(code);
  const r = buildTokenRequest({ githubClient: CLIENT, githubSecret: SECRET, code: code, state: STATE });
  const p = paramsOf(r.body);

  check(label + ' -> still exactly 4 distinct parameters', p.size === 4,
    'got keys: ' + JSON.stringify([...p.keys()]) + ' body: ' + r.body);
  check(label + ' -> no duplicated parameter',
    [...p.values()].every((v) => v.length === 1),
    'body: ' + r.body);
  check(label + ' -> client_secret is still ours', p.get('client_secret') &&
    p.get('client_secret').length === 1 && p.get('client_secret')[0] === SECRET,
    'body: ' + r.body);
  check(label + ' -> client_id is still ours', p.get('client_id') &&
    p.get('client_id')[0] === CLIENT, 'body: ' + r.body);
  check(label + ' -> state is still ours', p.get('state') && p.get('state')[0] === STATE,
    'body: ' + r.body);
  check(label + ' -> code survives verbatim after decoding', p.get('code')[0] === code,
    'got: ' + JSON.stringify(p.get('code')[0]));
  check(label + ' -> url untouched by the code value',
    r.url === 'https://github.com/login/oauth/access_token', 'got: ' + r.url);
  check(label + ' -> raw body contains no unencoded metacharacter from code',
    r.body.split('&').length === 4 && r.body.indexOf('#') === -1 &&
    r.body.indexOf(' ') === -1 && r.body.indexOf('"') === -1 && r.body.indexOf('\n') === -1,
    'body: ' + r.body);
}

console.log('parseResponse');
{
  check('JSON object -> token', parseResponse({ access_token: 'gho_abc', token_type: 'bearer' }) === 'gho_abc');
  check('form-encoded string -> token',
    parseResponse('access_token=gho_abc&scope=user&token_type=bearer') === 'gho_abc');
  check('form-encoded string with token not first -> token',
    parseResponse('scope=user&access_token=gho_abc&token_type=bearer') === 'gho_abc');
  check('percent-encoded value is decoded', parseResponse('access_token=gho_a%2Bb') === 'gho_a+b');
  check('JSON error payload -> null', parseResponse({ error: 'bad_verification_code' }) === null);
  check('form-encoded error payload -> null',
    parseResponse('error=bad_verification_code&error_description=nope') === null);
  check('null body -> null', parseResponse(null) === null);
  check('undefined body -> null', parseResponse(undefined) === null);
  check('empty string -> null', parseResponse('') === null);
}

console.log('');
if (failures === 0) {
  console.log('PASS: ' + checks + ' checks');
  process.exit(0);
} else {
  console.log('FAIL: ' + failures + ' of ' + checks + ' checks failed');
  process.exit(1);
}
