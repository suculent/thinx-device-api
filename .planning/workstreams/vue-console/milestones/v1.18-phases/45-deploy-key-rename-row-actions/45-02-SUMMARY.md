---
phase: 45-deploy-key-rename-row-actions
plan: 02
subsystem: api
status: complete
tags: [api, rsakey, github, revoke, tests, coordination]
requires:
  - "45-01: RSAKey.validateKeyName, RSAKey.fingerprint, rsakey.rename, PATCH /api/v2/rsakey, DeployKeyNames router harness + HOME redirect"
provides:
  - "GitHubLink.link pushes the owner's oldest deploy key by filename timestamp, independent of list order (D-13, IN-07)"
  - "revokeUserKeys handles and reports each requested filename once (D-14, IN-04)"
  - "Regression tests for every 38 IN-06 gap; PATCH /api/v2/rsakey in ZZ-RouterRSAKeySpec and ZZ-CSRFRouteGuardSpec"
  - "vault-transit STATE.md D-15 note for Phase 40; 38-REVIEW-DISPOSITION.md open: 0"
affects: [45-05, vault-transit Phase 40]
tech-stack:
  added: []
  patterns:
    - "Deterministic selection by filename timestamp (digits after the last '-'), untimestamped entries last, stable on ties"
key-files:
  created: []
  modified:
    - lib/thinx/github_link.js
    - lib/thinx/rsakey.js
    - spec/jasmine/GitHubLinkSpec.js
    - spec/node/DeployKeyNames.test.js
    - spec/jasmine/03-RsakeySpec.js
    - spec/jasmine/ZZ-RouterRSAKeySpec.js
    - spec/jasmine/ZZ-CSRFRouteGuardSpec.js
    - .planning/workstreams/vault-transit/STATE.md
    - .planning/milestones/v1.16-phases/38-deploy-key-management/38-REVIEW-DISPOSITION.md
decisions:
  - "GitHub linking chooses the oldest key by the filename timestamp; list() keeps its newest-first order and envelope (no `created` field added)"
  - "38 IN-01 and IN-02 are recorded as fixed by both 45-01 commits (f0b866c5 adds the validator, 579e334f makes it the only check); IN-06 cites the Task 2 RED commit d03458cf"
metrics:
  duration: "~6 min"
  completed: 2026-10-13
  tasks: 3
  files: 9
estimate:
  tokens: 75000
  tasks: 3
actuals:
  tokens: 6900
  tasks: 3
  commits: 7
plan_head_before: f20541b1ddfd380ed6362a173a09b701430ca37c
plan_head_after: ccf4800ef71352b54f3b4f345b55f96575064cd7
---

# Phase 45 Plan 02: GitHub key choice, revoke duplicates, IN-06 tests, FIX-04 record Summary

GitHub linking now pushes the owner's oldest deploy key, picked by the millisecond timestamp in its filename. Before,
it pushed `list[0]`, which since Phase 38 is the newest key, often a repository-specific one. A revoke that names a
filename twice deletes and reports it once. Every Phase 38 IN-06 gap now has a test that fails on regression, the
PATCH rename route is covered in the ZZ router and CSRF-guard specs, vault-transit Phase 40 has its D-15 note, and the
Phase 38 disposition record shows all FIX-04 items fixed (`open: 0`).

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 (tracer) | GitHub linking pushes the oldest key (D-13, IN-07) | 9e1841e7 (RED), 52788676 (GREEN) | github_link.js, GitHubLinkSpec.js |
| 2 | Revoke reports each key once; the IN-06 test gaps (D-14, D-16) | d03458cf (RED), 38ff5180 (GREEN) | rsakey.js, DeployKeyNames.test.js, 03-RsakeySpec.js |
| 3 | PATCH in ZZ and CSRF specs; vault-transit note; Phase 38 dispositions | 1d37e749 (test), ccf4800e (docs) | ZZ-RouterRSAKeySpec.js, ZZ-CSRFRouteGuardSpec.js, vault-transit STATE.md, 38-REVIEW-DISPOSITION.md |

All six 45-02 commits are signed (`G`). `commits: 7` is `git rev-list --count f20541b1..HEAD` and includes one commit
from the parallel 45-03 executor (e9835cec, `docs(45-03): …`), which landed between 9e1841e7 and 52788676. The 45-02
commits alone number 6. Nothing pushed (`origin/thinx-staging..HEAD` = 18).

## TDD Gate Compliance

**Task 1 RED (9e1841e7):** GitHubLinkSpec gave 10 specs, **4 failures**: G1, G2, G3 and G4 (for example
`expected 'ssh-rsa NEW' to equal 'ssh-rsa MID'`), because `list[0]` was pushed. G5 passed already, since the
create path was unchanged.
**Task 1 GREEN (52788676):** 10 specs, 0 failures. `list[0].pubkey` is gone from github_link.js and eslint is clean.
The tracer gate re-ran `<verify>` end to end before Task 2 and it passed.

**Task 2 RED (d03458cf):** test:deploykeys gave 34 tests, 32 pass, **2 fail**: D1 (`[f, f]` returned instead of `[f]`)
and D2 (the v2 DELETE reported `[f, f]`). The filtered 03-RsakeySpec run gave "Ran 17 of 18 specs", **1 failure**:
(04b) `expected [ …(2) ] to deeply equal [ Array(1) ]`. S1, G1, C1 and D2's 400 cases passed on the old tree. They
guard behavior that already existed but had no test (IN-06).
**Task 2 GREEN (38ff5180):** 34/34 pass, 0 skipped. 03-RsakeySpec: 17 specs, 0 failures. `new Set(` appears in
rsakey.js and eslint is clean.

## IN-06 gap → test mapping

| 38 IN-06 gap | Test |
| ------------ | ---- |
| Real named generate → `list()` round trip | `G1 a named real generate lists that name and an OpenSSH SHA256 fingerprint (IN-06)` (DeployKeyNames, real 4096-bit generate in a mkdtemp dir) |
| Router name selection from `req.query` / `req.body` and its 400 | `S1 router create takes the name from req.query for GET and req.body otherwise; a bad name is 400 with its reason (IN-06)` (also checks that no name means `undefined`) |
| Sort precision: two keys 1 ms apart | existing `keys created within the same second still list newest first (38 WR-01)` (1700000000000 / …001 / …900) |
| Malformed `filenames` (null / 5 / `{}`) at the library | existing `revoke ignores a non-array filenames value instead of throwing (38 WR-05)` |
| Malformed `filenames` at the router (HTTP 400) | `D2 router revoke: … null, 5 and {} answer 400 invalid_filenames …` (v2 DELETE and v1 POST, nothing deleted) |
| Invalid-name loop asserts only inside callbacks | `legacy create(owner, callback) remains valid; invalid names never generate` now counts callbacks (`refused === invalidNames.length`) |

## Verification (final tree)

- `COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/GitHubLinkSpec.js`: 10 specs, 0 failures
- `npm run -s test:deploykeys`: tests 34, pass 34, fail 0, skipped 0. No `thinx-home-*` directory is left behind.
- `ENVIRONMENT=development GIT_KEY_PASSPHRASE=p45dummy … --filter='^RSA Key \((?!13\))' spec/jasmine/03-RsakeySpec.js`: Ran 17 of 18 specs, 0 failures
- CsrfRouteInventorySpec + ZZ-CORSSpec: 88 specs, 0 failures (regression check)
- `node --check` on both ZZ specs passes. The CSRF guard spec has 2 PATCH rows (C1 table, C2 call) and the router spec has 4 PATCH requests. No `to.be.a('number')` is left.
- `npx eslint` on all seven changed code/spec files: clean
- vault-transit STATE.md only gains lines (the merge-base diff has no removed line). 38-REVIEW-DISPOSITION.md has six FIX-04 rows `fixed (<sha>)` and `open: 0`.
- `git status --porcelain -- lib spec .planning/workstreams/vault-transit .planning/milestones` shows only untracked files that were already there (23-REVIEW iter files, vault-transit `state.json`), none from this plan.
- The ZZ specs need full infrastructure and are checked with `node --check` and eslint only, as the plan says. They were not run.

## 38-REVIEW-DISPOSITION.md as recorded

| Item | Recorded as |
| ---- | ----------- |
| IN-01 | fixed (f0b866c5, 579e334f) |
| IN-02 | fixed (f0b866c5, 579e334f) |
| IN-03 | fixed (579e334f) |
| IN-04 | fixed (38ff5180) |
| IN-06 | fixed (d03458cf) |
| IN-07 | fixed (52788676) |

## Deviations from Plan

### Scope additions (tests only)

- G2 runs G1's list reversed (`[MID, OLD, NEW]`) and a second order with the oldest key last (`[MID, NEW, OLD]`). The
  plan's "reversed" and "MID, OLD, NEW" describe the same order, so the second order is new.
- G4 also covers a non-string filename (`42`), and G5 also covers `list()` reporting `lsuccess` false with a non-empty list.
- D1 also checks that an unselected key of the same owner survives. (04b) also checks the `.pub` is gone and that `first_key` survives.
- The ZZ rename round trip also checks that create returns the requested name, and it revokes the renamed key in its own
  final case (`POST /api/user/rsakey/revoke (jwt, the renamed key)`), whose response must be exactly `[filename]`.

No production behavior beyond D-13 and D-14 changed.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. T-45-11..T-45-15 are mitigated as planned. GitHubLink keeps its injected collaborators, token handling and
response shape. The revoke owner check and envelope are unchanged. The ZZ cases create, rename and revoke only their
own key under the existing dynamic Bearer flow and print no token. The vault-transit edit is append-only.

## Notes for the orchestrator

- The workstream STATE.md and ROADMAP.md were not updated, as instructed for the parallel wave.
- `services/console` was not touched or staged.

## Self-Check: PASSED

- All nine modified files exist.
- Commits 9e1841e7, 52788676, d03458cf, 38ff5180, 1d37e749 and ccf4800e are ancestors of HEAD and signed (`G`).
