---
status: complete
phase: 40-transit-encrypted-deploy-keys-in-the-api
source: [40-VERIFICATION.md, 40-01-SUMMARY.md, 40-02-SUMMARY.md, 40-03-SUMMARY.md, 40-04-SUMMARY.md, 40-05-SUMMARY.md]
started: 2026-10-19T12:45:00Z
updated: 2026-10-19T15:23:32.472Z
---

## Current Test

[testing complete]

## Tests

### 1. Deploy the WR-01 fix 9fd2c640 and re-gate the new task
expected: New thinx_api task whose git.js contains cloneFailedPastKey; probe ok 1 / probe failed 0; API-WIRING-OK mode=live.
result: pass
source: orchestrator
note: "thinx-staging 50f8fcb7 deployed; task o2dulkjcyort (container c7f00d9e908a, 10:42:16Z) had cloneFailedPastKey=5, probe ok 1 / failed 0, API-WIRING-OK mode=live (TRANSIT_CANARY ok, FORBIDDEN_DENIED 13/13, OUTPUT_CLEAN ok). fdd68a49 (purge-script fix) rolled task d4oobz24d6iny2pm925hjv1y4 at 12:19Z after this check."

### 2. Private-repo build using ONLY the Transit key (SC2, KEYENC-02)
expected: Keyed fetch of a private repo whose only deploy key is the Transit key succeeds; no Transit skip line; 0 thinx-agent-* dirs left.
result: pass
note: "Repo suculent/thinx-rce-canary-transit (private, only deploy key: OpenBao Test DK1, read-only), source rce-canary-transit attached to rce-canary-dev. sources.add prefetch cloned it (8.7 s, only refusal: the keyless public attempt). Build a93ade90 at 12:14:41Z fetched it ('Fetching using SSH keys', checkout a9fa8923, tag 1.0.3, platform detected), no 'deploy key unavailable' line; operator confirmed `ls -d /tmp/thinx-agent-*` empty. The operator had deleted grammatyk's older legacy deploy keys beforehand, so the owner held only the Transit key at fetch time. The build itself ended FAILED in the platformio worker: the canary's `hostname` call exited 127 (binary missing in suculent/platformio-docker-build 1.8.100), unrelated to Phase 40."

### 3. Legacy-only owner build (SC3, KEYENC-06)
expected: A private repo whose only working key is a legacy passphrase key builds through the unchanged askpass path.
result: pass
note: "Owner test (cedc16bb, no Transit key) on suculent/thinx-autoflood, device Flood 04ed1650. Staged by adding the public half of the test account's legacy passphrase key 1789766455048 (ENCRYPTED PRIVATE KEY) as a read-only deploy key. Earlier builds failed at pull_failed: root cause was a 2022 bug, buildlog.js set process.umask(0o766) for good, so `git pull --rebase` after each clone refused with 'You have unstaged changes' (reproduced with fetchDetailed: ok under umask 022, both working keys pull_failed under 0766). Fixed in a1f9176c (+ spec/node/ProcessUmask.test.js), deployed as task spg0rk34i6pm. Re-run: prefetch passed with no git exception, build fcec4250 handed to the worker at 13:21:38Z; operator: 'it seems to be building now'."

### 4. Public HTTPS worker build (SC4, KEYENC-03 unaffected surface)
expected: Build a device from a public HTTPS repo in the Vue console; API log shows 'public prefetch git result OK' and no '[transit] ... failed' line.
result: pass
note: "Operator attached https://github.com/suculent/thinx-example-battery-uart-wifi.git to Flower Kit (Burned) 36ca3f80 and built it: build ff8b13a0 at 13:29:01Z logged '[build] public prefetch git result OK' and BUILD_STARTED, no [transit] failure (task spg0rk34i6pm, probe ok). Side finding, not Phase 40: the Vue console has no attach-repository-to-device control; logged as .planning/todos/pending/2026-10-19-vue-console-attach-repository-to-device.md (fix soon)."

### 5. Live D-03 refusal (optional)
expected: With THINX_DEPLOY_KEYGEN=disabled (runbook section 11, 0600 spec backup first), creating a deploy key returns 503 {success:false, response:'key_service_unavailable'} and both consoles show "Deploy keys can't be created right now, try again later."; switch re-enabled afterwards.
result: pass
note: "Run by the orchestrator at the operator's request ('Do it'), 2026-10-19 13:33-13:50Z. 0600 backup /var/lib/openbao-maintenance/rollback/api-service/thinx-api-pre-keygen-20261019T133316Z.json; --env-add THINX_DEPLOY_KEYGEN=disabled -> task w26of2it4nj7. In-task rsakey.create() -> [false,'key_service_unavailable'], log 'deploy-key generation refused: THINX_DEPLOY_KEYGEN is not enabled', 0 files written. Vue console (console.thinx.cloud, operator session, build a1f9176): Generate Deploy Key -> PUT /api/v2/rsakey 503 through Traefik, banner exactly \"Deploy keys can't be created right now, try again later.\", no code shown, no key added. Legacy console (rtm.thinx.cloud) not exercised live: it needs an interactive login; covered by deploykey.cjs D11. Re-enabled with --env-add THINX_DEPLOY_KEYGEN=enabled -> task jei4hunf12ra."

### 6. Console retest checklist
expected: console-retest checklist on rtm.thinx.cloud passes (served bundle, websocket target, no sensitive logging, Devices page renders).
result: pass
note: "Operator: legacy console build is a1f9176, websocket points to rtm and is 101, nothing sensitive in console, devices render without error - pass"

### 7. Judgment-tier prohibitions (21)
expected: Operator accepts the verifier's 'held' verdicts in 40-VERIFICATION.md section Prohibitions, or names the one that is not held.
result: pass
note: "Operator accepted all 21 verifier verdicts as held (2026-10-19)."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]

## Deferred Follow-Ups

- test: 4
  idea: "Vue console cannot attach a repository to a device (operator: 'Mark this as a soon-to-fix issue'); todo 2026-10-19-vue-console-attach-repository-to-device.md"
  deferred_at: 2026-10-19
