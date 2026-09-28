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

const Builder = require("../../lib/thinx/builder");
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

    function remoteBuilder() {
        const builder = new Builder(fakeRedis);
        const calls = { emit: [], notify: [] };
        builder.io = { emit: (...a) => calls.emit.push(a) };
        builder.notify = (...a) => calls.notify.push(a);
        return { builder, calls };
    }

    const worker = { socket: { on() { } } };

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
            const { builder, calls } = remoteBuilder();
            const buildArgs = validArgs();
            builder.runRemoteShell(worker, buildArgs, envi.oid, envi.build_id, envi.udid, [], envi.sid);

            expect(calls.notify).to.deep.equal([]);
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
            const { builder, calls } = remoteBuilder();
            const withDryRun = validArgs().concat(["--dry-run"]);
            builder.runRemoteShell(worker, withDryRun, envi.oid, envi.build_id, envi.udid, [], envi.sid);
            const job = calls.emit[0][1];
            expect(job.argv.every(a => a.startsWith("--"))).to.equal(true);
            expect(job.argv.includes("./builder")).to.equal(false);
        });

        it("mutating buildArgs after the emit does not change the emitted argv", function () {
            const { builder, calls } = remoteBuilder();
            const buildArgs = validArgs();
            builder.runRemoteShell(worker, buildArgs, envi.oid, envi.build_id, envi.udid, [], envi.sid);
            buildArgs.push("--late=1");
            expect(calls.emit[0][1].argv.includes("--late=1")).to.equal(false);
        });

        it("sends secret null when WORKER_SECRET is not set", function () {
            delete process.env.WORKER_SECRET;
            const { builder, calls } = remoteBuilder();
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
            const { builder } = remoteBuilder();
            const logSpy = spyOn(console, "log");
            builder.runRemoteShell(worker, validArgs(), envi.oid, envi.build_id, envi.udid, [], envi.sid);
            const lines = logSpy.calls.allArgs().map((a) => a.join(" "));
            expect(lines.some((line) => line.includes("it's") || line.includes("a b"))).to.equal(false);
        });
    });

    describe("runRemoteShell refusals", function () {

        it("emits nothing and notifies invalid_device for an invalid owner (23-03 guard)", function () {
            const { builder, calls } = remoteBuilder();
            builder.runRemoteShell(worker, validArgs(), "../bad", envi.build_id, envi.udid, [], envi.sid);
            expect(calls.emit).to.deep.equal([]);
            expect(calls.notify.map(c => c[3])).to.deep.equal(["invalid_device"]);
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
                const { builder, calls } = remoteBuilder();
                builder.runRemoteShell(worker, args, envi.oid, envi.build_id, envi.udid, [], envi.sid);
                expect(calls.emit).to.deep.equal([]);
                expect(calls.notify.map(c => c[3])).to.deep.equal(["invalid_build_arguments"]);
            });
        }
    });
});
