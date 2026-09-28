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

        it("(a2) has applied the final modes by the time it reports ok:true", function () {
            // CR-01: the permission walk is part of the success contract, so
            // nothing may still be changing modes once the caller continues.
            const git = newGit();
            const result = git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", git.baseEnv());
            expect(result.ok).to.equal(true);
            expect(fs.statSync(result.repoPath).mode & 0o777).to.equal(0o777);
            expect(fs.statSync(path.join(result.repoPath, ".git", "objects")).mode & 0o777).to.equal(0o777);
            expect(fs.statSync(path.join(result.repoPath, "thinx.yml")).mode & 0o777).to.equal(0o766);
            expect(fs.statSync(path.join(result.repoPath, ".git", "HEAD")).mode & 0o777).to.equal(0o766);
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

    describe("symlink checkout (SEC-PATH-02, D-13)", function () {

        let checkout;

        beforeAll(() => {
            const git = newGit();
            const result = git.cloneRepository(tmpdir(root, "build"), repoUrl, "main", git.baseEnv());
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

        it("keeps GIT_SSH_COMMAND identical across keys and never relaxes host checking", function () {
            const git = newGit();
            const a = git.sshEnv("/keys/k1", "/tmp/a1");
            const b = git.sshEnv("/keys/k2", "/tmp/a2");
            expect(a.GIT_SSH_COMMAND).to.equal(Git.SSH_COMMAND);
            expect(b.GIT_SSH_COMMAND).to.equal(Git.SSH_COMMAND);
            expect(Git.SSH_COMMAND).to.not.match(/StrictHostKeyChecking=(no|off)/);
            expect(Git.SSH_COMMAND).to.not.include("/dev/null");
            expect(Git.SSH_COMMAND).to.include("StrictHostKeyChecking=accept-new");
        });

        it("points the learned option at the persistent file and the seeded option at the seed", function () {
            const dir = learnedDir();
            const git = newGit(undefined, { learnedKnownHostsDir: dir });
            const env = git.sshEnv("/keys/k1", "/tmp/a1");
            expect(env.THINX_GIT_LEARNED_KNOWN_HOSTS).to.equal(path.join(dir, "known_hosts"));
            expect(env.THINX_GIT_SEEDED_KNOWN_HOSTS).to.equal(seeded);
        });
    });

    describe("askpass and passphrase (T-23-02)", function () {

        const secrets = require("../../lib/thinx/secrets.js");
        const PASS = "spec-pass-XYZ";
        let saved;

        beforeEach(() => {
            saved = process.env.GIT_KEY_PASSPHRASE;
            process.env.GIT_KEY_PASSPHRASE = PASS;
            secrets._resetCacheForTests();
        });

        afterEach(() => {
            if (typeof (saved) === "undefined") delete process.env.GIT_KEY_PASSPHRASE;
            else process.env.GIT_KEY_PASSPHRASE = saved;
            secrets._resetCacheForTests();
        });

        it("keeps the passphrase out of the helper file and supplies it from env", function () {
            const git = newGit();
            const askpass = git.create_askfile();
            try {
                expect(fs.readFileSync(askpass, "utf8")).to.not.include(PASS);
                expect(fs.statSync(askpass).mode & 0o777).to.equal(0o700);
                const out = exec.execFileSync(askpass, [], { env: git.sshEnv(path.join(keysDir, "k1"), askpass), encoding: "utf8" });
                expect(out).to.equal(PASS + "\n");
            } finally {
                git.delete_askfile(askpass);
            }
            expect(fs.existsSync(path.dirname(askpass))).to.equal(false);
        });

        it("never hands the passphrase to an HTTP remote answering 401", async function () {
            const log = path.join(root, "auth-headers.log");
            fs.writeFileSync(log, "");
            // A separate process: fetch runs git through execFileSync, which
            // would block a server living on this process's event loop.
            const server = exec.spawn(process.execPath, ["-e",
                "const http=require('http'),fs=require('fs');const out=process.argv[1];" +
                "const s=http.createServer((q,r)=>{fs.appendFileSync(out,JSON.stringify(q.headers.authorization||null)+'\\n');" +
                "r.writeHead(401,{'WWW-Authenticate':'Basic realm=\"x\"'});r.end();});" +
                "s.listen(0,'127.0.0.1',()=>process.stdout.write(s.address().port+'\\n'));", log], { stdio: ["ignore", "pipe", "inherit"] });
            try {
                const port = await new Promise((resolve) => server.stdout.once("data", (d) => resolve(parseInt(String(d), 10))));
                const git = newGit(undefined, { gitTimeoutMs: 20000 });
                git.keyNamesForOwner = () => ["k1"];
                const ok = await git.fetch(OWNER, "http://127.0.0.1:" + port + "/r.git", "main", tmpdir(root, "build"));
                expect(ok).to.equal(false);
                const lines = fs.readFileSync(log, "utf8").split("\n").filter((l) => l.length > 0);
                expect(lines.length).to.be.at.least(1); // git did reach the remote
                for (const line of lines) {
                    const header = JSON.parse(line);
                    if (header === null) continue;
                    const decoded = Buffer.from(header.replace(/^Basic\s+/i, ""), "base64").toString("utf8");
                    expect(decoded).to.not.include(PASS);
                    expect(header).to.not.include(PASS);
                }
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
            spyOn(git, "cloneRepository").and.callFake((b, u, br, env) => ({ ok: path.basename(env.THINX_GIT_KEY) === "k2", repoPath: null, reason: null }));
            const ok = await git.fetch(OWNER, repoUrl, "main", tmpdir(root, "build"));
            expect(ok).to.equal(true);
            expect(sets.length).to.equal(1);
            expect(sets[0].slice(0, 4)).to.deep.equal(["gitkey:" + OWNER, "k2", "EX", 2592000]);
            expect(typeof sets[0][4]).to.equal("function");
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
