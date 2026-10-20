// Unit tests for the optional New Relic APM loader (quick 261013-kvm).
// lib/thinx/newrelic.js exports start({ env, readSecret, requireAgent, log });
// every dependency is injected here, so no spec ever reads a real secret,
// touches process.env or requires the real newrelic agent.
//
// FAKE_KEY below is a synthetic marker, not a real license key. The expected
// NEW_RELIC_* settings and the disabled line are hardcoded on purpose: this
// spec is the independent oracle for the loader, not a copy of its constants.

const expect = require('chai').expect;
const NewRelic = require("../../lib/thinx/newrelic");

const FAKE_KEY = "kvm-fake-license-key-0123456789abcdef";

const DISABLED_LINE = "ℹ️ [info] [newrelic] NEW_RELIC_LICENSE_KEY not set, New Relic disabled";

const EXPECTED_SETTINGS = {
  NEW_RELIC_LICENSE_KEY: FAKE_KEY,
  NEW_RELIC_APP_NAME: "THiNX",
  NEW_RELIC_NO_CONFIG_FILE: "true",
  NEW_RELIC_LOG: "stdout",
  NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED: "false",
  NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED: "true",
  NEW_RELIC_ATTRIBUTES_EXCLUDE: "request.headers.cookie,request.headers.authorization,request.headers.proxyAuthorization,request.headers.setCookie*,response.headers.setCookie*,request.parameters.*"
};

// Every log line from every harness, checked for the fake key in afterAll.
const allLines = [];

function newRelicKeys(obj) {
  return Object.keys(obj).filter((k) => k.startsWith("NEW_RELIC_")).sort();
}

function newRelicSubset(obj) {
  const out = {};
  for (const k of newRelicKeys(obj)) out[k] = obj[k];
  return out;
}

function harness(envInit, secretValue, agentImpl) {
  const h = {
    env: Object.assign({}, envInit),
    secretNames: [],
    agentCalls: 0,
    envAtAgent: null,
    lines: []
  };
  h.readSecret = (name) => {
    h.secretNames.push(name);
    return secretValue;
  };
  h.requireAgent = () => {
    h.agentCalls++;
    h.envAtAgent = Object.assign({}, h.env);
    if (typeof agentImpl === "function") return agentImpl();
    return {};
  };
  h.log = (...args) => {
    const line = args.join(" ");
    h.lines.push(line);
    allLines.push(line);
  };
  h.start = () => NewRelic.start({
    env: h.env,
    readSecret: h.readSecret,
    requireAgent: h.requireAgent,
    log: h.log
  });
  return h;
}

describe("New Relic loader (quick 261013-kvm)", function () {

  afterAll(function () {
    expect(allLines.length).to.be.above(0);
    for (const line of allLines) {
      expect(line).to.not.include(FAKE_KEY);
    }
  });

  describe("skip in test and CI (D-02)", function () {
    const cases = [
      { ENVIRONMENT: "test" },
      { ENVIRONMENT: "production", CI: "true" },
      { ENVIRONMENT: "production", CIRCLECI: "true" }
    ];
    cases.forEach((envInit) => {
      it("returns skipped and touches nothing for " + JSON.stringify(envInit), function () {
        const h = harness(envInit, FAKE_KEY);
        expect(h.start()).to.equal("skipped");
        expect(h.secretNames).to.deep.equal([]);
        expect(h.agentCalls).to.equal(0);
        expect(h.lines).to.deep.equal([]);
        expect(h.env).to.deep.equal(envInit);
      });
    });
  });

  describe("disabled without a key (D-03)", function () {
    [null, "", "   "].forEach((secretValue) => {
      it("returns disabled for readSecret -> " + JSON.stringify(secretValue), function () {
        const h = harness({ ENVIRONMENT: "production" }, secretValue);
        expect(h.start()).to.equal("disabled");
        expect(h.secretNames).to.deep.equal(["NEW_RELIC_LICENSE_KEY"]);
        expect(h.agentCalls).to.equal(0);
        expect(h.lines).to.deep.equal([DISABLED_LINE]);
        expect(newRelicKeys(h.env)).to.deep.equal([]);
      });
    });
  });

  describe("agent start with a key (D-04)", function () {

    it("writes the hardened NEW_RELIC_* settings before requiring the agent", function () {
      const h = harness({ ENVIRONMENT: "production" }, FAKE_KEY);
      expect(h.start()).to.equal("started");
      expect(h.agentCalls).to.equal(1);
      expect(newRelicSubset(h.envAtAgent)).to.deep.equal(EXPECTED_SETTINGS);
      expect(h.lines.length).to.equal(1);
      expect(h.lines[0]).to.include("[newrelic]");
      expect(h.lines[0]).to.include("THiNX");
    });

    it("trims the key", function () {
      const h = harness({ ENVIRONMENT: "production" }, "  " + FAKE_KEY + "  ");
      expect(h.start()).to.equal("started");
      expect(h.env.NEW_RELIC_LICENSE_KEY).to.equal(FAKE_KEY);
    });

    it("keeps an operator-set app name but overwrites the hardened settings", function () {
      const h = harness({
        ENVIRONMENT: "production",
        NEW_RELIC_APP_NAME: "THiNX-staging",
        NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED: "false",
        NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED: "true",
        NEW_RELIC_ATTRIBUTES_EXCLUDE: ""
      }, FAKE_KEY);
      expect(h.start()).to.equal("started");
      const expected = Object.assign({}, EXPECTED_SETTINGS, { NEW_RELIC_APP_NAME: "THiNX-staging" });
      expect(newRelicSubset(h.envAtAgent)).to.deep.equal(expected);
      expect(h.lines.length).to.equal(1);
      expect(h.lines[0]).to.include("THiNX-staging");
    });
  });

  describe("agent load failure (D-05)", function () {

    it("survives an Error carrying the key and logs one redacted line", function () {
      const h = harness({ ENVIRONMENT: "production" }, FAKE_KEY, () => {
        const err = new Error("bad license " + FAKE_KEY + "\nsecond line");
        err.code = "E_FAKE";
        throw err;
      });
      let status;
      expect(() => { status = h.start(); }).to.not.throw();
      expect(status).to.equal("failed");
      expect(h.lines.length).to.equal(1);
      expect(h.lines[0]).to.include("[newrelic]");
      expect(h.lines[0]).to.include("E_FAKE");
      expect(h.lines[0]).to.not.include("\n");
      expect(h.lines[0]).to.not.include(FAKE_KEY);
    });

    it("survives a thrown string carrying the key", function () {
      const h = harness({ ENVIRONMENT: "production" }, FAKE_KEY, () => {
        throw "boom " + FAKE_KEY;
      });
      let status;
      expect(() => { status = h.start(); }).to.not.throw();
      expect(status).to.equal("failed");
      expect(h.lines.length).to.equal(1);
      expect(h.lines[0]).to.not.include(FAKE_KEY);
    });

    it("survives a thrown undefined", function () {
      const h = harness({ ENVIRONMENT: "production" }, FAKE_KEY, () => {
        throw undefined;
      });
      let status;
      expect(() => { status = h.start(); }).to.not.throw();
      expect(status).to.equal("failed");
      expect(h.lines.length).to.equal(1);
    });
  });

  describe("module load (D-06)", function () {
    it("exports start and changes no NEW_RELIC_* env on a fresh require", function () {
      const before = newRelicKeys(process.env);
      const resolved = require.resolve("../../lib/thinx/newrelic");
      delete require.cache[resolved];
      const fresh = require("../../lib/thinx/newrelic");
      expect(typeof fresh.start).to.equal("function");
      expect(newRelicKeys(process.env)).to.deep.equal(before);
    });
  });
});
