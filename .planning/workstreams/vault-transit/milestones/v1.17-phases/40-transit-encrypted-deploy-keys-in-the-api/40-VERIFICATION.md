---
phase: 40-transit-encrypted-deploy-keys-in-the-api
verified: 2026-10-19T10:35:00Z
status: passed
score: 4/5 must-haves verified
covered_files:
  - .circleci/config.yml
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-01-PLAN.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-01-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-02-PLAN.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-02-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-03-PLAN.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-03-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-04-PLAN.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-04-SUMMARY.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-05-PLAN.md
  - .planning/workstreams/vault-transit/phases/40-transit-encrypted-deploy-keys-in-the-api/40-05-SUMMARY.md
  - docker-compose.test.yml
  - docker-swarm.yml
  - lib/router.rsakey.js
  - lib/thinx/builder.js
  - lib/thinx/git.js
  - lib/thinx/github_link.js
  - lib/thinx/keyformat.js
  - lib/thinx/rsakey.js
  - lib/thinx/transit.js
  - scripts/openbao-dev.sh
  - services/console/src/app/js/controllers/DeploykeyController.js
  - services/console/vue/src/pages/Profile/Profile.vue
  - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
  - thinx-core.js
covered_digest: "v3:sha256:68338bbf9857985b8b719ffa502c206f19b5768e00c4d3932064952b28684ab8"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "ROADMAP SC2 / KEYENC-02: a keyed build of a private repository succeeds with a Transit key decrypted in memory and loaded with ssh-add - into a per-attempt ssh-agent"
    test: "Build a private repository that only the new Transit key can read (its .pub added as that repo's deploy key; no legacy key of the owner has access), from the Vue console on rtm.thinx.cloud."
    expected: "Build log shows success; the thinx_api log has no '[git] key <name> skipped' line for the Transit key and no agent_start_failed / agent_load_failed; afterwards `ls -d /tmp/thinx-agent-* 2>/dev/null | wc -l` in the API container prints 0."
    why_human: "No sshd exists in local or CI test environments. TransitIntegrationSpec E1 proves the decrypt, the agent load (agent fingerprint == .pub fingerprint), the attempt env and the cleanup from inside a stubbed clone, but not a real ssh clone. The operator's 09:45Z private fetch was for an owner with 4 legacy keys plus the 1 Transit key, so it may have used a legacy key."
human_verification:
  - test: "Deploy the iteration-2 review fix 9fd2c640 (plus 71a7bbf1) to thinx-staging, then re-run the Plan 40-05 live gates on the new task: `[transit] probe ok` in `timeout 30 docker logs --since <rollout>`, and `bash ../thinx-swarm/tests/openbao-api-wiring.test.sh --live`."
    expected: "New thinx_api task running an image whose lib/thinx/git.js contains cloneFailedPastKey; probe ok 1 / probe failed 0; API-WIRING-OK mode=live with SPEC_DELTA ok."
    why_human: "Correction to the hand-off: three of the four review fixes ARE live. origin/thinx-staging is 04a8d26b (pushed 10:03Z, api-registry #16129 success), which contains 6b2081e6 (CR-01), 115a5740 (iteration-1 WR-01) and b4267e12 (WR-02), but not 9fd2c640. The running task w8qcwhvtruo8sf14bt2tldero (started 10:10:20Z) has O_NONBLOCK and SERVICE_DOWN_REASONS but no cloneFailedPastKey. So production runs the 115a5740 state that review iteration 2 flagged as WR-01: during an OpenBao outage, if any other key reached a clone and the remote refused it (normal for per-repo deploy keys), keyUnavailable is null and the D-04 build-log line is not written (the API-log '[git] key ... skipped: deploy key unavailable' line still is). This task was also not covered by the 40-05 --live gate. Pushing thinx-staging redeploys production, so it is an operator action."
  - test: "Live private-repo build using ONLY the Transit key (ROADMAP SC2, KEYENC-02). See behavior_unverified_items."
    expected: "Build succeeds; no Transit skip line; 0 thinx-agent-* dirs left."
    why_human: "Needs a private GitHub repo, a real ssh clone and a device build."
  - test: "Build a private repository for an owner whose only working key is a legacy passphrase key (ROADMAP SC3, KEYENC-06)."
    expected: "Build succeeds through the unchanged askpass path."
    why_human: "Code evidence is strong (legacy SSH_COMMAND, sshEnv, create_askfile, delete_askfile are byte-identical to pre-phase b208f02f; KeyFormatSpec invariant sends every legacy PEM shape to that path), but 81 legacy key files are live and only a real build proves the path in the deployed image."
  - test: "Build a device from a public HTTPS repository in the Vue console (ROADMAP SC4, KEYENC-03 unaffected surface); then grep the API log on the task's node for 'public prefetch git result OK' and for any '[transit]' failure line."
    expected: "Build succeeds; 'public prefetch git result OK' present; no '[transit] ... failed' line."
    why_human: "The 40-05 in-task PUBLIC_HTTPS_FETCH probe (clone=ok keyless=ok) exercised the exact prefetch call, but a full worker build needs the console."
  - test: "Optional: see the D-03 refusal live. Per runbook section 11, save a 0600 spec backup, `docker service update --env-add THINX_DEPLOY_KEYGEN=disabled thinx_api`, try to create a deploy key in the Vue and the legacy console, then re-enable."
    expected: "HTTP 503 with body exactly {success:false, response:'key_service_unavailable'}; both consoles show \"Deploy keys can't be created right now, try again later.\" and never the code."
    why_human: "Restarts the API task; the 503 path is covered by DeployKeyNames KS1-KS5, GitHubLinkSpec, deploy-key-actions G2, github-token-scopes and deploykey.cjs D11, but has not been seen through Traefik and the browser."
  - test: "Run the console-retest skill checklist on rtm.thinx.cloud (served bundle, websocket target, no sensitive logging, Devices page renders)."
    expected: "All checklist items pass."
    why_human: "Browser checks."
  - test: "Judgment-tier prohibitions (21 across plans 40-01..05, all verification: judgment, flagged: true). Non-authoritative verifier verdicts are in the report section 'Prohibitions'."
    expected: "Operator accepts each as held, or reopens the plan for the one that is not."
    why_human: "Judgment-tier prohibitions have no wired test-tier enforcement; they need explicit human resolution, never a silent pass."
---

# Phase 40: Transit-Encrypted Deploy Keys in the API Verification Report

**Phase Goal:** A deploy key generated in THiNX is stored only as Transit ciphertext, and a keyed build decrypts it in memory. Every legacy passphrase-encrypted key keeps building, so the cut-over breaks no build.
**Verified:** 2026-10-19T10:35:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

Method: source read at parent HEAD `71a7bbf1` (thinx-staging, local) and thinx-swarm `8cfa7dd`; Phase 40 unit specs
re-run locally in a clean env (`env -i`, no `GIT_KEY_PASSPHRASE`); CI statuses read through `gh api`; read-only,
counts-only checks on micro (live task, deployed code markers, `ssh_keys` file shapes, log line classes); port and
HTTP probes from the laptop. No production state was changed. The OpenBao dev server was not started; the
integration spec's CI result is used instead.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Generating a deploy key writes a 0600 file to `ssh_keys` holding only `vault:vN:` ciphertext; no PEM or plaintext key touches disk | VERIFIED | `rsakey.generate()` (rsakey.js:609-670): PKCS#8 PEM with no cipher, wrapped in a Buffer, `transitClient().encryptKey()`, Buffer zeroed in `finally`, then `writeFileSync(private_path, ciphertext + "\n", {flag:"wx", mode:0o600})` + chmod 0600. No other key-generation path exists in `lib/` (`generateKeyPair` only in rsakey.js; github_link.js goes through `rsakey.create`). TransitIntegrationSpec E1 asserts one line, mode 0600, `readKey` = transit, no file with `PRIVATE KEY` (CI #16134 green). **Live (read-only, counts):** exactly 1 non-.pub file newer than the 09:20Z cut-over: mode 600, 1 line, 1 `^vault:v[1-9]` line, 0 `PRIVATE KEY` lines, non-empty .pub. Matches the operator's 09:45Z confirmation. |
| 2 | A keyed build of a private repo with that key succeeds; key decrypted in memory, loaded with `ssh-add -` into a per-attempt `ssh-agent`; git env carries no `GIT_KEY_PASSPHRASE` and no `SSH_ASKPASS` | PRESENT_BEHAVIOR_UNVERIFIED | Present and wired: `git.js` `transitAttempt` -> `decryptKey` -> `withAgent` (mkdtemp 0700, `ssh-agent -D -a <dir>/agent.sock -t 1260`, `ssh-add -q -` with the PEM on stdin and env `{PATH, SSH_AUTH_SOCK}` only, derived public key, `finally`: stop agent, guarded rm, `pemBuf.fill(0)`); `agentEnv` deletes `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `GIT_KEY_PASSPHRASE`; `AGENT_SSH_COMMAND` is a constant string with `IdentitiesOnly`, `BatchMode=yes`, `-i $THINX_GIT_KEY_PUB`. Behavioural evidence short of a real clone: E1 (CI) checks `ssh-add -l` fingerprint == .pub fingerprint inside the attempt, the env, and agent-dir removal; GitSpec T5-T7 (cleanup on throw, inherited agent dropped, concurrent agents) pass locally. Missing: a real ssh clone using only the Transit key. The new key's owner has 4 legacy + 1 Transit key, and the 09:20Z container logged one `Fetching using SSH keys...` with no failure and no skip line, which cannot tell which key served it. See human item 2. |
| 3 | In the same release an owner's existing legacy passphrase key still builds; read path chosen by file format | VERIFIED | `keyformat.readKey` classifies by content (transit / legacy for any `-----BEGIN … PRIVATE KEY-----` first line / unknown / unreadable), non-blocking open + fstat, 64 KiB cap, never throws. `fetchHoldingLock` dispatches per key at attempt time; legacy keeps `create_askfile` + `sshEnv` + `SSH_COMMAND`, which are byte-identical to pre-phase `b208f02f` (exact diff). KeyFormatSpec invariant (real throwaway key: encrypted PKCS#8, unencrypted, transit) and GitSpec legacy cases pass locally. Live: 81 legacy PEM files remain in `ssh_keys`, all on that path. A real legacy-only build is listed as human item 3. |
| 4 | OpenBao sealed/unreachable/denying: keygen refused with an explicit error, keyed build fails with an explicit logged status, no passphrase fallback; public HTTPS builds, `:7442`, plain MQTT unaffected | VERIFIED (code at HEAD) | Refusal: `generate()` maps any TransitError to `code key_service_unavailable` and never reads the passphrase; `create()` maps it after `releaseIdentifier`; kill switch first in `create()`; router and github_link answer 503 `{success:false, response:"key_service_unavailable"}`; all three consoles show the D-03 sentence. Build side: `[git] key <name> skipped: deploy key unavailable: <reason>` in the API log, and builder.js writes `deploy key unavailable: <sentence>` before the existing `error` state. Specs pass locally: 03-RsakeySpec (11), SecretsSweepSpec, DeployKeyNames KS1-KS5 (76/76 node tests with CiPipelineGates), GitHubLinkSpec, BuilderRemoteJobSpec D-04, GitSpec T1-T11, console checks. Unaffected surfaces, re-probed now: 7442/1883/8883 open, `:7442` HTTP 200, rtm `/` and `/api/v2/csrf-token` 200; 40-05 in-task `PUBLIC_HTTPS_FETCH clone=ok keyless=ok`. **Deployment caveat (WARNING, human item 1):** production runs 04a8d26b, without 9fd2c640, so in the multi-key outage case the D-04 build-log line is suppressed (the API-log line remains). |
| 5 | AppRole login via `readSecret`, re-login before lapse, timeouts; SecretsSweepSpec asserts no token/plaintext/ciphertext in logs; mocked unit specs + dev-server integration spec in `docker-compose.test.yml`; CI green | VERIFIED | `transit.js`: `readSecret("BAO_ROLE_ID"/"BAO_SECRET_ID")`, https-only, CA from `BAO_CACERT` as the only anchor, `rejectUnauthorized: true`, `AbortSignal.timeout(3000)`, 64 KiB cap, single-flight login, re-login 120 s before the 1200 s lease, no `auth/token/*` call, no AAD, one fixed log format. TransitSpec (lifecycle, retry, alerts, probe) and SecretsSweepSpec pass locally (271 specs, 0 failures across the seven Phase 40 jasmine files). `docker-compose.test.yml` has `openbao/openbao:2.7.1` + `openbao-setup` + api `BAO_*` env + `CIRCLECI` passthrough; CircleCI "Starting OpenBao" step never prints the dev log; the integration spec fails rather than skips under CIRCLECI. CI: `ci/circleci: test` success on thinx-unit `2b1eecdb` (#16121), thinx-staging `8b6879e0` (#16124), `04a8d26b` (#16128) and HEAD `71a7bbf1` (#16134). Live: `[transit] probe ok` 1 in both the 09:20Z and the 10:10Z containers, 0 probe failures. |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

### Plan-level truths (merged; none reduces the roadmap scope)

| Plan truth | Status | Evidence |
|-----------|--------|----------|
| D-01 skip an undecryptable Transit key and continue to legacy keys | VERIFIED | GitSpec T1, T8 (all five service-down reasons), T10, T11 pass |
| D-02 one retry after a fresh login; at most four bounded requests; denied login not retried | VERIFIED | `_withRetry` (transit.js:264-284); TransitSpec R1-R4 and the hang bound pass |
| D-05 one FAILING and one RECOVERED Slack text per incident; bad_ciphertext excluded | VERIFIED | `_fail`/`_ok` (transit.js:315-329); TransitSpec A1-A4 pass |
| Boot probe non-blocking, unref'd, skipped under test or without BAO_ADDR | VERIFIED | `probeSoon` (transit.js:402-420), called once in thinx-core.js:117; TransitSpec P1-P3; live probe ok |
| D-07 `THINX_DEPLOY_KEYGEN` read at call time, fail-closed, first in `create()`, builds unaffected | VERIFIED | rsakey.js:114-117, 676-679; only rsakey.js reads it; KS3-KS5 pass |
| D-07 mirror in thinx.yml and docker-swarm.yml; wiring gate updated | VERIFIED | one `THINX_DEPLOY_KEYGEN=enabled` line in each; `--source` KEYGEN_SWITCH ok x2, API-WIRING-OK; `--self-test` 17/17 refused; 8cfa7dd touches only its 2 files and is on thinx-swarm origin/master |
| Runbook section 11 and 40-05 evidence entries | VERIFIED | section 11 at line 280, before the evidence log (416); both 40-05 entries present; no ciphertext or CI throwaway value in the file |
| D-06 thinx-unit first; main, v1.18 release untouched | VERIFIED | thinx-unit `2b1eecdb` green before the staging push; Phase 40 code not in origin/main; tag `v1.18` points at `f5dbda91` (2026-10-18, before Phase 40); latest GitHub release is v1.14.4031 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/thinx/transit.js` | AppRole/Transit client, reason classes | VERIFIED | 425 lines, wired from rsakey.js, git.js, builder.js and thinx-core.js |
| `lib/thinx/keyformat.js` | detect/readKey | VERIFIED | 87 lines, used by git.js `fetchHoldingLock` |
| `lib/thinx/rsakey.js` | Transit `generate()`, kill switch, code mapping | VERIFIED | see SC1, SC4 |
| `lib/thinx/git.js` | AGENT_SSH_COMMAND, agentEnv, withAgent, fetchDetailed, dispatch | VERIFIED | see SC2, SC3 |
| `lib/thinx/builder.js` | outcome param, D-04 line | VERIFIED | builder.js:727-744, 1013-1020 |
| `lib/router.rsakey.js`, `lib/thinx/github_link.js` | 503 key_service_unavailable | VERIFIED | router.rsakey.js:25-27; github_link.js:116-118 |
| Vue Rsakeys.vue, Profile.vue; legacy DeploykeyController.js | D-03 sentence | VERIFIED | constants and branches present; submodule gitlink `7e3d1fe` is on console origin/thinx-staging |
| `docker-compose.test.yml`, `.circleci/config.yml`, `scripts/openbao-dev.sh` | dev server in CI and on the laptop | VERIFIED | see SC5 |
| `spec/fixtures/{mock-openbao,fake-transit}.js`, TransitSpec, TransitIntegrationSpec, KeyFormatSpec, SecretsSweepSpec additions | tests | VERIFIED | pass locally (integration spec via CI) |
| `thinx-swarm/thinx.yml`, `docker-swarm.yml`, `thinx-swarm/tests/openbao-api-wiring.test.sh` | switch mirror, gate | VERIFIED | see plan truths |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| rsakey.generate | transit.encryptKey | `transitClient()` seam -> `Transit.shared()` | WIRED | rsakey.js:594-596, 631 |
| git.fetchHoldingLock | keyformat.readKey | per-key classification | WIRED | git.js:826 |
| git.withAgent | ssh-agent / ssh-add | spawn, minimal env, PEM on stdin | WIRED | git.js:234-261, 400-436 |
| builder.run_build | Transit.unavailableSentence | `prefetchPrivate` outcome.keyUnavailable | WIRED | builder.js:1013-1020 |
| router.rsakey createRSAKey | rsakey.create | 503 `failureResponse` | WIRED | router.rsakey.js:21-30 |
| github_link createAndPush | router.github | `status: 503` | WIRED | github_link.js:116-118 |
| thinx-core init | Transit.probeSoon | one call | WIRED | thinx-core.js:117 |
| transit.js | secrets.readSecret | BAO_ROLE_ID, BAO_SECRET_ID, SLACK_WEBHOOK | WIRED | transit.js:93, 229-230, 292 |
| CI "Starting OpenBao" | compose openbao + openbao-setup | `docker compose up -d openbao` + `run --rm openbao-setup` | WIRED | config.yml:863-870 |
| thinx.yml api env | docker-swarm.yml api env | JQ_SUBSET FILES_MATCH | WIRED | `--source` API-WIRING-OK |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| private key file | `ciphertext` | OpenBao `transit/encrypt/thinx-deploy-keys` (`data.ciphertext`, `vault:v` checked) | Yes (live file is one `vault:v` line) | FLOWING |
| agent key | `pem` Buffer | OpenBao `transit/decrypt` (`data.plaintext` base64) | Yes (E1 fingerprint match in CI) | FLOWING |
| build-log sentence | `fetchOutcome.keyUnavailable` | `fetchDetailed` -> first Transit reason | Yes at HEAD; suppressed in the multi-key case in the deployed 04a8d26b build | FLOWING (HEAD) |
| console sentence | `result.response` | API 503 body | Yes (unit-tested; not seen live) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 40 jasmine specs | `env -i … npx jasmine --config=/dev/null --random=false TransitSpec KeyFormatSpec GitSpec SecretsSweepSpec BuilderRemoteJobSpec GitHubLinkSpec RedisHealthSpec` | 271 specs, 0 failures | PASS |
| Kill switch, router 503, CI gates | `env -i … node --test spec/node/DeployKeyNames.test.js spec/node/CiPipelineGates.test.js` | 76 tests, 76 pass | PASS |
| RSA key specs without passphrase | `npx jasmine … --filter='^RSA Key \((?!13\))' 03-RsakeySpec.js` | 17 specs, 0 failures | PASS |
| Console D-03 checks | `node services/console/src/test/deploykey.cjs`; vue `deploy-key-actions.cjs`, `github-token-scopes.cjs` | all checks passed, 0 FAIL | PASS |
| No agent dir left locally | `ls -d $TMPDIR/thinx-agent-*` | 0 | PASS |
| Integration spec in CI | `gh api …/commits/71a7bbf1/status` | ci/circleci: test success (#16134) | PASS |
| Wiring gate | `openbao-api-wiring.test.sh --source` / `--self-test` | API-WIRING-OK / 17/17 refused | PASS |
| Live key file shape | read-only counts on micro | 1 new file: 600, 1 line, vault 1, PEM 0 | PASS |
| Live deployed code | `grep -c` markers in the running container | cloneFailedPastKey=0, SERVICE_DOWN_REASONS=3, O_NONBLOCK=2 | INFO: 04a8d26b is live, 9fd2c640 is not |
| Unaffected surfaces | `nc -z` 7442/1883/8883; curl :7442, rtm | open x3; 200; 200/200 | PASS |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` is declared by the phase. The thinx-swarm wiring gate ran in `--source` and `--self-test` modes (PASS). `--live` was not re-run here (it runs a Transit canary inside the API task); the 40-05 run covered the 09:20Z task only (see human item 1).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| KEYENC-01 | 40-02, 40-05 | New key Transit-encrypted, only `vault:vN:` at 0600 on disk | SATISFIED | SC1, code and live |
| KEYENC-02 | 40-02, 40-05 | In-memory decrypt, `ssh-add -` per-attempt agent, no passphrase/askpass | SATISFIED in code and CI; live end-to-end NEEDS HUMAN | SC2 |
| KEYENC-03 | 40-02, 40-03, 40-04, 40-05 | Refusal and explicit build status, no fallback, other surfaces unaffected | SATISFIED at HEAD; deployed build pending 9fd2c640 | SC4, human item 1 |
| KEYENC-04 | 40-01, 40-05 | AppRole, re-login, timeouts, no leaks (SecretsSweepSpec) | SATISFIED | SC5 |
| KEYENC-05 | 40-01, 40-05 | Mocked unit specs, dev-server integration spec, CI green | SATISFIED | SC5, CI #16121/#16124/#16128/#16134 |
| KEYENC-06 | 40-02, 40-05 | Dual read by file format | SATISFIED | SC3 |

All six IDs in the plans' frontmatter appear in REQUIREMENTS.md and map to Phase 40 there. No orphaned requirement: REQUIREMENTS.md maps no other ID to Phase 40.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts (`check.decision-coverage-verify`: 7/7 honored, 0 not honored).

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| spec/jasmine/TransitSpec.js | KEYENC-04 | yes | 0 | no | Behavioral (request/login counts, reason, alert counts) | OK |
| spec/jasmine/SecretsSweepSpec.js | KEYENC-04 | yes | 0 | no | Value (fake values absent on every path) | OK |
| spec/jasmine/TransitIntegrationSpec.js | KEYENC-01/02/05 | CI only | pending off-CI by design; `fail()` under CIRCLECI | no | Behavioral (real dev server, agent fingerprint) | OK |
| spec/jasmine/KeyFormatSpec.js | KEYENC-06 | yes | 0 | no | Behavioral (format reaches its path) | OK |
| spec/jasmine/GitSpec.js | KEYENC-02/03/06 | yes | 0 | no | Behavioral | OK |
| spec/node/DeployKeyNames.test.js | KEYENC-01/03 | yes | 0 | no | Value (503 body deep-equal, zero encrypt calls) | OK |
| spec/jasmine/BuilderRemoteJobSpec.js | KEYENC-03 (D-04) | yes | 0 | no | Value (exact sentence, ordering before `error`) | OK |

Disabled tests on requirements: 0. Circular patterns: none found. Insufficient assertions: none. Residual from review IN-09: the FIFO specs would hang instead of fail on a CR-01 regression.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase-added lines) | - | TBD / FIXME / XXX | none found | - |
| (phase-added lines) | - | TODO / HACK / placeholder | none found | - |
| lib/thinx/git.js | 801 | `e.message` logged for a non-coded error out of `transitAttempt` (the plan asked for coded errors only on this path) | Info | `withAgent` throws only coded errors and `cloneHoldingLock` does not reject, so no key material can reach it today |
| lib/thinx/transit.js | 82-83 | dead branch in `transportReason` (review IN-06) | Info | none |
| lib/thinx/transit.js | 211, 316 | every decrypt 400 is `bad_ciphertext`, which opens no incident (review IN-05) | Info | matters for Phase 41: ciphertext below `min_decryption_version` would fail without a D-05 alert |
| lib/thinx/git.js | 269-276 | ssh trailer makes `host_key_failed` / `network` unreachable (review IN-13) | Info | less precise cause line; can hide a host-key change on the API console |

40-REVIEW.md iteration 3 is clean (0 critical, 0 warning, 13 Info). None of the Info items blocks the goal.

### Prohibitions (judgment-tier; non-authoritative verifier verdicts, human resolution required)

- 40-01 no leak of env, token, role_id, secret_id, ciphertext, plaintext or body (incl. CI): **held**. One fixed log format; SecretsSweepSpec; CI step has no `logs openbao`.
- 40-01 https + BAO_CACERT only, verification never off: **held** (transit.js:130, 163-164; no `rejectUnauthorized: false`).
- 40-01/02/03/04 no push before 40-05: **held as far as history shows**. The commit order and thinx-unit-first are consistent with it.
- 40-01 no new package: **held** (package.json and package-lock.json unchanged since b208f02f).
- 40-02 no decrypted key material in any file: **held**. The agent dir holds only the socket and the derived public key; generate writes ciphertext only; the live file is checked.
- 40-02 no passphrase fallback; no passphrase/askpass in a Transit attempt env: **held** (generate never reads it; agentEnv deletes all three).
- 40-02 legacy read path unchanged; `GIT_KEY_PASSPHRASE` and `keyPassphrase()` kept: **held** (byte-identical functions; passphrase still in both stack files).
- 40-03 no OpenBao internals to the client: **held** (exact two-field body; code in the legacy FORBIDDEN set).
- 40-03 switch or outage never yields a passphrase key; switch does not affect builds, rename, revoke or list: **held** (only rsakey.create reads it; KS5).
- 40-03 console scope (no `npm run eslint`, only the 3 files + tests): **held by inspection of the summaries**, not independently re-derived.
- 40-04 no live touch, thinx-swarm commit by path, gate not relaxed beyond Phase 40: **held** (8cfa7dd = 2 files; self-test 17/17).
- 40-05 thinx-staging only after go, at a green or docs-only-different SHA: **held for the cut-over push** (8b6879e0 descends from green 2b1eecdb). The later 04a8d26b push (review fixes + an unrelated script) was made outside Plan 40-05; its own CI is green (#16128/#16129).
- 40-05 no main merge, tag or v1.18 release: **held** (origin/main lacks Phase 40; tag v1.18 predates it; no v1.18 GitHub release).
- 40-05 no stack deploy, restart.sh or manual service update: **consistent**. The 10:10Z service update matches a Swarmpit image roll after api-registry #16129. This was not proven.
- 40-05 7442 / plain MQTT untouched: **held** (re-probed open; :7442 HTTP 200).
- 40-05 no env dump or secret printed: **held** in the evidence log (no ciphertext or token shape found).

### Human Verification Required

#### 1. Deploy 9fd2c640 and re-gate the new task

**Test:** Push thinx-staging at or after 71a7bbf1. When the new thinx_api task is running, check `[transit] probe ok` and run `openbao-api-wiring.test.sh --live`.
**Expected:** `cloneFailedPastKey` present in the deployed git.js; probe ok; API-WIRING-OK mode=live.
**Why human:** The hand-off said the review fixes are not on thinx-staging. Three of the four are, and they are live in task w8qcwhvtruo8sf14bt2tldero (10:10Z). The missing 9fd2c640 is the fix for the WR-01 regression that 115a5740 introduced, so the live build can omit the D-04 build-log line during an outage. Pushing thinx-staging redeploys production.

#### 2. Private-repo build with only the Transit key (SC2)

**Test:** Add the new key's .pub as the deploy key of a private repo that no legacy key of the owner can read, then build.
**Expected:** Success; no Transit skip or agent failure line; 0 `thinx-agent-*` dirs afterwards.
**Why human:** Needs a real ssh clone, and the 09:45Z fetch may have used one of the owner's 4 legacy keys.

#### 3. Legacy-only owner build (SC3)

**Test:** Build a private repo for an owner whose only working key is a legacy passphrase key.
**Expected:** Success.
**Why human:** Real build in the deployed image.

#### 4. Public HTTPS worker build (SC4)

**Test:** Build a device from a public HTTPS repo; grep the API log for `public prefetch git result OK` and for `[transit]` failures.
**Expected:** Success, OK line present, no transit failure.
**Why human:** Full build path through the worker.

#### 5. Live 503 sentence (optional)

**Test:** Kill switch per runbook section 11, then create a key in both consoles, then re-enable.
**Expected:** 503 with exactly the two-field body; the D-03 sentence in both consoles.
**Why human:** Restarts the task; the path has not been seen through Traefik and the browser.

#### 6. Console retest

**Test:** The console-retest checklist on rtm.thinx.cloud.
**Expected:** All items pass.
**Why human:** Browser checks.

#### 7. Prohibitions

**Test:** Review the 21 judgment-tier prohibitions above.
**Expected:** Accepted as held.
**Why human:** No test-tier enforcement exists for them.

### Gaps Summary

No blocking gaps. The phase goal is achieved in code at HEAD and largely in production:
- New keys are stored only as Transit ciphertext. That is proven live.
- The Transit read path decrypts in memory into a per-attempt ssh-agent, with no passphrase or askpass in the attempt environment.
- The legacy path is byte-identical to pre-phase code and is selected by file content.
- CI is green on every relevant SHA, and the unaffected surfaces are healthy.

Two things keep the status at human_needed:
- The real private-repo clone with only the Transit key (SC2) has not been observed. The live fetch so far was for an owner who also holds four legacy keys.
- Production runs an intermediate review-fix state (04a8d26b), not HEAD, and that task was not re-gated. The missing 9fd2c640 restores the D-04 build-log line in the multi-key outage case. It is a deployment step, not a code gap, but the hand-off's premise that no review fix was deployed is incorrect.

---

_Verified: 2026-10-19T10:35:00Z_
_Verifier: Claude (gsd-verifier)_
