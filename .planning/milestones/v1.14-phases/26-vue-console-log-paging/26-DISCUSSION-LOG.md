# Phase 26: Vue Console Log Paging - Discussion Log

**Date:** 2026-10-01
**Phase:** 26-vue-console-log-paging
**Areas discussed:** History paging UX, Filters vs paging, Build retention (30-day prune), Rollout & index warm-up

---

## History paging UX

| Question | Options | Selected |
|---|---|---|
| Paging style | Load more / Numbered pages / Infinite scroll | Load more |
| Page size | 100 / 50 / 200 | 100 |
| Two tables | Independent / One shared control | Independent |
| Dashboard | First page only / Keep legacy call / You decide | First page only |

## Filters vs paging

| Question | Options | Selected |
|---|---|---|
| Filter with more pages | Filter loaded + hint / Auto-load until date covered / Filter loaded, no hint | Filter loaded + hint |
| Server-side date jump | No, keep client-side / Yes, add a `before` param | No, keep client-side (deferred) |

## Build retention (30-day prune)

| Question | Options | Selected |
|---|---|---|
| Prune-on-read | Move to scheduled job / Keep legacy prune / Drop pruning entirely | Move to scheduled job |
| Window | 365 / 90 / 30 days | 365 days |
| Artifacts | Records only / Include files | Include files |
| First run | Dry run, then approve / Back up, then delete / Delete straight away | Dry run, then approve |
| Coupling | Together, record-driven / Also sweep orphans | Also sweep orphans |

**Notes:** artifact deletion is one-way. Without a backup step, the dry run and the operator's approval are the only safeguards.

## Rollout & index warm-up

| Question | Options | Selected |
|---|---|---|
| Staging | Backend, warm, then Vue / One push | Backend, warm, then Vue |
| Old views | Leave untouched / Remove the unused views | Leave untouched |
| Operator | Executor with gated checkpoints / Fully autonomous | Executor with gated checkpoints |

## Claude's Discretion
- Paged view keys and cursor encoding (within the locked contract), the new design doc's name and the upsert mechanics, the hint wording and button styling.

## Deferred Ideas
- Server-side date jump (`before` parameter).
- Removing the unused `_design/logs` views.
