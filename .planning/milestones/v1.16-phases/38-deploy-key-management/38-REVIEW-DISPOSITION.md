---
phase: 38
review: 38-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "\"Newest first\" sort compares second-precision dates; keys created in the same second keep readdir order"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Throwing fs calls in the async generateKeyPair callback crash the process and leak the claim"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "A failed or partial private-key write leaves a visible, broken key pair"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "Stranded claim files are never cleaned up, not even by GDPR `revokeAllForOwner` or `purgeOrphanedKeys`"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "`filenames` is iterated with `for…of` without an array check, so non-array bodies return 500"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "`create()` response shape does not match the list/delete contract"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Name validation is duplicated verbatim in router and library"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Name filter allows Unicode bidi overrides, line/paragraph separators and C1 controls"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Unparseable stored public keys produce a garbage display name"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "Duplicate filenames in a revoke request are reported as revoked twice"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "Dead code and debug logging around the touched functions"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "Tests do not cover the real name round-trip, HTTP validation, sort precision or malformed filenames"
  - id: IN-07
    severity: info
    disposition: fixed
    title: "The newest-first sort changes which key GitHub linking pushes"
open: 0
total: 13
recorded: 2026-10-12T14:33:48.523Z
---

# Phase 38: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed (f3845d58) | - |
| WR-02 | warning | fixed (f3845d58) | - |
| WR-03 | warning | fixed (7c8fe41a) | - |
| WR-04 | warning | fixed (7c8fe41a) | - |
| WR-05 | warning | fixed (7c8fe41a) | - |
| WR-06 | warning | fixed (7c8fe41a) | - |
| IN-01 | info | fixed (f0b866c5, 579e334f) | - |
| IN-02 | info | fixed (f0b866c5, 579e334f) | - |
| IN-03 | info | fixed (579e334f) | - |
| IN-04 | info | fixed (38ff5180) | - |
| IN-05 | info | fixed (7c8fe41a) | - |
| IN-06 | info | fixed (d03458cf) | - |
| IN-07 | info | fixed (52788676) | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
