// CR-01 regression matrix (27-REVIEW): API-key authentication must match the
// whole stored key or hash, in constant time. Substrings, slices, superstrings,
// empty and non-string inputs must never authenticate, on any caller path.
//
// Stub redis only: no redis.createClient, no CouchDB. Rejected-key paths still
// try to write the audit log, so ECONNREFUSED noise on :5984 is expected locally.

const APIKey = require("../../lib/thinx/apikey");
const Util = require("../../lib/thinx/util");
const Device = require("../../lib/thinx/device");
const expect = require('chai').expect;
const sha256 = require("sha256");
const envi = require("../_envi.json");

const KEY = sha256("cr01-fixture-key");
const HASH = sha256(KEY);
const FIXTURE = JSON.stringify([{ key: KEY, hash: HASH, alias: "cr01" }]);
const OWNER = "b".repeat(64);

// Synchronous stub redis that serves `stored` for every get and counts the calls.
function makeStub(stored) {
  const stub = {
    getCalls: 0,
    get: (_key, cb) => { stub.getCalls++; cb(null, stored); },
    set: (_key, _val, cb) => { if (typeof cb === "function") cb(null, "OK"); },
    del: (_key, cb) => { if (typeof cb === "function") cb(null, 1); },
    on: () => { /* no-op */ },
    expire: () => { /* no-op */ }
  };
  return stub;
}

// Calls verify and resolves with what its callback reported.
function verifyWith(stub, apikey, is_http) {
  const ak = new APIKey(stub);
  return new Promise((resolve) => {
    ak.verify(OWNER, apikey, is_http, (success, message) => resolve({ success, message }));
  });
}

function saveEnv() {
  return process.env.ENVIRONMENT;
}

function restoreEnv(saved) {
  if (typeof saved === "undefined") {
    delete process.env.ENVIRONMENT;
  } else {
    process.env.ENVIRONMENT = saved;
  }
}

describe("CR-01 core: Util.safeEqual", function () {

  it("accepts equal non-empty strings", function () {
    expect(Util.safeEqual(KEY, KEY)).to.equal(true);
    expect(Util.safeEqual("abc", "abc")).to.equal(true);
  });

  it("rejects same-length different strings", function () {
    expect(Util.safeEqual("abc", "abd")).to.equal(false);
    expect(Util.safeEqual(KEY, HASH)).to.equal(false);
  });

  it("rejects different lengths without throwing", function () {
    expect(Util.safeEqual("abc", "abcd")).to.equal(false);
    expect(Util.safeEqual("abcd", "abc")).to.equal(false);
  });

  it("rejects empty strings", function () {
    expect(Util.safeEqual("", "")).to.equal(false);
    expect(Util.safeEqual("", "a")).to.equal(false);
    expect(Util.safeEqual("a", "")).to.equal(false);
  });

  it("rejects same string length with different byte length, without throwing", function () {
    expect(Util.safeEqual("é", "e")).to.equal(false);
    expect(Util.safeEqual("e", "é")).to.equal(false);
  });

  it("rejects non-string inputs", function () {
    expect(Util.safeEqual(undefined, undefined)).to.equal(false);
    expect(Util.safeEqual(null, null)).to.equal(false);
    expect(Util.safeEqual(1, 1)).to.equal(false);
    expect(Util.safeEqual(["a"], ["a"])).to.equal(false);
    expect(Util.safeEqual({}, {})).to.equal(false);
  });
});

describe("CR-01 core: key_in_keys", function () {

  function kik(apikey, stored) {
    const ak = new APIKey(makeStub(null));
    return ak.key_in_keys(apikey, (typeof stored === "undefined") ? FIXTURE : stored);
  }

  it("accepts the exact key", function () {
    expect(kik(KEY)).to.equal(true);
  });

  it("accepts the exact hash", function () {
    expect(kik(HASH)).to.equal(true);
  });

  it("rejects the empty string", function () {
    expect(kik("")).to.equal(false);
  });

  it("rejects a single character of the key", function () {
    expect(kik(KEY[0])).to.equal(false);
  });

  it("rejects a 63-char prefix", function () {
    expect(kik(KEY.slice(0, 63))).to.equal(false);
  });

  it("rejects a 63-char suffix", function () {
    expect(kik(KEY.slice(1))).to.equal(false);
  });

  it("rejects a 36-char slice (the old router.js UUID-sanitized shape)", function () {
    expect(KEY.slice(10, 46).length).to.equal(36);
    expect(kik(KEY.slice(10, 46))).to.equal(false);
  });

  it("rejects a substring of the hash", function () {
    expect(kik(HASH.slice(5, 20))).to.equal(false);
  });

  it("rejects a superstring of the key", function () {
    expect(kik(KEY + "0")).to.equal(false);
  });

  it("rejects a 'Bearer '-prefixed key", function () {
    expect(kik("Bearer " + KEY)).to.equal(false);
  });

  it("rejects non-string keys", function () {
    expect(kik(undefined)).to.equal(false);
    expect(kik(null)).to.equal(false);
    expect(kik(1)).to.equal(false);
    expect(kik([KEY])).to.equal(false);
    expect(kik({})).to.equal(false);
  });

  it("returns false for malformed stored JSON without throwing", function () {
    let result;
    expect(() => { result = kik(KEY, "not-json"); }).to.not.throw();
    expect(result).to.equal(false);
  });

  it("returns false for stored entries without key or hash", function () {
    let result;
    expect(() => { result = kik(KEY, JSON.stringify([{ alias: "x" }])); }).to.not.throw();
    expect(result).to.equal(false);
  });
});

describe("CR-01 core: verify", function () {

  let savedEnv;

  beforeAll(() => {
    savedEnv = saveEnv();
    process.env.ENVIRONMENT = "development";
  });

  afterAll(() => {
    restoreEnv(savedEnv);
  });

  it("rejects the empty key before reading Redis", async function () {
    const stub = makeStub(FIXTURE);
    const r = await verifyWith(stub, "", true);
    expect(r.success).to.equal(false);
    expect(stub.getCalls).to.equal(0);
  });

  it("rejects non-string keys before reading Redis", async function () {
    for (const bad of [1, [KEY], {}]) {
      const stub = makeStub(FIXTURE);
      const r = await verifyWith(stub, bad, false);
      expect(r.success, JSON.stringify(bad)).to.equal(false);
      expect(stub.getCalls, JSON.stringify(bad)).to.equal(0);
    }
  });

  it("rejects a 1-char key on the HTTP path", async function () {
    const r = await verifyWith(makeStub(FIXTURE), "a", true);
    expect(r.success).to.equal(false);
  });

  it("rejects a 1-char key on the device path (is_http=false)", async function () {
    const r = await verifyWith(makeStub(FIXTURE), "a", false);
    expect(r.success).to.equal(false);
  });

  it("rejects an unknown full-length key on the device path (is_http=false)", async function () {
    const r = await verifyWith(makeStub(FIXTURE), sha256("other"), false);
    expect(r.success).to.equal(false);
    expect(r.message).to.equal("owner_found_but_no_key");
  });

  it("rejects a 36-char slice on the HTTP path", async function () {
    const r = await verifyWith(makeStub(FIXTURE), KEY.slice(10, 46), true);
    expect(r.success).to.equal(false);
  });

  it("accepts the exact key on the device path", async function () {
    const r = await verifyWith(makeStub(FIXTURE), KEY, false);
    expect(r.success).to.equal(true);
  });

  it("accepts the exact hash on the HTTP path", async function () {
    const r = await verifyWith(makeStub(FIXTURE), HASH, true);
    expect(r.success).to.equal(true);
  });

  it("answers apikey_not_found for an owner without keys", async function () {
    const r = await verifyWith(makeStub(null), KEY, true);
    expect(r.success).to.equal(false);
    expect(r.message).to.equal("apikey_not_found");
  });
});

describe("CR-01 core: test-env bypass", function () {

  const TEST = envi.ak;
  let savedEnv;

  beforeAll(() => {
    savedEnv = saveEnv();
    process.env.ENVIRONMENT = "test";
  });

  afterAll(() => {
    restoreEnv(savedEnv);
  });

  it("fixture keys do not include the CI key", function () {
    expect(FIXTURE.indexOf(TEST)).to.equal(-1);
  });

  it("short-circuits the exact CI key without reading Redis", async function () {
    const stub = makeStub(FIXTURE);
    const r = await verifyWith(stub, TEST, true);
    expect(r.success).to.equal(true);
    expect(stub.getCalls).to.equal(0);
  });

  it("does not short-circuit string variants of the CI key", async function () {
    for (const variant of ["Bearer " + TEST, TEST + "x", TEST.slice(0, 40)]) {
      const stub = makeStub(FIXTURE);
      const r = await verifyWith(stub, variant, true);
      expect(r.success, "variant of length " + variant.length).to.equal(false);
      expect(stub.getCalls, "variant of length " + variant.length).to.equal(1);
    }
  });

  it("does not short-circuit a non-string wrapping the CI key", async function () {
    const stub = makeStub(FIXTURE);
    const r = await verifyWith(stub, [TEST], true);
    expect(r.success).to.equal(false);
    expect(stub.getCalls).to.equal(0);
  });

  it("gives the CI key no bypass outside ENVIRONMENT=test", async function () {
    process.env.ENVIRONMENT = "development";
    try {
      const stub = makeStub(FIXTURE);
      const r = await verifyWith(stub, TEST, true);
      expect(r.success).to.equal(false);
    } finally {
      process.env.ENVIRONMENT = "test";
    }
  });
});

describe("CR-01 caller: firmware guard", function () {

  const OWNER_A = "a".repeat(64);

  function makeDevice() {
    const device = new Device(makeStub(null));
    const calls = [];
    device.apikey = {
      calls: calls,
      verify: (owner, key, is_http, cb) => {
        calls.push({ owner, key, is_http });
        cb(false, "owner_found_but_no_key");
      }
    };
    return device;
  }

  function firmwareReq(extra) {
    return {
      headers: { authentication: "a" },
      body: {
        registration: Object.assign({
          mac: "11:11:11:11:11:11",
          udid: "00000000-0000-1000-8000-0000000c0e01",
          owner: OWNER_A
        }, extra || {})
      }
    };
  }

  function expectRejected(device, req, done) {
    let finished = false;
    device.firmware(req, (success, response) => {
      if (finished) return;
      finished = true;
      try {
        expect(success).to.equal(false);
        expect(response).to.deep.equal({ success: false, response: "owner_found_but_no_key" });
        expect(device.apikey.calls.length).to.equal(1);
        expect(device.apikey.calls[0].is_http).to.equal(false);
        done();
      } catch (e) {
        done.fail(e);
      }
    });
  }

  it("rejects a failed verify even when the body carries ott and forced", function (done) {
    const device = makeDevice();
    expectRejected(device, firmwareReq({ ott: "cr01-ott", forced: true }), done);
  }, 15000);

  it("rejects a failed verify without ott or forced", function (done) {
    const device = makeDevice();
    expectRejected(device, firmwareReq(), done);
  }, 15000);
});
