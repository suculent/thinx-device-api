/*
 * DeviceTransformersSpec — quick 261004-rdf: the API reaches the transformer service, and
 * Device#runDeviceTransformers is safe for every call shape.
 *
 * Runs without Redis, CouchDB or the transformer image. An in-process HTTP server stands in for
 * the transformer service (POST /do, the response shape of services/transformer/transformer.js:
 * `{output, error: "transformer_error"}` outside ENVIRONMENT=test). lib/thinx/couch.js and
 * lib/thinx/audit.js are swapped in require.cache for a scriptable fake database and a no-op
 * audit log, and a fresh copy of lib/thinx/device.js is loaded with TRANSFORMER_URL pointing at
 * the stub. Everything is restored in afterAll, so nothing leaks into other spec files.
 *
 * Pinned behaviour:
 * - Device.transformerTarget(env, config): TRANSFORMER_URL (http/https only) wins; unset and not
 *   ENVIRONMENT=test -> http://transformer:7474; ENVIRONMENT=test -> localhost:<config.lambda>
 *   (7475 when unset); anything else -> null (transformers do not run).
 * - The loaded module posts to TRANSFORMER_URL as read at load time (parsed once).
 * - The request matches the transformer contract: POST /do, JSON `{jobs:[…], device}`, each job
 *   carrying the decoded code and params {status, device}; the device copy never carries lastkey.
 * - Check-in shape (reg present): a transformer result sets device.status and the check-in is
 *   persisted and answered exactly once; a failure or timeout leaves the check-in status
 *   untouched and is still answered exactly once; without transformers nothing is posted.
 * - Null shapes (reg null; callback null as from MQTT, or a function as from run_transformers):
 *   never throw, never write back the document read before the call; a result is patched as
 *   {status} only, and only when the stored status is still the one that was transformed.
 * - A failure logs exactly one "[transformer] not applied" line; no line carries the owner id,
 *   lastkey, transformer code, status values or device fields.
 *
 * Nothing here prints an owner id, key or status; assertions report sentinel names only.
 */

if (typeof (process.env.ENVIRONMENT) === "undefined") {
    process.env.ENVIRONMENT = "development";
}

const http = require("http");
const nodeUtil = require("util");
const expect = require("chai").expect;
const sha256 = require("sha256");
const base64 = require("base-64");

const COUCH_PATH = require.resolve("../../lib/thinx/couch");
const AUDIT_PATH = require.resolve("../../lib/thinx/audit");
const DEVICE_PATH = require.resolve("../../lib/thinx/device");
const SWAPPED = [COUCH_PATH, AUDIT_PATH, DEVICE_PATH];

const OWNER = sha256("rdf-owner@example.com");
const LASTKEY = sha256("rdf-lastkey");
const AES_SENTINEL = "rdf-aes-key-sentinel";
const ALIAS_SENTINEL = "rdf-alias-sentinel";
const STATUS_IN = "rdf-status-in-sentinel";
const STATUS_OUT = "rdf-status-out-sentinel";
const CODE_SENTINEL = "rdf_code_sentinel";
const UDID = "e8c00000-0000-4000-8000-0000000000d1";
const UTID = "rdf-utid-1";
const CODE = `var ${CODE_SENTINEL} = 1; var transformer = function (status, device) { return status; };`;

// name -> value; a log line containing any value fails the spec, reported by name only
const SECRETS = {
    owner: OWNER,
    lastkey: LASTKEY,
    aes_key: AES_SENTINEL,
    alias: ALIAS_SENTINEL,
    status_in: STATUS_IN,
    status_out: STATUS_OUT,
    code: CODE_SENTINEL
};

// ---------------------------------------------------------------------------
// Transformer stub (POST /do)
// ---------------------------------------------------------------------------

const stub = { mode: "ok", output: STATUS_OUT, requests: [], held: [] };

function stubHandler(req, res) {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let body = null;
        try { body = JSON.parse(raw); } catch (e) { body = null; }
        stub.requests.push({ method: req.method, url: req.url, headers: req.headers, raw, body });
        switch (stub.mode) {
            case "ok":
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ output: stub.output, error: "transformer_error" }));
            case "http500":
                res.writeHead(500);
                return res.end("internal");
            case "not_json":
                res.writeHead(200);
                return res.end("<html>" + STATUS_IN + "</html>");
            case "rejected":
                res.writeHead(200);
                return res.end(JSON.stringify({ success: false, error: "missing: device" }));
            case "lambda_missing":
                res.writeHead(200);
                return res.end(JSON.stringify({ output: "lambda function missing", error: "transformer_error" }));
            case "object_output":
                res.writeHead(200);
                return res.end(JSON.stringify({ output: { nested: STATUS_OUT }, error: "transformer_error" }));
            case "reset":
                return req.socket.destroy();
            case "hold":
                stub.held.push(res);
                return;
            default:
                res.writeHead(500);
                return res.end();
        }
    });
}

// ---------------------------------------------------------------------------
// Fake CouchDB
// ---------------------------------------------------------------------------

const couch = { stored: null, atomics: [], gets: 0, atomicError: null, userGet: null };

function later(cb, err, body) {
    setImmediate(() => cb(err, body));
}

const deviceDb = {
    get(id, cb) {
        couch.gets++;
        if (couch.stored === null || id !== couch.stored.udid) return later(cb, Object.assign(new Error("missing"), { statusCode: 404 }));
        return later(cb, null, JSON.parse(JSON.stringify(couch.stored)));
    },
    atomic(design, update, id, changes, cb) {
        couch.atomics.push({ design, update, id, changes: JSON.parse(JSON.stringify(changes)) });
        if (couch.atomicError) return later(cb, couch.atomicError);
        if (couch.stored !== null && id === couch.stored.udid) Object.assign(couch.stored, JSON.parse(JSON.stringify(changes)));
        return later(cb, null, { ok: true });
    }
};

const userDb = {
    get(id) {
        if (typeof (couch.userGet) === "function") return couch.userGet(id);
        return Promise.reject(new Error("not expected"));
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
    if (typeof (name) === "string" && name.endsWith("managed_users")) return userDb;
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
// Fixtures
// ---------------------------------------------------------------------------

function deviceDoc(overrides) {
    return Object.assign({
        _id: UDID,
        _rev: "1-rdfrev",
        udid: UDID,
        owner: OWNER,
        lastkey: LASTKEY,
        aes_key: AES_SENTINEL,
        alias: ALIAS_SENTINEL,
        auto_update: false,
        status: STATUS_IN,
        transformers: [UTID],
        mac: "AA:BB:CC:DD:EE:01"
    }, overrides || {});
}

function profileWith(body) {
    return {
        _id: OWNER,
        info: {
            transformers: [
                { utid: "rdf-utid-other", alias: "other", body: base64.encode("var transformer = function (s) { return 'other'; };") },
                { utid: UTID, alias: "rdf-transformer", body: (typeof (body) === "undefined") ? base64.encode(CODE) : body }
            ]
        }
    };
}

// ---------------------------------------------------------------------------
// Log capture
// ---------------------------------------------------------------------------

let lines = [];

function captureLogs() {
    lines = [];
    if (jasmine.isSpy(console.log)) return;
    const record = (...args) => { lines.push(nodeUtil.format(...args)); };
    spyOn(console, "log").and.callFake(record);
    spyOn(console, "error").and.callFake(record);
    spyOn(console, "warn").and.callFake(record);
    spyOn(console, "info").and.callFake(record);
}

function leaked() {
    const found = [];
    for (const name of Object.keys(SECRETS)) {
        if (lines.some((l) => l.indexOf(SECRETS[name]) !== -1)) found.push(name);
    }
    return found;
}

function linesWith(text) {
    return lines.filter((l) => l.indexOf(text) !== -1).length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Calls run(cb) and collects every callback invocation for `settle` ms after the first one
// (or until `limit` ms pass without any), so a double answer is visible.
async function collect(run, settle = 150, limit = 2500) {
    const calls = [];
    let thrown = null;
    try {
        run((...args) => calls.push(args));
    } catch (e) {
        thrown = e;
    }
    const started = Date.now();
    while (calls.length === 0 && (Date.now() - started) < limit) await sleep(10);
    await sleep(settle);
    return { calls, thrown };
}

// For call shapes without a callback: wait until the fake database or the stub saw activity.
async function quiesce(ms = 400) {
    await sleep(ms);
}

describe("Device transformers (quick 261004-rdf)", function () {

    const saved = {};
    let savedUrl;
    let server;
    let stubUrl;
    let Device;

    beforeAll(async () => {
        server = http.createServer(stubHandler);
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        stubUrl = "http://127.0.0.1:" + server.address().port;

        require(DEVICE_PATH); // bind the real dependency tree first
        for (const p of SWAPPED) saved[p] = require.cache[p];
        require.cache[COUCH_PATH] = { id: COUCH_PATH, filename: COUCH_PATH, loaded: true, exports: fakeCouch };
        require.cache[AUDIT_PATH] = { id: AUDIT_PATH, filename: AUDIT_PATH, loaded: true, exports: AuditStub };
        savedUrl = process.env.TRANSFORMER_URL;
        process.env.TRANSFORMER_URL = stubUrl;
        delete require.cache[DEVICE_PATH];
        Device = require(DEVICE_PATH);
        // parsed once: a later change must not move the target
        process.env.TRANSFORMER_URL = "http://127.0.0.1:1";
    });

    afterAll(async () => {
        if (typeof (savedUrl) === "undefined") delete process.env.TRANSFORMER_URL; else process.env.TRANSFORMER_URL = savedUrl;
        for (const p of SWAPPED) {
            if (saved[p]) require.cache[p] = saved[p]; else delete require.cache[p];
        }
        for (const res of stub.held) { try { res.destroy(); } catch (e) { /* closed */ } }
        if (typeof (server.closeAllConnections) === "function") server.closeAllConnections();
        await new Promise((resolve) => server.close(() => resolve()));
    });

    let savedTimeout;

    beforeEach(() => {
        stub.mode = "ok";
        stub.output = STATUS_OUT;
        stub.requests = [];
        couch.stored = deviceDoc();
        couch.atomics = [];
        couch.gets = 0;
        couch.atomicError = null;
        couch.userGet = null;
        savedTimeout = Device.transformerTimeoutMs;
    });

    afterEach(() => {
        Device.transformerTimeoutMs = savedTimeout;
        for (const res of stub.held) { try { res.destroy(); } catch (e) { /* closed */ } }
        stub.held = [];
    });

    // -----------------------------------------------------------------------
    describe("target", function () {

        it("defaults to http://transformer:7474 when TRANSFORMER_URL is unset outside test", function () {
            expect(typeof (Device.transformerTarget), "Device.transformerTarget").to.equal("function");
            for (const env of [{}, { ENVIRONMENT: "production" }, { ENVIRONMENT: "development" }, { TRANSFORMER_URL: "  " }]) {
                const t = Device.transformerTarget(env, { lambda: 7475 });
                expect(t).to.deep.equal({ protocol: "http:", hostname: "transformer", port: 7474, path: "/do" });
            }
        });

        it("keeps the local target under ENVIRONMENT=test", function () {
            expect(Device.transformerTarget({ ENVIRONMENT: "test" }, { lambda: 7474 }))
                .to.deep.equal({ protocol: "http:", hostname: "localhost", port: 7474, path: "/do" });
            expect(Device.transformerTarget({ ENVIRONMENT: "test" }, {}))
                .to.deep.equal({ protocol: "http:", hostname: "localhost", port: 7475, path: "/do" });
        });

        it("takes TRANSFORMER_URL (http or https) over everything else", function () {
            expect(Device.transformerTarget({ TRANSFORMER_URL: "http://transformer:7474", ENVIRONMENT: "test" }, { lambda: 7475 }))
                .to.deep.equal({ protocol: "http:", hostname: "transformer", port: 7474, path: "/do" });
            expect(Device.transformerTarget({ TRANSFORMER_URL: "https://lambda.internal/base/" }, {}))
                .to.deep.equal({ protocol: "https:", hostname: "lambda.internal", port: undefined, path: "/base/do" });
            expect(Device.transformerTarget({ TRANSFORMER_URL: "http://[::1]:9000" }, {}))
                .to.deep.equal({ protocol: "http:", hostname: "::1", port: 9000, path: "/do" });
        });

        it("refuses anything that is not an http(s) URL", function () {
            for (const bad of ["ftp://transformer:7474", "file:///etc/passwd", "javascript:alert(1)", "not a url", "transformer:7474", "http://user:pw@transformer:7474"]) {
                expect(Device.transformerTarget({ TRANSFORMER_URL: bad }, {}), bad.slice(0, 6)).to.equal(null);
            }
        });

        it("posts POST /do to TRANSFORMER_URL as read at load time", async function () {
            captureLogs();
            const device = new Device(redisStub());
            const doc = deviceDoc();
            await collect((cb) => device.runDeviceTransformers(profileWith(), doc, cb, { udid: UDID, status: STATUS_IN }, {}));
            expect(stub.requests.length, "requests reaching the stub").to.equal(1);
            expect(stub.requests[0].method).to.equal("POST");
            expect(stub.requests[0].url).to.equal("/do");
        });
    });

    // -----------------------------------------------------------------------
    describe("request contract", function () {

        it("sends {jobs, device} with the decoded code and params.status; no lastkey", async function () {
            captureLogs();
            const device = new Device(redisStub());
            await collect((cb) => device.runDeviceTransformers(profileWith(), deviceDoc(), cb, { udid: UDID, status: STATUS_IN }, {}));
            expect(stub.requests.length).to.equal(1);
            const body = stub.requests[0].body;
            expect(body, "JSON body").to.be.an("object");
            expect(stub.requests[0].headers["content-type"]).to.match(/application\/json/);
            expect(body.device, "top-level device (transformer answers 'missing: device' without it)").to.not.equal(undefined);
            expect(body.jobs).to.be.an("array").with.length(1);
            expect(body.jobs[0].code).to.equal(CODE);
            expect(body.jobs[0].params.status).to.equal(STATUS_IN);
            expect(body.jobs[0].params.device.udid).to.equal(UDID);
            expect(stub.requests[0].raw.indexOf(LASTKEY), "lastkey in the request").to.equal(-1);
        });
    });

    // -----------------------------------------------------------------------
    describe("check-in shape (reg present)", function () {

        it("applies the transformer result to status and answers once", async function () {
            captureLogs();
            const device = new Device(redisStub());
            const r = await collect((cb) => device.runDeviceTransformers(profileWith(), deviceDoc(), cb, { udid: UDID, status: STATUS_IN }, {}));
            expect(r.thrown).to.equal(null);
            expect(r.calls.length, "answers").to.equal(1);
            expect(r.calls[0][1]).to.equal(true);
            expect(couch.atomics.length, "writes").to.equal(1);
            expect(couch.atomics[0].changes.status).to.equal(STATUS_OUT);
            expect(couch.atomics[0].changes.lastkey, "check-in still persists the device").to.equal(LASTKEY);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
            expect(linesWith("[transformer] not applied")).to.equal(0);
        });

        it("posts nothing and persists the check-in once without transformers", async function () {
            for (const transformers of [[], undefined, null]) {
                stub.requests = [];
                couch.atomics = [];
                captureLogs();
                const device = new Device(redisStub());
                const doc = deviceDoc({ transformers });
                const r = await collect((cb) => device.runDeviceTransformers(profileWith(), doc, cb, { udid: UDID, status: STATUS_IN }, {}));
                expect(r.thrown).to.equal(null);
                expect(r.calls.length, "answers").to.equal(1);
                expect(r.calls[0][1]).to.equal(true);
                expect(stub.requests.length, "requests").to.equal(0);
                expect(couch.atomics.length, "writes").to.equal(1);
                expect(couch.atomics[0].changes.status).to.equal(STATUS_IN);
            }
        });

        const FAILURES = [
            ["connection reset", "reset", "transformer_unreachable"],
            ["HTTP 500", "http500", "transformer_http_error"],
            ["a non-JSON body", "not_json", "transformer_bad_response"],
            ["a 'missing: device' rejection", "rejected", "transformer_rejected"],
            ["'lambda function missing'", "lambda_missing", "transformer_rejected"],
            ["an object output", "object_output", "transformer_output_invalid"]
        ];

        for (const [label, mode, reason] of FAILURES) {
            it(`leaves status untouched on ${label}, answers once, logs one reason line`, async function () {
                stub.mode = mode;
                captureLogs();
                const device = new Device(redisStub());
                const r = await collect((cb) => device.runDeviceTransformers(profileWith(), deviceDoc(), cb, { udid: UDID, status: STATUS_IN }, {}));
                expect(r.thrown).to.equal(null);
                expect(r.calls.length, "answers").to.equal(1);
                expect(r.calls[0][1]).to.equal(true);
                expect(couch.atomics.length, "writes").to.equal(1);
                expect(couch.atomics[0].changes.status).to.equal(STATUS_IN);
                expect(couch.atomics[0].changes.status_error, "no status_error written").to.equal(undefined);
                expect(couch.atomics[0].changes.status_raw, "no status_raw written").to.equal(undefined);
                expect(linesWith("[transformer] not applied"), "reason lines").to.equal(1);
                expect(linesWith(reason), "lines with the reason code").to.equal(1);
                expect(leaked(), "leaked into the log").to.deep.equal([]);
            });
        }

        it("times out, leaves status untouched, answers once", async function () {
            stub.mode = "hold";
            Device.transformerTimeoutMs = 200;
            captureLogs();
            const device = new Device(redisStub());
            const r = await collect((cb) => device.runDeviceTransformers(profileWith(), deviceDoc(), cb, { udid: UDID, status: STATUS_IN }, {}), 300, 2000);
            expect(r.calls.length, "answers").to.equal(1);
            expect(couch.atomics.length, "writes").to.equal(1);
            expect(couch.atomics[0].changes.status).to.equal(STATUS_IN);
            expect(linesWith("[transformer] not applied"), "reason lines").to.equal(1);
            expect(linesWith("transformer_timeout")).to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("answers once when the transformer body does not decode, and posts nothing", async function () {
            captureLogs();
            const device = new Device(redisStub());
            const r = await collect((cb) => device.runDeviceTransformers(profileWith("%%% not base64 %%%"), deviceDoc(), cb, { udid: UDID, status: STATUS_IN }, {}));
            expect(r.thrown).to.equal(null);
            expect(r.calls.length, "answers").to.equal(1);
            expect(stub.requests.length).to.equal(0);
            expect(couch.atomics.length).to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("answers once when the owner profile is missing", async function () {
            for (const profile of [undefined, null, false, "error", {}, { info: {} }]) {
                couch.atomics = [];
                captureLogs();
                const device = new Device(redisStub());
                const r = await collect((cb) => device.runDeviceTransformers(profile, deviceDoc(), cb, { udid: UDID, status: STATUS_IN }, {}));
                expect(r.thrown, "thrown").to.equal(null);
                expect(r.calls.length, "answers").to.equal(1);
                expect(couch.atomics.length).to.equal(1);
            }
        });
    });

    // -----------------------------------------------------------------------
    describe("null shapes (reg null)", function () {

        it("MQTT shape: no throw, patches {status} only", async function () {
            captureLogs();
            const device = new Device(redisStub());
            expect(() => device.runDeviceTransformers(profileWith(), deviceDoc(), null, null, null)).to.not.throw();
            await quiesce();
            expect(stub.requests.length).to.equal(1);
            expect(couch.atomics.length, "writes").to.equal(1);
            expect(couch.atomics[0].changes).to.deep.equal({ status: STATUS_OUT });
            expect(couch.stored.status).to.equal(STATUS_OUT);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("MQTT shape without transformers writes nothing back", async function () {
            for (const transformers of [[], undefined, null]) {
                couch.atomics = [];
                captureLogs();
                const device = new Device(redisStub());
                expect(() => device.runDeviceTransformers(profileWith(), deviceDoc({ transformers }), null, null, null)).to.not.throw();
                await quiesce(150);
                expect(couch.atomics.length, "writes").to.equal(0);
            }
        });

        it("MQTT shape: failure writes nothing, no throw, one reason line", async function () {
            for (const mode of ["reset", "http500", "lambda_missing"]) {
                stub.mode = mode;
                couch.atomics = [];
                captureLogs();
                const device = new Device(redisStub());
                expect(() => device.runDeviceTransformers(profileWith(), deviceDoc(), null, null, null)).to.not.throw();
                await quiesce();
                expect(couch.atomics.length, "writes").to.equal(0);
                expect(linesWith("[transformer] not applied"), "reason lines").to.equal(1);
                expect(leaked(), "leaked into the log").to.deep.equal([]);
            }
        });

        it("keeps a concurrent edit: only status is written", async function () {
            captureLogs();
            const device = new Device(redisStub());
            const read = deviceDoc();
            couch.stored.alias = "rdf-concurrent-alias";
            couch.stored.description = "rdf-concurrent";
            device.runDeviceTransformers(profileWith(), read, null, null, null);
            await quiesce();
            expect(couch.atomics.length).to.equal(1);
            expect(couch.atomics[0].changes).to.deep.equal({ status: STATUS_OUT });
            expect(couch.stored.alias).to.equal("rdf-concurrent-alias");
            expect(couch.stored.description).to.equal("rdf-concurrent");
        });

        it("does not overwrite a status that changed while the transformer ran", async function () {
            stub.mode = "hold";
            captureLogs();
            const device = new Device(redisStub());
            device.runDeviceTransformers(profileWith(), deviceDoc(), null, null, null);
            const started = Date.now();
            while (stub.held.length === 0 && Date.now() - started < 2000) await sleep(10);
            expect(stub.held.length, "held requests").to.equal(1);
            couch.stored.status = "rdf-newer-status";
            const res = stub.held.shift();
            res.writeHead(200);
            res.end(JSON.stringify({ output: STATUS_OUT, error: "transformer_error" }));
            await quiesce();
            expect(couch.atomics.length, "writes").to.equal(0);
            expect(couch.stored.status).to.equal("rdf-newer-status");
            expect(linesWith("[transformer] not applied"), "reason lines").to.equal(1);
            expect(linesWith("status_changed")).to.equal(1);
        });

        it("run_transformers shape without transformers answers once and writes nothing", async function () {
            captureLogs();
            const device = new Device(redisStub());
            const r = await collect((cb) => device.runDeviceTransformers(profileWith(), deviceDoc({ transformers: [] }), cb, null, {}));
            expect(r.thrown).to.equal(null);
            expect(r.calls.length, "answers").to.equal(1);
            expect(r.calls[0][1]).to.equal(true);
            expect(couch.atomics.length, "writes").to.equal(0);
        });

        it("run_transformers shape: failure answers false once and writes nothing", async function () {
            stub.mode = "http500";
            captureLogs();
            const device = new Device(redisStub());
            const r = await collect((cb) => device.runDeviceTransformers(profileWith(), deviceDoc(), cb, null, {}));
            expect(r.thrown).to.equal(null);
            expect(r.calls.length, "answers").to.equal(1);
            expect(r.calls[0][1]).to.equal(false);
            expect(couch.atomics.length, "writes").to.equal(0);
            expect(linesWith("[transformer] not applied")).to.equal(1);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });
    });

    // -----------------------------------------------------------------------
    describe("Device#run_transformers (POST /api/transformer/run)", function () {

        it("transforms the owner's device and patches status only", async function () {
            couch.userGet = () => Promise.resolve(profileWith());
            captureLogs();
            const device = new Device(redisStub());
            const r = await collect((cb) => device.run_transformers(UDID, OWNER, cb, {}));
            expect(r.calls.length, "answers").to.equal(1);
            expect(r.calls[0][1]).to.equal(true);
            expect(couch.atomics.length).to.equal(1);
            expect(couch.atomics[0].changes).to.deep.equal({ status: STATUS_OUT });
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });

        it("answers once when the owner profile cannot be read", async function () {
            couch.userGet = () => Promise.reject(Object.assign(new Error("read " + OWNER), { statusCode: 500 }));
            captureLogs();
            const device = new Device(redisStub());
            const r = await collect((cb) => device.run_transformers(UDID, OWNER, cb, {}));
            expect(r.calls.length, "answers").to.equal(1);
            expect(r.calls[0][1]).to.equal(false);
            expect(couch.atomics.length).to.equal(0);
            expect(leaked(), "leaked into the log").to.deep.equal([]);
        });
    });
});
