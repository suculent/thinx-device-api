---
phase: 42
review: 42-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "CiPipelineGates.test.js is not wired into any test runner or CI job"
  - id: WR-02
    severity: warning
    disposition: deferred
    title: "Snyk main-only leaves every image production runs unmonitored"
  - id: WR-03
    severity: warning
    disposition: deferred
    title: "The redesigned login keeps a \"Create an Account\" CTA that links back to the login page"
  - id: IN-01
    severity: info
    disposition: open
    title: "Gate-open pipelines on thinx-staging also redeploy the API and Vue console"
  - id: IN-02
    severity: info
    disposition: open
    title: "`listAll` follows `next_page_token` with no page bound"
  - id: IN-03
    severity: info
    disposition: open
    title: "The compile test validates the script against its own simulator"
  - id: IN-04
    severity: info
    disposition: open
    title: "The footer commit id means different commits in CI and in local builds"
  - id: IN-05
    severity: info
    disposition: open
    title: "Layout footer is now likely to wrap on phones, and its reserved space is one line"
  - id: IN-06
    severity: info
    disposition: open
    title: "First year 2018 is duplicated between template and script"
  - id: IN-07
    severity: info
    disposition: open
    title: "The dev branch thinx-console still publishes the production Vue tag (pre-existing)"
open: 7
total: 10
recorded: 2026-10-12T17:00:31.327Z
---

# Phase 42: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | commit 4e16212c: spec wired into test:node and the CI test job |
| WR-02 | warning | deferred | operator accepted 2026-10-12: CI-04 trade-off (T-42-04, runbook); revisit at CI-06 |
| WR-03 | warning | deferred | operator 2026-10-12: D-18 keeps the link; signup routing is backlog |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
