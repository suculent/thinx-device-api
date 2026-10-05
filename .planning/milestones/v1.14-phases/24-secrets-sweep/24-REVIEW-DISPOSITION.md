---
phase: 24
review: 24-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "GitHub OAuth `token` listeners pile up on a shared emitter, so one user's token can be delivered on another user's response (pre-existing, in a function this phase rewrote)"
  - id: WR-01
    severity: warning
    disposition: deferred
    title: "The rotated WORKER_SECRET still falls back to the old, leaked value in the env of both services"
  - id: WR-02
    severity: warning
    disposition: open
    title: "docker-swarm.yml mounts COUCHDB_USER, COUCHDB_PASS and REDIS_PASSWORD on api, which the live service does not, so any stack deploy switches DB and Redis credentials"
  - id: WR-03
    severity: warning
    disposition: open
    title: "The worker socket server does not authenticate workers, so any peer on the overlay can register and receive WORKER_SECRET. The `queue.js` handler this phase edited is dead code, and its spec tests a path that cannot run."
  - id: WR-04
    severity: warning
    disposition: open
    title: "Slack bot-token precedence is inverted between `getBotToken()` and `initSlack()`"
  - id: IN-01
    severity: info
    disposition: open
    title: "The disabled GitHub OAuth path logs \"[critical]\" on every callback, and the login route destroys the session before answering 400"
  - id: IN-02
    severity: info
    disposition: open
    title: "Slack redirect: a log line per request when disabled, the client secret in the URL, and an unencoded `code`"
  - id: IN-03
    severity: info
    disposition: open
    title: "`readSecret` trims file values but not env values, and an empty secret file shadows a valid env value"
  - id: IN-04
    severity: info
    disposition: open
    title: "The transformer's `app.js` and `trans.js` are unreachable, and the three copies of `secrets.js` are kept in sync by comment only"
open: 7
total: 9
recorded: 2026-09-29T12:09:29.539Z
---

# Phase 24: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | b09aea35 |
| WR-01 | warning | deferred | SEC-CFG-03 (remove env fallbacks; WORKER_SECRET first) |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
