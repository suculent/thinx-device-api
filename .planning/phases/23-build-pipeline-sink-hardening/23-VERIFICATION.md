---
phase: 23-build-pipeline-sink-hardening
verified: 2026-09-28T22:10:37Z
status: passed
score: 5/5 roadmap success criteria verified (plan must-haves 44/44 code-level truths verified; debt-marker gate satisfied)
covered_files:
  - .planning/phases/23-build-pipeline-sink-hardening/23-01-PLAN.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-01-SUMMARY.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-02-PLAN.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-02-SUMMARY.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-03-PLAN.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-03-SUMMARY.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-04-PLAN.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-04-SUMMARY.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-05-PLAN.md
  - .planning/phases/23-build-pipeline-sink-hardening/23-05-SUMMARY.md
  - lib/router.build.js
  - lib/thinx/builder.js
  - lib/thinx/devices.js
  - lib/thinx/git.js
  - lib/thinx/notifier.js
  - lib/thinx/platform.js
  - lib/thinx/plugins/pine64/plugin.js
  - lib/thinx/queue.js
  - lib/thinx/safepath.js
  - lib/thinx/sanitka.js
  - lib/thinx/sources.js
  - package-lock.json
  - package.json
  - services/worker/class.js
  - services/worker/test.js
  - spec/jasmine/BuilderPathSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/SafePathSpec.js
  - spec/jasmine/SanitkaSpec.js
  - spec/jasmine/XBuilderSpec.js
covered_digest: "v2:sha256:87f62b69265d1841642dfa3ba1c564111b98a640087420dcabdb88d9d7b045a9"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  previous_verified_at: "191056e6 (2026-09-28T22:05:00Z)"
  refresh_reason: "Covered source changed: fc070578 (lib/thinx/builder.js, spec/jasmine/BuilderRemoteJobSpec.js)."
  human_items_resolved:
    - "Never refuse silently at the two run_build invalid_device exits: fc070578 adds the notifier push; verified below."
  earlier_gaps_closed:
    - "ROADMAP SC5 (second half): the rescan record now covers the deployed code. 23-SAST-DELTA.md has an addendum for CodeQL 1854830247 at 23466187 (#292-#297, each with a disposition) and a local Aikido aikido_scan_paths rerun of the phase files at 23466187 (a disposition per hit). The stale execFileSync wording is corrected."
    - "Debt-marker gate: the FIXMEs at queue.js:170 and notifier.js:249 now reference the committed follow-up todo (Part 3), and the todo lists both markers back."
  gaps_remaining: []
  regressions: []
human_verification:  # resolved; kept for the record, nothing outstanding
  - status: resolved
    test: "Judgment-tier prohibition (23-03): MUST NOT refuse silently. Decide whether the two early invalid_device exits in run_build (builder.js:876-890) may skip the websocket notifier."
    expected: "Both exits set build-log state 'error' and call back with the reason 'invalid_device'. That is exactly what 23-03-PLAN specifies for this exit (action text at line 294, truth at line 34) and what CONTEXT D-12 specifies ('callback(false, \"invalid_device\") before any mkdirp'), so this contradicts no must-have and no decision. The prohibition's parenthetical '(notifier + build-log state + callback reason)' is met by refuseBuild and runRemoteShell, but at these two exits only two of the three channels fire. The refusal is not silent: the HTTP caller gets the specific reason and the build log shows error. Advisory. If a notifier push is wanted, it is one this.notify(udid, build_id, notifiers, 'invalid_device', false) line per exit (notifiers is in scope)."
    why_human: "Judgment-tier prohibition. The autonomous verdict (holds in intent; the plan's own action text omits notify here) is non-authoritative, and neither production approval covered a refusal path."
    resolution: "User chose 'Add notify now' (2026-09-29). Re-verified at 9ca01b67: both exits (builder.js:875-892) now call this.notify(..., 'invalid_device', false) between blog.state(error) and the single callback(false, 'invalid_device'), before getLastAPIKey/createBuildPath/any secret write. The 2 new specs fail 2/2 against 191056e6 builder.js and pass at HEAD. Commit fc070578 adds this.notify(udid, build_id, notifiers, 'invalid_device', false) at both exits, with 2 specs in BuilderRemoteJobSpec that fail on the old code (247/0 hermetic). Deployed: thinx_api sha256:3beaf4f0..., 0 restarts, fix present in the container. All three channels now fire, so the prohibition is fully met."
---

# Phase 23: Build-Pipeline Sink Hardening Verification Report

> **2026-09-29, human verification resolved:** the only human item (notifier on the `invalid_device` exits) was fixed and deployed (`fc070578`). Status set to `passed`.
>
> **Re-verification refresh (2026-09-29, at `9ca01b67`):** the fingerprint was stale only because `fc070578` changed `lib/thinx/builder.js` and `spec/jasmine/BuilderRemoteJobSpec.js`. Re-checked below under "Refresh delta (fc070578)". No regression, and the judgment-tier "never refuse silently" prohibition is now fully met. Status stays `passed`, 5/5, fresh digest.

**Phase Goal:** A hostile or careless firmware repository can no longer inject shell commands or read or write files outside its build directory, and private-repository builds keep working.
**Verified:** 2026-09-28T22:10:37Z (refresh at `9ca01b67`; previous run 2026-09-28T22:05:00Z at `191056e6`)
**Status:** passed
**Re-verification:** Yes. This run refreshes the `191056e6` verification (human_needed, 5/5) after `fc070578`. That run followed gap closure (`46aef290` SAST addendum, `58562a80` FIXME references) of the gaps_found 4/5 run.

All five roadmap success criteria hold, both earlier record gaps are closed, and the one human item (the `invalid_device` notifier) was resolved by adding the notify call. Nothing is outstanding.

## Refresh delta (fc070578)

`git diff 191056e6..HEAD -- lib spec`: `lib/thinx/builder.js` +2, `spec/jasmine/BuilderRemoteJobSpec.js` +42. Nothing else in `lib`, `spec` or `services` changed (`git status` on those paths is clean).

| Check | Evidence | Result |
|---|---|---|
| 1. Change limited to the two exits, no regression | The diff is exactly two added lines, `this.notify(udid, build_id, notifiers, "invalid_device", false);`, one at each D-12 exit (builder.js:879, :890). Each exit still runs `console.log` → `blog.state(build_id, owner, udid, "error")` → `notify` → `return callback(false, "invalid_device")`, so there is one callback and it is still the return statement. Both exits are inside `devicelib.get` and before `getLastAPIKey` (:894), `createBuildPath` (:902) and any secret write, so no mkdirp or secret write happens. `notifiers` is the `run_build` parameter. `notify` → `sendNotificationIfSocketAlive` returns early when `notifiers.websocket` is undefined (queue.js passes `[]`) and wraps `send` in try/catch, so the added call cannot throw before the callback. This is the same call `runRemoteShell` already makes at :286. | ✓ |
| 2. New specs cover both exits | `describe("invalid_device refusals notify the owner")` (BuilderRemoteJobSpec:1273). The first spec (null BUILD_PATH from the device record) asserts callbacks `[[false,"invalid_device"]]`, notified `[[BUILD_ID,"invalid_device",false]]` and the last `BuildLog.state` arg `"error"`. The second spec (request owner does not match the device) asserts one callback and one notify. I ran them against `191056e6` builder.js in a throwaway worktree with the HEAD spec: **2 specs, 2 failures**. At HEAD they pass. | ✓ |
| 3. Hermetic tests | `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config=<Git,SafePath,BuilderPath,BuilderRemoteJob,Sanitka,Finder,JSON2H>`: **247 specs, 0 failures** (seed 97127), exit 0. That is 245 + 2. | ✓ |
| 4. "Never refuse silently" fully met | All three channels named in the prohibition (notifier, build-log state, callback reason) now fire at both `run_build` exits, as they already did in `refuseBuild` and `runRemoteShell`. | ✓ |

Info (not a gap): the second new spec does not re-assert `BuildLog.state` "error". That line is unchanged and is asserted by the first spec's exit, which uses the same pattern.

## Re-verification delta (previous run, `191056e6`)

| Previous gap | Closure evidence | Result |
|---|---|---|
| SC5: SAST record stale (c9385574) | `23-SAST-DELTA.md` "Addendum — post-review code (2026-09-28)". Checked against live GitHub code scanning below. | ✓ CLOSED |
| Debt-marker gate: queue.js:170, notifier.js:249 | `58562a80` references `.planning/todos/pending/2026-09-28-fix-worker-builder-service-polling-completion-detection.md` Part 3 on both lines, and the todo's Part 3 lists both file:line entries. | ✓ CLOSED |

Regression check: `git diff 23466187 HEAD -- lib services` shows only the two comment lines in queue.js and notifier.js (`node -c` passes on both). Hermetic specs were rerun: 245 specs, 0 failures (seed 09006).

### SC5 addendum, checked item by item

**CodeQL (live `gh api`, run by this verifier):**
- The latest analysis on `refs/heads/thinx-staging` is `1854830247` at `23466187`, with `results_count` 152 and `error` empty. Open alerts: 151. Dismissed alerts: `[#118, 2021-01-01]` only.
- Open staging alerts on phase files numbered from #286 up: #288 (builder.js:518), #289 (devices.js:71), #290 (sources.js:283), #292 (builder.js:1366), #293 (notifier.js:121), #294 (queue.js:475), #295 (sources.js:273), #296 (sources.js:279), #297 (git.js:381). #288-#290 are rows in the original table. #292-#297 each have a row in the addendum. Nothing is missing.
- #291, #151 and #243 are no longer open on staging. Accounting: 148 + 6 new − 3 gone = 151, which matches.
- The mappings hold:
  - #297 is the fixed-name `basename.json` write at git.js:380-381, the same statement as #291.
  - #292 is the same `owner.replace` line as #151.
  - #294 is the same worker-poll log line as #243 (queue.js:376 at c9385574). #243 is in the Phase 22 baseline JSON, so "pre-existing baseline alert, renumbered" is a valid reason.
  - #293 is the `loggableStatus` scalar-only whitelist at notifier.js:110-121.
  - #295 and #296 are reason-code log lines in sources.js.
- No new shell or file-read rule on any phase file.

**Aikido (local `aikido_scan_paths`, recorded in the addendum):**
- Every listed hit has a disposition. I checked each cited line against HEAD:
  - git.js:129 is the chmod walk. It lstats first and `continue`s on symlinks.
  - git.js:155 is the `path.resolve` lock key.
  - git.js:357, :380, :402 and :531 are the old rows 223, 235, 262 and 382, moved.
  - builder.js:210, :661, :1102, :1118, :1172 and :1528 are the old rows 207, 517, 935, 951, 1005 and 1343, moved.
  - builder.js:550 is the argv `spawn(..., {shell:false})`.
  - class.js:298 is the accepted legacy `cmd` residual (D-01/D-03).
  - queue.js:11 is the pre-existing stand-alone `express()`.
- The `execSync` sink is gone: grep of git.js finds only `exec.spawn("git", ...)` at :68 and `execFileSync("git", ["ls-files", ...])` at :403.
- The builder's repository reads and lstats are contained. The remaining `readFileSync` at :1118 reads the validated app-owned platform descriptor, and the `lstatSync` at :1528 is over the app-owned `languages/` directory. `thinx.yml` and the write-back go through `safepath`.
- The stale "clone and pull are `execFileSync`" wording is corrected in the addendum.
- No suppressions were added. The only dismissed alert is still #118. `scripts/aikido-known-false-positives.json` is unchanged (mtime 2026-09-20). The addendum adds no ignore entries.
- Limits of this check:
  - The verifier context has no Aikido MCP tool, so I could not rerun the scan independently. No scan JSON from 2026-09-28 is on disk.
  - The addendum does not list the 12 scanned files and does not give the `aikido-filter.js` scanned/remaining counts.
  - Per user direction (2026-09-28), the addendum's local scan is the substantiating scan for SC5. The weekly platform rescan is a non-blocking follow-up, not a gap and not a human item.

**Public-doc hygiene (judgment 23-05, check (c)):**
- Grep of the addendum for URLs, `@`, IPv4 addresses, `token`, `password`, `passphrase`, `html_url` and ssh port patterns finds nothing.
- No alert message bodies and no secrets. The content is rule ids, alert numbers, paths, lines, counts and dispositions.
- Like the original table, the addendum names the flagged constructs in short inline form (for example `spawn(command, {shell:true})`, `path.resolve(buildPath)`). This is public code from the same repository, identifies the line, and discloses nothing, so the confidentiality intent holds. **Satisfied.**

**Deploy discipline (judgment 23-05, check (b)):**
- 23-05-SUMMARY records Swarmpit auto-rolling both services and "No restart.sh, no stack deploy, no `docker service update` run" (lines 36, 92, 95, 123, 131).
- The user approved both production builds (lines 65, 104, 219).
- This verifier confirmed that `23466187` is not an ancestor of `origin/main`.
- **Satisfied by the SUMMARY evidence.**

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A private-repository build succeeds in production. git.js runs git argv-only with no shell string and no `ssh-agent sh -c`, using a constant GIT_SSH_COMMAND plus askpass and an explicit GIT_KEY_PASSPHRASE. A failing fetch reports `git_fetch_failed`; a successful one does not. | ✓ VERIFIED | Regression check: git.js unchanged since the previous run. `runGit` = `exec.spawn("git", args, {shell:false, detached:true})` (:68). The only other git call is `execFileSync("git", ["ls-files",...])` (:403). SSH_COMMAND is constant, and per-attempt values go in only as env. `prefetchPrivate` resolves `git_fetch_failed` only on a false fetch. GitSpec (j)/(k) pass (247/0 in the refresh run). Production proof: user-approved builds `43c748d0-…` and `17d30770-…` (23-05-SUMMARY). |
| 2 | The remote-builder command runs via argv, and `shell-escape` is gone from package.json and the lockfile. | ✓ VERIFIED | Regression check: `runRemoteShell` emits `argv`. The worker at `d6ca153` runs `BUILDER_PROGRAM` with `validateArgv` and `shell:false`. `shell-escape` is absent from package.json, package-lock.json and lib/. BuilderRemoteJobSpec is green. |
| 3 | A symlinked `thinx.yml`, or another file the builder reads, that points outside the build dir is refused on read and on the write-back. Specs cover the symlink case and the prefix sibling `…/abc` vs `…/abc-evil`. | ✓ VERIFIED | Regression check: safepath.js is unchanged. `loadRepoYaml` → `readFileInside` and `writeRepoFile` → `writeFileInside`. SafePathSpec and BuilderPathSpec symlink and prefix-sibling cases are green. |
| 4 | A `device.owner` / `device.udid` containing `../` or path characters cannot move BUILD_PATH outside the owner's build root. | ✓ VERIFIED | Regression check: `buildPathFor` (:204-212) uses strictOwner, udid and `isInside`. Both run_build checks come before mkdirp (:875-892; since `fc070578` each also notifies), and `runRemoteShell` refuses with `invalid_device`. BuilderPathSpec BAD cases are green. |
| 5 | Repositories are cloned with `core.symlinks=false`. A rescan (CodeQL plus local Aikido) no longer flags the git.js execSync sink or the builder readFileSync/lstatSync sinks, and remaining hits are recorded as app-owned false positives. | ✓ VERIFIED | core.symlinks is set on clone and pull (git.js:346-348, :361), and GitSpec is green. The rescan record is current: see "SC5 addendum, checked item by item" above. The live CodeQL analysis matches the addendum exactly, every Aikido row has a reason and matches the code at its line, the sink is gone, reads are contained, and there are no suppressions. |

**Score:** 5/5 roadmap truths verified (0 present-but-behavior-unverified).

### Plan must-haves (23-01..05)

| Plan | Truths | Status | Notes |
|------|--------|--------|-------|
| 23-01 git.js contract | 12 | ✓ all verified (intent) | Unchanged from the previous run. The literal `execFileSync` is superseded by WR-03's async `spawn`, which keeps the same argv-only, no-shell property. The addendum now records this too. |
| 23-02 worker argv | 8 | ✓ all verified | Unchanged. |
| 23-03 safepath / BUILD_PATH | 11 | ✓ all verified | Unchanged. |
| 23-04 API argv + shell-escape | 7 | ✓ all verified | Unchanged. |
| 23-05 deploy + SAST | 9 | ✓ all verified | The previously stale "every remaining hit has a row" truth is now current through the addendum. |

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|-------------|------|-------------|----------|
| Never expose GIT_KEY_PASSPHRASE | test | ✓ verified | GitSpec :549, :563 |
| Never weaken host-key verification | test | ✓ verified | GitSpec :466-:522 |
| No key material in Redis; no foreign cached key | test | ✓ verified | GitSpec :607-:633 |
| Worker never runs a job-named program | test | ✓ verified | worker test.js `(c)` table |
| No Wi-Fi write-back through a symlink; cleanupSecrets on refusal | test | ✓ verified | BuilderPathSpec :95, :201, :309 |
| No normalisation of owner/udid | test | ✓ verified | BuilderPathSpec "never rewrites an input" |
| API never chooses the program | test | ✓ verified | BuilderRemoteJobSpec :164 |
| No dismissals, suppressions or scanner-ignore entries | test | ✓ verified | Live dismissed list is still [#118, 2021]. The addendum adds no suppressions. The known-false-positive file is unchanged. |
| Never refuse silently | judgment | ✓ satisfied (human decision 2026-09-29: add notify; implemented and re-verified) | All three channels fire at builder.js:875-892 (`fc070578`), and 2 specs fail on the old code. See "Refresh delta". |
| No restart.sh / stack deploy / push to main | judgment | ✓ satisfied (SUMMARY evidence plus the ancestry check) | 23-05-SUMMARY :36, :92, :95; `23466187` is not on origin/main |
| No sensitive text in the public delta doc | judgment | ✓ satisfied | The hygiene check above covers both the original and the addendum. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/thinx/git.js` | argv git routine, SSH_COMMAND, known-hosts, askpass, key order | ✓ VERIFIED | unchanged since 23466187 |
| `lib/thinx/safepath.js` | contained read/write/unlink helpers | ✓ VERIFIED | unchanged |
| `lib/thinx/builder.js` | buildPathFor, loadRepoYaml, writeRepoFile, refuseBuild, argv job | ✓ VERIFIED | Only change is the 2 notify lines from `fc070578`. |
| `lib/thinx/sanitka.js` | strictOwner | ✓ VERIFIED | unchanged |
| `services/worker/class.js` | BUILDER_PROGRAM, validateArgv, runArgv | ✓ VERIFIED | submodule at d6ca153 |
| `package.json` / `package-lock.json` | no shell-escape | ✓ VERIFIED | grep finds nothing |
| Specs (Git, SafePath, BuilderPath, BuilderRemoteJob) | hermetic | ✓ VERIFIED | 247 / 0 in this run (+2 invalid_device notify specs) |
| `23-SAST-DELTA.md` | before/after and remaining-hits table for the deployed code | ✓ VERIFIED | The addendum covers 1854830247 at 23466187 plus the local Aikido rerun |

### Key Link Verification

Unchanged from the previous run and regression-checked. The only code diff since is two comment lines. All nine links are ✓ WIRED: run_build → git.fetch → runGit spawn, sshEnv → readSecret, run_build → BuildLog symlink warning, run_build → safepath, buildPathFor, platform → refuseBuild, run_build → dispatchRemoteBuild → runRemoteShell, and runRemoteShell → per-socket emit.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Hermetic phase specs | `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p npx jasmine --config=<Git,SafePath,BuilderPath,BuilderRemoteJob,Sanitka,Finder,JSON2H>` | 247 specs, 0 failures (seed 97127) | ✓ PASS |
| New notify specs fail on the old code | same config, `--filter="invalid_device refusals notify the owner"`, run in a detached worktree at `191056e6` with the HEAD spec file (worktree removed afterwards) | 2 specs, 2 failures | ✓ PASS (fail-first confirmed) |
| FIXME commit syntax | `node -c lib/thinx/queue.js && node -c lib/thinx/notifier.js` | ok | ✓ PASS |
| Live CodeQL analysis | `gh api …/code-scanning/analyses?ref=refs/heads/thinx-staging` | 1854830247 at 23466187, 152 results, no error | ✓ PASS |
| Open phase-file alerts match the addendum | `gh api --paginate …/alerts?ref=…&state=open` | 151 open. The phase-file alerts from #286 up are exactly #288-#290 and #292-#297. | ✓ PASS |
| Dismissed alerts | `gh api …/alerts?state=dismissed` | only #118 (2021-01-01) | ✓ PASS |
| Independent Aikido rerun | Aikido MCP `aikido_scan_paths` | tool not available in the verifier context | ? SKIP (per user direction, the addendum's local scan is the substantiating scan) |

### Probe Execution

Step 7c: no phase plan declares a `scripts/*/tests/probe-*.sh` probe. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| SEC-EXEC-01 | 23-01, 23-05 | ✓ SATISFIED | SC1 |
| SEC-EXEC-02 | 23-02, 23-04, 23-05 | ✓ SATISFIED | SC2 |
| SEC-PATH-01 | 23-03, 23-05 | ✓ SATISFIED | SC3, SC4 |
| SEC-PATH-02 | 23-01, 23-05 | ✓ SATISFIED | SC5 |

No orphaned requirement IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/thinx/queue.js | 170 | `TODO: FIXME (tracked: .planning/todos/pending/2026-09-28-…md, Part 3)` | ℹ️ Info (gate satisfied) | Pre-existing. It now points at a committed follow-up, and the todo lists it back. |
| lib/thinx/notifier.js | 249 | `[TODO] FIXME … // tracked: worker todo 2026-09-28 Part 3` | ℹ️ Info (gate satisfied) | Pre-existing. The reference is short, but the todo's Part 3 names `notifier.js:249` explicitly, so it can be audited in both directions. |
| lib/thinx/statistics.js | 274, 281 | constant `execSync` / `spawn(shell:true)` | ℹ️ Info | Not a phase file; no repository input |
| lib/thinx/notifier.js | 38 | constant `execSync("git rev-parse HEAD")` | ℹ️ Info | No repository input |
| services/worker/class.js | 298 | legacy `spawn(command, {shell:true})` | ⚠️ Warning (accepted deferral D-01/D-03) | Reached only by cmd-only jobs. Removal is in the worker todo Part 2. |

Debt-marker gate note: the gate lists `issue #N` / `PR #N` / `DEF-*` as reference forms. The project has no DEF-* convention (grep finds none), and its formal follow-up tracker is `.planning/todos/pending`. A committed, path-addressable todo that lists both markers meets the gate's purpose, which is that completion can be audited. The gate counts as satisfied.

### Human Verification Required

None outstanding. The one item from the previous run is kept below for the record.

1. **[RESOLVED 2026-09-29] Never refuse silently: `invalid_device` early exits (advisory).**
   - **Test:** In `builder.js:876-890`, decide whether the two `run_build` `invalid_device` exits also need a websocket `notify`.
   - **Expected:** Both exits call `blog.state(..., "error")` and then `callback(false, "invalid_device")`. That matches the 23-03-PLAN action text (line 294) and CONTEXT D-12, so no must-have is contradicted. Accept as is, or add one `this.notify(udid, build_id, notifiers, "invalid_device", false)` per exit.
   - **Why human:** This is a judgment-tier prohibition, and the autonomous verdict is non-authoritative. Neither production approval exercised a refusal path.
   - **Resolution:** The user chose "Add notify now". `fc070578` adds the notify at both exits, and it was deployed as `thinx_api` sha256:3beaf4f0… with 0 restarts. This run re-verified the change (see "Refresh delta").

### Non-blocking follow-ups (not gaps, not human items)

- The Aikido platform auto-rescans about weekly and will confirm the local result. Per user direction it does not block completion.
- The addendum could list the 12 scanned files and the `aikido-filter.js` scanned/remaining counts, as the original section did. Record hygiene only.
- Deferred items carried from the previous run (see 23-SECURITY.md and the worker todo): legacy `cmd` path, worker reconnect, builder polling, broad modes, queue handshake auth, `thinx.yml` eval in the worker bash builder, WR-01, IN-01..IN-21.

### Summary

The phase goal holds in the deployed code, and the evidence record now matches it.
- git and the remote builder run argv-only with no shell.
- Repository file reads and writes are contained and refuse symlinks.
- BUILD_PATH cannot escape the owner's build root.
- Private builds work in production, with two user-approved builds.
- The SC5 rescan record covers `23466187`: every live CodeQL alert on a phase file has a row, every Aikido hit has a reason, the `execSync` sink is gone, and nothing was dismissed or suppressed.
- The debt markers reference a committed follow-up.

- The `invalid_device` refusals in `run_build` now notify the owner as well as setting the build-log error and returning the reason. That closes the only human item.

The status is `passed`: 5/5 roadmap SC, no gaps, no outstanding human items, and the fingerprint is regenerated at `9ca01b67`.

---

_Verified: 2026-09-28T22:10:37Z (refresh; previous 2026-09-28T22:05:00Z)_
_Verifier: Claude (gsd-verifier)_
