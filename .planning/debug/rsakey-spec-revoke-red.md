---
status: awaiting_human_verify
trigger: "CircleCI test red since v1.16 merge (builds 15810/15826/15828/15833/15839): 03-RsakeySpec (02) should fail on invalid revocation and (04) should be able to revoke multiple RSA Keys at once fail with 'expected false to equal true'. Suspected 58027c18 rsakey.js revoke change."
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
audit_acknowledged:
  milestone: v1.15
  at: 2026-10-12
  status: awaiting_human_verify
---

## Current Focus

bug_class: Bohrbug (deterministic; reproduced locally on first run)

reasoning_checkpoint:
  hypothesis: "03-RsakeySpec (02)/(04) encode the pre-v1.16 positional revoke bug. 58027c18 correctly made revokeUserKeys delete only exact list() filenames, so (02) (garbage id) now revokes nothing and reports success=false, and (04) (create()'s '<ssh_keys>/<owner>-<ts>.pub' path, never a list() filename) also revokes nothing and reports false."
  confirming_evidence:
    - "Local run on HEAD reproduces exactly (02)+(04) 'expected false to equal true'; (04) log shows a full-path .pub value"
    - "Both consoles send list() 'filename' (basename, no .pub): Vue Rsakeys.vue deleteSelected, legacy deploykey.html checkItem(deploykey.filename)"
    - "Old code deleted key_paths[i] by index in readdir (oldest-first) order while the UI lists newest-first, so it deleted keys the user did not select; (02) used to delete a real key for a garbage id"
    - "create() has returned the full .pub path since e9816427; (04) only ever passed because values were ignored"
  falsification_test: "If the corrected spec (revoke by list() filename) still fails on HEAD, or passes against the pre-58027c18 rsakey.js, the hypothesis is wrong / the spec does not discriminate."
  fix_rationale: "Production code is correct for real clients; the spec is wrong. Fix the spec to assert the real contract: invalid ids revoke nothing (success=false, [] , nothing deleted); valid list() filenames revoke exactly those keys and leave others."
  blind_spots: "Cannot run the full CI docker-compose locally (dhi.io images, CouchDB, Redis); spec run is isolated (no bootstrap helper, HOME redirected). (13) needs CouchDB, so it is unverifiable locally. Other suites run after 03 in the same container."
  candidate_causes:
    - "code: rsakey.js exact-match revoke (intentional, 58027c18) + spec expecting positional semantics"
    - "data: create() response.filename is '<ssh_keys>/<owner>-<ts>.pub', a different identifier shape from list() filename"
    - "config: KEY_FILENAME regex not matching newNameWithOwner output (ELIMINATED: basename matches; (01)/(12) pass)"
    - "environment: CI ssh_keys dir state/ordering (ELIMINATED: identical failure on macOS with an isolated empty dir)"
  and_gate: "yes. Each failure needs the exact-match code AND a spec input/expectation built for positional semantics ((02): success=true expectation; (04): full-path .pub ids). Both are recorded; only the spec side is wrong."

oracle_type: specified (consoles' contract: revoke takes list() filenames; success reflects whether anything was revoked)
next_action: orchestrator pushes 9020f3ca to thinx-staging; confirm CircleCI test job shows 03-RsakeySpec green and no "TEST failed" line, then archive this session

## Symptoms

expected: 03-RsakeySpec green in CircleCI test job
actual: (02) and (04) fail with "expected false to equal true"; job prints "TEST failed. Should not deploy this commit."
errors: expected false to equal true
reproduction: CircleCI test job on thinx-staging after 58027c18
started: v1.16 merge (58027c18); last green 75e083eb at 13:10Z

## Eliminated

- hypothesis: KEY_FILENAME does not match filenames produced by newNameWithOwner
  evidence: basename(newNameWithOwner(oid, ts)) = "<64hex>-<ts>" is returned by getKeyPathsForOwner; (01) list and (12) listOwnersOnDisk pass
  timestamp: 2026-10-09

- hypothesis: CI-environment-specific (ssh_keys dir contents / readdir ordering on Linux)
  evidence: identical (02)/(04) failure on macOS with an isolated empty key dir
  timestamp: 2026-10-09

- hypothesis: new code breaks a real client contract (console sends fingerprints)
  evidence: Vue and legacy consoles send list() filenames; legacy revokeRsakeys({fingerprints}) has no caller and the router rejects it with 400 (unchanged by 58027c18)
  timestamp: 2026-10-09

## Evidence

- timestamp: 2026-10-09
  checked: git show 58027c18 -- lib/thinx/rsakey.js
  found: getKeyPathsForOwner now uses KEY_FILENAME exact owner match; revokeUserKeys iterates filename values, skips any not in key_paths (basenames w/o .pub). Old code iterated indices of revoked_filenames and deleted key_paths[kindex] regardless of the value.
  implication: old code deleted the owner's first N keys by position for any N-length input, including garbage.

- timestamp: 2026-10-09
  checked: rsakey.js create()
  found: response.filename = newNameWithOwner(owner,date)+'.pub' = "<ssh_keys>/<owner>-<date>.pub" (full path + .pub)
  implication: spec (03) pushes values that can never equal a key_paths entry -> (04) revokes 0 -> success false.

- timestamp: 2026-10-09
  checked: services/console (956a7a2) Vue store/rsakeys.js + pages/Rsakeys.vue; legacy views/deploykey.html + DeploykeyController.js + thinx-api.js
  found: Vue deleteSelected sends item.filename from GET /rsakey (list) via DELETE /rsakey {filenames}. Legacy checkItem(deploykey.filename) -> revokeDeploykeys -> POST /user/rsakey/revoke {filenames}. Legacy revokeRsakeys({fingerprints}) has no caller and the router 400s without body.filenames (unchanged by 58027c18).
  implication: the real contract is "revoke by list() filename" = basename "<owner>-<ts>" without .pub. New exact-match code honours it; old code ignored the values.

- timestamp: 2026-10-09
  checked: old revokeUserKeys vs list ordering
  found: old code deleted key_paths[0..N-1] in readdir order (oldest first); the Vue store sorts newest-first and (since 58027c18) exportKeysForList does too. Selecting the newest key in the console and deleting it removed the OLDEST key instead.
  implication: the positional code was a production data-loss bug; 58027c18 fixed it. Specs codified the bug (02 comment: "succeds for more fingerprints if one is valid? maybe...").

- timestamp: 2026-10-09
  checked: local run on HEAD, HOME=<scratch>/home ENVIRONMENT=development (app_config forces ssh_keys=$HOME/.ssh in development), scratch jasmine config with only 03-RsakeySpec and no bootstrap helper
  found: (02) and (04) fail "expected false to equal true" (same as CI). The (04) log shows revoked_filenames = ['<ssh_keys>/<owner>-1791563724850.pub'], one full-path .pub entry. Only ONE key from (03) exists on disk: both creates ran in the same millisecond, got the same <owner>-<ts> name, and the second overwrote the first. done() fires from the second callback, so the first push can land after (04) starts. (13) fails only because no CouchDB is reachable locally.
  implication: reproduction confirmed. (03) is also racy and should create sequentially.

## Resolution

root_cause: "03-RsakeySpec (02)/(04) asserted the pre-v1.16 positional revoke behaviour (any N identifiers delete the owner's first N keys). 58027c18 correctly made revokeUserKeys delete only exact list() filenames, the identifiers both consoles send. So (02)'s garbage id revokes nothing (success=false), and (04)'s ids, taken from create()'s '<ssh_keys>/<owner>-<ts>.pub' path, never match a list() filename. AND contributing: (03) created both keys in the same millisecond, so they collided on one <owner>-<ts> name, and its done() raced the first push."
fix: "Spec only (no production change). (02) now expects success=false, an empty revoked list, and no key deleted, including for near-miss ids (<key>.pub and create()'s full path). (03) creates sequentially, pushes list()-form filenames and asserts they differ. (04) checks the ids are listed, expects exactly those revoked and their files gone, and expects (300)'s unselected key to survive."
oracle_type: specified
verification:
  target_test: { result: pass, detail: "03-RsakeySpec on HEAD: 13 specs, 0 failures with (13) filtered; unfiltered, 14 specs with only (13) failing (no CouchDB locally: 'You must specify the endpoint url')" }
  mutation_check: { result: pass, reason_if_skipped: "no Stryker in repo; manual mutants instead", mutant_killed: "M1 drop includes() guard -> (02),(04),(08) fail; M2 success always true -> (02) fails" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, note: "(02) flips true->false, which the RCA justifies: the old expectation encoded data loss. Net assertions increased." }
  adjacent_tests: { result: pass, suites_run: ["spec/node/DeployKeyNames.test.js (4/4)", "BuildlogPagingSpec+BuildLogOwnerSpec+LogRouterPagingSpec (66/66)"] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, detail: "fixed spec vs bc27e1ad (pre-58027c18) rsakey.js: (02) 'expected true to equal false', (04) '(300) key deleted'; rsakey.js restored via git checkout" }
  guardrail_verdict: accepted
files_changed: [spec/jasmine/03-RsakeySpec.js]
follow_ups:
  - "revokeUserKeys throws TypeError for non-array filenames (null/number/object). Express 5 returns 500; the old for-in silently no-op'd. Low severity (authenticated, CSRF-guarded)."
  - "create() returns filename as '<ssh_keys>/<owner>-<ts>.pub' (server path disclosure; not the revocable id). No console consumes it."
  - "revoke() with zero owner keys returns success=true, response=false (pre-existing, unchanged)"
  - "newUniqueIdentifier()=Date.now(): concurrent creates for one owner in the same ms overwrite key material"
