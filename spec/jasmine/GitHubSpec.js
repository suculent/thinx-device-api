const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const RSAKey = require("../../lib/thinx/rsakey");
const FakeTransit = require("../fixtures/fake-transit");
const expect = require("chai").expect;
const GitHub = require("../../lib/thinx/github");
const owner = require("../_envi.json").oid;

// Fresh key material for this suite only. Never upload a key selected from an
// owner's existing store, and never revoke a pre-existing GitHub key by title.
describe("GitHub", function () {
    const rsakey = new RSAKey();
    let publicKey;
    let githubKeyId;
    let keyDirectory;
    const token = process.env.GITHUB_ACCESS_TOKEN;

    beforeAll(() => {
        keyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "github-spec-"));
        rsakey.ssh_keys = keyDirectory;
        rsakey.transit = new FakeTransit();
    });

    // Jasmine runs teardown after failed specs as well. A cleanup failure must
    // fail CI visibly; always remove local key material, even if GitHub refuses.
    afterAll(async () => {
        try {
            if (githubKeyId !== undefined) {
                const revoked = await new Promise((resolve) => GitHub.deletePublicKey(token, githubKeyId, resolve));
                expect(revoked, "Failed to revoke the GitHub test SSH key; check token deletion permissions").to.equal(true);
            }
        } finally {
            if (keyDirectory) fs.rmSync(keyDirectory, { recursive: true, force: true });
        }
    }, 15000);

    it("should create an isolated RSA key", async function () {
        const created = await new Promise((resolve) => rsakey.create(owner,
            (success, response) => resolve({ success, response })));
        expect(created.success).to.equal(true);
        expect(created.response).to.be.an("object");
        publicKey = created.response.pubkey;
    }, 10000);

    it("should be able to validate token", async function () {
        const valid = await new Promise((resolve) => GitHub.validateAccessToken(token, resolve));
        expect(valid).to.equal(true);
    });

    it("should be able to add its RSA key to GitHub", async function () {
        expect(publicKey).to.be.a("string");
        const created = await new Promise((resolve) => GitHub.addPublicKey(token, publicKey,
            (success, outcome) => {
                // Record ownership before any assertion can fail.
                if (success && outcome) githubKeyId = outcome.key_id;
                resolve({ success, outcome });
            }));
        expect(created.success).to.equal(true);
        expect(Number.isSafeInteger(githubKeyId), "GitHub must return the created key id for cleanup").to.equal(true);
    });
});
