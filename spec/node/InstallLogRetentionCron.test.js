// Contract of scripts/install-log-retention-cron.sh, which enables the daily
// Phase 26 retention job on a fresh swarm manager.
//
// Every run points the installer at temp dirs (THINX_INSTALL_* overrides), so
// nothing here touches /usr/local/sbin or /etc/cron.d. The installer runs
// under the first `bash` on PATH; a missing bash fails the test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const INSTALLER = path.join(__dirname, "../../scripts/install-log-retention-cron.sh");
const WRAPPER_SRC = path.join(__dirname, "../../scripts/thinx-log-retention.sh");

let tmpRoot;
test.after(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function setup(name) {
    if (!tmpRoot) tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-retention-install-"));
    const dir = fs.mkdtempSync(path.join(tmpRoot, name + "-"));
    return {
        dir,
        sbin: path.join(dir, "sbin"),
        cronD: path.join(dir, "cron.d"),
        legacy: path.join(dir, "legacy-cron-daily-job"),
        get cronFile() { return path.join(this.cronD, "thinx-log-retention"); },
        get wrapper() { return path.join(this.sbin, "thinx-log-retention.sh"); }
    };
}

function run(t, args, extraEnv) {
    const env = Object.assign({}, process.env, {
        THINX_INSTALL_SKIP_ROOT_CHECK: "1",
        THINX_INSTALL_SBIN_DIR: t.sbin,
        THINX_INSTALL_CRON_D_DIR: t.cronD,
        THINX_INSTALL_LEGACY_JOB: t.legacy
    }, extraEnv || {});
    for (const name of ["THINX_RETENTION_DEPLOY_HOST", "THINX_RETENTION_REPOS_HOST", "THINX_RETENTION_SERVICE",
        "THINX_RETENTION_NETWORK", "COUCHDB_HOST", "THINX_PREFIX"]) {
        if (!extraEnv || !(name in extraEnv)) delete env[name];
    }
    const r = spawnSync("bash", [INSTALLER].concat(args || []), { env, encoding: "utf8" });
    assert.ok(!r.error, "bash must be available: " + (r.error && r.error.message));
    return { code: r.status, out: r.stdout, err: r.stderr, lines: r.stdout.trim().split("\n") };
}

function scheduleLines(file) {
    return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim() && !/^\s*#/.test(l) && !/^[A-Z_]+=/.test(l));
}

function mode(file) {
    return (fs.statSync(file).mode & 0o777).toString(8);
}

test("fresh install writes the wrapper and one 09:40 deploy,repos schedule line", () => {
    const t = setup("fresh");
    const r = run(t);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(r.lines[r.lines.length - 1], "LOG-RETENTION-CRON OK");
    assert.ok(r.lines.includes("wrapper=installed"));
    assert.ok(r.lines.includes("cron_d=installed"));
    assert.ok(r.lines.includes("schedule=9:40 --roots deploy,repos"));
    assert.equal(fs.readFileSync(t.wrapper, "utf8"), fs.readFileSync(WRAPPER_SRC, "utf8"));
    assert.equal(mode(t.wrapper), "755");
    assert.equal(mode(t.cronFile), "644");
    assert.deepEqual(scheduleLines(t.cronFile), ["40 9 * * * root " + t.wrapper + " --apply --roots deploy,repos"]);
    const body = fs.readFileSync(t.cronFile, "utf8");
    assert.match(body, /^SHELL=\/bin\/sh$/m);
    assert.match(body, /^PATH=\/usr\/local\/sbin:/m);
    assert.ok(body.endsWith("\n"), "cron files must end with a newline");
    assert.deepEqual(fs.readdirSync(t.cronD), ["thinx-log-retention"], "no .new file left behind");
});

test("a second run keeps the existing schedule, even with other options", () => {
    const t = setup("rerun");
    assert.equal(run(t).code, 0);
    const before = fs.readFileSync(t.cronFile, "utf8");
    const r = run(t, ["--roots", "repos", "--time", "10:10"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(r.lines.includes("wrapper=unchanged"));
    assert.ok(r.lines.includes("cron_d=kept"));
    assert.equal(fs.readFileSync(t.cronFile, "utf8"), before);
});

test("--force rewrites the schedule with the given roots and time", () => {
    const t = setup("force");
    assert.equal(run(t).code, 0);
    const r = run(t, ["--force", "--roots", "repos", "--time", "10:10"]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(r.lines.includes("cron_d=rewritten"));
    assert.deepEqual(scheduleLines(t.cronFile), ["10 10 * * * root " + t.wrapper + " --apply --roots repos"]);
});

test("a changed wrapper on the host is replaced with the repository copy", () => {
    const t = setup("update");
    fs.mkdirSync(t.sbin, { recursive: true });
    fs.writeFileSync(t.wrapper, "#!/bin/sh\necho old\n", { mode: 0o700 });
    const r = run(t);
    assert.equal(r.code, 0, r.out + r.err);
    assert.ok(r.lines.includes("wrapper=updated"));
    assert.equal(fs.readFileSync(t.wrapper, "utf8"), fs.readFileSync(WRAPPER_SRC, "utf8"));
    assert.equal(mode(t.wrapper), "755");
});

for (const [time, reason] of [["01:00", "time_in_compaction_window"], ["04:59", "time_in_compaction_window"],
    ["06:00", "time_in_unattended_upgrade_window"], ["06:25", "time_in_unattended_upgrade_window"],
    ["07:10", "time_in_unattended_upgrade_window"], ["9:40", "time_format"], ["24:00", "time_format"]]) {
    test("--time " + time + " is refused (" + reason + ") and nothing is written", () => {
        const t = setup("time");
        const r = run(t, ["--time", time]);
        assert.equal(r.code, 2);
        assert.ok(r.lines.includes("error=usage:" + reason), r.out);
        assert.ok(!fs.existsSync(t.cronD) && !fs.existsSync(t.sbin));
    });
}

for (const time of ["00:59", "05:00", "07:11", "23:59"]) {
    test("--time " + time + " is accepted", () => {
        const t = setup("time-ok");
        const [h, m] = time.split(":").map((x) => String(Number(x)));
        assert.equal(run(t, ["--time", time]).code, 0);
        assert.equal(scheduleLines(t.cronFile)[0].split(" ").slice(0, 2).join(" "), m + " " + h);
    });
}

test("an unknown --roots value is a usage error", () => {
    const t = setup("roots");
    const r = run(t, ["--roots", "deploy,repos,etc"]);
    assert.equal(r.code, 2);
    assert.ok(r.lines.includes("error=usage:roots"));
    assert.ok(!fs.existsSync(t.cronD));
});

test("wrapper settings in the environment are copied into the cron file", () => {
    const t = setup("env");
    const r = run(t, [], { THINX_RETENTION_DEPLOY_HOST: "/srv/thinx/deploy", COUCHDB_HOST: "thinx_couchdb" });
    assert.equal(r.code, 0, r.out + r.err);
    const body = fs.readFileSync(t.cronFile, "utf8");
    assert.match(body, /^THINX_RETENTION_DEPLOY_HOST=\/srv\/thinx\/deploy$/m);
    assert.match(body, /^COUCHDB_HOST=thinx_couchdb$/m);
    assert.doesNotMatch(body, /^THINX_RETENTION_REPOS_HOST=/m);
});

test("an environment value that could break the cron file is refused", () => {
    const t = setup("env-bad");
    const r = run(t, [], { THINX_RETENTION_DEPLOY_HOST: "/srv/x\n* * * * * root rm -rf /" });
    assert.equal(r.code, 1);
    assert.match(r.err, /unsafe_env_value:THINX_RETENTION_DEPLOY_HOST/);
    assert.ok(!fs.existsSync(t.cronFile), "no schedule written");
    assert.ok(!fs.existsSync(t.cronFile + ".new"), "no partial file left behind");
});

test("a legacy couchdb-log-retention job is reported, not touched", () => {
    const t = setup("legacy");
    fs.writeFileSync(t.legacy, "#!/bin/sh\n");
    const r = run(t);
    assert.equal(r.code, 0);
    assert.ok(r.lines.some((l) => l.startsWith("legacy_job=present")));
    assert.ok(fs.existsSync(t.legacy));
});

test("without the test override a non-root caller is refused", { skip: process.getuid && process.getuid() === 0 }, () => {
    const t = setup("nonroot");
    const r = run(t, [], { THINX_INSTALL_SKIP_ROOT_CHECK: "0" });
    assert.equal(r.code, 1);
    assert.ok(r.lines.includes("error=not_root"));
    assert.ok(!fs.existsSync(t.cronD) && !fs.existsSync(t.sbin));
});
