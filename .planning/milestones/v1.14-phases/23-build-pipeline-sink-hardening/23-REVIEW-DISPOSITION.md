---
phase: 23
review: 23-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "The job now goes only to `nextAvailableWorker()`'s pick, but that pick does not track busy workers. With two or more workers, every build goes to the first registered worker, which silently drops any job that arrives while it is building (regression exposed by the iteration-2 WR-03 fix)"
  - id: IN-01
    severity: info
    disposition: open
    title: "Known-hosts fallback writes TOFU keys into the \"pinned\" seeded file; comments say otherwise (carried forward, still open)"
  - id: IN-02
    severity: info
    disposition: open
    title: "`Sanitka.udid` is not a UUID validator, contrary to the D-12 wording (carried forward, still open)"
  - id: IN-03
    severity: info
    disposition: open
    title: "Owners without keys get a second identical keyless clone, which can flip `is_private` (carried forward, still open)"
  - id: IN-04
    severity: info
    disposition: open
    title: "`Sources.add` continuation swallows exceptions and leaves checkout residue on failure (carried forward, still open)"
  - id: IN-05
    severity: info
    disposition: open
    title: "Source-add and device-attach fetches never use the D-09 last-good-key memory (carried forward, still open)"
  - id: IN-06
    severity: info
    disposition: open
    title: "`run_build` ignores `prefetchPublic`'s result and re-derives it from `basename.json` (carried forward, still open)"
  - id: IN-07
    severity: info
    disposition: open
    title: "`devices.attach` starts an async, link-following `chmodr` on the device path while the prefetch empties and re-clones it (carried forward, still open)"
  - id: IN-08
    severity: info
    disposition: open
    title: "`runGit`'s process-group kill and output cap are untested (carried forward, still open)"
  - id: IN-09
    severity: info
    disposition: open
    title: "`chmodCheckoutSync` is a synchronous full-tree walk on the API event loop (carried forward, still open)"
  - id: IN-10
    severity: info
    disposition: open
    title: "`build()` device matching falls through to an unmatched udid; unused masked `copy` (carried forward, still open)"
  - id: IN-11
    severity: info
    disposition: open
    title: "Queue socket.io server still has no handshake authentication (recorded; deliberately not enforced)"
  - id: IN-12
    severity: info
    disposition: open
    title: "`runRemoteShell` adds `log` and `job-status` listeners to the worker socket for every job and never removes them (pre-existing)"
  - id: IN-13
    severity: info
    disposition: open
    title: "The `poll` path is now live: concurrent `findNext` can dispatch one action twice, and a `findNext` rejection is unhandled"
  - id: IN-14
    severity: info
    disposition: open
    title: "Checkout lock limits: wedged when `runGit` never settles, unbounded wait, and reads after release"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Concurrent `prefetch_repository` calls for the same device now interleave in one checkout directory"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "`runRemoteShell` broadcasts every job to all sockets on the socket.io server"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "`cloneRepository` returns `ok: true` while an async `chmodr` is still walking the checkout"
open: 15
total: 18
recorded: 2026-09-28T19:46:41.038Z
---

# Phase 23: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| IN-09 | info | open | - |
| IN-10 | info | open | - |
| IN-11 | info | open | - |
| IN-12 | info | open | - |
| IN-13 | info | open | - |
| IN-14 | info | open | - |
| WR-02 | warning | fixed | 23-REVIEW-FIX.md (not in the current review) |
| WR-03 | warning | fixed | 23-REVIEW-FIX.md (not in the current review) |
| CR-01 | critical | fixed | 23-REVIEW-FIX.iter2.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
