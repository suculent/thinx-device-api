---
phase: 260531-pdi-quick
plan: 01
subsystem: thinx-core / HTTPS bootstrap
tags: [quick-task, ssl, lets-encrypt, hygiene, no-outage]
type: execute
wave: 1
depends_on: []
requirements: [QUICK-260531-pdi]
dependency_graph:
  requires:
    - thinx-core.js (existing isSupportedLetsEncryptIssuer helper + catch-block recovery, lines 67-71 & 215-237)
  provides:
    - Refreshed LE RSA intermediate allowlist accepting R10..R14 (was R10/R12 only)
    - Updated rationale comment naming current intermediates + flagging chain.pem refresh as the real fix
  affects:
    - thinx-core boot log noise (no more spurious "Certificate verification failed" line on the next deploy)
tech_stack:
  added: []
  patterns:
    - "Closure-local pure predicate (no new exports, no env vars, no config keys — YAGNI per plan scope §3)"
key_files:
  created: []
  modified:
    - thinx-core.js
decisions:
  - "Added R11 and R14 prophylactically alongside R13 — gives the allowlist two-rotation runway before another code change is needed"
  - "Did NOT extract the allowlist to a constant / Set / env var — five strings used in one closure-local predicate; extraction was explicitly out of scope per plan §3"
  - "Did NOT add E1/E2 (LE ECDSA intermediates) — THiNX certs are RSA-only per plan rationale"
  - "Documented the workaround nature explicitly in the comment block — the proper fix (operator refresh of /mnt/data/ssl/chain.pem) is named so this allowlist is not mistaken for a substitute"
metrics:
  duration_seconds: 74
  duration_human: "1m 14s"
  tasks_completed: 1
  files_changed: 1
  commits: 1
  completed_date: "2026-05-31"
---

# Quick Task 260531-pdi: Fix Let's Encrypt R10/R13 Cross-Sign Mismatch — Summary

**One-liner:** Widened the rotation-tolerance allowlist in `thinx-core.js` from `[R10, R12]` to `[R10, R11, R12, R13, R14]` and refreshed the rationale comment to silence the spurious "Certificate verification failed" boot log when chain.pem is pinned to R10 but the leaf is issued by R13.

## What Shipped

A single 11-insertion / 4-deletion patch to `thinx-core.js` in one atomic commit (`feebdbf0`):

| Region                                                                | Change                                                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `isSupportedLetsEncryptIssuer` predicate (line 70 post-edit)          | Allowlist literal widened from `['R10', 'R12']` to `['R10', 'R11', 'R12', 'R13', 'R14']`                       |
| Rationale comment above catch-block guard (lines 224-233 post-edit)   | Replaced 3-line comment with 10-line block naming R10..R14, flagging workaround status, dating the refresh    |

No other lines in `thinx-core.js` touched. No files under `services/`, `builders/`, `base/`, or `spec/test_repositories/` touched. `services/console` uncommitted submodule pointer left alone per plan constraints.

## Verification

Inline `node -e` predicate replica from PLAN.md `<verify>` block — 9/9 cases pass:

```
ok   R10 leaf
ok   R11 leaf
ok   R12 leaf
ok   R13 leaf (today)
ok   R14 leaf
ok   R99 unknown
ok   Fake CN
ok   wrong org R10
ok   empty attrs
```

Source literal gate (filters out comment lines so the rationale text cannot self-satisfy):

```
$ grep -v "^[[:space:]]*//" thinx-core.js | grep -c "\['R10', 'R11', 'R12', 'R13', 'R14'\]"
1
```

Both gates pass. Full jasmine suite was deliberately NOT run — the plan does not add a spec and the predicate is pure/closure-local so the inline replica is faithful to its structure.

## Decisions Made

- **Prophylactic R11 + R14 inclusion** — Adding them now gives the allowlist runway through the next two LE intermediate rotations without another code change. These have not yet been observed in production traffic.
- **No extraction / no Set / no env var** — Per plan scope §3 + YAGNI: five strings used in one closure-local closure does not justify the churn of pulling the allowlist out of the constructor.
- **E1/E2 (ECDSA intermediates) omitted** — THiNX certs are RSA; including the ECDSA intermediates would broaden the trust surface without serving any current or planned issuance.
- **Comment explicitly names chain.pem as the real fix** — Prevents the allowlist from being mistaken for a permanent solution. The operator action (refreshing `/mnt/data/ssl/chain.pem` so it matches the leaf's actual issuer chain) remains the correct remediation and is NOT addressed by this code change.

## Deviations from Plan

None — plan executed exactly as written. Both edits landed at the locations the plan named; allowlist literal and comment text match the plan's prescriptions verbatim.

## Operator Follow-Up (out of scope for this task)

- Refresh `/mnt/data/ssl/chain.pem` on the production swarm host so it matches the leaf cert's actual issuer chain (currently R13). This is the proper remediation; the allowlist widening shipped here is a hygiene workaround that prevents the boot log from being polluted in the meantime.
- After the next production deploy, confirm the `☣️ [error] Certificate verification failed` line is no longer printed at thinx-core startup. (Will be visible in Swarmpit logs.)

## Known Stubs

None — this task adds no UI, no data flow, no placeholders.

## Commits

| Hash       | Message                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `feebdbf0` | `fix(quick-260531-pdi): refresh LE intermediate allowlist (R10..R14)` |

## Self-Check: PASSED

- Created files exist:
  - `.planning/quick/260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign/260531-pdi-SUMMARY.md` — this file (verified by Write tool success).
- Modified files exist:
  - `thinx-core.js` — verified by `git diff --stat` showing 1 file changed, 11 insertions(+), 4 deletions(-).
- Commit exists:
  - `feebdbf0` — verified via `git rev-parse --short HEAD` immediately after commit.
- Verification predicate exit code: 0 (9/9 cases pass).
- Source literal grep gate: returned `1` as expected.
