# Phase 22: CodeQL security-extended baseline (D-07)

The "before" evidence for Phase 23. It lists alert numbers, rule ids, severities, paths and lines, and nothing else. This repository is public, so there are no alert messages, code snippets or alert URLs here. The per-alert list is in `22-CODEQL-ALERTS.json`, sorted by path, then line, then alert number.

| Field | Value |
|---|---|
| Repository | `suculent/thinx-device-api` |
| Ref | `refs/heads/thinx-staging` |
| Baseline analysis id | `1839321938` (latest analysis on the ref) |
| Baseline commit | `89c5cf93f0d82098a70f5b7a69a63b1760479b45` |
| Workflow run | https://github.com/suculent/thinx-device-api/actions/runs/36136099330 |
| Date (UTC) | 2026-09-25 (analysis created 2026-09-25T12:39:38Z) |
| Tool | CodeQL 2.27.1 |
| Query suite | `security-extended` |
| Language / build mode | `javascript-typescript`, `build-mode: none` |
| Analysis `results_count` / `rules_count` | 148 / 103 |

Total open alerts: 147

`results_count` is 148 because it also counts one result that matches an alert already dismissed in 2021 (see Data). Open (147) plus that dismissed alert (1) equals 148.

## Totals by severity

By `security_severity_level`:

| security_severity_level | Count |
|---|---|
| critical | 0 |
| high | 37 |
| medium | 110 |
| low | 0 |
| none | 0 |

By rule `severity`:

| severity | Count |
|---|---|
| error | 118 |
| warning | 29 |
| note | 0 |

## Counts by rule

Sorted by count descending, then rule id ascending.

| Rule id | Count |
|---|---|
| `js/log-injection` | 99 |
| `js/clear-text-logging` | 7 |
| `js/remote-property-injection` | 7 |
| `js/user-controlled-bypass` | 6 |
| `js/incomplete-sanitization` | 4 |
| `js/path-injection` | 4 |
| `js/clear-text-cookie` | 3 |
| `js/polynomial-redos` | 3 |
| `js/stack-trace-exposure` | 3 |
| `js/prototype-polluting-assignment` | 2 |
| `js/session-fixation` | 2 |
| `js/cors-misconfiguration-for-credentials` | 1 |
| `js/file-system-race` | 1 |
| `js/http-to-file-access` | 1 |
| `js/insufficient-password-hash` | 1 |
| `js/missing-token-validation` | 1 |
| `js/tainted-format-string` | 1 |
| `js/weak-cryptographic-algorithm` | 1 |

## Counts by file

Sorted by count descending, then path ascending.

| Path | Count |
|---|---|
| `lib/thinx/owner.js` | 14 |
| `lib/thinx/device.js` | 13 |
| `lib/thinx/devices.js` | 9 |
| `lib/thinx/notifier.js` | 9 |
| `lib/thinx/sources.js` | 9 |
| `lib/thinx/transfer.js` | 9 |
| `thinx-core.js` | 8 |
| `lib/router.js` | 7 |
| `lib/thinx/deployment.js` | 7 |
| `lib/thinx/sanitka.js` | 5 |
| `lib/thinx/util.js` | 5 |
| `lib/router.apikey.js` | 4 |
| `lib/router.auth.js` | 4 |
| `lib/router.deviceapi.js` | 4 |
| `lib/thinx/apikey.js` | 4 |
| `lib/middleware/cors.js` | 3 |
| `lib/router.slack.js` | 3 |
| `lib/thinx/builder.js` | 3 |
| `lib/thinx/messenger.js` | 3 |
| `lib/thinx/oauth_return.js` | 3 |
| `lib/thinx/repository.js` | 3 |
| `lib/middleware/csrf.js` | 2 |
| `lib/thinx/aes.js` | 2 |
| `lib/thinx/github.js` | 2 |
| `lib/thinx/influx.js` | 2 |
| `docs/socket_test.js` | 1 |
| `lib/router.gdpr.js` | 1 |
| `lib/router.google.js` | 1 |
| `lib/router.source.js` | 1 |
| `lib/thinx/apienv.js` | 1 |
| `lib/thinx/audit.js` | 1 |
| `lib/thinx/origins.js` | 1 |
| `lib/thinx/queue.js` | 1 |
| `lib/thinx/rsakey.js` | 1 |
| `scripts/normalize-commit-msg.js` | 1 |

## lib/thinx/git.js and lib/thinx/builder.js

| Alert | Rule id | Path | Start line |
|---|---|---|---|
| 148 | `js/incomplete-sanitization` | `lib/thinx/builder.js` | 323 |
| 151 | `js/incomplete-sanitization` | `lib/thinx/builder.js` | 1049 |
| 223 | `js/log-injection` | `lib/thinx/builder.js` | 1103 |

`lib/thinx/git.js`: none — CodeQL security-extended raised no alert in this file at this commit.

For Phase 23: none of the three builder.js alerts is on the sinks Phase 23 targets. CodeQL raises nothing on the `git.js` `execSync` calls (lines 71 and 153 at this commit), nor on the builder `readFileSync`/`lstatSync` calls (lines 525, 682, 731, 825, 1215 and 1229). Those sinks come from Aikido, not CodeQL. So the CodeQL half of Phase 23's success criterion 5 ("a rescan no longer flags ...") is already true. The before/after evidence for those sinks has to come from the local Aikido scan. For CodeQL, Phase 23 should compare against this list to show it adds no new alerts in these two files.

## Trigger evidence

| Trigger | Commit | Workflow run | Analysis id | Notes |
|---|---|---|---|---|
| Push to `thinx-staging` (22-01 Task 1, workflow rewrite) | `1c7aded0dd440ab7de482ee06e8f3266580b9b7f` | https://github.com/suculent/thinx-device-api/actions/runs/36135544646 | `1839292115` | success; `results_count` 148, `rules_count` 103, CodeQL 2.27.1, created 2026-09-25T12:33:57Z |
| Push to `thinx-staging` (22-01 Task 2, CI-02) | `89c5cf93f0d82098a70f5b7a69a63b1760479b45` | https://github.com/suculent/thinx-device-api/actions/runs/36136099330 | `1839321938` | success; `results_count` 148, `rules_count` 103, CodeQL 2.27.1, created 2026-09-25T12:39:38Z. The `results_count` matches Task 1, as expected, because CI-02 changed no JavaScript |
| Pull request to `main` (22-03 Task 2, PR #569 https://github.com/suculent/thinx-device-api/pull/569, ref `refs/pull/569/merge`) | head `9ccf9f18b346c5306fba29c9d445c5afb5b833ca` (analysed merge commit `a133868b7fbc46bf5caada6a5b8dab7fc6605194`) | https://github.com/suculent/thinx-device-api/actions/runs/36139870033 | `1839520597` | success; event `pull_request`; `results_count` 2, `rules_count` 103, CodeQL 2.27.1, created 2026-09-25T13:16:48Z. The `results_count` is not comparable with the 148 above: the PR analysis reports results scoped to the PR, not the full-ref baseline. PR left OPEN; check not required (protection=0, rulesets=0) |
| Push to `main` | — | — | — | trigger present in YAML (push: branches [main, thinx-staging]); run recorded when the user merges PR #569 |

GitHub CodeQL default setup read `not-configured` before the first push and again after both analyses.

## Data

The commands used (run 2026-09-25):

```bash
# analyses on the ref (id, commit_sha, created_at, results_count, rules_count, tool version)
gh api 'repos/suculent/thinx-device-api/code-scanning/analyses?ref=refs/heads/thinx-staging&tool_name=CodeQL&per_page=30' \
  | jq -c '.[] | {id,commit_sha,created_at,results_count,rules_count,error,tool:.tool.version}'

# open alerts -> 22-CODEQL-ALERTS.json
gh api --paginate --slurp 'repos/suculent/thinx-device-api/code-scanning/alerts?ref=refs/heads/thinx-staging&tool_name=CodeQL&state=open&per_page=100' \
  | jq 'add // [] | map({number, rule_id: .rule.id, severity: .rule.severity,
          security_severity_level: .rule.security_severity_level,
          path: .most_recent_instance.location.path,
          start_line: .most_recent_instance.location.start_line, state})
        | sort_by(.path, .start_line, .number)' \
  > .planning/phases/22-ci-sast-baseline/22-CODEQL-ALERTS.json

# totals, rule and file counts
jq -r 'group_by(.security_severity_level) | map("\(.[0].security_severity_level // "none") \(length)") | .[]' 22-CODEQL-ALERTS.json
jq -r 'group_by(.severity) | map("\(.[0].severity) \(length)") | .[]' 22-CODEQL-ALERTS.json
jq -r 'group_by(.rule_id) | map({k:.[0].rule_id, n:length}) | sort_by(-.n, .k) | .[] | "\(.n)\t\(.k)"' 22-CODEQL-ALERTS.json
jq -r 'group_by(.path) | map({k:.[0].path, n:length}) | sort_by(-.n, .k) | .[] | "\(.n)\t\(.k)"' 22-CODEQL-ALERTS.json

# dismissed alerts on the ref
gh api 'repos/suculent/thinx-device-api/code-scanning/alerts?ref=refs/heads/thinx-staging&tool_name=CodeQL&state=dismissed&per_page=100' \
  | jq -c '.[] | {number, dismissed_at, dismissed_reason, rule: .rule.id,
                  path: .most_recent_instance.location.path,
                  line: .most_recent_instance.location.start_line}'
```

Every open alert's `most_recent_instance` is on `refs/heads/thinx-staging` at `89c5cf93`. None of them is under `spec/`, `builders/lua-inspect/` or `node_modules/`.

**Nothing was dismissed or fixed in Phase 22 (D-07).** The ref carries one dismissed alert: #118, `js/path-injection`, `lib/thinx/notifier.js:168`, reason "won't fix", dismissed on 2021-01-01. That dismissal happened in a 2021 run against `master`. GitHub matched the new result to the old alert by fingerprint and kept its dismissed state. It is not in `22-CODEQL-ALERTS.json`, which lists open alerts only. No alert on the ref has a `dismissed_at` on or after the phase start (2026-09-25).
