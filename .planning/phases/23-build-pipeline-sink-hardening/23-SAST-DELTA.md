# Phase 23: SAST delta (CodeQL baseline vs post-fix, Aikido before/after)

The "after" evidence for ROADMAP success criterion 5. It compares the Phase 22 CodeQL baseline with the analysis of the pushed Phase 23 code, and a local Aikido scan of the phase's files before and after. This repository is public, so the document carries rule ids, severities, paths, lines and counts only: no alert messages, no code snippets, no alert URLs.

| Field | Value |
|---|---|
| Repository | `suculent/thinx-device-api` |
| Ref | `refs/heads/thinx-staging` |
| Baseline analysis id | `1839321938` at `89c5cf93f0d82098a70f5b7a69a63b1760479b45` (2026-09-25, Phase 22) |
| Post-fix analysis id | `1848129237` at `c9385574fc37720f2497e96fd2657804d5fa40e9` (created 2026-09-27T21:13:30Z, `error` empty) |
| Post-fix workflow run | `36350846745` (CodeQL, success) |
| Tool | CodeQL 2.27.1 (both analyses) |
| Query suite | `security-extended`, `javascript-typescript`, `build-mode: none` |
| Post-fix `results_count` / `rules_count` | 149 / 103 (open 148 plus the 2021-dismissed #118, same accounting as the baseline's 148 = 147 + 1) |
| Aikido scan | `aikido_scan_paths` (SAST + secrets), run 2026-09-27 on the phase files at `297ee357` (before) and the working tree at `c9385574` plus worker `79611f6` (after) |
| Document date | 2026-09-28 |

Headline: CodeQL open alerts 147 to 148 (+1, `js/http-to-file-access` on `lib/thinx/git.js:236`, false positive, see below). Aikido high-severity shell-injection hits on the phase files 4 to 2; both `git.js` shell-exec sinks are gone, the remaining two are the argv `spawn` with no shell (known noise) and the worker's legacy-cmd path (accepted residual with a removal trigger).

## CodeQL totals

Open alerts on the ref: before 147, after 148.

By `security_severity_level`:

| security_severity_level | Before | After | Delta |
|---|---|---|---|
| critical | 0 | 0 | 0 |
| high | 37 | 37 | 0 |
| medium | 110 | 111 | +1 |
| low | 0 | 0 | 0 |

By rule `severity`:

| severity | Before | After | Delta |
|---|---|---|---|
| error | 118 | 118 | 0 |
| warning | 29 | 30 | +1 |
| note | 0 | 0 | 0 |

By rule (every rule with an alert in either analysis):

| Rule id | Before | After | Delta |
|---|---|---|---|
| `js/log-injection` | 99 | 99 | 0 |
| `js/clear-text-logging` | 7 | 7 | 0 |
| `js/remote-property-injection` | 7 | 7 | 0 |
| `js/user-controlled-bypass` | 6 | 6 | 0 |
| `js/incomplete-sanitization` | 4 | 4 | 0 |
| `js/path-injection` | 4 | 4 | 0 |
| `js/clear-text-cookie` | 3 | 3 | 0 |
| `js/polynomial-redos` | 3 | 3 | 0 |
| `js/stack-trace-exposure` | 3 | 3 | 0 |
| `js/prototype-polluting-assignment` | 2 | 2 | 0 |
| `js/session-fixation` | 2 | 2 | 0 |
| `js/http-to-file-access` | 1 | 2 | +1 |
| `js/cors-misconfiguration-for-credentials` | 1 | 1 | 0 |
| `js/file-system-race` | 1 | 1 | 0 |
| `js/insufficient-password-hash` | 1 | 1 | 0 |
| `js/missing-token-validation` | 1 | 1 | 0 |
| `js/tainted-format-string` | 1 | 1 | 0 |
| `js/weak-cryptographic-algorithm` | 1 | 1 | 0 |

Alert numbers present only before: 148, 212, 262. Only after: 288, 289, 290, 291. Three of the four new numbers are the same statements under a new fingerprint (see the next section); one (#291) is a new alert.

## CodeQL on phase files

Phase files: `lib/thinx/git.js`, `builder.js`, `safepath.js`, `platform.js`, `sanitka.js`, `sources.js`, `devices.js`, `plugins/pine64/plugin.js`. `services/worker/class.js` lives in the worker repository and is not analysed by this repository's CodeQL workflow.

| File | Alert | Rule id | Before line | After line | Status |
|---|---|---|---|---|---|
| `lib/thinx/builder.js` | 148 -> 288 | `js/incomplete-sanitization` | 323 | 378 | renumbered: same statement in `processShellData`, re-fingerprinted after the lgtm comment on that line was removed |
| `lib/thinx/builder.js` | 151 | `js/incomplete-sanitization` | 1049 | 1177 | unchanged, moved |
| `lib/thinx/builder.js` | 223 | `js/log-injection` | 1103 | 1231 | unchanged, moved |
| `lib/thinx/devices.js` | 149 | `js/incomplete-sanitization` | 261 | 250 | unchanged, moved |
| `lib/thinx/devices.js` | 150 | `js/incomplete-sanitization` | 606 | 595 | unchanged, moved |
| `lib/thinx/devices.js` | 212 -> 289 | `js/log-injection` | 89 | 71 | renumbered: same log statement in `prefetch_repository`, moved when the shell script was removed |
| `lib/thinx/devices.js` | 213 | `js/log-injection` | 123 | 112 | unchanged, moved |
| `lib/thinx/devices.js` | 214 | `js/log-injection` | 128 | 117 | unchanged, moved |
| `lib/thinx/devices.js` | 215 | `js/log-injection` | 130 | 119 | unchanged, moved |
| `lib/thinx/devices.js` | 216 | `js/log-injection` | 367 | 356 | unchanged, moved |
| `lib/thinx/devices.js` | 217 | `js/log-injection` | 515 | 504 | unchanged, moved |
| `lib/thinx/devices.js` | 218 | `js/log-injection` | 581 | 570 | unchanged, moved |
| `lib/thinx/sanitka.js` | 160 | `js/clear-text-logging` | 99 | 105 | unchanged, moved |
| `lib/thinx/sanitka.js` | 161 | `js/clear-text-logging` | 99 | 105 | unchanged, moved |
| `lib/thinx/sanitka.js` | 247 | `js/log-injection` | 54 | 60 | unchanged, moved |
| `lib/thinx/sanitka.js` | 249 | `js/log-injection` | 99 | 105 | unchanged, moved |
| `lib/thinx/sanitka.js` | 250 | `js/log-injection` | 99 | 105 | unchanged, moved |
| `lib/thinx/sources.js` | 166 | `js/prototype-polluting-assignment` | 400 | 379 | unchanged, moved |
| `lib/thinx/sources.js` | 167 | `js/prototype-polluting-assignment` | 420 | 399 | unchanged, moved |
| `lib/thinx/sources.js` | 260 | `js/log-injection` | 251 | 249 | unchanged, moved |
| `lib/thinx/sources.js` | 261 | `js/log-injection` | 251 | 249 | unchanged, moved |
| `lib/thinx/sources.js` | 262 -> 290 | `js/log-injection` | 304 | 283 | renumbered: same prefetch log statement in `add`, moved when the shell script was removed |
| `lib/thinx/sources.js` | 264 | `js/log-injection` | 392 | 371 | unchanged, moved |
| `lib/thinx/sources.js` | 265 | `js/log-injection` | 397 | 376 | unchanged, moved |
| `lib/thinx/sources.js` | 266 | `js/log-injection` | 409 | 388 | unchanged, moved |
| `lib/thinx/sources.js` | 267 | `js/log-injection` | 415 | 394 | unchanged, moved |
| `lib/thinx/git.js` | 291 | `js/http-to-file-access` (warning, medium) | none | 236 | **new** |

- `lib/thinx/git.js`: before none; after #291 only.
- `lib/thinx/safepath.js`: none (the file did not exist before; no alert after).
- `lib/thinx/platform.js`: none before, none after.
- `plugins/pine64/plugin.js`: none before, none after.

New CodeQL alerts on the phase files since the baseline: one, #291 on `lib/thinx/git.js:236`, classified false positive in `## Remaining hits`. The three renumbered alerts (288, 289, 290) are pre-existing findings on unchanged statements, not new findings. No alert on the phase files was fixed or introduced by the sink changes other than #291.

## Aikido before/after

Before: `aikido_scan_paths` over 8 files (the phase files at `297ee357`, `safepath.js` absent at that commit, plus worker `class.js` at `f1c02c9`), 13 issues. After: 9 files (working tree at `c9385574` including `safepath.js`, plus worker `class.js` at `79611f6`), 27 issues. IaC scanning errored in both runs (Checkov binary not installed, `ENOENT`); SAST and secrets ran; no secret findings in either run.

`node scripts/aikido-filter.js`: before `scanned issues: 13  known-noise suppressed: 1  remaining: 12`; after `scanned issues: 27  known-noise suppressed: 1  remaining: 26`. The one suppressed issue in both runs is the builder's argv `spawn` with `shell: false` (the existing known-false-positive entry). The filter's stale-entry report listed the same 12 entries in both runs (`router.google.js` 4, `router.github.js` 3, `influx.js` 4, `secrets.js` 1); none of those files was in the scan scope, so the stale report is not meaningful here and the entries were not edited.

By rule:

| Rule | Severity | Before | After |
|---|---|---|---|
| `AIK_js_shell_injection_child_process` | 89 | 4 | 2 |
| `AIK_ts_generic_path_traversal` | 1 | 9 | 25 |

Per targeted sink:

| Sink | Before rule and file:line | After status |
|---|---|---|
| `git.js` fetch: shell exec of the assembled clone command | `AIK_js_shell_injection_child_process` `lib/thinx/git.js:71` | **gone** (no `execSync`/`exec` left in `git.js`; clone and pull are `execFileSync("git", argv)`, no shell) |
| `git.js` GIT_PREFETCH shell exec | `AIK_js_shell_injection_child_process` `lib/thinx/git.js:153` | **gone** |
| builder local build `spawn` (argv, `shell: false`) | `AIK_js_shell_injection_child_process` `lib/thinx/builder.js:355` | remaining at `lib/thinx/builder.js:410` (known noise, already `shell: false` before; row below) |
| worker build `spawn` with `shell: true` | `AIK_js_shell_injection_child_process` `services/worker/class.js:163` | remaining at `services/worker/class.js:255`, legacy-cmd path only; argv jobs now use `runArgv` with no shell (accepted residual, row below) |
| builder `basename.json` path join (public prefetch) | `AIK_ts_generic_path_traversal` `lib/thinx/builder.js:428` | moved into the shared clone routine, remaining at `lib/thinx/git.js:235` (now a Node write of a fixed file name, not a read) |
| builder checkout directory join | `AIK_ts_generic_path_traversal` `lib/thinx/builder.js:449` (x2) | moved, remaining at `lib/thinx/git.js:223` (x2) |
| builder `lstatSync` over BUILD_PATH entries | `AIK_ts_generic_path_traversal` `lib/thinx/builder.js:682` (x2) | **gone** (replaced by `Dirent`-based `getDirectories`, which never follows a symlink) |
| builder `thinx.yml` `readFileSync` from the repository | `AIK_ts_generic_path_traversal` `lib/thinx/builder.js:731` | **gone** (repository reads go through `safepath` `readRepoFile`, `O_NOFOLLOW`, containment checked) |
| builder platform descriptor path join | `AIK_ts_generic_path_traversal` `lib/thinx/builder.js:809` | remaining at `lib/thinx/builder.js:935` |
| builder platform descriptor `readFileSync` | `AIK_ts_generic_path_traversal` `lib/thinx/builder.js:825` | remaining at `lib/thinx/builder.js:951` |
| builder `supportedLanguages` `lstatSync` | `AIK_ts_generic_path_traversal` `lib/thinx/builder.js:1215` | remaining at `lib/thinx/builder.js:1343` |

The STATE-recorded before sinks that Aikido did not flag at `297ee357` (builder dist template read at 525, language descriptor read at 1229) are not flagged after either (now 560 and 1357).

## Remaining hits

Every CodeQL or Aikido hit on the phase files and `services/worker/class.js` that is not a pre-existing, unchanged CodeQL alert listed above. Aikido counts in parentheses are duplicate issues on the same line.

| Tool | Rule | file:line | False-positive reason |
|---|---|---|---|
| CodeQL | `js/http-to-file-access` (#291) | `lib/thinx/git.js:236` | Node writes `basename.json`, a fixed file name, into the build path that `buildPathFor` / `getTempPath` produced. The content is `JSON.stringify` of `path.basename` of the checkout directory and the branch; the branch has passed `isSafeGitValue` and the `Sanitka.branch` allowlist before git runs. It replaces the old shell `printf ... > ../basename.json`, which CodeQL did not model. No network data picks the path. |
| CodeQL | `js/incomplete-sanitization` (#288, was #148) | `lib/thinx/builder.js:378` | `processShellData` collapses a duplicated newline in a build log line for console output. It is log cosmetics, not a sanitizer, and nothing downstream relies on it for safety. Pre-existing finding, renumbered only. |
| CodeQL | `js/log-injection` (#289, was #212) | `lib/thinx/devices.js:71` | Pre-existing log statement, moved and renumbered; it logs the source id on the invalid-URL branch. Not in the sink scope of this phase (log-injection is tracked with the other 98 by the Phase 22 baseline). |
| CodeQL | `js/log-injection` (#290, was #262) | `lib/thinx/sources.js:283` | Pre-existing prefetch log line, moved and renumbered; the url and branch it prints are the sanitized values. Same scope note as #289. |
| Aikido | `AIK_js_shell_injection_child_process` (89) | `lib/thinx/builder.js:410` | `spawn(command, args, { shell: false })`: the program is the builder's own path and every value is a separate argv element, so there is no shell to inject into. Suppressed by the existing `scripts/aikido-known-false-positives.json` entry in both runs. |
| Aikido | `AIK_js_shell_injection_child_process` (89) | `services/worker/class.js:255` | **Accepted residual, not a false positive.** This is `runShell`, the legacy path for a job that carries only the `cmd` string. It stays for mixed-version compatibility (D-01, D-03): an API instance built before argv support sends only `cmd`. Current API instances send `argv` plus a byte-identical `cmd`, and the worker runs `argv` through `runArgv` with `shell: false`; `runShell` is reached only when `argv` is absent, logs a `legacy cmd-only job` warning, and still rejects unsafe `--git=`/`--branch=` tokens. Production check 2026-09-28: 0 `legacy cmd-only` lines in 24 h of thinx_worker logs. **Removal trigger:** delete `runShell` and the `cmd` field once every API instance emits `argv` and the worker logs no `legacy cmd-only job` line over a full release cycle. |
| Aikido | `AIK_ts_generic_path_traversal` (1) (x3) | `lib/thinx/builder.js:207` | `buildPathFor`: owner, udid and build id are validated (`Sanitka.strictOwner`, `Sanitka.udid`), never stripped, and the resolved candidate is returned only when `safepath.isInside` holds. This line is the containment check. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/builder.js:517` | Existence test for the fixed name `basename.json` under the validated BUILD_PATH. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/builder.js:935` | Platform descriptor path under the app-owned `platforms/` directory. `validatedPlatformDirectory` accepts the repository's platform name only as an exact match of a directory there; anything else yields `null` and the build stops. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/builder.js:951` | Reads the descriptor at the path validated on line 935 (app-owned, parsed as JSON, not `require`d). |
| Aikido | `AIK_ts_generic_path_traversal` (1) (x2) | `lib/thinx/builder.js:1005` | Fallback header path: XBUILD_PATH joined with the header name from the app-owned platform descriptor. Before anything is written, `safepath.resolveInside(XBUILD_PATH, ...)` must succeed and the write goes through `writeRepoFile` (`O_NOFOLLOW`), otherwise the build is refused with `unsafe_repository_file`. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/builder.js:1343` | `supportedLanguages()` lstat over the app-owned `languages/` directory; no request or repository data reaches it. |
| Aikido | `AIK_ts_generic_path_traversal` (1) (x2) | `lib/thinx/git.js:223` | The checkout directory name comes from `readdirSync` of the build path the clone just filled, filtered to real directories (`Dirent.isDirectory()`, false for symlinks). The name git chose is a single path segment under the validated build path. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/git.js:235` | Same statement as CodeQL #291 (fixed `basename.json` under the validated build path). |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/git.js:262` | `symlinkEntries` checks for `.git` directly inside the checkout path it was handed, so git never walks up to an enclosing repository. Read-only existence test. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/git.js:382` | Key path: `sshKeysDir` joined with a name from this owner's own key list (`getKeyPathsForOwner`). The Redis last-good value is used only when it is `===` one of those names, so it can reorder but never choose a path. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/safepath.js:62` | Inside `safepath.js`, the containment check itself (`isInside` resolves the root). |
| Aikido | `AIK_ts_generic_path_traversal` (1) (x2) | `lib/thinx/safepath.js:63` | `isInside`: resolves the candidate and tests the relative path; this is the check, not a use. |
| Aikido | `AIK_ts_generic_path_traversal` (1) (x2) | `lib/thinx/safepath.js:87` | `resolveInside`: lexical resolution of the target before the lexical and realpath containment tests that follow. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/safepath.js:106` | `resolveInside`: the lexical containment test. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/safepath.js:109` | `resolveInside`: rebuilds a missing leaf's path from its realpath'd parent, so a symlinked parent is caught by the containment test. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/safepath.js:174` | `readRepoFile`: opens only a path that `resolveInside` accepted, with `O_NOFOLLOW`, so a symlink swapped in after the check fails with `ELOOP`. |
| Aikido | `AIK_ts_generic_path_traversal` (1) (x2) | `lib/thinx/safepath.js:176` | `readRepoFile`: reads from the file descriptor opened on line 174, not from a path. |
| Aikido | `AIK_ts_generic_path_traversal` (1) | `lib/thinx/safepath.js:205` | `writeRepoFile`: opens only a path that `resolveInside` accepted, with `O_NOFOLLOW`. |

No remaining hit is a real issue. `lib/thinx/platform.js`, `sanitka.js`, `sources.js`, `devices.js` and `plugins/pine64/plugin.js` have no Aikido hit after (none before either).

## Suppression hygiene

- lgtm markers removed (pre-phase line numbers): `lib/thinx/git.js` 1 (71); `lib/thinx/builder.js` 4 (265, 267, 289, 323); `services/worker/class.js` 5 (163, 220, 221, 226, 232).
- `lgtm` count now in those three files: 0.
- Added suppressions: 0. Counted per file and per marker text (`lgtm`, `codeql[`, `nosemgrep`, `deepcode ignore`, `eslint-disable`, `NOSONAR`) at the phase base (`297ee357`, worker `f1c02c9`) and now; the pre-existing DeepCode comments that 23-02 moved into `attachBuildHandlers` keep their count. Gate output: `lgtm=0 added_suppressions=0`, `HYGIENE-OK`.
- Dismissed CodeQL alerts on the ref: 1, and it is not from this phase. The only dismissed alert is #118 (`js/path-injection`, `lib/thinx/notifier.js:168`, dismissed 2021-01-01 as won't fix), which the Phase 22 baseline already accounts for (`results_count` 148 = 147 open + 1 dismissed). No alert was dismissed on or after 2026-09-25, and none on a phase file (D-15). The plan's gate expected exactly `0`; it reads `1` because of that 2021 dismissal.
- No known-false-positive entry was added to `scripts/aikido-known-false-positives.json`.

## Data

The commands used (run 2026-09-27 and 2026-09-28):

```bash
# analyses on the ref (post-fix analysis id, commit, counts, tool version)
gh api 'repos/suculent/thinx-device-api/code-scanning/analyses?ref=refs/heads/thinx-staging&tool_name=CodeQL&per_page=3' \
  | jq -c '.[] | {id,commit_sha,created_at,results_count,rules_count,error,tool:.tool.version}'

# open alerts after, reduced locally to the baseline's fields
gh api --paginate 'repos/suculent/thinx-device-api/code-scanning/alerts?ref=refs/heads/thinx-staging&tool_name=CodeQL&state=open&per_page=100' \
  | jq -s 'add | map({number, rule_id: .rule.id, severity: .rule.severity,
      security_severity_level: .rule.security_severity_level,
      path: .most_recent_instance.location.path,
      start_line: .most_recent_instance.location.start_line, state,
      commit: .most_recent_instance.commit_sha})' > after.json

# totals, per-rule counts and number diff against 22-CODEQL-ALERTS.json
jq -r 'group_by(.security_severity_level)|map("\(.[0].security_severity_level)=\(length)")|join(" ")' after.json
jq -r 'group_by(.rule_id)|.[]|"\(.[0].rule_id) \(length)"' after.json
comm -13 <(jq -r '.[].number' 22-CODEQL-ALERTS.json | sort) <(jq -r '.[].number' after.json | sort)

# dismissed alerts on the ref
gh api 'repos/suculent/thinx-device-api/code-scanning/alerts?ref=refs/heads/thinx-staging&tool_name=CodeQL&state=dismissed&per_page=100' \
  | jq -c 'length, [.[] | {number, rule: .rule.id, path: .most_recent_instance.location.path, dismissed_at}]'

# Aikido: aikido_scan_paths (MCP) on the phase files at 297ee357 plus worker class.js at f1c02c9 (before)
# and on the working tree at c9385574 plus worker class.js at 79611f6 (after); each result through the noise filter
node scripts/aikido-filter.js aikido-before.json
node scripts/aikido-filter.js aikido-after.json

# worker legacy-path usage in production (read-only, node-local container)
docker logs --since 24h <thinx_worker container> 2>&1 | grep -ci "legacy cmd-only"
```

The suppression-hygiene gate is the third `<automated>` block of 23-05-PLAN.md Task 2, run unchanged.
