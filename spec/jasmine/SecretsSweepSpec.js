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
  mailgunEnv: "spec-fake-mailgun-env-2b9d"
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
