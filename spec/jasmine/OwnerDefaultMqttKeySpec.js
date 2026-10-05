/*
 * OwnerDefaultMqttKeySpec — Owner#create_default_mqtt_apikey must find an owner's existing
 * "Default MQTT API Key" and reuse it (quick 261003-w13, additional item).
 *
 * APIKey#list calls back ONE argument (the key array). create_default_mqtt_apikey read it as
 * (err, body), so `body` was always undefined, the existing Default key was never found and a
 * second one was always attempted. Since quick 261003-vep, create() refuses a duplicate alias,
 * so Owner#create failed with creating_mqtt_api_key_failed for an owner whose ak: store
 * survived without a user document.
 *
 * Local run (needs no Redis, CouchDB or broker; the store, userlib and auth are fakes):
 *
 *   ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');
 *     const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/OwnerDefaultMqttKeySpec.js'],
 *     helpers:[],random:false});j.execute()"
 *
 * Nothing here prints a key or a hash: assertions compare with booleans.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const sha256 = require("sha256");

const Globals = require("../../lib/thinx/globals.js");
const APIKey = require("../../lib/thinx/apikey");
const Owner = require("../../lib/thinx/owner.js");

const DEFAULT_ALIAS = "Default MQTT API Key";

const KEY_M = sha256("odk-key-default-mqtt");
const KEY_O = sha256("odk-key-other");
const KEY_D = sha256("odk-key-device");

const entryM = () => ({ key: KEY_M, hash: sha256(KEY_M), alias: DEFAULT_ALIAS });
const entryO = () => ({ key: KEY_O, hash: sha256(KEY_O), alias: "odk-other" });
const entryD = () => ({ key: KEY_D, hash: sha256(KEY_D), alias: "odk-device" });

let ownerCounter = 0;
function freshOwner() {
  ownerCounter++;
  const owner = sha256("odk-owner-" + ownerCounter + "-" + Date.now());
  APIKey._lastDefaultKeyAttempt.delete(owner);
  return owner;
}

// A fake legacy redis client; both calls answer synchronously.
function makeStore(map) {
  const data = new Map(Object.entries(map || {}));
  const rec = { gets: [], sets: [] };
  return {
    rec,
    data,
    get(k, cb) {
      rec.gets.push(k);
      cb(null, data.has(k) ? data.get(k) : null);
    },
    set(k, v, cb) {
      rec.sets.push(k);
      data.set(k, v);
      if (typeof (cb) === "function") cb(null, "OK");
    }
  };
}

function makeOwner(store) {
  const owner = new Owner(store);
  const rec = { added: [] };
  owner.auth = {
    add_mqtt_credentials(user, password, cb) {
      rec.added.push({ user, isKeyM: password === KEY_M });
      if (typeof (cb) === "function") cb();
    },
    revoke_mqtt_credentials() { /* not expected */ }
  };
  owner.create_default_acl = (_o, cb) => { if (typeof (cb) === "function") cb(true); };
  return { owner, rec };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Calls fn(cb) and collects every callback over a settle window.
async function collect(fn, settleMs) {
  const calls = [];
  fn((...args) => calls.push(args));
  await sleep(settleMs || 150);
  return calls;
}

function storedEntries(store, owner) {
  const raw = store.data.get("ak:" + owner);
  return (typeof (raw) === "string") ? JSON.parse(raw) : null;
}

describe("Owner Default MQTT API Key reuse (quick 261003-w13)", function () {

  beforeEach(function () {
    // Keep the run quiet; nothing here asserts on log text.
    for (const level of ["log", "info", "warn", "error", "debug"]) {
      spyOn(console, level);
    }
  });

  it("create_default_mqtt_apikey reuses an existing Default key behind another key", async function () {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO(), entryM()]) });
    const { owner, rec } = makeOwner(store);
    const calls = await collect((cb) => owner.create_default_mqtt_apikey(id, cb));
    expect(calls.length, "callbacks").to.equal(1);
    expect(calls[0][0]).to.equal(true);
    expect((calls[0][1] !== null) && (typeof (calls[0][1]) === "object") && (calls[0][1].key === KEY_M), "answers the existing Default key").to.equal(true);
    expect(store.rec.sets.length, "store writes").to.equal(0);
    expect(rec.added.length, "MQTT credentials added").to.equal(0);
    expect(storedEntries(store, id).length).to.equal(2);
  });

  it("create_default_mqtt_apikey reuses a lone existing Default key", async function () {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryM()]) });
    const { owner, rec } = makeOwner(store);
    const calls = await collect((cb) => owner.create_default_mqtt_apikey(id, cb));
    expect(calls.length, "callbacks").to.equal(1);
    expect(calls[0][0]).to.equal(true);
    expect(calls[0][1].key === KEY_M, "answers the existing Default key").to.equal(true);
    expect(store.rec.sets.length, "store writes").to.equal(0);
    expect(rec.added.length, "MQTT credentials added").to.equal(0);
  });

  it("create_default_mqtt_apikey still creates exactly one Default key when none exists", async function () {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO(), entryD()]) });
    const { owner, rec } = makeOwner(store);
    const calls = await collect((cb) => owner.create_default_mqtt_apikey(id, cb));
    expect(calls.length, "callbacks").to.equal(1);
    expect(calls[0][0]).to.equal(true);
    const entries = storedEntries(store, id);
    expect(entries.length).to.equal(3);
    expect(entries.filter((e) => e.alias === DEFAULT_ALIAS).length, "Default keys").to.equal(1);
    expect(entries[2].alias).to.equal(DEFAULT_ALIAS);
    expect(rec.added.length, "MQTT credentials added").to.equal(1);
  });

  it("Owner#create succeeds for an owner whose key store survived, without a second Default key", async function () {
    const email = "odk-survivor-" + Date.now() + "@example.invalid";
    const id = sha256(Globals.prefix() + email);
    APIKey._lastDefaultKeyAttempt.delete(id);
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO(), entryM()]) });
    const { owner, rec } = makeOwner(store);
    const inserted = [];
    owner.userlib = {
      get: async () => { const e = new Error("missing"); e.statusCode = 404; throw e; },
      view: async () => ({ rows: [] }),
      insert: async (doc, docId) => { inserted.push(docId); return { ok: true }; }
    };
    const calls = await collect((cb) => owner.create({ email: email, owner: "odk-survivor" }, false, {}, (...args) => cb(...args)), 300);
    expect(calls.length, "callbacks").to.equal(1);
    expect(calls[0][1], "create succeeded").to.equal(true);
    // CI runs with ENVIRONMENT=test, where Owner#create answers the activation token instead.
    if (process.env.ENVIRONMENT === "test") {
      expect((typeof (calls[0][2]) === "string") && /^[0-9a-f]{64}$/.test(calls[0][2]), "activation token").to.equal(true);
    } else {
      expect(calls[0][2]).to.equal("account_created");
    }
    expect(inserted.length, "user documents inserted").to.equal(1);
    expect(store.rec.sets.length, "store writes").to.equal(0);
    expect(rec.added.length, "MQTT credentials added").to.equal(0);
    expect(storedEntries(store, id).filter((e) => e.alias === DEFAULT_ALIAS).length, "Default keys").to.equal(1);
  });
});
