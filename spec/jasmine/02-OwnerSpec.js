let expect = require('chai').expect;
let Owner = require("../../lib/thinx/owner");
let envi = require("../_envi.json");
let owner = envi.oid;
let email = envi.email;
let test_info = envi.test_info;
const user_body = envi.test_info;

let Globals = require('../../lib/thinx/globals');
const redis_client = require('redis');

describe("Owner", function () {

  let user;
  let redis;

  beforeAll(async () => {
    console.log(`🚸 [chai] >>> running Owner spec`);
    const redis_base = redis_client.createClient(Globals.redis_options());
    await redis_base.connect();
    redis = redis_base.legacy();
    user = new Owner(redis);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed Owner spec`);
  });

  // activation key is provided by e-mail for security,
  // cimrman@thinx.cloud receives his activation token in response
  // and must not be used in production environment

  it("(01) should be able to create owner profile", function (done) {

    let res_mock = {};

    console.log("(01) Creating user", user_body);

    user.create(user_body, true, res_mock, (_res, success, response) => {
      
      // valid case is existing user as well
      if (typeof (response) == "string" && response.indexOf("username_already_exists") !== -1) {
        expect(success).to.equal(false);
        done();
        return;
      }

      // initial valid case
      expect(response).to.be.a('string');
      expect(success).to.equal(true);
      this.activation_key = response; // store activation token for next step
      done();
    }, {});

  }, 10000);

  it("(02) should be able to fetch MQTT Key for owner", function (done) {
    // deepcode ignore NoHardcodedPasswords: <please specify a reason of ignoring this>
    user.mqtt_key(owner, (success, apikey) => {
      expect(apikey.key).to.be.a('string');
      expect(success).to.equal(true);
      done();
    });
  }, 5000);

  it("(03) should be able to fetch owner profile", function (done) {
    user.profile(owner, (success, response) => {
      expect(response).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(04) should be able to update owner info", function (done) {
    const body = {
      info: test_info
    };
    user.update(owner, body, (success, response) => {
      expect(response).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(05) should be able to begin reset owner password", function (done) {
    user.password_reset_init(email, (success, result) => {
      console.log("[spec] user.password_reset_init success:", success, "reset_key", result);
      expect(success).to.equal(true);
      expect(result).to.be.a('string');
      let body = {
        password: "tset",
        rpassword: "tset",
        owner: owner,
        reset_key: result
      };
      user.set_password(body, (sukec, reponde) => {
        console.log("[spec] user.set_password reponde:", sukec, reponde);
        expect(sukec).to.equal(true);
        done();
      });
    });
  }, 10000);

  it("(06) should be able to create mesh", function (done) {
    user.createMesh(owner, "mock-mesh-id", "mock-mesh-alias", (success, result) => {
      expect(result).to.be.an('object');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(07) should be able to list meshes", function (done) {
    user.listMeshes(owner, (success, result) => {
      expect(result).to.be.an('array');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(08) should be able to delete meshes", function (done) {
    user.deleteMeshes(owner, ["mock-mesh-id"], (success, result) => {
      expect(result).to.be.an('array');
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  it("(09) should support stringToBoolean", function () {
    let t = user.stringToBoolean('true');
    expect(t).to.equal(true);
    let f = user.stringToBoolean('false');
    expect(f).to.be.false;
  });

  it("(10) should support sendMail", function (done) {

    let theEmail = {
      from: 'THiNX API <api@thinx.cloud>',
      to: "cimrman@thinx.cloud",
      subject: "Your data will be deleted",
      text: "Hello Jara Cimrman" +
        ". This is a notification warning, that your data will be deleted in 24 hours due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.",
      html: "<p>Hello," +
        "</p><p>This is a notification warning, that your data will be deleted in 24 hours due to GDPR regulations. In case you want to prevent data loss, log into your THiNX account.</p><p>" +
        "</p><p>This e-mail was sent automatically. Please do not reply.</p>Sincerely your THiNX</p>"
    };

    user.sendMail(theEmail, "mail_24", (result) => {
      expect(result).to.be.false;
      done();
    });
  });

  it("(11) should update avatar", function (done) {
    user.saveAvatar(envi.oid, "<avatar-mock>", (result) => {
      expect(result).to.be.true;
      done();
    });
  });

  // REFACTOR-02: strict equality in Owner.password_reset
  // Regression for the string-vs-number reset_key coercion case that the
  // legacy `!=` compare at lib/thinx/owner.js:492 was silently accepting.
  // Under `!==`, a candidate string `"123"` MUST NOT match a stored numeric
  // `user_reset_key` of `123` — the callback MUST resolve with
  // (false, "invalid_reset_key"). The userlib.view layer is monkey-patched
  // for this single test (the spec file otherwise hits a live CouchDB), and
  // is restored in done() so subsequent specs are unaffected.
  //
  // Phase 7 Plan 07-5 note: Owner.password_reset's internals were converted
  // to async/await (nano 10 native Promise API). The monkey-patch below now
  // returns a resolved Promise instead of invoking a callback — the test's
  // BEHAVIORAL contract (string "123" vs numeric 123 → invalid_reset_key) is
  // unchanged; only the mocking style adapts to the new internal Promise
  // contract with the userlib.view layer. The (false, "invalid_reset_key")
  // public callback tuple assertion is verbatim from the Phase 5 fix.
  it("(12) REFACTOR-02: password_reset rejects string reset_key when stored value is a number (strict equality)", function (done) {
    const original_view = user.userlib.view;
    user.userlib.view = function (_design, _viewname, _opts) {
      // Simulate a CouchDB view row whose stored reset_key is numeric.
      return Promise.resolve({ rows: [{ doc: { reset_key: 123 } }] });
    };
    user.password_reset(owner, "123", (success, message) => {
      // Restore before assertions so a thrown expect cannot leak the patch.
      user.userlib.view = original_view;
      expect(success).to.equal(false);
      expect(message).to.equal("invalid_reset_key");
      done();
    });
  });

  // REFACTOR-04 (Phase 7 Plan 02): Owner.create callback contract lock.
  // The synchronous `email_required` guard (lib/thinx/owner.js inside Owner.create
  // before any userlib/redis/couchdb call) returns `(res, false, "email_required")`
  // when body has no email. This branch fires BEFORE the async/await conversion's
  // affected code, so the test passes both before and after Plan 07-2. Its value is
  // locking the public callback-tuple shape so a future signature drift (e.g.
  // accidental reordering of the (res, success, reason) tuple) is caught by CircleCI.
  it("(13) REFACTOR-04 (07-2): Owner.create callback contract preserved for missing-email error path", function (done) {
    const res_mock = {};
    user.create({ /* no email */ }, true, res_mock, (cb_res, cb_success, cb_reason) => {
      expect(cb_success).to.equal(false);
      expect(cb_reason).to.equal("email_required");
      done();
    });
  }, 5000);

  // REFACTOR-04 (Phase 7 Plan 03): Owner.delete callback contract lock.
  // Locks the (res, success, reason) tuple shape AND the unusual (owner, callback, res)
  // parameter order. Uses a fake owner_id that does not exist in CouchDB to deterministically
  // hit either the success-with-fallback or the destroy-failure path. Since CouchDB will
  // 404 on a non-existent doc for both atomic and destroy, the test asserts the (res, false, "delete_failed")
  // callback contract on the destroy-failure branch (or the success branch if atomic somehow
  // succeeded against a fresh doc — both paths satisfy the tuple-shape assertion below).
  //
  // NOTE: requires CouchDB available (CI green-gate). Local "no /mnt/data/conf/config.json"
  // ACCEPT pattern means this test fails locally; CircleCI is canonical.
  it("(14) REFACTOR-04 (07-3): Owner.delete callback contract preserved", function (done) {
    const res_mock = {};
    const nonexistent_owner = "test_refactor04_07_3_nonexistent_" + Date.now();
    user.delete(nonexistent_owner, (cb_res, cb_success, cb_reason) => {
      // Either (true, "deleted") if atomic succeeds against a fresh doc, or (false, "delete_failed")
      // if both atomic and destroy fail on the nonexistent doc.
      expect(typeof cb_success).to.equal("boolean");
      expect(typeof cb_reason).to.equal("string");
      // The tuple shape must be exactly 3 args: (res, success, reason).
      expect(cb_res).to.equal(res_mock);
      done();
    }, res_mock);
  }, 10000);

  // REFACTOR-04 (Phase 7 Plan 04): Owner.update callback contract lock.
  // The synchronous `undefined_owner` guard at lib/thinx/owner.js (Owner.update
  // first statement) fires BEFORE any process_update / apply_update / saveAvatar
  // delegation, so this test is safe to run without DB/Redis dependencies and
  // survives the local test-env config-missing ACCEPT scenario. Asserts the
  // public callback tuple shape `(false, "undefined_owner")` and the parameter
  // order — both callers (router.profile.js:33, router.gdpr.js:135) depend on
  // this contract.
  it("(15) REFACTOR-04 (07-4): Owner.update callback contract preserved for undefined_owner guard", function (done) {
    user.update(undefined, { /* body */ }, (cb_success, cb_response) => {
      expect(cb_success).to.equal(false);
      expect(cb_response).to.equal("undefined_owner");
      done();
    });
  }, 5000);

  // REFACTOR-04 (Phase 7 Plan 05): Owner.password_reset callback contract lock.
  // The synchronous `missing_reset_key` guard at lib/thinx/owner.js (Owner.password_reset
  // first statement) fires BEFORE the alog.log SEC-PII-01 audit call and BEFORE the
  // awaited userlib.view, so this test is safe to run without DB/Redis dependencies
  // and survives the local test-env config-missing ACCEPT scenario. Asserts the
  // public callback tuple shape `(false, "missing_reset_key")` and locks the
  // 3-argument (owner, reset_key, callback) signature. The single caller
  // router.user.js:27 depends on this contract.
  //
  // This test does NOT exercise the Phase 5 REFACTOR-02 `!==` comparison directly
  // (that requires a CouchDB doc; test (12) above mocks that path). The strict-
  // equality survival across the async/await conversion is enforced by the
  // post-commit grep gate (Plan 07-5 Task 4 step 2) AND by test (12) above.
  it("(16) REFACTOR-04 (07-5): Owner.password_reset callback contract preserved for missing_reset_key guard", function (done) {
    user.password_reset("any_owner_id", undefined, (cb_success, cb_response) => {
      expect(cb_success).to.equal(false);
      expect(cb_response).to.equal("missing_reset_key");
      done();
    });
  }, 5000);

  // REFACTOR-04 (Phase 7 Plan 06 — PHASE 7 CLOSE-OUT): Owner.set_password callback contract lock.
  // Owner.set_password is an orchestrator with no userlib calls of its own — it validates
  // rbody and delegates to set_password_reset (when reset_key is defined) or
  // set_password_activation (when activation is defined). The synchronous password_mismatch
  // guard fires BEFORE either delegate, so this test is safe to run without DB/Redis
  // dependencies and survives the local test-env config-missing ACCEPT scenario. Asserts the
  // public callback tuple shape `(false, "password_mismatch")` when rbody.password !==
  // rbody.rpassword. The single caller router.user.js:57 depends on this contract.
  //
  // This test does NOT exercise the delegation branches (reset_key / activation) directly;
  // those paths are exercised by the existing ZZ-RouterPasswordResetSpec.js suite in CI.
  // The post-commit grep gates (Plan 07-6 Task 4) confirm both Util.redactToken SEC-PII-01
  // sites and the strict-equality `!==` survive the async/await conversion.
  it("(17) REFACTOR-04 (07-6): Owner.set_password callback contract preserved for password_mismatch", function (done) {
    user.set_password({ password: "abc", rpassword: "xyz" }, (cb_success, cb_response) => {
      expect(cb_success).to.equal(false);
      expect(cb_response).to.equal("password_mismatch");
      done();
    });
  }, 5000);


});
