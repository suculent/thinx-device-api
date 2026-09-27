// Hermetic specs for lib/thinx/git.js (Phase 23, SEC-EXEC-01 / SEC-PATH-02).
//
// Every repository used here is a local bare repo written with
// `git fast-import`, reached over file://. fast-import writes commits without
// invoking commit signing and without any user.name/user.email config, so the
// fixtures build the same way on a developer machine that signs every commit
// and inside CI. Nothing here touches the network, ~/.ssh or /mnt/data.

const fs = require("fs");
const os = require("os");
const path = require("path");
const exec = require("child_process");
const expect = require("chai").expect;

const Git = require("../../lib/thinx/git");

// 64 hex chars, the shape of a real owner id; matches no key file anywhere.
const OWNER = "0f".repeat(32);

function tmpdir(root, name) {
    return fs.mkdtempSync(path.join(root, name + "-"));
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
    let keysDir;     // stand-in for app_config.ssh_keys

    function newGit(redis, extra) {
        return new Git(redis, Object.assign({
            sshKeysDir: keysDir,
            seededKnownHosts: seeded,
            learnedKnownHostsDir: path.join(tmpdir(root, "learned"), "ssh_known_hosts")
        }, extra || {}));
    }

    beforeAll(() => {
        console.log(`🚸 [chai] >>> running Git spec`);
        root = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-gitspec-"));
        repoUrl = makeBareRepo(root);
        seeded = path.join(root, "seeded_known_hosts");
        fs.writeFileSync(seeded, "", { mode: 0o600 });
        keysDir = tmpdir(root, "keys");
        fs.writeFileSync(path.join(keysDir, "k1"), "not a real key\n", { mode: 0o600 });
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
        console.log(`🚸 [chai] <<< completed Git spec`);
    });

    describe("cloneRepository", function () {

        it("(a) clones a file:// repo and writes basename.json", function () {
            const git = newGit();
            const buildPath = tmpdir(root, "build");
            const result = git.cloneRepository(buildPath, repoUrl, "main", git.baseEnv());
            expect(result.ok).to.equal(true);
            expect(fs.statSync(result.repoPath).isDirectory()).to.equal(true);
            expect(path.dirname(result.repoPath)).to.equal(buildPath);
            const meta = JSON.parse(fs.readFileSync(path.join(buildPath, "basename.json"), "utf8"));
            expect(meta).to.deep.equal({ basename: path.basename(result.repoPath), branch: "main" });
        });

        it("(b) reports ok:false for a repository that does not exist", function () {
            const git = newGit();
            const buildPath = tmpdir(root, "build");
            const result = git.cloneRepository(buildPath, "file://" + path.join(root, "nope.git"), "main", git.baseEnv());
            expect(result.ok).to.equal(false);
            expect(fs.existsSync(path.join(buildPath, "basename.json"))).to.equal(false);
        });

        it("(c) never runs injection strings in url or branch", function () {
            const git = newGit();
            const marker = path.join(root, "INJECTED");
            const cases = [
                ["file:///nonexistent;touch " + marker, "main"],
                ["--upload-pack=touch " + marker, "main"],
                [repoUrl, "main$(touch " + marker + ")"],
                [repoUrl, "main`touch " + marker + "`"]
            ];
            for (const [url, branch] of cases) {
                const result = git.cloneRepository(tmpdir(root, "build"), url, branch, git.baseEnv());
                expect(result.ok, url + " / " + branch).to.equal(false);
                expect(fs.existsSync(marker), url + " / " + branch).to.equal(false);
            }
        });

        it("(d) reports ok:false without throwing when git is not on PATH", function () {
            const git = newGit();
            const env = Object.assign(git.baseEnv(), { PATH: tmpdir(root, "emptybin") });
            const result = git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", env);
            expect(result.ok).to.equal(false);
        });

        it("(e) rejects empty, null and undefined url/branch before spawning git", function () {
            const git = newGit();
            const spy = spyOn(exec, "execFileSync").and.callThrough();
            const bad = ["", null, undefined];
            for (const value of bad) {
                const buildPath = tmpdir(root, "build");
                const r1 = git.cloneRepository(buildPath, value, "main", git.baseEnv());
                const r2 = git.cloneRepository(buildPath, repoUrl, value, git.baseEnv());
                expect(r1.ok).to.equal(false);
                expect(r1.reason).to.equal("invalid_input");
                expect(r2.ok).to.equal(false);
                expect(r2.reason).to.equal("invalid_input");
                expect(fs.readdirSync(buildPath)).to.deep.equal([]);
            }
            expect(spy.calls.count()).to.equal(0);
        });
    });

    describe("fetch", function () {

        it("(f) with no keys makes exactly one keyless attempt", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => [];
            const spy = spyOn(git, "cloneRepository").and.callThrough();
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(true);
            expect(spy.calls.count()).to.equal(1);
            const env = spy.calls.argsFor(0)[3];
            expect(env.GIT_SSH_COMMAND).to.equal(undefined);
            expect(env.GIT_ASKPASS).to.equal("false");
        });

        it("(g) with one key makes exactly one keyed attempt with the constant SSH env", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => ["k1"];
            let recorded = null;
            let askpassExisted = false;
            const spy = spyOn(git, "cloneRepository").and.callFake(function (b, u, br, env) {
                recorded = env;
                askpassExisted = fs.existsSync(env.SSH_ASKPASS);
                return Git.prototype.cloneRepository.call(git, b, u, br, env);
            });
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(true);
            expect(spy.calls.count()).to.equal(1);
            expect(recorded.GIT_SSH_COMMAND).to.equal(Git.SSH_COMMAND);
            expect(recorded.THINX_GIT_KEY).to.equal(path.join(keysDir, "k1"));
            expect(recorded.SSH_ASKPASS_REQUIRE).to.equal("force");
            expect(recorded.GIT_TERMINAL_PROMPT).to.equal("0");
            expect(recorded.GIT_ASKPASS).to.equal("false");
            expect(askpassExisted).to.equal(true);
            expect(fs.existsSync(recorded.SSH_ASKPASS)).to.equal(false);
            expect(fs.existsSync(path.dirname(recorded.SSH_ASKPASS))).to.equal(false);
        });

        it("(h) resolves false and still removes the askpass dir when an attempt throws", async function () {
            const git = newGit();
            git.keyNamesForOwner = () => ["k1"];
            let askpass = null;
            spyOn(git, "cloneRepository").and.callFake(function (b, u, br, env) {
                askpass = env.SSH_ASKPASS;
                throw new Error("boom");
            });
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(false);
            expect(typeof askpass).to.equal("string");
            expect(fs.existsSync(path.dirname(askpass))).to.equal(false);
        });
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
    });

});
