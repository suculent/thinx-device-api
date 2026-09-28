---
phase: 23-build-pipeline-sink-hardening
verified: 2026-09-28T21:30:00Z
status: gaps_found
score: 4/5 roadmap success criteria verified (plan must-haves 44/44 code-level truths verified; SC5 evidence record partial)
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
covered_digest: "v2:sha256:9b60c9fa0f4a86d1b4a2fe795b7c4a8fd9bd2fc0ba024ae6e7c6aa2786c9ad4e"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "ROADMAP SC5 (second half): a rescan (CodeQL from Phase 22 plus the local Aikido scan) no longer flags the git.js execSync sink or the builder readFileSync/lstatSync sinks; any remaining hit is recorded as an app-owned false positive with a reason"
    status: partial
    reason: "The code-level outcome holds (no execSync/exec/ssh-agent left in git.js; builder repo reads go through safepath), but 23-SAST-DELTA.md records the scans of c9385574 / worker 79611f6. That code no longer exists: the review-fix passes rewrote git.js (async spawn runGit, chmodCheckoutSync, checkout lock), builder.js, queue.js and notifier.js. The live CodeQL analysis of the deployed commit (1854830247 at 23466187, 151 open) contains hits on phase files that the delta does not record: #297 js/http-to-file-access git.js:381 (replaces the recorded #291, which is now closed), #292 js/incomplete-sanitization builder.js:1366 (replaces #151), and new js/log-injection #293 notifier.js:121, #294 queue.js:475 (replaces #243), #295 sources.js:273, #296 sources.js:279. No Aikido scan of the post-fix code exists; the only Aikido JSON is from 2026-09-27 23:43, before the fix passes. Likely new Aikido candidates that nobody has classified: git.js runGit exec.spawn(\"git\", args, {shell:false}) and the chmodCheckoutSync lstatSync/readdirSync/chmodSync walk over checkout paths. The delta text also states that clone and pull are execFileSync, which is no longer true."
    artifacts:
      - path: ".planning/phases/23-build-pipeline-sink-hardening/23-SAST-DELTA.md"
        issue: "Records CodeQL 1848129237 at c9385574 and Aikido at c9385574 / worker 79611f6. The deployed code is 23466187 / worker d6ca153. The remaining-hits table names #291 (closed) and omits #292, #293, #294 (renumbered #243), #295, #296 and #297."
    missing:
      - "Add a post-review addendum to 23-SAST-DELTA.md for CodeQL analysis 1854830247 (commit 23466187). Map #297 to #291 and #292 to #151 (same statements, re-fingerprinted), and give #293-#296 a row each (log-injection, outside the sink scope, with a reason)."
      - "Run a fresh Aikido scan (aikido_scan_paths) of the current phase files and worker class.js at d6ca153, filter it with node scripts/aikido-filter.js, and record every remaining hit, in particular git.js runGit spawn and chmodCheckoutSync, as an app-owned false positive with a reason. Add no suppressions and no known-false-positive entries."
      - "Correct the stale wording 'clone and pull are execFileSync(\"git\", argv)' to the async argv-only spawn (runGit, shell:false, detached process group)."
  - truth: "Debt-marker gate: no unreferenced TBD/FIXME/XXX marker in a file modified by this phase"
    status: failed
    reason: "Two FIXME markers sit in files the phase's review-fix passes modified. Both predate the phase (present at 297ee357) and neither references an issue, PR or DEF-* item. They are unrelated to the phase goal. The gate is literal, so they are listed; closing them is trivial."
    artifacts:
      - path: "lib/thinx/queue.js"
        issue: "line 170: '// TODO: FIXME: This is ugly and wrong and needs refactoring...' (pre-existing, no follow-up reference)"
      - path: "lib/thinx/notifier.js"
        issue: "line 249: log text '[TODO] FIXME: Unmatched job status' (pre-existing, no follow-up reference)"
    missing:
      - "Add a follow-up reference (issue # or DEF-*) on each line, or reword or remove the markers"
human_verification:
  - test: "Judgment-tier prohibition (23-03): MUST NOT refuse silently. A refused build reaches the owner as unsafe_repository_file or invalid_device."
    expected: "Refusals show up as notifier message, build-log state 'error' and callback reason. The LLM judge (non-authoritative) found refuseBuild does all three. The two early invalid_device exits in run_build (builder.js:876-890) set blog.state and call back but do not call this.notify. The HTTP caller still receives the reason, so the refusal is not silent."
    why_human: "Judgment-tier prohibition; an autonomous verdict is non-authoritative (flagged: unverified-prohibition, human review recommended)"
  - test: "Judgment-tier prohibition (23-05): MUST NOT deploy with restart.sh or docker stack deploy, and MUST NOT push the parent repository to main"
    expected: "Checked: 23466187 is not an ancestor of origin/main. Not checkable from here: whether restart.sh or docker stack deploy was used. 23-05-SUMMARY says Swarmpit autoredeploy / single-service update."
    why_human: "Production operator actions cannot be verified from the repository"
  - test: "Judgment-tier prohibition (23-05): no alert message text, code snippets, alert URLs, ssh host/port/key details or service env values in the committed delta doc or SUMMARY (public repo)"
    expected: "The LLM judge (non-authoritative) read 23-SAST-DELTA.md: rule ids, paths, lines, counts and gh api endpoint templates only; no alert html_url, no snippets, no host/port. Reapply the same check to the addendum the SC5 gap requires."
    why_human: "Judgment-tier prohibition; confidentiality judgment on a public document"
---

# Phase 23: Build-Pipeline Sink Hardening Verification Report

**Phase Goal:** A hostile or careless firmware repository can no longer inject shell commands or read or write files outside its build directory, and private-repository builds keep working.
**Verified:** 2026-09-28T21:30:00Z
**Status:** gaps_found
**Re-verification:** No (initial verification)

The security goal is achieved in the code that is deployed now. Both gaps are about the evidence record. The main one is SC5: the SAST delta describes pre-review-fix code, and the deployed code has CodeQL hits the delta does not record and no Aikido rescan. The other gap is two pre-existing FIXME markers caught by the literal debt-marker gate. No functional or security gap was found.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A private-repository build succeeds in production. git.js runs git argv-only with no shell string and no `ssh-agent sh -c`, using a constant GIT_SSH_COMMAND plus askpass and an explicit GIT_KEY_PASSPHRASE. A failing fetch reports `git_fetch_failed`; a successful one does not. | ✓ VERIFIED | `git.js:64-111` `runGit` = `exec.spawn("git", args, {shell:false, detached:true})`. The only other git call is `execFileSync("git", ["ls-files",...])` at :403. grep finds no `execSync`, `ssh-agent`, `shell-escape` or `lgtm` in git.js. `static get SSH_COMMAND` at :194 is a constant string; per-attempt values go in only as env (`sshEnv` :237-247: `THINX_GIT_KEY`, `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE=force`, `GIT_KEY_PASSPHRASE: readSecret("GIT_KEY_PASSPHRASE")`). `baseEnv` removes the passphrase and sets `GIT_ASKPASS=false` and `GIT_TERMINAL_PROMPT=0`. `builder.js:928-931`: `if (!(await this.prefetchPrivate(...))) return callback(false, "git_fetch_failed")`, and `prefetchPrivate` returns true only when `git.fetch` resolves `true` (:652-693). GitSpec (j) end-to-end fetch → true and (k) missing repo → false both pass (hermetic run 245/0). Production: user-approved private builds `43c748d0-…` (eav-firmware) and `17d30770-…` (Fridge, after redeploy, API `752bff9f`, worker `3abe50a2`), recorded in 23-05-SUMMARY. Intent is judged, not the literal `execFileSync` name (WR-03 moved to async spawn). |
| 2 | The remote-builder command runs via argv, and `shell-escape` is gone from package.json and the lockfile. | ✓ VERIFIED | `builder.js:257-340` `runRemoteShell` emits `argv: buildArgs.slice()` after checking that every element starts with `--`. `legacyShellCommand` is local (no package). Worker `class.js:255` `exec.spawn(BUILDER_PROGRAM, argv, {shell:false})` with `validateArgv` allowlist (:205-224); the worker submodule is at `d6ca153`. `grep shell-escape package.json package-lock.json lib/` → none. Local path `builder.js:550` `spawn(command, args, {shell:false})`. Worker jest 49/49; BuilderRemoteJobSpec includes "argv carries builder arguments only, never the program". |
| 3 | A symlinked `thinx.yml`, or another file the builder reads, that points outside the build dir is refused on read and on the write-back. Specs cover the symlink case and the prefix sibling `…/abc` vs `…/abc-evil`. | ✓ VERIFIED | `safepath.js` does realpath of root and target (or the parent), `path.relative` containment, lstat symlink refusal and `O_NOFOLLOW` opens. `builder.loadRepoYaml` → `readFileInside` (:769-790). The write-back goes through `writeRepoFile` → `writeFileInside` (:1071). `environment.json`, `thinx_build.json` and the header are contained too (:1081, :1147, :1183-1190). `Platform.platformFromYamlFile` and the pine64 Makefile use safepath. `cleanupSecrets` uses `unlinkInside`. Specs: SafePathSpec :73, :81, :87 (symlink `../outside`, prefix sibling `abc-evil`, symlink to `../abc-evil/thinx.yml`); BuilderPathSpec :68, :75, :81, :95 (write-back leaves the target unchanged), :144 (Platform sentinel), :180 (pine64). All green in the hermetic run. Other plugins only call `existsSync` and read nothing; repo symlinks arrive as plain files anyway (SC5 core.symlinks). |
| 4 | A `device.owner` / `device.udid` containing `../` or path characters cannot move BUILD_PATH outside the owner's build root. | ✓ VERIFIED | `builder.buildPathFor` (:204-212): `Sanitka.strictOwner` (`^[a-z0-9]{64}$`), `Sanitka.udid` (36 chars `[a-fA-F0-9-]`, refused rather than stripped) and `safepath.isInside(root, candidate)`. `run_build` checks the device's owner/udid and the request's owner/udid before any mkdirp (:875-890). `runRemoteShell` refuses with `invalid_device` when it returns null (:282-288). BuilderPathSpec BAD cases (`../`+61 hex owner, udid `../../../../etc/passwd` padded, `../` build_id, null/empty) → null; runRemoteShell `../bad` owner and path-char udid emit no job. |
| 5 | Repositories are cloned with `core.symlinks=false`. A rescan (CodeQL plus local Aikido) no longer flags the git.js execSync sink or the builder readFileSync/lstatSync sinks, and remaining hits are recorded as app-owned false positives. | ✗ PARTIAL (gap) | **core.symlinks: verified.** `git.js:346-348` passes `-c core.symlinks=false` and `clone --config core.symlinks=false`, and :361 passes it to the pull (submodules). cloneRepository/fetch is the only clone site (builder, sources.add, devices.prefetch_repository). GitSpec :369/:375 pass. **Sinks gone in code: verified.** No `execSync` in git.js. In builder.js the remaining `readFileSync` calls are app-owned only (:704 dist template, :1118 validated platform descriptor, :1542 languages) and `lstatSync` is only :1528 (languages dir). **Recording: stale.** 23-SAST-DELTA.md covers c9385574. The live CodeQL analysis 1854830247 of deployed 23466187 has unrecorded hits on phase files (#297 git.js:381, #292 builder.js:1366, #293-#296), and no Aikido scan of the post-fix code exists. See Gaps. |

**Score:** 4/5 roadmap truths verified (0 present-but-behavior-unverified).

### Plan must-haves (23-01..05)

| Plan | Truths | Status | Notes |
|------|--------|--------|-------|
| 23-01 git.js contract | 12 | ✓ all verified (intent) | The shared `cloneRepository` is used by prefetchPublic, prefetchPrivate (via fetch), sources.add and devices.prefetch_repository. `fetch` has one keyless attempt with no keys and one keyed attempt per key, and the askpass is removed in `finally` (mkdtemp per attempt). Known-hosts D-08 checks are at :263-308. Redis `gitkey:<owner>` is honoured only when `===` one of the owner's own keys, with a 30-day TTL. The symlink warning goes to blog.log (:967-971). The truth's literal "execFileSync" is superseded by WR-03's async `spawn` with the same argv-only, no-shell property. |
| 23-02 worker argv | 8 | ✓ all verified | BUILDER_PROGRAM is a constant; ALLOWED_ARGV_FLAGS; argv wins over cmd; legacy warning line; no lgtm in class.js; jest 49/49 including the rejection table (`/bin/sh -c id` refused). |
| 23-03 safepath / BUILD_PATH | 11 | ✓ all verified | The backstop truth (O_NOFOLLOW on every open) was checked by reading `safepath.js:174` and `:205`, and both opens carry `O_NOFOLLOW`. The spec does not race it, and the plan accepts inspection for this truth. |
| 23-04 API argv + shell-escape | 7 | ✓ all verified | Golden legacy-cmd cases in BuilderRemoteJobSpec; gitlink at `d6ca153`; no lgtm in builder.js. |
| 23-05 deploy + SAST | 9 | 8 verified, 1 stale | Push order, CI green (CircleCI 15447/15448), production OpenSSH 10.3p1, knownHostsFiles persistent, D-14 proof (two builds, user-approved), no dismissals (the only dismissed alert is #118 from 2021), no added suppressions (lgtm count now 0 in git.js/builder.js/class.js; notifier 6→6, sources 2→2, queue 0). The "23-SAST-DELTA.md compares … every remaining hit has a row" truth is **stale** after the review-fix passes (SC5 gap). |

### Prohibitions

| Prohibition | Tier | Disposition | Evidence |
|-------------|------|-------------|----------|
| Never expose GIT_KEY_PASSPHRASE (argv, askpass body, logs, HTTP 401) | test | ✓ verified | GitSpec :549 (helper file carries no passphrase) and :563 (401 remote never receives it). `cloneHoldingLock` logs only stage/code/status. |
| Never weaken host-key verification | test | ✓ verified | GitSpec :466-:522 (fallbacks for writable, symlinked or foreign files; constant SSH_COMMAND with no StrictHostKeyChecking=no and no /dev/null). IN-01 (a fallback TOFU-writes into the seeded file) is documentation only; accept-new still refuses a changed key. |
| No key material in Redis; no foreign cached key | test | ✓ verified | GitSpec :607-:633 |
| Worker never runs a job-named program | test | ✓ verified | worker test.js `(c)` table |
| No Wi-Fi write-back through a symlink; cleanupSecrets on refusal | test | ✓ verified | BuilderPathSpec :95, :201, refuseBuild spec :309 |
| No normalisation of owner/udid | test | ✓ verified | BuilderPathSpec "never rewrites an input" |
| API never chooses the program | test | ✓ verified | BuilderRemoteJobSpec :164 |
| No dismissals, suppressions or scanner-ignore entries | test | ✓ verified | Live dismissed list = [#118, 2021]. No new suppression markers. `aikido-known-false-positives.json` unchanged since 297ee357. |
| Never refuse silently | judgment | flagged (LLM judge: holds) | See human verification 1 |
| No restart.sh / stack deploy / push to main | judgment | flagged (partial check: not on origin/main) | See human verification 2 |
| No sensitive text in the public delta doc | judgment | flagged (LLM judge: holds) | See human verification 3 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/thinx/git.js` | argv git routine, SSH_COMMAND, known-hosts, askpass, key order | ✓ VERIFIED | 551 lines, wired from builder/sources/devices |
| `lib/thinx/safepath.js` | resolveInside/isInside/read/write/unlinkInside | ✓ VERIFIED | 238 lines, used by builder, platform and pine64 |
| `lib/thinx/builder.js` | buildPathFor, loadRepoYaml, writeRepoFile, refuseBuild, argv job | ✓ VERIFIED | all present and wired in run_build |
| `lib/thinx/sanitka.js` | strictOwner | ✓ VERIFIED | :154 |
| `services/worker/class.js` | BUILDER_PROGRAM, validateArgv, runArgv | ✓ VERIFIED | submodule at d6ca153 |
| `package.json` / `package-lock.json` | no shell-escape | ✓ VERIFIED | grep empty |
| Specs (Git, SafePath, BuilderPath, BuilderRemoteJob) | min_lines met, hermetic | ✓ VERIFIED | 245 specs / 0 failures in this run |
| `23-SAST-DELTA.md` | before/after and remaining-hits table | ⚠️ STALE | Accurate for c9385574, not for deployed 23466187 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| builder.run_build | git.fetch | `await this.prefetchPrivate(...)` → `this.git.fetch(owner, url, branch, BUILD_PATH)` | ✓ WIRED |
| git.fetch | git binary | `cloneHoldingLock` → `runGit` → `spawn("git", argv, {shell:false})` | ✓ WIRED (spawn replaces execFileSync) |
| git.sshEnv | secrets.readSecret | `readSecret("GIT_KEY_PASSPHRASE")` | ✓ WIRED |
| builder.run_build | BuildLog | `blog.log(..., symlinkWarning(this.git.symlinkEntries(XBUILD_PATH)))` | ✓ WIRED |
| builder.run_build | safepath | loadRepoYaml / writeRepoFile | ✓ WIRED |
| run_build, runRemoteShell | Sanitka.strictOwner | buildPathFor | ✓ WIRED |
| platform.getPlatformFromPath | builder refuseBuild | `Platform.UNSAFE_REPOSITORY_FILE` | ✓ WIRED |
| run_build | runRemoteShell | `dispatchRemoteBuild(br.worker, buildArgs, ...)` → `runRemoteShell(worker, buildArgs, ...)` | ✓ WIRED (via dispatchRemoteBuild after WR-02) |
| runRemoteShell | worker runJob | `socket.emit('job', {argv, cmd, path, ...})` to the selected worker | ✓ WIRED (per-socket emit after WR-03, not io.emit) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Hermetic phase specs (git argv, injection, symlink, prefix sibling, BUILD_PATH, remote job) | `ENVIRONMENT=development … npx jasmine --config=<GitSpec,SafePathSpec,BuilderPathSpec,BuilderRemoteJobSpec,SanitkaSpec,FinderSpec,JSON2HSpec>` | 245 specs, 0 failures | ✓ PASS |
| Worker argv contract | `npm --prefix services/worker test` | 49/49 passed | ✓ PASS |
| Live CodeQL on deployed commit | `gh api …/code-scanning/analyses?ref=refs/heads/thinx-staging` | 1854830247 at 23466187, 152 results (151 open + #118 dismissed) | ✓ read (feeds the SC5 gap) |
| Dismissed alerts | `gh api …/alerts?state=dismissed` | only #118 (2021-01-01) | ✓ PASS |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` declared by any phase plan. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-EXEC-01 | 23-01, 23-05 | git via argv, no shell / ssh-agent, constant GIT_SSH_COMMAND + askpass, explicit passphrase, success detection intact, private build works in prod | ✓ SATISFIED | SC1 evidence. Success now comes from the exit status plus basename.json; stderr is still captured, for logging. |
| SEC-EXEC-02 | 23-02, 23-04, 23-05 | remote-builder command via argv, shell-escape removed | ✓ SATISFIED | SC2 evidence. The legacy `cmd` shell path in the worker is an accepted deferral (D-01/D-03), and prod logs show 0 legacy lines. |
| SEC-PATH-01 | 23-03, 23-05 | contained repo reads/writes incl. write-back, symlink refusal, owner/udid sanitised for BUILD_PATH | ✓ SATISFIED | SC3 and SC4 evidence |
| SEC-PATH-02 | 23-01, 23-05 | cloned with core.symlinks=false | ✓ SATISFIED | SC5 first half |

All four IDs are claimed by plans, and REQUIREMENTS.md maps no other ID to Phase 23, so nothing is orphaned. The `[x]` marks from commit 67cce845 are justified: none of the four requirement texts includes the SAST-rescan clause, which is roadmap SC5 only.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/thinx/queue.js | 170 | `TODO: FIXME` (pre-existing, unreferenced) | 🛑 Blocker (debt-marker gate) | None on the goal; auditability only |
| lib/thinx/notifier.js | 249 | `[TODO] FIXME` in a log string (pre-existing, unreferenced) | 🛑 Blocker (debt-marker gate) | None on the goal |
| lib/thinx/statistics.js | 274, 281 | `execSync("docker info -f $(hostname)")`, `spawn(..., {shell:true})` | ℹ️ Info | Constant strings with no repo input; not a phase file |
| lib/thinx/notifier.js | 38 | `execSync("git rev-parse HEAD")` | ℹ️ Info | Constant string with no repo input |
| lib/thinx/devices.js | 384 | async link-following `chmodr` on the deploy path (review IN-07) | ℹ️ Info | Deploy path, not BUILD_PATH; checkouts carry no symlinks (core.symlinks=false) |
| services/worker/class.js | 298 | legacy `spawn(command, {shell:true})` | ⚠️ Warning (accepted deferral D-01/D-03) | Reached only by cmd-only jobs; current API always sends argv |

### Human Verification Required

These are the three judgment-tier prohibitions. The autonomous verdicts are non-authoritative and each is flagged "unverified-prohibition, human review recommended". Details are in the frontmatter `human_verification`.

1. **Never refuse silently.** Confirm that the notifier-less early `invalid_device` exits (builder.js:876-890) are acceptable. They set the build-log state and call back with the reason.
2. **Deploy discipline.** Confirm that neither restart.sh nor `docker stack deploy` was used. Checked here: no push to main.
3. **Public-doc hygiene.** Confirm on 23-SAST-DELTA.md, and again on the SC5 addendum once it is written.

### Deferred / accepted items (not gaps)

The following are recorded in 23-SECURITY.md and the pending todos. None of them breaks an SC:
- worker legacy `cmd` shell path (D-01/D-03)
- worker reconnect (WR-03 todo Part 3)
- builder polling loop (Part 1)
- broad 0o766/0o777 modes
- queue handshake auth (IN-11)
- `thinx.yml` eval in the worker bash `builder` (T-23-14 transfer)
- open review items WR-01 (multi-worker busy tracking) and IN-01..IN-20

### Gaps Summary

The phase goal holds in the deployed code.
- **Injection:** git and the remote builder run argv-only with no shell, and neither the repository nor the job can name the program.
- **Containment:** every builder read and write of a repository file is contained and refuses symlinks, and BUILD_PATH cannot escape the owner's build root.
- **Private builds:** they work in production, proven twice with user approval, the second time after the review-fix redeploy.

What remains is evidence hygiene:

1. **SC5 recording is stale (main gap).** 23-SAST-DELTA.md was written for c9385574. Fix passes 1-5 and 6d83f819 then rewrote git.js (async `runGit`, `chmodCheckoutSync`, checkout lock), builder.js, queue.js and notifier.js.
   - Live CodeQL on the deployed 23466187 (analysis 1854830247) shows no new shell or path-read sink, so the substantive conclusion holds. But the remaining-hit rows are not recorded under current numbers: #297 replaces #291, #292 replaces #151, #294 replaces #243, and #293, #295 and #296 are new log-injection alerts.
   - No Aikido scan of the post-fix code exists. The verifier cannot run Aikido or CodeQL.
   - Closure is documentation plus one Aikido run: an addendum mapping the renumbered alerts, rows for the new ones, and a fresh `aikido_scan_paths` over the current phase files with every remaining hit classified.
2. **Debt-marker gate.** Two FIXME markers predate the phase and are unrelated to it, but sit in files it touched (queue.js:170, notifier.js:249). Add a follow-up reference or remove them.

---

_Verified: 2026-09-28T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
