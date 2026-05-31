var APIKey = require("../../lib/thinx/apikey");
var expect = require('chai').expect;
var sha256 = require("sha256");
var envi = require("../_envi.json");
var owner = envi.oid;

let Globals = require('../../lib/thinx/globals');
const redis_client = require('redis');

describe("API Key", function () {

  let apikey;

  // Build a stub redis client that simulates a closed/disconnected connection.
  // get(): always returns a ClientClosedError-like error.
  // set(): records calls so tests can assert it is NEVER invoked when the
  //        connection is reported as closed.
  // del(): no-op.
  function makeClosedStub() {
    const setCalls = [];
    return {
      get: (_key, cb) => cb(Object.assign(new Error('The client is closed'), { name: 'ClientClosedError' })),
      set: (_key, _val, cb) => { setCalls.push({ key: _key, val: _val }); if (typeof cb === 'function') cb(null, "OK"); },
      del: () => { /* no-op */ },
      _setCalls: setCalls
    };
  }

  beforeAll(async () => {
    console.log(`🚸 [chai] >>> running API Key spec`);
    // Initialize Redis
    const redis_base = redis_client.createClient(Globals.redis_options());
    await redis_base.connect();
    redis = redis_base.legacy();
    apikey = new APIKey(redis);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed API Key spec`);
  });

  //list: function(invalid-owner, callback)
  it("(00) should be able to list empty API Keys", function (done) {
    apikey.list(
      "dummy",
      (object) => {
        expect(object).to.be.a('array');
        if (done) done();
      });
  });

  //create: function(owner, apikey_alias, callback)
  it("(01) should be able to generate new API Key", function (done) {
    apikey.create(
      owner,
      "sample-key",
      (success, array_or_error) => {
        if (success) {
          generated_key_hash = sha256(array_or_error[0].key);
        } else {
          console.log("[spec] APIKey failed: ", { array_or_error });
        }
        expect(success).to.equal(true);
        expect(array_or_error[0].key).to.be.a('string');
        done();
      }
    );
  });

  it("(01b) should be able to generate another API Key", function (done) {
    apikey.create(
      owner,
      "sample-key-2",
      (success, array_or_error) => {
        expect(success).to.equal(true);
        expect(array_or_error[0].key).to.be.a('string');
        done();
      }
    );
  });

  it("(01b) should be able to generate Default MQTT API Key", function (done) {
    apikey.create(
      owner,
      "Default MQTT API Key",
      (success, array_or_error) => {
        if (success) {
          generated_key_hash = sha256(array_or_error[0].key);
        } else {
          console.log("[spec] APIKey failed: ", { array_or_error });
        }
        expect(success).to.equal(true);
        expect(array_or_error[0].key).to.be.a('string');
        done();
      }
    );
  });

  it("(02) should be able to list API Keys", function (done) {
    apikey.list(
      owner,
      (object) => {
        expect(object).to.be.a('array');
        done();
      });
  });

  //verify: function(owner, apikey, callback)
  it("(03) should be able to verify invalid API Keys", function (done) {
    apikey.verify(
      owner,
      "invalid-api-key",
      true,
      (success /*, result */) => { // fixed (callback is not a function!)
        expect(success).to.equal(false);
        done();
      });
  });

  //revoke: function(owner, apikey_hash, callback)
  it("04 - should be able to revoke API Keys", function (done) {
    apikey.create(
      owner,
      "sample-key-for-revocation",
      (success, array_or_error) => {
        expect(success).to.equal(true);
        console.log("[spec] APIKey revoking: sample-key-for-revocation from", { array_or_error });
        for (let index in array_or_error) {
          let item = array_or_error[index];
          if (item.alias.indexOf("sample-key-for-revocation") !== -1) {
            apikey.revoke(
              owner,
              [item.hash],
              (_success, /* result */) => {
                expect(_success).to.equal(true);
                done();
              });
          }
        }
      }
    );
  });

  it("(05) should return empty array  on invalid API Key revocation", function (done) {
    apikey.revoke(
      owner,
      ["sample-key-hax"], // intentionaly invalid
      (success) => {
        expect(success).to.equal(true);
        done();
      }
    );
  });

  //list: function(owner, callback)
  it("(06) should be able to list API Keys (2)", function (done) {
    apikey.list(
      owner,
      (object) => {
        expect(object).to.be.a('array');
        done();
      });
  });

  // currently fails, no key is being fetched
  it("(07) should be able to get first API Key (if exists)", function (done) {
    apikey.get_first_apikey(
      owner,
      (success, object) => {
        expect(success).to.equal(true);
        expect(object).to.be.a('string');
        done();
      });
  });

  // --- Redis-closed / circuit-breaker hardening (Quick task 260531-n72) -----

  it("(R1) treats ClientClosedError on get as redis_unavailable", function (done) {
    const stub = makeClosedStub();
    const ak = new APIKey(stub);
    // Reset the per-owner backoff map so the breaker does not kick in for this
    // isolated test (uses a unique owner key as well).
    if (APIKey._lastDefaultKeyAttempt && typeof APIKey._lastDefaultKeyAttempt.delete === 'function') {
      APIKey._lastDefaultKeyAttempt.delete('owner-R1');
    }
    ak.create('owner-R1', 'some-non-default-alias', (success, reason) => {
      expect(success).to.equal(false);
      expect(reason).to.equal('redis_unavailable');
      // Critical: set() must NOT have been invoked — the bug was that the
      // get-error branch fell through to save_apikeys.
      expect(stub._setCalls.length).to.equal(0);
      done();
    });
  });

  it("(R2) circuit-breaker suppresses repeat default-key attempts within 60s", function (done) {
    const stub = makeClosedStub();
    const ak = new APIKey(stub);
    if (APIKey._lastDefaultKeyAttempt && typeof APIKey._lastDefaultKeyAttempt.delete === 'function') {
      APIKey._lastDefaultKeyAttempt.delete('owner-R2');
    }
    // Wrap stub.get to count invocations.
    let getCalls = 0;
    const origGet = stub.get;
    stub.get = function (k, cb) { getCalls += 1; return origGet(k, cb); };

    ak.create('owner-R2', 'Default MQTT API Key', (success1, reason1) => {
      expect(success1).to.equal(false);
      expect(reason1).to.equal('redis_unavailable');
      expect(getCalls).to.equal(1);

      ak.create('owner-R2', 'Default MQTT API Key', (success2, reason2) => {
        expect(success2).to.equal(false);
        expect(reason2).to.equal('redis_unavailable_backoff');
        // Breaker open — get() must NOT have been touched a second time.
        expect(getCalls).to.equal(1);
        done();
      });
    });
  });

  it("(R3) save_apikeys does not double-call callback on set error", function (done) {
    const stub = {
      get: () => { throw new Error('not used in this test'); },
      set: (_k, _v, cb) => cb(new Error('boom')),
      del: () => {}
    };
    const ak = new APIKey(stub);
    let cbCount = 0;
    ak.save_apikeys('owner-R3', [{ key: 'k', hash: 'h', alias: 'a' }], (_ok, _payload) => {
      cbCount += 1;
    });
    // Give the synchronous stub.set callback a tick to settle.
    setImmediate(() => {
      expect(cbCount).to.equal(1);
      done();
    });
  });

});
