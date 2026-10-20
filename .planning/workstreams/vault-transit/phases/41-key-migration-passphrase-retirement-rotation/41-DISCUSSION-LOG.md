# Phase 41: Key Migration, Passphrase Retirement & Rotation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log keeps the alternatives that were considered.

**Date:** 2026-10-20
**Phase:** 41-key-migration-passphrase-retirement-rotation
**Areas discussed:** Orphans & failures, Backup custody, Removal cut-over, Rotation & rewrap

---

## Orphans & failures

| Question | Options | Selected |
|---|---|---|
| Orphaned legacy files | Purge before migrating / Migrate them too / Leave and exclude | Purge before migrating |
| Undecryptable legacy file | Quarantine, then proceed / Block removal / You decide | Quarantine, then proceed |
| Notify affected owners | No, report only / Console notification | Console notification |
| Runner | node script via docker exec / Admin API endpoint | node script via docker exec |

## Backup custody

| Question | Options | Selected |
|---|---|---|
| Location | Node-local on micro / Off-swarm only / Both | Node-local on micro |
| Retention | Until Phase 41 verified, then shred / Fixed 30 days / Keep indefinitely | Until verified, then shred |
| Rollback | Restore from tar while dual-read live / Per-file .legacy sibling | Restore from tar while dual-read live |

## Removal cut-over

| Question | Options | Selected |
|---|---|---|
| Staging | Code first, then secret/env / Secret first / Single step | Code first, then secret/env |
| Late legacy file | Skip + log / Skip + Slack alert / Refuse + delete | Skip + log, no alert |
| Gate | Second run + one keyed build / Soak period / Operator go | Second run + one keyed build |

## Rotation & rewrap

| Question | Options | Selected |
|---|---|---|
| Cadence | One-off + runbook recipe / Scheduled cron | One-off + runbook recipe |
| Rewrap runner | API AppRole node script / Operator token for everything | API AppRole node script |
| IN-05 | Fix first / Rely on rewrap report | Fix first |
| Min version | Right after verified rewrap / After a soak | Right after verified rewrap |

## Claude's Discretion

Report format, Transit concurrency, atomic file write and locking, D-13 reason-class name, plan/wave split.

## Deferred Ideas

Scheduled rotation cron; KEYMIG-04 retest; per-owner Transit context (AR-40-02).
