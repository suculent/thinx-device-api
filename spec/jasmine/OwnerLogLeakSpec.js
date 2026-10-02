// Phase 26 deferred items: error paths must not write credential material,
// profile data or owner ids to the API log.
//
// Drives the real methods with a fake userlib and spied console; needs no
// helpers, no CouchDB and no Redis. Sentinels are synthetic. Failures report
// which sentinel leaked, never the captured log text.

const expect = require('chai').expect;

const Owner = require("../../lib/thinx/owner.js");
const Audit = require("../../lib/thinx/audit.js");

const HASH_SENTINEL = "hash-sentinel-0f1e2d3c";
const RESET_SENTINEL = "reset-sentinel-4b5a6978";
const EMAIL_SENTINEL = "email-sentinel@example.invalid";
const OWNER_SENTINEL = "owner-sentinel-8c9dab";

function captureConsole() {
  const lines = [];
  const record = (...args) => {
    lines.push(args.map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch (_e) { return String(a); }
    }).join(" "));
  };
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    spyOn(console, level).and.callFake(record);
  }
  return lines;
}

function leaked(lines, sentinels) {
  return sentinels.filter((s) => lines.some((l) => l.indexOf(s) !== -1));
}

function rejectingUserlib() {
  const err = new Error("conflict while editing " + OWNER_SENTINEL);
  err.statusCode = 409;
  return {
    get: async () => ({ _id: OWNER_SENTINEL }),
    atomic: async () => { throw err; }
  };
}

describe("Owner/Audit log leak guards (phase 26 deferred items)", function () {

  beforeEach(function () {
    spyOn(Audit.prototype, "log");
  });

  it("atomic() failure logs neither the new password hash, the reset key nor the owner id", async function () {
    const lines = captureConsole();
    const self = { userlib: rejectingUserlib() };
    const changes = { password: HASH_SENTINEL, reset_key: RESET_SENTINEL, activation_date: "now" };
    const result = await new Promise((resolve) => {
      Owner.prototype.atomic.call(self, OWNER_SENTINEL, changes, "password_reset", (ok, msg) => resolve({ ok, msg }));
    });
    expect(result).to.deep.equal({ ok: false, msg: "password_reset_failed" });
    expect(lines.length, "the failure must still be logged").to.be.above(0);
    expect(leaked(lines, [HASH_SENTINEL, RESET_SENTINEL, OWNER_SENTINEL])).to.deep.equal([]);
  });

  it("atomic() failure still names the action and the status code", async function () {
    const lines = captureConsole();
    const self = { userlib: rejectingUserlib() };
    await new Promise((resolve) => {
      Owner.prototype.atomic.call(self, OWNER_SENTINEL, { password: HASH_SENTINEL }, "activation", () => resolve());
    });
    expect(lines.some((l) => l.indexOf("activation") !== -1 && l.indexOf("409") !== -1)).to.equal(true);
  });

  it("apply_update() failure logs neither the updated value nor the owner id", async function () {
    const lines = captureConsole();
    const self = { userlib: rejectingUserlib() };
    const value = { first_name: "x", email: EMAIL_SENTINEL };
    const result = await new Promise((resolve) => {
      Owner.prototype.apply_update.call(self, OWNER_SENTINEL, "info", value, (ok, msg) => resolve({ ok, msg }));
    });
    expect(result).to.deep.equal({ ok: false, msg: "profile_update_failed" });
    expect(lines.length, "the failure must still be logged").to.be.above(0);
    expect(leaked(lines, [EMAIL_SENTINEL, OWNER_SENTINEL])).to.deep.equal([]);
    expect(lines.some((l) => l.indexOf("info") !== -1), "the update key is still named").to.equal(true);
  });

  it("_buildRecord() missing-message warning does not print the owner id", function () {
    const lines = captureConsole();
    const record = new Audit()._buildRecord(OWNER_SENTINEL, undefined, "warning", new Date(1700000000000));
    expect(record.owner).to.equal(OWNER_SENTINEL);
    expect(record.message).to.equal("warning");
    expect(lines.length, "the warning must still be logged").to.be.above(0);
    expect(leaked(lines, [OWNER_SENTINEL])).to.deep.equal([]);
  });

  // IN-03 (phase 26 code review): success and fallback paths.

  it("atomic() success does not print the owner id", async function () {
    const lines = captureConsole();
    const self = { userlib: { atomic: async () => ({ ok: true }) } };
    const result = await new Promise((resolve) => {
      Owner.prototype.atomic.call(self, OWNER_SENTINEL, { activation_date: "now" }, "activation", (ok, msg) => resolve({ ok, msg }));
    });
    expect(result).to.deep.equal({ ok: true, msg: "activation_successful" });
    expect(lines.some((l) => l.indexOf("activation") !== -1), "success is still logged").to.equal(true);
    expect(leaked(lines, [OWNER_SENTINEL])).to.deep.equal([]);
  });

  it("update() with an unsupported key does not print the request body", async function () {
    const lines = captureConsole();
    const self = { process_update: (_body, cb) => cb(null, null) };
    const body = { unsupported_field: EMAIL_SENTINEL, password: HASH_SENTINEL };
    const result = await new Promise((resolve) => {
      Owner.prototype.update.call(self, OWNER_SENTINEL, body, (ok, msg) => resolve({ ok, msg }));
    });
    expect(result).to.deep.equal({ ok: false, msg: "invalid_protocol_update_key_missing" });
    expect(lines.some((l) => l.indexOf("invalid_protocol_update_key_missing") !== -1), "still logged").to.equal(true);
    expect(leaked(lines, [EMAIL_SENTINEL, HASH_SENTINEL, OWNER_SENTINEL])).to.deep.equal([]);
  });

  it("password_reset_init() value fallback does not print the users-view row", async function () {
    const lines = captureConsole();
    const row = { id: OWNER_SENTINEL, key: EMAIL_SENTINEL, value: { _id: OWNER_SENTINEL, email: EMAIL_SENTINEL, password: HASH_SENTINEL } };
    let resetWith = null;
    const self = {
      userlib: { view: async () => ({ rows: [row] }) },
      resetUserWithKey: (user, _email, _client, cb) => { resetWith = user; cb(true, "reset"); }
    };
    const result = await new Promise((resolve) => {
      Owner.prototype.password_reset_init.call(self, EMAIL_SENTINEL, undefined, (ok, msg) => resolve({ ok, msg }));
    });
    expect(result).to.deep.equal({ ok: true, msg: "reset" });
    expect(resetWith).to.equal(row.value);
    expect(leaked(lines, [EMAIL_SENTINEL, HASH_SENTINEL, OWNER_SENTINEL])).to.deep.equal([]);
  });
});
