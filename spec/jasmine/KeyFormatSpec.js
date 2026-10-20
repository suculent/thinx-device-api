// lib/thinx/keyformat.js and the format dispatch in lib/thinx/git.js
// (Phase 40, KEYENC-06; reused by the Phase 41 migration).
//
// The table pins what each stored shape is classified as. The invariant at the
// end started as the add-alongside test of Plan 40-02. Since the legacy read
// path is gone (Phase 41, KEYMIG-02, D-09), only Transit reaches a keyed attempt
// (the per-attempt ssh-agent); a legacy file of either kind is skipped with
// legacy_format_unsupported, and an unknown file reaches none. Key material is
// generated at run time into a temp directory; nothing is committed.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const expect = require("chai").expect;

const keyformat = require("../../lib/thinx/keyformat.js");
const Git = require("../../lib/thinx/git.js");
const FakeTransit = require("../fixtures/fake-transit.js");

// Assembled, so no PEM armor line sits in this file as a literal.
const ARMOR = (label) => "-----BEGIN " + label + "-----";
const END = (label) => "-----END " + label + "-----";

describe("Deploy-key format (keyformat)", function () {

    let root;

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-keyformat-"));
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    describe("detect()", function () {

        const cases = [
            ["vault:v1:QUJD", "transit"],
            ["vault:v1:QUJDRA==\n", "transit"],
            ["vault:v12:QUJD", "transit"],
            ["vault:v0:QUJD", "unknown"],
            ["vault:v1:QU JD", "unknown"],
            ["vault:v1:QUJD\nvault:v1:QUJD", "unknown"],
            ["vault:v1:", "unknown"],
            [ARMOR("ENCRYPTED PRIVATE KEY") + "\nx\n" + END("ENCRYPTED PRIVATE KEY") + "\n", "legacy"],
            [ARMOR("RSA PRIVATE KEY") + "\nx\n", "legacy"],
            [ARMOR("OPENSSH PRIVATE KEY") + "\r\nx\r\n", "legacy"],
            [ARMOR("PRIVATE KEY") + "\nx\n", "legacy"],
            ["\n" + ARMOR("PRIVATE KEY") + "\nx\n", "legacy"],
            [ARMOR("PUBLIC KEY") + "\nx\n", "unknown"],
            ["ssh-rsa AAAAB3NzaC1yc2E thinx", "unknown"],
            ["not a real key", "unknown"],
            ["", "unknown"]
        ];

        for (const [text, kind] of cases) {
            it("classifies " + JSON.stringify(text.slice(0, 32)) + " as " + kind, function () {
                expect(keyformat.detect(text)).to.equal(kind);
            });
        }

        it("classifies non-strings as unknown", function () {
            for (const value of [undefined, null, 42, {}, [], Buffer.from("vault:v1:QUJD")]) {
                expect(keyformat.detect(value)).to.equal("unknown");
            }
        });
    });

    describe("readKey()", function () {

        function file(name, contents) {
            const p = path.join(root, name);
            fs.writeFileSync(p, contents, { mode: 0o600 });
            return p;
        }

        it("returns the trimmed ciphertext for a Transit file", function () {
            expect(keyformat.readKey(file("t", "vault:v1:QUJD\n"))).to.deep.equal({ kind: "transit", text: "vault:v1:QUJD", cause: null });
        });

        it("returns no content for a legacy file", function () {
            expect(keyformat.readKey(file("l", ARMOR("ENCRYPTED PRIVATE KEY") + "\nx\n"))).to.deep.equal({ kind: "legacy", text: null, cause: null });
        });

        it("reports unknown_key_format for anything else", function () {
            expect(keyformat.readKey(file("u", "not a real key\n"))).to.deep.equal({ kind: "unknown", text: null, cause: "unknown_key_format" });
        });

        it("reports not_regular for a directory", function () {
            const dir = path.join(root, "d");
            fs.mkdirSync(dir);
            expect(keyformat.readKey(dir)).to.deep.equal({ kind: "unreadable", text: null, cause: "not_regular" });
        });

        // CR-01: a blocking open(2) of a FIFO never returns without a writer and
        // would freeze the API event loop; it must be rejected at once instead.
        it("reports not_regular for a FIFO, without blocking (CR-01)", function () {
            if (process.platform === "win32") return;
            const fifo = path.join(root, "fifo");
            require("child_process").execFileSync("mkfifo", [fifo]);
            const started = Date.now();
            expect(keyformat.readKey(fifo)).to.deep.equal({ kind: "unreadable", text: null, cause: "not_regular" });
            expect(Date.now() - started).to.be.below(1000);
        });

        it("reports too_large past MAX_KEY_FILE_BYTES, and accepts exactly the limit", function () {
            expect(keyformat.MAX_KEY_FILE_BYTES).to.equal(65536);
            expect(keyformat.readKey(file("big", "x".repeat(70 * 1024))).cause).to.equal("too_large");
            expect(keyformat.readKey(file("edge", "x".repeat(65536))).cause).to.equal("unknown_key_format");
        });

        it("reports read_error for a missing or dangling name", function () {
            expect(keyformat.readKey(path.join(root, "missing"))).to.deep.equal({ kind: "unreadable", text: null, cause: "read_error" });
            const link = path.join(root, "dangling");
            fs.symlinkSync(path.join(root, "nowhere"), link);
            expect(keyformat.readKey(link).cause).to.equal("read_error");
        });

        it("follows a symlink to a regular file, as ssh -i does", function () {
            const target = file("target", "vault:v1:QUJD\n");
            const link = path.join(root, "link");
            fs.symlinkSync(target, link);
            expect(keyformat.readKey(link).kind).to.equal("transit");
        });

        it("never throws for odd input", function () {
            for (const value of [undefined, null, "", 42]) {
                expect(keyformat.readKey(value).kind).to.equal("unreadable");
            }
        });
    });

    // Plan 40-02 assumption_delta invariant, after the removal (Phase 41, D-09):
    // Transit reaches its path; legacy and unknown files reach no attempt at all.
    describe("format invariant: only Transit reaches a keyed attempt", function () {

        const OWNER = "5a".repeat(32);
        let pkcs8, encrypted, pkcs1;

        beforeAll(() => {
            const pair = crypto.generateKeyPairSync("rsa", {
                modulusLength: 2048,
                publicKeyEncoding: { type: "spki", format: "pem" },
                privateKeyEncoding: { type: "pkcs8", format: "pem" }
            });
            pkcs8 = pair.privateKey;
            const key = crypto.createPrivateKey(pkcs8);
            encrypted = key.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "spec-throwaway" });
            pkcs1 = key.export({ type: "pkcs1", format: "pem" });
        });

        async function attemptFor(contents, transit) {
            const keysDir = fs.mkdtempSync(path.join(root, "keys-"));
            fs.writeFileSync(path.join(keysDir, "k"), contents, { mode: 0o600 });
            const seeded = path.join(keysDir, "seeded");
            fs.writeFileSync(seeded, "", { mode: 0o600 });
            const git = new Git(null, {
                sshKeysDir: keysDir,
                seededKnownHosts: seeded,
                learnedKnownHostsDir: path.join(fs.mkdtempSync(path.join(root, "learned-")), "ssh_known_hosts")
            });
            git.keyNamesForOwner = () => ["k"];
            git.transit = transit || new FakeTransit();
            const envs = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => {
                envs.push({
                    command: env.GIT_SSH_COMMAND,
                    askpass: ("SSH_ASKPASS" in env) || ("SSH_ASKPASS_REQUIRE" in env),
                    sock: typeof env.SSH_AUTH_SOCK === "string" && fs.existsSync(env.SSH_AUTH_SOCK)
                });
                return { ok: true, repoPath: b, reason: null };
            });
            const lines = [];
            spyOn(console, "log").and.callFake((...a) => lines.push(a.join(" ")));
            const ok = await git.fetch(OWNER, "ssh://git@example.invalid/r.git", "main", fs.mkdtempSync(path.join(root, "build-")));
            return { ok, envs, lines, path: path.join(keysDir, "k") };
        }

        async function expectLegacySkip(contents) {
            expect(keyformat.detect(contents)).to.equal("legacy");
            const transit = new FakeTransit();
            const r = await attemptFor(contents, transit);
            expect(r.ok).to.equal(false);
            expect(r.envs.length).to.equal(0);
            expect(transit.calls.decrypt).to.equal(0);
            expect(r.lines).to.include("[git] key k skipped: legacy_format_unsupported");
            expect(fs.readFileSync(r.path, "utf8")).to.equal(contents); // never rewritten (D-09)
        }

        it("legacy encrypted PKCS#8 reaches no attempt and logs legacy_format_unsupported", async function () {
            await expectLegacySkip(encrypted);
        });

        it("legacy unencrypted (pre-2022) reaches no attempt and logs legacy_format_unsupported", async function () {
            await expectLegacySkip(pkcs1);
        });

        it("Transit takes the agent path with AGENT_SSH_COMMAND and SSH_AUTH_SOCK, and no askpass", async function () {
            const transit = new FakeTransit();
            const ciphertext = await transit.encryptKey(Buffer.from(pkcs8, "utf8"));
            const r = await attemptFor(ciphertext + "\n", transit);
            expect(r.ok).to.equal(true);
            expect(r.envs.length).to.equal(1);
            expect(r.envs[0].command).to.equal(Git.AGENT_SSH_COMMAND);
            expect(r.envs[0].sock).to.equal(true);
            expect(r.envs[0].askpass).to.equal(false);
            expect(transit.calls.decrypt).to.equal(1);
        }, 20000);

        it("an unknown file reaches no attempt", async function () {
            const r = await attemptFor("not a real key\n");
            expect(r.ok).to.equal(false);
            expect(r.envs.length).to.equal(0);
            expect(r.lines).to.include("[git] key k skipped: unknown_key_format");
        });
    });
});
