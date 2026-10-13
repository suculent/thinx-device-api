// v1.18 Phase 46 D-02 (ENV-01): an environment-variable overwrite must replace exactly one
// variable. apienv.create used to skip every stored entry whose name merely CONTAINED the
// requested key (`indexOf(key) !== -1`), so editing WIFI silently deleted WIFI_SSID, MY_WIFI
// and any other name containing "WIFI". The Vue Edit dialog (46-03) sends one
// PUT /api/v2/env {key, value} per D-01, so this spec is what keeps that edit safe.
//
// No Redis and no CouchDB: the library and the router run against an in-memory stand-in for
// the legacy callback Redis client (get/set answering on the next tick). The router is loaded
// through a fake `app` that records every registration, so handlers run without Express.
//
// This is a non-ZZ spec matched by spec/support/jasmine.json, so it also runs in the CI `test`
// job. Every spec shares one jasmine process there: this file assigns no environment variable
// and touches no global. Local run (placeholders typed inline, nothing read from .env):
//   ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy \
//     npx jasmine --config=/dev/null spec/jasmine/ApienvExactKeySpec.js
//
// Values are synthetic; no assertion message prints a stored value.

const APIEnv = require("../../lib/thinx/apienv");
const expect = require("chai").expect;

const OWNER = "a".repeat(64);
const OTHER = "b".repeat(64);

const V_WIFI = "val-p46-wifi-old";
const V_SSID = "val-p46-ssid";
const V_MY = "val-p46-my-wifi";
const V_LOWER = "val-p46-lower";
const V_NEW = "val-p46-wifi-new";

const SEED = [{ WIFI: V_WIFI }, { WIFI_SSID: V_SSID }, { MY_WIFI: V_MY }, { wifi: V_LOWER }];
const OTHER_RECORD = JSON.stringify([{ WIFI: "val-p46-other-wifi" }, { WIFI_SSID: "val-p46-other-ssid" }]);

// In-memory stand-in for the legacy callback Redis client used by APIEnv.
function makeStore() {
  const map = new Map();
  const store = {
    sets: 0,
    get(key, cb) {
      const value = map.has(key) ? map.get(key) : null;
      setImmediate(() => cb(null, value));
    },
    set(key, value, cb) {
      store.sets++;
      map.set(key, String(value));
      if (typeof cb === "function") setImmediate(() => cb(null, "OK"));
    },
    raw(key) { return map.has(key) ? map.get(key) : null; },
    seed(key, array) { map.set(key, JSON.stringify(array)); },
    reset() { map.clear(); store.sets = 0; }
  };
  return store;
}

// Parses the stored record into { names: [...], byName: {name: value} }.
function parsed(store, owner) {
  const arr = JSON.parse(store.raw("env:" + owner));
  const names = [];
  const byName = {};
  for (const entry of arr) {
    const keys = Object.keys(entry);
    expect(keys.length, "every stored entry has exactly one property").to.equal(1);
    names.push(keys[0]);
    byName[keys[0]] = entry[keys[0]];
  }
  return { names, byName, length: arr.length };
}

function expectEachOnce(names) {
  expect(new Set(names).size, "no name is stored twice").to.equal(names.length);
}

function libCreate(lib, owner, key, value) {
  return new Promise((resolve) => lib.create(owner, key, value, (success, message) => resolve({ success, message })));
}
function libFetch(lib, owner, name) {
  return new Promise((resolve) => lib.fetch(owner, name, (success, response) => resolve({ success, response })));
}
function libRevoke(lib, owner, names) {
  return new Promise((resolve) => lib.revoke(owner, names, (success, response) => resolve({ success, response })));
}
function libList(lib, owner) {
  return new Promise((resolve) => lib.list(owner, (success, response) => resolve({ success, response })));
}

describe("APIEnv exact-key overwrite (Phase 46 D-02, ENV-01)", function () {

  let store;
  let lib;

  beforeEach(function () {
    store = makeStore();
    store.seed("env:" + OWNER, SEED);
    store.seed("env:" + OTHER, JSON.parse(OTHER_RECORD));
    lib = new APIEnv(store);
  });

  function expectOtherUntouched() {
    expect(store.raw("env:" + OTHER) === OTHER_RECORD, "another owner's record is byte-identical").to.equal(true);
  }

  it("L1 overwriting WIFI replaces only WIFI and keeps WIFI_SSID, MY_WIFI and wifi, in one write", async function () {
    const r = await libCreate(lib, OWNER, "WIFI", V_NEW);
    expect(r.success).to.equal(true);
    expect(r.message).to.equal("WIFI");
    const p = parsed(store, OWNER);
    expect(p.length).to.equal(4);
    expectEachOnce(p.names);
    expect(p.names.slice().sort()).to.deep.equal(["MY_WIFI", "WIFI", "WIFI_SSID", "wifi"]);
    expect(p.byName.WIFI === V_NEW, "WIFI has the new value").to.equal(true);
    expect(p.byName.WIFI_SSID === V_SSID, "WIFI_SSID keeps its value").to.equal(true);
    expect(p.byName.MY_WIFI === V_MY, "MY_WIFI keeps its value").to.equal(true);
    expect(p.byName.wifi === V_LOWER, "wifi keeps its value").to.equal(true);
    expect(store.sets, "exactly one Redis write per create").to.equal(1);
    expectOtherUntouched();
  });

  it("L2 overwriting WIFI_SSID leaves WIFI at its old value", async function () {
    const r = await libCreate(lib, OWNER, "WIFI_SSID", "val-p46-ssid2");
    expect(r.success).to.equal(true);
    const p = parsed(store, OWNER);
    expect(p.length).to.equal(4);
    expectEachOnce(p.names);
    expect(p.byName.WIFI === V_WIFI, "WIFI keeps its value").to.equal(true);
    expect(p.byName.WIFI_SSID === "val-p46-ssid2", "WIFI_SSID has the new value").to.equal(true);
    expectOtherUntouched();
  });

  it("L3 creating a one-letter key I removes nothing", async function () {
    const r = await libCreate(lib, OWNER, "I", "val-p46-i");
    expect(r.success).to.equal(true);
    const p = parsed(store, OWNER);
    expect(p.length).to.equal(5);
    expectEachOnce(p.names);
    expect(p.names.slice().sort()).to.deep.equal(["I", "MY_WIFI", "WIFI", "WIFI_SSID", "wifi"]);
    expect(p.byName.WIFI === V_WIFI, "WIFI keeps its value").to.equal(true);
    expectOtherUntouched();
  });

  it("L4 an owner with no record gets exactly one entry; the other owner is untouched", async function () {
    const fresh = "c".repeat(64);
    const r = await libCreate(lib, fresh, "KEY", "v");
    expect(r.success).to.equal(true);
    expect(r.message).to.equal("KEY");
    expect(store.raw("env:" + fresh)).to.equal('[{"KEY":"v"}]');
    expectOtherUntouched();
  });

  it("L5 a non-string key matches by its stored property name", async function () {
    store.seed("env:" + OWNER, [{ "5": "a" }]);
    await libCreate(lib, OWNER, 5, "b");
    expect(store.raw("env:" + OWNER)).to.equal('[{"5":"b"}]');
    await libCreate(lib, OWNER, 5, "c");
    expect(store.raw("env:" + OWNER), "a second write of the same key never leaves two entries").to.equal('[{"5":"c"}]');
    expectOtherUntouched();
  });

  it("L6 fetch, revoke and list compare whole names", async function () {
    const f = await libFetch(lib, OWNER, "WIFI");
    expect(f.success).to.equal(true);
    expect(Object.keys(f.response)).to.deep.equal(["WIFI"]);
    expect(f.response.WIFI === V_WIFI, "fetch returns the WIFI entry, not WIFI_SSID").to.equal(true);

    const l = await libList(lib, OWNER);
    expect(l.success).to.equal(true);
    expect(l.response).to.deep.equal(["WIFI", "WIFI_SSID", "MY_WIFI", "wifi"]);

    const v = await libRevoke(lib, OWNER, ["WIFI"]);
    expect(v.success).to.equal(true);
    expect(v.response).to.deep.equal({ WIFI: "deleted" });
    const p = parsed(store, OWNER);
    expect(p.names).to.deep.equal(["WIFI_SSID", "MY_WIFI", "wifi"]);
    expect(p.byName.WIFI_SSID === V_SSID, "WIFI_SSID keeps its value").to.equal(true);
    expectOtherUntouched();
  });
});

describe("router.env exact-key overwrite and envelopes (Phase 46 D-02, ENV-01)", function () {

  // Router harness: a fake app records every registration; handlers run without Express.
  const routerStore = makeStore();
  let ROUTES = null;

  function loadRouter() {
    if (ROUTES !== null) return ROUTES;
    const routes = {};
    const app = { redis_client: routerStore };
    for (const method of ["get", "put", "post", "delete", "patch"]) {
      app[method] = (route, ...handlers) => { routes[method.toUpperCase() + " " + route] = handlers; };
    }
    require("../../lib/router.env.js")(app);
    ROUTES = routes;
    return ROUTES;
  }

  function fakeRes(resolve) {
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return res; },
      header() { return res; },
      end(text) { resolve({ status: statusCode, text }); }
    };
    return res;
  }

  function callRoute(routeKey, req) {
    const handlers = loadRouter()[routeKey];
    expect(Array.isArray(handlers), routeKey + " is registered").to.equal(true);
    return new Promise((resolve) => handlers[handlers.length - 1](Object.assign({ query: {} }, req), fakeRes(resolve)));
  }

  const session = () => ({ session: { owner: OWNER } });

  beforeEach(function () {
    routerStore.reset();
    routerStore.seed("env:" + OWNER, SEED);
    routerStore.seed("env:" + OTHER, JSON.parse(OTHER_RECORD));
  });

  function storedNames() {
    return JSON.parse(routerStore.raw("env:" + OWNER)).map((e) => Object.keys(e)[0]);
  }
  function expectOtherUntouched() {
    expect(routerStore.raw("env:" + OTHER) === OTHER_RECORD, "another owner's record is byte-identical").to.equal(true);
  }

  it("R1 mutating routes have verifyCsrfToken first; PUT /api/v2/env replaces only WIFI", async function () {
    const routes = loadRouter();
    for (const key of ["PUT /api/v2/env", "DELETE /api/v2/env", "POST /api/user/env/add", "POST /api/user/env/revoke"]) {
      expect(Array.isArray(routes[key]), key + " is registered").to.equal(true);
      expect(routes[key].length, key + " has two handlers").to.equal(2);
      expect(routes[key][0].name, key + " starts with the CSRF check").to.equal("verifyCsrfToken");
    }
    for (const key of ["GET /api/v2/env", "GET /api/user/env/list"]) {
      expect(routes[key].length, key + " has one handler").to.equal(1);
    }

    const out = await callRoute("PUT /api/v2/env", Object.assign(session(), { body: { key: "WIFI", value: V_NEW } }));
    expect(out.status).to.equal(200);
    expect(out.text).to.equal('{"success":true,"response":"WIFI"}');
    const names = storedNames();
    expect(names.length).to.equal(4);
    expectEachOnce(names);
    expect(names.slice().sort()).to.deep.equal(["MY_WIFI", "WIFI", "WIFI_SSID", "wifi"]);
    expect(routerStore.sets).to.equal(1);
    expectOtherUntouched();
  });

  it("R2 Legacy add answers the same envelope and keeps the siblings", async function () {
    const out = await callRoute("POST /api/user/env/add", Object.assign(session(), { body: { key: "WIFI", value: V_NEW } }));
    expect(out.status).to.equal(200);
    expect(out.text).to.equal('{"success":true,"response":"WIFI"}');
    const names = storedNames();
    expect(names.slice().sort()).to.deep.equal(["MY_WIFI", "WIFI", "WIFI_SSID", "wifi"]);
    expectOtherUntouched();
  });

  it("R2 DELETE /api/v2/env and POST /api/user/env/revoke answer the deleted envelope", async function () {
    for (const key of ["DELETE /api/v2/env", "POST /api/user/env/revoke"]) {
      routerStore.reset();
      routerStore.seed("env:" + OWNER, SEED);
      routerStore.seed("env:" + OTHER, JSON.parse(OTHER_RECORD));
      const out = await callRoute(key, Object.assign(session(), { body: { names: ["WIFI"] } }));
      expect(out.status, key).to.equal(200);
      expect(out.text, key).to.equal('{"success":true,"response":{"WIFI":"deleted"}}');
      expect(storedNames(), key).to.deep.equal(["WIFI_SSID", "MY_WIFI", "wifi"]);
      expectOtherUntouched();
    }
  });

  it("R3 list routes answer names only, never a stored value", async function () {
    for (const key of ["GET /api/v2/env", "GET /api/user/env/list"]) {
      const out = await callRoute(key, session());
      expect(out.status, key).to.equal(200);
      expect(out.text, key).to.equal('{"success":true,"response":["WIFI","WIFI_SSID","MY_WIFI","wifi"]}');
      for (const value of [V_WIFI, V_SSID, V_MY, V_LOWER]) {
        expect(out.text.includes(value), key + " body carries no stored value").to.equal(false);
      }
    }
  });

  it("R4 PUT without a session answers 401 and writes nothing", async function () {
    const out = await callRoute("PUT /api/v2/env", { body: { key: "WIFI", value: V_NEW } });
    expect(out.status).to.equal(401);
    expect(routerStore.sets).to.equal(0);
    expect(routerStore.raw("env:" + OWNER)).to.equal(JSON.stringify(SEED));
    expectOtherUntouched();
  });
});
