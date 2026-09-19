#!/usr/bin/env node
/*
 * Plain-node test for the Google OAuth login-CSRF state check.
 *
 * The jasmine suite in this repo is Docker-gated, so this runs standalone:
 *   node scripts/test-google-oauth-state.js
 * Exits 0 on success, 1 if any check fails.
 *
 * What it pins down (lib/router.google.js consumeOAuthState):
 *  - the marker is keyed by the `state` value the provider hands back, so the
 *    callback can actually find what the initiator stored;
 *  - a callback with no state, an empty state, a non-string state (an array
 *    from a repeated query parameter, a number, an object) is rejected and
 *    does not throw;
 *  - a well-formed state with no marker in redis is rejected (login CSRF: the
 *    attacker never went through our initiator route);
 *  - an accepted state deletes its marker, so a replay of the same callback
 *    URL is rejected the second time.
 */

'use strict';

// lib/router.google.js pulls in the whole app at require time (config, CouchDB,
// audit log, simple-oauth2). This worktree has no node_modules, so stub every
// external the module touches on load, the way scripts/test-oauth-github-url.js
// stubs axios.
const Module = require('module');
const originalLoad = Module._load;

const crypto = require('crypto');
function fakeSha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

const STUBS = {
  './thinx/globals': {
    prefix: () => 'test_',
    app_config: () => ({ public_url: 'https://rtm.example.test' }),
    google_ocfg: () => ({ web: { redirect_uris: ['https://rtm.example.test/api/oauth/google/callback'] } }),
    redis_options: () => ({})
  },
  '../lib/thinx/database.js': function Database() { return { uri: () => 'http://couch.invalid:5984' }; },
  './thinx/couch': () => ({ use: () => ({ get: () => { throw new Error('couch stub: no db in this test'); } }) }),
  '../lib/thinx/audit': function AuditLog() { return { log: () => { } }; },
  'sha256': fakeSha256,
  './thinx/oauth_return': {
    rememberReturnOrigin: () => { },
    takeReturnOrigin: () => null,
    returnURLFor: () => 'https://rtm.example.test/'
  },
  './thinx/util': { redactToken: () => '<redacted>', respond: () => { } },
  'simple-oauth2': { AuthorizationCode: function AuthorizationCode() { return { authorizeURL: () => 'https://accounts.google.com/o/oauth2/v2/auth', getToken: () => { throw new Error('oauth stub: no network in this test'); } }; } }
};

Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) {
    try {
      return originalLoad.call(this, request, parent, isMain);
    } catch (e) {
      return STUBS[request];
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};

const router = require('../lib/router.google.js');
Module._load = originalLoad;

const consumeOAuthState = router.consumeOAuthState;
const PREFIX = router.OAUTH_STATE_PREFIX;
const TTL = router.OAUTH_STATE_TTL;

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

// Minimal stand-in for the node-redis legacy client: callback-style get/set/
// expire/del, exactly the surface lib/router.google.js uses.
function fakeRedis(options) {
  const opts = options || {};
  const store = new Map();
  const ttls = new Map();
  const calls = { get: 0, del: 0, set: 0, expire: 0 };
  return {
    store: store,
    ttls: ttls,
    calls: calls,
    set: function (key, value, cb) { calls.set += 1; store.set(key, value); if (cb) setImmediate(cb, null, 'OK'); },
    expire: function (key, seconds, cb) { calls.expire += 1; ttls.set(key, seconds); if (cb) setImmediate(cb, null, 1); },
    get: function (key, cb) {
      calls.get += 1;
      if (opts.failGet) return setImmediate(cb, new Error('redis down'), null);
      setImmediate(cb, null, store.has(key) ? store.get(key) : null);
    },
    del: function (key, cb) { calls.del += 1; store.delete(key); if (cb) setImmediate(cb, null, 1); }
  };
}

function consume(redis, state) {
  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      consumeOAuthState(redis, state, (ok) => {
        if (settled) return reject(new Error('callback called more than once'));
        settled = true;
        resolve(ok);
      });
    } catch (e) {
      reject(new Error('consumeOAuthState threw synchronously: ' + e.message));
    }
    setTimeout(() => { if (!settled) reject(new Error('callback never fired')); }, 2000).unref();
  });
}

const VALID_STATE = fakeSha256('a-local-token');

async function main() {

  console.log('exported constants');
  {
    check('prefix is the "oa:google:" namespace', PREFIX === 'oa:google:', 'got: ' + PREFIX);
    check('marker TTL is short-lived (60..300s) and not missing',
      typeof TTL === 'number' && TTL >= 60 && TTL <= 300, 'got: ' + TTL);
  }

  console.log('valid state with a present marker');
  {
    const redis = fakeRedis();
    redis.set(PREFIX + VALID_STATE, 'a-local-token');
    redis.expire(PREFIX + VALID_STATE, TTL);

    const ok = await consume(redis, VALID_STATE);
    check('accepted', ok === true);
    check('marker deleted afterwards (single use)', redis.store.has(PREFIX + VALID_STATE) === false,
      'store still has: ' + JSON.stringify([...redis.store.keys()]));
    check('exactly one del issued', redis.calls.del === 1, 'del calls: ' + redis.calls.del);
    check('marker was stored under the state, not under the raw token',
      redis.ttls.has(PREFIX + VALID_STATE), 'ttl keys: ' + JSON.stringify([...redis.ttls.keys()]));
  }

  console.log('replay of the same state');
  {
    const redis = fakeRedis();
    redis.set(PREFIX + VALID_STATE, 'a-local-token');

    const first = await consume(redis, VALID_STATE);
    const second = await consume(redis, VALID_STATE);
    check('first use accepted', first === true);
    check('second use rejected', second === false);
  }

  console.log('well-formed state with no marker (login CSRF)');
  {
    const redis = fakeRedis();
    // Attacker-chosen state that looks exactly like ours but was never issued.
    const forged = fakeSha256('attacker-token');
    const ok = await consume(redis, forged);
    check('rejected', ok === false);
    check('nothing deleted', redis.calls.del === 0, 'del calls: ' + redis.calls.del);
  }

  console.log('missing / empty / malformed state');
  {
    const cases = [
      ['undefined (parameter absent)', undefined],
      ['empty string', ''],
      ['whitespace', '   '],
      ['too short hex', 'deadbeef'],
      ['too long hex', VALID_STATE + 'ab'],
      ['non-hex of the right length', 'z'.repeat(64)],
      ['hex with a path separator', VALID_STATE.slice(0, 56) + '/../../x'],
      ['1MB junk', 'a'.repeat(1024 * 1024)]
    ];
    for (const [label, value] of cases) {
      const redis = fakeRedis();
      const ok = await consume(redis, value);
      check(label + ' -> rejected', ok === false);
      check(label + ' -> redis never consulted', redis.calls.get === 0, 'get calls: ' + redis.calls.get);
    }
  }

  console.log('non-string state does not throw');
  {
    const cases = [
      ['array (repeated query parameter)', [VALID_STATE, VALID_STATE]],
      ['array of one', [VALID_STATE]],
      ['number', 1234567890],
      ['object', { toString: () => VALID_STATE }],
      ['object with length', { length: 64 }],
      ['null', null],
      ['boolean', true],
      ['function', function () { return VALID_STATE; }]
    ];
    for (const [label, value] of cases) {
      const redis = fakeRedis();
      // Even if a marker somehow existed for the stringified form, it must not match.
      redis.set(PREFIX + String(value), 'a-local-token');
      let ok;
      try {
        ok = await consume(redis, value);
      } catch (e) {
        check(label + ' -> did not throw', false, e.message);
        continue;
      }
      check(label + ' -> rejected without throwing', ok === false);
      check(label + ' -> redis never consulted', redis.calls.get === 0, 'get calls: ' + redis.calls.get);
    }
  }

  console.log('redis failure fails closed');
  {
    const redis = fakeRedis({ failGet: true });
    redis.store.set(PREFIX + VALID_STATE, 'a-local-token');
    const ok = await consume(redis, VALID_STATE);
    check('lookup error -> rejected', ok === false);
  }

  console.log('');
  if (failures === 0) {
    console.log('PASS: ' + checks + ' checks');
    process.exit(0);
  } else {
    console.log('FAIL: ' + failures + ' of ' + checks + ' checks failed');
    process.exit(1);
  }
}

main().catch((e) => {
  console.log('ERROR: ' + e.stack);
  process.exit(1);
});
