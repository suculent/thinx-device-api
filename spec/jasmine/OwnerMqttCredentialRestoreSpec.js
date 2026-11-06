/*
 * OwnerMqttCredentialRestoreSpec — Owner#ensure_mqtt_credential restores an owner's broker
 * credential (Redis entry named by the owner id) when it is missing, so a console login
 * repairs an owner whose Default MQTT API Key survived but whose Mosquitto entry did not.
 *
 * Needs no Redis, CouchDB or broker: the store and auth are fakes. Nothing prints a key.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const sha256 = require("sha256");

const Owner = require("../../lib/thinx/owner.js");

const OWNER = sha256("ocr-owner");
const KEY = sha256("ocr-default-mqtt-key");
const ENTRY = { key: KEY, hash: sha256(KEY), alias: "Default MQTT API Key" };

function makeOwner({ present = false, error = null } = {}) {
  const rec = { exists: [], added: [] };
  const store = {
    exists(k, cb) { rec.exists.push(k); cb(error, present ? 1 : 0); },
    get(_k, cb) { cb(null, null); },
    set(_k, _v, cb) { if (typeof (cb) === "function") cb(null, "OK"); }
  };
  const owner = new Owner(store);
  owner.auth = {
    add_mqtt_credentials(user, password, cb) {
      rec.added.push({ user, isKey: password === KEY });
      if (typeof (cb) === "function") cb();
    },
    revoke_mqtt_credentials() { throw new Error("not expected"); }
  };
  return { owner, rec };
}

const ensure = (owner, owner_id, entry) => new Promise((resolve) => {
  owner.ensure_mqtt_credential(owner_id, entry, (ok, state) => resolve({ ok, state }));
});

describe("Owner#ensure_mqtt_credential", function () {

  it("restores a missing broker credential with the key, not the hash", async function () {
    const { owner, rec } = makeOwner({ present: false });
    expect(await ensure(owner, OWNER, ENTRY)).to.deep.equal({ ok: true, state: "restored" });
    expect(rec.exists).to.deep.equal([OWNER]);
    expect(rec.added).to.deep.equal([{ user: OWNER, isKey: true }]);
  });

  it("leaves an existing credential alone", async function () {
    const { owner, rec } = makeOwner({ present: true });
    expect(await ensure(owner, OWNER, ENTRY)).to.deep.equal({ ok: true, state: "present" });
    expect(rec.added).to.deep.equal([]);
  });

  it("does not write when Redis errors", async function () {
    const { owner, rec } = makeOwner({ error: new Error("down") });
    expect(await ensure(owner, OWNER, ENTRY)).to.deep.equal({ ok: false, state: "redis_unavailable" });
    expect(rec.added).to.deep.equal([]);
  });

  it("refuses a missing or empty key", async function () {
    for (const entry of [null, undefined, {}, { key: "" }, { key: 42 }]) {
      const { owner, rec } = makeOwner();
      expect(await ensure(owner, OWNER, entry)).to.deep.equal({ ok: false, state: "owner_mqtt_key_missing" });
      expect(rec.exists).to.deep.equal([]);
    }
  });

  it("refuses an invalid owner id without touching Redis", async function () {
    for (const id of ["", null, undefined, 42, "a\"b", "x{y}"]) {
      const { owner, rec } = makeOwner();
      expect(await ensure(owner, id, ENTRY)).to.deep.equal({ ok: false, state: "invalid_owner" });
      expect(rec.exists).to.deep.equal([]);
    }
  });
});
