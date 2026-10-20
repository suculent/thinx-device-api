# Roadmap: THiNX Device API

## Milestones

- ✅ **v1.17 — Deploy-Key OpenBao Transit** — Phases 39–41 (shipped 2026-10-20, workstream `vault-transit`)

This workstream roadmap covered v1.17 only. Shipped milestones v1.0–v1.16 live in `.planning/MILESTONES.md` and
`.planning/milestones/`; v1.18 is archived in the `vue-console` workstream. v1.17 is archived in
`milestones/v1.17-ROADMAP.md`, `milestones/v1.17-REQUIREMENTS.md` and `milestones/v1.17-phases/`. Phase numbers
continue the global sequence; the next free phase number is 49.

## Phases

<details>
<summary>✅ v1.17 — Deploy-Key OpenBao Transit (Phases 39–41) — SHIPPED 2026-10-20</summary>

See `milestones/v1.17-ROADMAP.md`. 17/17 v1.17 requirements across 3 phases (19 plans, 44 tasks). Closes PwnDoc
finding `6ac64bcfdd94eb38dba4c3a4`. Closed as `override_closeout`: phases 39 and 40 carry stale verification digests
because Phase 41 removed the dual-read path they verified, as planned. KEYMIG-04 (PwnDoc retest) stays future.

- [x] Phase 39: Internal OpenBao on the Swarm (6/6 plans) — completed 2026-10-19
- [x] Phase 40: Transit-Encrypted Deploy Keys in the API (5/5 plans) — completed 2026-10-19
- [x] Phase 41: Key Migration, Passphrase Retirement & Rotation (8/8 plans) — completed 2026-10-20

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 39. Internal OpenBao on the Swarm | v1.17 | 6/6 | Complete | 2026-10-19 |
| 40. Transit-Encrypted Deploy Keys in the API | v1.17 | 5/5 | Complete | 2026-10-19 |
| 41. Key Migration, Passphrase Retirement & Rotation | v1.17 | 8/8 | Complete | 2026-10-20 |
