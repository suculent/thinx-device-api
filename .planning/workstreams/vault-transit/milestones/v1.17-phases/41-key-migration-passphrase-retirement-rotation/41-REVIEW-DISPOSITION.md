---
phase: 41
review: 41-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "The rewrap renames a temp file over the only good ciphertext without checking that it was fully written"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`--rewrap` exits 0 while unreadable Transit files and files changed mid-run are still below the latest version"
  - id: WR-03
    severity: warning
    disposition: open
    title: "The rewrap abort set leaves out the service-level classes that git.js and transit.js define"
  - id: WR-04
    severity: warning
    disposition: open
    title: "An owner left with only a legacy (or other skipped) key gets no build attempt and no visible reason"
  - id: WR-05
    severity: warning
    disposition: open
    title: "In the swarm source gate, `PASSPHRASE_ABSENT` can be bypassed by an aliased or long-form secret, an `env_file`, or another service"
  - id: WR-06
    severity: warning
    disposition: open
    title: "The new passphrase self-test cases do not test `PASSPHRASE_ABSENT`"
  - id: IN-01
    severity: info
    disposition: open
    title: "The `retired_version` latch tests a timestamp for truthiness"
  - id: IN-02
    severity: info
    disposition: open
    title: "A login started by `probe()` stamps `op: \"probe\"`, which `serviceDownFor` does not recognise"
  - id: IN-03
    severity: info
    disposition: open
    title: "The CLI exits before any Slack alert raised during `--rewrap` can be sent"
  - id: IN-04
    severity: info
    disposition: open
    title: "An aborted rewrap counts files already at the latest version as `not_attempted` failures"
  - id: IN-05
    severity: info
    disposition: open
    title: "The rewrap has no lock, and the leftover-temp sweep deletes a concurrent run's temp file"
  - id: IN-06
    severity: info
    disposition: open
    title: "`LEFTOVER_TMP` only matches temp files of names that fit `KEY_NAME`"
  - id: IN-07
    severity: info
    disposition: open
    title: "The retirement gate does not scan shell scripts or the CI config"
  - id: IN-08
    severity: info
    disposition: open
    title: "Spec case (11) replaces `console.log` without a guaranteed restore"
  - id: IN-09
    severity: info
    disposition: open
    title: "The CI API container carries the OpenBao dev root token in its env, and git children inherit it"
open: 15
total: 15
recorded: 2026-10-20T20:16:38.699Z
---

# Phase 41: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| IN-09 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
