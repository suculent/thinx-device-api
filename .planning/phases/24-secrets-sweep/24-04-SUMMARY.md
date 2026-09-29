---
phase: 24-secrets-sweep
plan: 04
subsystem: infra
tags: [deploy, swarm, docker-secrets, secrets, readSecret, circleci, swarmpit, production]
requires:
  - phase: 24-secrets-sweep
    provides: "24-01/24-03 lib/ credentials read through readSecret; 24-02 worker and transformer secrets.js + rollbarServerToken (submodule commits b8c03b6 / a75c490)"
  - phase: 23-build-pipeline-sink-hardening
    provides: "proven push order (submodule main -> parent thinx-staging) and CircleCI / Docker Hub checks"
provides:
  - "Phase-24 code live on thinx_api, thinx_worker and thinx_transformer (all three proven on the env fallback before any secret existed)"
  - "thinx_api mounts SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, ROLLBAR_SERVER_TOKEN, GIT_KEY_PASSPHRASE and CSRF_SECRET, added by one --secret-add update, with no value drift"
  - "CSRF_SECRET (64 hex chars, host-generated) readable at /run/secrets/CSRF_SECRET in thinx_api for Phase 25"
  - "queue_probe=ok: the read-only Redis build-queue probe through the API container works (queue_keys=4 running=0 waiting=3) for plan 24-05"
affects: [24-05, 24-06, 25, SEC-CFG-03]
plan_head_before: 418dff2e42aed56771cfd19653f29f46acfe3b81
plan_head_after: e60e3c92b300a1f5d92e6fcdf49fe86146bd7315
submodule_heads:
  services/worker:
    pushed: "origin/main d6ca153..b8c03b6; thinx-staging fast-forwarded d6ca153..b8c03b6"
  services/transformer:
    pushed: "origin/main d4f5985..a75c490 (its remote thinx-staging not pushed)"
parent_push: "thinx-staging fc070578..e60e3c92 (origin/main unchanged)"
actuals:
  tokens: 133
  tasks: 3
  commits: 1
tech-stack:
  added: []
  patterns:
    - "Host-side secret provisioning: value captured from `docker service inspect` env inside the remote shell and piped into `docker secret create`; only name + SHA-256/12 printed"
    - "Drift proof: in-container readSecret(NAME) fp12 must equal the service-env fp12 (p24-fp.js), CSRF_SECRET by length only"
    - "Single-service rollout: one `docker service update --with-registry-auth --detach=false --secret-add …` per service, env kept as fallback (D-06), --secret-rm as rollback (D-12)"
key-files:
  created: []
  modified:
    - services/worker (gitlink -> b8c03b6)
    - services/transformer (gitlink -> a75c490)
key-decisions:
  - "Operator answered Task 1 with proceed and named an operator-owned mail address; no second pause, because the preflight matched every Task 1 expectation"
  - "ROLLBAR_SERVER_TOKEN was created from the thinx_api ROLLBAR_ACCESS_TOKEN value (fp ed9f549aaa63, identical on all three services); no rotation of any carried-over value (D-07)"
  - "SLACK_CLIENT_SECRET is empty in the thinx_api env, so no secret was created and Slack OAuth stays off (D-02, D-05)"
  - "WORKER_SECRET stays env-only on thinx_api until the 24-05 rotation; thinx_worker and thinx_transformer specs untouched (mounts=0)"
patterns-established:
  - "Secret provisioning evidence carries names, lengths and fp12 only; the operator mail address is not written to the repo"
requirements-completed: [SEC-CFG-02]
coverage:
  - id: D1
    description: "Phase-24 code deployed to thinx_api, thinx_worker and thinx_transformer, all running on the env fallback with no integration switched off before any secret existed"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "Task 2 verify: SUBMODULES-PUSHED-AND-BUMPED; worker/transformer HUB-FRESH; CircleCI api-registry=success test=success for e60e3c92; node/mounts=0/openssl=yes"
        status: pass
      - kind: other
        ref: "Task 2 step 6 log scan: 0 restarts, 0 'not set —' lines, 0 'Rollbar reporting disabled' lines on all three services"
        status: pass
    human_judgment: false
  - id: D2
    description: "thinx_api mounts the 7 carried-over credentials as swarm secrets with the same values as its env (no drift, no rotation)"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "p24-fp.js in thinx_api: 7 lines file=1 read==env; created-secret fp12 == preflight fp12"
        status: pass
      - kind: other
        ref: "mount list = CSRF_SECRET GITHUB_CLIENT_SECRET GIT_KEY_PASSPHRASE GOOGLE_OAUTH_SECRET MAILGUN_API_KEY ROLLBAR_SERVER_TOKEN SLACK_BOT_TOKEN SLACK_WEBHOOK (no WORKER_SECRET); task Running, restartcount=0 after 5 min"
        status: pass
    human_judgment: false
  - id: D3
    description: "CSRF_SECRET generated on the swarm host and readable at /run/secrets/CSRF_SECRET in thinx_api"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "p24-fp.js: CSRF_SECRET file=1 len=64"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-11 integration checks after the thinx_api mount: Slack webhook, Rollbar server token, Mailgun reset mail, OAuth initiators, deploy-key passphrase"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "p24-slack.js SLACK-OK; p24-rollbar.js ROLLBAR-OK; log 'password_reset_init true reset_sent' count=1; oauth github 302 github.com / google 302 accounts.google.com; keyPassphrase() non-null"
        status: pass
      - kind: manual_procedural
        ref: "operator confirmed (relayed by orchestrator): Slack message arrived, Rollbar item visible, reset mail arrived"
        status: pass
    human_judgment: false
  - id: D5
    description: "GitHub and Google OAuth logins work end to end with the secrets mounted on thinx_api"
    requirement: SEC-CFG-02
    verification:
      - kind: manual_procedural
        ref: "operator confirmed GitHub and Google login after the thinx_api mount (relayed by orchestrator)"
        status: pass
    human_judgment: true
    rationale: "A full OAuth login needs a human at the browser; the operator has confirmed both after this plan's mount. 24-06 was the scheduled place for this check and may treat it as done for thinx_api."
duration: 51min
completed: 2026-09-29
status: complete
---

# Phase 24 Plan 04: thinx_api Secrets Rollout Summary

**Phase-24 readSecret code deployed to all three services, then thinx_api switched to 7 swarm secrets carried over from its env (fp12 unchanged) plus a host-generated 64-char CSRF_SECRET, all mounted by one `--secret-add` update. Slack, Rollbar, Mailgun, OAuth and the passphrase checks passed afterwards, with 0 restarts.**

## Performance

- **Duration:** 51 min
- **Started:** 2026-09-29T09:33:04Z
- **Completed:** 2026-09-29T10:24:11Z
- **Tasks:** 3 (1 decision checkpoint, 1 tracer, 1 auto)
- **Files modified:** 2 (parent gitlinks)

## Accomplishments

- The worker, transformer and parent code was pushed in the proven order and the three services autoredeployed through Swarmpit. None needed a recovery or update command. All three ran the new code on their unchanged env values.
- thinx_api now reads SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, ROLLBAR_SERVER_TOKEN and GIT_KEY_PASSPHRASE from `/run/secrets`, with values identical to the env (no drift, no rotation).
- CSRF_SECRET exists for Phase 25. It was generated on the host and verified by length only.
- Every D-11 check for thinx_api passed, both automated and confirmed by the operator. GitHub and Google login were also confirmed early.

## Task Commits

1. **Task 1: approve deploy and thinx_api provisioning** — checkpoint, no commit (operator: proceed, operator-owned address named)
2. **Task 2 (tracer): pointer bump, ordered push, CI, env-fallback proof, preflight** — `e60e3c92` (chore, signed)
3. **Task 3: create secrets, one --secret-add update, D-11 checks** — no repository change (production swarm only)

**Plan metadata:** see the `docs(24-04)` commit that adds this file

## Task 2 evidence

- `secret_hits=0` (outgoing diffs scanned: worker 447 lines, transformer 260 lines, parent 4796 lines; the only raw pattern matches were the manager endpoint that AGENTS.md already publishes and the plan's own list of scan patterns)
- Local gates before push: combined jasmine 268 specs, 0 failures; worker jest 60/60; transformer secrets.test.js 9/9
- Pushes: worker main d6ca153..b8c03b6 and thinx-staging fast-forward OK; transformer main d4f5985..a75c490; parent thinx-staging fc070578..e60e3c92 (main untouched)
- Docker Hub: worker HUB-FRESH, transformer HUB-FRESH. CircleCI for e60e3c92: `api-registry=success test=success`, no node repair needed
- Rollout (autoredeploy, no command run): thinx_worker new task 09:41:43Z (`secrets.js` present, `rollbarServerToken` in worker.js); thinx_transformer 09:44:15Z (`/home/node/app/secrets.js` exists); thinx_api 09:49:27Z (`readSecret("MAILGUN_API_KEY")` in owner.js)
- Env-fallback proof: 0 restarts on all three; 0 `not set —` lines for the 8 thinx_api names; 0 `Rollbar reporting disabled` on worker and transformer; 0 `app-start Slack send failed`
- OAuth initiator baseline: github `302 github.com`, google `302 accounts.google.com`
- `queue_probe=ok` (`queue_keys=4 running=0 waiting=3`). The first attempt was denied by the permission classifier. After the operator changed permissions, the orchestrator ran the same probe.

### Preflight (names, presence, length, fp12 only)

| Key | thinx_api | thinx_worker | thinx_transformer |
|---|---|---|---|
| SLACK_BOT_TOKEN | 1 len=42 fp=2d339490e996 | 0 | 0 |
| SLACK_CLIENT_SECRET | 0 | 0 | 0 |
| SLACK_WEBHOOK | 1 len=79 fp=d4b9cefa4612 | 0 | 0 |
| GITHUB_CLIENT_SECRET | 1 len=40 fp=26fa3e0d4388 | 0 | 0 |
| GOOGLE_OAUTH_SECRET | 1 len=24 fp=8106c88ec7c7 | 0 | 0 |
| MAILGUN_API_KEY | 1 len=36 fp=f5cf07039dc0 | 0 | 0 |
| ROLLBAR_ACCESS_TOKEN | 1 len=96 fp=ed9f549aaa63 | 1 len=96 fp=ed9f549aaa63 | 1 len=96 fp=ed9f549aaa63 |
| WORKER_SECRET | 1 len=15 fp=66572afa8bdd | 1 len=15 fp=66572afa8bdd | 0 |
| GIT_KEY_PASSPHRASE | 1 len=5 fp=38652d9f907d | 0 | 0 |

- Mounts: 0 on all three services. Node: all three on the manager node (micro). `swarmpit.service.deployment.autoredeploy=true` on all three. openssl present on the manager.
- `docker secret ls` before Task 3: COUCHDB_PASS, COUCHDB_USER, REDIS_PASSWORD, REGISTRY_HTTP_SECRET, ROLLBAR_TOKEN. None of the Task 3 names existed.
- Step 8 gate: every Task 1 expectation held, so the run continued without a second pause.

## Task 3 evidence

- **Precondition (10:17:25Z):** CircleCI thinx-staging idle (all finished/success on e60e3c92), none of the Task 3 names present, all three services at mounts=0.
- **Created** (fp12 equals the preflight fp12 of the source key for every one):

  | Secret | Source env key | fp12 |
  |---|---|---|
  | SLACK_BOT_TOKEN | SLACK_BOT_TOKEN | 2d339490e996 |
  | SLACK_WEBHOOK | SLACK_WEBHOOK | d4b9cefa4612 |
  | GITHUB_CLIENT_SECRET | GITHUB_CLIENT_SECRET | 26fa3e0d4388 |
  | GOOGLE_OAUTH_SECRET | GOOGLE_OAUTH_SECRET | 8106c88ec7c7 |
  | MAILGUN_API_KEY | MAILGUN_API_KEY | f5cf07039dc0 |
  | GIT_KEY_PASSPHRASE | GIT_KEY_PASSPHRASE | 38652d9f907d |
  | ROLLBAR_SERVER_TOKEN | ROLLBAR_ACCESS_TOKEN | ed9f549aaa63 |
  | CSRF_SECRET | `openssl rand -hex 32` on the host | length 64 only |

  `skipped SLACK_CLIENT_SECRET (empty)`: the empty edge held, and no secret was created from an empty value.
- **One service update** (10:17:58Z to 10:18:18Z): eight `--secret-add` flags on thinx_api only. The task converged with `UpdateStatus.State=completed`. The new task started at 10:18:12Z and was Running with `RestartCount=0` at the 5-minute mark (10:23:15Z). No rollback was needed.
- **Mount list:** CSRF_SECRET GITHUB_CLIENT_SECRET GIT_KEY_PASSPHRASE GOOGLE_OAUTH_SECRET MAILGUN_API_KEY ROLLBAR_SERVER_TOKEN SLACK_BOT_TOKEN SLACK_WEBHOOK (no WORKER_SECRET).
- **p24-fp.js:** `file=1` and `read=` equal to `env=` for all 7 names; `CSRF_SECRET file=1 len=64`.
- **D-11 checks:**
  - Slack: `SLACK-OK`. The operator confirmed the message arrived with the text `phase-24 secrets check: thinx_api SLACK_WEBHOOK from /run/secrets`.
  - Rollbar: `ROLLBAR-OK` through the mounted server token. The operator confirmed the item is visible in Rollbar.
  - Mailgun: the reset POST got `200 password_reset_request_accepted`, and the API log shows `password_reset_init true reset_sent` (count 1). The operator confirmed that the mail reached the operator-owned address named at Task 1. The address is not recorded here.
  - OAuth initiators: github `302 github.com`, google `302 accounts.google.com`, the same as the Task 2 baseline.
  - OAuth logins: the operator confirmed that GitHub and Google login work after the thinx_api mount. The plan scheduled this human check for the end of the phase (24-06), and for thinx_api it is now done.
  - Passphrase: `RSAKey.keyPassphrase() !== null` is `true`.
  - Logs since the new task: 0 `not set —` lines (0 per name for all 8, WORKER_SECRET included), 0 `app-start Slack send failed`, 0 `Rollbar reporting disabled`.
- **Untouched (D-08):** COUCHDB_USER, COUCHDB_PASS, REDIS_PASSWORD, REGISTRY_HTTP_SECRET and ROLLBAR_TOKEN are still present and unmounted. thinx_worker and thinx_transformer are still at mounts=0. No env var was removed and no secret was deleted.

## Files Created/Modified

- `services/worker` (gitlink): now b8c03b6, the worker readSecret / rollbarServerToken build
- `services/transformer` (gitlink): now a75c490, the transformer readSecret / rollbarServerToken build

## Decisions Made

- The Task 1 answer was proceed, with an operator-owned address named. The preflight matched every stated expectation, so Task 3 ran without a second pause.
- ROLLBAR_SERVER_TOKEN was sourced from the thinx_api ROLLBAR_ACCESS_TOKEN, whose fp12 is identical on all three services.
- SLACK_CLIENT_SECRET was left off because its env value is empty.

## Deviations from Plan

None. The plan executed as written. The notes below changed no step:
- The 5-minute stability wait ran as a background until-loop, because the harness blocks a plain foreground `sleep`.
- When the Mailgun log line was shown in the transcript, the task/node prefix was masked with a sed. The count check itself ran unmodified.

**Total deviations:** 0
**Impact on plan:** none

## Issues Encountered

- The Task 2 queue probe was denied by the permission classifier on the first run. It was resolved by an operator permission change, and the orchestrator then ran the probe (see `queue_probe` above).
- Correction to the plan's context facts: `services/transformer` does have a remote `thinx-staging` branch. The plan said it has none. Per the plan it was not pushed.
- Test traffic was sent as approved: one Slack message in #thinx, one Rollbar info item, and one password-reset mail to the operator's own address. The reset key it created can be left to expire.

## Backlog observation

- thinx_api's `GIT_KEY_PASSPHRASE` is **5 characters long** (value not exposed). That is weak for a deploy-key passphrase. Consider a longer passphrase when the key is next rotated. That rotation is out of scope here (D-07: no rotation of carried-over values).

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Plan 24-05 can start. The thinx_api step (D-05 step 1) is done, and `queue_probe=ok` gives 24-05 its no-running-build check.
- 24-05 must rotate WORKER_SECRET on thinx_api and thinx_worker together (D-07), then add ROLLBAR_SERVER_TOKEN to the worker and the transformer. The ROLLBAR_SERVER_TOKEN secret already exists in the swarm (fp ed9f549aaa63), so 24-05 mounts it and must not create it again.
- Rollback for this plan stays available: `docker service update --secret-rm <names> thinx_api`. The env still holds every value.

---
*Phase: 24-secrets-sweep*
*Completed: 2026-09-29*
