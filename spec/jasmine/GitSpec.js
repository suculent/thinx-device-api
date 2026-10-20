// Hermetic specs for lib/thinx/git.js (Phase 23, SEC-EXEC-01 / SEC-PATH-02).
//
// Every repository used here is a local bare repo written with
// `git fast-import`, reached over file://. fast-import writes commits without
// invoking commit signing and without any user.name/user.email config, so the
// fixtures build the same way on a developer machine that signs every commit
// and inside CI. Nothing here touches the network, ~/.ssh or /mnt/data.
//
// Keyed attempts use Transit keys only (Phase 41, KEYMIG-02): throwaway RSA
// keys generated at run time, stored as FakeTransit ciphertext and loaded into
// each attempt's own ssh-agent. A legacy PEM file is a logged skip (D-09).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const exec = require("child_process");
const expect = require("chai").expect;

const Git = require("../../lib/thinx/git");
const RSAKey = require("../../lib/thinx/rsakey");
const FakeTransit = require("../fixtures/fake-transit.js");

// 64 hex chars, the shape of a real owner id; matches no key file anywhere.
const OWNER = "0f".repeat(32);

const LEGACY_PLACEHOLDER = "-----BEGIN ENCRYPTED " + "PRIVATE KEY-----\nnot a real key\n-----END ENCRYPTED " + "PRIVATE KEY-----\n";

// Never issued by any FakeTransit: bad_ciphertext, unless a spec fails them on purpose.
const UNDECRYPTABLE = ["vault:v1:QUJDRA==", "vault:v1:RUZHSA=="];

function tmpdir(root, name) {
    return fs.mkdtempSync(path.join(root, name + "-"));
}

// A throwaway RSA 2048 key: { pem (PKCS#8), fingerprint (OpenSSH SHA256) }.
function throwawayKey() {
    const pair = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    return { pem: pair.privateKey, fingerprint: RSAKey.fingerprint(RSAKey.toOpenSSH(pair.publicKey, "spec")) };
}

function captureLog() {
    const lines = [];
    spyOn(console, "log").and.callFake((...a) => lines.push(a.join(" ")));
    return lines;
}

// Builds a bare repo with one commit on refs/heads/main containing a regular
// thinx.yml and a symlink entry `linked` -> ../outside.txt (mode 120000).
function makeBareRepo(root) {
    const bare = path.join(root, "origin.git");
    exec.execFileSync("git", ["init", "--bare", "--quiet", bare]);
    const files = [
        { mode: "100644", name: "thinx.yml", data: "platformio:\n  arch: esp8266\n" },
        { mode: "120000", name: "linked", data: "../outside.txt" }
    ];
    const message = "fixture\n";
    let stream = "commit refs/heads/main\n" +
        "committer THiNX Spec <spec@thinx.invalid> 1700000000 +0000\n" +
        "data " + Buffer.byteLength(message) + "\n" + message;
    for (const f of files) {
        stream += "M " + f.mode + " inline " + f.name + "\n";
        stream += "data " + Buffer.byteLength(f.data) + "\n" + f.data + "\n";
    }
    stream += "\n";
    exec.execFileSync("git", ["fast-import", "--quiet"], { cwd: bare, input: stream });
    exec.execFileSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: bare });
    return "file://" + bare;
}

describe("Git", function () {

    let root;        // everything this spec creates lives under here
    let repoUrl;     // file:// URL of the fixture
    let seeded;      // stand-in for the entrypoint-seeded ~/.ssh/known_hosts
    let keysDir;     // stand-in for app_config.ssh_keys: k1 and k2, Transit ciphertext
    let keyTransit;  // the FakeTransit that issued k1 and k2
    const keys = {}; // name -> throwawayKey()

    function newGit(redis, extra) {
        const git = new Git(redis, Object.assign({
            sshKeysDir: keysDir,
            seededKnownHosts: seeded,
            learnedKnownHostsDir: path.join(tmpdir(root, "learned"), "ssh_known_hosts")
        }, extra || {}));
        git.transit = keyTransit;
        return git;
    }

    // The key a keyed attempt's agent was loaded with ("k1", "k2", ...), read
    // from the derived public key the attempt env names; "keyless" without one.
    function keyLabel(env) {
        if (!env || (typeof env.THINX_GIT_KEY_PUB !== "string")) return "keyless";
        const fingerprint = RSAKey.fingerprint(fs.readFileSync(env.THINX_GIT_KEY_PUB, "utf8"));
        for (const [name, key] of Object.entries(keys)) {
            if (key.fingerprint === fingerprint) return name;
        }
        return "agent:unknown";
    }

    beforeAll(async () => {
        console.log(`🚸 [chai] >>> running Git spec`);
        root = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-gitspec-"));
        repoUrl = makeBareRepo(root);
        seeded = path.join(root, "seeded_known_hosts");
        fs.writeFileSync(seeded, "", { mode: 0o600 });
        keysDir = tmpdir(root, "keys");
        keyTransit = new FakeTransit();
        for (const name of ["k1", "k2"]) {
            keys[name] = throwawayKey();
            const ciphertext = await keyTransit.encryptKey(Buffer.from(keys[name].pem, "utf8"));
            fs.writeFileSync(path.join(keysDir, name), ciphertext + "\n", { mode: 0o600 });
        }
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
        console.log(`🚸 [chai] <<< completed Git spec`);
    });

    describe("cloneRepository", function () {

        it("(a) clones a file:// repo and writes basename.json", async function () {
            const git = newGit();
            const buildPath = tmpdir(root, "build");
            const result = await git.cloneRepository(buildPath, repoUrl, "main", git.baseEnv());
            expect(result.ok).to.equal(true);
            expect(fs.statSync(result.repoPath).isDirectory()).to.equal(true);
            expect(path.dirname(result.repoPath)).to.equal(buildPath);
            const meta = JSON.parse(fs.readFileSync(path.join(buildPath, "basename.json"), "utf8"));
            expect(meta).to.deep.equal({ basename: path.basename(result.repoPath), branch: "main" });
        });

        it("(a2) has applied the final modes by the time it reports ok:true", async function () {
            // CR-01: the permission walk is part of the success contract, so
            // nothing may still be changing modes once the caller continues.
            const git = newGit();
            const result = await git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", git.baseEnv());
            expect(result.ok).to.equal(true);
            expect(fs.statSync(result.repoPath).mode & 0o777).to.equal(0o777);
            expect(fs.statSync(path.join(result.repoPath, ".git", "objects")).mode & 0o777).to.equal(0o777);
            expect(fs.statSync(path.join(result.repoPath, "thinx.yml")).mode & 0o777).to.equal(0o766);
            expect(fs.statSync(path.join(result.repoPath, ".git", "HEAD")).mode & 0o777).to.equal(0o766);
        });

        it("(b) reports ok:false for a repository that does not exist", async function () {
            const git = newGit();
            const buildPath = tmpdir(root, "build");
            const result = await git.cloneRepository(buildPath, "file://" + path.join(root, "nope.git"), "main", git.baseEnv());
            expect(result.ok).to.equal(false);
            expect(fs.existsSync(path.join(buildPath, "basename.json"))).to.equal(false);
        });

        it("(b2) reports the stage as reason and the Git.failureCause code as cause (WR-01)", async function () {
            const git = newGit();
            const missingRepo = await git.cloneRepository(tmpdir(root, "build"), "file://" + path.join(root, "nope.git"), "main", git.baseEnv());
            expect(missingRepo).to.deep.equal({ ok: false, repoPath: null, reason: "clone_failed", cause: "repo_not_found_or_no_access" });
            const missingBranch = await git.cloneRepository(tmpdir(root, "build"), repoUrl, "no-such-branch", git.baseEnv());
            expect(missingBranch).to.deep.equal({ ok: false, repoPath: null, reason: "clone_failed", cause: "branch_not_found" });
        });

        it("(c) never runs injection strings in url or branch", async function () {
            const git = newGit();
            const marker = path.join(root, "INJECTED");
            const cases = [
                ["file:///nonexistent;touch " + marker, "main"],
                ["--upload-pack=touch " + marker, "main"],
                [repoUrl, "main$(touch " + marker + ")"],
                [repoUrl, "main`touch " + marker + "`"]
            ];
            for (const [url, branch] of cases) {
                const result = await git.cloneRepository(tmpdir(root, "build"), url, branch, git.baseEnv());
                expect(result.ok, url + " / " + branch).to.equal(false);
                expect(fs.existsSync(marker), url + " / " + branch).to.equal(false);
            }
        });

        it("(d) reports ok:false without throwing when git is not on PATH", async function () {
            const git = newGit();
            const env = Object.assign(git.baseEnv(), { PATH: tmpdir(root, "emptybin") });
            const result = await git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", env);
            expect(result.ok).to.equal(false);
        });

        it("(e) rejects empty, null and undefined url/branch before spawning git", async function () {
            const git = newGit();
            const spy = spyOn(exec, "spawn").and.callThrough();
            const bad = ["", null, undefined];
            for (const value of bad) {
                const buildPath = tmpdir(root, "build");
                const r1 = await git.cloneRepository(buildPath, value, "main", git.baseEnv());
                const r2 = await git.cloneRepository(buildPath, repoUrl, value, git.baseEnv());
                expect(r1.ok).to.equal(false);
                expect(r1.reason).to.equal("invalid_input");
                expect(r2.ok).to.equal(false);
                expect(r2.reason).to.equal("invalid_input");
                expect(fs.readdirSync(buildPath)).to.deep.equal([]);
            }
            expect(spy.calls.count()).to.equal(0);
        });

        it("(e2) keeps the event loop running during a stalled clone and kills git at the timeout (WR-03)", async function () {
            // A remote that accepts the connection and never answers: git (and
            // git-remote-http) would wait forever without the timeout.
            const net = require("net");
            const sockets = [];
            const server = net.createServer((socket) => sockets.push(socket));
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            try {
                const git = newGit(undefined, { gitTimeoutMs: 1500 });
                let ticks = 0;
                const ticker = setInterval(() => { ticks += 1; }, 50);
                const started = Date.now();
                const result = await git.cloneRepository(tmpdir(root, "build"),
                    "http://127.0.0.1:" + server.address().port + "/stall.git", "main", git.baseEnv());
                const elapsed = Date.now() - started;
                clearInterval(ticker);
                expect(result.ok).to.equal(false);
                expect(result.reason).to.equal("clone_failed");
                expect(sockets.length).to.be.at.least(1); // git did reach the stalled remote
                expect(elapsed).to.be.at.least(1400);
                expect(elapsed).to.be.below(10000);
                expect(ticks).to.be.at.least(10); // timers kept firing while git ran
            } finally {
                for (const socket of sockets) socket.destroy();
                await new Promise((resolve) => server.close(resolve));
            }
        }, 20000);
    });

    describe("fetch", function () {

        it("(f) with no keys makes exactly one keyless attempt", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => [];
            const spy = spyOn(git, "cloneHoldingLock").and.callThrough();
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(true);
            expect(spy.calls.count()).to.equal(1);
            const env = spy.calls.argsFor(0)[3];
            expect(env.GIT_SSH_COMMAND).to.equal(undefined);
            expect(env.GIT_ASKPASS).to.equal("false");
        });

        it("(g) with one Transit key makes exactly one keyed attempt through its own agent", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => ["k1"];
            let recorded = null;
            let label = null;
            let socketExisted = false;
            const spy = spyOn(git, "cloneHoldingLock").and.callFake(function (b, u, br, env) {
                recorded = env;
                label = keyLabel(env);
                socketExisted = fs.lstatSync(env.SSH_AUTH_SOCK).isSocket();
                return Git.prototype.cloneHoldingLock.call(git, b, u, br, env);
            });
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(true);
            expect(spy.calls.count()).to.equal(1);
            expect(label).to.equal("k1");
            expect(recorded.GIT_SSH_COMMAND).to.equal(Git.AGENT_SSH_COMMAND);
            expect("THINX_GIT_KEY" in recorded).to.equal(false);
            expect("SSH_ASKPASS" in recorded).to.equal(false);
            expect("SSH_ASKPASS_REQUIRE" in recorded).to.equal(false);
            expect(recorded.GIT_TERMINAL_PROMPT).to.equal("0");
            expect(recorded.GIT_ASKPASS).to.equal("false");
            expect(socketExisted).to.equal(true);
            expect(fs.existsSync(path.dirname(recorded.SSH_AUTH_SOCK))).to.equal(false);
        }, 20000);

        it("(h) resolves false and still removes the agent dir when an attempt throws", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => ["k1"];
            let sock = null;
            spyOn(git, "cloneHoldingLock").and.callFake(function (b, u, br, env) {
                sock = env.SSH_AUTH_SOCK;
                throw new Error("boom");
            });
            captureLog();
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(false);
            expect(typeof sock).to.equal("string");
            expect(fs.existsSync(path.dirname(sock))).to.equal(false);
        }, 20000);
    });

    // D-09 (Phase 41): after the legacy read path is gone, a PEM key that turns
    // up in ssh_keys (restored from an old backup, say) is skipped and logged
    // like an unknown file. No attempt, no keyUnavailable, no Transit call (so
    // no alert), and the file is never deleted or rewritten.
    describe("legacy key after removal (D-09)", function () {

        function legacyFixture() {
            const dir = tmpdir(root, "d09keys");
            const legacyPath = path.join(dir, "legacy");
            fs.writeFileSync(legacyPath, LEGACY_PLACEHOLDER, { mode: 0o600 });
            fs.copyFileSync(path.join(keysDir, "k1"), path.join(dir, "k1"));
            return { dir, legacyPath, bytes: fs.readFileSync(legacyPath), mode: fs.statSync(legacyPath).mode };
        }

        function expectUntouched(f) {
            expect(fs.readFileSync(f.legacyPath).equals(f.bytes)).to.equal(true);
            expect(fs.statSync(f.legacyPath).mode).to.equal(f.mode);
        }

        it("(D9a) a legacy file alone gets no attempt, no keyUnavailable and no Transit call, and stays as it is", async function () {
            const f = legacyFixture();
            const transit = new FakeTransit();
            const git = newGit(undefined, { sshKeysDir: f.dir });
            git.transit = transit;
            git.keyNamesForOwner = () => ["legacy"];
            const clone = spyOn(git, "cloneHoldingLock").and.callThrough();
            const lines = captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
            expect(clone.calls.count()).to.equal(0);
            expect(transit.calls).to.deep.equal({ encrypt: 0, decrypt: 0, rewrap: 0 });
            expect(lines.filter((l) => l === "[git] key legacy skipped: legacy_format_unsupported").length).to.equal(1);
            expectUntouched(f);
        });

        it("(D9b) a Transit key next to a legacy file still clones; the legacy file is skipped and left alone", async function () {
            const f = legacyFixture();
            const git = newGit(undefined, { sshKeysDir: f.dir });
            git.keyNamesForOwner = () => ["legacy", "k1"];
            const labels = [];
            spyOn(git, "cloneHoldingLock").and.callFake(function (b, u, br, env) {
                labels.push(keyLabel(env));
                return Git.prototype.cloneHoldingLock.call(git, b, u, br, env);
            });
            const lines = captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: true, keyUnavailable: null });
            expect(labels).to.deep.equal(["k1"]);
            expect(lines).to.include("[git] key legacy skipped: legacy_format_unsupported");
            expectUntouched(f);
        }, 20000);
    });

    // Review iteration 2, WR-02: since git runs async, two clones into one
    // directory interleaved (one failed with "destination path already
    // exists", and fetch's next-key attempt emptied the other's checkout).
    describe("per-directory checkout lock (WR-02)", function () {

        // Wraps cloneHoldingLock so every attempt is recorded and the number
        // of attempts running at the same time is tracked.
        function trackAttempts(git, impl) {
            const track = { inFlight: 0, maxInFlight: 0, events: [] };
            spyOn(git, "cloneHoldingLock").and.callFake(async function (b, u, br, env) {
                track.inFlight += 1;
                track.maxInFlight = Math.max(track.maxInFlight, track.inFlight);
                const label = keyLabel(env);
                track.events.push("start " + label);
                try {
                    return await impl(b, u, br, env, label);
                } finally {
                    track.inFlight -= 1;
                    track.events.push("end " + label);
                }
            });
            return track;
        }

        function expectIntactCheckout(buildPath) {
            const meta = JSON.parse(fs.readFileSync(path.join(buildPath, "basename.json"), "utf8"));
            const repoPath = path.join(buildPath, meta.basename);
            expect(fs.readdirSync(buildPath).sort()).to.deep.equal(["basename.json", meta.basename].sort());
            expect(fs.readFileSync(path.join(repoPath, "thinx.yml"), "utf8")).to.equal("platformio:\n  arch: esp8266\n");
            const status = exec.execFileSync("git", ["-c", "core.fileMode=false", "status", "--porcelain"], { cwd: repoPath, encoding: "utf8" }); // the 0o766 walk sets x bits
            expect(status).to.equal("");
        }

        it("runs two concurrent clones into one directory one after the other; both succeed", async function () {
            const git = newGit();
            const buildPath = tmpdir(root, "build");
            const track = trackAttempts(git, (b, u, br, env) => Git.prototype.cloneHoldingLock.call(git, b, u, br, env));
            const [r1, r2] = await Promise.all([
                git.cloneRepository(buildPath, repoUrl, "main", git.baseEnv()),
                git.cloneRepository(buildPath + path.sep, repoUrl, "main", git.baseEnv()) // same directory, other spelling
            ]);
            expect(r1.ok).to.equal(true);
            expect(r2.ok).to.equal(true);
            expect(track.maxInFlight).to.equal(1);
            expectIntactCheckout(buildPath);
        }, 20000);

        it("runs two concurrent fetches into one directory one after the other; both succeed", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => [];
            const buildPath = tmpdir(root, "build");
            const track = trackAttempts(git, (b, u, br, env) => Git.prototype.cloneHoldingLock.call(git, b, u, br, env));
            const results = await Promise.all([
                git.fetch(OWNER, repoUrl, "main", buildPath),
                git.fetch(OWNER, repoUrl, "main", buildPath)
            ]);
            expect(results).to.deep.equal([true, true]);
            expect(track.maxInFlight).to.equal(1);
            expect(track.events).to.deep.equal(["start keyless", "end keyless", "start keyless", "end keyless"]);
            expectIntactCheckout(buildPath);
        }, 20000);

        it("holds the lock across all key attempts of one fetch", async function () {
            // The reviewer's case: fetch A's first key fails; fetch B must not
            // clone in between, or A's next-key attempt would empty B's checkout.
            const git = newGit();
            git.keyNamesForOwner = () => ["k1", "k2"];
            const buildPath = tmpdir(root, "build");
            const track = trackAttempts(git, async (b, u, br, env, label) => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                return { ok: label === "k2", repoPath: null, reason: null };
            });
            const results = await Promise.all([
                git.fetch(OWNER, repoUrl, "main", buildPath),
                git.fetch(OWNER, repoUrl, "main", buildPath)
            ]);
            expect(results).to.deep.equal([true, true]);
            expect(track.maxInFlight).to.equal(1);
            expect(track.events).to.deep.equal([
                "start k1", "end k1", "start k2", "end k2", // fetch A, both keys
                "start k1", "end k1", "start k2", "end k2"  // fetch B, only then
            ]);
        }, 20000);

        it("does not serialise clones into different directories", async function () {
            const git = newGit();
            let release;
            const gate = new Promise((resolve) => { release = resolve; });
            const track = trackAttempts(git, async () => {
                await gate;
                return { ok: true, repoPath: null, reason: null };
            });
            const both = Promise.all([
                git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", git.baseEnv()),
                git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", git.baseEnv())
            ]);
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(track.inFlight).to.equal(2);
            release();
            await both;
            expect(track.maxInFlight).to.equal(2);
        });

        it("releases the lock when an attempt rejects or throws", async function () {
            const git = newGit();
            const buildPath = tmpdir(root, "build");
            let calls = 0;
            spyOn(git, "cloneHoldingLock").and.callFake(function (b, u, br, env) {
                calls += 1;
                if (calls === 1) throw new Error("thrown");
                if (calls === 2) return Promise.reject(new Error("rejected"));
                return Git.prototype.cloneHoldingLock.call(git, b, u, br, env);
            });
            const first = git.cloneRepository(buildPath, repoUrl, "main", git.baseEnv());
            const second = git.cloneRepository(buildPath, repoUrl, "main", git.baseEnv());
            const third = git.cloneRepository(buildPath, repoUrl, "main", git.baseEnv());
            let firstError = null;
            let secondError = null;
            await first.catch((e) => { firstError = e.message; });
            await second.catch((e) => { secondError = e.message; });
            expect(firstError).to.equal("thrown");
            expect(secondError).to.equal("rejected");
            expect((await third).ok).to.equal(true);
            expectIntactCheckout(buildPath);
        }, 20000);
    });

    describe("symlink checkout (SEC-PATH-02, D-13)", function () {

        let checkout;

        beforeAll(async () => {
            const git = newGit();
            const result = await git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", git.baseEnv());
            expect(result.ok).to.equal(true);
            checkout = result.repoPath;
        });

        it("checks a symlink entry out as a plain file holding the link text", function () {
            const linked = path.join(checkout, "linked");
            expect(fs.lstatSync(linked).isSymbolicLink()).to.equal(false);
            expect(fs.readFileSync(linked, "utf8")).to.equal("../outside.txt");
        });

        it("persists core.symlinks=false in the checkout", function () {
            const value = exec.execFileSync("git", ["-C", checkout, "config", "core.symlinks"], { encoding: "utf8" }).trim();
            expect(value).to.equal("false");
        });

        it("symlinkEntries() names the mode-120000 index entries", function () {
            const git = newGit();
            expect(git.symlinkEntries(checkout)).to.deep.equal(["linked"]);
        });

        it("symlinkEntries() returns [] for a directory that is not a repository", function () {
            const git = newGit();
            expect(git.symlinkEntries(tmpdir(root, "plain"))).to.deep.equal([]);
        });

        it("builder.symlinkWarning() formats one build-log line", function () {
            const Builder = require("../../lib/thinx/builder");
            const builder = new Builder({ get() { }, set() { } });
            const two = builder.symlinkWarning(["a", "b"]);
            expect(two).to.be.a("string");
            expect(two).to.include("core.symlinks=false");
            expect(two).to.include("a, b");
            expect(two.indexOf("\n")).to.equal(-1);

            const names = [];
            for (let i = 1; i <= 25; i++) names.push("f" + i);
            const many = builder.symlinkWarning(names);
            expect(many).to.include("f20");
            expect(many).to.not.include("f21");
            expect(many).to.include("and 5 more");

            expect(builder.symlinkWarning([])).to.equal(null);
        });
    });

    describe("Sources.add prefetch", function () {

        const Sources = require("../../lib/thinx/sources");

        function newSources(tempPath, added) {
            const sources = new Sources();
            sources.getTempPath = () => tempPath;
            sources.validateURL = (source) => source.url; // Sanitka.url() refuses file://
            sources.addSourceToOwner = (owner, source, temp, callback) => {
                added.push(source);
                callback(true, source.source_id);
            };
            return sources;
        }

        it("adds a public repository as is_private=false with its inferred platform", function (done) {
            const added = [];
            const sources = newSources(tmpdir(root, "source"), added);
            sources.add({ owner: OWNER, url: repoUrl, branch: "main", alias: "spec" }, (success) => {
                expect(success).to.equal(true);
                expect(added.length).to.equal(1);
                expect(added[0].is_private).to.equal(false);
                expect(added[0].platform).to.equal("platformio:esp8266"); // thinx.yml key + arch
                done();
            });
        }, 20000);

        it("reports 'Git fetch failed.' when neither the public nor the keyed attempt works", function (done) {
            const added = [];
            const sources = newSources(tmpdir(root, "source"), added);
            sources.add({ owner: OWNER, url: "file://" + path.join(root, "missing.git"), branch: "main", alias: "spec" }, (success, reason) => {
                expect(success).to.equal(false);
                expect(reason).to.equal("Git fetch failed.");
                expect(added.length).to.equal(0);
                done();
            });
        }, 20000);
    });

    describe("known_hosts policy (D-07, D-08)", function () {

        function learnedDir() {
            return path.join(tmpdir(root, "learned"), "ssh_known_hosts");
        }

        function expectFallback(git, reason) {
            const logged = [];
            spyOn(console, "log").and.callFake((...a) => logged.push(a.join(" ")));
            const r = git.knownHostsFiles();
            expect(r.persistent).to.equal(false);
            expect(r.learned).to.equal(seeded);
            expect(r.seeded).to.equal(seeded);
            expect(r.reason).to.equal(reason);
            expect(logged.some((l) => l.indexOf("learned known_hosts unusable") !== -1)).to.equal(true);
        }

        it("creates the learned dir at 0700 and file at 0600 and uses them", function () {
            const dir = learnedDir();
            const git = newGit(undefined, { learnedKnownHostsDir: dir });
            const r = git.knownHostsFiles();
            expect(r.persistent).to.equal(true);
            expect(r.learned).to.equal(path.join(dir, "known_hosts"));
            expect(r.seeded).to.equal(seeded);
            expect(fs.statSync(dir).mode & 0o777).to.equal(0o700);
            expect(fs.statSync(r.learned).mode & 0o777).to.equal(0o600);
        });

        it("falls back to the seeded file when the dir is group/world-writable", function () {
            const dir = learnedDir();
            fs.mkdirSync(dir);
            fs.chmodSync(dir, 0o777);
            expectFallback(newGit(undefined, { learnedKnownHostsDir: dir }), "dir_writable_by_others");
            expect(fs.statSync(dir).mode & 0o777).to.equal(0o777); // never repaired
        });

        it("falls back to the seeded file when known_hosts is group/world-writable", function () {
            const dir = learnedDir();
            fs.mkdirSync(dir, { mode: 0o700 });
            fs.writeFileSync(path.join(dir, "known_hosts"), "");
            fs.chmodSync(path.join(dir, "known_hosts"), 0o666);
            expectFallback(newGit(undefined, { learnedKnownHostsDir: dir }), "file_writable_by_others");
        });

        it("falls back to the seeded file when the dir is a symlink", function () {
            const real = tmpdir(root, "realdir");
            fs.chmodSync(real, 0o700);
            const dir = learnedDir();
            fs.symlinkSync(real, dir);
            expectFallback(newGit(undefined, { learnedKnownHostsDir: dir }), "dir_symlink");
        });

        it("falls back to the seeded file when known_hosts is a symlink", function () {
            const dir = learnedDir();
            fs.mkdirSync(dir, { mode: 0o700 });
            fs.chmodSync(dir, 0o700);
            const target = path.join(root, "planted_known_hosts-" + path.basename(path.dirname(dir)));
            fs.writeFileSync(target, "", { mode: 0o600 });
            fs.symlinkSync(target, path.join(dir, "known_hosts"));
            expectFallback(newGit(undefined, { learnedKnownHostsDir: dir }), "file_symlink");
        });

        it("keeps GIT_SSH_COMMAND identical across attempts and never relaxes host checking", function () {
            const git = newGit();
            const a = git.agentEnv("/tmp/spec-a1.sock", "/tmp/spec-a1.pub");
            const b = git.agentEnv("/tmp/spec-a2.sock", "/tmp/spec-a2.pub");
            expect(a.GIT_SSH_COMMAND).to.equal(Git.AGENT_SSH_COMMAND);
            expect(b.GIT_SSH_COMMAND).to.equal(Git.AGENT_SSH_COMMAND);
            expect(Git.AGENT_SSH_COMMAND).to.not.match(/StrictHostKeyChecking=(no|off)/);
            expect(Git.AGENT_SSH_COMMAND).to.not.include("/dev/null");
            expect(Git.AGENT_SSH_COMMAND).to.include("StrictHostKeyChecking=accept-new");
            expect(Git.SSH_COMMAND).to.equal(undefined); // the askpass-era command is gone (KEYMIG-02)
        });

        it("points the learned option at the persistent file and the seeded option at the seed", function () {
            const dir = learnedDir();
            const git = newGit(undefined, { learnedKnownHostsDir: dir });
            const env = git.agentEnv("/tmp/spec-a1.sock", "/tmp/spec-a1.pub");
            expect(env.THINX_GIT_LEARNED_KNOWN_HOSTS).to.equal(path.join(dir, "known_hosts"));
            expect(env.THINX_GIT_SEEDED_KNOWN_HOSTS).to.equal(seeded);
        });
    });

    // T-23-02 / KEYMIG-02: the API reads no passphrase and runs no askpass
    // helper. Whatever of that the container env still carries never reaches git.
    describe("inherited askpass and passphrase env (T-23-02, KEYMIG-02)", function () {

        const PASS = "spec-pass-XYZ";
        const INHERITED = {
            GIT_KEY_PASSPHRASE: PASS,
            SSH_ASKPASS: "/tmp/spec-inherited-askpass",
            SSH_ASKPASS_REQUIRE: "force"
        };
        let saved;

        beforeEach(() => {
            saved = {};
            for (const [name, value] of Object.entries(INHERITED)) {
                saved[name] = process.env[name];
                process.env[name] = value;
            }
        });

        afterEach(() => {
            for (const name of Object.keys(INHERITED)) {
                if (typeof (saved[name]) === "undefined") delete process.env[name];
                else process.env[name] = saved[name];
            }
        });

        function expectClean(env, label) {
            for (const name of Object.keys(INHERITED)) expect(name in env, label + " " + name).to.equal(false);
            for (const value of Object.values(env)) expect(String(value).includes(PASS), label).to.equal(false);
        }

        it("neither baseEnv nor agentEnv carries an inherited askpass helper or passphrase", function () {
            const git = newGit();
            expectClean(git.baseEnv(), "baseEnv");
            expectClean(git.agentEnv("/tmp/spec-own.sock", "/tmp/spec-own.pub"), "agentEnv");
        });

        it("no keyed attempt env carries an inherited askpass helper or passphrase", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => ["k1", "k2"];
            const envs = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => {
                envs.push(Object.assign({}, env));
                return { ok: false, repoPath: null, reason: "clone_failed", cause: "publickey_denied" };
            });
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
            expect(envs.length).to.equal(2);
            for (const env of envs) {
                expect(env.GIT_SSH_COMMAND).to.equal(Git.AGENT_SSH_COMMAND);
                expectClean(env, "attempt");
            }
        }, 20000);

        it("gives an HTTP remote answering 401 no credential", async function () {
            const log = path.join(root, "auth-headers.log");
            fs.writeFileSync(log, "");
            // A separate process, so the recorded headers are independent of
            // this process's event loop.
            const server = exec.spawn(process.execPath, ["-e",
                "const http=require('http'),fs=require('fs');const out=process.argv[1];" +
                "const s=http.createServer((q,r)=>{fs.appendFileSync(out,JSON.stringify(q.headers.authorization||null)+'\\n');" +
                "r.writeHead(401,{'WWW-Authenticate':'Basic realm=\"x\"'});r.end();});" +
                "s.listen(0,'127.0.0.1',()=>process.stdout.write(s.address().port+'\\n'));", log], { stdio: ["ignore", "pipe", "inherit"] });
            try {
                const port = await new Promise((resolve) => server.stdout.once("data", (d) => resolve(parseInt(String(d), 10))));
                const git = newGit(undefined, { gitTimeoutMs: 20000 });
                git.keyNamesForOwner = () => ["k1"];
                const envs = [];
                spyOn(git, "cloneHoldingLock").and.callFake(function (b, u, br, env) {
                    envs.push(env.GIT_SSH_COMMAND);
                    return Git.prototype.cloneHoldingLock.call(git, b, u, br, env);
                });
                const ok = await git.fetch(OWNER, "http://127.0.0.1:" + port + "/r.git", "main", tmpdir(root, "build"));
                expect(ok).to.equal(false);
                expect(envs).to.deep.equal([Git.AGENT_SSH_COMMAND]); // the keyed agent attempt
                const lines = fs.readFileSync(log, "utf8").split("\n").filter((l) => l.length > 0);
                expect(lines.length).to.be.at.least(1); // git did reach the remote
                for (const line of lines) expect(JSON.parse(line)).to.equal(null); // never an Authorization header
            } finally {
                server.kill();
            }
        }, 30000);

        it("resolves false for an ssh remote that cannot be reached with the key (D-06)", async function () {
            const git = newGit(undefined, { gitTimeoutMs: 20000 });
            git.keyNamesForOwner = () => ["k1"];
            const ok = await git.fetch(OWNER, "ssh://git@127.0.0.1:9/nope.git", "main", tmpdir(root, "build"));
            expect(ok).to.equal(false);
        }, 30000);
    });

    // Phase 40 (D-01, D-04, KEYENC-02, KEYENC-06) and Phase 41 (KEYMIG-02,
    // D-09): skip-and-continue on an undecryptable key, odd and legacy files,
    // cleanup.
    describe("Transit keys and the try-each-key loop (Phase 40)", function () {

        let pem;      // a throwaway RSA key, PKCS#8 PEM, generated at run time
        let tkeys;    // a keys dir with transit, legacy and odd entries

        beforeAll(async () => {
            pem = throwawayKey().pem;
            tkeys = tmpdir(root, "tkeys");
            fs.writeFileSync(path.join(tkeys, "legacy"), LEGACY_PLACEHOLDER, { mode: 0o600 });
            fs.writeFileSync(path.join(tkeys, "unknown"), "not a real key\n", { mode: 0o600 });
            fs.mkdirSync(path.join(tkeys, "adir"));
            fs.writeFileSync(path.join(tkeys, "huge"), "x".repeat(70 * 1024), { mode: 0o600 });
            fs.symlinkSync(path.join(tkeys, "nowhere"), path.join(tkeys, "dangling"));
            require("child_process").execFileSync("mkfifo", [path.join(tkeys, "afifo")]); // CR-01
            fs.writeFileSync(path.join(tkeys, "transit-undecryptable"), UNDECRYPTABLE[0] + "\n", { mode: 0o600 });
            fs.writeFileSync(path.join(tkeys, "transit-undecryptable2"), UNDECRYPTABLE[1] + "\n", { mode: 0o600 });
        });

        // A FakeTransit that decrypts what it issued and fails the two
        // undecryptable fixtures with `reason`, as if OpenBao failed for them only.
        function transitFailingFixtures(reason) {
            const t = new FakeTransit();
            const real = t.decryptKey.bind(t);
            t.decryptKey = async (ciphertext) => {
                if (UNDECRYPTABLE.includes(String(ciphertext).trim())) {
                    t.calls.decrypt += 1;
                    throw new FakeTransit.TransitError(reason, null, "decrypt");
                }
                return real(ciphertext);
            };
            return t;
        }

        // A Git over `tkeys` whose transit is `transit`, with the key order `names`.
        function transitGit(transit, names) {
            const git = newGit(undefined, { sshKeysDir: tkeys });
            git.transit = transit;
            git.keyNamesForOwner = () => names;
            return git;
        }

        async function writeTransitKey(transit, name) {
            const ct = await transit.encryptKey(Buffer.from(pem, "utf8"));
            fs.writeFileSync(path.join(tkeys, name), ct + "\n", { mode: 0o600 });
        }

        function label(env) {
            if (env && env.SSH_AUTH_SOCK) return "agent";
            return "keyless";
        }

        it("(T1) a Transit key OpenBao cannot decrypt is skipped and the next Transit key still builds (D-01)", async function () {
            const transit = new FakeTransit(); // never issued transit-undecryptable: bad_ciphertext
            await writeTransitKey(transit, "transit-t1");
            const git = transitGit(transit, ["transit-undecryptable", "transit-t1"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return { ok: true, repoPath: b, reason: null }; });
            const lines = captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: true, keyUnavailable: null });
            expect(attempts).to.deep.equal(["agent"]);
            expect(transit.calls.decrypt).to.equal(2);
            expect(lines.filter((l) => l === "[git] key transit-undecryptable skipped: deploy key unavailable: bad_ciphertext").length).to.equal(1);
        }, 20000);

        it("(T2) when no key reaches a clone, the first Transit reason is reported and fetch() still resolves a boolean (D-04)", async function () {
            const transit = new FakeTransit({ failReason: "unreachable", failOps: ["decrypt"] });
            const git = transitGit(transit, ["transit-undecryptable", "unknown"]);
            const clone = spyOn(git, "cloneHoldingLock").and.callFake(async () => cloneFailure("other"));
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: "unreachable" });
            expect(clone.calls.count()).to.equal(0);
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(false);
            expect(typeof ok).to.equal("boolean");
        });

        // The shape the real cloneHoldingLock returns for a failed git command
        // (IN-10): reason is the stage, cause the Git.failureCause code.
        function cloneFailure(cause, stage) {
            return { ok: false, repoPath: null, reason: stage || "clone_failed", cause: cause };
        }

        // WR-01: a key that got past authentication and then failed (missing
        // branch) is the cause; the build log must not blame the key service.
        it("(T2b) an undecryptable Transit key before a Transit key that authenticates, then misses the branch, reports no keyUnavailable (WR-01)", async function () {
            const transit = new FakeTransit(); // never issued transit-undecryptable: bad_ciphertext
            await writeTransitKey(transit, "transit-t2b");
            const git = transitGit(transit, ["transit-undecryptable", "transit-t2b"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return cloneFailure("branch_not_found"); });
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
            expect(attempts).to.deep.equal(["agent"]);
        }, 20000);

        // WR-01 (iteration 2): deploy keys are per-repository, so the other
        // keys of an owner are refused as a rule. A refusal does not explain the
        // build; the undecryptable Transit key (maybe the repository's own) does.
        it("(T2c) a Transit key the remote refuses, tried before a key OpenBao cannot decrypt, still reports the Transit reason (WR-01)", async function () {
            const transit = transitFailingFixtures("sealed");
            await writeTransitKey(transit, "transit-t2c");
            const git = transitGit(transit, ["transit-t2c", "transit-undecryptable"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return cloneFailure("repo_not_found_or_no_access"); });
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: "sealed" });
            expect(attempts).to.deep.equal(["agent"]);
            expect(transit.calls.decrypt).to.equal(2);
        }, 20000);

        for (const cause of ["publickey_denied", "repo_not_found_or_no_access", "key_unusable"]) {
            it(`(T2d) a Transit key refused with '${cause}', then an outage, leaves the outage as the reported cause (WR-01)`, async function () {
                const transit = transitFailingFixtures("unreachable");
                await writeTransitKey(transit, "transit-t2d-" + cause);
                const git = transitGit(transit, ["transit-t2d-" + cause, "transit-undecryptable", "transit-undecryptable2"]);
                const attempts = [];
                spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return cloneFailure(cause); });
                captureLog();
                const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
                expect(r).to.deep.equal({ ok: false, keyUnavailable: "unreachable" });
                expect(attempts).to.deep.equal(["agent"]);
                expect(transit.calls.decrypt).to.equal(2); // the outage skips the last key
            }, 20000);
        }

        it("(T2e) a refusal after the clone stage (a submodule in the pull) counts as past the key (WR-01)", async function () {
            const transit = transitFailingFixtures("unreachable");
            await writeTransitKey(transit, "transit-t2e");
            const git = transitGit(transit, ["transit-t2e", "transit-undecryptable"]);
            spyOn(git, "cloneHoldingLock").and.callFake(async () => cloneFailure("publickey_denied", "pull_failed"));
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
        }, 20000);

        it("(T2f) a decrypted Transit key the remote refuses does not hide the next key's reason (WR-01)", async function () {
            const transit = new FakeTransit(); // never issued transit-undecryptable: bad_ciphertext
            await writeTransitKey(transit, "transit-refused");
            const git = transitGit(transit, ["transit-refused", "transit-undecryptable"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return cloneFailure("publickey_denied"); });
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: "bad_ciphertext" });
            expect(attempts).to.deep.equal(["agent"]);
            expect(transit.calls.decrypt).to.equal(2);
        }, 20000);

        it("(T2g) a decrypted Transit key that authenticates, then misses the branch, is the cause (WR-01)", async function () {
            const transit = new FakeTransit();
            await writeTransitKey(transit, "transit-nobranch");
            const git = transitGit(transit, ["transit-nobranch", "transit-undecryptable"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return cloneFailure("branch_not_found"); });
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
            expect(attempts).to.deep.equal(["agent"]);
            expect(transit.calls.decrypt).to.equal(2);
        }, 20000);

        it("(T3) a Transit key that decrypts but whose clone fails reports no keyUnavailable", async function () {
            const transit = new FakeTransit();
            await writeTransitKey(transit, "transit-ok");
            const git = transitGit(transit, ["transit-ok"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return cloneFailure("other"); });
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
            expect(attempts).to.deep.equal(["agent"]);
        }, 20000);

        it("(T4) legacy, unknown, directory, FIFO, oversized and dangling entries are skipped with their cause and never stop the loop (D-09)", async function () {
            const transit = new FakeTransit();
            await writeTransitKey(transit, "transit-t4");
            const git = transitGit(transit, ["legacy", "unknown", "adir", "afifo", "huge", "dangling", "transit-t4"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return { ok: true, repoPath: b, reason: null }; });
            const lines = captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: true, keyUnavailable: null });
            expect(attempts).to.deep.equal(["agent"]);
            expect(transit.calls.decrypt).to.equal(1);
            for (const [name, cause] of [["legacy", "legacy_format_unsupported"], ["unknown", "unknown_key_format"], ["adir", "not_regular"], ["afifo", "not_regular"], ["huge", "too_large"], ["dangling", "read_error"]]) {
                expect(lines).to.include(`[git] key ${name} skipped: ${cause}`);
            }
            expect(fs.readFileSync(path.join(tkeys, "legacy"), "utf8")).to.equal(LEGACY_PLACEHOLDER);
        }, 20000);

        it("(T5) an attempt that throws inside the agent still removes its directory and zeroes the decrypted key", async function () {
            const transit = new FakeTransit();
            await writeTransitKey(transit, "transit-throws");
            const decrypted = [];
            const realDecrypt = transit.decryptKey.bind(transit);
            transit.decryptKey = async (ct) => { const b = await realDecrypt(ct); decrypted.push(b); return b; };
            const git = transitGit(transit, ["transit-throws"]);
            let agentDir = null;
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => {
                agentDir = path.dirname(env.SSH_AUTH_SOCK);
                throw new Error("boom");
            });
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
            expect(typeof agentDir).to.equal("string");
            expect(fs.existsSync(agentDir)).to.equal(false);
            expect(decrypted.length).to.equal(1);
            expect(decrypted[0].length).to.be.above(0);
            expect(decrypted[0].every((byte) => byte === 0)).to.equal(true);
        }, 20000);

        // WR-02: an outage-class failure is service-wide, so the next Transit
        // keys of the same fetch are skipped without a request. A legacy file
        // in the same fetch is still a plain D-09 skip.
        for (const reason of ["unreachable", "sealed", "tls", "not_configured", "denied"]) {
            it(`(T8) after one '${reason}' the remaining Transit keys are skipped and a legacy file is a logged skip (WR-02, D-09)`, async function () {
                const transit = new FakeTransit({ failReason: reason, failOps: ["decrypt"] });
                const git = transitGit(transit, ["transit-undecryptable", "transit-undecryptable2", "legacy"]);
                const clone = spyOn(git, "cloneHoldingLock").and.callFake(async (b) => ({ ok: true, repoPath: b, reason: null }));
                const lines = captureLog();
                const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
                expect(r).to.deep.equal({ ok: false, keyUnavailable: reason });
                expect(transit.calls.decrypt).to.equal(1);
                expect(clone.calls.count()).to.equal(0);
                for (const name of ["transit-undecryptable", "transit-undecryptable2"]) {
                    expect(lines).to.include(`[git] key ${name} skipped: deploy key unavailable: ${reason}`);
                }
                expect(lines).to.include("[git] key legacy skipped: legacy_format_unsupported");
            });
        }

        it("(T9) with only Transit keys during an outage, one decrypt is made and its reason is reported (WR-02)", async function () {
            const transit = new FakeTransit({ failReason: "unreachable", failOps: ["decrypt"] });
            const git = transitGit(transit, ["transit-undecryptable", "transit-undecryptable2"]);
            const clone = spyOn(git, "cloneHoldingLock").and.callFake(async () => ({ ok: true, repoPath: null, reason: null }));
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: "unreachable" });
            expect(transit.calls.decrypt).to.equal(1);
            expect(clone.calls.count()).to.equal(0);
        });

        it("(T10) a bad_ciphertext key does not skip the next Transit key (WR-02)", async function () {
            const transit = new FakeTransit(); // never issued these two: bad_ciphertext
            await writeTransitKey(transit, "transit-after-bad");
            const git = transitGit(transit, ["transit-undecryptable", "transit-undecryptable2", "transit-after-bad"]);
            const attempts = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => { attempts.push(label(env)); return { ok: true, repoPath: b, reason: null }; });
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: true, keyUnavailable: null });
            expect(transit.calls.decrypt).to.equal(3);
            expect(attempts).to.deep.equal(["agent"]);
        }, 20000);

        it("(T11) a server_error key does not skip the next Transit key (WR-02)", async function () {
            const transit = new FakeTransit({ failReason: "server_error", failOps: ["decrypt"] });
            const git = transitGit(transit, ["transit-undecryptable", "transit-undecryptable2"]);
            captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: "server_error" });
            expect(transit.calls.decrypt).to.equal(2);
        });

        // IN-10: a server_error from the AppRole login is the service, not the key.
        it("(G-IN10) a server_error from the login skips the remaining Transit keys; one from decrypt does not", async function () {
            const login = new FakeTransit({ failReason: "server_error", failOps: ["decrypt"], failOpLabel: "login" });
            const git = transitGit(login, ["transit-undecryptable", "transit-undecryptable2"]);
            const lines = captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: "server_error" });
            expect(login.calls.decrypt).to.equal(1);
            expect(lines).to.include("[git] key transit-undecryptable2 skipped: deploy key unavailable: server_error");

            const decrypt = new FakeTransit({ failReason: "server_error", failOps: ["decrypt"], failOpLabel: "decrypt" });
            const r2 = await transitGit(decrypt, ["transit-undecryptable", "transit-undecryptable2"]).fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r2).to.deep.equal({ ok: false, keyUnavailable: "server_error" });
            expect(decrypt.calls.decrypt).to.equal(2);
        });

        // D-13: key_missing is service-wide (the Transit key itself is gone);
        // retired_version is one stored file below min_decryption_version.
        it("(G-KM) key_missing skips the next Transit key; retired_version is per key", async function () {
            const missing = new FakeTransit({ failReason: "key_missing", failOps: ["decrypt"] });
            const lines = captureLog();
            const r = await transitGit(missing, ["transit-undecryptable", "transit-undecryptable2"]).fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: "key_missing" });
            expect(missing.calls.decrypt).to.equal(1);
            expect(lines).to.include("[git] key transit-undecryptable2 skipped: deploy key unavailable: key_missing");

            const retired = new FakeTransit({ minDecryption: 2 }); // both files are vault:v1:
            const r2 = await transitGit(retired, ["transit-undecryptable", "transit-undecryptable2"]).fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r2).to.deep.equal({ ok: false, keyUnavailable: "retired_version" });
            expect(retired.calls.decrypt).to.equal(2);
            expect(lines).to.include("[git] key transit-undecryptable2 skipped: deploy key unavailable: retired_version");
        });

        // T-40-12: a non-coded error inside the agent callback logs a fixed token.
        it("(G-T12) a non-coded error thrown inside withAgent logs attempt_error, never its message", async function () {
            const transit = new FakeTransit();
            await writeTransitKey(transit, "transit-t12");
            const git = transitGit(transit, ["transit-t12"]);
            spyOn(git, "cloneHoldingLock").and.callFake(async () => { throw new Error("secret-ish detail /tmp/x"); });
            const lines = captureLog();
            const r = await git.fetchDetailed(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(r).to.deep.equal({ ok: false, keyUnavailable: null });
            expect(lines).to.include("[git] fetch attempt with key transit-t12 failed: attempt_error");
            for (const line of lines) expect(line.includes("secret-ish detail")).to.equal(false);
        }, 20000);

        it("(F) FakeTransit: minDecryption refuses older versions as retired_version; failOpLabel stamps err.op", async function () {
            const t = new FakeTransit();
            expect(t.minDecryption).to.equal(1);
            const old = await t.encryptKey(Buffer.from("old"));
            t.rotate();
            t.minDecryption = 2;
            for (const call of [() => t.decryptKey(old), () => t.rewrapKey(old)]) {
                let err = null;
                try { await call(); } catch (e) { err = e; }
                expect(err).to.be.instanceOf(FakeTransit.TransitError);
                expect(err.reason).to.equal("retired_version");
                expect(err.status).to.equal(400);
            }
            const fresh = await t.encryptKey(Buffer.from("new"));
            expect((await t.decryptKey(fresh)).toString()).to.equal("new");

            for (const [opts, op] of [[{}, "decrypt"], [{ failOpLabel: "login" }, "login"]]) {
                const f = new FakeTransit(Object.assign({ failReason: "server_error", failOps: ["decrypt"] }, opts));
                let err = null;
                try { await f.decryptKey("vault:v1:QUJD"); } catch (e) { err = e; }
                expect(err.op).to.equal(op);
            }
        });

        it("(T6) an inherited SSH_AUTH_SOCK / SSH_AGENT_PID reaches neither baseEnv nor agentEnv (T-40-08)", function () {
            const saved = { sock: process.env.SSH_AUTH_SOCK, pid: process.env.SSH_AGENT_PID };
            process.env.SSH_AUTH_SOCK = "/tmp/spec-inherited-agent.sock";
            process.env.SSH_AGENT_PID = "1";
            try {
                const git = newGit();
                const base = git.baseEnv();
                expect("SSH_AUTH_SOCK" in base).to.equal(false);
                expect("SSH_AGENT_PID" in base).to.equal(false);
                const agent = git.agentEnv("/tmp/own.sock", "/tmp/own.pub");
                expect(agent.SSH_AUTH_SOCK).to.equal("/tmp/own.sock");
                expect("SSH_AGENT_PID" in agent).to.equal(false);
            } finally {
                if (typeof saved.sock === "undefined") delete process.env.SSH_AUTH_SOCK; else process.env.SSH_AUTH_SOCK = saved.sock;
                if (typeof saved.pid === "undefined") delete process.env.SSH_AGENT_PID; else process.env.SSH_AGENT_PID = saved.pid;
            }
        });

        it("(T7) concurrent keyed fetches into different checkouts each get their own agent", async function () {
            const transit = new FakeTransit();
            await writeTransitKey(transit, "transit-concurrent");
            const git = transitGit(transit, ["transit-concurrent"]);
            const socks = [];
            spyOn(git, "cloneHoldingLock").and.callFake(async (b, u, br, env) => {
                socks.push(env.SSH_AUTH_SOCK);
                await new Promise((resolve) => setTimeout(resolve, 50));
                return { ok: true, repoPath: b, reason: null };
            });
            const results = await Promise.all([
                git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build")),
                git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"))
            ]);
            expect(results).to.deep.equal([true, true]);
            expect(socks.length).to.equal(2);
            expect(socks[0]).to.not.equal(socks[1]);
            for (const s of socks) expect(fs.existsSync(path.dirname(s))).to.equal(false);
        }, 20000);
    });

    describe("last-good key memory (D-09)", function () {

        function redisReturning(value) {
            return { get(k, cb) { cb(null, value); }, set() { } };
        }

        it("tries the remembered key first", async function () {
            const git = newGit(redisReturning("k2"));
            expect(await git.orderKeys(OWNER, ["k1", "k2", "k3"])).to.deep.equal(["k2", "k1", "k3"]);
        });

        it("ignores a remembered value that is not one of the owner's own keys", async function () {
            expect(await newGit(redisReturning("../k2")).orderKeys(OWNER, ["k1", "k2", "k3"])).to.deep.equal(["k1", "k2", "k3"]);
            expect(await newGit(redisReturning("k4")).orderKeys(OWNER, ["k1", "k2", "k3"])).to.deep.equal(["k1", "k2", "k3"]);
        });

        it("keeps the original order on a Redis error", async function () {
            const git = newGit({ get(k, cb) { cb(new Error("down")); }, set() { } });
            expect(await git.orderKeys(OWNER, ["k1", "k2", "k3"])).to.deep.equal(["k1", "k2", "k3"]);
        });

        it("keeps the original order when Redis never answers", async function () {
            const git = newGit({ get() { }, set() { } }, { redisTimeoutMs: 50 });
            const started = Date.now();
            expect(await git.orderKeys(OWNER, ["k1", "k2", "k3"])).to.deep.equal(["k1", "k2", "k3"]);
            expect(Date.now() - started).to.be.below(1000);
        });

        it("keeps the original order without Redis", async function () {
            expect(await newGit().orderKeys(OWNER, ["k1", "k2", "k3"])).to.deep.equal(["k1", "k2", "k3"]);
        });

        it("remembers only the key filename of the successful attempt, for 30 days", async function () {
            const sets = [];
            const git = newGit({
                get(k, cb) { cb(null, null); },
                set(...a) { sets.push(a); const cb = a[a.length - 1]; if (typeof cb === "function") cb(null, "OK"); }
            });
            git.keyNamesForOwner = () => ["k1", "k2"];
            spyOn(git, "cloneHoldingLock").and.callFake((b, u, br, env) => ({ ok: keyLabel(env) === "k2", repoPath: null, reason: null }));
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(true);
            expect(sets.length).to.equal(1);
            expect(sets[0].slice(0, 4)).to.deep.equal(["gitkey:" + OWNER, "k2", "EX", 2592000]);
            expect(typeof sets[0][4]).to.equal("function");
        }, 20000);
    });

    describe("Builder prefetch", function () {

        const Builder = require("../../lib/thinx/builder");
        const fakeRedis = {
            get(k, cb) { cb(null, null); },
            set(...a) { const cb = a[a.length - 1]; if (typeof cb === "function") cb(null, "OK"); }
        };
        const br = { build_id: "spec-build", owner: OWNER, udid: "spec-udid", source_id: "spec-source" };

        function newBuilder() {
            const builder = new Builder(fakeRedis);
            builder.sources = { update: (o, s, k, v, cb) => cb(true) };
            builder.git.keyNamesForOwner = () => [];
            return builder;
        }

        it("(i) short-circuits to true when basename.json already exists", async function () {
            const builder = newBuilder();
            const dir = tmpdir(root, "build");
            fs.writeFileSync(path.join(dir, "basename.json"), "{}");
            const ok = await builder.prefetchPrivate(br, dir, repoUrl, "main");
            expect(ok).to.equal(true);
        });

        it("(j) fetches the fixture end to end", async function () {
            const builder = newBuilder();
            const dir = tmpdir(root, "build");
            const ok = await builder.prefetchPrivate(br, dir, repoUrl, "main");
            expect(ok).to.equal(true);
            expect(fs.existsSync(path.join(dir, "basename.json"))).to.equal(true);
        });

        it("(k) resolves false for a missing repository (git_fetch_failed)", async function () {
            const builder = newBuilder();
            const dir = tmpdir(root, "build");
            const ok = await builder.prefetchPrivate(br, dir, "file://" + path.join(root, "missing.git"), "main");
            expect(ok).to.equal(false);
        });

        it("(l) copies keyUnavailable from fetchDetailed into the outcome and still resolves a boolean (D-04)", async function () {
            const builder = newBuilder();
            builder.git.fetchDetailed = async () => ({ ok: false, keyUnavailable: "sealed" });
            const outcome = {};
            const ok = await builder.prefetchPrivate(br, tmpdir(root, "build"), repoUrl, "main", outcome);
            expect(ok).to.equal(false);
            expect(outcome.keyUnavailable).to.equal("sealed");
            // No outcome object: same boolean, nothing to fill.
            expect(await builder.prefetchPrivate(br, tmpdir(root, "build"), repoUrl, "main")).to.equal(false);
        });
    });

});
