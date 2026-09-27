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
