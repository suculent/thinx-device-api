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
});
