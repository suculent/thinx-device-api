/*
 * ApikeyExposureSpec — quick 261003-w13: the console's API key list carries no cleartext key,
 * the create route shows a new key once and logs neither the key nor its hash, revocation
 * works by hash only, and the owner's MQTT broker credential is read from the key store (not
 * from the console list), answered exactly once and created only when it is missing.
 *
 * This is the CI-enforced guard for quick 261003-w13 (a non-ZZ spec, so it runs in CI).
 *
 * Local run (needs no Redis, CouchDB or broker; the store, auth and app are fakes):
 *
 *   ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');
 *     const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/ApikeyExposureSpec.js'],
 *     helpers:[],random:false});j.execute()"
 *
 * Nothing here prints a key or a hash: every comparison against fixture or created key
 * material is reduced to a boolean, and leaks are reported by fixture index, never by the
 * captured log text.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const util = require("util");
const sha256 = require("sha256");

const APIKey = require("../../lib/thinx/apikey");
const Owner = require("../../lib/thinx/owner.js");

const OWNER = sha256("w13-owner");
const DEFAULT_ALIAS = "Default MQTT API Key";

const KEY_M = sha256("w13-key-default-mqtt");
const KEY_D = sha256("w13-key-device");
const KEY_O = sha256("w13-key-other");
const KEY_T = sha256("w13-key-moved");
const HASH_M = sha256(KEY_M);
const HASH_D = sha256(KEY_D);
const HASH_O = sha256(KEY_O);
const HASH_T = sha256(KEY_T);

const KEYS = [KEY_M, KEY_D, KEY_O, KEY_T];
const SECRETS = [KEY_M, KEY_D, KEY_O, KEY_T, HASH_M, HASH_D, HASH_O, HASH_T];

const entryM = () => ({ key: KEY_M, hash: HASH_M, alias: DEFAULT_ALIAS });
const entryD = () => ({ key: KEY_D, hash: HASH_D, alias: "w13-device" });
const entryO = () => ({ key: KEY_O, hash: HASH_O, alias: "w13-other" });
const entryT = () => ({
  key: KEY_T,
  hash: HASH_T,
  alias: "w13-moved",
  transfer: { udid: "0e9e1300-a1a1-11f0-8000-000000000013", from: [sha256("w13-sender")], at: "2026-10-03T00:00:00.000Z" }
});

const HEX64 = /^[0-9a-f]{64}$/;
const MASK = "*".repeat(30);

// A fake legacy redis client. get answers the map value (string or null), or an Error when
// failGet is set; set stores and records. Both call back synchronously.
function makeStore(map, opts) {
  const options = opts || {};
  const data = new Map(Object.entries(map || {}));
  const rec = { gets: [], sets: [] };
  return {
    rec,
    data,
    get(k, cb) {
      rec.gets.push(k);
      if (options.failGet) return cb(new Error("w13 fake store failure"));
      cb(null, data.has(k) ? data.get(k) : null);
    },
    set(k, v, cb) {
      rec.sets.push(k);
      data.set(k, v);
      if (typeof (cb) === "function") cb(null, "OK");
    }
  };
}

function storedEntries(store, owner) {
  const raw = store.data.get("ak:" + owner);
  return (typeof (raw) === "string") ? JSON.parse(raw) : null;
}

function captureConsole() {
  const lines = [];
  const record = (...args) => { lines.push(util.format(...args)); };
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    spyOn(console, level).and.callFake(record);
  }
  return lines;
}

// Indexes (into `values`) of the values that appear in any captured line.
function leaked(lines, values) {
  const list = values || SECRETS;
  const out = [];
  list.forEach((v, i) => {
    if ((typeof (v) === "string") && (v.length > 0) && lines.some((l) => l.indexOf(v) !== -1)) out.push(i);
  });
  return out;
}

function expectNoSecrets(lines, values, label) {
  expect(leaked(lines, values), (label || "secret") + " indexes found in console output").to.deep.equal([]);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, ms) {
  const deadline = Date.now() + (ms || 1000);
  while (!predicate()) {
    if (Date.now() > deadline) return false;
    await sleep(5);
  }
  return true;
}

// Calls fn(cb); waits up to boundMs for the first callback, then a settle window for more.
// A throw (sync or a rejected promise) is recorded, never rethrown.
async function collect(fn, boundMs, settleMs) {
  const calls = [];
  const thrown = [];
  try {
    const p = fn((...args) => calls.push(args));
    if (p && (typeof (p.catch) === "function")) p.catch((e) => thrown.push(e));
  } catch (e) {
    thrown.push(e);
  }
  await until(() => (calls.length > 0) || (thrown.length > 0), boundMs || 1000);
  await sleep(settleMs || 100);
  return { calls, thrown };
}

function listOf(ak, owner) {
  return new Promise((resolve) => ak.list(owner, resolve));
}

let ownerSeq = 0;
function freshOwner() {
  ownerSeq++;
  const owner = sha256("w13-owner-" + ownerSeq + "-" + Date.now());
  APIKey._lastDefaultKeyAttempt.delete(owner);
  return owner;
}

function makeOwner(store) {
  const owner = new Owner(store);
  const rec = { added: [] };
  owner.auth = {
    add_mqtt_credentials(user, password, cb) {
      rec.added.push({ user, password });
      if (typeof (cb) === "function") cb();
    },
    revoke_mqtt_credentials() { /* best-effort compensation only */ }
  };
  owner.create_default_acl = (_o, cb) => { if (typeof (cb) === "function") cb(true); };
  return { owner, rec };
}

// The Owner scenarios O1-O8; each answers what the assertions (and O9) need.
const ownerScenarios = {
  async O1() {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO(), entryM(), entryD()]) });
    const { owner, rec } = makeOwner(store);
    const r = await collect((cb) => owner.mqtt_key(id, cb));
    return { id, store, rec, r, created: [] };
  },
  async O2() {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO(), entryD()]) });
    const { owner, rec } = makeOwner(store);
    const r = await collect((cb) => owner.mqtt_key(id, cb));
    return { id, store, rec, r, created: createdKeys(store, id, 2) };
  },
  async O3() {
    const id = freshOwner();
    const store = makeStore({});
    const { owner, rec } = makeOwner(store);
    const r = await collect((cb) => owner.mqtt_key(id, cb));
    return { id, store, rec, r, created: createdKeys(store, id, 0) };
  },
  async O4() {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO(), entryD()]) }, { failGet: true });
    const { owner, rec } = makeOwner(store);
    const r = await collect((cb) => owner.mqtt_key(id, cb));
    return { id, store, rec, r, created: [] };
  },
  async O5() {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: "not json" });
    const { owner, rec } = makeOwner(store);
    const r = await collect((cb) => owner.mqtt_key(id, cb));
    return { id, store, rec, r, created: [] };
  },
  async O6() {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO(), entryM()]) });
    const { owner, rec } = makeOwner(store);
    const r = await collect((cb) => owner.create_default_mqtt_apikey(id, cb));
    return { id, store, rec, r, created: [] };
  },
  async O7() {
    const id = freshOwner();
    const store = makeStore({ ["ak:" + id]: JSON.stringify([entryO()]) });
    const { owner, rec } = makeOwner(store);
    const r = await collect((cb) => owner.create_default_mqtt_apikey(id, cb));
    return { id, store, rec, r, created: createdKeys(store, id, 1) };
  },
  async O8() {
    const store = makeStore({});
    const { owner, rec } = makeOwner(store);
    const a = await collect((cb) => owner.create_default_mqtt_apikey(undefined, cb));
    const b = await collect((cb) => owner.create_default_mqtt_apikey("", cb));
    return { store, rec, a, b, created: [] };
  }
};

// Key and hash of every entry at or after `from` in the owner's store (created by the case).
function createdKeys(store, owner, from) {
  const entries = storedEntries(store, owner) || [];
  const out = [];
  entries.slice(from).forEach((e) => {
    if (e && (typeof (e.key) === "string")) out.push(e.key, sha256(e.key));
    if (e && (typeof (e.hash) === "string")) out.push(e.hash);
  });
  return out;
}

// Mounts lib/router.apikey.js on a fake app and records each route's handlers.
function mountRoutes(store) {
  const routes = {};
  const register = (method) => (path, ...handlers) => { routes[method + " " + path] = handlers; };
  const app = { redis_client: store, get: register("get"), post: register("post"), delete: register("delete") };
  require("../../lib/router.apikey.js")(app);
  return routes;
}

function makeRes() {
  let resolveEnd;
  const ended = new Promise((resolve) => { resolveEnd = resolve; });
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended,
    status(code) { res.statusCode = code; return res; },
    header(name, value) { res.headers[name] = value; return res; },
    end(body) { res.body = body; resolveEnd(body); return res; }
  };
  return res;
}

// Calls the route's LAST handler (the route body; the first is the CSRF guard).
async function call(routes, method, path, body, owner) {
  const handlers = routes[method + " " + path];
  if (!Array.isArray(handlers)) throw new Error("route not mounted: " + method + " " + path);
  const req = { session: { owner: owner || OWNER }, body: body || {} };
  const res = makeRes();
  handlers[handlers.length - 1](req, res);
  await Promise.race([res.ended, sleep(1000)]);
  return res;
}

function parsed(res) {
  return (typeof (res.body) === "string") ? JSON.parse(res.body) : null;
}

// Compares a (success, reason) answer without ever printing a value that might be a key.
function expectAnswer(ok, value, wantOk, wantReason, label) {
  const shown = (typeof (value) === "string" && /^[a-z_]+$/.test(value)) ? value : "<" + typeof (value) + ">";
  expect((ok === wantOk) && (value === wantReason), (label || "answer") + " was (" + ok + ", " + shown + ")").to.equal(true);
}

function exactlyNameHashAlias(item) {
  return JSON.stringify(Object.keys(item).sort()) === JSON.stringify(["alias", "hash", "name"]);
}

describe("ApikeyExposure (quick 261003-w13)", function () {

  describe("W13 list: APIKey#list exports {name, hash, alias} only", function () {

    it("answers every entry in order as exactly {name, hash, alias}", async function () {
      captureConsole();
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO(), entryT()]) }));
      const list = await listOf(ak, OWNER);
      expect(list.length).to.equal(4);
      expect(list.map((e) => e.alias)).to.deep.equal([DEFAULT_ALIAS, "w13-device", "w13-other", "w13-moved"]);
      const hashes = [HASH_M, HASH_D, HASH_O, HASH_T];
      list.forEach((item, i) => {
        expect(exactlyNameHashAlias(item), "item " + i + " has exactly alias/hash/name").to.equal(true);
        expect(item.name === MASK + KEYS[i].substring(30), "masked name " + i).to.equal(true);
        expect(item.hash === hashes[i], "hash " + i).to.equal(true);
      });
    });

    it("carries no stored key anywhere in the result", async function () {
      captureConsole();
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO(), entryT()]) }));
      const text = JSON.stringify(await listOf(ak, OWNER));
      expect(KEYS.map((k) => text.indexOf(k) !== -1), "keys present in the list").to.deep.equal([false, false, false, false]);
    });

    const empties = [["an absent store", null], ["a JSON object", "{}"], ["non-JSON", "not json"]];
    for (const [label, raw] of empties) {
      it("answers [] for " + label + " without throwing", async function () {
        captureConsole();
        const map = (raw === null) ? {} : { ["ak:" + OWNER]: raw };
        const ak = new APIKey(makeStore(map));
        const list = await listOf(ak, OWNER);
        expect(Array.isArray(list)).to.equal(true);
        expect(list.length).to.equal(0);
      });
    }

    it("answers [] on a Redis error", async function () {
      captureConsole();
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM()]) }, { failGet: true }));
      const list = await listOf(ak, OWNER);
      expect(Array.isArray(list)).to.equal(true);
      expect(list.length).to.equal(0);
    });

    it("skips a non-object array member", async function () {
      captureConsole();
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), 5, null, "x", entryD()]) }));
      const list = await listOf(ak, OWNER);
      expect(list.map((e) => e.alias)).to.deep.equal([DEFAULT_ALIAS, "w13-device"]);
    });

    it("logs no stored key or hash", async function () {
      const lines = captureConsole();
      await listOf(new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO(), entryT()]) })), OWNER);
      await listOf(new APIKey(makeStore({})), OWNER);
      await listOf(new APIKey(makeStore({ ["ak:" + OWNER]: "not json" })), OWNER);
      expectNoSecrets(lines);
    });
  });

  describe("W13 accessors: owner MQTT credential and first key read the store", function () {

    function ownerMqttKey(ak, owner) {
      return new Promise((resolve) => {
        let calls = 0;
        ak.get_owner_mqtt_apikey(owner, (ok, value) => {
          calls++;
          resolve({ ok, value, calls });
        });
      });
    }

    it("get_owner_mqtt_apikey is a function", function () {
      const ak = new APIKey(makeStore({}));
      expect(typeof (ak.get_owner_mqtt_apikey)).to.equal("function");
    });

    it("answers the owner's Default MQTT API Key entry as {key, hash, alias}", async function () {
      captureConsole();
      const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryO(), entryM(), entryD()]) });
      const r = await ownerMqttKey(new APIKey(store), OWNER);
      expect(r.ok).to.equal(true);
      const v = r.value;
      expect((v !== null) && (typeof (v) === "object"), "value is an object").to.equal(true);
      expect(JSON.stringify(Object.keys(v).sort())).to.equal(JSON.stringify(["alias", "hash", "key"]));
      expect(v.key === KEY_M, "key is the Default key").to.equal(true);
      expect(v.hash === HASH_M, "hash is the Default hash").to.equal(true);
      expect(v.alias).to.equal(DEFAULT_ALIAS);
      expect(store.rec.sets.length, "writes").to.equal(0);
    });

    const missing = [["no Default key", JSON.stringify([entryO(), entryD()])], ["an absent store", null]];
    for (const [label, raw] of missing) {
      it("answers owner_mqtt_key_missing for " + label, async function () {
        captureConsole();
        const store = makeStore((raw === null) ? {} : { ["ak:" + OWNER]: raw });
        const r = await ownerMqttKey(new APIKey(store), OWNER);
        expectAnswer(r.ok, r.value, false, "owner_mqtt_key_missing");
        expect(store.rec.sets.length, "writes").to.equal(0);
      });
    }

    for (const [label, raw] of [["a JSON object", "{}"], ["non-JSON", "not json"]]) {
      it("answers apikey_store_invalid for " + label, async function () {
        captureConsole();
        const store = makeStore({ ["ak:" + OWNER]: raw });
        const r = await ownerMqttKey(new APIKey(store), OWNER);
        expectAnswer(r.ok, r.value, false, "apikey_store_invalid");
        expect(store.rec.sets.length, "writes").to.equal(0);
      });
    }

    it("answers apikey_store_unavailable on a Redis error", async function () {
      captureConsole();
      const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM()]) }, { failGet: true });
      const r = await ownerMqttKey(new APIKey(store), OWNER);
      expectAnswer(r.ok, r.value, false, "apikey_store_unavailable");
      expect(store.rec.sets.length, "writes").to.equal(0);
    });

    for (const [label, owner] of [["undefined", undefined], ["empty", ""], ["numeric", 123]]) {
      it("answers invalid_owner for an " + label + " owner without a Redis call", async function () {
        captureConsole();
        const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM()]) });
        const r = await ownerMqttKey(new APIKey(store), owner);
        expectAnswer(r.ok, r.value, false, "invalid_owner");
        expect(store.rec.gets.length, "gets").to.equal(0);
        expect(store.rec.sets.length, "writes").to.equal(0);
      });
    }

    it("logs no stored key or hash", async function () {
      const lines = captureConsole();
      const stores = [
        makeStore({ ["ak:" + OWNER]: JSON.stringify([entryO(), entryM(), entryD()]) }),
        makeStore({ ["ak:" + OWNER]: JSON.stringify([entryO(), entryD()]) }),
        makeStore({ ["ak:" + OWNER]: "not json" })
      ];
      for (const store of stores) await ownerMqttKey(new APIKey(store), OWNER);
      expectNoSecrets(lines);
    });

    function firstKey(ak, owner) {
      return new Promise((resolve) => ak.get_first_apikey(owner, (ok, value) => resolve({ ok, value })));
    }

    it("get_first_apikey answers the first entry's key as a string", async function () {
      captureConsole();
      const r = await firstKey(new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryO(), entryM()]) })), OWNER);
      expect(r.ok).to.equal(true);
      expect(typeof (r.value)).to.equal("string");
      expect(r.value === KEY_O, "first key").to.equal(true);
    });

    it("get_first_apikey fails for an absent store", async function () {
      captureConsole();
      const r = await firstKey(new APIKey(makeStore({})), OWNER);
      expect(r.ok).to.equal(false);
    });

    it("get_first_apikey fails for a non-JSON store without throwing", async function () {
      captureConsole();
      let threw = false;
      let r = null;
      try {
        r = await firstKey(new APIKey(makeStore({ ["ak:" + OWNER]: "not json" })), OWNER);
      } catch (_e) {
        threw = true;
      }
      expect(threw, "threw").to.equal(false);
      expect(r !== null && r.ok === false, "answered false").to.equal(true);
    });
  });

  describe("W13 owner: Owner#mqtt_key and create_default_mqtt_apikey", function () {

    it("O1: mqtt_key answers the existing Default key once, writing nothing", async function () {
      captureConsole();
      const s = await ownerScenarios.O1();
      expect(s.r.thrown.length, "thrown").to.equal(0);
      expect(s.r.calls.length, "callbacks").to.equal(1);
      expect(s.r.calls[0][0]).to.equal(true);
      const entry = s.r.calls[0][1];
      expect(entry !== null && typeof (entry) === "object" && entry.key === KEY_M, "key is the Default key").to.equal(true);
      expect(entry.hash === HASH_M, "hash is the Default hash").to.equal(true);
      expect(s.store.rec.sets.length, "writes").to.equal(0);
      expect(s.rec.added.length, "MQTT credentials added").to.equal(0);
    });

    it("O2: mqtt_key creates the Default key once when keys exist but none is the Default key", async function () {
      captureConsole();
      const s = await ownerScenarios.O2();
      expect(s.r.thrown.length, "thrown").to.equal(0);
      expect(s.r.calls.length, "callbacks").to.equal(1);
      expect(s.r.calls[0][0]).to.equal(true);
      const entry = s.r.calls[0][1];
      expect(entry !== null && typeof (entry) === "object", "entry is an object").to.equal(true);
      expect(entry.alias).to.equal(DEFAULT_ALIAS);
      expect(HEX64.test(entry.key), "new key is 64 hex").to.equal(true);
      expect(entry.key !== KEY_O && entry.key !== KEY_D, "new key is not an existing key").to.equal(true);
      const stored = storedEntries(s.store, s.id);
      expect(stored.map((e) => e.alias)).to.deep.equal(["w13-other", "w13-device", DEFAULT_ALIAS]);
      expect(stored[2].key === entry.key, "stored last entry is the answered key").to.equal(true);
      expect(s.rec.added.length, "MQTT credentials added").to.equal(1);
      expect(s.rec.added[0].user).to.equal(s.id);
      expect(s.rec.added[0].password === entry.key, "registered password is the new key").to.equal(true);
    });

    it("O3: mqtt_key creates the Default key once for an absent store", async function () {
      captureConsole();
      const s = await ownerScenarios.O3();
      expect(s.r.thrown.length, "thrown").to.equal(0);
      expect(s.r.calls.length, "callbacks").to.equal(1);
      expect(s.r.calls[0][0]).to.equal(true);
      const entry = s.r.calls[0][1];
      const stored = storedEntries(s.store, s.id);
      expect(stored.length).to.equal(1);
      expect(stored[0].alias).to.equal(DEFAULT_ALIAS);
      expect(entry !== null && typeof (entry) === "object" && entry.key === stored[0].key, "answered the stored key").to.equal(true);
      expect(s.rec.added.length, "MQTT credentials added").to.equal(1);
      expect(s.rec.added[0].password === entry.key, "registered password is the new key").to.equal(true);
    });

    it("O4: mqtt_key answers default_owner_api_key_missing once on a Redis error, writing nothing", async function () {
      captureConsole();
      const s = await ownerScenarios.O4();
      expect(s.r.thrown.length, "thrown").to.equal(0);
      expect(s.r.calls.length, "callbacks").to.equal(1);
      expectAnswer(s.r.calls[0][0], s.r.calls[0][1], false, "default_owner_api_key_missing");
      expect(s.store.rec.sets.length, "writes").to.equal(0);
      expect(s.rec.added.length, "MQTT credentials added").to.equal(0);
    });

    it("O5: mqtt_key answers default_owner_api_key_missing once on a malformed store, writing nothing", async function () {
      captureConsole();
      const s = await ownerScenarios.O5();
      expect(s.r.thrown.length, "thrown").to.equal(0);
      expect(s.r.calls.length, "callbacks").to.equal(1);
      expectAnswer(s.r.calls[0][0], s.r.calls[0][1], false, "default_owner_api_key_missing");
      expect(s.store.rec.sets.length, "writes").to.equal(0);
      expect(s.rec.added.length, "MQTT credentials added").to.equal(0);
    });

    it("O6: create_default_mqtt_apikey answers the existing Default key, creating nothing", async function () {
      captureConsole();
      const s = await ownerScenarios.O6();
      expect(s.r.thrown.length, "thrown").to.equal(0);
      expect(s.r.calls.length, "callbacks").to.equal(1);
      expect(s.r.calls[0][0]).to.equal(true);
      const entry = s.r.calls[0][1];
      expect(entry !== null && typeof (entry) === "object" && entry.key === KEY_M, "answered the Default key").to.equal(true);
      expect(s.store.rec.sets.length, "writes").to.equal(0);
      expect(s.rec.added.length, "MQTT credentials added").to.equal(0);
    });

    it("O7: create_default_mqtt_apikey registers the created key, never the store's first entry", async function () {
      captureConsole();
      const s = await ownerScenarios.O7();
      expect(s.r.thrown.length, "thrown").to.equal(0);
      expect(s.r.calls.length, "callbacks").to.equal(1);
      expect(s.r.calls[0][0]).to.equal(true);
      const entry = s.r.calls[0][1];
      const stored = storedEntries(s.store, s.id);
      expect(stored.map((e) => e.alias)).to.deep.equal(["w13-other", DEFAULT_ALIAS]);
      expect(entry !== null && typeof (entry) === "object" && entry.key === stored[1].key, "answered the created key").to.equal(true);
      expect(s.rec.added.length, "MQTT credentials added").to.equal(1);
      expect(s.rec.added[0].password === stored[1].key, "registered the created key").to.equal(true);
      expect(s.rec.added[0].password === KEY_O, "registered the first entry").to.equal(false);
    });

    it("O8: create_default_mqtt_apikey answers false exactly once for an invalid owner, without a get", async function () {
      captureConsole();
      const s = await ownerScenarios.O8();
      expect(s.a.thrown.length + s.b.thrown.length, "thrown").to.equal(0);
      expect(s.a.calls.length, "callbacks (undefined)").to.equal(1);
      expect(s.a.calls[0][0]).to.equal(false);
      expect(s.b.calls.length, "callbacks (empty)").to.equal(1);
      expect(s.b.calls[0][0]).to.equal(false);
      expect(s.store.rec.gets.length, "gets").to.equal(0);
      expect(s.store.rec.sets.length, "writes").to.equal(0);
    });

    it("O9: no console line of O1-O8 carries a stored or created key or hash", async function () {
      const lines = captureConsole();
      const created = [];
      for (const name of ["O1", "O2", "O3", "O4", "O5", "O6", "O7", "O8"]) {
        const s = await ownerScenarios[name]();
        created.push(...s.created);
      }
      expect(lines.length, "the scenarios log something").to.be.above(0);
      expectNoSecrets(lines, SECRETS, "fixture");
      expectNoSecrets(lines, created, "created");
    });
  });

  describe("W13 routes list: the console list routes carry no key", function () {

    for (const path of ["/api/user/apikey/list", "/api/v2/apikey"]) {
      it("GET " + path + " answers {name, hash, alias} items and no stored key", async function () {
        captureConsole();
        const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO()]) });
        const res = await call(mountRoutes(store), "get", path);
        const body = parsed(res);
        expect(body !== null && body.success === true, "success").to.equal(true);
        expect(Array.isArray(body.response) && body.response.length === 3, "three items").to.equal(true);
        body.response.forEach((item, i) => {
          expect(exactlyNameHashAlias(item), "item " + i + " has exactly alias/hash/name").to.equal(true);
        });
        expect(KEYS.map((k) => res.body.indexOf(k) !== -1), "keys in the body").to.deep.equal([false, false, false, false]);
      });
    }
  });

  describe("W13 routes create: the new key is shown once and never logged", function () {

    const creates = [["/api/v2/apikey", "w13-new-1"], ["/api/user/apikey", "w13-new-2"]];
    for (const [path, alias] of creates) {
      it("POST " + path + " answers {api_key, hash} once; the list then carries no key", async function () {
        const lines = captureConsole();
        const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO()]) });
        const routes = mountRoutes(store);
        const res = await call(routes, "post", path, { alias: alias });
        const body = parsed(res);
        expect(body !== null && body.success === true, "success").to.equal(true);
        const created = body.response;
        expect(JSON.stringify(Object.keys(created).sort())).to.equal(JSON.stringify(["api_key", "hash"]));
        expect(HEX64.test(created.api_key), "api_key is 64 hex").to.equal(true);
        expect(created.hash === sha256(created.api_key), "hash is sha256(api_key)").to.equal(true);
        const stored = storedEntries(store, OWNER);
        expect(stored[stored.length - 1].alias).to.equal(alias);
        expect(stored[stored.length - 1].key === created.api_key, "stored last entry is the new key").to.equal(true);

        const listed = await call(routes, "get", "/api/v2/apikey");
        expect(listed.body.indexOf(created.api_key) === -1, "list body carries the new key").to.equal(true);
        const item = parsed(listed).response.find((e) => e.hash === sha256(created.api_key));
        expect(typeof (item) === "object", "the new key is listed by hash").to.equal(true);
        expect(Object.prototype.hasOwnProperty.call(item, "key"), "listed item has a key property").to.equal(false);

        expectNoSecrets(lines, [created.api_key, created.hash], "created");
        expectNoSecrets(lines, SECRETS, "fixture");
      });
    }

    it("refuses an alias the owner already has with set_api_key_failed", async function () {
      captureConsole();
      const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO()]) });
      const res = await call(mountRoutes(store), "post", "/api/v2/apikey", { alias: "w13-device" });
      const body = parsed(res);
      expectAnswer(body.success, body.response, false, "set_api_key_failed");
      expect(store.rec.sets.length, "writes").to.equal(0);
    });
  });

  describe("W13 routes revoke: revocation works by hash only", function () {

    it("POST /api/user/apikey/revoke {fingerprint} removes exactly the matching entry", async function () {
      const lines = captureConsole();
      const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO()]) });
      const res = await call(mountRoutes(store), "post", "/api/user/apikey/revoke", { fingerprint: HASH_O });
      const body = parsed(res);
      expect(body.success).to.equal(true);
      expect(Array.isArray(body.response) && body.response.length === 1 && body.response[0] === HASH_O, "revoked the other hash").to.equal(true);
      expect(storedEntries(store, OWNER).map((e) => e.alias)).to.deep.equal([DEFAULT_ALIAS, "w13-device"]);
      expectNoSecrets(lines, KEYS, "key");
    });

    it("DELETE /api/v2/apikey {fingerprints} removes exactly the matching entries", async function () {
      const lines = captureConsole();
      const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO()]) });
      const res = await call(mountRoutes(store), "delete", "/api/v2/apikey", { fingerprints: [HASH_D] });
      const body = parsed(res);
      expect(body.success).to.equal(true);
      expect(Array.isArray(body.response) && body.response.length === 1 && body.response[0] === HASH_D, "revoked the device hash").to.equal(true);
      expect(storedEntries(store, OWNER).map((e) => e.alias)).to.deep.equal([DEFAULT_ALIAS, "w13-other"]);
      expectNoSecrets(lines, KEYS, "key");
    });

    it("a cleartext key passed as a fingerprint revokes nothing", async function () {
      const lines = captureConsole();
      const store = makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), entryO()]) });
      const res = await call(mountRoutes(store), "post", "/api/user/apikey/revoke", { fingerprint: KEY_O });
      const body = parsed(res);
      expect(body.success).to.equal(true);
      expect(Array.isArray(body.response) && body.response.length === 0, "nothing revoked").to.equal(true);
      expect(storedEntries(store, OWNER).map((e) => e.alias)).to.deep.equal([DEFAULT_ALIAS, "w13-device", "w13-other"]);
      expectNoSecrets(lines, KEYS, "key");
    });
  });
});
