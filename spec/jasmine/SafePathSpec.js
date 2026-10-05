// Hermetic specs for lib/thinx/safepath.js (Phase 23, SEC-PATH-01 / D-11).
//
// Every fixture is a tmp dir created with fs.mkdtempSync. Symlinks are made
// inside that tmp tree only and the whole tree is removed in afterAll. Nothing
// here needs Redis, CouchDB or the app config.

const fs = require("fs");
const os = require("os");
const path = require("path");
const expect = require("chai").expect;

const safepath = require("../../lib/thinx/safepath");

describe("SafePath", function () {

    let tmp;       // mkdtemp root, removed in afterAll
    let root;      // <tmp>/abc   (the contained root)
    let sibling;   // <tmp>/abc-evil (prefix sibling)

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running SafePath spec`);
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-safepath-"));
        root = path.join(tmp, "abc");
        sibling = path.join(tmp, "abc-evil");
        fs.mkdirSync(root);
        fs.mkdirSync(sibling);
        fs.writeFileSync(path.join(root, "thinx.yml"), "arduino:\n  arch: esp8266\n");
        fs.writeFileSync(path.join(sibling, "thinx.yml"), "SAFEPATH-SIBLING\n");
        fs.writeFileSync(path.join(tmp, "outside.txt"), "SAFEPATH-OUTSIDE\n");
        fs.writeFileSync(path.join(root, "inner.txt"), "inner\n");
        fs.mkdirSync(path.join(root, "sub"));
    });

    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        console.log(`🚸 [chai] <<< completed SafePath spec`);
    });

    function fresh(name) {
        const dir = fs.mkdtempSync(path.join(tmp, name + "-"));
        return dir;
    }

    describe("resolveInside", function () {

        it("accepts a regular file and returns its realpath", function () {
            const r = safepath.resolveInside(root, "thinx.yml");
            expect(r.ok).to.equal(true);
            expect(r.path).to.equal(fs.realpathSync(path.join(root, "thinx.yml")));
        });

        it("reports a missing file as missing", function () {
            const r = safepath.resolveInside(root, "nope.yml");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("missing");
        });

        it("allows a missing file when allowMissing is set, still contained", function () {
            const r = safepath.resolveInside(root, "new.json", { allowMissing: true });
            expect(r.ok).to.equal(true);
            expect(r.path).to.equal(path.join(fs.realpathSync(root), "new.json"));
        });

        it("refuses a symlink to a file inside the root", function () {
            const dir = fresh("in-link");
            fs.writeFileSync(path.join(dir, "real.yml"), "a: 1\n");
            fs.symlinkSync("real.yml", path.join(dir, "thinx.yml"));
            const r = safepath.resolveInside(dir, "thinx.yml");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("symlink");
        });

        it("refuses a symlink to ../outside.txt", function () {
            const dir = fresh("out-link");
            fs.symlinkSync("../outside.txt", path.join(dir, "thinx.yml"));
            const r = safepath.resolveInside(dir, "thinx.yml");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("symlink");
        });

        it("refuses the prefix sibling <tmp>/abc-evil/thinx.yml for root <tmp>/abc", function () {
            const r = safepath.resolveInside(root, path.join(sibling, "thinx.yml"));
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("outside_root");
        });

        it("refuses a symlink pointing to ../abc-evil/thinx.yml", function () {
            const abc = fresh("adj");
            const dir = path.join(abc, "abc");
            const evil = path.join(abc, "abc-evil");
            fs.mkdirSync(dir);
            fs.mkdirSync(evil);
            fs.writeFileSync(path.join(evil, "thinx.yml"), "evil: 1\n");
            fs.symlinkSync("../abc-evil/thinx.yml", path.join(dir, "thinx.yml"));
            const r = safepath.resolveInside(dir, "thinx.yml");
            expect(r.ok).to.equal(false);
            expect(["outside_root", "symlink"]).to.include(r.reason);
        });

        it("refuses ../x", function () {
            const r = safepath.resolveInside(root, "../x");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("outside_root");
        });

        it("refuses an absolute path outside the root", function () {
            const r = safepath.resolveInside(root, "/etc/hostname");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("outside_root");
        });

        it("refuses a target equal to the root", function () {
            expect(safepath.resolveInside(root, ".").reason).to.equal("outside_root");
            expect(safepath.resolveInside(root, root).reason).to.equal("outside_root");
        });

        it("reports a missing root as root_missing", function () {
            const r = safepath.resolveInside(path.join(tmp, "no-such-root"), "thinx.yml");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("root_missing");
        });

        it("reports null, empty and undefined targets as invalid_input", function () {
            expect(safepath.resolveInside(root, null).reason).to.equal("invalid_input");
            expect(safepath.resolveInside(root, "").reason).to.equal("invalid_input");
            expect(safepath.resolveInside(root, undefined).reason).to.equal("invalid_input");
            expect(safepath.resolveInside(null, "thinx.yml").reason).to.equal("invalid_input");
        });

        it("accepts a file named ..foo (not a parent reference)", function () {
            const dir = fresh("dotdot");
            fs.writeFileSync(path.join(dir, "..foo"), "x");
            expect(safepath.resolveInside(dir, "..foo").ok).to.equal(true);
        });
    });

    describe("isInside", function () {

        it("is a lexical containment check", function () {
            expect(safepath.isInside("/a/b", "/a/b/c")).to.equal(true);
            expect(safepath.isInside("/a/b", "c/d")).to.equal(true);
            expect(safepath.isInside("/a/b", "/a/b")).to.equal(false);
            expect(safepath.isInside("/a/b", "/a/b-evil/c")).to.equal(false);
            expect(safepath.isInside("/a/b", "/a/b/../c")).to.equal(false);
            expect(safepath.isInside("/a/b", null)).to.equal(false);
            expect(safepath.isInside(null, "/a/b/c")).to.equal(false);
        });
    });

    describe("readFileInside", function () {

        it("returns the data of a regular file", function () {
            const r = safepath.readFileInside(root, "thinx.yml", "utf8");
            expect(r.ok).to.equal(true);
            expect(r.data).to.equal("arduino:\n  arch: esp8266\n");
        });

        it("refuses a symlink and returns no data", function () {
            const dir = fresh("read-link");
            fs.symlinkSync("../outside.txt", path.join(dir, "thinx.yml"));
            const r = safepath.readFileInside(dir, "thinx.yml", "utf8");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("symlink");
            expect(r.data).to.equal(undefined);
        });

        it("refuses a directory as not_a_file", function () {
            const r = safepath.readFileInside(root, "sub", "utf8");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("not_a_file");
        });
    });

    describe("writeFileInside", function () {

        it("creates a new file", function () {
            const dir = fresh("write-new");
            const r = safepath.writeFileInside(dir, "environment.json", "{}");
            expect(r.ok).to.equal(true);
            expect(fs.readFileSync(path.join(dir, "environment.json"), "utf8")).to.equal("{}");
        });

        it("overwrites a regular file", function () {
            const dir = fresh("write-over");
            fs.writeFileSync(path.join(dir, "thinx.yml"), "old contents that are longer\n");
            const r = safepath.writeFileInside(dir, "thinx.yml", "new\n");
            expect(r.ok).to.equal(true);
            expect(fs.readFileSync(path.join(dir, "thinx.yml"), "utf8")).to.equal("new\n");
        });

        it("refuses a symlink and leaves the link target's bytes unchanged", function () {
            const dir = fresh("write-link");
            const target = path.join(tmp, "outside.txt");
            const before = fs.readFileSync(target);
            fs.symlinkSync("../outside.txt", path.join(dir, "thinx.yml"));
            const r = safepath.writeFileInside(dir, "thinx.yml", "ssid: leaked\n");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("symlink");
            expect(fs.readFileSync(target).equals(before)).to.equal(true);
        });

        it("refuses a write outside the root", function () {
            const r = safepath.writeFileInside(root, "../abc-evil/thinx.yml", "x");
            expect(r.ok).to.equal(false);
            expect(r.reason).to.equal("outside_root");
            expect(fs.readFileSync(path.join(sibling, "thinx.yml"), "utf8")).to.equal("SAFEPATH-SIBLING\n");
        });
    });

    describe("unlinkInside", function () {

        it("removes a regular file", function () {
            const dir = fresh("unlink-file");
            fs.writeFileSync(path.join(dir, "environment.json"), "{}");
            expect(safepath.unlinkInside(dir, "environment.json")).to.equal(true);
            expect(fs.existsSync(path.join(dir, "environment.json"))).to.equal(false);
        });

        it("removes a symlink itself and leaves its target intact", function () {
            const dir = fresh("unlink-link");
            const target = path.join(tmp, "outside.txt");
            fs.symlinkSync("../outside.txt", path.join(dir, "thinx.yml"));
            expect(safepath.unlinkInside(dir, "thinx.yml")).to.equal(true);
            expect(() => fs.lstatSync(path.join(dir, "thinx.yml"))).to.throw();
            expect(fs.readFileSync(target, "utf8")).to.equal("SAFEPATH-OUTSIDE\n");
        });

        it("refuses a file outside the root", function () {
            expect(safepath.unlinkInside(root, "../outside.txt")).to.equal(false);
            expect(fs.existsSync(path.join(tmp, "outside.txt"))).to.equal(true);
        });

        it("returns false for a missing file or a directory", function () {
            expect(safepath.unlinkInside(root, "nope")).to.equal(false);
            expect(safepath.unlinkInside(root, "sub")).to.equal(false);
        });
    });

    it("never throws, whatever the input", function () {
        const junk = [undefined, null, "", 0, 123, NaN, {}, [], { a: 1 }, () => 1, "\0bad", root];
        for (const a of junk) {
            for (const b of junk) {
                expect(() => safepath.resolveInside(a, b)).to.not.throw();
                expect(() => safepath.resolveInside(a, b, { allowMissing: true })).to.not.throw();
                expect(() => safepath.isInside(a, b)).to.not.throw();
                expect(() => safepath.readFileInside(a, b, "utf8")).to.not.throw();
                expect(() => safepath.unlinkInside(a, b)).to.not.throw();
            }
        }
        // writes only against a throwaway dir, so a junk target cannot land anywhere real
        const dir = fresh("junk-write");
        for (const b of junk) {
            if (b === root) continue;
            expect(() => safepath.writeFileInside(dir, b, "x")).to.not.throw();
            expect(() => safepath.writeFileInside(dir, "f.txt", b)).to.not.throw();
        }
    });
});
