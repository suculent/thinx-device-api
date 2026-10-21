// Exercise the live spec's hooks with fake GitHub/RSA services: no network or secrets.
const fs = require("node:fs");
const vm = require("node:vm");
const expect = require("chai").expect;

describe("GitHub integration test cleanup", function () {
    function fixture(deleteOK = true, uploadOK = true) {
        const hooks = { tests: [], uploaded: [], deleted: [] };
        const rsa = {
            create(_owner, cb) { cb(true, { pubkey: "ssh-rsa test-owned" }); },
            list(_owner, cb) { cb(true, [{ pubkey: "ssh-rsa pre-existing" }]); }
        };
        vm.runInNewContext(fs.readFileSync(require.resolve("./GitHubSpec"), "utf8"), {
            require(name) {
                if (name === "../../lib/thinx/rsakey") return function () { return rsa; };
                if (name === "../../lib/thinx/github") return {
                    validateAccessToken(_token, cb) { cb(true); },
                    addPublicKey(_token, key, cb) {
                        hooks.uploaded.push(key);
                        cb(uploadOK, uploadOK ? { key_id: 42 } : { result: "already_in_use" });
                    },
                    deletePublicKey(_token, id, cb) { hooks.deleted.push(id); cb(deleteOK); }
                };
                if (name === "../_envi.json") return { oid: "test-owner" };
                return require(name);
            },
            console: { log() {} },
            process: { env: { GITHUB_ACCESS_TOKEN: "fake-test-token" } },
            describe(_name, fn) { fn(); },
            beforeAll(fn) { hooks.before = fn; },
            afterAll(fn) { hooks.after = fn; },
            it(_name, fn) { hooks.tests.push(fn); }
        });
        hooks.rsa = rsa;
        return hooks;
    }

    function run(fn) {
        if (fn.length === 0) return Promise.resolve().then(fn);
        return new Promise((resolve, reject) => {
            const done = resolve;
            done.fail = reject;
            try { fn(done); } catch (e) { reject(e); }
        });
    }

    it("uploads only its own key and revokes it even after a later assertion fails", async function () {
        const f = fixture();
        await run(f.before);
        try {
            for (const test of f.tests) await run(test);
            throw new Error("later assertion failed");
        } catch (e) {
            expect(e.message).to.equal("later assertion failed");
        } finally { await run(f.after); }
        expect(f.uploaded).to.deep.equal(["ssh-rsa test-owned"]);
        expect(f.deleted).to.deep.equal([42]);
        expect(fs.existsSync(f.rsa.ssh_keys)).to.equal(false);
    });

    it("surfaces revocation failure and still removes local key material", async function () {
        const f = fixture(false);
        await run(f.before);
        for (const test of f.tests) await run(test);
        let error;
        try { await run(f.after); } catch (e) { error = e; }
        expect(error).to.be.instanceOf(Error);
        expect(fs.existsSync(f.rsa.ssh_keys)).to.equal(false);
    });

    it("does not revoke an existing key when upload is rejected", async function () {
        const f = fixture(true, false);
        await run(f.before);
        try {
            for (const test of f.tests) await run(test);
        } catch { /* The upload assertion is expected to fail. */ }
        finally { await run(f.after); }
        expect(f.deleted).to.deep.equal([]);
    });
});
