/*
 * BuilderApiKeySpec — quick 261003-vep: the builder embeds the device's own API key, never the
 * masked list name; APIKey#create refuses duplicate keys and aliases; MQTT registration
 * re-registers only the publishing device with its own key.
 *
 * Local run (needs no Redis, CouchDB or broker; every store is a fake):
 *
 *   ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "const J=require('jasmine');
 *     const j=new J();j.loadConfig({spec_dir:'spec',spec_files:['jasmine/BuilderApiKeySpec.js'],
 *     helpers:[],random:false});j.execute()"
 *
 * The key rule (Decision 2 of quick 261003-vep): a build embeds the pre-image of the device's
 * lastkey (the entry's key when sha256(key) == lastkey, its hash when sha256(hash) == lastkey)
 * when exactly one entry of ak:<owner> matches and it is not the owner's Default MQTT API Key.
 * Otherwise the build embeds "" (unidentified, ambiguous, Default MQTT key) or is refused with
 * build_requires_api_key (no keys, malformed store, Redis error).
 *
 * Nothing here prints a key or a hash: assertions compare with booleans and report which
 * fixture leaked by index, never the captured log text.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
  process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const sha256 = require("sha256");

const APIKey = require("../../lib/thinx/apikey");
const Builder = require("../../lib/thinx/builder");
const Messenger = require("../../lib/thinx/messenger");
const Platform = require("../../lib/thinx/platform");
const BuildLog = require("../../lib/thinx/buildlog");
const InfluxConnector = require("../../lib/thinx/influx");
const envi = require("../_envi.json");

const OWNER = envi.oid;
const OTHER = sha256("vep-other-owner");
const UDID_D = envi.udid;
const UDID_E = "0e9e0001-a1a1-11f0-8000-00000000000e";
const UDID_X = "0e9e0002-a1a1-11f0-8000-00000000000f";
const UDID_T = "0e9e0003-a1a1-11f0-8000-000000000010";

const KEY_M = sha256("vep-key-default-mqtt");
const KEY_D = sha256("vep-key-device");
const KEY_O = sha256("vep-key-other");
const KEY_X = sha256("vep-key-foreign");
const HASH_M = sha256(KEY_M);
const HASH_D = sha256(KEY_D);
const HASH_O = sha256(KEY_O);
const HASH_X = sha256(KEY_X);
const HASH_ONLY = sha256("vep-hash-only-entry");

const DEFAULT_ALIAS = "Default MQTT API Key";
const MASKED_D = "******************************" + KEY_D.substring(30);

const SECRETS = [
  KEY_M, KEY_D, KEY_O, KEY_X, HASH_M, HASH_D, HASH_O, HASH_X, HASH_ONLY,
  sha256(HASH_M), sha256(HASH_D), sha256(HASH_O), sha256(HASH_X)
];

const GIT = "https://github.com/suculent/thinx-firmware-esp8266-pio.git";

const entryM = () => ({ key: KEY_M, hash: HASH_M, alias: DEFAULT_ALIAS });
const entryD = () => ({ key: KEY_D, hash: HASH_D, alias: "vep-device" });
const entryO = () => ({ key: KEY_O, hash: HASH_O, alias: "vep-other" });

// ak:OWNER = [Default MQTT key, the device's key, another key]: the Default key is first, the
// other key last, so neither "first" nor "last" is the device's key.
const ownerStore = () => JSON.stringify([entryM(), entryD(), entryO()]);

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
      if (options.failGet) return cb(new Error("vep fake store failure"));
      cb(null, data.has(k) ? data.get(k) : null);
    },
    set(k, v, cb) {
      rec.sets.push(k);
      data.set(k, v);
      if (typeof (cb) === "function") cb(null, "OK");
    }
  };
}

function captureConsole() {
  const lines = [];
  const record = (...args) => { lines.push(util.format(...args)); };
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    spyOn(console, level).and.callFake(record);
  }
  return lines;
}

// Indexes (into SECRETS) of the values that appear in any captured line.
function leaked(lines, values) {
  const list = values || SECRETS;
  return list.filter((v) => lines.some((l) => l.indexOf(v) !== -1)).map((v) => SECRETS.indexOf(v));
}

function expectNoSecrets(lines, values) {
  expect(leaked(lines, values), "fixture indexes found in console output").to.deep.equal([]);
}

function verifies(ak, owner, value) {
  return new Promise((resolve) => ak.verify(owner, value, true, (success) => resolve(success === true)));
}

function deviceKey(ak, owner, lastkey) {
  return new Promise((resolve) => {
    let calls = 0;
    ak.get_device_apikey(owner, lastkey, (ok, value) => {
      calls++;
      resolve({ ok, value, calls });
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, ms) {
  const deadline = Date.now() + (ms || 3000);
  while (!predicate()) {
    if (Date.now() > deadline) return false;
    await sleep(5);
  }
  return true;
}

describe("BuilderApiKey (quick 261003-vep)", function () {

  let lines;

  beforeEach(() => {
    lines = captureConsole();
  });

  describe("VEP core: APIKey#get_device_apikey", function () {

    it("is a function", function () {
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: ownerStore() }));
      expect(typeof ak.get_device_apikey).to.equal("function");
    });

    it("answers the entry's key when the device authenticates with the key", async function () {
      const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
      const ak = new APIKey(store);
      const r = await deviceKey(ak, OWNER, HASH_D);
      expect(r.ok).to.equal(true);
      expect(r.value === KEY_D, "value is the device's key").to.equal(true);
      expect(r.calls).to.equal(1);
      expect(await verifies(ak, OWNER, r.value), "verify accepts it").to.equal(true);
      expect(store.rec.sets.length, "store writes").to.equal(0);
      expectNoSecrets(lines);
    });

    it("answers the entry's hash when the device authenticates with the hash", async function () {
      const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
      const ak = new APIKey(store);
      const r = await deviceKey(ak, OWNER, sha256(HASH_D));
      expect(r.ok).to.equal(true);
      expect(r.value === HASH_D, "value is the device's hash").to.equal(true);
      expect(await verifies(ak, OWNER, r.value), "verify accepts it").to.equal(true);
      expect(store.rec.sets.length, "store writes").to.equal(0);
      expectNoSecrets(lines);
    });

    for (const [label, lk] of [["key", () => HASH_M], ["hash", () => sha256(HASH_M)]]) {
      it("refuses the owner's Default MQTT API Key (device on its " + label + ")", async function () {
        const ak = new APIKey(makeStore({ ["ak:" + OWNER]: ownerStore() }));
        const r = await deviceKey(ak, OWNER, lk());
        expect(r.ok).to.equal(false);
        expect(r.value).to.equal("device_key_is_owner_mqtt_key");
        expectNoSecrets(lines);
      });
    }

    const unidentified = [
      ["an unknown lastkey", () => sha256("vep-unknown")],
      ["an empty lastkey", () => ""],
      ["an undefined lastkey", () => undefined],
      ["a non-string lastkey", () => 42],
      ["the sha256 of the masked list name", () => sha256(MASKED_D)]
    ];
    for (const [label, lk] of unidentified) {
      it("answers device_key_not_identified for " + label, async function () {
        const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
        const ak = new APIKey(store);
        const r = await deviceKey(ak, OWNER, lk());
        expect(r.ok).to.equal(false);
        expect(r.value).to.equal("device_key_not_identified");
        expect(store.rec.sets.length, "store writes").to.equal(0);
        expectNoSecrets(lines);
      });
    }

    it("answers device_key_not_identified for an entry with only a hash equal to lastkey", async function () {
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), { hash: HASH_ONLY, alias: "vep-hash-only" }]) }));
      const r = await deviceKey(ak, OWNER, HASH_ONLY);
      expect(r.ok).to.equal(false);
      expect(r.value).to.equal("device_key_not_identified");
      expectNoSecrets(lines);
    });

    it("answers device_key_ambiguous when two entries hold the device's key", async function () {
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), Object.assign(entryD(), { alias: "vep-device-copy" })]) }));
      const r = await deviceKey(ak, OWNER, HASH_D);
      expect(r.ok).to.equal(false);
      expect(r.value).to.equal("device_key_ambiguous");
      expectNoSecrets(lines);
    });

    for (const [label, raw] of [["an absent store", null], ["an empty array", "[]"]]) {
      it("answers owner_has_no_api_keys for " + label, async function () {
        const map = (raw === null) ? {} : { ["ak:" + OWNER]: raw };
        const ak = new APIKey(makeStore(map));
        const r = await deviceKey(ak, OWNER, HASH_D);
        expect(r.ok).to.equal(false);
        expect(r.value).to.equal("owner_has_no_api_keys");
      });
    }

    for (const [label, raw] of [["a JSON object", "{}"], ["non-JSON", "not json"]]) {
      it("answers apikey_store_invalid for " + label, async function () {
        const store = makeStore({ ["ak:" + OWNER]: raw });
        const ak = new APIKey(store);
        const r = await deviceKey(ak, OWNER, HASH_D);
        expect(r.ok).to.equal(false);
        expect(r.value).to.equal("apikey_store_invalid");
        expect(store.rec.sets.length, "store writes").to.equal(0);
      });
    }

    it("answers apikey_store_unavailable on a Redis error", async function () {
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: ownerStore() }, { failGet: true }));
      const r = await deviceKey(ak, OWNER, HASH_D);
      expect(r.ok).to.equal(false);
      expect(r.value).to.equal("apikey_store_unavailable");
    });

    for (const [label, owner] of [["undefined", undefined], ["empty", ""], ["non-string", 7]]) {
      it("answers invalid_owner for an " + label + " owner without a Redis call", async function () {
        const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
        const ak = new APIKey(store);
        const r = await deviceKey(ak, owner, HASH_D);
        expect(r.ok).to.equal(false);
        expect(r.value).to.equal("invalid_owner");
        expect(store.rec.gets.length, "store reads").to.equal(0);
      });
    }
  });

  describe("VEP builder: run_build embeds the device's own key", function () {

    let tmp, stats;

    beforeEach(() => {
      // realpath: safepath compares resolved paths, and /var is a link on macOS.
      tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "thinx-vep-"));
      stats = [];
      spyOn(BuildLog.prototype, "state");
      spyOn(BuildLog.prototype, "log");
      spyOn(InfluxConnector, "statsLog").and.callFake((...a) => { stats.push(a); });
      spyOn(Platform, "getPlatform").and.callFake((p, cb) => cb(true, "arduino"));
    });

    afterEach(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    // The real run_build, the real device-key fetch and the real generate_thinx_json on a fake
    // store. The device has no MAC, so run_build stops right after writing thinx_build.json and
    // answering build_started (device_mac_missing), without the worker protocol.
    function harness(map, opts) {
      const options = opts || {};
      const store = makeStore(map, options);
      const builder = new Builder(store);
      const notified = [];
      builder.notify = (...a) => notified.push(a[3]);
      const dev = { udid: UDID_D, owner: OWNER, platform: "arduino:esp8266" };
      if (Object.prototype.hasOwnProperty.call(options, "lastkey")) dev.lastkey = options.lastkey;
      builder.devicelib = { get: (udid, cb) => cb(null, dev) };

      const BUILD_PATH = fs.mkdtempSync(path.join(tmp, "build-"));
      const XBUILD_PATH = path.join(BUILD_PATH, "repo");
      fs.mkdirSync(XBUILD_PATH);
      fs.writeFileSync(path.join(XBUILD_PATH, "main.ino"), "void setup() {}\n");
      builder.buildPathFor = () => BUILD_PATH;
      builder.createBuildPath = () => { };
      builder.prefetchPublic = async () => true;
      builder.prefetchPrivate = async () => true;
      builder.runGitCommand = () => "1";
      builder.getTag = () => "1.0";
      builder.apienv = { list: (owner, cb) => cb(true, {}) };

      const calls = [];
      const run = async () => {
        builder.run_build({
          build_id: "dddddddd-7777-11f0-9d4a-0b5e6f7a8c9d",
          owner: OWNER,
          git: GIT,
          branch: "main",
          udid: UDID_D,
          source_id: envi.sid,
          worker: { running: true, socket: { connected: true, on() { }, emit() { } } }
        }, {}, (success, response) => calls.push([success, response]));
        await until(() => calls.length > 0);
        await until(() => notified.indexOf("device_mac_missing") !== -1, 500);
      };
      const buildJson = () => {
        const file = path.join(XBUILD_PATH, "thinx_build.json");
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, "utf8"));
      };
      return { builder, store, calls, run, buildJson };
    }

    function expectStarted(h) {
      expect(h.calls.length, "callbacks").to.equal(1);
      expect(h.calls[0][0]).to.equal(true);
      expect(h.calls[0][1].response).to.equal("build_started");
    }

    it("embeds the device's key when it authenticates with the key", async function () {
      const h = harness({ ["ak:" + OWNER]: ownerStore() }, { lastkey: HASH_D });
      await h.run();
      expectStarted(h);
      const json = h.buildJson();
      expect(json, "thinx_build.json").to.not.equal(null);
      expect(json.THINX_API_KEY === KEY_D, "THINX_API_KEY is the device's key").to.equal(true);
      expect(json.THINX_API_KEY === KEY_O, "THINX_API_KEY is the last key").to.equal(false);
      expect(json.THINX_API_KEY.indexOf("*"), "masked").to.equal(-1);
      expect(await verifies(h.builder.apikey, OWNER, json.THINX_API_KEY), "verify accepts it").to.equal(true);
      expect(h.store.rec.sets.length, "store writes").to.equal(0);
      expectNoSecrets(lines);
    });

    it("embeds the device's hash when it authenticates with the hash", async function () {
      const h = harness({ ["ak:" + OWNER]: ownerStore() }, { lastkey: sha256(HASH_D) });
      await h.run();
      expectStarted(h);
      const json = h.buildJson();
      expect(json, "thinx_build.json").to.not.equal(null);
      expect(json.THINX_API_KEY === HASH_D, "THINX_API_KEY is the device's hash").to.equal(true);
      expect(await verifies(h.builder.apikey, OWNER, json.THINX_API_KEY), "verify accepts it").to.equal(true);
      expectNoSecrets(lines);
    });

    const empty = [
      ["the owner's Default MQTT API Key", () => ({ ["ak:" + OWNER]: ownerStore() }), { lastkey: HASH_M }],
      ["an unknown lastkey", () => ({ ["ak:" + OWNER]: ownerStore() }), { lastkey: sha256("vep-unknown") }],
      ["a missing lastkey", () => ({ ["ak:" + OWNER]: ownerStore() }), {}],
      ["a duplicate-key store", () => ({ ["ak:" + OWNER]: JSON.stringify([entryM(), entryD(), Object.assign(entryD(), { alias: "vep-device-copy" })]) }), { lastkey: HASH_D }]
    ];
    for (const [label, map, opts] of empty) {
      it("embeds \"\" and still starts the build for " + label, async function () {
        const h = harness(map(), opts);
        await h.run();
        expectStarted(h);
        const json = h.buildJson();
        expect(json, "thinx_build.json").to.not.equal(null);
        expect(json.THINX_API_KEY === "", "THINX_API_KEY is empty").to.equal(true);
        expectNoSecrets(lines);
      });
    }

    const refused = [
      ["an owner without keys", {}, { lastkey: HASH_D }],
      ["a Redis error", { ["ak:" + OWNER]: ownerStore() }, { lastkey: HASH_D, failGet: true }]
    ];
    for (const [label, map, opts] of refused) {
      it("refuses the build with build_requires_api_key for " + label, async function () {
        const h = harness(map, opts);
        await h.run();
        expect(h.calls).to.deep.equal([[false, "build_requires_api_key"]]);
        expect(h.buildJson(), "thinx_build.json").to.equal(null);
        expectNoSecrets(lines);
      });
    }
  });

  describe("VEP create: APIKey#create refuses duplicates", function () {

    function create(ak, owner, alias) {
      return new Promise((resolve) => {
        try {
          ak.create(owner, alias, (success, result) => resolve({ threw: false, success, result }));
        } catch (_e) {
          resolve({ threw: true });
        }
      });
    }

    it("refuses an alias the owner already has, writing nothing", async function () {
      const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
      const r = await create(new APIKey(store), OWNER, "vep-device");
      expect(r.threw, "threw").to.equal(false);
      expect(r.success).to.equal(false);
      expect(r.result).to.equal("alias_already_exists");
      expect(store.rec.sets.length, "store writes").to.equal(0);
    });

    it("refuses a key the owner already has, writing nothing", async function () {
      const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
      const ak = new APIKey(store);
      ak.create_key = () => KEY_O;
      const r = await create(ak, OWNER, "vep-new-alias");
      expect(r.threw, "threw").to.equal(false);
      expect(r.success).to.equal(false);
      expect(r.result).to.equal("key_already_exists");
      expect(store.rec.sets.length, "store writes").to.equal(0);
      expectNoSecrets(lines);
    });

    it("gives two back-to-back creates different random keys, appended last", async function () {
      const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
      const ak = new APIKey(store);
      const first = await create(ak, OWNER, "vep-new-1");
      const second = await create(ak, OWNER, "vep-new-2");
      expect(first.success, "first create").to.equal(true);
      expect(second.success, "second create").to.equal(true);
      const entries = JSON.parse(store.data.get("ak:" + OWNER));
      expect(entries.length).to.equal(5);
      expect(entries.map((e) => e.alias)).to.deep.equal([DEFAULT_ALIAS, "vep-device", "vep-other", "vep-new-1", "vep-new-2"]);
      expect(entries[0].key === KEY_M && entries[1].key === KEY_D && entries[2].key === KEY_O, "earlier entries intact").to.equal(true);
      const a = entries[3];
      const b = entries[4];
      expect(a.key === b.key, "same key twice").to.equal(false);
      for (const e of [a, b]) {
        expect(/^[0-9a-f]{64}$/.test(e.key), "64 lowercase hex").to.equal(true);
        expect(e.hash === sha256(e.key), "hash is sha256(key)").to.equal(true);
      }
      expectNoSecrets(lines, SECRETS.concat([a.key, b.key, a.hash, b.hash]));
    });

    it("refuses a second Default MQTT API Key", async function () {
      const store = makeStore({ ["ak:" + OWNER]: ownerStore() });
      const r = await create(new APIKey(store), OWNER, DEFAULT_ALIAS);
      expect(r.threw, "threw").to.equal(false);
      expect(r.success).to.equal(false);
      expect(r.result).to.equal("alias_already_exists");
      expect(store.rec.sets.length, "store writes").to.equal(0);
    });

    for (const [label, raw] of [["a JSON object", "{}"], ["non-JSON", "not json"]]) {
      it("refuses a store that is " + label + " with apikey_store_invalid, writing nothing", async function () {
        const store = makeStore({ ["ak:" + OWNER]: raw });
        const r = await create(new APIKey(store), OWNER, "vep-new-alias");
        expect(r.threw, "threw").to.equal(false);
        expect(r.success).to.equal(false);
        expect(r.result).to.equal("apikey_store_invalid");
        expect(store.rec.sets.length, "store writes").to.equal(0);
      });
    }

    it("logs neither the new key nor its hash", async function () {
      const store = makeStore({});
      const r = await create(new APIKey(store), OWNER, "vep-first");
      expect(r.success).to.equal(true);
      const e = JSON.parse(store.data.get("ak:" + OWNER))[0];
      expectNoSecrets(lines, SECRETS.concat([e.key, e.hash]));
    });
  });

  describe("VEP list: APIKey#list stays the console's masked view", function () {

    it("names each entry with 30 asterisks plus the key's tail, keeping alias and order", async function () {
      const ak = new APIKey(makeStore({ ["ak:" + OWNER]: ownerStore() }));
      const list = await new Promise((resolve) => ak.list(OWNER, resolve));
      expect(list.length).to.equal(3);
      const keys = [KEY_M, KEY_D, KEY_O];
      const hashes = [HASH_M, HASH_D, HASH_O];
      expect(list.map((e) => e.alias)).to.deep.equal([DEFAULT_ALIAS, "vep-device", "vep-other"]);
      list.forEach((e, i) => {
        expect(e.name === "******************************" + keys[i].slice(30), "masked name " + i).to.equal(true);
        expect(e.name === keys[i], "name is the key " + i).to.equal(false);
        expect(e.name === hashes[i], "name is the hash " + i).to.equal(false);
      });
    });
  });

  describe("VEP messenger: MQTT registration uses the publishing device's own key", function () {

    const FLAG = "THINX_MQTT_DEVICE_WRITES";
    let savedFlag;

    beforeEach(() => {
      savedFlag = process.env[FLAG];
      process.env[FLAG] = "1";
    });

    afterEach(() => {
      if (typeof (savedFlag) === "undefined") delete process.env[FLAG];
      else process.env[FLAG] = savedFlag;
    });

    const docs = () => ({
      [UDID_D]: { _id: UDID_D, udid: UDID_D, owner: OWNER, lastkey: HASH_D, alias: "vep-alias-d" },
      [UDID_E]: { _id: UDID_E, udid: UDID_E, owner: OWNER, lastkey: HASH_O, alias: "vep-alias-e" },
      [UDID_X]: { _id: UDID_X, udid: UDID_X, owner: OTHER, lastkey: HASH_X, alias: "vep-alias-x" },
      [UDID_T]: { _id: UDID_T, udid: UDID_T, owner: OTHER, previous_owner: OWNER, lastkey: HASH_X, alias: "vep-alias-t" }
    });

    function makeMessenger(opts) {
      const options = opts || {};
      const map = Object.prototype.hasOwnProperty.call(options, "map") ? options.map : {
        ["ak:" + OWNER]: ownerStore(),
        ["ak:" + OTHER]: JSON.stringify([{ key: KEY_X, hash: HASH_X, alias: "vep-foreign", transfer: { udid: UDID_T, from: [OWNER], at: "2026-10-03T12:00:00.000Z" } }])
      };
      const store = makeStore(map);
      const devices = docs();
      if (options.lastkey) devices[UDID_D].lastkey = options.lastkey;
      const rec = { registers: [], createMqttKeys: [], publishes: [], edits: [] };

      const m = Object.create(Messenger.prototype);
      m.DISABLE_SLACK = true;
      m.rtm = null;
      m.channel = null;
      m.clients = {};
      m.redis = store;
      m.akey = new APIKey(store);
      const lookup = (id, cb) => {
        setImmediate(() => {
          if (!Object.prototype.hasOwnProperty.call(devices, id)) {
            const e = new Error("missing");
            e.statusCode = 404;
            return cb(e);
          }
          cb(null, JSON.parse(JSON.stringify(devices[id])));
        });
      };
      m.devicelib = { get: lookup };
      m.device = {
        edit(changes, cb) { rec.edits.push(changes.udid); cb(true, {}); },
        register() { rec.registers.push({ via: "device.register" }); },
        // t29's contract, so the spec does not depend on which lookup the code uses
        fetchOwned(udid, owner, cb) {
          lookup(udid, (error, doc) => {
            if (error || !doc || doc.owner !== owner) return cb(false, "no_such_device");
            cb(true, doc);
          });
        }
      };
      m.user = {
        create_default_mqtt_apikey(owner, cb) { rec.createMqttKeys.push(owner); if (typeof (cb) === "function") cb(false); }
      };
      m.registerDevice = (registration, auth, res, oid) => {
        rec.registers.push({ registration, auth, oid });
      };
      m.publish = (owner, udid, message) => { rec.publishes.push({ owner, udid, message }); };
      m.forwardNonNotification = () => { };
      return { m, rec, store };
    }

    const statusTopic = (owner, udid) => "/" + owner + "/" + udid + "/status";
    const registration = (udid, owner) => ({ registration: { udid: udid, owner: owner, mac: "AA:BB:CC:00:00:0D", firmware: "vep" } });

    async function flush() {
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    async function register(fx, topic, message) {
      fx.m.mqttDeviceRegistration(topic, message, OWNER);
      await flush();
    }

    function expectNothing(rec) {
      expect(rec.registers.length, "registrations").to.equal(0);
      expect(rec.createMqttKeys.length, "create_default_mqtt_apikey").to.equal(0);
      expect(rec.publishes.length, "publishes").to.equal(0);
    }

    it("registers the device with its own key", async function () {
      const fx = makeMessenger();
      await register(fx, statusTopic(OWNER, UDID_D), registration(UDID_D, OWNER));
      expect(fx.rec.registers.length, "registrations").to.equal(1);
      const r = fx.rec.registers[0];
      expect(r.auth === KEY_D, "auth is the device's key").to.equal(true);
      expect(r.oid === OWNER, "registers as the topic owner").to.equal(true);
      expect(await verifies(fx.m.akey, OWNER, r.auth), "verify accepts it").to.equal(true);
      expect(fx.rec.createMqttKeys.length, "create_default_mqtt_apikey").to.equal(0);
      expect(fx.store.rec.sets.length, "store writes").to.equal(0);
      expectNoSecrets(lines);
    });

    it("registers the device with its own hash", async function () {
      const fx = makeMessenger({ lastkey: sha256(HASH_D) });
      await register(fx, statusTopic(OWNER, UDID_D), registration(UDID_D, OWNER));
      expect(fx.rec.registers.length, "registrations").to.equal(1);
      expect(fx.rec.registers[0].auth === HASH_D, "auth is the device's hash").to.equal(true);
      expectNoSecrets(lines);
    });

    it("is wired through messageResponder for a status topic", async function () {
      const fx = makeMessenger();
      fx.m.messageResponder(statusTopic(OWNER, UDID_D), Buffer.from(JSON.stringify(registration(UDID_D, OWNER))));
      await flush();
      expect(fx.rec.registers.length, "registrations").to.equal(1);
      expect(fx.rec.registers[0].auth === KEY_D, "auth is the device's key").to.equal(true);
      expectNoSecrets(lines);
    });

    const routed = [
      ["a device on the Default MQTT key", () => makeMessenger({ lastkey: HASH_M }), () => statusTopic(OWNER, UDID_D), () => registration(UDID_D, OWNER)],
      ["a registration naming another udid", () => makeMessenger(), () => statusTopic(OWNER, UDID_D), () => registration(UDID_E, OWNER)],
      ["a registration naming another owner", () => makeMessenger(), () => statusTopic(OWNER, UDID_D), () => registration(UDID_D, OTHER)],
      ["a registration without an owner", () => makeMessenger(), () => statusTopic(OWNER, UDID_D), () => ({ registration: { udid: UDID_D } })],
      ["a device owned by another owner", () => makeMessenger(), () => statusTopic(OWNER, UDID_X), () => registration(UDID_X, OWNER)],
      ["a device transferred away from the topic owner", () => makeMessenger(), () => statusTopic(OWNER, UDID_T), () => registration(UDID_T, OWNER)],
      ["an unknown device", () => makeMessenger(), () => statusTopic(OWNER, "0e9e00ff-a1a1-11f0-8000-0000000000ff"), () => registration("0e9e00ff-a1a1-11f0-8000-0000000000ff", OWNER)],
      ["an owner without keys", () => makeMessenger({ map: {} }), () => statusTopic(OWNER, UDID_D), () => registration(UDID_D, OWNER)],
      ["an unidentified lastkey", () => makeMessenger({ lastkey: sha256("vep-unknown") }), () => statusTopic(OWNER, UDID_D), () => registration(UDID_D, OWNER)],
      ["a non-status topic", () => makeMessenger(), () => "/" + OWNER + "/" + UDID_D, () => registration(UDID_D, OWNER)],
      ["a null registration", () => makeMessenger(), () => statusTopic(OWNER, UDID_D), () => ({ registration: null })]
    ];
    for (const [label, fixture, topic, message] of routed) {
      it("registers nothing and creates no key for " + label, async function () {
        const fx = fixture();
        await register(fx, topic(), message());
        expectNothing(fx.rec);
        expect(fx.store.rec.sets.length, "store writes").to.equal(0);
        expectNoSecrets(lines);
      });
    }

    describe("registerDevice callback", function () {

      function realRegister(response) {
        const m = Object.create(Messenger.prototype);
        const publishes = [];
        m.publish = (owner, udid, message) => publishes.push({ owner, udid, message });
        m.device = {
          register(reg, auth, res, cb) { cb(res, response.success, response.body); }
        };
        return { m, publishes };
      }

      for (const [label, response] of [
        ["a string reason", { success: false, body: "vep_registration_failed" }],
        ["a failed registration object", { success: false, body: { registration: { success: false, response: "device_update_failed" } } }],
        ["a success without a registration", { success: true, body: {} }]
      ]) {
        it("neither throws nor publishes on " + label, function () {
          const { m, publishes } = realRegister(response);
          expect(() => m.registerDevice({ udid: UDID_D, owner: OWNER }, KEY_D, null, OWNER)).to.not.throw();
          expect(publishes.length, "publishes").to.equal(0);
          expectNoSecrets(lines);
        });
      }

      it("publishes one response to the device on success", function () {
        const { m, publishes } = realRegister({ success: true, body: { registration: { success: true, status: "OK", udid: UDID_D } } });
        expect(() => m.registerDevice({ udid: UDID_D, owner: OWNER }, KEY_D, null, OWNER)).to.not.throw();
        expect(publishes.length, "publishes").to.equal(1);
        expect(publishes[0].owner === OWNER, "publish owner").to.equal(true);
        expect(publishes[0].udid).to.equal(UDID_D);
        expect(typeof publishes[0].message).to.equal("string");
        expectNoSecrets(lines);
      });
    });
  });
});
