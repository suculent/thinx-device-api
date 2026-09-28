// Local specs for the remote-builder job protocol (Phase 23, SEC-EXEC-02,
// D-01 / D-04). They construct `new Builder(fakeRedis)` and replace `io` and
// `notify` with recorders, so they run without Redis, CouchDB or a worker:
//
//   ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine spec/jasmine/BuilderRemoteJobSpec.js
//
// The golden legacy `cmd` strings below were captured from shell-escape 0.2.0
// on 2026-09-27, before the dependency was removed. Old workers (images built
// before the worker's argv support) read only `cmd` and run it through a
// shell, so `legacyShellCommand` must keep producing these exact bytes until
// the `cmd` field is dropped. There is deliberately no runtime dependency on
// shell-escape here.

const expect = require("chai").expect;
const util = require("util");

const Builder = require("../../lib/thinx/builder");
const Notifier = require("../../lib/thinx/notifier");
const envi = require("../_envi.json");

const fakeRedis = {
    get(k, cb) { if (typeof cb === "function") cb(null, null); },
    set(...a) { const cb = a[a.length - 1]; if (typeof cb === "function") cb(null, "OK"); }
};

// Realistic run_build argument list (captured together with its golden string).
const REALISTIC_ARGS = [
    "./builder",
    "--owner=cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12",
    "--udid=d6ff2bb0-df34-11e7-b351-eb37822aa172",
    "--fcid=000000",
    "--mac=111111",
    "--git=https://github.com/suculent/thinx-firmware-esp8266-pio.git",
    "--branch=main",
    "--id=6c3f2a50-7b8e-11f0-9d4a-0b5e6f7a8c9d",
    "--workdir=/mnt/data/repos/cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12/d6ff2bb0-df34-11e7-b351-eb37822aa172/6c3f2a50-7b8e-11f0-9d4a-0b5e6f7a8c9d/thinx-firmware-esp8266-pio",
    "--dry-run"
];

const GOLDEN = [
    {
        name: "a bare flag passes through, the program path is quoted",
        args: ["./builder", "--dry-run"],
        cmd: "'./builder' --dry-run"
    },
    {
        name: "brackets and = force quoting",
        args: ["./builder", "--env=[]", "--branch=feature/x"],
        cmd: "'./builder' '--env=[]' '--branch=feature/x'"
    },
    {
        name: "--env JSON keeps its double quotes and its space inside single quotes",
        args: ["./builder", "--git=git@github.com:owner/repo.git", "--env={\"KEY\":\"a b\"}"],
        cmd: "'./builder' '--git=git@github.com:owner/repo.git' '--env={\"KEY\":\"a b\"}'"
    },
    {
        name: "an embedded single quote becomes '\\''",
        args: ["./builder", "--env={\"Q\":\"it's\"}"],
        cmd: "'./builder' '--env={\"Q\":\"it'\\''s\"}'"
    },
    {
        name: "two adjacent single quotes collapse the doubled escape",
        args: ["./builder", "--env={\"A\":\"''\",\"B\":\"x\\\\y\"}"],
        cmd: "'./builder' '--env={\"A\":\"'\\'\\''\",\"B\":\"x\\\\y\"}'"
    },
    {
        name: "leading and trailing single quotes drop the empty '' pair",
        args: ["./builder", "'lead", "trail'"],
        cmd: "'./builder' \\''lead' 'trail'\\'"
    },
    {
        name: "an empty element becomes empty (shell-escape quirk kept as is)",
        args: ["./builder", ""],
        cmd: "'./builder' "
    },
    {
        name: "a realistic run_build argument list",
        args: REALISTIC_ARGS,
        cmd: "'./builder' '--owner=cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12' '--udid=d6ff2bb0-df34-11e7-b351-eb37822aa172' '--fcid=000000' '--mac=111111' '--git=https://github.com/suculent/thinx-firmware-esp8266-pio.git' '--branch=main' '--id=6c3f2a50-7b8e-11f0-9d4a-0b5e6f7a8c9d' '--workdir=/mnt/data/repos/cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12/d6ff2bb0-df34-11e7-b351-eb37822aa172/6c3f2a50-7b8e-11f0-9d4a-0b5e6f7a8c9d/thinx-firmware-esp8266-pio' --dry-run"
    }
];

describe("Builder remote job protocol (SEC-EXEC-02)", function () {

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running BuilderRemoteJob spec`);
    });

    afterAll(() => {
        console.log(`🚸 [chai] <<< completed BuilderRemoteJob spec`);
    });

    // calls.emit records what reaches the selected worker's socket;
    // calls.broadcast records anything sent through the socket.io server,
    // which must stay empty (review iteration 2, WR-03).
    function remoteBuilder() {
        const builder = new Builder(fakeRedis);
        const calls = { emit: [], broadcast: [], notify: [] };
        builder.io = { emit: (...a) => calls.broadcast.push(a) };
        builder.notify = (...a) => calls.notify.push(a);
        const worker = { socket: { connected: true, on() { }, emit: (...a) => calls.emit.push(a) } };
        return { builder, calls, worker };
    }

    function validArgs() {
        return [
            "--owner=" + envi.oid,
            "--udid=" + envi.udid,
            "--fcid=000000",
            "--mac=111111",
            "--git=https://github.com/suculent/thinx-firmware-esp8266-pio.git",
            "--branch=main",
            "--id=" + envi.build_id,
            "--workdir=/mnt/data/repos/x",
            "--env={\"KEY\":\"a b\",\"Q\":\"it's\"}"
        ];
    }

    describe("legacyShellCommand (golden shell-escape 0.2.0 output)", function () {
        for (const g of GOLDEN) {
            it(g.name, function () {
                expect(new Builder(fakeRedis).legacyShellCommand(g.args)).to.equal(g.cmd);
            });
        }
    });

    describe("runRemoteShell job shape (D-01, D-04)", function () {

        let savedSecret;

        beforeEach(() => { savedSecret = process.env.WORKER_SECRET; });
        afterEach(() => {
            if (typeof savedSecret === "undefined") {
                delete process.env.WORKER_SECRET;
            } else {
                process.env.WORKER_SECRET = savedSecret;
            }
        });

        it("emits one job with argv (a copy), the legacy cmd and the contained path", function () {
            process.env.WORKER_SECRET = "spec-worker-secret";
            const { builder, calls, worker } = remoteBuilder();
            const buildArgs = validArgs();
            const emitted = builder.runRemoteShell(worker, buildArgs, envi.oid, envi.build_id, envi.udid, [], envi.sid);

            expect(emitted).to.equal(true);
            expect(calls.notify).to.deep.equal([]);
            expect(calls.broadcast).to.deep.equal([]); // WR-03: never through the io server
            expect(calls.emit.length).to.equal(1);
            expect(calls.emit[0][0]).to.equal("job");
            const job = calls.emit[0][1];
            expect(job.argv).to.deep.equal(buildArgs);
            expect(job.argv).to.not.equal(buildArgs);
            expect(job.cmd).to.equal(builder.legacyShellCommand(["./builder", ...buildArgs]));
            expect(job.path).to.equal(builder.buildPathFor(envi.oid, envi.udid, envi.build_id));
            expect(job.secret).to.equal("spec-worker-secret");
            expect(job.build_id).to.equal(envi.build_id);
            expect(job.owner).to.equal(envi.oid);
            expect(job.udid).to.equal(envi.udid);
            expect(job.source_id).to.equal(envi.sid);
            expect(job.mock).to.equal(false);
        });

        it("argv carries builder arguments only, never the program (invariant)", function () {
            const { builder, calls, worker } = remoteBuilder();
            const withDryRun = validArgs().concat(["--dry-run"]);
            builder.runRemoteShell(worker, withDryRun, envi.oid, envi.build_id, envi.udid, [], envi.sid);
            const job = calls.emit[0][1];
            expect(job.argv.every(a => a.startsWith("--"))).to.equal(true);
            expect(job.argv.includes("./builder")).to.equal(false);
        });

        it("mutating buildArgs after the emit does not change the emitted argv", function () {
            const { builder, calls, worker } = remoteBuilder();
            const buildArgs = validArgs();
            builder.runRemoteShell(worker, buildArgs, envi.oid, envi.build_id, envi.udid, [], envi.sid);
            buildArgs.push("--late=1");
            expect(calls.emit[0][1].argv.includes("--late=1")).to.equal(false);
        });

        it("sends secret null when WORKER_SECRET is not set", function () {
            delete process.env.WORKER_SECRET;
            const { builder, calls, worker } = remoteBuilder();
            builder.runRemoteShell(worker, validArgs(), envi.oid, envi.build_id, envi.udid, [], envi.sid);
            expect(calls.emit[0][1].secret).to.equal(null);
        });
    });

    describe("--env log redaction (T-23-13)", function () {

        it("redactBuildArgs masks only the --env value", function () {
            const args = validArgs();
            const redacted = new Builder(fakeRedis).redactBuildArgs(args);
            expect(redacted.slice(0, -1)).to.deep.equal(args.slice(0, -1));
            expect(redacted[redacted.length - 1]).to.equal("--env=<redacted>");
            expect(args[args.length - 1]).to.equal("--env={\"KEY\":\"a b\",\"Q\":\"it's\"}");
        });

        it("runRemoteShell writes no --env value to the log", function () {
            const { builder, worker } = remoteBuilder();
            const logSpy = spyOn(console, "log");
            builder.runRemoteShell(worker, validArgs(), envi.oid, envi.build_id, envi.udid, [], envi.sid);
            const lines = logSpy.calls.allArgs().map((a) => a.join(" "));
            expect(lines.some((line) => line.includes("it's") || line.includes("a b"))).to.equal(false);
        });

        // Review iteration 2, WR-01: a worker built before that fix echoes the
        // whole refused job as job-status, and queue.js hands every job-status
        // to notifier.process, which logs it first thing.
        it("notifier.process logs only identifying job-status fields (legacy worker echo)", function (done) {
            const legacyEcho = {
                mock: false,
                build_id: envi.build_id,
                source_id: envi.sid,
                owner: envi.oid,
                udid: envi.udid,
                path: "/mnt/data/repos/x",
                argv: validArgs().concat(["--env={\"WIFI_PASS\":\"hunter2\"}"]),
                cmd: "'./builder' '--env={\"WIFI_PASS\":\"hunter2\"}'",
                secret: "worker-secret-value",
                status: "Failed",
                details: "Invalid job authentication"
            };
            const logSpy = spyOn(console, "log");
            new Notifier().process(legacyEcho, (result) => {
                const lines = logSpy.calls.allArgs().map((a) => util.format(...a));
                expect(result).to.equal(false); // no outfile: returns before any CouchDB call
                expect(lines.some((line) => line.includes("processing status"))).to.equal(true);
                for (const leak of ["hunter2", "--env", "worker-secret-value", "argv", "cmd", "secret", "/mnt/data/repos/x"]) {
                    expect(lines.some((line) => line.includes(leak)), leak).to.equal(false);
                }
                done();
            });
        });

        it("notifier loggableStatus keeps only scalar identifying fields", function () {
            const notifier = new Notifier();
            expect(notifier.loggableStatus({
                build_id: "b", udid: "u", owner: "o", status: "Failed", state: "Failed",
                details: "Invalid argv", secret: "s", argv: ["--env={}"], cmd: "c", env_hash: "h"
            })).to.deep.equal({ build_id: "b", udid: "u", owner: "o", status: "Failed", state: "Failed", details: "Invalid argv" });
            expect(notifier.loggableStatus({ owner: { nested: "secret" } })).to.deep.equal({});
            expect(notifier.loggableStatus(undefined)).to.deep.equal({});
            expect(notifier.loggableStatus(null)).to.deep.equal({});
        });
    });

    describe("runRemoteShell refusals", function () {

        it("emits nothing and notifies invalid_device for an invalid owner (23-03 guard)", function () {
            const { builder, calls, worker } = remoteBuilder();
            const emitted = builder.runRemoteShell(worker, validArgs(), "../bad", envi.build_id, envi.udid, [], envi.sid);
            expect(emitted).to.equal(false);
            expect(calls.emit).to.deep.equal([]);
            expect(calls.notify.map(c => c[3])).to.deep.equal(["invalid_device"]);
        });

        // WR-03 (iteration 2): the job no longer goes through the socket.io
        // server, so a missing io is not a refusal any more; only the selected
        // worker's socket matters.
        it("sends the job to the selected worker even when io is null", function () {
            const { builder, calls, worker } = remoteBuilder();
            builder.io = null;
            const emitted = builder.runRemoteShell(worker, validArgs(), envi.oid, envi.build_id, envi.udid, [], envi.sid);
            expect(emitted).to.equal(true);
            expect(calls.emit.map(c => c[0])).to.deep.equal(["job"]);
            expect(calls.notify).to.deep.equal([]);
        });

        // WR-02 (iteration 1): run_build has already answered build_started and
        // written the decrypted secrets by now; false is what makes it set the
        // build-log state to error and run cleanupSecrets.
        const badWorkers = [
            ["undefined", undefined],
            ["null", null],
            ["without a socket", {}],
            ["with a null socket", { socket: null }],
            ["with a socket that cannot emit", { socket: { on() { } } }],
            // Review iteration 3, WR-01: an emit on a disconnected server-side
            // socket is a silent no-op, so this used to return true and lose
            // the build.
            ["with a disconnected socket", { running: true, socket: { connected: false, on() { }, emit() { throw new Error("emitted on a disconnected socket"); } } }],
            ["with a socket that never reports connected", { running: true, socket: { on() { }, emit() { throw new Error("emitted on an unknown socket"); } } }]
        ];
        for (const [name, badWorker] of badWorkers) {
            it("returns false and emits nothing for a worker that is " + name, function () {
                const { builder, calls } = remoteBuilder();
                const emitted = builder.runRemoteShell(badWorker, validArgs(), envi.oid, envi.build_id, envi.udid, [], envi.sid);
                expect(emitted).to.equal(false);
                expect(calls.emit).to.deep.equal([]);
                expect(calls.broadcast).to.deep.equal([]);
                expect(calls.notify.length).to.equal(1);
                if ((badWorker !== null) && (typeof badWorker === "object")) {
                    expect(badWorker.running).to.not.equal(true); // handed back: no job reached it
                }
            });
        }

        it("releases the selected worker when it refuses invalid build arguments", function () {
            const { builder, worker } = remoteBuilder();
            worker.running = true;
            expect(builder.runRemoteShell(worker, ["./builder"], envi.oid, envi.build_id, envi.udid, [], envi.sid)).to.equal(false);
            expect(worker.running).to.equal(false);
        });

        it("marks the worker running when the job is emitted", function () {
            const { builder, worker } = remoteBuilder();
            worker.running = false;
            expect(builder.runRemoteShell(worker, validArgs(), envi.oid, envi.build_id, envi.udid, [], envi.sid)).to.equal(true);
            expect(worker.running).to.equal(true);
        });

        const badArgs = [
            ["a command string instead of an array", "./builder --owner=x"],
            ["an array that names the program", ["./builder", "--owner=x"]],
            ["an element without a leading --", ["--owner=x", "rm -rf /"]],
            ["a non-string element", ["--owner=x", 42]],
            ["a missing argument list", undefined]
        ];

        for (const [name, args] of badArgs) {
            it("emits nothing and notifies invalid_build_arguments for " + name, function () {
                const { builder, calls, worker } = remoteBuilder();
                const emitted = builder.runRemoteShell(worker, args, envi.oid, envi.build_id, envi.udid, [], envi.sid);
                expect(emitted).to.equal(false);
                expect(calls.emit).to.deep.equal([]);
                expect(calls.notify.map(c => c[3])).to.deep.equal(["invalid_build_arguments"]);
            });
        }
    });

    // Review iteration 2, WR-03: runRemoteShell used this.io.emit, so every
    // socket connected to the queue server received every job (job secret and
    // --env payload included) and every idle worker ran it. These specs use a
    // real socket.io server on an ephemeral localhost port and the Queue's own
    // socket handlers, so a regression to a broadcast is visible as a job
    // arriving at the wrong client.
    describe("job delivery to the selected worker only (WR-03)", function () {

        const http = require("http");
        const { Server } = require("socket.io");
        const ioClient = require("socket.io-client");
        const Queue = require("../../lib/thinx/queue");

        let httpServer, ioServer, queue, port, clients, savedSecret;

        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        function connectClient() {
            const client = ioClient("http://127.0.0.1:" + port, { transports: ["websocket"], reconnection: false, forceNew: true });
            client.received = [];
            client.on("job", (job) => client.received.push(job));
            clients.push(client);
            return new Promise((resolve, reject) => {
                client.once("connect", () => resolve(client));
                client.once("connect_error", reject);
            });
        }

        // Registers the way services/worker does on connect.
        async function registeredClient() {
            const client = await connectClient();
            const assigned = new Promise((resolve) => client.once("client id", resolve));
            client.emit("register", { status: "Hello from BuildWorker.", id: null, running: false });
            await assigned;
            return client;
        }

        beforeEach(async () => {
            savedSecret = process.env.WORKER_SECRET;
            process.env.WORKER_SECRET = "spec-worker-secret";
            clients = [];
            httpServer = http.createServer();
            ioServer = new Server(httpServer);
            await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
            port = httpServer.address().port;
            // The Queue's socket handlers without its constructor, which needs
            // Redis and binds port 4000.
            queue = Object.create(Queue.prototype);
            queue.workers = [];
            queue.notifier = { process() { } };
            queue.setupIo(ioServer);
        });

        afterEach(async () => {
            for (const client of clients) client.close();
            await new Promise((resolve) => ioServer.close(() => resolve()));
            if (typeof savedSecret === "undefined") {
                delete process.env.WORKER_SECRET;
            } else {
                process.env.WORKER_SECRET = savedSecret;
            }
        });

        it("sends the job to the chosen worker's socket; other connected clients receive nothing", async function () {
            const chosen = await registeredClient();
            const otherWorker = await registeredClient();
            const bystander = await connectClient(); // connected, never registered

            const worker = queue.nextAvailableWorker();
            expect(worker.socket.id).to.equal(chosen.id);

            const builder = new Builder(fakeRedis);
            builder.io = ioServer; // a regression to io.emit would reach every client
            builder.notify = () => { };
            const delivered = new Promise((resolve) => chosen.once("job", resolve));
            expect(builder.runRemoteShell(worker, validArgs(), envi.oid, envi.build_id, envi.udid, [], envi.sid)).to.equal(true);

            const job = await delivered;
            expect(job.build_id).to.equal(envi.build_id);
            await sleep(250); // leave time for any stray delivery
            expect(chosen.received.length).to.equal(1);
            expect(otherWorker.received).to.deep.equal([]);
            expect(bystander.received).to.deep.equal([]);
        }, 10000);

        it("a poll hands runNext the registered worker object; busy or unregistered pollers start nothing", async function () {
            const polling = await registeredClient();
            const started = [];
            let ran;
            const firstRun = new Promise((resolve) => { ran = resolve; });
            queue.findNext = async () => ({ action: { build_id: "spec" } });
            queue.runNext = (action, worker) => {
                started.push(worker);
                worker.running = true; // what the real runNext does first
                ran();
            };

            polling.emit("poll", "true");
            await firstRun;
            expect(started.length).to.equal(1);
            expect(started[0]).to.equal(queue.workers[polling.id]);
            expect(started[0].socket.id).to.equal(polling.id);

            polling.emit("poll", "true"); // busy now
            const stranger = await connectClient();
            stranger.emit("poll", "true"); // never registered
            await sleep(250);
            expect(started.length).to.equal(1);
        }, 10000);

        // Review iteration 3, WR-01: targeted delivery depends on
        // worker.running, and neither build path kept it set while the build
        // ran. With two workers every build went to the first one, which
        // dropped the jobs it got while busy.
        describe("busy tracking and refusals (iteration 3, WR-01)", function () {

            const fs = require("fs");
            const os = require("os");
            const path = require("path");
            const BuildLog = require("../../lib/thinx/buildlog");
            const InfluxConnector = require("../../lib/thinx/influx");

            const BUILD_A = "aaaaaaaa-1111-11f0-9d4a-0b5e6f7a8c9d";
            const BUILD_B = "bbbbbbbb-2222-11f0-9d4a-0b5e6f7a8c9d";

            let tmp, blogStates, stats;

            beforeEach(() => {
                tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-wr01-"));
                // Hermetic: the build log and the stats sink stay local.
                blogStates = [];
                stats = [];
                spyOn(BuildLog.prototype, "state").and.callFake((...a) => { blogStates.push(a); });
                spyOn(InfluxConnector, "statsLog").and.callFake((...a) => { stats.push(a); });
            });

            afterEach(() => {
                fs.rmSync(tmp, { recursive: true, force: true });
            });

            // A checkout holding the decrypted secrets run_build writes
            // before it dispatches the job.
            function checkoutWithSecrets(name) {
                const dir = fs.mkdtempSync(path.join(tmp, name + "-"));
                fs.writeFileSync(path.join(dir, "environment.json"), "{\"cpass\":\"hunter2\"}");
                fs.writeFileSync(path.join(dir, "thinx.yml"), "devsec:\n  pass: hunter2\n");
                return dir;
            }

            function quietBuilder() {
                const builder = new Builder(fakeRedis);
                builder.io = ioServer;
                builder.notify = () => { };
                return builder;
            }

            const until = async (predicate, ms) => {
                const deadline = Date.now() + (ms || 3000);
                while (!predicate()) {
                    if (Date.now() > deadline) throw new Error("condition not reached");
                    await sleep(10);
                }
            };

            function fakeResponse() {
                const res = { body: [], header() { }, end(b) { res.body.push(b); return res; }, status() { return res; } };
                return res;
            }

            it("router: with two registered workers, a second build goes to the idle worker while the first is running", async function () {
                const first = await registeredClient();
                const second = await registeredClient();
                const builder = quietBuilder();

                // run_build's order: answer build_started, then dispatch.
                const ids = [BUILD_A, BUILD_B];
                const routes = {};
                const app = {
                    post: (route, fn) => { routes[route] = fn; },
                    queue: queue,
                    messenger: null,
                    builder: {
                        build(owner, safe_build, notifiers, callback, worker) {
                            const build_id = ids.shift();
                            callback(true, { response: "build_started", build_id: build_id });
                            builder.runRemoteShell(worker, validArgs(), envi.oid, build_id, envi.udid, notifiers, envi.sid);
                        }
                    }
                };
                require("../../lib/router.build")(app);

                const request = () => ({
                    headers: { authorization: "Bearer spec" },
                    session: { owner: envi.oid },
                    body: { build: { udid: envi.udid, source_id: envi.sid } }
                });

                routes["/api/v2/build"](request(), fakeResponse());
                routes["/api/v2/build"](request(), fakeResponse());

                await until(() => (first.received.length + second.received.length) === 2);
                await sleep(100);
                expect(first.received.map((job) => job.build_id)).to.deep.equal([BUILD_A]);
                expect(second.received.map((job) => job.build_id)).to.deep.equal([BUILD_B]);
                expect(queue.workers[first.id].running).to.equal(true);
                expect(queue.workers[second.id].running).to.equal(true);
                expect(queue.nextAvailableWorker()).to.equal(false);
            }, 10000);

            it("router: a build refused before dispatch hands the worker back", async function () {
                const only = await registeredClient();
                const routes = {};
                require("../../lib/router.build")({
                    post: (route, fn) => { routes[route] = fn; },
                    queue: queue,
                    messenger: null,
                    builder: { build(owner, safe_build, notifiers, callback) { callback(false, "git_fetch_failed"); } }
                });
                routes["/api/v2/build"]({
                    headers: { authorization: "Bearer spec" },
                    session: { owner: envi.oid },
                    body: { build: { udid: envi.udid, source_id: envi.sid } }
                }, fakeResponse());
                expect(queue.workers[only.id].running).to.equal(false);
                expect(queue.nextAvailableWorker().socket.id).to.equal(only.id);
            }, 10000);

            it("queue: running stays set after build_started and is cleared only when the worker is idle again", async function () {
                const client = await registeredClient();
                const worker = queue.workers[client.id];
                const seen = [];
                queue.notifier = {
                    process(job_status) { seen.push({ job_status, running: worker.running }); }
                };
                let deleted = 0;
                queue.builder = {
                    build(owner, build, notifiers, callback) {
                        callback(true, { response: "build_started", build_id: BUILD_A });
                    }
                };
                queue.runNext({
                    action: { udid: envi.udid, source: envi.sid, owner_id: envi.oid },
                    setStarted() { },
                    delete() { deleted++; }
                }, worker);

                expect(deleted).to.equal(1);
                expect(worker.running).to.equal(true); // used to be cleared at build_started
                expect(queue.nextAvailableWorker()).to.equal(false);

                // In order on one socket: a busy refusal of another job, the
                // build's JOB-RESULT, then a failed exit.
                client.emit("job-status", { build_id: BUILD_B, udid: envi.udid, owner: envi.oid, status: "Failed", details: "worker_busy" });
                client.emit("job-status", { build_id: BUILD_A, udid: envi.udid, owner: envi.oid, status: "OK", completed: true });
                client.emit("job-status", { build_id: BUILD_A, udid: envi.udid, state: "Failed", reason: "exit 1" });

                await until(() => worker.running === false);
                expect(seen.length).to.equal(3);
                expect(seen[1].running).to.equal(true); // after worker_busy
                expect(seen[2].running).to.equal(true); // after JOB-RESULT
            }, 10000);

            it("queue: a build refused before dispatch releases the worker", async function () {
                const client = await registeredClient();
                const worker = queue.workers[client.id];
                queue.builder = { build(owner, build, notifiers, callback) { callback(false, "git_fetch_failed"); } };
                queue.runNext({
                    action: { udid: envi.udid, source: envi.sid, owner_id: envi.oid },
                    setStarted() { },
                    delete() { }
                }, worker);
                expect(worker.running).to.equal(false);
            }, 10000);

            it("a worker that disconnected after selection is refused, and the build is failed and cleaned up", async function () {
                const client = await registeredClient();
                const worker = queue.nextAvailableWorker();
                expect(worker.socket.id).to.equal(client.id);
                worker.running = true; // selected

                const id = client.id; // the client forgets its id on close
                client.close();
                await until(() => typeof queue.workers[id] === "undefined");
                expect(worker.socket.connected).to.equal(false);

                const builder = quietBuilder();
                const XBUILD_PATH = checkoutWithSecrets("disconnected");
                expect(builder.dispatchRemoteBuild(worker, validArgs(), envi.oid, BUILD_A, envi.udid, {}, envi.sid, XBUILD_PATH)).to.equal(false);

                expect(worker.running).to.equal(false);
                expect(blogStates).to.deep.equal([[BUILD_A, envi.oid, envi.udid, "error"]]);
                expect(stats.map((s) => s[1])).to.deep.equal(["BUILD_FAILED"]);
                expect(fs.existsSync(path.join(XBUILD_PATH, "environment.json"))).to.equal(false);
                expect(fs.existsSync(path.join(XBUILD_PATH, "thinx.yml"))).to.equal(false);
            }, 10000);

            it("a busy worker's worker_busy refusal fails only the refused build; the running build keeps its listeners", async function () {
                const client = await registeredClient();
                const worker = queue.workers[client.id];
                const builder = quietBuilder();
                const exits = [];
                const shellData = [];
                spyOn(builder, "processExitData").and.callFake((owner, build_id) => { exits.push(build_id); });
                spyOn(builder, "processShellData").and.callFake((opts, data) => { shellData.push([opts.build_id, data]); });
                spyOn(builder, "cleanupDeviceRepositories");

                // The worker answers every job while it is building A the way
                // services/worker does now.
                let busy = false;
                client.on("job", (job) => {
                    if (busy) {
                        client.emit("job-status", { build_id: job.build_id, udid: job.udid, owner: job.owner, status: "Failed", details: "worker_busy" });
                    }
                    busy = true;
                });

                const dirA = checkoutWithSecrets("a");
                const dirB = checkoutWithSecrets("b");
                expect(builder.dispatchRemoteBuild(worker, validArgs(), envi.oid, BUILD_A, envi.udid, {}, envi.sid, dirA)).to.equal(true);
                await until(() => client.received.length === 1);

                // B reaches the same worker (an API whose flag was stale, or
                // the gap between JOB-RESULT and the worker's exit).
                expect(builder.dispatchRemoteBuild(worker, validArgs(), envi.oid, BUILD_B, envi.udid, {}, envi.sid, dirB)).to.equal(true);
                await until(() => blogStates.length === 1);
                await sleep(100);

                // B is failed, recorded and cleaned up; A is untouched.
                expect(blogStates).to.deep.equal([[BUILD_B, envi.oid, envi.udid, "error"]]);
                expect(stats.filter((s) => s[1] === "BUILD_FAILED").map((s) => s[2])).to.deep.equal([BUILD_B]);
                expect(fs.existsSync(path.join(dirB, "environment.json"))).to.equal(false);
                expect(fs.existsSync(path.join(dirA, "environment.json"))).to.equal(true);
                expect(exits).to.deep.equal([]);
                expect(worker.running).to.equal(true); // still building A

                // A's log and its result reach A only: B's listeners are gone.
                client.emit("log", "[builder] status: OK\n");
                client.emit("job-status", { build_id: BUILD_A, udid: envi.udid, owner: envi.oid, status: "OK", completed: true });
                await until(() => exits.length === 1);
                await sleep(100);
                expect(exits).to.deep.equal([BUILD_A]);
                expect(shellData.map((d) => d[0])).to.deep.equal([BUILD_A]);
                expect(blogStates.length).to.equal(1);
            }, 10000);
        });
    });

    // IN-12, as far as the busy refusal needs it: which runRemoteShell
    // listener a job-status reaches. An EventEmitter stands in for the
    // server-side socket.
    describe("job-status attribution (iteration 3, WR-01 / IN-12)", function () {

        const EventEmitter = require("events");

        function emitterWorker() {
            const socket = new EventEmitter();
            socket.connected = true;
            const emitted = [];
            const emit = socket.emit.bind(socket);
            socket.emit = (name, ...a) => { if (name === "job") { emitted.push(a[0]); return true; } return emit(name, ...a); };
            return { worker: { socket, running: false }, socket, emitted };
        }

        function trackedBuilder() {
            const builder = new Builder(fakeRedis);
            builder.notify = () => { };
            const exits = [];
            builder.processExitData = (owner, build_id) => exits.push(build_id);
            builder.processShellData = () => { };
            builder.cleanupDeviceRepositories = () => { };
            return { builder, exits };
        }

        const B1 = "11111111-aaaa-11f0-9d4a-0b5e6f7a8c9d";
        const B2 = "22222222-bbbb-11f0-9d4a-0b5e6f7a8c9d";

        it("a legacy job-status without build_id still reaches the build (D-01)", function () {
            const { worker, socket } = emitterWorker();
            const { builder, exits } = trackedBuilder();
            builder.runRemoteShell(worker, validArgs(), envi.oid, B1, envi.udid, {}, envi.sid, () => { });
            socket.emit("job-status", { state: "Failed", reason: "exit 1" });
            expect(exits).to.deep.equal([B1]);
        });

        it("a refusal without build_id is attributed to no build", function () {
            const { worker, socket } = emitterWorker();
            const { builder, exits } = trackedBuilder();
            const refused = [];
            builder.runRemoteShell(worker, validArgs(), envi.oid, B1, envi.udid, {}, envi.sid, (d) => refused.push(d));
            socket.emit("job-status", { status: "Failed", details: "worker_busy" });
            expect(refused).to.deep.equal([]);
            expect(exits).to.deep.equal([]);
        });

        it("each job-status reaches only the build it names; a refusal detaches that build's listeners", function () {
            const { worker, socket } = emitterWorker();
            const { builder, exits } = trackedBuilder();
            const refused = [];
            builder.runRemoteShell(worker, validArgs(), envi.oid, B1, envi.udid, {}, envi.sid, (d) => refused.push([B1, d]));
            builder.runRemoteShell(worker, validArgs(), envi.oid, B2, envi.udid, {}, envi.sid, (d) => refused.push([B2, d]));
            expect(socket.listenerCount("job-status")).to.equal(2);

            socket.emit("job-status", { build_id: B2, status: "Failed", details: "worker_busy" });
            expect(refused).to.deep.equal([[B2, "worker_busy"]]);
            expect(exits).to.deep.equal([]);
            expect(socket.listenerCount("job-status")).to.equal(1);
            expect(socket.listenerCount("log")).to.equal(1);

            socket.emit("job-status", { build_id: B1, state: "Failed", reason: "exit 1" });
            expect(exits).to.deep.equal([B1]);
            expect(socket.listenerCount("job-status")).to.equal(0); // a failed exit ends B1 too
        });

        it("a JOB-RESULT keeps the build's log listener: the rest of the log still follows", function () {
            const { worker, socket } = emitterWorker();
            const { builder, exits } = trackedBuilder();
            builder.runRemoteShell(worker, validArgs(), envi.oid, B1, envi.udid, {}, envi.sid, () => { });
            socket.emit("job-status", { build_id: B1, status: "OK", completed: true });
            expect(exits).to.deep.equal([B1]);
            expect(socket.listenerCount("log")).to.equal(1);
        });

        it("the queue keeps a worker busy on worker_busy and on a JOB-RESULT, and frees it on other statuses", function () {
            const Queue = require("../../lib/thinx/queue");
            expect(Queue.releasesWorker({ status: "Failed", details: "worker_busy" })).to.equal(false);
            expect(Queue.releasesWorker({ status: "OK", completed: true })).to.equal(false);
            expect(Queue.releasesWorker({ status: "Failed", details: "Invalid job authentication" })).to.equal(true);
            expect(Queue.releasesWorker({ state: "Failed", reason: "exit 1" })).to.equal(true);
        });
    });
});
