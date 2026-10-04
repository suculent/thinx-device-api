/*
 * DeviceDocLogLeakSpec — quick 261004-l8k: device document + udid hardening.
 *
 * Runs without Redis and without CouchDB. lib/thinx/couch.js and lib/thinx/audit.js are
 * swapped in require.cache for a scriptable fake device database and a no-op audit log, and
 * a fresh copy of lib/thinx/device.js is loaded against them. The swap lives in the outer
 * describe's beforeAll/afterAll, so it never leaks into the other spec files run in the
 * same process. Deployment specs use the real Deployment class; only
 * Filez.deployPathForDevice is pointed at a temporary deploy folder where a valid udid needs
 * a real file (jasmine spyOn, restored after each spec).
 *
 * Pinned behaviour:
 * - Device#update_device (shared by HTTP edit and the MQTT status edit) never logs the device
 *   document, the changes object, the owner id, lastkey or the database error on any path;
 *   its failure lines carry a reason code and the udid only.
 * - Device#update_device_and_respond (HTTP check-in) does not log the device on a failed write.
 * - Deployment#latestFirmwarePath refuses a udid that fails sanitka.udid ('../x', 'a/b', '',
 *   numbers, objects) with callback(false) once, before any filesystem access; a valid udid
 *   still finds firmware; its log lines carry neither the owner id nor the deploy path.
 * - The other Deployment methods that build a path from a caller-supplied udid
 *   (latestFirmwareEnvelope, latestFirmwareArtifact, artifact) refuse the same input before
 *   building the path.
 * - Device#update_binary and Device#firmware do not log the deploy path, the OTT or the
 *   request body.
 * - Deployment#hasUpdateAvailable at equal versions offers the build only when both the
 *   device and the envelope env_hash are non-empty strings and differ; a missing envelope
 *   hash no longer re-offers the same build on every check-in (cafebabe skip kept).
 *
 * Nothing here prints an owner id, key, hash or token; assertions report sentinel names only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const fs = require("fs");
const fsExtra = require("fs-extra");
const os = require("os");
const path = require("path");
const nodeUtil = require("util");
const expect = require("chai").expect;
const sha256 = require("sha256");

const Deployment = require("../../lib/thinx/deployment");
const Filez = require("../../lib/thinx/files");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEVICE_PATH];

const OWNER = sha256("l8k-owner@example.com");
const LASTKEY = sha256("l8k-lastkey");
const API_KEY = sha256("l8k-api-key");
const OTT = sha256("l8k-ott");
const UDID = "e8c00000-0000-4000-8000-0000000000e8";
const BUILD_ID = "e8c00000-0000-4000-8000-0000000000b1";
const CHANGE_SENTINEL = "l8k-change-sentinel";
const ALIAS_SENTINEL = "l8k-alias-sentinel";
const REV_SENTINEL = "1-l8krevsentinel";
const DB_ERROR_SENTINEL = "l8k-db-error-sentinel";

// name -> value; a log line containing any value fails the spec, reported by name only
const SECRETS = {
    owner: OWNER,
    lastkey: LASTKEY,
    api_key: API_KEY,
    ott: OTT,
    change: CHANGE_SENTINEL,
    alias: ALIAS_SENTINEL,
    rev: REV_SENTINEL,
    db_error: DB_ERROR_SENTINEL
};

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = { getError: null, getUndefined: false, atomicError: null, atomics: 0 };

function deviceDoc() {
    return {
        _id: UDID,
        _rev: REV_SENTINEL,
        udid: UDID,
        owner: OWNER,
        lastkey: LASTKEY,
        alias: ALIAS_SENTINEL,
        mac: "AA:BB:CC:DD:EE:FF"
    };
}

function later(cb, err, body) {
    setImmediate(() => cb(err, body));
}

const deviceDb = {
    get(id, cb) {
        if (couch.getError) return later(cb, couch.getError);
        if (couch.getUndefined) return later(cb, null, undefined);
        return later(cb, null, deviceDoc());
    },
    atomic(design, update, id, changes, cb) {
        couch.atomics++;
        if (couch.atomicError) return later(cb, couch.atomicError, { echo: CHANGE_SENTINEL, owner: OWNER });
        return later(cb, null, { ok: true });
    }
};

function otherDbMethod() {
    const args = Array.prototype.slice.call(arguments);
    const cb = args[args.length - 1];
    if (typeof (cb) === "function") setImmediate(() => cb(new Error("not expected")));
    return new Promise(() => { /* never settles */ });
}

const otherDb = { get: otherDbMethod, view: otherDbMethod, atomic: otherDbMethod, insert: otherDbMethod, destroy: otherDbMethod };

function useDb(name) {
    if (typeof (name) === "string" && name.endsWith("managed_devices")) return deviceDb;
    return otherDb;
}

function fakeCouch() {
    return { use: useDb, db: { use: useDb } };
}

class AuditStub {
    log() { /* no-op */ }
}

function redisStub() {
    return {
        get(key, cb) { setImmediate(() => cb(null, null)); },
        set(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, "OK")); },
        del(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, 1)); },
        expire(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, 1)); },
        ttl(...args) { const cb = args[args.length - 1]; if (typeof (cb) === "function") setImmediate(() => cb(null, 60)); },
        on() { }
    };
}

// ---------------------------------------------------------------------------
// Log capture
// ---------------------------------------------------------------------------

let lines = [];

function captureLogs() {
    lines = [];
    if (jasmine.isSpy(console.log)) return; // already capturing in this spec
    const record = (...args) => { lines.push(nodeUtil.format(...args)); };
    spyOn(console, "log").and.callFake(record);
    spyOn(console, "error").and.callFake(record);
    spyOn(console, "warn").and.callFake(record);
    spyOn(console, "info").and.callFake(record);
}

// Names of the secrets (and extra needles) that appear in any captured line.
function leaked(extra) {
    const needles = Object.assign({}, SECRETS, extra || {});
    const found = [];
    for (const name of Object.keys(needles)) {
        if (lines.some((l) => l.indexOf(needles[name]) !== -1)) found.push(name);
    }
    return found;
}

function linesWith(text) {
    return lines.filter((l) => l.indexOf(text) !== -1).length;
}

function tempDeployFolder() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "l8k-"));
    const dpath = path.join(root, OWNER, UDID);
    fs.mkdirSync(dpath, { recursive: true });
    return { root, dpath };
}

const BAD_UDIDS = [
    ["'../x'", "../x"],
    ["'a/b'", "a/b"],
    ["''", ""],
    ["a 36-char traversal", "../../../../../../../../../../etc/pas"],
    ["a number", 123],
    ["an object", { udid: UDID }]
];

describe("Device document + udid hardening (quick 261004-l8k)", function () {

    const saved = {};
    let Device;

    beforeAll(() => {
        // Bind the real dependency tree first, so nothing that stays cached captures the fake.
        require(DEVICE_PATH);
        for (const p of SWAPPED) saved[p] = require.cache[p];
        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        delete require.cache[DEVICE_PATH];
        Device = require(DEVICE_PATH);
    });

    afterAll(() => {
        for (const p of SWAPPED) {
            if (saved[p]) require.cache[p] = saved[p]; else delete require.cache[p];
        }
    });

    beforeEach(() => {
        couch.getError = null;
        couch.getUndefined = false;
        couch.atomicError = null;
        couch.atomics = 0;
    });

    describe("Device#update_device", function () {

        function run(changes) {
            const device = new Device(redisStub());
            return new Promise((resolve) => device.update_device(UDID, changes, (success, response) => resolve({ success, response })));
        }

        it("logs a reason code and the udid only when the write fails", async function () {
            couch.atomicError = Object.assign(new Error("conflict " + DB_ERROR_SENTINEL + " " + OWNER), { statusCode: 409 });
            captureLogs();
            const result = await run({ udid: UDID, status: CHANGE_SENTINEL, owner: OWNER });
            expect(result.success).to.equal(false);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith(UDID), "lines naming the udid").to.be.at.least(1);
            expect(linesWith("device_edit_failed"), "lines with the reason code").to.equal(1);
        });

        it("logs a reason code and the udid only when the device read fails", async function () {
            couch.getError = Object.assign(new Error("read " + DB_ERROR_SENTINEL + " " + OWNER), { statusCode: 500 });
            captureLogs();
            const result = await run({ udid: UDID, status: CHANGE_SENTINEL });
            expect(result.success).to.equal(false);
            expect(result.response.response).to.equal("device_not_found");
            expect(couch.atomics).to.equal(0);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith(UDID), "lines naming the udid").to.be.at.least(1);
        });

        it("logs nothing of the document or changes on success, and still writes", async function () {
            captureLogs();
            const result = await run({ udid: UDID, status: CHANGE_SENTINEL });
            expect(result.success).to.equal(true);
            expect(couch.atomics).to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("does not log the changes when the callback is not a function", function () {
            const device = new Device(redisStub());
            captureLogs();
            device.update_device(UDID, { udid: UDID, status: CHANGE_SENTINEL, owner: OWNER }, null);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(couch.atomics).to.equal(0);
        });

        it("answers no_such_device when the read answers no document", async function () {
            couch.getUndefined = true;
            captureLogs();
            const result = await run({ udid: UDID, status: CHANGE_SENTINEL });
            expect(result.success).to.equal(false);
            expect(result.response.response).to.equal("no_such_device");
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });
    });

    describe("Device#update_device_and_respond (HTTP check-in)", function () {

        it("does not log the device when the write fails", async function () {
            couch.atomicError = Object.assign(new Error("conflict"), { statusCode: 409 });
            const device = new Device(redisStub());
            captureLogs();
            const answer = await new Promise((resolve) => {
                device.update_device_and_respond(UDID, deviceDoc(), (res, success, response) => resolve({ success, response }), {}, {});
            });
            expect(answer.success).to.equal(false);
            expect(answer.response.registration.response).to.equal("device_update_failed");
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith(UDID), "lines naming the udid").to.be.at.least(1);
        });
    });

    describe("Deployment#latestFirmwarePath", function () {

        for (const [label, bad] of BAD_UDIDS) {
            it(`refuses ${label} before any filesystem access`, async function () {
                const deploy = new Deployment();
                const exists = spyOn(fsExtra, "existsSync").and.callThrough();
                const paths = spyOn(Filez, "deployPathForDevice").and.callThrough();
                const extensions = spyOn(deploy, "supportedExtensions").and.callThrough();
                captureLogs();
                const answers = [];
                await new Promise((resolve) => {
                    deploy.latestFirmwarePath(OWNER, bad, (p) => { answers.push(p); setImmediate(resolve); });
                });
                expect(answers).to.deep.equal([false]);
                expect(exists.calls.count(), "fs.existsSync calls").to.equal(0);
                expect(paths.calls.count(), "deploy path built").to.equal(0);
                expect(extensions.calls.count(), "extension lookups").to.equal(0);
                expect(leaked(), "leaked into the log").to.deep.equal([]);
            });
        }

        it("does not log the owner id when the udid is missing", async function () {
            const deploy = new Deployment();
            captureLogs();
            const answer = await new Promise((resolve) => deploy.latestFirmwarePath(OWNER, undefined, resolve));
            expect(answer).to.equal(false);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("logs neither the owner id nor the deploy path when the envelope is missing", async function () {
            const { root, dpath } = tempDeployFolder();
            try {
                const deploy = new Deployment();
                spyOn(Filez, "deployPathForDevice").and.returnValue(dpath);
                captureLogs();
                const answer = await new Promise((resolve) => deploy.latestFirmwarePath(OWNER, UDID, resolve));
                expect(answer).to.equal(false);
                expect(leaked({ deploy_path: dpath }), "leaked into the log").to.deep.equal([]);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });

        it("still finds firmware.bin for a valid udid", async function () {
            const { root, dpath } = tempDeployFolder();
            try {
                fs.writeFileSync(path.join(dpath, "build.json"), JSON.stringify({ platform: "platformio", version: "x:1.0" }));
                fs.writeFileSync(path.join(dpath, "firmware.bin"), Buffer.alloc(2048, 1));
                const deploy = new Deployment();
                const paths = spyOn(Filez, "deployPathForDevice").and.returnValue(dpath);
                captureLogs();
                const answer = await new Promise((resolve) => deploy.latestFirmwarePath(OWNER, UDID, resolve));
                expect(answer).to.equal(path.join(dpath, "firmware.bin"));
                expect(paths.calls.argsFor(0)[1]).to.equal(UDID);
                expect(leaked({ deploy_path: dpath }), "leaked into the log").to.deep.equal([]);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    });

    describe("other Deployment methods that build a path from a udid", function () {

        for (const [label, bad] of BAD_UDIDS) {
            it(`latestFirmwareEnvelope, latestFirmwareArtifact and artifact refuse ${label}`, function () {
                const deploy = new Deployment();
                const exists = spyOn(fsExtra, "existsSync").and.callThrough();
                const paths = spyOn(Filez, "deployPathForDevice").and.callThrough();
                captureLogs();
                expect(deploy.latestFirmwareEnvelope(OWNER, bad)).to.equal(false);
                expect(deploy.latestFirmwareArtifact(OWNER, bad)).to.equal(false);
                expect(deploy.artifact(OWNER, bad, BUILD_ID)).to.equal(null);
                expect(deploy.artifact(OWNER, UDID, bad)).to.equal(null);
                expect(exists.calls.count(), "fs.existsSync calls").to.equal(0);
                expect(paths.calls.count(), "deploy path built").to.equal(0);
                expect(leaked(), "leaked into the log").to.deep.equal([]);
            });
        }

        it("artifact does not log the owner id or the deploy path when nothing is found", function () {
            const { root, dpath } = tempDeployFolder();
            try {
                const deploy = new Deployment();
                spyOn(Filez, "deployPathForDevice").and.returnValue(dpath);
                captureLogs();
                expect(deploy.artifact(OWNER, UDID, BUILD_ID)).to.equal(null);
                expect(leaked({ deploy_path: dpath }), "leaked into the log").to.deep.equal([]);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });

        it("latestFirmwareEnvelope still reads build.json for a valid udid", function () {
            const { root, dpath } = tempDeployFolder();
            try {
                fs.writeFileSync(path.join(dpath, "build.json"), JSON.stringify({ platform: "platformio", version: "x:1.0" }));
                const deploy = new Deployment();
                spyOn(Filez, "deployPathForDevice").and.returnValue(dpath);
                captureLogs();
                expect(deploy.latestFirmwareEnvelope(OWNER, UDID)).to.deep.equal({ platform: "platformio", version: "x:1.0" });
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    });

    describe("Device#update_binary", function () {

        it("does not log the deploy path when the binary is missing", async function () {
            const { root, dpath } = tempDeployFolder();
            try {
                const device = new Device(redisStub());
                captureLogs();
                const answer = await new Promise((resolve) => device.update_binary(path.join(dpath, "firmware.bin"), null, (ok) => resolve(ok)));
                expect(answer).to.equal(false);
                expect(leaked({ deploy_path: dpath }), "leaked into the log").to.deep.equal([]);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });

        it("still serves a binary without logging the deploy path", async function () {
            const { root, dpath } = tempDeployFolder();
            try {
                fs.writeFileSync(path.join(dpath, "firmware.bin"), Buffer.alloc(4096, 1));
                const device = new Device(redisStub());
                captureLogs();
                const answer = await new Promise((resolve) => device.update_binary(path.join(dpath, "firmware.bin"), null, (ok, data) => resolve({ ok, data })));
                expect(answer.ok).to.equal(true);
                expect(answer.data.filesize).to.equal(4096);
                expect(leaked({ deploy_path: dpath }), "leaked into the log").to.deep.equal([]);
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        });
    });

    describe("Device#firmware log lines", function () {

        it("does not log the OTT or the request body when the MAC is missing", async function () {
            const device = new Device(redisStub());
            captureLogs();
            const req = { body: { udid: UDID, owner: OWNER, ott: OTT, api_key: API_KEY, alias: ALIAS_SENTINEL }, headers: { authentication: API_KEY } };
            const answer = await new Promise((resolve) => device.firmware(req, (ok, response) => resolve({ ok, response })));
            expect(answer.ok).to.equal(false);
            expect(answer.response.response).to.equal("missing_mac");
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        for (const forced of [true, false]) {
            it(`does not log the deploy path on the ${forced ? "forced" : "normal"} update path`, async function () {
                const { root, dpath } = tempDeployFolder();
                try {
                    const firmware = path.join(dpath, "firmware.bin");
                    fs.writeFileSync(firmware, Buffer.alloc(4096, 1));
                    const device = new Device(redisStub());
                    device.apikey = { verify: (owner, key, b, cb) => cb(true, "ok") };
                    device.fetchOwned = (udid, owner, cb) => cb(true, { udid: UDID, owner: OWNER, auto_update: true, version: "1.0.0" });
                    spyOn(Deployment.prototype, "initWithDevice").and.returnValue(undefined);
                    spyOn(Deployment.prototype, "latestFirmwareEnvelope").and.returnValue({ mac: "AA:BB:CC:DD:EE:FF", version: "x:1.0" });
                    spyOn(Deployment.prototype, "hasUpdateAvailable").and.returnValue(true);
                    spyOn(Deployment.prototype, "latestFirmwarePath").and.callFake((o, u, cb) => cb(firmware));
                    const served = [];
                    spyOn(device, "updateFromPath").and.callFake((p, ott, cb) => { served.push(p); cb(true, { filesize: 4096 }); });
                    captureLogs();
                    const body = { udid: UDID, owner: OWNER, mac: "AA:BB:CC:DD:EE:FF", alias: ALIAS_SENTINEL };
                    if (forced) body.forced = true;
                    const answer = await new Promise((resolve) => device.firmware({ body, headers: { authentication: API_KEY } }, (ok) => resolve(ok)));
                    expect(answer).to.equal(true);
                    expect(served).to.deep.equal([firmware]);
                    expect(leaked({ deploy_path: dpath }), "leaked into the log").to.deep.equal([]);
                } finally {
                    fs.rmSync(root, { recursive: true, force: true });
                }
            });
        }
    });

    describe("Deployment#hasUpdateAvailable at equal versions", function () {

        function decide(deviceHash, envelopeHash) {
            const deploy = new Deployment();
            spyOn(deploy, "getAvailableVersion").and.returnValue("1.0.0");
            spyOn(deploy, "getAvailableEnvironmentHash").and.returnValue(envelopeHash);
            captureLogs();
            const device = { owner: OWNER, udid: UDID, version: "1.0.0" };
            if (deviceHash !== undefined) device.env_hash = deviceHash;
            return deploy.hasUpdateAvailable(device);
        }

        const DEVICE_HASH = sha256("l8k-device-env");
        const OTHER_HASH = sha256("l8k-envelope-env");

        it("does not re-offer when the envelope has no env_hash (null)", function () {
            expect(decide(DEVICE_HASH, null)).to.equal(false);
        });

        it("does not re-offer when the envelope env_hash is undefined", function () {
            expect(decide(DEVICE_HASH, undefined)).to.equal(false);
        });

        it("does not re-offer when the envelope env_hash is empty", function () {
            expect(decide(DEVICE_HASH, "")).to.equal(false);
        });

        it("does not offer when the device reports no env_hash", function () {
            expect(decide(undefined, OTHER_HASH)).to.equal(false);
            expect(decide(null, OTHER_HASH)).to.equal(false);
            expect(decide("", OTHER_HASH)).to.equal(false);
        });

        it("does not throw or offer for a non-string device env_hash", function () {
            expect(decide(12345, OTHER_HASH)).to.equal(false);
        });

        it("does not offer when both hashes are equal", function () {
            expect(decide(DEVICE_HASH, DEVICE_HASH)).to.equal(false);
        });

        it("offers when both hashes are non-empty strings and differ", function () {
            expect(decide(DEVICE_HASH, OTHER_HASH)).to.equal(true);
        });

        it("keeps the cafebabe default-environment skip", function () {
            expect(decide("cafebabe" + DEVICE_HASH.substring(8), OTHER_HASH)).to.equal(false);
        });

        it("does not log the env hashes", function () {
            decide(DEVICE_HASH, OTHER_HASH);
            expect(leaked({ device_hash: DEVICE_HASH, envelope_hash: OTHER_HASH }), "leaked into the log").to.deep.equal([]);
        });

        it("getAvailableEnvironmentHash does not log the envelope or its hash", function () {
            const deploy = new Deployment();
            spyOn(deploy, "latestFirmwareEnvelope").and.returnValue({ env_hash: OTHER_HASH, owner: OWNER, udid: UDID });
            captureLogs();
            expect(deploy.getAvailableEnvironmentHash(OWNER, UDID)).to.equal(OTHER_HASH);
            expect(leaked({ envelope_hash: OTHER_HASH }), "leaked into the log").to.deep.equal([]);
        });

        it("still offers a newer version regardless of env_hash", function () {
            const deploy = new Deployment();
            spyOn(deploy, "getAvailableVersion").and.returnValue("1.1.0");
            captureLogs();
            expect(deploy.hasUpdateAvailable({ owner: OWNER, udid: UDID, version: "1.0.0" })).to.equal(true);
        });
    });
});
