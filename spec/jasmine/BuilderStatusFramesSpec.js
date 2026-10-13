/*
 * Build Status frames reach the build owner's console sockets (Phase 43, NOTIF-03).
 *
 * Pins:
 * - every Build Status frame the builder sends goes through Messenger#sendToOwner, to the owner
 *   Builder#run_build binds from the build request (br.owner) with Builder#consoleNotifiers; an
 *   owner supplied by the caller in `notifiers` is ignored (D-09, F-5);
 * - the build route hands the builder `{ messenger: app.messenger }` and nothing else, and the
 *   queue does the same for queued builds (D-09, D-12);
 * - the frame shape is unchanged: `{"notification":{"title":"Build Status","body":...}}` with
 *   type, udid and build_id (D-11);
 * - frame rules F-1..F-4 of 43-UI-SPEC (one terminal frame per build_id, failures never green,
 *   build_id on Completed, no raw log lines);
 * - owner B's sockets never receive a frame of owner A's build.
 *
 * Runs without Redis, CouchDB or a worker: a real Builder with in-memory devicelib stand-ins, a
 * real Messenger built with Object.create(Messenger.prototype), and fake sockets subscribed through
 * Messenger#subscribeSocket. The build log and the stats sink are spied. Run it helper-free:
 *
 *   printf '%s' '{"spec_dir":"spec/jasmine","helpers":[],"random":false}' > "${TMPDIR:-/tmp}/p43-jasmine.json"
 *   ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config="${TMPDIR:-/tmp}/p43-jasmine.json" spec/jasmine/BuilderStatusFramesSpec.js
 *
 * Failures report counts, bodies and types only.
 */

if (typeof process.env.ENVIRONMENT === "undefined") process.env.ENVIRONMENT = "development";

const expect = require("chai").expect;
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const childProcess = require("child_process");

const Builder = require("../../lib/thinx/builder");
const BuildLog = require("../../lib/thinx/buildlog");
const InfluxConnector = require("../../lib/thinx/influx");
const Messenger = require("../../lib/thinx/messenger");
const Queue = require("../../lib/thinx/queue");
const { _resetCacheForTests } = require("../../lib/thinx/secrets");
const envi = require("../_envi.json");

const BUILDER_PATH = path.join(__dirname, "../../lib/thinx/builder.js");
const ROUTER_PATH = path.join(__dirname, "../../lib/router.build.js");

const OWNER_A = "a1".repeat(32);
const OWNER_B = "b2".repeat(32);
const OWNER_C = "c3".repeat(32);

const UDID = envi.udid;
const SOURCE = envi.sid;
const GIT = "https://github.com/suculent/thinx-firmware-esp8266-pio.git";

const BUILD_X = "43020000-1111-11f0-9d4a-0b5e6f7a8c9d";
const BUILD_Y = "43020000-2222-11f0-9d4a-0b5e6f7a8c9d";

const FRAME_PREFIX = "{\"notification\":{\"title\":\"Build Status\",\"body\":";

const fakeRedis = {
    get(k, cb) { if (typeof cb === "function") cb(null, null); },
    set(...a) { const cb = a[a.length - 1]; if (typeof cb === "function") cb(null, "OK"); }
};

// Comment lines are ignored the way MessengerOwnerSocketSpec's codeLines does.
function codeLines(src) {
    return src.split("\n").filter((line) => {
        const t = line.trim();
        return !(t.indexOf("//") === 0 || t.indexOf("*") === 0 || t.indexOf("/*") === 0);
    });
}

class FakeSocket extends EventEmitter {
    constructor(owner) {
        super();
        this.owner = owner;
        this.readyState = 1;
        this.sent = [];
    }
    send(d) {
        if (this.readyState !== 1) throw new Error("p43 fake socket not open");
        this.sent.push(String(d));
    }
    close() {
        this.readyState = 3;
        this.emit("close");
    }
}

function frames(sock) {
    return sock.sent.map((s) => JSON.parse(s).notification);
}

function bodies(sock) {
    return frames(sock).map((f) => f.body);
}

function framesFor(sock, build_id) {
    return frames(sock).filter((f) => f.build_id === build_id);
}

// A real Messenger without its constructor (MQTT, Redis, Slack): only the console
// subscriptions and sendToOwner are used here.
function makeMessenger() {
    return Object.create(Messenger.prototype);
}

function subscribe(m, owner) {
    const sock = new FakeSocket(owner);
    expect(m.subscribeSocket(owner, sock), "subscribeSocket").to.equal(true);
    return sock;
}

// A Builder whose devicelib returns `device` and whose buildPathFor is `buildPathFor`:
// run_build reaches the D-12 invalid_device refusal without touching the filesystem.
function refusingBuilder(device, buildPathFor) {
    const builder = new Builder(fakeRedis);
    builder.devicelib = { get: (udid, cb) => cb(null, device) };
    builder.buildPathFor = buildPathFor;
    return builder;
}

function buildRequest(owner, worker, build_id) {
    return {
        build_id: build_id || BUILD_X,
        owner: owner,
        git: GIT,
        branch: "main",
        udid: UDID,
        source_id: SOURCE,
        worker: worker || { running: true, socket: { connected: true, on() { }, emit() { } } }
    };
}

function fakeResponse() {
    const res = { body: [], header() { }, status() { return res; }, end(b) { res.body.push(b); return res; } };
    return res;
}

// The real build route (lib/router.build.js) with an idle worker and `build` as app.builder.build.
function buildRoute(messenger, build) {
    const routes = {};
    const queue = Object.create(Queue.prototype);
    queue.workers = { w1: { connected: true, running: false, socket: { connected: true, on() { }, emit() { } } } };
    const app = { post: (r, fn) => { routes[r] = fn; }, queue: queue, messenger: messenger, builder: { build: build } };
    require("../../lib/router.build")(app);
    return { route: routes["/api/v2/build"], app: app };
}

function routeRequest(owner) {
    return {
        headers: {},
        session: { owner: owner },
        body: { build: { udid: UDID, source_id: SOURCE } }
    };
}

describe("BuilderStatusFramesSpec (Phase 43, NOTIF-03)", function () {

    let savedSecret;

    beforeEach(function () {
        spyOn(BuildLog.prototype, "state").and.callFake(() => { });
        spyOn(BuildLog.prototype, "log").and.callFake(() => { });
        spyOn(InfluxConnector, "statsLog").and.callFake(() => { });
        savedSecret = process.env.WORKER_SECRET;
        process.env.WORKER_SECRET = "p43-spec-worker-secret";
        _resetCacheForTests();
    });

    afterEach(function () {
        if (typeof savedSecret === "undefined") {
            delete process.env.WORKER_SECRET;
        } else {
            process.env.WORKER_SECRET = savedSecret;
        }
        _resetCacheForTests();
    });

    describe("owner-bound delivery (D-09, D-11, F-5)", function () {

        it("T1 a refusal inside run_build, started through the build route, reaches both of the owner's sockets and no other owner's", function () {
            const m = makeMessenger();
            const a1 = subscribe(m, OWNER_A);
            const a2 = subscribe(m, OWNER_A);
            const b1 = subscribe(m, OWNER_B);
            const builder = refusingBuilder({ udid: UDID, owner: OWNER_A }, () => null);
            const calls = [];
            const { route } = buildRoute(m, (owner, safe_build, notifiers, callback, worker) => {
                builder.run_build(buildRequest(owner, worker), notifiers, (success, response) => {
                    calls.push([success, response]);
                    callback(success, response);
                });
            });

            route(routeRequest(OWNER_A), fakeResponse());

            expect(calls).to.deep.equal([[false, "invalid_device"]]);
            const expected = { title: "Build Status", body: "invalid_device", type: "error", udid: UDID, build_id: BUILD_X };
            for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                expect(sock.sent.length, name + " frame count").to.equal(1);
                expect(sock.sent[0].indexOf(FRAME_PREFIX), name + " frame prefix").to.equal(0);
                expect(frames(sock)[0], name + " frame").to.deep.equal(expected);
            }
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        it("T2 the build route hands the builder { messenger: app.messenger } and no websocket field", function () {
            const m = makeMessenger();
            const seen = [];
            const { route, app } = buildRoute(m, (owner, safe_build, notifiers, callback) => {
                seen.push(notifiers);
                callback(false, "p43_spec_stop");
            });

            route(routeRequest(OWNER_A), fakeResponse());

            expect(seen.length).to.equal(1);
            expect(seen[0].messenger === app.messenger, "messenger is app.messenger").to.equal(true);
            expect(Object.prototype.hasOwnProperty.call(seen[0], "websocket"), "websocket field").to.equal(false);
            expect(Object.keys(seen[0])).to.deep.equal(["messenger"]);
        });

        it("T3 an owner supplied by the caller in notifiers is ignored: run_build binds the request owner", function () {
            const m = makeMessenger();
            const a1 = subscribe(m, OWNER_A);
            const a2 = subscribe(m, OWNER_A);
            const b1 = subscribe(m, OWNER_B);
            const builder = refusingBuilder({ udid: UDID, owner: OWNER_A }, () => null);
            const calls = [];

            builder.run_build(buildRequest(OWNER_A), { messenger: m, owner: OWNER_B }, (s, r) => calls.push([s, r]));

            expect(calls).to.deep.equal([[false, "invalid_device"]]);
            expect(bodies(a1)).to.deep.equal(["invalid_device"]);
            expect(bodies(a2)).to.deep.equal(["invalid_device"]);
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        it("T4 notify with unusable notifiers sends nothing and does not throw", function () {
            const m = makeMessenger();
            const a1 = subscribe(m, OWNER_A);
            const builder = new Builder(fakeRedis);
            spyOn(m, "sendToOwner").and.callThrough();

            for (const notifiers of [[], {}, { messenger: null }, { messenger: m }, null, undefined]) {
                expect(() => builder.notify(UDID, BUILD_X, notifiers, "Building...", true)).to.not.throw();
            }
            expect(m.sendToOwner.calls.count(), "sendToOwner calls").to.equal(0);
            expect(a1.sent.length, "A1 frame count").to.equal(0);
        });

        it("T4b an owner with no subscribed sockets costs nothing: sendToOwner returns 0 and nothing throws", function () {
            const m = makeMessenger();
            const a1 = subscribe(m, OWNER_A);
            const builder = new Builder(fakeRedis);
            spyOn(m, "sendToOwner").and.callThrough();
            const bound = builder.consoleNotifiers({ messenger: m }, OWNER_C);

            expect(() => builder.notify(UDID, BUILD_X, bound, "Building...", true)).to.not.throw();

            expect(m.sendToOwner.calls.count(), "sendToOwner calls").to.equal(1);
            expect(m.sendToOwner.calls.mostRecent().args[0] === OWNER_C, "sent to owner C").to.equal(true);
            expect(m.sendToOwner.calls.mostRecent().returnValue).to.equal(0);
            expect(a1.sent.length, "A1 frame count").to.equal(0);
        });

        it("T5 consoleNotifiers returns a new { messenger, owner } and ignores the caller's owner", function () {
            const m = makeMessenger();
            const builder = new Builder(fakeRedis);
            const callerNotifiers = { messenger: m, owner: OWNER_B, websocket: {} };

            const bound = builder.consoleNotifiers(callerNotifiers, OWNER_A);
            expect(bound === callerNotifiers, "same object").to.equal(false);
            expect(Object.keys(bound).sort()).to.deep.equal(["messenger", "owner"]);
            expect(bound.messenger === m, "messenger kept").to.equal(true);
            expect(bound.owner === OWNER_A, "owner bound").to.equal(true);

            expect(builder.consoleNotifiers(callerNotifiers, "").owner).to.equal(null);
            expect(builder.consoleNotifiers(callerNotifiers, undefined).owner).to.equal(null);
            for (const notifiers of [[], {}, null, undefined, { messenger: null }, { messenger: {} }]) {
                expect(builder.consoleNotifiers(notifiers, OWNER_A).messenger).to.equal(null);
            }
        });

        it("S1 the build route keeps no per-app sockets map; the builder delivers through sendToOwner", function () {
            const router = codeLines(fs.readFileSync(ROUTER_PATH, "utf8")).join("\n");
            const builder = codeLines(fs.readFileSync(BUILDER_PATH, "utf8")).join("\n");
            expect(router.indexOf("existing_sockets"), "existing_sockets in router.build.js").to.equal(-1);
            expect(router.indexOf("messenger: app.messenger") !== -1, "messenger: app.messenger in router.build.js").to.equal(true);
            expect(builder.indexOf("sendToOwner(") !== -1, "sendToOwner( in builder.js").to.equal(true);
        });
    });

    // 43-UI-SPEC "Build Status frame rules": F-1 one terminal frame per build, F-2 failure is
    // never green, F-3 the terminal frame carries build_id, F-4 no log lines on the socket.
    describe("frame rules F-1..F-4 (D-10, D-11)", function () {

        const STATUS_OK_LINE = "[builder] THiNX build status: OK\n";

        let m, a1, a2, b1, builder, bound;

        beforeEach(function () {
            m = makeMessenger();
            a1 = subscribe(m, OWNER_A);
            a2 = subscribe(m, OWNER_A);
            b1 = subscribe(m, OWNER_B);
            builder = new Builder(fakeRedis);
            // The success path updates the source's last build and prunes old checkouts.
            builder.sources = { update() { } };
            builder.cleanupDeviceRepositories = () => { };
            bound = builder.consoleNotifiers({ messenger: m }, OWNER_A);
        });

        function shellOpts(build_id) {
            return { owner: OWNER_A, build_id: build_id, udid: UDID, source_id: SOURCE, version: "1.0", notifiers: bound };
        }

        function exitOK(build_id) {
            builder.processExitData(OWNER_A, build_id, UDID, bound, { status: "OK", completed: true, build_id: build_id });
        }

        function expectNoOkBody() {
            for (const [name, sock] of [["A1", a1], ["A2", a2], ["B1", b1]]) {
                expect(bodies(sock).indexOf("OK"), name + " has an OK frame").to.equal(-1);
            }
        }

        function expectSingleCompleted(sock, name, build_id) {
            const own = framesFor(sock, build_id);
            expect(own.map((f) => f.body), name + " bodies").to.deep.equal(["Completed"]);
            expect(own[0].type, name + " type").to.equal("success");
            expect(own[0].build_id, name + " build_id").to.equal(build_id);
        }

        // A worker socket that records its listeners, so a spec can deliver job-status itself.
        function recordingWorker() {
            const listeners = {};
            const socket = {
                connected: true,
                emitted: [],
                emit(event, payload) { this.emitted.push([event, payload]); },
                on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
                off(event, fn) { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); }
            };
            return { worker: { connected: true, running: false, socket: socket }, listeners: listeners };
        }

        it("F1a the status: OK log line then the worker's OK job-status give exactly one Completed (success, with build_id); no OK frame", function () {
            builder.processShellData(shellOpts(BUILD_X), STATUS_OK_LINE);
            exitOK(BUILD_X);

            expectSingleCompleted(a1, "A1", BUILD_X);
            expectSingleCompleted(a2, "A2", BUILD_X);
            expect(a1.sent.length, "A1 frame count").to.equal(1);
            expect(b1.sent.length, "B1 frame count").to.equal(0);
            expectNoOkBody();
        });

        it("F1b the reverse order, with the log line repeated, still gives one Completed per socket", function () {
            exitOK(BUILD_X);
            builder.processShellData(shellOpts(BUILD_X), STATUS_OK_LINE);
            builder.processShellData(shellOpts(BUILD_X), STATUS_OK_LINE);

            expectSingleCompleted(a1, "A1", BUILD_X);
            expectSingleCompleted(a2, "A2", BUILD_X);
            expect(b1.sent.length, "B1 frame count").to.equal(0);
            expectNoOkBody();
        });

        it("F1c a full successful build shows Pulling repository, Building..., Completed, all success with one build_id", function () {
            builder.notify(UDID, BUILD_X, bound, "Pulling repository", true);
            builder.notify(UDID, BUILD_X, bound, "Building...", true);
            builder.processShellData(shellOpts(BUILD_X), STATUS_OK_LINE);
            exitOK(BUILD_X);

            for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                expect(bodies(sock), name + " bodies").to.deep.equal(["Pulling repository", "Building...", "Completed"]);
                expect(frames(sock).map((f) => f.type), name + " types").to.deep.equal(["success", "success", "success"]);
                expect(frames(sock).every((f) => f.build_id === BUILD_X), name + " build_id").to.equal(true);
            }
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        it("F2a a failed exit status gives one error frame with its reason and nothing green after it", function () {
            builder.processExitData(OWNER_A, BUILD_X, UDID, bound, { status: "Failed", build_id: BUILD_X });
            builder.processShellData(shellOpts(BUILD_X), STATUS_OK_LINE);
            exitOK(BUILD_X);

            for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                expect(bodies(sock), name + " bodies").to.deep.equal(["Failed"]);
                expect(frames(sock)[0].type, name + " type").to.equal("error");
                expect(frames(sock)[0].build_id, name + " build_id").to.equal(BUILD_X);
            }
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        it("F2a' a worker's own non-OK status string is the reason of the error frame", function () {
            builder.processExitData(OWNER_A, BUILD_X, UDID, bound, { status: "BUILD FAILED", completed: true, build_id: BUILD_X });

            expect(bodies(a1)).to.deep.equal(["BUILD FAILED"]);
            expect(frames(a1)[0].type).to.equal("error");
        });

        it("F2b an exit code, a null payload and a spawn error each give one error frame Failed and never throw", function () {
            const BUILD_Z = "43020000-3333-11f0-9d4a-0b5e6f7a8c9d";
            const cases = [[BUILD_X, 2], [BUILD_Y, null], [BUILD_Z, "spawn ENOENT"]];
            for (const [build_id, payload] of cases) {
                expect(() => builder.processExitData(OWNER_A, build_id, UDID, bound, payload), "payload " + typeof payload).to.not.throw();
            }
            for (const [build_id] of cases) {
                const own = framesFor(a1, build_id);
                expect(own.map((f) => f.body), build_id + " bodies").to.deep.equal(["Failed"]);
                expect(own[0].type, build_id + " type").to.equal("error");
            }
            expect(a1.sent.length, "A1 frame count").to.equal(3);
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        it("F2c the remote-worker guard frame is type error", function () {
            const worker = { connected: false, running: true, socket: { connected: false, on() { }, emit() { } } };

            const emitted = builder.runRemoteShell(worker, ["--dry-run"], OWNER_A, BUILD_X, UDID, bound, SOURCE);

            expect(emitted).to.equal(false);
            for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                expect(bodies(sock), name + " bodies").to.deep.equal(["ERROR: worker needs a connected socket for remote builds"]);
                expect(frames(sock)[0].type, name + " type").to.equal("error");
            }
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        it("F2d a worker refusal (worker_busy, no onRefused) gives one error frame worker_busy, not a second Failed", function () {
            const { worker, listeners } = recordingWorker();
            expect(builder.runRemoteShell(worker, ["--dry-run"], OWNER_A, BUILD_X, UDID, bound, SOURCE)).to.equal(true);
            expect((listeners["job-status"] || []).length, "job-status listeners").to.equal(1);

            listeners["job-status"][0]({ status: "Failed", details: "worker_busy", build_id: BUILD_X });

            for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                expect(bodies(sock), name + " bodies").to.deep.equal(["worker_busy"]);
                expect(frames(sock)[0].type, name + " type").to.equal("error");
            }
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        // WR-02: build output is the repository's own stdout. A line that merely contains
        // "status: OK" (or even forges the builder's own line) must not decide the outcome:
        // the worker's job-status does, for remote builds.
        it("F2e (WR-02) remote: status: OK lines in the build output, then a FAILED job-status, give one error frame and no Completed; the build log is never Success", function () {
            const updates = spyOn(builder.sources, "update");
            builder.processShellData(shellOpts(BUILD_X), "Upload status: OK\n");
            builder.processShellData(shellOpts(BUILD_X), "lib: STATUS OK\n[builder] Build Stage completed with status: OK\n");
            builder.processExitData(OWNER_A, BUILD_X, UDID, bound, { status: "FAILED", completed: true, build_id: BUILD_X });

            for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                expect(bodies(sock), name + " bodies").to.deep.equal(["FAILED"]);
                expect(frames(sock)[0].type, name + " type").to.equal("error");
            }
            expect(b1.sent.length, "B1 frame count").to.equal(0);
            const states = BuildLog.prototype.state.calls.allArgs().map((a) => a[3]);
            expect(states, "build log states").to.deep.equal(["FAILED"]);
            expect(updates.calls.count(), "sources.update calls").to.equal(0);
        });

        it("F1d (WR-02) remote: the worker's OK job-status alone sets the build log to Success and records the source's last build", function () {
            const updates = spyOn(builder.sources, "update");
            exitOK(BUILD_X);

            expectSingleCompleted(a1, "A1", BUILD_X);
            const states = BuildLog.prototype.state.calls.allArgs().map((a) => [a[0], a[1], a[2], a[3]]);
            expect(states, "build log states").to.deep.equal([[BUILD_X, OWNER_A, UDID, "Success"]]);
            expect(updates.calls.count(), "sources.update calls").to.equal(0); // no source_id passed
        });

        it("F1e (WR-02) remote: the runRemoteShell listeners pass the build's source_id, so an OK result updates last_build", function () {
            const updates = spyOn(builder.sources, "update");
            const { worker, listeners } = recordingWorker();
            expect(builder.runRemoteShell(worker, ["--dry-run"], OWNER_A, BUILD_X, UDID, bound, SOURCE)).to.equal(true);

            listeners.log[0]("[builder] Build Stage completed with status: OK\n");
            expect(a1.sent.length, "frames from a log line").to.equal(0);
            listeners["job-status"][0]({ status: "OK", completed: true, build_id: BUILD_X });

            expectSingleCompleted(a1, "A1", BUILD_X);
            expect(updates.calls.count(), "sources.update calls").to.equal(1);
            expect(updates.calls.mostRecent().args.slice(0, 3), "sources.update args").to.deep.equal([OWNER_A, SOURCE, "last_build"]);
        });

        // A local build runs ./builder directly. That script exits 0 whether the build passed
        // or not, so the outcome is the status the builder itself printed last.
        describe("local builds (WR-02)", function () {

            const XBUILD = "/nonexistent/p43-local-build";
            let shell;

            beforeEach(function () {
                builder.cleanupSecrets = () => { };
                spyOn(childProcess, "spawn").and.callFake(() => {
                    shell = new EventEmitter();
                    shell.stdout = new EventEmitter();
                    shell.stderr = new EventEmitter();
                    return shell;
                });
                builder.runShell(XBUILD, "/nonexistent/builder", [], OWNER_A, BUILD_X, UDID, bound);
                expect(childProcess.spawn.calls.count(), "spawned").to.equal(1);
            });

            function out(text) { shell.stdout.emit("data", Buffer.from(text)); }

            it("L1 status: OK in the build output, then the builder's FAILED status and exit 0, give one error frame and no Completed", function () {
                out("Upload status: OK\nSTATUS OK\n");
                expect(a1.sent.length, "frames from log lines").to.equal(0);
                out("[builder] Build Stage completed with status: FAILED\n");
                out("STATUS FAILED\nPLATFORM arduino\n");
                shell.emit("exit", 0);

                for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                    expect(bodies(sock), name + " bodies").to.deep.equal(["FAILED"]);
                    expect(frames(sock)[0].type, name + " type").to.equal("error");
                }
                const states = BuildLog.prototype.state.calls.allArgs().map((a) => a[3]);
                expect(states, "build log states").to.deep.equal(["FAILED"]);
            });

            it("L2 the builder's own OK status and exit 0 give one Completed and set the build log to Success", function () {
                out("[builder] Build Stage completed with status: OK\n[builder] Post-flight check...\n");
                out("STATUS OK\nPLATFORM arduino\n");
                expect(a1.sent.length, "frames before exit").to.equal(0);
                shell.emit("exit", 0);

                expectSingleCompleted(a1, "A1", BUILD_X);
                expectSingleCompleted(a2, "A2", BUILD_X);
                const states = BuildLog.prototype.state.calls.allArgs().map((a) => a[3]);
                expect(states, "build log states").to.deep.equal(["Success"]);
            });

            it("L3 a forged builder line before the real FAILED one does not win: the last status the builder printed decides", function () {
                out("[builder] Build Stage completed with status: OK\n");
                out("[builder] Build Stage completed with status: FAILED\nSTATUS FAILED\n");
                shell.emit("exit", 0);

                expect(bodies(a1)).to.deep.equal(["FAILED"]);
                expect(frames(a1)[0].type).to.equal("error");
            });

            it("L4 exit 0 without any builder status sends no terminal frame; a non-zero exit is Failed even after status: OK output", function () {
                out("Upload status: OK\n");
                shell.emit("exit", 0);
                expect(a1.sent.length, "frames after exit 0 without status").to.equal(0);

                shell.emit("exit", 2);
                expect(bodies(a1)).to.deep.equal(["Failed"]);
                expect(frames(a1)[0].type).to.equal("error");
            });
        });

        it("F4 a raw build log line is never sent to any socket", function () {
            builder.processShellData(shellOpts(BUILD_X), "plain log line\n");
            builder.processShellData(shellOpts(BUILD_X), "Compiling sketch with secret-looking text\r\nmore output\n");

            for (const [name, sock] of [["A1", a1], ["A2", a2], ["B1", b1]]) {
                expect(sock.sent.length, name + " frame count").to.equal(0);
            }
        });

        it("P1 a build that ends without a terminal status sends no Completed frame", function () {
            builder.notify(UDID, BUILD_X, bound, "Pulling repository", true);
            builder.notify(UDID, BUILD_X, bound, "Building...", true);
            builder.processShellData(shellOpts(BUILD_X), "linking firmware.bin\n");

            expect(bodies(a1)).to.deep.equal(["Pulling repository", "Building..."]);
            expect(bodies(a2)).to.deep.equal(["Pulling repository", "Building..."]);
        });

        it("E concurrent builds of one owner keep their own build_id and their own Completed; a closed socket is pruned without blocking the other", function () {
            builder.notify(UDID, BUILD_X, bound, "Pulling repository", true);
            builder.notify(UDID, BUILD_Y, bound, "Pulling repository", true);
            builder.notify(UDID, BUILD_X, bound, "Building...", true);
            a1.readyState = 3; // tab closed mid-build, its close event not yet seen
            builder.notify(UDID, BUILD_Y, bound, "Building...", true);
            builder.processShellData(shellOpts(BUILD_Y), STATUS_OK_LINE);
            builder.processShellData(shellOpts(BUILD_X), STATUS_OK_LINE);
            exitOK(BUILD_X);
            exitOK(BUILD_Y);

            expect(framesFor(a2, BUILD_X).map((f) => f.body), "A2 X").to.deep.equal(["Pulling repository", "Building...", "Completed"]);
            expect(framesFor(a2, BUILD_Y).map((f) => f.body), "A2 Y").to.deep.equal(["Pulling repository", "Building...", "Completed"]);
            expect(frames(a2).every((f) => f.type === "success"), "A2 types").to.equal(true);
            expect(a1.sent.length, "A1 frames before it closed").to.equal(3);
            expect(m.subscriberCount(OWNER_A), "A sockets after pruning").to.equal(1);
            expect(b1.sent.length, "B1 frame count").to.equal(0);
            expectNoOkBody();
        });

        it("M1 the terminal-frame memory is bounded: the oldest build_id is evicted after 1000 more", function () {
            const id = (n) => "43020000-" + String(n).padStart(4, "0") + "-11f0-9d4a-0b5e6f7a8c9d";
            const sends = spyOn(m, "sendToOwner").and.returnValue(0);
            for (let n = 0; n <= 1000; n++) builder.notify(UDID, id(n), bound, "Completed", true);
            expect(sends.calls.count(), "first terminal frames").to.equal(1001);

            builder.notify(UDID, id(1000), bound, "Completed", true); // remembered: suppressed
            expect(sends.calls.count(), "duplicate of a remembered build").to.equal(1001);
            builder.notify(UDID, id(0), bound, "Failed", false); // evicted: sent again
            expect(sends.calls.count(), "duplicate of an evicted build").to.equal(1002);
        });

        it("S2 builder.js has no websocket notifier path, wsOK, sendNotificationIfSocketAlive or buildStatusNotification", function () {
            const src = codeLines(fs.readFileSync(BUILDER_PATH, "utf8")).join("\n");
            for (const needle of ["notifiers.websocket", "wsOK", "sendNotificationIfSocketAlive", "buildStatusNotification", "message == \"OK\""]) {
                expect(src.indexOf(needle), needle + " in builder.js").to.equal(-1);
            }
        });
    });

    // D-12: a build started from the queue (webhook or "queued" route answer) notifies the
    // owner exactly like one started from the console.
    describe("queued builds (D-12)", function () {

        const QUEUE_PATH = path.join(__dirname, "../../lib/thinx/queue.js");

        function waitingAction(owner) {
            const calls = { setError: 0, setStarted: 0, delete: 0 };
            const action = {
                action: { udid: UDID, source: SOURCE, owner_id: owner, status: "waiting" },
                setError() { calls.setError++; },
                setStarted() { calls.setStarted++; },
                delete() { calls.delete++; }
            };
            return { action, calls };
        }

        // The Queue's scheduling without its constructor (Redis, port 4000), as in
        // BuilderRemoteJobSpec's queueWith; `build` stands in for app.builder.build.
        function queueWith(action, build) {
            const queue = Object.create(Queue.prototype);
            queue.workers = { idle: { connected: true, running: false, socket: {} } };
            queue.notifier = { process() { } };
            queue.findNext = async () => action;
            queue.builder = { build: build };
            return queue;
        }

        it("Q1 runNext hands builder.build notifiers carrying the queue's messenger", async function () {
            const m = makeMessenger();
            const { action, calls } = waitingAction(OWNER_A);
            const seen = [];
            const queue = queueWith(action, (owner, build, notifiers) => seen.push({ owner, notifiers }));
            queue.messenger = m;

            await queue.loop();

            expect(calls.setStarted).to.equal(1);
            expect(seen.length).to.equal(1);
            expect(seen[0].owner === OWNER_A, "build owner").to.equal(true);
            expect(seen[0].notifiers !== null && typeof seen[0].notifiers === "object" && !Array.isArray(seen[0].notifiers), "notifiers object").to.equal(true);
            expect(seen[0].notifiers.messenger === m, "notifiers.messenger is the queue's messenger").to.equal(true);
        });

        it("Q2 a queued build of owner A reaches A's sockets through run_build; B gets nothing", async function () {
            const m = makeMessenger();
            const a1 = subscribe(m, OWNER_A);
            const a2 = subscribe(m, OWNER_A);
            const b1 = subscribe(m, OWNER_B);
            const builder = refusingBuilder({ udid: UDID, owner: OWNER_A }, () => null);
            const { action, calls } = waitingAction(OWNER_A);
            const results = [];
            const queue = queueWith(action, (owner, build, notifiers, callback, worker) => {
                builder.run_build(buildRequest(owner, worker), notifiers, (success, response) => {
                    results.push([success, response]);
                    callback(success, response);
                });
            });
            queue.messenger = m;

            await queue.loop();

            expect(results).to.deep.equal([[false, "invalid_device"]]);
            expect(calls.delete).to.equal(1);
            for (const [name, sock] of [["A1", a1], ["A2", a2]]) {
                expect(bodies(sock), name + " bodies").to.deep.equal(["invalid_device"]);
                expect(frames(sock)[0].type, name + " type").to.equal("error");
                expect(frames(sock)[0].build_id, name + " build_id").to.equal(BUILD_X);
            }
            expect(b1.sent.length, "B1 frame count").to.equal(0);
        });

        it("Q3 a queue without a messenger passes { messenger: null } and the build still runs", async function () {
            const builder = refusingBuilder({ udid: UDID, owner: OWNER_A }, () => null);
            const { action } = waitingAction(OWNER_A);
            const seen = [];
            const results = [];
            const queue = queueWith(action, (owner, build, notifiers, callback, worker) => {
                seen.push(notifiers);
                builder.run_build(buildRequest(owner, worker), notifiers, (success, response) => {
                    results.push([success, response]);
                    callback(success, response);
                });
            });

            await queue.loop();

            expect(seen).to.deep.equal([{ messenger: null }]);
            expect(results).to.deep.equal([[false, "invalid_device"]]);
        });

        it("S3 the Queue constructor takes the app's messenger and runNext no longer passes [] as notifiers", function () {
            const src = codeLines(fs.readFileSync(QUEUE_PATH, "utf8")).join("\n");
            const ctor = src.substring(src.indexOf("constructor("), src.indexOf("this.workers = [];"));
            expect(ctor.indexOf("di_app.messenger") !== -1, "constructor reads di_app.messenger").to.equal(true);
            expect(ctor.indexOf("this.messenger =") !== -1, "constructor sets this.messenger").to.equal(true);
            expect(/\[\],\s*\/\/ notifiers/.test(fs.readFileSync(QUEUE_PATH, "utf8")), "[] notifiers in runNext").to.equal(false);
        });
    });
});
