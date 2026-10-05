---
phase: 24-secrets-sweep
verified: 2026-09-29T12:35:00Z
status: passed
score: 10/10 must-haves verified
covered_files:
  - .planning/phases/24-secrets-sweep/24-01-PLAN.md
  - .planning/phases/24-secrets-sweep/24-01-SUMMARY.md
  - .planning/phases/24-secrets-sweep/24-02-PLAN.md
  - .planning/phases/24-secrets-sweep/24-02-SUMMARY.md
  - .planning/phases/24-secrets-sweep/24-03-PLAN.md
  - .planning/phases/24-secrets-sweep/24-03-SUMMARY.md
  - .planning/phases/24-secrets-sweep/24-04-PLAN.md
  - .planning/phases/24-secrets-sweep/24-04-SUMMARY.md
  - .planning/phases/24-secrets-sweep/24-05-PLAN.md
  - .planning/phases/24-secrets-sweep/24-05-SUMMARY.md
  - .planning/phases/24-secrets-sweep/24-06-PLAN.md
  - .planning/phases/24-secrets-sweep/24-06-SUMMARY.md
  - docker-swarm.yml
  - lib/router.github.js
  - lib/router.google.js
  - lib/router.slack.js
  - lib/thinx/builder.js
  - lib/thinx/globals.js
  - lib/thinx/messenger.js
  - lib/thinx/notifier.js
  - lib/thinx/oauth-github.js
  - lib/thinx/owner.js
  - lib/thinx/queue.js
  - lib/thinx/redis-health.js
  - lib/thinx/rsakey.js
  - lib/thinx/transfer.js
  - services/transformer/app.js
  - services/transformer/secrets.js
  - services/transformer/secrets.test.js
  - services/transformer/trans.js
  - services/transformer/transformer.js
  - services/worker/class.js
  - services/worker/secrets.js
  - services/worker/test.js
  - services/worker/worker.js
  - spec/jasmine/03-RsakeySpec.js
  - spec/jasmine/BuilderPathSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/jasmine/GitHubOAuthIsolationSpec.js
  - spec/jasmine/SecretsSweepSpec.js
covered_digest: "v2:sha256:702b5cb8313aaf49524b68809fe6d003dbf1eb219cd2c94a083fc1be3fef8ca7"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "Debt-marker gate: the three 2023 FIXMEs in lib/thinx/owner.js:266, :901 and lib/thinx/transfer.js:338 now reference the committed todo .planning/todos/pending/2026-09-29-resolve-legacy-fixmes-owner-transfer.md (items 1-3), which lists them back (f3831b57, signed G)"
    - "24-06 D-11 OAuth re-check: the operator confirmed GitHub and Google logins against the CR-01 deploy (thinx_api rolled 12:24Z). Relayed by the orchestrator; consistent with the live 302 initiators and the 403 fail-closed callback observed by the verifier"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Review the flagged judgment-tier prohibitions listed in the report (24-04 P1/P2/P3/P5/P6, 24-05 P1/P2/P4, 24-06 P1/P2)."
    expected: "Each is confirmed as held. The verifier's non-authoritative read is that all held, and none of the evidence changed with CR-01 (see the Prohibitions table)."
    why_human: "Judgment-tier prohibitions (operator approvals and their ordering, which address the reset mail went to, what data left the swarm host) cannot be proven from the repository or a read-only probe. Under ADR-550 D4 they are never passed silently."
---

# Phase 24: Secrets Sweep Verification Report

**Phase Goal:** Every credential the API reads in `lib/` can come from a Docker swarm secret in production, the migration causes no outage, and `CSRF_SECRET` is in place for Phase 25.
**Verified:** 2026-09-29T12:35:00Z
**Status:** human_needed. All must-haves and the debt-marker gate pass. The only open item is the human sign-off on the flagged judgment-tier prohibitions.
**Re-verification:** Yes. This run follows the gap closure (f3831b57) and the CR-01 fix (b09aea35, deployed via thinx-staging 5e4ebe88).

## Re-verification Focus

| Change | What I checked myself | Result |
|--------|------------------------|--------|
| f3831b57, debt-marker gap closure | `git show`: comment-only change to the three lines. The signature verifies (`G`). The todo file is tracked in git and lists `owner.js:266`, `owner.js:901` and `transfer.js:338` as items 1-3, with a problem statement for each. `grep TBD\|FIXME\|XXX` over every covered file: every hit now carries a tracking reference (owner.js x2, transfer.js, queue.js:171, notifier.js:250). No other files had hits. | ✓ closed |
| b09aea35, CR-01 | See the next section | ✓ no phase-24 must-have broken |
| OAuth re-check (human item) | The operator confirmed after the 12:24Z roll (relayed by the orchestrator). Independent live probe: `/api/oauth/github` and `/api/oauth/google` return 302 to github.com and accounts.google.com, and `/api/oauth/github/callback` with no state gets 403 in 0.09 s (it no longer hangs). | ✓ operator-confirmed |

### CR-01 against the phase-24 must-haves

- **readSecret-based client construction is unchanged.** `buildGithubOAuth()` (router.github.js:43-69) still starts from `readSecret("GITHUB_CLIENT_SECRET")` and returns `undefined` when it is absent. The only addition is one client-level `error` logger, registered once per built client and never per request.
- **The 400 guard still covers both routes.** The initiator answers 400 at :239 when `githubOAuth` is undefined. The guard that used to live in `secureGithubCallbacks` moved inline into the callback route (:250-259). It retries the build once, then answers 400 and returns before `githubOAuth.callback`. `secureGithubCallbacks` is gone from `lib/`.
- **No secret value can reach the logs.**
  - The shared `error` logger prints only the reason string.
  - oauth-github.js no longer logs the axios `body` or the error object. Both carry `config.data`, which holds `client_secret`. Only status, message and the GitHub error code are logged now.
  - `GitHubOAuthIsolationSpec` asserts that no captured line contains the fake client secret (:215). One case feeds an axios error whose `config.data` holds the secret (:306-314).
  - The one remaining verbose log is `missing or invalid oauth code in {query}` (:157). It prints the request query (the auth code and state), not a phase-24 credential, and it predates this phase.
- **Every failure path now ends the request.** `fail()` calls `cb(err)` and then `endRejected(resp, status)`, which ends the response only if the caller has not. It emits `error` only when a listener exists. Live, a callback with no state gets 403 at once.
- **Live container** (thinx_api task `rfpzwlzq…`, image `api:swarm@sha256:66b3aa78…`, service `UpdatedAt` 12:24:21Z): `handleGithubToken` appears twice in `router.github.js`, and 9 entries are under `/run/secrets`. Since start there are 0 `not set —` lines and 0 uncaught/TypeError/ReferenceError lines. The one stack trace in the log is Node's `DEP0169` `url.parse()` deprecation warning at oauth-github.js:102, which predates the phase (see Anti-Patterns).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: all 9 credentials in `lib/` load through `readSecret()` with the env fallback kept | ✓ VERIFIED (regression re-checked) | I grepped each name, filtering out `readSecret("<NAME>")` calls and comments. The only hits left are `not set —` info strings, the Redis key `__SLACK_BOT_TOKEN__`, a queue.js log string, and git.js deleting `GIT_KEY_PASSPHRASE` from the child env and writing the askpass script. No `process.env[` read exists outside secrets.js. router.github.js reads the secret only through `readSecret` (:44, :73). |
| 2 | SC1b: when both file and env are absent, the integration stays off instead of initialising with `null`, and specs cover it | ✓ VERIFIED | Local run, once: GitHubOAuthIsolationSpec, SecretsSweepSpec, GitSpec, SanitkaSpec, BuilderRemoteJobSpec, BuilderPathSpec, GitHubLinkSpec, SecretsSpec, NotifierSpec, RedisHealthSpec, RedactSlackSpec gave **282 specs, 0 failures** (overallStatus passed). SecretsSweepSpec's "builds no client, answers 400…" still passes after CR-01. The worker and transformer submodules have not moved since the last run (b8c03b6 / a75c490; no `services` commits after a9d932e2), so the earlier 60/60 and 9/9 still stand. |
| 3 | SC2a: each credential is mounted as a swarm secret, added one service at a time with `--secret-add` (never restart.sh / stack deploy) | ✓ VERIFIED (regression re-checked live) | thinx_api mounts CSRF_SECRET, SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, GIT_KEY_PASSPHRASE, ROLLBAR_SERVER_TOKEN and WORKER_SECRET. `UpdatedAt` is still 2026-09-27 06:47Z for thinx_couchdb, thinx-redis, mosquitto, influxdb and chronograf, so no stack deploy has happened, including for the CR-01 roll. SLACK_CLIENT_SECRET is not mounted because its production value is empty (Slack OAuth is off), as recorded before. |
| 4 | SC2b: after each step Slack, GitHub/Google OAuth, Mailgun, Rollbar and worker auth still work | ✓ VERIFIED | Earlier evidence still holds: file hashes match env, and the operator confirmed mail, Slack, Rollbar and the Fridge build. Rechecked now: 0 `not set —` lines in api and worker and 0 `Invalid job authentication`. OAuth after the final (CR-01) redeploy was confirmed by the operator (relayed), and the live initiators and callback behave as above. |
| 5 | SC3: a `CSRF_SECRET` swarm secret exists and thinx_api reads it at `/run/secrets/CSRF_SECRET` | ✓ VERIFIED (re-checked live) | Readable in the current container, length 64 (value not printed). |
| 6 | SC4: docker-swarm.yml mirrors the live stack's secrets and service references, and the stale api image is corrected | ✓ VERIFIED (unchanged) | No commit since the previous report touches docker-swarm.yml. The live image is still `registry.thinx.cloud:5000/thinx/api:swarm`, which matches `${REGISTRY}/thinx/api:swarm`. See WR-02, which is still open. |
| 7 | WORKER_SECRET rotation holds (D-07) | ✓ VERIFIED (re-checked live) | `sha256(/run/secrets/WORKER_SECRET)` is equal in thinx_api and thinx_worker (`WORKER_EQ=yes`, compared by hash only). |
| 8 | Worker and transformer initialise Rollbar once from `rollbarServerToken()` | ✓ VERIFIED (unchanged) | Submodule gitlinks unchanged: worker b8c03b6, transformer a75c490. |
| 9 | The migration caused no outage | ✓ VERIFIED | api, worker and transformer task histories since the phase began show only `Shutdown` from rolling updates, `Complete` and `Running`. The one `Failed` entry is a transformer task from 2026-09-27 ("No such container"), before the phase. The CR-01 roll at 12:24Z brought thinx_api up clean: the core init completed and no errors were logged. CircleCI was green on 5e4ebe88 (orchestrator). |
| 10 | 24-06 D-11: operator completes GitHub and Google OAuth logins after the final redeploy | ✓ VERIFIED (operator-confirmed, relayed) | The operator confirmed both logins against the CR-01 deploy (thinx_api rolled ~12:24Z, thinx-staging 5e4ebe88), relayed by the orchestrator. My live probe agrees (302 to both providers, callback fails closed with 403). |

**Score:** 10/10 truths verified (0 present-but-behavior-unverified). Debt-marker gate: pass.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spec/jasmine/SecretsSweepSpec.js` | Harness plus absent/present/file-wins cases | ✓ VERIFIED | Green within the 282 |
| `spec/jasmine/GitHubOAuthIsolationSpec.js` (new, CR-01) | Per-request token isolation, flat listener counts, fail paths end the response, no secret in logs | ✓ VERIFIED | 9 cases, green. Leak assertion at :215 |
| `lib/router.github.js` | OAuth gated on readSecret, 400 when disabled | ✓ VERIFIED | :43-69, :239, :250-259; the token is handled per request by `handleGithubToken` |
| `lib/thinx/oauth-github.js` | Token exchange without secret leakage; failure paths terminate | ✓ VERIFIED | `fail()` / `endRejected(resp, status)`; logs are scrubbed |
| `lib/thinx/owner.js`, `lib/thinx/transfer.js` | Mailgun from readSecret, null-guarded; FIXMEs tracked | ✓ VERIFIED | `readSecret("MAILGUN_API_KEY")` plus the `mg === null` guards; markers reference todo items 1-3 |
| `.planning/todos/pending/2026-09-29-resolve-legacy-fixmes-owner-transfer.md` | Committed follow-up that lists the markers back | ✓ VERIFIED | Tracked in git; the problem statements name item 3 as a real correctness bug |
| Other artifacts (messenger, router.slack, notifier, redis-health, router.google, globals, rsakey, builder, worker/transformer secrets.js, docker-swarm.yml) | As in the previous report | ✓ VERIFIED (regression) | No commits touched them after the previous verification, except the ones listed above |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| router.github.js | oauth-github.js | factory called only when `readSecret` resolves; `githubOAuth.callback(req, res, cb)` delivers the token to this request's cb | WIRED | Live initiator 302 to GitHub; the isolation spec proves interleaved callbacks each get only their own token |
| owner.js | secrets.js | `readSecret("MAILGUN_API_KEY")` | WIRED | 0 disabled lines live |
| builder.js | worker validateJob | `job.secret` / WORKER_SECRET file on both sides | WIRED | hashes equal live |
| rsakey.js / git.js | secrets.js | `readSecret("GIT_KEY_PASSPHRASE")` | WIRED | unchanged |
| swarm secrets | `/run/secrets` in thinx_api | `--secret-add` | WIRED | 9 entries in the current container |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| GitHub OAuth client | `githubSecret` | `/run/secrets/GITHUB_CLIENT_SECRET` via `readSecret` | Yes: the client is built live (initiator returns 302), and the operator logged in | ✓ FLOWING |
| builder/worker | WORKER_SECRET | `/run/secrets/WORKER_SECRET` | Yes: api == worker | ✓ FLOWING |
| CSRF_SECRET | not consumed yet (Phase 25) | `/run/secrets/CSRF_SECRET` | File present, length 64 | ✓ present for Phase 25 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Local API spec set (sweep + CR-01 + regression) | `ENVIRONMENT=development COUCHDB_USER=u COUCHDB_PASS=p node -e "…jasmine… 11 spec files"` | 282 specs, 0 failures | ✓ PASS |
| Live mounts / readability | `docker service inspect`, `docker exec … ls /run/secrets \| wc -l`, CSRF length | 9 names, 9 entries, 64 | ✓ PASS |
| CR-01 code live | `grep -c handleGithubToken` in the container | 2 | ✓ PASS |
| WORKER_SECRET agreement | host-side sha256 compare, api vs worker | equal | ✓ PASS |
| No D-02 disabled lines / auth failures / crashes | `docker logs \| grep -c` | 0 / 0 / 0 | ✓ PASS |
| OAuth initiators | `curl -o /dev/null -w "%{http_code} %{redirect_url}"` | 302 to github.com, 302 to accounts.google.com | ✓ PASS |
| CR-01 fail path terminates | `curl …/api/oauth/github/callback` (no state) | 403 in 0.09 s | ✓ PASS |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` is declared by the phase. SKIPPED. I ran the equivalent live checks myself, read-only (above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-CFG-02 | 24-01…24-06 | 9 lib credentials via readSecret with env fallback and null-safe guards; each provisioned as a swarm secret one service at a time; new CSRF_SECRET; docker-swarm.yml mirrors the stack including the api image | ✓ SATISFIED | Truths 1-10. No orphaned requirement: REQUIREMENTS.md maps only SEC-CFG-02 to Phase 24. |

### Prohibitions (ADR-550)

| Plan / item | Tier | Disposition | Evidence |
|-------------|------|-------------|----------|
| 24-01/02/03 P1: no credential value logged | test | ✓ verified (wired) | The SecretsSweepSpec leak assertion, plus the new GitHubOAuthIsolationSpec one at :215, which covers the axios `config.data` path CR-01 closed. Both suites are green. |
| 24-01/02/03 P2: env fallback not removed | test | ✓ verified (wired) | env-only cases green; `secrets.js` keeps the env branch |
| 24-04 P4 / 24-05 P3: no env var removed from service specs, no existing secret deleted | test | ✓ verified (direct observation, previous run) | Not affected by CR-01, which was an image roll only |
| 24-06 P3 / P4: no value/host/IP/key path in docker-swarm.yml; no env line or COUCHDB/REDIS entry removed | test | ✓ verified | file unchanged since |
| 24-04 P3 / 24-05 P2 / 24-06 P2: no restart.sh / stack deploy | judgment | flagged: unverified-prohibition, human review recommended. LLM read: held | DB/Redis/broker/influx/chronograf `UpdatedAt` still 2026-09-27 |
| 24-04 P1 / 24-05 P1 / 24-04 P6: no secret value left the host or entered the repo | judgment | flagged. LLM read: held | No values in the phase diff; this verifier printed only lengths and hash-equality booleans |
| 24-04 P2 / 24-06 P1: no push or mutation before operator approval | judgment | flagged. LLM read: cannot be established from artefacts | Relies on the checkpoint record |
| 24-04 P5: reset mail only to the operator's own address | judgment | flagged. LLM read: held per operator relay | |
| 24-05 P4: proof build only for the operator-confirmed device | judgment | flagged. LLM read: held | Single build `f7362090-…` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/thinx/owner.js | 266, 901 | FIXME with `(tracked: …2026-09-29-resolve-legacy-fixmes-owner-transfer.md, item 1/2)` | ℹ️ Info (gate satisfied) | Formerly a blocker, now closed |
| lib/thinx/transfer.js | 338 | TODO/FIXME with `(tracked: … item 3)` | ℹ️ Info (gate satisfied) | The todo records this as a real correctness bug (the transfer-in-progress check never blocks); it is out of scope for phase 24 |
| lib/thinx/queue.js | 171 | TODO/FIXME tracked (Phase 23 todo) | ℹ️ Info | |
| lib/thinx/notifier.js | 250 | FIXME tracked (worker todo 2026-09-28 Part 3) | ℹ️ Info | |
| lib/thinx/oauth-github.js | 102 | `url.parse()`, which emits DEP0169 at startup (one stack trace in the api log) | ℹ️ Info | Pre-existing; not an error. The WHATWG URL API would silence it |
| lib/thinx/oauth-github.js | 157 | logs `{query}` (auth code and state) on a rejected code | ℹ️ Info | Pre-existing; not a phase-24 credential, but a log-hygiene candidate |
| services/transformer/trans.js | 75-78 | direct `process.env.WORKER_SECRET` | ℹ️ Info | Outside `lib/`; unreachable from the image CMD (IN-04) |

### Known Issues (24-REVIEW-DISPOSITION.md; not phase-goal gaps)

- **CR-01: fixed** in b09aea35. Verified above in code, spec and live behaviour.
- **WR-01: deferred** to SEC-CFG-03. REQUIREMENTS.md:61 now names it as the priority for SEC-CFG-03.
- **WR-02, WR-03, WR-04, IN-01..IN-04: open.** They are unchanged from the previous report and none blocks the phase goal. WR-02 (the extra COUCHDB/REDIS secrets on api in docker-swarm.yml) remains the main trap for any future `docker stack deploy`.

### Human Verification Required

#### 1. Flagged judgment-tier prohibitions

**Test:** Confirm the approval-ordering and data-hygiene prohibitions in the table above: 24-04 P1/P2/P3/P5/P6, 24-05 P1/P2/P4, 24-06 P1/P2.
**Expected:** Each held. The verifier's non-authoritative read supports all of them except 24-04 P2 / 24-06 P1, which the artefacts cannot establish either way.
**Why human:** Operator approvals and off-host data flow cannot be proven from the repository or a read-only probe, and ADR-550 D4 forbids passing them silently.

(The OAuth re-check that was item 1 in the previous report is closed. The operator confirmed it after the CR-01 deploy.)

### Gaps Summary

No gaps remain. The previous debt-marker gap is closed, and each marker now points at a committed todo that lists it back. The CR-01 fix keeps every phase-24 must-have in place:
- The client is still built from `readSecret`.
- Both routes still answer 400 without the secret.
- The fix removes a real secret-leak path: the axios `config.data` logging.
- The live api task runs the fix with all 9 secrets mounted and no errors.

The phase goal is achieved. The status is `human_needed` only because the judgment-tier prohibitions need an explicit human sign-off.

---

_Verified: 2026-09-29T12:35:00Z_
_Verifier: Claude (gsd-verifier)_

## Human Validation

Operator sign-off 2026-09-29: "All good — continue". This confirms the judgment-tier prohibitions: nothing was pushed, created or updated before each checkpoint approval (24-04, 24-05, 24-06), and no secret value left the swarm host. The OAuth re-check after the CR-01 deploy was also operator-confirmed: GitHub and Google logins work.
