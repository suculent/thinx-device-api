---
phase: 24-secrets-sweep
plan: 06
subsystem: infra
tags: [swarm, docker-secrets, secrets, docker-swarm.yml, deploy, verification, production]
requires:
  - phase: 24-secrets-sweep
    provides: "24-04 thinx_api mounts (8 secrets incl. CSRF_SECRET); 24-05 WORKER_SECRET rotation on api+worker and ROLLBAR_SERVER_TOKEN on worker+transformer"
provides:
  - "docker-swarm.yml declares the 9 phase-24 secrets external: true and attaches them to api, worker and transformer exactly as the live services mount them (SEC-CFG-02 criterion 4, D-10)"
  - "api image in docker-swarm.yml corrected to ${REGISTRY}/thinx/api:swarm; stale thinxcloud/api:latest and its commented twin removed"
  - "Proof that a routine Swarmpit autoredeploy keeps every CLI-added secret mount on thinx_api, with the rotated WORKER_SECRET still equal to the worker's (T-24-21)"
  - "Final D-11 sweep across thinx_api, thinx_worker and thinx_transformer, and the D-08 inventory recorded untouched"
affects: [25, SEC-CFG-03, SEC-CFG-04]
plan_head_before: 383267d8b722f94f468dd58e0f1f3e9148645f6f
plan_head_after: c1ce0aab830fef4da0f423f531063d737d08ea6f
actuals:
  tokens: 1233
  tasks: 3
  commits: 1
tech-stack:
  added: []
  patterns:
    - "docker-swarm.yml as documentation of the live stack: every secret external: true, service lists compared name-by-name with `docker service inspect` over ssh (PARITY-OK), never applied with docker stack deploy"
    - "Persistence proof after a push-to-deploy: new task digest, mount list from the service spec, then in-container readSecret fp12 per name"
key-files:
  created: []
  modified:
    - docker-swarm.yml
key-decisions:
  - "Operator answered Task 1 with proceed: one push of thinx-staging (never main) carrying the docker-swarm.yml commit and the unpushed 24-04/24-05 docs commits"
  - "api keeps its COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD entries in docker-swarm.yml with a comment that they are not mounted live (SEC-CFG-04); that is the only yml/live difference"
  - "SLACK_CLIENT_SECRET is not declared: it was never created because Slack OAuth is off (empty env)"
  - "The old host-side creation snippet (reading the deployment .env) was replaced with one that pipes a value from the service env, or from openssl rand, into docker secret create"
patterns-established:
  - "Swarmpit autoredeploy updates only the image of an existing service spec; secrets added with docker service update --secret-add survive it (proven 2026-09-29)"
requirements-completed: [SEC-CFG-02]
coverage:
  - id: D1
    description: "docker-swarm.yml declares every live phase-24 secret as external and attaches it to the right service, with the api image corrected and no environment line changed"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "node + js-yaml structure check (plan Task 2 verify 1): YML-OK"
        status: pass
      - kind: other
        ref: "read-only live parity over ssh: PARITY-OK, explained difference api:COUCHDB_USER/COUCHDB_PASS/REDIS_PASSWORD yml-only; live api image ends /thinx/api:swarm@sha256:"
        status: pass
      - kind: other
        ref: "hygiene on commit c1ce0aab: added_leaks=0 removed_env_or_db_secret=0; grep -c thinxcloud/api:latest docker-swarm.yml = 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "A routine deploy (push to thinx-staging, CircleCI, Swarmpit autoredeploy) keeps every thinx_api secret mount, and WORKER_SECRET still matches the worker"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "CircleCI for c1ce0aab: api-registry=success test=success"
        status: pass
      - kind: other
        ref: "thinx_api digest 6f5232ec13d6 -> c12569cef075, UpdateStatus completed; 9 mounts in the new spec; p24-fp.js: 9 lines file=1, 7 carried-over read==env, WORKER_SECRET read=170916780f07 (== worker), CSRF_SECRET len=64"
        status: pass
    human_judgment: false
  - id: D3
    description: "Final automated D-11 sweep after the redeploy: Slack, Rollbar from all three services, OAuth initiators, D-08 inventory"
    requirement: SEC-CFG-02
    verification:
      - kind: other
        ref: "p24-slack.js SLACK-OK; p24-rollbar.js ROLLBAR-OK x3 (final-api, final-worker, final-transformer)"
        status: pass
      - kind: manual_procedural
        ref: "operator confirmed (relayed by orchestrator): the three final Rollbar items (api, worker, transformer) and the final Slack message arrived"
        status: pass
      - kind: other
        ref: "secret inventory: no MISSING line for COUCHDB_USER, COUCHDB_PASS, REDIS_PASSWORD, REGISTRY_HTTP_SECRET, ROLLBAR_TOKEN, CSRF_SECRET, WORKER_SECRET, ROLLBAR_SERVER_TOKEN; oauth github 302 github.com, google 302 accounts.google.com"
        status: pass
    human_judgment: false
  - id: D4
    description: "GitHub and Google OAuth logins complete end to end on the production console (D-11 human check)"
    requirement: SEC-CFG-02
    verification:
      - kind: manual_procedural
        ref: "operator confirmed GitHub and Google login after the 24-04 thinx_api mount (relayed by orchestrator); neither OAuth secret changed since"
        status: pass
    human_judgment: true
    rationale: "A full OAuth round-trip needs the operator's provider accounts and a browser session. The executor only proves the initiators redirect. Listed for the end-of-phase UAT so the operator can re-confirm after this plan's redeploy."
duration: 9min
completed: 2026-09-29
status: complete
---

# Phase 24 Plan 06: docker-swarm.yml Secrets Mirror and Final Sweep Summary

**docker-swarm.yml now declares the nine phase-24 secrets as `external: true`, attaches them to api (9 plus the 3 recorded unmounted DB/Redis entries), worker (2) and transformer (1) exactly as the live services mount them, and points api at `${REGISTRY}/thinx/api:swarm`. Pushing that commit rolled thinx_api to digest c12569cef075 through the normal Swarmpit autoredeploy. All nine mounts survived, and WORKER_SECRET still reads the rotated value the worker reads. The final D-11 sweep passed on all three services.**

## Performance

- **Duration:** 9 min for this continuation (Task 1 was answered earlier by the operator)
- **Started:** 2026-09-29T11:48:49Z
- **Completed:** 2026-09-29T11:58:46Z
- **Tasks:** 3 (1 decision checkpoint answered `proceed`, 1 tracer, 1 auto)
- **Files modified:** 1 (`docker-swarm.yml`)

## Accomplishments

- SEC-CFG-02 criterion 4 (D-10): `docker-swarm.yml` mirrors the live stack's secrets and service attachments. The stale api image reference is corrected. No `environment:` line changed.
- T-24-21 is closed with evidence: a push-to-deploy rewrote thinx_api's image, and the secrets added with `--secret-add` in 24-04 and 24-05 stayed mounted. The rotated WORKER_SECRET on the new API task still equals the worker's.
- Criteria 2 and 3 were re-confirmed after a routine deploy: Slack, Rollbar from all three services, the OAuth initiators, and CSRF_SECRET at length 64.

## Task Commits

1. **Task 1: approve the thinx-staging push.** Checkpoint only, no commit. The operator answered `proceed`.
2. **Task 2 (tracer): docker-swarm.yml mirror, push, persistence proof.** `c1ce0aab` (chore, signed `G`)
3. **Task 3: final D-11 sweep and D-08 inventory.** Read-only production checks, no repository change.

**Plan metadata:** see the `docs(24-06)` commit that adds this file.

## Task 2 evidence

- **Precondition:** Task 1 was answered `proceed`. 24-05 recorded the final mounts. CircleCI thinx-staging was idle: every job for e60e3c92 had succeeded and none was queued or running.
- **Edit:**
  - Top level: COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD are kept. SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, ROLLBAR_SERVER_TOKEN, WORKER_SECRET, GIT_KEY_PASSPHRASE and CSRF_SECRET are added, all `external: true`.
  - The comment above the block was rewritten to record the live state: the per-service mounts, how the secrets were created (a name-only snippet with no values and no hosts), the D-06 env fallback, the unmounted COUCHDB/REDIS secrets (SEC-CFG-04), the unused REGISTRY_HTTP_SECRET and ROLLBAR_TOKEN (D-08), and that SLACK_CLIENT_SECRET is not created.
  - api: the image is `${REGISTRY}/thinx/api:swarm`. The secrets list holds the three pre-existing entries under a SEC-CFG-04 comment, followed by the nine live mounts.
  - worker: WORKER_SECRET and ROLLBAR_SERVER_TOKEN. transformer: ROLLBAR_SERVER_TOKEN.
  - Diff: 67 insertions, 16 deletions. Every deleted line is either a comment or one of the two api image lines.
- **YML-OK.** Additional check: all 12 top-level names are referenced by a service, and no service references an undeclared name.
- **PARITY-OK.** The yml and live lists (sorted, compared name by name) match for all three services. The only difference is the explained one: api COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD are in the yml only. The live api image ends with `/thinx/api:swarm@sha256:`.
- **Hygiene:** on commit c1ce0aab, `added_leaks=0` and `removed_env_or_db_secret=0`. `thinxcloud/api:latest` count is 0. The outgoing push range (6 commits) was also scanned for IPs, key paths, ssh ports, webhook URLs, token prefixes and mail addresses, with 0 hits.
- **Push:** at 11:51:39Z, `git push origin thinx-staging` pushed `e60e3c92..c1ce0aab`. That range holds the docker-swarm.yml commit plus the docs commits 9dd6f240..383267d8. main was not touched.
- **CI for c1ce0aab:** `api-registry=success test=success`. test ran from about 11:52 to 11:54, and api-registry finished at about 11:55:40Z.
- **Autoredeploy:** Swarmpit rolled thinx_api from digest `6f5232ec13d6` to `c12569cef075` at about 11:57Z, roughly 1.5 min after api-registry. UpdateStatus was `completed`, and the new task was Running by 11:57:21Z. No recovery command was needed, so none was run.
- **Persistence proof:**
  - The new service spec still mounts CSRF_SECRET, SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, GIT_KEY_PASSPHRASE, ROLLBAR_SERVER_TOKEN and WORKER_SECRET.
  - `p24-fp.js` output from the new task:

  | Name | file | read fp12 | env fp12 |
  |---|---|---|---|
  | SLACK_BOT_TOKEN | 1 | 2d339490e996 | 2d339490e996 |
  | SLACK_WEBHOOK | 1 | d4b9cefa4612 | d4b9cefa4612 |
  | GITHUB_CLIENT_SECRET | 1 | 26fa3e0d4388 | 26fa3e0d4388 |
  | GOOGLE_OAUTH_SECRET | 1 | 8106c88ec7c7 | 8106c88ec7c7 |
  | MAILGUN_API_KEY | 1 | f5cf07039dc0 | f5cf07039dc0 |
  | ROLLBAR_SERVER_TOKEN | 1 | ed9f549aaa63 | ed9f549aaa63 (ROLLBAR_ACCESS_TOKEN) |
  | GIT_KEY_PASSPHRASE | 1 | 38652d9f907d | 38652d9f907d |
  | WORKER_SECRET | 1 | 170916780f07 | 66572afa8bdd |
  | CSRF_SECRET | 1 | length 64 | n/a |

  - thinx_worker at the same time reads `WORKER_SECRET file=1 read=170916780f07` and `ROLLBAR_SERVER_TOKEN file=1 read=ed9f549aaa63`. The rotation holds across the redeploy.
  - New API task logs: 0 `not set —` lines, 0 `Rollbar reporting disabled`, 0 `app-start Slack send failed`.
- **Other rolls on the push (unchanged code, as the operator was told):**
  - thinx_console: digest `095182000ed7` to `91a20fad84df`, Running.
  - thinx_vue: digest `c46fe3573163` to `a5d4f95f33da`, Running.
  - These are CI rebuilds of unchanged console sources.
- **Not run:** `docker stack deploy`, restart.sh, any `--secret-add` re-add, any swarm-autopull-recovery command.

## Task 3 evidence (final D-11 sweep, 11:58Z)

- `p24-slack.js` on thinx_api: `SLACK-OK`. One message went to #thinx.
- `p24-rollbar.js` printed `ROLLBAR-OK` three times. The Rollbar items are titled `phase-24 secrets check final-api`, `… final-worker` and `… final-transformer`.
- **Operator-confirmed (relayed by the orchestrator):** all three Rollbar items (api, worker, transformer) and the Slack message arrived.
- CSRF_SECRET: `file=1 len=64` (Task 2 fp run on the new task).
- OAuth initiators: `github 302 github.com` and `google 302 accounts.google.com`.
- Service state:

  | Service | State | Since | Mounts |
  |---|---|---|---|
  | thinx_api | Running | 11:57Z (this plan's deploy) | CSRF_SECRET, SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, GIT_KEY_PASSPHRASE, ROLLBAR_SERVER_TOKEN, WORKER_SECRET |
  | thinx_worker | Running | about 11:31Z | WORKER_SECRET, ROLLBAR_SERVER_TOKEN |
  | thinx_transformer | Running | 11:03Z (24-05 Task 3) | ROLLBAR_SERVER_TOKEN |

  - **The worker has been replaced once since 24-05.** The task from the 24-05 rotation (10:50:51Z) exited with state `Complete`, a clean exit and no error, at about 11:31Z. That was after the 24-05 proof build finished. Swarm started a replacement with the same spec. An earlier task also ended `Complete` about 14 hours before. Both fit the known worker lifecycle defect (worker todo `2026-09-28-fix-worker-builder-service-polling-completion-detection`), and neither was caused by phase 24. The replacement mounts both secrets and reads the rotated WORKER_SECRET (fp12 above).

### D-08 inventory (names only)

- `docker secret ls` shows 14 secrets: COUCHDB_PASS, COUCHDB_USER, CSRF_SECRET, GITHUB_CLIENT_SECRET, GIT_KEY_PASSPHRASE, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, REDIS_PASSWORD, REGISTRY_HTTP_SECRET, ROLLBAR_SERVER_TOKEN, ROLLBAR_TOKEN, SLACK_BOT_TOKEN, SLACK_WEBHOOK, WORKER_SECRET.
- The five pre-existing secrets (COUCHDB_USER, COUCHDB_PASS, REDIS_PASSWORD, REGISTRY_HTTP_SECRET, ROLLBAR_TOKEN) are present and untouched. Nothing was deleted during the phase.
- SLACK_CLIENT_SECRET was never created.

### Residuals (for later phases)

- **SEC-CFG-04:** COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD exist in the swarm but are not mounted on thinx_api. docker-swarm.yml lists them on api with a comment saying so.
- **Stale ROLLBAR_TOKEN secret:** its deletion is deferred until the server-token migration is proven and the Rollbar client/server split todo is done.
- **scripts/redact-managed-logs.js** still reads `SLACK_WEBHOOK` from `process.env` (line 232). It is a host script outside `lib/` and not one of the nine.
- **SEC-CFG-03:** the env fallbacks are still in every service spec. thinx_api has 8 of the credential env keys, thinx_worker 2 (ROLLBAR_ACCESS_TOKEN, WORKER_SECRET) and thinx_transformer 1 (ROLLBAR_ACCESS_TOKEN). The WORKER_SECRET env on api and worker still holds the old, pre-rotation value (fp 66572afa8bdd).

### Carried confirmations (operator, relayed by the orchestrator)

- Transformer Rollbar: operator-confirmed. The item `phase-24 secrets check thinx_transformer` from 24-05 Task 3 arrived.
- GitHub and Google OAuth logins were confirmed after the 24-04 mount. Neither OAuth secret has changed since.
- The 24-05 proof build `f7362090-bbf4-11f1-bc0f-6db2168c8032` (Fridge) finished `THiNX BUILD SUCCESSFUL`.

## Human check for the end-of-phase UAT (D-11)

- **Test:** On the production console at https://rtm.thinx.cloud/ (and on the Vue console if you use it for OAuth), log out, then log in with "Sign in with GitHub". Log out again and log in with "Sign in with Google".
- **Expected:** Both logins land in the console as your account with no error page. Since 24-04 the API reads GITHUB_CLIENT_SECRET and GOOGLE_OAUTH_SECRET from /run/secrets, and this plan's redeploy kept both mounts (fp12 unchanged).
- **Why human:** A full OAuth round-trip needs the operator's provider accounts and a browser. The executor only checks that the initiators redirect to the providers. The operator already confirmed both logins after 24-04, so this item is a re-check after this plan's redeploy.

## Files Created/Modified

- `docker-swarm.yml`: the secrets comment, 9 new top-level `external: true` declarations, and `secrets:` lists on api, worker and transformer. The api image is `${REGISTRY}/thinx/api:swarm`.
- `.planning/phases/24-secrets-sweep/24-06-SUMMARY.md`: this file.

## Decisions Made

- The creation snippet in the comment now pipes the value from the running service's env (or `openssl rand` for the random ones) into `docker secret create`. It names no host and no value. The old snippet read the deployment `.env` file and was no longer how the secrets were made.
- SLACK_CLIENT_SECRET is left out of the yml because it does not exist in the swarm. Declaring it `external: true` would make any future stack deploy fail.

## Deviations from Plan

None. The plan executed as written. Notes:
- The parity check also asserted that every top-level secret is referenced by some service and that no service references an undeclared name. This is stricter than the plan's check, and it passed.
- To find the worker's WORKER_SECRET fingerprint, `p24-fp.js` also ran once in thinx_worker (read-only), using the worker helper path from the plan's Task 3 command.

**Total deviations:** 0 auto-fixed
**Impact on plan:** none

## Issues Encountered

- None blocking. The worker's clean exit and replacement at about 11:31Z is pre-existing lifecycle behaviour and is recorded above.
- Test traffic sent as approved: one Slack message in #thinx from thinx_api, and three Rollbar info items (final-api, final-worker, final-transformer).

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- SEC-CFG-02 is complete on all four criteria. CSRF_SECRET exists and is mounted on thinx_api for Phase 25.
- The docs commits made after the push (this SUMMARY and the state/roadmap update) are local on thinx-staging. Pushing them triggers another CircleCI run and api autoredeploy, so push only when the operator wants that.
- Rollback paths are unchanged (D-12): `--secret-rm` per service, and for WORKER_SECRET on thinx_api and thinx_worker together. Env still holds every value.

---
*Phase: 24-secrets-sweep*
*Completed: 2026-09-29*

## Self-Check: PASSED

- FOUND: docker-swarm.yml (YML-OK re-run: YML-OK)
- FOUND: c1ce0aab (docker-swarm.yml mirror, signed G), pushed as origin/thinx-staging
- Task 2 verifies passed: YML-OK, added_leaks=0 removed_env_or_db_secret=0, CI api-registry=success test=success, p24-fp.js 9 lines file=1 on the new thinx_api task
- Task 3 verifies passed: SLACK-OK, ROLLBAR-OK x3, no MISSING secret, github 302 github.com and google 302 accounts.google.com
- No secret value, host, IP, port, key path or operator mail in this file
