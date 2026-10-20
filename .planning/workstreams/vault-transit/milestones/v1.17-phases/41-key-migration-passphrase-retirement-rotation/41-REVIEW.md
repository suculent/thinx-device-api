---
phase: 41-key-migration-passphrase-retirement-rotation
reviewed: 2026-10-20T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - Dockerfile
  - Dockerfile.test
  - docker-compose.test.yml
  - docker-compose.yml
  - docker-swarm.yml
  - lib/thinx/git.js
  - lib/thinx/rsakey.js
  - lib/thinx/transit.js
  - scripts/migrate-deploy-keys.js
  - scripts/purge-orphaned-rsa-keys.js
  - spec/fixtures/fake-transit.js
  - spec/fixtures/mock-openbao.js
  - spec/jasmine/03-RsakeySpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/MigrateDeployKeysSpec.js
  - spec/jasmine/PassphraseRetiredSpec.js
  - spec/jasmine/SecretsSweepSpec.js
  - spec/jasmine/TransitSpec.js
  - spec/node/DeployKeyNames.test.js
  - /Users/sychram/Repositories/thinx-swarm/thinx.yml
  - /Users/sychram/Repositories/thinx-swarm/tests/openbao-api-wiring.test.sh
  - /Users/sychram/Repositories/thinx-swarm/scripts/openbao-verify.sh
findings:
  critical: 0
  warning: 6
  info: 9
  total: 15
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-10-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Scope: `git diff 86e176c5..HEAD` for the parent-repo files and `git -C thinx-swarm show 48581e9` for the three
sibling files. I read the changed files in full where the change was substantial (migrate-deploy-keys.js, transit.js,
the git.js fetch path, the wiring gate). I also followed the helpers they call: `keyformat.readKey/detect`,
`rsakey.keyStillListed`, `git.cloneHoldingLock`, `git.orderKeys` and the wiring self-test harness.

Key handling is mostly sound:
- No plaintext, PEM or ciphertext reaches a log line or a report. Report and text output carry only owner IDs, key
  timestamps, reason classes and counts.
- The rewrap verifies that the old and new ciphertexts decrypt to the same bytes. It replaces the file only when the
  bytes are unchanged since the scan, and it handles a revoke that races the rename.
- D-13 reason classes compare the error text by exact equality, and `retired_version` uses its own one-shot latch.
- The passphrase is gone from the image, the compose files and both stack files.
- The live gate `openbao-verify.sh` `API_PASSPHRASE_ABSENT` check and the `--live` flags 6 and 8 fail closed.

Main concerns:
1. The atomic replace never checks that the temp file holds the full ciphertext before renaming it over the only
   good copy (WR-01).
2. `--rewrap` exits 0 while silently skipping unreadable Transit files. Its exit code is what the operator trusts
   before raising `min_decryption_version` (WR-02).
3. The rewrap abort set has drifted from the service-level classes that git.js and transit.js document (WR-03).
4. An owner left with only a legacy key gets no build attempt and no visible reason (WR-04).
5. In the swarm source gate, `PASSPHRASE_ABSENT` can be bypassed, and the new self-test cases would pass even if
   that check were deleted (WR-05, WR-06).

No BLOCKER-class defect was proven. The Phase 41 live operations (rewrap, min raise to v2, shred) are already done,
so the warnings mostly affect the next rotation (runbook section 12) and later regressions.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The rewrap renames a temp file over the only good ciphertext without checking that it was fully written

**File:** `scripts/migrate-deploy-keys.js:253-265`
**Issue:** `replaceFile` writes the new ciphertext with a single `fs.writeSync(fd, line + '\n')` and ignores the
returned byte count. `fs.writeSync` is one write(2) call and may write less than the full buffer; on the GlusterFS
FUSE mount behind `/mnt/data/ssh_keys` that is not purely theoretical. Nothing reads the temp file back before
`renameSync`. `unchangedSinceScan` re-hashes the ORIGINAL file, not the temp. A short or corrupted write would
therefore be renamed over the only good copy of the deploy key. The decrypt check at lines 384-385 ran against
`fresh.ciphertext` in memory, not against what reached the disk. After the operator raises `min_decryption_version`,
the old ciphertext is gone too, and the key is lost (the owner must regenerate it). The rename is also not durable:
the directory is never fsynced, so after a crash the old name can come back pointing at the old version, which the
raised minimum then refuses.
**Fix:**
```js
const payload = Buffer.from(line + '\n', 'utf8');
let off = 0;
while (off < payload.length) off += fs.writeSync(fd, payload, off, payload.length - off);
fs.fsyncSync(fd);
fs.closeSync(fd); fd = null;
// read-back: the temp must hold exactly the verified ciphertext
const back = readFileBounded(tmp);
if (!back.ok || back.sha256 !== crypto.createHash('sha256').update(payload).digest('hex')) { /* unlink tmp */ return 'write_failed'; }
...
fs.renameSync(tmp, entry.path);
const dfd = fs.openSync(env.sshKeysDir, 'r'); try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
```

### WR-02: `--rewrap` exits 0 while unreadable Transit files and files changed mid-run are still below the latest version

**File:** `scripts/migrate-deploy-keys.js:166-168, 351, 404-405, 501-504`
**Issue:**
- `rewrap()` only acts on entries with `kind === 'transit'` (line 351). A key file that `scan()` could not read
  (cause `read_error`, `not_regular` or `too_large`, which includes a transient EACCES or EIO on the gluster volume)
  becomes `kind: 'unreadable'`. It is never attempted, is not counted in `failed`, and `exitCode()` returns 0. The
  same applies to `changed_during_run` (line 405), which never affects the exit code.
- `versions_after` comes from a second `scan()` that again cannot see the unreadable files.
- The header (lines 25-27, 43) promises that the run "rewraps every Transit file below it" with "Exit 0 = success".
  An operator who gates `min_decryption_version` on exit 0 (runbook section 12) retires keys that were never
  rewrapped.
**Fix:** In rewrap mode, treat every entry that is not `transit`/`legacy`/`unknown` as a failure (`fail(entry,
entry.cause)`). Make `exitCode` return 1 when `changed_during_run > 0`, unless `versions_after` holds only
`'v' + latest`. Alternatively, add an explicit `safe_to_raise: true|false` field that requires `unreadable === 0`,
`failed === 0` and `Object.keys(versions_after)` equal to `['v' + latest]`, and make the runbook gate on it.

### WR-03: The rewrap abort set leaves out the service-level classes that git.js and transit.js define

**File:** `scripts/migrate-deploy-keys.js:77-78, 386-390`
**Issue:**
- `ABORT_CLASSES` is `unreachable, sealed, tls, not_configured, denied`.
- In the same phase, transit.js documents `key_missing` as "service level: it opens the D-05 incident like an
  outage" (transit.js:31-32). git.js `SERVICE_DOWN_REASONS` includes `key_missing`, and `serviceDownFor` also treats
  a `server_error` raised by the AppRole login (`e.op === 'login'`) as service-wide (git.js:33-39).
- If either happens mid-rewrap (the key deleted, or the login backend returning 5xx on a token refresh), the script
  goes on to the next file. `server_error` is in transit's `RETRYABLE`, so each remaining file costs up to
  login + rewrap + login + rewrap against a failing service.
- Every file is then reported with a per-key cause instead of a single `aborted`. The header's contract that a
  service failure means "nothing more is written and every untried file counts as failed" does not hold for these
  classes.
**Fix:** Share one predicate with git.js:
```js
function serviceDown(e) {
  const r = transitReason(e);
  return ABORT_CLASSES.has(r) || r === 'key_missing' || (r === 'server_error' && e && e.op === 'login');
}
...
if (serviceDown(e)) rep.aborted = reason;
```
Exporting `serviceDownFor` from git.js (or moving it to transit.js) keeps the two lists from drifting again.

### WR-04: An owner left with only a legacy (or other skipped) key gets no build attempt and no visible reason

**File:** `lib/thinx/git.js:780, 786-815`
**Issue:**
- Before Phase 41, a legacy PEM key was cloned through the askpass path. Now it is logged as
  `legacy_format_unsupported` and skipped.
- When an owner's directory listing is non-empty but every entry is skipped (only a legacy file restored from a
  backup, an unknown or unreadable file, or a key that is `retired_version` after the min raise), the loop makes no
  clone at all, not even the keyless attempt that an owner with zero keys gets (line 788-792). It returns
  `{ ok: false, keyUnavailable: null }`.
- Consequences:
  - A public HTTPS repository that cloned fine before now fails to build.
  - `keyUnavailable: null` means the build-failure path shows no "key service" sentence. The owner gets no signal
    that they must regenerate the key, which the D-07/D-09 recovery depends on (migrate-deploy-keys.js:10-12).
  - For legacy files nothing alerts the operator either. D-09 deliberately raises no alert.
**Fix:** Track whether any keyed attempt actually ran. If none did, fall back to the keyless clone (as for zero
keys), and return a distinct cause such as `keyUnavailable: "legacy_format_unsupported"` (with a matching sentence)
so that the console tells the owner to regenerate the key:
```js
let attempted = false;
...
if (key.kind === "transit") { attempted = true; ... }
...
if (!attempted) {
  const ok = (await this.cloneHoldingLock(buildPath, url, branch, this.baseEnv())).ok === true;
  return { ok, keyUnavailable: ok ? null : (sawLegacy ? "legacy_format_unsupported" : keyUnavailable) };
}
```

### WR-05: In the swarm source gate, `PASSPHRASE_ABSENT` can be bypassed by an aliased or long-form secret, an `env_file`, or another service

**File:** `/Users/sychram/Repositories/thinx-swarm/tests/openbao-api-wiring.test.sh:100-106`
**Issue:** The check only looks for:
- a top-level secret KEY named `GIT_KEY_PASSPHRASE`,
- an api secret whose `source` is that name,
- an api `environment` list entry starting with it.

It misses all of these:
- `secrets: { gkp: { external: true, name: GIT_KEY_PASSPHRASE } }` combined with
  `api.secrets: [{source: gkp, target: GIT_KEY_PASSPHRASE}]`, which mounts the real swarm secret at
  `/run/secrets/GIT_KEY_PASSPHRASE`;
- an `env_file:` on the api;
- the passphrase set on any other service (the worker has `docker.sock` and binds `/mnt/gluster/thinx`).

`BASELINE_UNCHANGED` happens to catch these today, because any new key or entry differs from the Phase 39 baseline.
But the dedicated check is the one the commit message and runbook name as the KEYMIG-02 gate. Once the baseline is
rebased (as it will be when Phase 39 baselines are retired), the absence guarantee is gone. The `--live` check does
not have this gap: `openbao-verify.sh` matches `.SecretName` or `.File.Name`.
**Fix:**
```jq
([(.secrets // {}) | to_entries[] | select(.key == "GIT_KEY_PASSPHRASE" or .value.name == "GIT_KEY_PASSPHRASE")] | length == 0)
and ([(.services // {})[] | (.secrets // [])[] | select((type == "string" and . == "GIT_KEY_PASSPHRASE")
      or (type == "object" and (.source == "GIT_KEY_PASSPHRASE" or .target == "GIT_KEY_PASSPHRASE")))] | length == 0)
and ([(.services // {})[] | (.environment // []) | if type == "object" then keys[] else .[] | split("=")[0] end
      | select(. == "GIT_KEY_PASSPHRASE")] | length == 0)
and ([(.services.api.env_file // empty)] | length == 0)
```

### WR-06: The new passphrase self-test cases do not test `PASSPHRASE_ABSENT`

**File:** `/Users/sychram/Repositories/thinx-swarm/tests/openbao-api-wiring.test.sh:176-186`
**Issue:**
- `cmd_self_test` counts a mutation as refused when ANY check fails (`exit "$FAILS"` non-zero). The three new cases
  (`passphrase-env-readded`, `passphrase-secret-readded`, `passphrase-secret-declared`) mutate only the current
  swarm file.
- `JQ_RETIRED` strips those entries from the BASELINE side only, and `JQ_STRIP` does not strip them from the
  current side, so each mutation also fails `BASELINE_UNCHANGED`, and `FILES_MATCH` would not save it.
- As a result, the self-test still reports "18/18 mutations refused" if the `PASSPHRASE_ABSENT` block is deleted or
  its jq is broken (for example `index(...) != null` instead of `== null`). The self-test gives no evidence that
  the new gate works, which is the whole point of mutation cases.
**Fix:** Let each case name the check that must fail, and assert on that code:
```bash
passphrase-env-readded|PASSPHRASE_PRESENT|.services.api.environment += [...]
...
out=$( (FAILS=0; contract ...; exit "$FAILS") 2>&1 ) && bad SELF_TEST_NOT_REFUSED "$name"
grep -q "^WIRING $want FAIL" <<<"$out" || bad SELF_TEST_WRONG_CHECK "$name (expected $want)"
```
Also add the aliased-secret case from WR-05.

## Info

### IN-01: The `retired_version` latch tests a timestamp for truthiness

**File:** `lib/thinx/transit.js:357`
**Issue:** `if (this._retiredAlertedAt) return;` treats a `now()` of 0 as "not yet alerted". With an injected clock
that starts at 0, every retired decrypt posts an alert.
**Fix:** `if (this._retiredAlertedAt !== null) return;`

### IN-02: A login started by `probe()` stamps `op: "probe"`, which `serviceDownFor` does not recognise

**File:** `lib/thinx/transit.js:290-296`, `lib/thinx/git.js:36-39`
**Issue:** The login is single-flight. When the boot probe started it, a concurrent `decryptKey` receives the same
TransitError with `op === "probe"`. A login `server_error` is then treated as per-key in git.js, and each remaining
key is tried again.
**Fix:** `return reason === "server_error" && e && (e.op === "login" || e.op === "probe");`

### IN-03: The CLI exits before any Slack alert raised during `--rewrap` can be sent

**File:** `scripts/migrate-deploy-keys.js:573, 665-672`
**Issue:** `cliEnv()` uses `Transit.shared()`, which has Slack enabled. `_post` sends fire-and-forget, and
`process.exit(code)` runs as soon as `main` resolves. That kills any send still in flight, so the FAILING or
RETIRED_VERSION alert from a rewrap is usually lost, but it can still go out. Either disable Slack for the CLI as the
canary modes do, or let the sends finish before exiting.
**Fix:** Use `new Transit({ webhook: null, log: ... })` in `cliEnv()`, or set `process.exitCode` and let the loop
drain.

### IN-04: An aborted rewrap counts files already at the latest version as `not_attempted` failures

**File:** `scripts/migrate-deploy-keys.js:362-369`
**Issue:** The `aborted` check runs before the `entry.version >= latest` check. After a mid-run abort, files that
needed no work are listed as failures, which makes `failed` and `failures[]` overstate the damage.
**Fix:** Check `entry.version >= latest` (when `latest !== null`) before the abort check.

### IN-05: The rewrap has no lock, and the leftover-temp sweep deletes a concurrent run's temp file

**File:** `scripts/migrate-deploy-keys.js:286-298, 353`
**Issue:** Two `--rewrap` runs at the same time (for example, an operator retrying while the first run hangs on a
timeout) can delete each other's in-flight `.keymig.tmp`. The other run then fails with `write_failed`. There is no
corruption, but the result is confusing.
**Fix:** Take an exclusive `O_EXCL` lock file in the key directory for the duration of `--rewrap`.

### IN-06: `LEFTOVER_TMP` only matches temp files of names that fit `KEY_NAME`

**File:** `scripts/migrate-deploy-keys.js:73, 229`
**Issue:** `tempPathFor` uses `entry.name` verbatim. `KEY_NAME` is still optional at line 155 (`m ? m[2] : ...`),
so a listed name that does not fit `<64hex>-<digits>` produces a temp file that is never reported or swept.
**Fix:** Skip (and fail) entries whose name does not match `KEY_NAME` in rewrap mode, or widen the sweep regex.

### IN-07: The retirement gate does not scan shell scripts or the CI config

**File:** `spec/jasmine/PassphraseRetiredSpec.js:63-72`
**Issue:** `fileSet()` covers `lib/**/*.js`, `scripts/**/*.js`, the Dockerfiles and the compose and swarm files. It
does not cover `docker-entrypoint.sh`, `copy-envs.sh`, `scripts/*.sh`, `scripts/stack-deploy` or
`.circleci/config.yml`, the places where an env var or build arg would most plausibly be reintroduced.
**Fix:** Add the root `*.sh`, `scripts/*` (any extension) and `.circleci/config.yml` to the file set.

### IN-08: Spec case (11) replaces `console.log` without a guaranteed restore

**File:** `spec/jasmine/03-RsakeySpec.js:229-238`
**Issue:** `console.log` is restored only inside the `generate` callback. If `generate` throws synchronously or never
calls back, the spec times out with `console.log` still swallowed for every later spec in the run, which hides
diagnostics.
**Fix:** Use `spyOn(console, "log").and.callFake(...)`, which Jasmine restores automatically, as GitSpec's
`captureLog()` does.

### IN-09: The CI API container carries the OpenBao dev root token in its env, and git children inherit it

**File:** `docker-compose.test.yml:182-186`, `lib/thinx/git.js:358-372`
**Issue:** `BAO_DEV_ADMIN_TOKEN` (plus `BAO_ROLE_ID` and `BAO_SECRET_ID`) is set on the whole API test service.
`baseEnv()` copies `process.env` and strips only `/PASSPHRASE/i`, askpass and agent names, so every git and ssh child
spawned in CI receives an admin token. This is CI only and the token is a throwaway, but the Phase 41 env scrub is a
narrow name denylist where an allowlist (or at least stripping `BAO_*`, `*_TOKEN`, `*_SECRET*`) would also cover
production secrets that come in through env.
**Fix:** Pass the admin token only to the rotation spec's process (for example through `scripts/openbao-dev.sh run`),
and extend `baseEnv()` to drop `^(BAO|VAULT)_` and `TOKEN|SECRET|PASSWORD|KEY$` names.

---

_Reviewed: 2026-10-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
