#!/usr/bin/env node
/*
 * Plain-node test for the GitHub OAuth `state` (login-CSRF) nonce.
 *
 * The jasmine suite in this repo is Docker-gated, so this runs standalone:
 *   node scripts/test-oauth-state.js
 * Exits 0 on success, 1 on the first failure.
 *
 * What it pins down:
 *  - statesMatch() is a strict, constant-time comparison: only two identical
 *    non-empty strings pass. A missing cookie, a missing/empty query.state, a
 *    length mismatch (crypto.timingSafeEqual THROWS on those), a prefix or a
 *    non-string must all be rejected — and must not throw.
 *  - generateState() yields a fresh, long value on every call (the old code
 *    generated one nonce per process and shared it with every user).
 *  - the state cookie rides the IdP round-trip with the same options as the
 *    return-origin marker: httpOnly, SameSite=Lax, path "/", short maxAge.
 */

'use strict';

// This worktree has no node_modules. Stub what the module graph pulls in:
// `axios` (never called here) and `./globals` (reads a config file from disk
// and requires rollbar/fs-extra). Same trick as scripts/test-oauth-github-url.js.
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
  if (request === './globals' || request === './globals.js') {
    return {
      app_config: () => ({ api_url: 'https://rtm.thinx.cloud', public_url: 'https://rtm.thinx.cloud' }),
      prefix: () => ''
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const oauth = require('../lib/thinx/oauth-github.js');
const oauthReturn = require('../lib/thinx/oauth_return.js');
Module._load = originalLoad;

const statesMatch = oauth.statesMatch;
const generateState = oauth.generateState;

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

// Never let a throw masquerade as a rejection: every case runs through here.
function safeMatch(a, b) {
  try {
    return { value: statesMatch(a, b), threw: false };
  } catch (e) {
    return { value: null, threw: true, error: e };
  }
}

function rejects(name, a, b) {
  const r = safeMatch(a, b);
  check(name + ' -> rejected', r.threw === false && r.value === false,
    r.threw ? 'threw: ' + r.error : 'returned: ' + JSON.stringify(r.value));
}

console.log('statesMatch — the happy path');
{
  const s = generateState();
  const r = safeMatch(s, s);
  check('identical values accepted', r.threw === false && r.value === true,
    r.threw ? 'threw: ' + r.error : 'returned: ' + JSON.stringify(r.value));
  // A distinct string object with the same content (not the same reference).
  const copy = ('' + s).slice(0);
  check('equal-but-distinct strings accepted', statesMatch(s, copy) === true);
}

console.log('statesMatch — everything else is rejected');
{
  const s = generateState();

  rejects('mismatch, same length', s, generateState());
  rejects('mismatch, one char differs', 'a'.repeat(32), 'a'.repeat(31) + 'b');
  rejects('missing cookie (null)', null, s);
  rejects('missing cookie (undefined)', undefined, s);
  rejects('missing cookie (empty string)', '', s);
  rejects('missing query.state (undefined)', s, undefined);
  rejects('missing query.state (null)', s, null);
  rejects('empty query.state', s, '');
  rejects('both missing', null, null);
  rejects('both empty', '', '');
  rejects('different length (cookie longer)', s + 'extra', s);
  rejects('different length (state longer)', s, s + 'extra');
  rejects('received is a prefix of expected', s, s.slice(0, 8));
  rejects('expected is a prefix of received', s.slice(0, 8), s);
  rejects('non-string received: array of the value', s, [s]);
  rejects('non-string received: number', '1234', 1234);
  rejects('non-string received: object', s, { toString: () => s });
  rejects('non-string received: Buffer', s, Buffer.from(s, 'utf8'));
  rejects('non-string received: true', s, true);
  // url.parse(req.url, true).query gives an array for a repeated ?state=
  rejects('repeated query parameter (array)', s, [s, s]);
  rejects('non-string expected: object', {}, s);
  rejects('both non-string', {}, {});
}

console.log('generateState — fresh per call');
{
  const a = generateState();
  const b = generateState();
  check('two calls differ', a !== b, 'a=' + a + ' b=' + b);
  check('hex string', typeof a === 'string' && /^[0-9a-f]+$/.test(a), 'got: ' + JSON.stringify(a));
  check('at least 32 hex chars (>= 16 bytes of entropy)', a.length >= 32, 'length: ' + a.length);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(generateState());
  check('200 calls produce 200 distinct values', seen.size === 200, 'distinct: ' + seen.size);
}

console.log('state cookie — set on login, read+cleared on callback');
{
  const opts = oauthReturn.shortLivedCookieOptions();
  check('httpOnly', opts.httpOnly === true, JSON.stringify(opts));
  check('sameSite lax', opts.sameSite === 'lax', JSON.stringify(opts));
  check('path "/"', opts.path === '/', JSON.stringify(opts));
  check('short-lived (0 < maxAge <= 15 min)', opts.maxAge > 0 && opts.maxAge <= 15 * 60 * 1000,
    'maxAge: ' + opts.maxAge);
  check('secure-by-default not weakened: no sameSite "none"', opts.sameSite !== 'none');

  check('cookie name is its own, not the return-origin cookie',
    oauth.STATE_COOKIE !== oauthReturn.RETURN_COOKIE, oauth.STATE_COOKIE);

  // Minimal Express-ish double: records what login/callback do to the cookie jar.
  function fakeRes() {
    return {
      set: [], cleared: [],
      cookie: function (n, v, o) { this.set.push({ name: n, value: v, options: o }); },
      clearCookie: function (n, o) { this.cleared.push({ name: n, options: o }); }
    };
  }

  const res = fakeRes();
  const state = generateState();
  check('setShortLivedCookie reports success on a cookie-capable response',
    oauthReturn.setShortLivedCookie(res, oauth.STATE_COOKIE, state) === true);
  check('one cookie set, under the state name', res.set.length === 1 &&
    res.set[0].name === oauth.STATE_COOKIE && res.set[0].value === state, JSON.stringify(res.set));
  check('set with the short-lived options', res.set[0].options.httpOnly === true &&
    res.set[0].options.sameSite === 'lax' && res.set[0].options.path === '/' &&
    res.set[0].options.maxAge === opts.maxAge, JSON.stringify(res.set[0].options));
  check('setShortLivedCookie reports failure on a response that cannot set cookies',
    oauthReturn.setShortLivedCookie({}, oauth.STATE_COOKIE, state) === false);

  const req = { headers: { cookie: 'other=1; ' + oauth.STATE_COOKIE + '=' + state + '; thx_oauth_origin=https://console.thinx.cloud' } };
  const res2 = fakeRes();
  const taken = oauthReturn.takeCookie(req, res2, oauth.STATE_COOKIE);
  check('takeCookie returns the cookie value', taken === state, 'got: ' + JSON.stringify(taken));
  check('takeCookie clears it immediately (single use)', res2.cleared.length === 1 &&
    res2.cleared[0].name === oauth.STATE_COOKIE, JSON.stringify(res2.cleared));
  check('cleared with a matching path', res2.cleared[0].options.path === '/');
  check('taken value matches the one that was set', statesMatch(taken, state) === true);

  // Replay of the same callback URL: the cookie is gone, so nothing matches.
  const res3 = fakeRes();
  const replay = oauthReturn.takeCookie({ headers: {} }, res3, oauth.STATE_COOKIE);
  check('replay (no cookie header) yields null', replay === null, 'got: ' + JSON.stringify(replay));
  check('replayed state is rejected', statesMatch(replay, state) === false);
}

console.log('');
if (failures === 0) {
  console.log('PASS: ' + checks + ' checks');
  process.exit(0);
} else {
  console.log('FAIL: ' + failures + ' of ' + checks + ' checks failed');
  process.exit(1);
}
