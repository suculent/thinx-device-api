// The jasmine suite must fail CI when a spec fails. `npm test` runs inside the
// compose `api` container, whose exit code the CircleCI test step checks, so the
// `test` script in package.json must exit with jasmine's own status in both
// branches (Coveralls upload and plain run). Stub `jasmine`, `nyc` and
// `coveralls` on PATH and run the real script text under /bin/sh.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const script = require("../../package.json").scripts.test;

function stubBin(dir, name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(p, 0o755);
}

function runTestScript(jasmineExit, withCoverallsToken) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thinx-testscript-"));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  stubBin(bin, "jasmine", `exit ${jasmineExit}`);
  // nyc runs its arguments (nyc jasmine) or, for `nyc report`, prints nothing.
  stubBin(bin, "nyc", 'if [ "$1" = "report" ]; then exit 0; fi; "$@"');
  stubBin(bin, "coveralls", "cat >/dev/null; exit 0");
  const env = { PATH: `${bin}:/usr/bin:/bin` };
  if (withCoverallsToken) env.COVERALLS_REPO_TOKEN = "stub";
  const r = spawnSync("/bin/sh", ["-c", script], { cwd: tmp, env, encoding: "utf8" });
  fs.rmSync(tmp, { recursive: true, force: true });
  return r.status;
}

for (const withToken of [false, true]) {
  const label = withToken ? "coveralls branch" : "plain branch";

  test(`npm test exits non-zero when jasmine fails (${label})`, () => {
    assert.notStrictEqual(runTestScript(1, withToken), 0);
  });

  test(`npm test keeps jasmine's incomplete status (${label})`, () => {
    // jasmine exits 2 for an incomplete run (no specs found, fit/fdescribe).
    assert.strictEqual(runTestScript(2, withToken), 2);
  });

  test(`npm test exits 0 when jasmine passes (${label})`, () => {
    assert.strictEqual(runTestScript(0, withToken), 0);
  });
}
