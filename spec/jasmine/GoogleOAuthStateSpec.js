// quick-261003-x9z: the Google OAuth `state` must be bound to the browser that
// started the login (login CSRF, CWE-352; found while triaging pentest
// findings XALG-3/XALG-4).
//
// The state used to be checked only against a server-wide Redis marker. Any
// valid, unconsumed marker was accepted, whoever presented it: an attacker
// starts a Google login, finishes it with their own Google account, stops
// before following the callback and hands the victim the callback URL. The
// victim's browser then logs into the attacker's account.
//
// Now the initiator also stores the state in its own short-lived httpOnly
// cookie, and the callback reads + clears that cookie and compares it with
// `state` BEFORE the Redis marker is consumed or the code exchanged.
//
// No live services: Redis is an in-memory stub, simple-oauth2 is a recording
// stub (no network), and the router is re-required fresh so the stub is the
// one it builds clients from. Every swap is undone in a finally block.

const expect = require('chai').expect;
const util = require('util');
const { _resetCacheForTests } = require("../../lib/thinx/secrets");

const ROUTER = "../../lib/router.google.js";
const GOOGLE_COOKIE = "thx_oauth_state_google"; // the name the post-deploy check looks for
const GITHUB_STATE_COOKIE = require("../../lib/thinx/oauth-github.js").STATE_COOKIE;

const FAKE_SECRET = "spec-fake-google-state-secret-9c41";

const INIT = "/api/oauth/google";
const CALLBACK = "/api/oauth/google/callback";
const INIT_V2 = "/api/v2/oauth/google";
const CALLBACK_V2 = "/api/v2/oauth/google/callback";

async function captureLogs(fn) {
  const lines = [];
  const methods = ["log", "info", "warn", "error"];
  const orig = {};
  for (const m of methods) {
    orig[m] = console[m];
    console[m] = function () { lines.push(util.format.apply(util, arguments)); };
  }
  try {
    await fn(lines);
  } finally {
    for (const m of methods) console[m] = orig[m];
  }
  return lines;
}

// Re-require `relPath` with some of its dependencies' exports replaced; the
// returned restore() puts every cache entry back the way it was.
function freshRequire(relPath, stubs) {
  const targetId = require.resolve(relPath);
  const savedStubs = [];
  for (const stubId of Object.keys(stubs || {})) {
    const resolved = require.resolve(stubId);
    require(stubId);
    savedStubs.push({ resolved, exports: require.cache[resolved].exports });
    require.cache[resolved].exports = stubs[stubId];
  }
  const hadTarget = Object.prototype.hasOwnProperty.call(require.cache, targetId);
  const savedTarget = require.cache[targetId];
  delete require.cache[targetId];
  const preexisting = new Set(Object.keys(require.cache));
  function restore() {
    for (const id of Object.keys(require.cache)) {
      if (!preexisting.has(id)) delete require.cache[id];
    }
    if (hadTarget) require.cache[targetId] = savedTarget; else delete require.cache[targetId];
    for (const s of savedStubs) require.cache[s.resolved].exports = s.exports;
  }
  let mod;
  try {
    mod = require(targetId);
  } catch (e) {
    restore();
    throw e;
  }
  return { mod, restore };
}

// The node-redis legacy client surface router.google.js uses (callbacks).
function fakeRedis() {
  const store = new Map();
  const calls = [];
  return {
    store,
    calls,
    set: (key, value, cb) => { calls.push(["set", key]); store.set(key, value); if (cb) setImmediate(cb, null, "OK"); },
    expire: (key, seconds, cb) => { calls.push(["expire", key]); if (cb) setImmediate(cb, null, 1); },
    get: (key, cb) => { calls.push(["get", key]); setImmediate(cb, null, store.has(key) ? store.get(key) : null); },
    del: (key, cb) => { calls.push(["del", key]); store.delete(key); if (cb) setImmediate(cb, null, 1); }
  };
}

function fakeReq(url, query, cookieHeader) {
  return { url: url, query: query || {}, headers: (typeof cookieHeader === "string") ? { cookie: cookieHeader } : {} };
}

// Express-ish response double recording cookies, status and the answer.
function fakeRes() {
  const res = { statusCode: 200, ended: false, redirected: null, answers: 0, cookies: [], cleared: [] };
  res.done = new Promise((resolve) => { res._resolve = resolve; });
  const answered = () => { res.answers += 1; res._resolve(); };
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = () => res;
  res.end = () => { res.ended = true; answered(); };
  res.redirect = (url) => { res.redirected = url; answered(); };
  res.cookie = (name, value, opts) => { res.cookies.push({ name, value, opts }); return res; };
  res.clearCookie = (name, opts) => { res.cleared.push({ name, opts }); return res; };
  res.setHeader = () => { };
  return res;
}

// Mounts router.google.js against the stubs and hands `drive` a small API.
async function mountGoogle(drive) {
  const tokenCalls = [];
  function FakeAC() { }
  FakeAC.prototype.authorizeURL = function (params) {
    return "https://accounts.google.com/o/oauth2/v2/auth?state=" + encodeURIComponent(params.state);
  };
  // Reaching this IS the code exchange. It rejects, so the handler answers
  // without any network and the spec only has to look at tokenCalls.
  FakeAC.prototype.getToken = function (params) {
    tokenCalls.push(params.code);
    return Promise.reject(new Error("spec: no token exchange"));
  };

  const redis = fakeRedis();
  const handlers = {};
  const register = (routes, handler) => { for (const r of [].concat(routes)) handlers[r] = handler; };
  const app = { owner: {}, redis_client: redis, get: register, post: register };

  const savedSecret = process.env.GOOGLE_OAUTH_SECRET;
  let mod;
  let lines;
  process.env.GOOGLE_OAUTH_SECRET = FAKE_SECRET;
  _resetCacheForTests();
  try {
    lines = await captureLogs(async () => {
      const loaded = freshRequire(ROUTER, { "simple-oauth2": { AuthorizationCode: FakeAC } });
      mod = loaded.mod;
      try {
        mod(app);

        // Starts a login; resolves with the state sent to Google and the res.
        const login = async (path) => {
          const res = fakeRes();
          handlers[path || INIT](fakeReq(path || INIT, {}), res);
          await res.done;
          const state = res.redirected ? new URL(res.redirected).searchParams.get("state") : null;
          return { res, state };
        };
        // Runs a callback; `cookie` is the raw Cookie header (or undefined).
        const callback = async (state, code, cookie, path) => {
          const res = fakeRes();
          const query = {};
          if (typeof state === "string") query.state = state;
          if (typeof code === "string") query.code = code;
          await handlers[path || CALLBACK](fakeReq(path || CALLBACK, query, cookie), res);
          await res.done;
          return res;
        };
        await drive({ login, callback, redis, tokenCalls, mod });
      } finally {
        loaded.restore();
      }
    });
  } finally {
    if (typeof savedSecret === "undefined") delete process.env.GOOGLE_OAUTH_SECRET;
    else process.env.GOOGLE_OAUTH_SECRET = savedSecret;
    _resetCacheForTests();
  }
  return { lines, mod, tokenCalls, redis };
}

function cookieFor(state) {
  return GOOGLE_COOKIE + "=" + state;
}

function stateCookies(res) {
  return res.cookies.filter((c) => c.name === GOOGLE_COOKIE);
}

function clearedState(res) {
  return res.cleared.filter((c) => c.name === GOOGLE_COOKIE).length;
}

function expectNoValues(lines, values) {
  for (const line of lines) {
    for (const v of values) {
      if (typeof v === "string" && v.length > 0) {
        expect(line.includes(v), "a log line leaks a state/code value").to.equal(false);
      }
    }
  }
}

describe("Google OAuth: state is bound to the initiating browser (quick-261003-x9z)", function () {

  it("G1: the initiator sets a short-lived httpOnly SameSite=Lax cookie holding the state sent to Google", async function () {
    let out;
    const { mod } = await mountGoogle(async ({ login }) => {
      out = await login();
    });
    expect(mod.GOOGLE_STATE_COOKIE, "exported cookie name").to.equal(GOOGLE_COOKIE);
    expect(out.state).to.match(/^[a-f0-9]{64}$/);
    const set = stateCookies(out.res);
    expect(set.length, "exactly one state cookie").to.equal(1);
    expect(set[0].value).to.equal(out.state);
    expect(set[0].opts.httpOnly).to.equal(true);
    expect(String(set[0].opts.sameSite).toLowerCase()).to.equal("lax");
    expect(set[0].opts.path).to.equal("/");
    expect(set[0].opts.maxAge).to.be.a("number");
    expect(set[0].opts.maxAge).to.be.at.most(10 * 60 * 1000);
  });

  it("G1b: the /api/v2 initiator sets the same cookie", async function () {
    let out;
    await mountGoogle(async ({ login }) => {
      out = await login(INIT_V2);
    });
    const set = stateCookies(out.res);
    expect(set.length).to.equal(1);
    expect(set[0].value).to.equal(out.state);
  });

  it("G2: a callback with the matching cookie and a valid marker reaches the code exchange", async function () {
    let res;
    let state;
    const { tokenCalls, lines } = await mountGoogle(async ({ login, callback }) => {
      state = (await login()).state;
      res = await callback(state, "code-g2", cookieFor(state));
    });
    expect(tokenCalls).to.deep.equal(["code-g2"]);
    expect(res.statusCode).to.not.equal(403);
    expectNoValues(lines, [state, "code-g2"]);
  });

  it("G3: a valid, unconsumed marker without the cookie is rejected 403 before the code exchange", async function () {
    let res;
    let state;
    let markerAfter;
    const { tokenCalls, lines } = await mountGoogle(async ({ login, callback, redis, mod }) => {
      state = (await login()).state;
      res = await callback(state, "code-g3", undefined);
      markerAfter = redis.store.has(mod.OAUTH_STATE_PREFIX + state);
    });
    expect(res.statusCode).to.equal(403);
    expect(res.answers).to.equal(1);
    expect(tokenCalls).to.deep.equal([]);
    expect(markerAfter, "the rejected attempt does not consume the marker").to.equal(true);
    expect(lines.some((l) => /state not bound to this browser/.test(l))).to.equal(true);
    expectNoValues(lines, [state, "code-g3"]);
  });

  it("G3b: the same rejection on the /api/v2 callback", async function () {
    let res;
    const { tokenCalls } = await mountGoogle(async ({ login, callback }) => {
      const state = (await login(INIT_V2)).state;
      res = await callback(state, "code-g3b", "other=1", CALLBACK_V2);
    });
    expect(res.statusCode).to.equal(403);
    expect(tokenCalls).to.deep.equal([]);
  });

  it("G4: a cookie for a DIFFERENT (also valid) state is rejected 403", async function () {
    let res;
    let a;
    let b;
    const { tokenCalls, lines } = await mountGoogle(async ({ login, callback }) => {
      a = (await login()).state; // attacker's login, completed with their own account
      b = (await login()).state; // victim's browser holds the cookie for its own login
      res = await callback(a, "code-attacker", cookieFor(b));
    });
    expect(a).to.not.equal(b);
    expect(res.statusCode).to.equal(403);
    expect(tokenCalls).to.deep.equal([]);
    expectNoValues(lines, [a, b, "code-attacker"]);
  });

  it("G5: the state cookie is cleared on the callback, on accept and on reject", async function () {
    let accepted;
    let rejected;
    let noCookie;
    await mountGoogle(async ({ login, callback }) => {
      const s1 = (await login()).state;
      accepted = await callback(s1, "code-g5a", cookieFor(s1));
      const s2 = (await login()).state;
      rejected = await callback(s2, "code-g5b", cookieFor(s1));
      noCookie = await callback(s2, "code-g5c", undefined);
    });
    expect(clearedState(accepted), "cleared on accept").to.equal(1);
    expect(clearedState(rejected), "cleared on mismatch").to.equal(1);
    expect(clearedState(noCookie), "cleared when absent").to.equal(1);
  });

  it("G6: a replay of an accepted callback is rejected", async function () {
    let first;
    let replayNoCookie;
    let replayWithCookie;
    const { tokenCalls } = await mountGoogle(async ({ login, callback }) => {
      const s = (await login()).state;
      first = await callback(s, "code-g6", cookieFor(s));
      replayNoCookie = await callback(s, "code-g6", undefined); // the browser dropped the cleared cookie
      replayWithCookie = await callback(s, "code-g6", cookieFor(s)); // and even if it had not: marker consumed
    });
    expect(tokenCalls, "exactly one code exchange").to.deep.equal(["code-g6"]);
    expect(first.statusCode).to.not.equal(403);
    expect(replayNoCookie.statusCode).to.equal(403);
    expect(replayWithCookie.statusCode).to.equal(403);
  });

  it("G7: GitHub's state cookie keeps its name and does not satisfy the Google check", async function () {
    expect(GITHUB_STATE_COOKIE).to.equal("thx_oauth_state");
    expect(GITHUB_STATE_COOKIE).to.not.equal(GOOGLE_COOKIE);
    let res;
    const { tokenCalls } = await mountGoogle(async ({ login, callback }) => {
      const s = (await login()).state;
      res = await callback(s, "code-g7", GITHUB_STATE_COOKIE + "=" + s);
    });
    expect(res.statusCode).to.equal(403);
    expect(tokenCalls).to.deep.equal([]);
  });
});
