// Phase 26 (LOG-04, D-16, D-17): contract of scripts/thinx-log-retention.sh,
// the host wrapper plan 26-08 installs on the swarm manager.
//
// A temp dir goes first on PATH with a fake `docker` (records its argv, answers
// `service inspect`, `image inspect`, `pull` and `run`) and a fake `flock`.
// Nothing here runs a real container or touches /var. The wrapper runs under
// the first `bash` on PATH; a missing bash fails the test instead of skipping,
// so a green run is never vacuous.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const WRAPPER = path.join(__dirname, "../../scripts/thinx-log-retention.sh");
const SECRET = "s3cr3t-value";
const IMAGE = "registry.example.test:5000/thinx/api:swarm@sha256:" + "ab".repeat(32);
const SEP = "\x1f";

let tmpRoot;

test.after(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const FAKE_DOCKER = [
    "#!/usr/bin/env bash",
    "# Fake docker: one line per call, args joined by \\x1f.",
    "( IFS=$'\\x1f'; printf '%s\\n' \"$*\" ) >> \"$FAKE_CALLS\"",
    "case \"$1 $2\" in",
    "  'service inspect')",
    "    case \"$*\" in",
    "      *ContainerSpec.Image*) [ -n \"${FAKE_NO_IMAGE:-}\" ] || printf '%s\\n' \"$FAKE_IMAGE\" ;;",
    "      *ContainerSpec.Env*)",
    "        printf 'NODE_ENV=production\\n'",
    "        printf 'COUCHDB_USER=u\\n'",
    "        [ -n \"${FAKE_NO_PASS:-}\" ] || printf 'COUCHDB_PASS=%s\\n' \"$FAKE_SECRET\"",
    "        printf 'ENVIRONMENT=production\\n' ;;",
    "    esac",
    "    exit 0 ;;",
    "  'image inspect') exit \"${FAKE_IMAGE_INSPECT_RC:-0}\" ;;",
    "esac",
    "case \"$1\" in",
    "  pull) exit \"${FAKE_PULL_RC:-0}\" ;;",
    "  run)",
    "    # Record which credentials reached the docker process env (names only).",
    "    { [ -n \"${COUCHDB_USER:-}\" ] && echo user_set; [ \"${COUCHDB_PASS:-}\" = \"$FAKE_SECRET\" ] && echo pass_set; } > \"$FAKE_ENV_SEEN\"",
    "    printf '%s' \"${FAKE_RUN_OUT:-}\"",
    "    exit \"${FAKE_RUN_RC:-0}\" ;;",
    "esac",
    "exit 0",
    ""
].join("\n");

function setup(name) {
    if (!tmpRoot) tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-retention-wrapper-"));
    const dir = fs.mkdtempSync(path.join(tmpRoot, name + "-"));
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "docker"), FAKE_DOCKER, { mode: 0o755 });
    return { dir, bin, calls: path.join(dir, "calls.txt"), envSeen: path.join(dir, "env-seen.txt"), log: path.join(dir, "log", "retention.log"), lock: path.join(dir, "lock", "retention.lock") };
}

function fakeFlock(ctx, rc) {
    fs.writeFileSync(path.join(ctx.bin, "flock"), "#!/usr/bin/env bash\nexit " + rc + "\n", { mode: 0o755 });
}

function runWrapper(ctx, args, extraEnv) {
    const env = Object.assign({}, {
        PATH: ctx.bin + path.delimiter + process.env.PATH,
        HOME: ctx.dir,
        THINX_RETENTION_LOG: ctx.log,
        THINX_RETENTION_LOCK: ctx.lock,
        FAKE_CALLS: ctx.calls,
        FAKE_ENV_SEEN: ctx.envSeen,
        FAKE_IMAGE: IMAGE,
        FAKE_SECRET: SECRET
    }, extraEnv || {});
    const r = spawnSync("bash", [WRAPPER].concat(args), { env, encoding: "utf8", timeout: 20000 });
    assert.equal(r.error, undefined, "bash must be available on PATH: " + (r.error && r.error.code));
    return r;
}

function calls(ctx) {
    if (!fs.existsSync(ctx.calls)) return [];
    return fs.readFileSync(ctx.calls, "utf8").split("\n").filter((l) => l.length > 0).map((l) => l.split(SEP));
}

function runCall(ctx) {
    const runs = calls(ctx).filter((c) => c[0] === "run");
    return runs.length === 1 ? runs[0] : (runs.length === 0 ? null : assert.fail("more than one docker run"));
}

function mounts(argv) {
    const out = [];
    for (let i = 0; i < argv.length - 1; i++) if (argv[i] === "-v") out.push(argv[i + 1]);
    return out;
}

function mountFor(argv, target) {
    const m = mounts(argv).filter((v) => v.split(":")[1] === target);
    assert.equal(m.length, 1, "exactly one mount for " + target);
    return m[0];
}

function pairIndex(argv, a, b) {
    for (let i = 0; i < argv.length - 1; i++) if (argv[i] === a && argv[i + 1] === b) return i;
    return -1;
}

const DRY_OK = "mode=dry-run\ncutoff=2025-10-01\norphan_sweep=ran\nLOG-RETENTION DRY-RUN OK\n";
const APPLY_OK = "mode=apply\nroots=deploy\nLOG-RETENTION APPLY OK\n";

test("dry run: one-shot container, credentials by name, both mounts read-only, OK line accepted", () => {
    const ctx = setup("dry");
    fakeFlock(ctx, 0);
    const r = runWrapper(ctx, [], { FAKE_RUN_OUT: DRY_OK, FAKE_RUN_RC: "0" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const argv = runCall(ctx);
    assert.ok(argv, "docker run was called");
    assert.ok(argv.includes("--rm"));
    assert.notEqual(pairIndex(argv, "--network", "thinx_internal"), -1);
    assert.notEqual(pairIndex(argv, "--memory", "256m"), -1);
    assert.notEqual(pairIndex(argv, "--entrypoint", "node"), -1);
    assert.notEqual(pairIndex(argv, "-e", "COUCHDB_PASS"), -1, "-e COUCHDB_PASS by name");
    assert.notEqual(pairIndex(argv, "-e", "COUCHDB_USER"), -1, "-e COUCHDB_USER by name");
    assert.ok(mountFor(argv, "/mnt/data/deploy").endsWith(":ro"));
    assert.ok(mountFor(argv, "/mnt/data/repos").endsWith(":ro"));
    const img = argv.indexOf(IMAGE);
    assert.notEqual(img, -1, "image ref of the service");
    assert.equal(argv[img + 1], "scripts/log-retention.js");
    assert.equal(argv.length, img + 2, "no argument after the script");
    // The value never reaches argv, stdout or the log, but it is in the docker process env.
    for (const c of calls(ctx)) assert.ok(!c.join(" ").includes(SECRET), "secret in docker argv");
    assert.ok(!r.stdout.includes(SECRET) && !r.stderr.includes(SECRET));
    const log = fs.readFileSync(ctx.log, "utf8");
    assert.ok(!log.includes(SECRET));
    assert.match(log, /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] thinx-log-retention/m);
    assert.match(log, /^LOG-RETENTION DRY-RUN OK$/m);
    assert.deepEqual(fs.readFileSync(ctx.envSeen, "utf8").trim().split("\n"), ["user_set", "pass_set"]);
    assert.match(r.stdout, /LOG-RETENTION DRY-RUN OK/);
});

test("empty output with rc 0 is a failure (exit 1, `wrapper: run failed` in the log)", () => {
    const ctx = setup("empty");
    fakeFlock(ctx, 0);
    const r = runWrapper(ctx, [], { FAKE_RUN_OUT: "", FAKE_RUN_RC: "0" });
    assert.equal(r.status, 1);
    assert.match(fs.readFileSync(ctx.log, "utf8"), /wrapper: run failed/);
});

test("a non-zero container exit, or a last line other than an OK line, is a failure", () => {
    const ctx = setup("rc");
    fakeFlock(ctx, 0);
    const a = runWrapper(ctx, [], { FAKE_RUN_OUT: DRY_OK, FAKE_RUN_RC: "1" });
    assert.equal(a.status, 1);
    const b = runWrapper(ctx, ["--apply", "--roots", "deploy"], { FAKE_RUN_OUT: "mode=apply\nLOG-RETENTION APPLY INCOMPLETE\n", FAKE_RUN_RC: "0" });
    assert.equal(b.status, 1);
    const c = runWrapper(ctx, [], { FAKE_RUN_OUT: "LOG-RETENTION DRY-RUN OK\ntrailing noise\n", FAKE_RUN_RC: "0" });
    assert.equal(c.status, 1);
    assert.equal((fs.readFileSync(ctx.log, "utf8").match(/wrapper: run failed/g) || []).length, 3);
});

test("--apply alone is a usage error (exit 2) and nothing runs", () => {
    const ctx = setup("apply-alone");
    fakeFlock(ctx, 0);
    for (const args of [["--apply"], ["--apply", "--roots", "bogus"], ["--apply", "--roots"], ["--roots", "deploy"], ["--no-audit"], ["--frobnicate"], ["--apply", "--roots", "none,deploy"]]) {
        const r = runWrapper(ctx, args, { FAKE_RUN_OUT: APPLY_OK });
        assert.equal(r.status, 2, args.join(" "));
    }
    assert.equal(calls(ctx).length, 0, "no docker call at all");
});

const MODES = [
    { roots: "deploy,repos", deploy: "rw", repos: "rw" },
    { roots: "deploy", deploy: "rw", repos: "ro" },
    { roots: "repos", deploy: "ro", repos: "rw" },
    { roots: "none", deploy: "ro", repos: "ro" }
];

for (const m of MODES) {
    test("--apply --roots " + m.roots + " mounts deploy " + m.deploy + " and repos " + m.repos + " and passes the arguments through", () => {
        const ctx = setup("apply-" + m.roots.replace(",", "-"));
        fakeFlock(ctx, 0);
        const r = runWrapper(ctx, ["--apply", "--roots", m.roots], { FAKE_RUN_OUT: APPLY_OK, FAKE_RUN_RC: "0" });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const argv = runCall(ctx);
        const d = mountFor(argv, "/mnt/data/deploy");
        const p = mountFor(argv, "/mnt/data/repos");
        assert.equal(d.endsWith(":ro"), m.deploy === "ro", d);
        assert.equal(p.endsWith(":ro"), m.repos === "ro", p);
        const s = argv.indexOf("scripts/log-retention.js");
        assert.deepEqual(argv.slice(s + 1), ["--apply", "--roots", m.roots]);
    });
}

test("--apply --roots deploy --no-audit is passed through unchanged", () => {
    const ctx = setup("no-audit");
    fakeFlock(ctx, 0);
    const r = runWrapper(ctx, ["--apply", "--roots", "deploy", "--no-audit"], { FAKE_RUN_OUT: APPLY_OK });
    assert.equal(r.status, 0);
    const argv = runCall(ctx);
    assert.deepEqual(argv.slice(argv.indexOf("scripts/log-retention.js") + 1), ["--apply", "--roots", "deploy", "--no-audit"]);
});

test("a service spec without COUCHDB_PASS is exit 1 and nothing runs", () => {
    const ctx = setup("no-pass");
    fakeFlock(ctx, 0);
    const r = runWrapper(ctx, [], { FAKE_NO_PASS: "1", FAKE_RUN_OUT: DRY_OK });
    assert.equal(r.status, 1);
    assert.equal(runCall(ctx), null);
    assert.match(fs.readFileSync(ctx.log, "utf8"), /wrapper: couchdb credentials not found/);
});

test("an unresolved service image is exit 1 and nothing runs", () => {
    const ctx = setup("no-image");
    fakeFlock(ctx, 0);
    const r = runWrapper(ctx, [], { FAKE_NO_IMAGE: "1", FAKE_RUN_OUT: DRY_OK });
    assert.equal(r.status, 1);
    assert.equal(runCall(ctx), null);
});

test("an absent image is pulled; a failed pull is exit 1 and nothing runs", () => {
    const ctx = setup("pull");
    fakeFlock(ctx, 0);
    const ok = runWrapper(ctx, [], { FAKE_IMAGE_INSPECT_RC: "1", FAKE_PULL_RC: "0", FAKE_RUN_OUT: DRY_OK });
    assert.equal(ok.status, 0);
    assert.ok(calls(ctx).some((c) => c[0] === "pull" && c[1] === IMAGE));
    const ctx2 = setup("pull-fail");
    fakeFlock(ctx2, 0);
    const bad = runWrapper(ctx2, [], { FAKE_IMAGE_INSPECT_RC: "1", FAKE_PULL_RC: "1", FAKE_RUN_OUT: DRY_OK });
    assert.equal(bad.status, 1);
    assert.equal(runCall(ctx2), null);
});

test("a busy lock exits 0 with a note and runs nothing", () => {
    const ctx = setup("busy");
    fakeFlock(ctx, 1);
    const r = runWrapper(ctx, [], { FAKE_RUN_OUT: DRY_OK });
    assert.equal(r.status, 0);
    assert.equal(calls(ctx).length, 0);
    assert.match(fs.readFileSync(ctx.log, "utf8"), /another run holds the lock/);
});

test("the service, network and host roots can be overridden", () => {
    const ctx = setup("override");
    fakeFlock(ctx, 0);
    const r = runWrapper(ctx, [], {
        FAKE_RUN_OUT: DRY_OK,
        THINX_RETENTION_SERVICE: "other_api",
        THINX_RETENTION_NETWORK: "other_net",
        THINX_RETENTION_DEPLOY_HOST: "/srv/d",
        THINX_RETENTION_REPOS_HOST: "/srv/r"
    });
    assert.equal(r.status, 0);
    assert.ok(calls(ctx).filter((c) => c[0] === "service").every((c) => c.includes("other_api")));
    const argv = runCall(ctx);
    assert.notEqual(pairIndex(argv, "--network", "other_net"), -1);
    assert.equal(mountFor(argv, "/mnt/data/deploy"), "/srv/d:/mnt/data/deploy:ro");
    assert.equal(mountFor(argv, "/mnt/data/repos"), "/srv/r:/mnt/data/repos:ro");
});
