// CR-01 (phase 24 review): GitHub OAuth token handling must be scoped to the
// request that started the exchange.
//
// router.github.js used to add a `githubOAuth.on('token', …)` and
// `on('error', …)` listener to the ONE process-wide client on every callback
// request. Listeners were never removed, so each token exchange ran every
// listener ever registered: with two logins in flight, user B's browser was
// redirected with user A's session token.
//
// These specs need no live services: the CouchDB user lookup is a stub
// (router.github.js is re-required with ./thinx/couch replaced), the GitHub
// token exchange is a stub on axios.post and the GitHub /user lookup is a stub
// on https.get. Every swap is undone in a finally block.

const expect = require('chai').expect;
const util = require('util');
const https = require('https');
const { EventEmitter } = require('events');
const axios = require('axios');
const { _resetCacheForTests, readSecret } = require("../../lib/thinx/secrets");

const ROUTER = "../../lib/router.github.js";
const COUCH = "../../lib/thinx/couch.js";
const FACTORY_ID = require.resolve("../../lib/thinx/oauth-github.js");
const STATE_COOKIE = require("../../lib/thinx/oauth-github.js").STATE_COOKIE;

const FAKE_CLIENT_SECRET = "spec-fake-gh-isolation-secret-5b21";

// Collect console output while fn runs (awaited). Returns the lines.
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

function tick(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms || 0));
}

// Resolves with "timeout" when p has not settled within ms.
function within(p, ms) {
  return Promise.race([p.then(() => "settled"), tick(ms).then(() => "timeout")]);
}

function fakeReq(state, code, cookieState) {
  const q = new URLSearchParams();
  if (typeof state === "string") q.set("state", state);
  if (typeof code === "string") q.set("code", code);
  const cookie = (typeof cookieState === "string") ? STATE_COOKIE + "=" + cookieState : "";
  return {
    url: "/api/oauth/github/callback?" + q.toString(),
    query: Object.fromEntries(q.entries()),
    headers: { cookie: cookie }
  };
}

// Express-ish response double. Records every redirect/end, so a response that
// is answered twice (the stale-listener symptom) is visible.
function fakeRes(name) {
  const res = {
    name: name,
    statusCode: 200,
    writableEnded: false,
    redirects: [],
    bodies: [],
    answers: 0
  };
  res.done = new Promise((resolve) => { res._resolve = resolve; });
  const answered = () => { res.answers += 1; res.writableEnded = true; res._resolve(); };
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = () => res;
  res.end = (body) => { if (typeof body !== "undefined") res.bodies.push(body); answered(); };
  res.redirect = (url) => { res.redirects.push(url); answered(); };
  res.cookie = () => { };
  res.clearCookie = () => { };
  res.setHeader = () => { };
  return res;
}

// Token exchange stub: each call waits until the spec releases its code.
function axiosStub() {
  const pending = {};
  const calls = [];
  function post(url, body) {
    const code = new URLSearchParams(body).get("code");
    calls.push(code);
    return new Promise((resolve, reject) => {
      pending[code] = { resolve, reject };
    });
  }
  function answer(code, data) {
    pending[code].resolve({ status: 200, data: data });
  }
  function fail(code, err) {
    pending[code].reject(err);
  }
  return { post, answer, fail, calls };
}

// GitHub /user stub: the profile is derived from the token it was called with.
function httpsGetStub(userCalls) {
  return function (options, cb) {
    const auth = options.headers.Authorization;
    userCalls.push(auth);
    const token = auth.replace(/^token /, "");
    const login = "user-" + token;
    const stream = new EventEmitter();
    process.nextTick(() => {
      cb(stream);
      stream.emit("data", JSON.stringify({ login: login, name: login, email: login + "@example.invalid" }));
      stream.emit("end");
    });
    return new EventEmitter();
  };
}

// Mount router.github.js against stubs; `drive` gets { handlers, clients }.
async function mountGithub(drive, env) {
  const redisCalls = [];
  const userCalls = [];
  const handlers = {};
  const clients = [];
  const register = (routes, handler) => {
    for (const r of [].concat(routes)) handlers[r] = handler;
  };
  const app = {
    owner: { trackUserLogin: () => { } },
    redis_client: {
      set: (...a) => redisCalls.push(["set", ...a]),
      expire: (...a) => redisCalls.push(["expire", ...a])
    },
    get: register,
    post: register
  };

  // Existing, consented user: validateGithubUser goes straight to the redirect.
  const couchStub = function () {
    return { use: () => ({ get: (id, cb) => setImmediate(() => cb(null, { gdpr_consent: true })) }) };
  };

  const stub = axiosStub();
  const saved = {
    axiosPost: axios.post,
    httpsGet: https.get,
    secret: process.env.GITHUB_CLIENT_SECRET,
    environment: process.env.ENVIRONMENT
  };

  // Record every client the router builds, so the spec can inspect listeners.
  require(FACTORY_ID);
  const realFactory = require.cache[FACTORY_ID].exports;
  require.cache[FACTORY_ID].exports = function (specs) {
    const client = realFactory(specs);
    clients.push(client);
    return client;
  };

  // Stubbed couch for the fresh router copy only.
  const couchId = require.resolve(COUCH);
  require(COUCH);
  const realCouch = require.cache[couchId].exports;
  // Load the router once normally first, so every dependency it pulls in is
  // cached against the real couch module; only the router copy below sees
  // the stub.
  require(ROUTER);
  const routerId = require.resolve(ROUTER);
  const savedRouter = require.cache[routerId];

  let lines;
  let secretValue;
  try {
    axios.post = stub.post;
    https.get = httpsGetStub(userCalls);
    process.env.GITHUB_CLIENT_SECRET = FAKE_CLIENT_SECRET;
    process.env.ENVIRONMENT = env || "development";
    _resetCacheForTests();
    secretValue = readSecret("GITHUB_CLIENT_SECRET");

    require.cache[couchId].exports = couchStub;
    delete require.cache[routerId];
    const router = require(ROUTER);
    require.cache[couchId].exports = realCouch;

    lines = await captureLogs(async () => {
      router(app);
      await drive({ handlers, clients, stub });
    });
  } finally {
    require.cache[couchId].exports = realCouch;
    require.cache[FACTORY_ID].exports = realFactory;
    if (savedRouter) require.cache[routerId] = savedRouter; else delete require.cache[routerId];
    axios.post = saved.axiosPost;
    https.get = saved.httpsGet;
    if (typeof saved.secret === "undefined") delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = saved.secret;
    if (typeof saved.environment === "undefined") delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = saved.environment;
    _resetCacheForTests();
  }
  return { lines, redisCalls, userCalls, secretValue };
}

function expectNoSecret(lines, secretValue) {
  for (const line of lines) {
    expect(line.includes(FAKE_CLIENT_SECRET), "log line leaks the client secret").to.equal(false);
    if (secretValue) expect(line.includes(secretValue), "log line leaks the client secret").to.equal(false);
  }
}

const CALLBACK = "/api/oauth/github/callback";

describe("GitHub OAuth: token handling is scoped to its own request (CR-01)", function () {

  it("delivers each interleaved login only its own token", async function () {
    const resA = fakeRes("A");
    const resB = fakeRes("B");
    const { lines, redisCalls, userCalls, secretValue } = await mountGithub(async ({ handlers, stub }) => {
      handlers[CALLBACK](fakeReq("stateA", "codeA", "stateA"), resA);
      handlers[CALLBACK](fakeReq("stateB", "codeB", "stateB"), resB);
      expect(stub.calls).to.deep.equal(["codeA", "codeB"]);

      // A's exchange finishes first while B is still waiting on GitHub.
      stub.answer("codeA", { access_token: "gho_AAAA" });
      await within(resA.done, 1000);
      await tick(20);
      stub.answer("codeB", { access_token: "gho_BBBB" });
      await within(resB.done, 1000);
      await tick(20);
    });

    expect(resA.redirects.length, "A answered once").to.equal(1);
    expect(resB.redirects.length, "B answered once").to.equal(1);
    expect(resA.answers).to.equal(1);
    expect(resB.answers).to.equal(1);
    expect(resA.redirects[0]).to.contain("t=ghat:gho_AAAA");
    expect(resA.redirects[0]).to.not.contain("gho_BBBB");
    expect(resB.redirects[0]).to.contain("t=ghat:gho_BBBB");
    expect(resB.redirects[0]).to.not.contain("gho_AAAA");

    // One GitHub /user lookup and one ghat: session per exchange.
    expect(userCalls).to.deep.equal(["token gho_AAAA", "token gho_BBBB"]);
    const sets = redisCalls.filter((c) => c[0] === "set").map((c) => c[1]);
    expect(sets).to.deep.equal(["ghat:gho_AAAA", "ghat:gho_BBBB"]);
    expectNoSecret(lines, secretValue);
  });

  it("does not add a 'token' or 'error' listener per callback request", async function () {
    const N = 5;
    const counts = {};
    const responses = [];
    await mountGithub(async ({ handlers, clients, stub }) => {
      expect(clients.length, "client built once at mount").to.equal(1);
      const client = clients[0];
      counts.tokenBefore = client.listenerCount("token");
      counts.errorBefore = client.listenerCount("error");
      for (let i = 0; i < N; i++) {
        const res = fakeRes("r" + i);
        responses.push(res);
        handlers[CALLBACK](fakeReq("s" + i, "code" + i, "s" + i), res);
        stub.answer("code" + i, { access_token: "gho_" + i + "xyz" });
        await within(res.done, 1000);
      }
      await tick(20);
      counts.tokenAfter = client.listenerCount("token");
      counts.errorAfter = client.listenerCount("error");
      counts.clients = clients.length;
    });
    expect(counts.clients).to.equal(1);
    expect(counts.tokenAfter).to.equal(counts.tokenBefore);
    expect(counts.errorAfter).to.equal(counts.errorBefore);
    expect(counts.errorAfter, "at most one response-independent error logger").to.be.at.most(1);
    responses.forEach((res, i) => {
      expect(res.answers, "response " + i + " answered once").to.equal(1);
      expect(res.redirects[0]).to.contain("t=ghat:gho_" + i + "xyz");
    });
  });

  it("ends the response when GitHub answers without an access token", async function () {
    const res = fakeRes("invalid");
    let outcome;
    const { lines, redisCalls, userCalls, secretValue } = await mountGithub(async ({ handlers, stub }) => {
      handlers[CALLBACK](fakeReq("s1", "codeX", "s1"), res);
      stub.answer("codeX", { error: "bad_verification_code" });
      outcome = await within(res.done, 1000);
      await tick(20);
    });
    expect(outcome, "response must not hang").to.equal("settled");
    expect(res.answers).to.equal(1);
    expect(res.statusCode).to.equal(401);
    expect(res.redirects).to.deep.equal([]);
    expect(userCalls).to.deep.equal([]);
    expect(redisCalls).to.deep.equal([]);
    expectNoSecret(lines, secretValue);
  });

  it("ends the response and logs no secret when the token exchange throws", async function () {
    const res = fakeRes("throws");
    let outcome;
    const { lines, redisCalls, secretValue } = await mountGithub(async ({ handlers, stub }) => {
      handlers[CALLBACK](fakeReq("s2", "codeY", "s2"), res);
      // axios errors carry the request config, and the request body holds the
      // client secret.
      const err = new Error("Request failed with status code 500");
      err.config = { data: "client_id=x&client_secret=" + FAKE_CLIENT_SECRET + "&code=codeY" };
      stub.fail("codeY", err);
      outcome = await within(res.done, 1000);
      await tick(20);
    });
    expect(outcome, "response must not hang").to.equal("settled");
    expect(res.answers).to.equal(1);
    expect(res.statusCode).to.equal(502);
    expect(redisCalls).to.deep.equal([]);
    expectNoSecret(lines, secretValue);
  });

  it("rejects a state mismatch with 403 and no token exchange", async function () {
    const res = fakeRes("csrf");
    let calls;
    const { lines, secretValue } = await mountGithub(async ({ handlers, stub }) => {
      handlers[CALLBACK](fakeReq("attacker", "codeZ", "victim"), res);
      await within(res.done, 1000);
      calls = stub.calls.slice();
    });
    expect(calls).to.deep.equal([]);
    expect(res.answers).to.equal(1);
    expect(res.statusCode).to.equal(403);
    expectNoSecret(lines, secretValue);
  });

  it("keeps the ENVIRONMENT=test 'test-ok' answer for a rejected callback", async function () {
    const res = fakeRes("test-env");
    await mountGithub(async ({ handlers }) => {
      handlers[CALLBACK](fakeReq(undefined, undefined, undefined), res);
      await within(res.done, 1000);
    }, "test");
    expect(res.answers).to.equal(1);
    expect(res.statusCode).to.equal(200);
    expect(res.bodies).to.deep.equal(["test-ok"]);
  });

  describe("oauth-github.js callback contract", function () {

    function client() {
      return require(FACTORY_ID)({
        githubClient: "cid",
        githubSecret: FAKE_CLIENT_SECRET,
        baseURL: "https://rtm.thinx.cloud",
        callbackURI: "/api/oauth/github/callback"
      });
    }

    async function withAxios(post, fn) {
      const saved = axios.post;
      axios.post = post;
      try {
        return await fn();
      } finally {
        axios.post = saved;
      }
    }

    it("calls cb(err) and ends the response on an invalid GitHub response", async function () {
      const res = fakeRes("contract-invalid");
      const cbArgs = [];
      const lines = await captureLogs(() => withAxios(
        () => Promise.resolve({ status: 200, data: { error: "bad_verification_code" } }),
        async () => {
          client().callback(fakeReq("s", "codeQ", "s"), res, (err, token) => cbArgs.push([err, token]));
          await within(res.done, 1000);
        }));
      expect(cbArgs.length).to.equal(1);
      expect(cbArgs[0][0]).to.be.an("error");
      expect(cbArgs[0][1]).to.equal(undefined);
      expect(res.answers).to.equal(1);
      expect(res.statusCode).to.equal(401);
      expectNoSecret(lines);
    });

    it("hands the token to cb and still emits 'token' for emitter consumers", async function () {
      const res = fakeRes("contract-ok");
      const emitted = [];
      const cbArgs = [];
      await withAxios(
        () => Promise.resolve({ status: 200, data: { access_token: "gho_contract" } }),
        async () => {
          const c = client();
          c.on("token", (t) => emitted.push(t));
          await new Promise((resolve) => {
            c.callback(fakeReq("s", "codeR", "s"), res, (err, token) => { cbArgs.push([err, token]); resolve(); });
          });
        });
      expect(cbArgs).to.deep.equal([[null, "gho_contract"]]);
      expect(emitted).to.deep.equal(["gho_contract"]);
      expect(res.answers, "the module leaves a successful response to the caller").to.equal(0);
    });

    it("does not throw on an error path when nobody listens for 'error'", async function () {
      const res = fakeRes("no-listener");
      const cbArgs = [];
      await captureLogs(async () => {
        client().callback(fakeReq("a", "codeS", "b"), res, (err) => cbArgs.push(err));
      });
      expect(cbArgs.length).to.equal(1);
      expect(res.statusCode).to.equal(403);
    });
  });
});
