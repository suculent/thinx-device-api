/*
 * BuilderEnvValuesSpec — owner environment variables reach the build header.
 *
 * Runs without Redis and without CouchDB (in-memory store, fake Redis).
 *
 * Pinned behaviour:
 * - APIEnv#values answers the owner's { name: value } map, skips prototype-naming
 *   entries, answers {} for an owner without variables and false for a corrupt record;
 *   APIEnv#list still answers names only.
 * - Builder#generate_thinx_json applies the owner's values, takes THINX_ENV_SSID and
 *   THINX_ENV_PASS from them (blank only when unset), and still overwrites identity and
 *   version keys (THINX_OWNER, THINX_UDID, THINX_FIRMWARE_VERSION...) with its own.
 *   It used to read `.count` on the name array (never set) and then blank both WiFi
 *   keys, so every CI build lost its network after OTA.
 * - Builder#listEnvs hands back names for the worker and values for the header, and an
 *   apienv without values() (older stubs) gives an empty map instead of failing.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const expect = require("chai").expect;
const APIEnv = require("../../lib/thinx/apienv");
const Builder = require("../../lib/thinx/builder");

const OWNER = "cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12";
const OTHER_OWNER = "0000000000000000000000000000000000000000000000000000000000000000";

function makeStore() {
    const map = new Map();
    return {
        get(key, cb) { const v = map.has(key) ? map.get(key) : null; setImmediate(() => cb(null, v)); },
        set(key, value, cb) { map.set(key, String(value)); if (typeof cb === "function") setImmediate(() => cb(null, "OK")); },
        seed(key, value) { map.set(key, typeof value === "string" ? value : JSON.stringify(value)); }
    };
}

const fakeRedis = {
    get(k, cb) { if (typeof cb === "function") cb(null, null); },
    set(...a) { const cb = a[a.length - 1]; if (typeof cb === "function") cb(null, "OK"); }
};

function values(lib, owner) {
    return new Promise((resolve) => lib.values(owner, (success, response) => resolve({ success, response })));
}

const DEVICE = {
    alias: "Flood",
    owner: OWNER,
    udid: "04ed1650-35a4-11ef-8ce1-25b4e9f8ae00",
    platform: "platformio",
    auto_update: true
};

describe("Owner environment variables in the build header", function () {

    describe("APIEnv#values", function () {

        it("answers the stored values by name", async function () {
            const store = makeStore();
            store.seed("env:" + OWNER, [{ THINX_ENV_SSID: "Page42-THiNX" }, { THINX_ENV_PASS: "secret-pass" }, { CUSTOM: "x" }]);
            const r = await values(new APIEnv(store), OWNER);
            expect(r.success).to.equal(true);
            expect(Object.assign({}, r.response)).to.deep.equal({ THINX_ENV_SSID: "Page42-THiNX", THINX_ENV_PASS: "secret-pass", CUSTOM: "x" });
        });

        it("keeps each owner's values apart", async function () {
            const store = makeStore();
            store.seed("env:" + OWNER, [{ THINX_ENV_SSID: "mine" }]);
            store.seed("env:" + OTHER_OWNER, [{ THINX_ENV_SSID: "theirs" }]);
            const r = await values(new APIEnv(store), OWNER);
            expect(r.response.THINX_ENV_SSID).to.equal("mine");
        });

        it("skips prototype-naming entries and answers a map without a prototype", async function () {
            const store = makeStore();
            store.seed("env:" + OWNER, '[{"__proto__":{"polluted":true}},{"constructor":"c"},{"SAFE":"1"}]');
            const r = await values(new APIEnv(store), OWNER);
            expect(Object.keys(r.response)).to.deep.equal(["SAFE"]);
            expect(Object.getPrototypeOf(r.response)).to.equal(null);
            expect({}.polluted).to.equal(undefined);
        });

        it("answers an empty map for an owner without variables", async function () {
            const r = await values(new APIEnv(makeStore()), OWNER);
            expect(r.success).to.equal(true);
            expect(Object.keys(r.response)).to.deep.equal([]);
        });

        it("answers false for a corrupt record without throwing", async function () {
            const store = makeStore();
            store.seed("env:" + OWNER, "{not json");
            const r = await values(new APIEnv(store), OWNER);
            expect(r.success).to.equal(false);
            expect(Object.keys(r.response)).to.deep.equal([]);
        });

        it("leaves APIEnv#list answering names only", async function () {
            const store = makeStore();
            store.seed("env:" + OWNER, [{ THINX_ENV_SSID: "Page42-THiNX" }, { THINX_ENV_PASS: "secret-pass" }]);
            const names = await new Promise((resolve) => new APIEnv(store).list(OWNER, (s, r) => resolve(r)));
            expect(names).to.deep.equal(["THINX_ENV_SSID", "THINX_ENV_PASS"]);
        });
    });

    describe("Builder#generate_thinx_json", function () {

        const builder = new Builder(fakeRedis);
        const generate = (envs) => builder.generate_thinx_json(envs, DEVICE, "device-api-key", "074405a\n", "3.0.2\n", "/tmp/build/thinx-autoflood");

        it("takes the WiFi credentials from the owner's values", function () {
            const json = generate({ THINX_ENV_SSID: "Page42-THiNX", THINX_ENV_PASS: "secret-pass" });
            expect(json.THINX_ENV_SSID).to.equal("Page42-THiNX");
            expect(json.THINX_ENV_PASS).to.equal("secret-pass");
        });

        it("applies other owner variables", function () {
            expect(generate({ CUSTOM_FLAG: "on" }).CUSTOM_FLAG).to.equal("on");
        });

        it("keeps identity and version keys its own", function () {
            const json = generate({ THINX_OWNER: OTHER_OWNER, THINX_UDID: "spoofed", THINX_FIRMWARE_VERSION: "evil:9.9.9", THINX_API_KEY: "stolen" });
            expect(json.THINX_OWNER).to.equal(OWNER);
            expect(json.THINX_UDID).to.equal(DEVICE.udid);
            expect(json.THINX_FIRMWARE_VERSION).to.equal("thinx-autoflood:3.0.2");
            expect(json.THINX_API_KEY).to.equal("device-api-key");
        });

        for (const [label, envs] of [["no values", {}], ["a name list", ["THINX_ENV_SSID"]], ["null", null], ["undefined", undefined]]) {
            it("blanks the WiFi credentials for " + label, function () {
                const json = generate(envs);
                expect(json.THINX_ENV_SSID).to.equal("");
                expect(json.THINX_ENV_PASS).to.equal("");
            });
        }

        it("ignores non-string WiFi values", function () {
            const json = generate({ THINX_ENV_SSID: 42, THINX_ENV_PASS: { a: 1 } });
            expect(json.THINX_ENV_SSID).to.equal("");
            expect(json.THINX_ENV_PASS).to.equal("");
        });
    });

    // The console saves per-device values in device.environment (DeviceDetail >
    // Environment); thinx-autoflood 3.0.2 still shipped blank WiFi after #579 because
    // only the owner's variables were read.
    describe("Builder#generate_thinx_json with device.environment", function () {

        const builder = new Builder(fakeRedis);
        const withEnv = (environment) => Object.assign({}, DEVICE, { environment });
        const generate = (device, envs) => builder.generate_thinx_json(envs, device, "device-api-key", "4248e52\n", "3.0.2\n", "/tmp/build/thinx-autoflood");
        const OWNER_WIFI = { THINX_ENV_SSID: "owner-ssid", THINX_ENV_PASS: "owner-pass" };

        it("takes the WiFi credentials from the device environment", function () {
            const json = generate(withEnv({ THINX_ENV_SSID: "Page42-THiNX", THINX_ENV_PASS: "dev-pass", console: "true" }), {});
            expect(json.THINX_ENV_SSID).to.equal("Page42-THiNX");
            expect(json.THINX_ENV_PASS).to.equal("dev-pass");
        });

        it("prefers the device environment over the owner's values", function () {
            const json = generate(withEnv({ THINX_ENV_SSID: "device-ssid", THINX_ENV_PASS: "device-pass" }), OWNER_WIFI);
            expect(json.THINX_ENV_SSID).to.equal("device-ssid");
            expect(json.THINX_ENV_PASS).to.equal("device-pass");
        });

        it("falls back to the owner's value per key", function () {
            const json = generate(withEnv({ THINX_ENV_SSID: "device-ssid" }), OWNER_WIFI);
            expect(json.THINX_ENV_SSID).to.equal("device-ssid");
            expect(json.THINX_ENV_PASS).to.equal("owner-pass");
        });

        it("falls back to the owner's value for an empty or non-string device value", function () {
            const json = generate(withEnv({ THINX_ENV_SSID: "", THINX_ENV_PASS: 1234 }), OWNER_WIFI);
            expect(json.THINX_ENV_SSID).to.equal("owner-ssid");
            expect(json.THINX_ENV_PASS).to.equal("owner-pass");
        });

        for (const [label, environment] of [["null", null], ["an array", ["THINX_ENV_SSID"]], ["a string", "THINX_ENV_SSID=x"]]) {
            it("ignores a device environment that is " + label, function () {
                const json = generate(withEnv(environment), OWNER_WIFI);
                expect(json.THINX_ENV_SSID).to.equal("owner-ssid");
            });
        }

        it("never reads an inherited value", function () {
            const environment = Object.create({ THINX_ENV_SSID: "inherited" });
            const json = generate(withEnv(environment), {});
            expect(json.THINX_ENV_SSID).to.equal("");
        });

        it("does not copy other device environment keys into the header", function () {
            expect(generate(withEnv({ THINX_ENV_SSID: "s", console: "true" }), {}).console).to.equal(undefined);
        });

        it("blanks both keys when neither the device nor the owner set them", function () {
            const json = generate(withEnv({ console: "true" }), {});
            expect(json.THINX_ENV_SSID).to.equal("");
            expect(json.THINX_ENV_PASS).to.equal("");
        });
    });

    describe("Builder#listEnvs", function () {

        it("answers names for the worker and values for the header", async function () {
            const store = makeStore();
            store.seed("env:" + OWNER, [{ THINX_ENV_SSID: "Page42-THiNX" }]);
            const builder = new Builder(fakeRedis);
            builder.apienv = new APIEnv(store);
            const r = await new Promise((resolve) => builder.listEnvs(OWNER, (ok, names, vals) => resolve({ ok, names, vals })));
            expect(r.ok).to.equal(true);
            expect(r.names).to.deep.equal(["THINX_ENV_SSID"]);
            expect(r.vals.THINX_ENV_SSID).to.equal("Page42-THiNX");
        });

        it("answers an empty map for an apienv without values()", async function () {
            const builder = new Builder(fakeRedis);
            builder.apienv = { list: (owner, cb) => cb(true, []) };
            const r = await new Promise((resolve) => builder.listEnvs(OWNER, (ok, names, vals) => resolve({ ok, names, vals })));
            expect(r.ok).to.equal(true);
            expect(r.vals).to.deep.equal({});
        });
    });
});
