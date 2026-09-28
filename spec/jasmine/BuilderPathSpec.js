// Local specs for the builder's repository-file guards (Phase 23, SEC-PATH-01,
// D-10 / D-11 / D-12). They construct `new Builder(fakeRedis)` and use tmp-dir
// fixtures only, so they run without Redis or CouchDB:
//
//   ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine spec/jasmine/BuilderPathSpec.js
//
// Symlinks are created inside the mkdtemp tree only and removed in afterAll.

const fs = require("fs");
const os = require("os");
const path = require("path");
const expect = require("chai").expect;

const Builder = require("../../lib/thinx/builder");

const fakeRedis = {
    get(k, cb) { if (typeof cb === "function") cb(null, null); },
    set(...a) { const cb = a[a.length - 1]; if (typeof cb === "function") cb(null, "OK"); }
};

describe("Builder repository-file guards", function () {

    let tmp;

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running BuilderPath spec`);
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-safepath-"));
        fs.writeFileSync(path.join(tmp, "outside.txt"), "SAFEPATH-OUTSIDE\n");
    });

    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(`🚸 [chai] <<< completed BuilderPath spec`);
    });

    function fresh(name) {
        return fs.mkdtempSync(path.join(tmp, name + "-"));
    }

    function newBuilder() {
        return new Builder(fakeRedis);
    }

    describe("loadRepoYaml", function () {

        it("parses a regular thinx.yml", function () {
            const dir = fresh("yml-regular");
            fs.writeFileSync(path.join(dir, "thinx.yml"), "arduino:\n  arch: esp8266\n");
            const r = newBuilder().loadRepoYaml(dir);
            expect(r.ok).to.equal(true);
            expect(r.present).to.equal(true);
            expect(r.yml).to.deep.equal({ arduino: { arch: "esp8266" } });
        });

        it("reports a missing thinx.yml as absent", function () {
            const r = newBuilder().loadRepoYaml(fresh("yml-none"));
            expect(r).to.deep.equal({ ok: true, present: false });
        });

        it("treats an empty thinx.yml as absent instead of throwing", function () {
            const dir = fresh("yml-empty");
            fs.writeFileSync(path.join(dir, "thinx.yml"), "");
            const r = newBuilder().loadRepoYaml(dir);
            expect(r.ok).to.equal(true);
            expect(r.present).to.equal(false);
        });

        it("refuses a thinx.yml symlink to a file inside the build dir", function () {
            const dir = fresh("yml-in-link");
            fs.writeFileSync(path.join(dir, "real.yml"), "arduino:\n  arch: esp8266\n");
            fs.symlinkSync("real.yml", path.join(dir, "thinx.yml"));
            expect(newBuilder().loadRepoYaml(dir)).to.deep.equal({ ok: false, reason: "unsafe_repository_file" });
        });

        it("refuses a thinx.yml symlink to a file outside the build dir", function () {
            const dir = fresh("yml-out-link");
            fs.symlinkSync("../outside.txt", path.join(dir, "thinx.yml"));
            expect(newBuilder().loadRepoYaml(dir)).to.deep.equal({ ok: false, reason: "unsafe_repository_file" });
        });

        it("refuses thinx.yml -> ../abc-evil/thinx.yml from dir abc", function () {
            const base = fresh("yml-adj");
            const abc = path.join(base, "abc");
            const evil = path.join(base, "abc-evil");
            fs.mkdirSync(abc);
            fs.mkdirSync(evil);
            fs.writeFileSync(path.join(evil, "thinx.yml"), "arduino:\n  arch: esp32\n");
            fs.symlinkSync("../abc-evil/thinx.yml", path.join(abc, "thinx.yml"));
            expect(newBuilder().loadRepoYaml(abc)).to.deep.equal({ ok: false, reason: "unsafe_repository_file" });
        });
    });

    describe("writeRepoFile", function () {

        it("refuses a symlinked thinx.yml and leaves the target unchanged", function () {
            const dir = fresh("write-link");
            fs.symlinkSync("../outside.txt", path.join(dir, "thinx.yml"));
            expect(newBuilder().writeRepoFile(dir, "thinx.yml", "devsec:\n  pass: secret\n")).to.equal(false);
            expect(fs.readFileSync(path.join(tmp, "outside.txt"), "utf8")).to.equal("SAFEPATH-OUTSIDE\n");
        });

        it("writes a regular thinx.yml", function () {
            const dir = fresh("write-regular");
            fs.writeFileSync(path.join(dir, "thinx.yml"), "arduino: {}\n");
            expect(newBuilder().writeRepoFile(dir, "thinx.yml", "x")).to.equal(true);
            expect(fs.readFileSync(path.join(dir, "thinx.yml"), "utf8")).to.equal("x");
        });
    });

    // Captures console.log output while fn runs, so a spec can assert that file
    // contents never reach the API log.
    function captureLog(fn) {
        const lines = [];
        const original = console.log;
        console.log = (...a) => { lines.push(a.map(String).join(" ")); };
        try {
            return { result: fn(), lines };
        } finally {
            console.log = original;
        }
    }

    describe("Platform.platformFromYamlFile", function () {

        const Platform = require("../../lib/thinx/platform");

        it("exposes the unsafe_repository_file sentinel", function () {
            expect(Platform.UNSAFE_REPOSITORY_FILE).to.equal("unsafe_repository_file");
        });

        it("returns the platform (with :arch) for a regular thinx.yml", function () {
            const dir = fresh("plat-regular");
            fs.writeFileSync(path.join(dir, "thinx.yml"), "platformio:\n  arch: esp32\n");
            expect(Platform.platformFromYamlFile(dir, path.join(dir, "thinx.yml"))).to.equal("platformio:esp32");
        });

        it("returns null for a missing or empty thinx.yml", function () {
            const dir = fresh("plat-missing");
            expect(Platform.platformFromYamlFile(dir, path.join(dir, "thinx.yml"))).to.equal(null);
            fs.writeFileSync(path.join(dir, "thinx.yml"), "");
            expect(Platform.platformFromYamlFile(dir, path.join(dir, "thinx.yml"))).to.equal(null);
        });

        it("returns the sentinel for a symlinked thinx.yml", function () {
            const dir = fresh("plat-link");
            fs.symlinkSync("../outside.txt", path.join(dir, "thinx.yml"));
            expect(Platform.platformFromYamlFile(dir, path.join(dir, "thinx.yml"))).to.equal(Platform.UNSAFE_REPOSITORY_FILE);
        });

        it("returns the sentinel for a thinx.yml outside the root", function () {
            const base = fresh("plat-adj");
            const abc = path.join(base, "abc");
            const evil = path.join(base, "abc-evil");
            fs.mkdirSync(abc);
            fs.mkdirSync(evil);
            fs.writeFileSync(path.join(evil, "thinx.yml"), "arduino:\n  arch: esp8266\n");
            expect(Platform.platformFromYamlFile(abc, path.join(evil, "thinx.yml"))).to.equal(Platform.UNSAFE_REPOSITORY_FILE);
        });

        it("getPlatformFromPath reads the found thinx.yml through the contained helper", function () {
            const dir = fresh("plat-path");
            fs.mkdirSync(path.join(dir, "src"));
            fs.writeFileSync(path.join(dir, "src", "thinx.yml"), "arduino:\n  arch: esp8266\n");
            expect(Platform.getPlatformFromPath(dir)).to.equal("arduino:esp8266");
        });
    });

    describe("pine64 plugin", function () {

        const pine64 = require("../../lib/thinx/plugins/pine64/plugin.js");
        const MARKER = "SAFEPATH-SECRET-MARKER";

        it("detects a regular Makefile with BL60X", function () {
            const dir = fresh("pine-regular");
            fs.writeFileSync(path.join(dir, "Makefile"), "CHIP = BL60X\n");
            const run = captureLog(() => pine64.check(dir));
            expect(run.result).to.equal("pine64");
        });

        it("refuses a symlinked Makefile and never logs its target's content", function () {
            const dir = fresh("pine-link");
            const secret = path.join(tmp, "pine-secret.txt");
            fs.writeFileSync(secret, "BL60X " + MARKER + "\n");
            fs.symlinkSync(secret, path.join(dir, "Makefile"));
            const run = captureLog(() => pine64.check(dir));
            expect(run.result).to.equal(false);
            expect(run.lines.filter(l => l.indexOf(MARKER) !== -1)).to.deep.equal([]);
        });

        it("does not log the content of a regular Makefile without BL60X", function () {
            const dir = fresh("pine-other");
            fs.writeFileSync(path.join(dir, "Makefile"), "all:\n\techo " + MARKER + "\n");
            const run = captureLog(() => pine64.check(dir));
            expect(run.result).to.equal(false);
            expect(run.lines.filter(l => l.indexOf(MARKER) !== -1)).to.deep.equal([]);
        });
    });

    describe("cleanupSecrets", function () {

        it("removes regular secret files, never follows a thinx.yml symlink, never throws", function () {
            const dir = fresh("cleanup");
            const target = path.join(tmp, "cleanup-target.yml");
            fs.writeFileSync(target, "devsec:\n  pass: keep-me\n");
            fs.writeFileSync(path.join(dir, "environment.json"), "{\"cpass\":\"x\"}");
            fs.writeFileSync(path.join(dir, "environment.h"), "#define X 1\n");
            fs.symlinkSync(target, path.join(dir, "thinx.yml"));
            const builder = newBuilder();
            expect(() => builder.cleanupSecrets(dir)).to.not.throw();
            expect(fs.existsSync(path.join(dir, "environment.json"))).to.equal(false);
            expect(fs.existsSync(path.join(dir, "environment.h"))).to.equal(false);
            expect(fs.readFileSync(target, "utf8")).to.equal("devsec:\n  pass: keep-me\n");
        });

        it("does not throw for a missing directory", function () {
            expect(() => newBuilder().cleanupSecrets(path.join(tmp, "no-such-dir"))).to.not.throw();
        });
    });

    describe("buildPathFor (D-12)", function () {

        const envi = require("../_envi.json");
        const Globals = require("../../lib/thinx/globals.js");
        const safepath = require("../../lib/thinx/safepath");
        const app_config = Globals.app_config();
        const buildRoot = app_config.data_root + app_config.build_root;

        it("returns the contained BUILD_PATH for a valid owner/udid/build_id", function () {
            const p = newBuilder().buildPathFor(envi.oid, envi.udid, envi.build_id);
            expect(p).to.equal(path.resolve(buildRoot, envi.oid, envi.udid, envi.build_id));
            expect(safepath.isInside(buildRoot, p)).to.equal(true);
        });

        const BAD = {
            "owner ../ + 61 hex": ["../" + envi.oid.slice(0, 61), envi.udid, envi.build_id],
            "owner with 63 chars": [envi.oid.slice(0, 63), envi.udid, envi.build_id],
            "udid ../../../../etc/passwd padded to 36": [envi.oid, "../../../../etc/passwd".padEnd(36, "a"), envi.build_id],
            "udid null": [envi.oid, null, envi.build_id],
            "owner empty": ["", envi.udid, envi.build_id],
            "owner undefined": [undefined, envi.udid, envi.build_id],
            "build_id not a uuid": [envi.oid, envi.udid, "../" + envi.build_id.slice(3)],
            "build_id null": [envi.oid, envi.udid, null]
        };

        for (const [name, args] of Object.entries(BAD)) {
            it("returns null for " + name, function () {
                expect(newBuilder().buildPathFor(...args)).to.equal(null);
            });
        }

        it("gives two builds of the same device two different paths", function () {
            const builder = newBuilder();
            const a = builder.buildPathFor(envi.oid, envi.udid, "11111111-2222-3333-4444-555555555555");
            const b = builder.buildPathFor(envi.oid, envi.udid, "66666666-7777-8888-9999-000000000000");
            expect(a).to.be.a("string");
            expect(b).to.be.a("string");
            expect(a).to.not.equal(b);
        });

        it("never rewrites an input (one uppercase letter is refused, not lowercased)", function () {
            const upper = "A" + envi.oid.slice(1);
            expect(newBuilder().buildPathFor(upper, envi.udid, envi.build_id)).to.equal(null);
        });
    });

    describe("runRemoteShell (D-12)", function () {

        const envi = require("../_envi.json");

        // The job goes to the selected worker's socket only (review
        // iteration 2, WR-03); calls.emit records that socket, and anything
        // sent through the socket.io server lands in calls.broadcast.
        function remoteBuilder() {
            const builder = newBuilder();
            const calls = { emit: [], broadcast: [], notify: [] };
            builder.io = { emit: (...a) => calls.broadcast.push(a) };
            builder.notify = (...a) => calls.notify.push(a);
            const worker = { socket: { on() { }, emit: (...a) => calls.emit.push(a) } };
            return { builder, calls, worker };
        }

        it("emits no job and notifies invalid_device for a ../ owner", function () {
            const { builder, calls, worker } = remoteBuilder();
            builder.runRemoteShell(worker, ["--owner=x"], "../bad", envi.build_id, envi.udid, {}, envi.sid);
            expect(calls.emit).to.deep.equal([]);
            expect(calls.notify.map(c => c[3])).to.deep.equal(["invalid_device"]);
        });

        it("emits no job for a udid carrying path characters", function () {
            const { builder, calls, worker } = remoteBuilder();
            builder.runRemoteShell(worker, ["--dry-run"], envi.oid, envi.build_id, "../../../../etc/passwd".padEnd(36, "a"), {}, envi.sid);
            expect(calls.emit).to.deep.equal([]);
            expect(calls.notify.map(c => c[3])).to.deep.equal(["invalid_device"]);
        });

        it("emits the job with the contained BUILD_PATH for a valid device", function () {
            const { builder, calls, worker } = remoteBuilder();
            builder.runRemoteShell(worker, ["--dry-run"], envi.oid, envi.build_id, envi.udid, {}, envi.sid);
            expect(calls.emit.length).to.equal(1);
            expect(calls.emit[0][0]).to.equal("job");
            expect(calls.emit[0][1].path).to.equal(builder.buildPathFor(envi.oid, envi.udid, envi.build_id));
            expect(calls.broadcast).to.deep.equal([]);
        });
    });

    describe("refuseBuild", function () {

        it("notifies, cleans up and calls back (false, unsafe_repository_file)", function () {
            const builder = newBuilder();
            const calls = { notify: [], cleanup: [], callback: [] };
            builder.notify = (...a) => calls.notify.push(a);
            builder.cleanupSecrets = (...a) => calls.cleanup.push(a);
            const callback = (...a) => calls.callback.push(a);
            const dir = fresh("refuse");
            const notifiers = {};
            // owner null: blog.state() returns before it reaches CouchDB, so the
            // spec stays local. The blog.state call itself is covered by the
            // plan's grep gate on refuseBuild.
            builder.refuseBuild("build-id", null, "udid", notifiers, dir, callback, "unsafe_repository_file");
            expect(calls.notify).to.deep.equal([["udid", "build-id", notifiers, "unsafe_repository_file", false]]);
            expect(calls.cleanup).to.deep.equal([[dir]]);
            expect(calls.callback).to.deep.equal([[false, "unsafe_repository_file"]]);
        });
    });
});
