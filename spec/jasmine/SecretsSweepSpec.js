// Phase 24 secrets sweep (SEC-CFG-02): every swept credential resolves through
// readSecret() — /run/secrets/<NAME> first, then the env var, else the
// integration is off (D-01, D-02, D-06).
//
// These specs need no live services. They simulate secret files by wrapping
// fs.existsSync / fs.readFileSync for /run/secrets/<NAME> of the names under
// test only, and re-require the target module with third-party clients
// (mailgun.js, slack-notify) replaced by recording stubs.
//
// IMPORTANT:
// - Never set or delete COUCHDB_USER, COUCHDB_PASS or REDIS_PASSWORD here.
//   Other suites build Database/Redis clients from those env values, and
//   clearing them mid-suite breaks DB/Redis bring-up downstream.
// - In CI the whole jasmine suite runs in ONE process with real values for the
//   credentials swept here, so every swap below (process.env, the readSecret
//   cache, fs wrappers, require.cache entries, console.log) is undone in a
//   finally block.
// - Values below are throwaway fakes. They must never reach a log line; every
//   case asserts that.

const expect = require('chai').expect;
const fs = require('fs');
const util = require('util');
const { _resetCacheForTests } = require("../../lib/thinx/secrets");

const SECRETS_DIR = "/run/secrets/";

const FAKE = {
  mailgunFile: "spec-fake-mailgun-file-7c1e",
  mailgunEnv: "spec-fake-mailgun-env-2b9d",
  slackBotFile: "spec-fake-slackbot-file-4a1f",
  slackBotEnv: "spec-fake-slackbot-env-9e3c",
  slackSecretFile: "spec-fake-slacksecret-file-51d0",
  slackWebhookFile: "spec-fake-slackhook-file-c28a",
  slackWebhookEnv: "spec-fake-slackhook-env-06b7",
  workerSecretFile: "spec-fake-workersecret-file-8d42",
  githubSecretFile: "spec-fake-githubsecret-file-3f6a",
  githubSecretEnv: "spec-fake-githubsecret-env-a90c",
  googleSecretFile: "spec-fake-googlesecret-file-e71b",
  googleSecretEnv: "spec-fake-googlesecret-env-15d8"
};

// ---------------------------------------------------------------------------
// Harness (reused by plan 24-03)
// ---------------------------------------------------------------------------

// spec: { NAME: { file } | { env } | { file, env } | "absent" }
async function withSecrets(spec, fn) {
  const names = Object.keys(spec);
  const savedEnv = {};
  const files = {};

  for (const name of names) {
    savedEnv[name] = process.env[name];
    const entry = spec[name];
    if (entry === "absent" || typeof (entry.env) === "undefined") {
      delete process.env[name];
    } else {
      process.env[name] = entry.env;
    }
    if (entry !== "absent" && typeof (entry.file) !== "undefined") {
      files[SECRETS_DIR + name] = entry.file;
    }
  }

  const owned = new Set(names.map((n) => SECRETS_DIR + n));
  const origExists = fs.existsSync;
  const origRead = fs.readFileSync;

  // Delegate every path we do not own: the module loader and fs-extra read
  // real files during the fresh requires below.
  fs.existsSync = function (p) {
    if (typeof (p) === "string" && owned.has(p)) {
      return Object.prototype.hasOwnProperty.call(files, p);
    }
    return origExists.apply(fs, arguments);
  };
  fs.readFileSync = function (p) {
    if (typeof (p) === "string" && Object.prototype.hasOwnProperty.call(files, p)) {
      return files[p];
    }
    return origRead.apply(fs, arguments);
  };

  _resetCacheForTests();
  try {
    return await fn();
  } finally {
    fs.existsSync = origExists;
    fs.readFileSync = origRead;
    for (const name of names) {
      if (typeof (savedEnv[name]) === "undefined") {
        delete process.env[name];
      } else {
        process.env[name] = savedEnv[name];
      }
    }
    _resetCacheForTests();
  }
}

// Require relPath fresh with the given module ids' exports replaced by fakes.
// Returns { mod, restore }; always call restore() in finally.
// restore() also evicts every module that was loaded for the FIRST time during
// the fresh require (e.g. owner.js pulled in by transfer.js's dependency
// chain), because those instances captured the swapped secrets/stubs and must
// not be served to later suites.
function freshRequire(relPath, stubs) {
  stubs = stubs || {};
  const targetId = require.resolve(relPath);
  const savedStubs = [];

  for (const stubId of Object.keys(stubs)) {
    const resolved = require.resolve(stubId);
    require(stubId); // make sure the real module has a cache entry
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
    if (hadTarget) {
      require.cache[targetId] = savedTarget;
    } else {
      delete require.cache[targetId];
    }
    for (const s of savedStubs) {
      require.cache[s.resolved].exports = s.exports;
    }
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

function expectNoFakeValues(lines) {
  for (const line of lines) {
    for (const key of Object.keys(FAKE)) {
      expect(line.includes(FAKE[key]), "log line leaks a credential value").to.equal(false);
    }
  }
}

function countMatching(lines, re) {
  return lines.filter((l) => re.test(l)).length;
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function mailgunStub() {
  const calls = [];
  function FakeMailgun() { /* formData ignored */ }
  FakeMailgun.prototype.client = function (opts) {
    calls.push(opts);
    return { messages: { create: () => Promise.resolve({ id: "spec" }) } };
  };
  return { exports: FakeMailgun, calls };
}

// sendMail only touches the module-level Mailgun client and app_config, so it
// is called on the prototype; constructing Owner/Transfer would need Redis.
function sendMailAsPromise(Klass, contents, type) {
  return new Promise((resolve) => {
    Klass.prototype.sendMail.call({}, contents, type, function (success, response) {
      resolve({ success, response });
    });
  });
}

// slack-notify factory stub: records the webhook it is built with.
function slackNotifyStub() {
  const calls = [];
  function factory(webhook) {
    calls.push(webhook);
    return { send: () => Promise.resolve() };
  }
  return { exports: factory, calls };
}

const MAIL = { from: "spec@example.invalid", to: "spec@example.invalid", subject: "spec", text: "spec" };

// ---------------------------------------------------------------------------
// MAILGUN_API_KEY — owner.js and transfer.js (module-load readers)
// ---------------------------------------------------------------------------

describe("Secrets sweep: MAILGUN_API_KEY", function () {

  // Load the targets once under the real environment, as spec/helpers/bootstrap
  // does in CI, so freshRequire re-evaluates only the target and not its
  // dependency tree (transfer.js pulls in owner.js through devices.js).
  beforeAll(function () {
    require("../../lib/thinx/owner.js");
    require("../../lib/thinx/transfer.js");
  });

  describe("owner.js", function () {

    async function loadOwner(secretSpec) {
      const stub = mailgunStub();
      let result;
      const lines = await withSecrets({ MAILGUN_API_KEY: secretSpec }, () => captureLogs(async () => {
        const { mod: Owner, restore } = freshRequire("../../lib/thinx/owner.js", { "mailgun.js": stub.exports });
        try {
          result = await sendMailAsPromise(Owner, MAIL, "reset");
        } finally {
          restore();
        }
      }));
      return { stub, lines, result };
    }

    it("builds no Mailgun client and fails sendMail fast when the key is absent", async function () {
      const { stub, lines, result } = await loadOwner("absent");
      expect(stub.calls.length).to.equal(0);
      expect(result).to.deep.equal({ success: false, response: "reset_failed" });
      expect(countMatching(lines, /\[owner\] MAILGUN_API_KEY not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("treats an empty env value as absent", async function () {
      const { stub, lines, result } = await loadOwner({ env: "" });
      expect(stub.calls.length).to.equal(0);
      expect(result).to.deep.equal({ success: false, response: "reset_failed" });
      expect(countMatching(lines, /\[owner\] MAILGUN_API_KEY not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("builds the client from the env value when no secret file exists", async function () {
      const { stub, lines } = await loadOwner({ env: FAKE.mailgunEnv });
      expect(stub.calls.length).to.equal(1);
      expect(stub.calls[0].key).to.equal(FAKE.mailgunEnv);
      expect(countMatching(lines, /\[owner\] MAILGUN_API_KEY not set/)).to.equal(0);
      expectNoFakeValues(lines);
    });

    it("prefers the secret file over a different env value and sends mail", async function () {
      const { stub, lines, result } = await loadOwner({ file: FAKE.mailgunFile, env: FAKE.mailgunEnv });
      expect(stub.calls.length).to.equal(1);
      expect(stub.calls[0].key).to.equal(FAKE.mailgunFile);
      expect(result).to.deep.equal({ success: true, response: "reset_sent" });
      expectNoFakeValues(lines);
    });
  });

  describe("transfer.js", function () {

    async function loadTransfer(secretSpec) {
      const stub = mailgunStub();
      let result;
      const lines = await withSecrets({ MAILGUN_API_KEY: secretSpec }, () => captureLogs(async () => {
        const { mod: Transfer, restore } = freshRequire("../../lib/thinx/transfer.js", { "mailgun.js": stub.exports });
        try {
          result = await sendMailAsPromise(Transfer, MAIL, "transfer_request");
        } finally {
          restore();
        }
      }));
      return { stub, lines, result };
    }

    it("builds no Mailgun client and fails sendMail fast when the key is absent", async function () {
      const { stub, lines, result } = await loadTransfer("absent");
      expect(stub.calls.length).to.equal(0);
      expect(result).to.deep.equal({ success: false, response: "transfer_request_failed" });
      expect(countMatching(lines, /\[transfer\] MAILGUN_API_KEY not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("builds the client from the secret file", async function () {
      const { stub, lines } = await loadTransfer({ file: FAKE.mailgunFile });
      expect(stub.calls.length).to.equal(1);
      expect(stub.calls[0].key).to.equal(FAKE.mailgunFile);
      expectNoFakeValues(lines);
    });

    it("prefers the secret file over a different env value", async function () {
      const { stub, lines } = await loadTransfer({ file: FAKE.mailgunFile, env: FAKE.mailgunEnv });
      expect(stub.calls.length).to.equal(1);
      expect(stub.calls[0].key).to.equal(FAKE.mailgunFile);
      expectNoFakeValues(lines);
    });
  });
});

// ---------------------------------------------------------------------------
// Slack: SLACK_BOT_TOKEN, SLACK_CLIENT_SECRET, SLACK_WEBHOOK
// ---------------------------------------------------------------------------

describe("Secrets sweep: Slack credentials", function () {

  const EventEmitter = require('events');

  beforeAll(function () {
    require("../../lib/thinx/messenger.js");
    require("../../lib/thinx/notifier.js");
  });

  describe("messenger.js SLACK_BOT_TOKEN", function () {

    it("creates no RTM client and reports failure when the token is absent", async function () {
      const Messenger = require("../../lib/thinx/messenger.js");
      let attachCalls = 0;
      const fake = {
        DISABLE_SLACK: false,
        redis: { get: async () => null },
        getBotToken: Messenger.prototype.getBotToken,
        attachCallbacks: () => { attachCalls++; }
      };
      let ok;
      const lines = await withSecrets({ SLACK_BOT_TOKEN: "absent" }, () => captureLogs(async () => {
        ok = await new Promise((resolve) => { Messenger.prototype.initSlack.call(fake, resolve); });
      }));
      expect(ok).to.equal(false);
      expect(fake.rtm).to.equal(undefined);
      expect(attachCalls).to.equal(0);
      expect(countMatching(lines, /SLACK_BOT_TOKEN not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("resolves the bot token from the secret file", async function () {
      const Messenger = require("../../lib/thinx/messenger.js");
      let token;
      const lines = await withSecrets({ SLACK_BOT_TOKEN: { file: FAKE.slackBotFile } }, () => captureLogs(async () => {
        token = await Messenger.prototype.getBotToken.call({ redis: { get: async () => null } });
      }));
      expect(token).to.equal(FAKE.slackBotFile);
      expectNoFakeValues(lines);
    });

    it("prefers the secret file over a different env value", async function () {
      const Messenger = require("../../lib/thinx/messenger.js");
      let token;
      await withSecrets({ SLACK_BOT_TOKEN: { file: FAKE.slackBotFile, env: FAKE.slackBotEnv } }, async () => {
        token = await Messenger.prototype.getBotToken.call({ redis: { get: async () => null } });
      });
      expect(token).to.equal(FAKE.slackBotFile);
    });
  });

  describe("router.slack.js SLACK_CLIENT_SECRET", function () {

    async function runRedirect(secretSpec) {
      const https = require('https');
      const handlers = {};
      require("../../lib/router.slack.js")({ get: (route, h) => { handlers[route] = h; } });
      const getCalls = [];
      const redirects = [];
      const origGet = https.get;
      https.get = function (options) {
        getCalls.push(options);
        return { on() { return this; } };
      };
      let lines;
      try {
        lines = await withSecrets({ SLACK_CLIENT_SECRET: secretSpec }, () => captureLogs(async () => {
          handlers["/api/slack/redirect"](
            { url: "/api/slack/redirect?code=A&state=B", query: { code: "A", state: "B" } },
            { redirect: (url) => redirects.push(url) }
          );
        }));
      } finally {
        https.get = origGet;
      }
      return { getCalls, redirects, lines };
    }

    it("skips the token exchange but still redirects when the secret is absent", async function () {
      const { getCalls, redirects, lines } = await runRedirect("absent");
      expect(getCalls.length).to.equal(0);
      expect(redirects.length).to.equal(1);
      expect(redirects[0].endsWith("/app/#/profile/help")).to.equal(true);
      expect(countMatching(lines, /SLACK_CLIENT_SECRET not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("exchanges the code with the client secret from the secret file", async function () {
      const { getCalls, redirects, lines } = await runRedirect({ file: FAKE.slackSecretFile });
      expect(getCalls.length).to.equal(1);
      expect(getCalls[0].path).to.contain(FAKE.slackSecretFile);
      expect(redirects.length).to.equal(1);
      expectNoFakeValues(lines);
    });
  });

  describe("notifier.js SLACK_WEBHOOK", function () {

    async function appStart(secretSpec) {
      const stub = slackNotifyStub();
      const lines = await withSecrets({ SLACK_WEBHOOK: secretSpec }, () => captureLogs(async () => {
        const { mod: Notifier, restore } = freshRequire("../../lib/thinx/notifier.js", { "slack-notify": stub.exports });
        try {
          Notifier.notifyAppStart();
        } finally {
          restore();
        }
      }));
      return { stub, lines };
    }

    it("builds no slack-notify client when the webhook is absent", async function () {
      const { stub, lines } = await appStart("absent");
      expect(stub.calls.length).to.equal(0);
      expect(countMatching(lines, /SLACK_WEBHOOK not set — skipping app-start notification/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("prefers the secret file over a different env value", async function () {
      const { stub, lines } = await appStart({ file: FAKE.slackWebhookFile, env: FAKE.slackWebhookEnv });
      expect(stub.calls).to.deep.equal([FAKE.slackWebhookFile]);
      expectNoFakeValues(lines);
    });
  });

  describe("redis-health.js SLACK_WEBHOOK", function () {

    async function attachWith(secretSpec) {
      const { attach } = require("../../lib/thinx/redis-health.js");
      const calls = [];
      const spy = (webhook) => { calls.push(webhook); return { send: () => Promise.resolve() }; };
      const lines = await withSecrets({ SLACK_WEBHOOK: secretSpec }, () => captureLogs(async () => {
        const handle = attach(new EventEmitter(), { slackNotify: spy });
        handle.detach();
      }));
      return { calls, lines };
    }

    it("builds no slack-notify client when the webhook is absent", async function () {
      const { calls, lines } = await attachWith("absent");
      expect(calls.length).to.equal(0);
      expect(countMatching(lines, /SLACK_WEBHOOK not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("builds the client from the secret file", async function () {
      const { calls, lines } = await attachWith({ file: FAKE.slackWebhookFile });
      expect(calls).to.deep.equal([FAKE.slackWebhookFile]);
      expectNoFakeValues(lines);
    });
  });
});

// ---------------------------------------------------------------------------
// WORKER_SECRET — queue.js connect_error (the builder.js job side is covered
// in BuilderRemoteJobSpec)
// ---------------------------------------------------------------------------

describe("Secrets sweep: WORKER_SECRET in queue.js", function () {

  // setupSocket only registers handlers, so it runs on a bare prototype
  // instance with a recording socket (the constructor needs Redis and binds
  // port 4000).
  function fakeQueueSocket() {
    const Queue = require("../../lib/thinx/queue.js");
    const handlers = {};
    const socket = {
      id: "spec-socket",
      auth: {},
      connects: 0,
      on(event, handler) { handlers[event] = handler; },
      connect() { this.connects++; }
    };
    const queue = Object.create(Queue.prototype);
    queue.workers = {};
    queue.setupSocket(socket);
    return { socket, handlers };
  }

  it("does not retry the connection when WORKER_SECRET is absent", async function () {
    const { socket, handlers } = fakeQueueSocket();
    expect(typeof handlers.connect_error).to.equal("function");
    const lines = await withSecrets({ WORKER_SECRET: "absent" }, () => captureLogs(async () => {
      handlers.connect_error(new Error("spec"));
    }));
    expect(socket.connects).to.equal(0);
    expect(socket.auth.token).to.equal(undefined);
    expectNoFakeValues(lines);
  });

  it("retries once with the token from the secret file", async function () {
    const { socket, handlers } = fakeQueueSocket();
    const lines = await withSecrets({ WORKER_SECRET: { file: FAKE.workerSecretFile } }, () => captureLogs(async () => {
      handlers.connect_error(new Error("spec"));
    }));
    expect(socket.connects).to.equal(1);
    expect(socket.auth.token).to.equal(FAKE.workerSecretFile);
    expectNoFakeValues(lines);
  });
});

// ---------------------------------------------------------------------------
// OAuth: GITHUB_CLIENT_SECRET (router.github.js) and GOOGLE_OAUTH_SECRET
// (router.google.js)
// ---------------------------------------------------------------------------

describe("Secrets sweep: OAuth client secrets", function () {

  beforeAll(function () {
    require("../../lib/router.github.js");
    require("../../lib/router.google.js");
  });

  // Records the routes a router registers; `app.get(paths, handler)`.
  function fakeApp(redisCalls) {
    const handlers = {};
    const register = (routes, handler) => {
      for (const r of [].concat(routes)) handlers[r] = handler;
    };
    return {
      handlers,
      app: {
        owner: {},
        redis_client: {
          set: (...a) => redisCalls.push(["set", ...a]),
          expire: (...a) => redisCalls.push(["expire", ...a]),
          get: (key, cb) => { redisCalls.push(["get", key]); cb(null, null); },
          del: (...a) => redisCalls.push(["del", ...a])
        },
        get: register,
        post: register
      }
    };
  }

  function fakeReq(url, query) {
    return { url: url, query: query || {}, headers: {} };
  }

  // Resolves when the handler answers (status+end, or redirect).
  function fakeRes() {
    const res = { statusCode: null, redirected: null, ended: false };
    res.done = new Promise((resolve) => { res._resolve = resolve; });
    res.status = (code) => { res.statusCode = code; return res; };
    res.set = () => res;
    res.end = () => { res.ended = true; res._resolve(); };
    res.redirect = (url) => { res.redirected = url; res._resolve(); };
    res.cookie = () => { };
    res.clearCookie = () => { };
    res.setHeader = () => { };
    return res;
  }

  describe("router.github.js GITHUB_CLIENT_SECRET", function () {

    const FACTORY_ID = require.resolve("../../lib/thinx/oauth-github.js");

    // The router requires the oauth-github factory lazily, inside the router
    // function, so replacing its cached exports intercepts every build.
    async function mountGithub(secretSpec, drive) {
      require(FACTORY_ID);
      const factoryCalls = [];
      const clientCalls = [];
      const savedExports = require.cache[FACTORY_ID].exports;
      require.cache[FACTORY_ID].exports = function (specs) {
        factoryCalls.push(specs);
        return {
          on: () => { },
          login: (req, res) => { clientCalls.push("login"); res.end(); },
          callback: (req, res) => { clientCalls.push("callback"); res.end(); }
        };
      };
      const redisCalls = [];
      const { app, handlers } = fakeApp(redisCalls);
      let lines;
      try {
        lines = await withSecrets({ GITHUB_CLIENT_SECRET: secretSpec }, () => captureLogs(async () => {
          require("../../lib/router.github.js")(app);
          await drive(handlers);
        }));
      } finally {
        require.cache[FACTORY_ID].exports = savedExports;
      }
      return { factoryCalls, clientCalls, lines };
    }

    it("builds no client, answers 400 on login and callback when the secret is absent", async function () {
      const results = {};
      const { factoryCalls, clientCalls, lines } = await mountGithub("absent", async (handlers) => {
        const loginRes = fakeRes();
        handlers["/api/oauth/github"](fakeReq("/api/oauth/github"), loginRes);
        await loginRes.done;
        results.login = loginRes.statusCode;
        const cbRes = fakeRes();
        handlers["/api/oauth/github/callback"](fakeReq("/api/oauth/github/callback?code=abcd&state=x", { code: "abcd", state: "x" }), cbRes);
        await cbRes.done;
        results.callback = cbRes.statusCode;
      });
      expect(factoryCalls.length).to.equal(0);
      expect(clientCalls).to.deep.equal([]);
      expect(results).to.deep.equal({ login: 400, callback: 400 });
      expect(countMatching(lines, /GITHUB_CLIENT_SECRET not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("builds the client once from the secret file and serves login and callback", async function () {
      const { factoryCalls, clientCalls, lines } = await mountGithub({ file: FAKE.githubSecretFile }, async (handlers) => {
        const loginRes = fakeRes();
        handlers["/api/oauth/github"](fakeReq("/api/oauth/github"), loginRes);
        await loginRes.done;
        const cbRes = fakeRes();
        handlers["/api/oauth/github/callback"](fakeReq("/api/oauth/github/callback?code=abcd&state=x", { code: "abcd", state: "x" }), cbRes);
        await cbRes.done;
      });
      expect(factoryCalls.length).to.equal(1);
      expect(factoryCalls[0].githubSecret).to.equal(FAKE.githubSecretFile);
      expect(factoryCalls[0].githubClient).to.equal(process.env.GITHUB_CLIENT_ID);
      expect(clientCalls).to.deep.equal(["login", "callback"]);
      expect(countMatching(lines, /GITHUB_CLIENT_SECRET not set/)).to.equal(0);
      expectNoFakeValues(lines);
    });

    it("prefers the secret file over a different env value", async function () {
      const { factoryCalls, lines } = await mountGithub({ file: FAKE.githubSecretFile, env: FAKE.githubSecretEnv }, async () => { });
      expect(factoryCalls.length).to.equal(1);
      expect(factoryCalls[0].githubSecret).to.equal(FAKE.githubSecretFile);
      expectNoFakeValues(lines);
    });
  });

  describe("router.google.js GOOGLE_OAUTH_SECRET", function () {

    // simple-oauth2 is required at module load, so the router is loaded fresh
    // with a recording AuthorizationCode.
    async function mountGoogle(secretSpec, drive) {
      const constructed = [];
      function FakeAC(config) { constructed.push(config); }
      FakeAC.prototype.authorizeURL = function (params) {
        return "https://accounts.google.com/o/oauth2/v2/auth?state=" + encodeURIComponent(params.state);
      };
      FakeAC.prototype.getToken = function () { return Promise.reject(new Error("spec: no token exchange")); };
      const redisCalls = [];
      const { app, handlers } = fakeApp(redisCalls);
      const lines = await withSecrets({ GOOGLE_OAUTH_SECRET: secretSpec }, () => captureLogs(async () => {
        const { mod, restore } = freshRequire("../../lib/router.google.js", { "simple-oauth2": { AuthorizationCode: FakeAC } });
        try {
          mod(app);
          await drive(handlers);
        } finally {
          restore();
        }
      }));
      return { constructed, redisCalls, lines };
    }

    it("constructs no client and answers 400 before any Redis work when the secret is absent", async function () {
      const results = {};
      const { constructed, redisCalls, lines } = await mountGoogle("absent", async (handlers) => {
        const loginRes = fakeRes();
        handlers["/api/oauth/google"](fakeReq("/api/oauth/google"), loginRes);
        await loginRes.done;
        results.login = loginRes.statusCode;
        const cbRes = fakeRes();
        await handlers["/api/oauth/google/callback"](fakeReq("/api/oauth/google/callback?code=x", { code: "x" }), cbRes);
        await cbRes.done;
        results.callback = cbRes.statusCode;
      });
      expect(constructed.length).to.equal(0);
      expect(redisCalls).to.deep.equal([]);
      expect(results).to.deep.equal({ login: 400, callback: 400 });
      expect(countMatching(lines, /GOOGLE_OAUTH_SECRET not set/)).to.equal(1);
      expectNoFakeValues(lines);
    });

    it("redirects to Google with a client built from the secret file", async function () {
      let redirected;
      const { constructed, lines } = await mountGoogle({ file: FAKE.googleSecretFile }, async (handlers) => {
        const loginRes = fakeRes();
        handlers["/api/oauth/google"](fakeReq("/api/oauth/google"), loginRes);
        await loginRes.done;
        redirected = loginRes.redirected;
      });
      expect(constructed.length).to.equal(1);
      expect(constructed[0].client.secret).to.equal(FAKE.googleSecretFile);
      expect(constructed[0].client.id).to.equal(process.env.GOOGLE_OAUTH_ID);
      expect(redirected).to.match(/^https:\/\/accounts\.google\.com\//);
      expect(countMatching(lines, /GOOGLE_OAUTH_SECRET not set/)).to.equal(0);
      expectNoFakeValues(lines);
    });

    it("prefers the secret file over a different env value", async function () {
      const { constructed, lines } = await mountGoogle({ file: FAKE.googleSecretFile, env: FAKE.googleSecretEnv }, async (handlers) => {
        const loginRes = fakeRes();
        handlers["/api/oauth/google"](fakeReq("/api/oauth/google"), loginRes);
        await loginRes.done;
      });
      expect(constructed.length).to.equal(1);
      expect(constructed[0].client.secret).to.equal(FAKE.googleSecretFile);
      expectNoFakeValues(lines);
    });
  });
});
