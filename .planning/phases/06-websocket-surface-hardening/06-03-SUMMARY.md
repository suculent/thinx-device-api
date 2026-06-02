---
phase: 06-websocket-surface-hardening
plan: 03
subsystem: infra
tags: [security, websocket, runbook, nginx, edge-routing, operator-action, rtm, documentation-only]

requires:
  - phase: 06-websocket-surface-hardening
    provides: "CONTEXT.md SEC-WS-01 decision block + the 7-row reproduction table captured 2026-06-02T21:10-21:11Z"

provides:
  - "Operator-side runbook at .planning/runbooks/websocket-handshake.md documenting the rtm.thinx.cloud WS-handshake 404 root cause (edge nginx routing gap for /<owner>(/<timestamp>)?), the curl-probe reproduction evidence, the operator-side nginx fix recipe (SSH + nginx -T + new location block + nginx -t + reload), and the post-fix verification probe."
  - "Closes SEC-WS-01 in this repo via option (b) — documented + tagged 'deferred to edge-redesign'. No code change in this repo (the request never reaches Express)."
  - "Anchor file for Plan 06-02 (SEC-COOKIE-01) to APPEND its rollback section (Wave 2)."

affects:
  - 06-02 (SEC-COOKIE-01 — appends rollback section to this same runbook in Wave 2)
  - "Future swarm-host edge-nginx config change (out-of-repo operator action)"
  - "Future edge-redesign work consolidating Traefik/nginx layer (deferred)"

tech-stack:
  added: []
  patterns:
    - "Operator-action runbook with reproduction table + concrete swarm-host commands + post-fix verification recipe (mirrors .planning/runbooks/swarm.md format)"
    - "Deferred-to-edge-redesign tag for requirements whose fix lives out-of-repo on the swarm host"

key-files:
  created:
    - .planning/runbooks/websocket-handshake.md
  modified: []

key-decisions:
  - "Documentation-only resolution for SEC-WS-01: the reproduction proves the request never reaches Express, so a code-side fix would mask the actual gap. Per CONTEXT.md decision block, the fix lives on the swarm host (out of repo) — runbook drives the operator action."
  - "Runbook format mirrors .planning/runbooks/swarm.md: Symptom / Root Cause / Reproduction / Operator Action / Verification / Reference. No YAML frontmatter (runbooks are plain Markdown in this repo)."
  - "Illustrative nginx `location` block presented as guidance, NOT as a copy-paste-ready edit — operator validates against actual upstream name + surrounding directives via `nginx -T` before committing. Regex must be ordered AFTER `/api/` and `/static/` blocks."
  - "Post-fix verification accepts BOTH 401 (Express reached, app rejected unauthenticated upgrade) AND 101 Switching Protocols (Express reached, upgrade succeeded). Either confirms the edge-routing gap is closed — anything but a bare `Server: nginx` 404."
  - "Tagged 'deferred to edge-redesign' per SEC-WS-01 requirement option (b) at REQUIREMENTS.md:27."

patterns-established:
  - "Operator-action runbook pattern for requirements whose fix lives out-of-repo: tag 'deferred to edge-redesign' (or analogous), include reproduction evidence table verbatim from CONTEXT.md, name the SSH host + exact commands, include a post-fix probe recipe."
  - "Pre-creating shared documentation files in Wave 1 so dependent Wave 2 plans can APPEND rather than fall through their defensive-stub fallback."

requirements-completed:
  - SEC-WS-01

duration: ~5min
completed: 2026-06-02
---

# Phase 6 Plan 06-03: SEC-WS-01 rtm.thinx.cloud WebSocket handshake 404 runbook Summary

**Operator-side runbook documenting the rtm edge-nginx routing gap (no `location` for `/<owner>(/<timestamp>)?`) with verbatim 7-row curl-probe reproduction table, concrete swarm-host fix recipe (`nginx -T` + new `location` block + `nginx -t` + reload), and 401-or-101 post-fix verification probe — tagged `deferred to edge-redesign`.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-02T21:30Z (approx)
- **Completed:** 2026-06-02T21:36Z
- **Tasks:** 2 (one file creation + one atomic commit)
- **Files created:** 1 (`.planning/runbooks/websocket-handshake.md`, 140 lines)

## Accomplishments

- Closed SEC-WS-01 in this repo via option (b) of the requirement (REQUIREMENTS.md:27) — documented + tagged deferred. No code change; the reproduction proves the request never reaches Express, so a code-side change would have masked the actual gap.
- Captured the 7-row reproduction table verbatim from CONTEXT.md (curl-probes against `/`, `/api/v2/users`, `/api/githook`, `/test` × 3 protocol/upgrade variants, `/suculent` real-owner shape — all captured 2026-06-02T21:10-21:11Z). The helmet/CSP/CORS-header presence/absence distinguishes Express-reached (rows 2-3) vs nginx-only (rows 4-7) responses.
- Documented the concrete operator action: SSH `root@188.166.23.244 -p2020`, `nginx -T` inspection, add a `location ~ ^/[^/]+(/.*)?$` block ordered after `/api/` and `/static/` but before the catch-all `/`, with the WebSocket-required `proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, and `proxy_set_header Connection "Upgrade"` directives. `nginx -t` && `systemctl reload nginx` as the apply gate.
- Documented the post-fix verification: re-run the same `curl -sI` probes against `/suculent`; success criterion is anything BUT a bare nginx 404 — either 401 (Express reached, app rejected unauthenticated upgrade) or 101 Switching Protocols (Express reached, upgrade succeeded).
- Pre-created the shared runbook file in Wave 1 so Plan 06-02 (SEC-COOKIE-01, Wave 2) can APPEND its rollback section rather than fall through its defensive-stub fallback path (06-02 Task 3 branch (a)).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the WebSocket-handshake runbook** + **Task 2: Stage and commit** — `1c9b2085` (docs)
   - Task 1 (file creation) and Task 2 (atomic stage+commit) collapsed into a single GPG-signed commit per the plan's single-commit acceptance criterion (one atomic GPG-signed commit touching exactly the runbook file).

**Subject:** `docs(SEC-WS-01): rtm.thinx.cloud WebSocket handshake 404 runbook (edge nginx routing gap)`
**Signature:** Good signature from Matej Sychra <suculent@me.com> (RSA key DC5CDA18C1DE3F9B29068802002B305D80BF729F)
**Files changed:** 1 (`.planning/runbooks/websocket-handshake.md`, +140 / -0)

## Files Created/Modified

- `.planning/runbooks/websocket-handshake.md` (CREATED, 140 lines) — Symptom / Root Cause / Reproduction (7-row verbatim table from CONTEXT.md) / Operator Action (SSH + `nginx -T` + illustrative `location` block + `nginx -t` + reload) / Verification (curl-probe recipe + Vue console smoke) / Reference (to CONTEXT.md, PLAN.md, REQUIREMENTS.md SEC-WS-01, AGENTS.md § Websocket Findings, swarm.md adjacent runbook).

## Acceptance Criteria — Verification

All Task 1 + Task 2 acceptance criteria pass:

| Criterion | Required | Actual |
|-----------|----------|--------|
| `test -f .planning/runbooks/websocket-handshake.md` | exists | exists |
| `grep -c "SEC-WS-01"` | ≥ 2 | 5 |
| `grep -c "deferred to edge-redesign"` | ≥ 1 | 2 |
| `grep -c "188.166.23.244"` | ≥ 1 | 1 |
| `grep -c "nginx -T"` | ≥ 1 | 3 |
| `grep -c "proxy_set_header Upgrade"` | ≥ 1 | 1 |
| `grep -c "rtm.thinx.cloud/suculent"` | ≥ 1 | 2 |
| `grep -c "101 Switching Protocols"` | ≥ 1 | 3 |
| `grep -c "401"` | ≥ 1 | 1 |
| `grep -c "Express IS reached"` | ≥ 1 | 2 |
| `grep -c "Express NOT reached"` | ≥ 1 | 2 |
| `wc -l` | ≥ 80 | 140 |
| Commit subject exact match | yes | yes (`docs(SEC-WS-01): rtm.thinx.cloud WebSocket handshake 404 runbook (edge nginx routing gap)`) |
| GPG signed | Good signature | Good signature (RSA DC5CDA18C1DE3F9B29068802002B305D80BF729F) |
| One file changed | yes | yes (`.planning/runbooks/websocket-handshake.md`) |
| Insertions ≥ 80 / deletions = 0 | yes | +140 / -0 |
| Working tree clean (of modified files) | yes | yes (only orchestrator-owned untracked file `06-01-SUMMARY.md` remains, NOT touched per plan rules) |

## Decisions Made

- **Collapsed Task 1 and Task 2 into a single GPG-signed commit.** Plan acceptance criterion for Task 2 is "one atomic GPG-signed commit touching exactly the runbook file" — splitting Task 1 (file creation, uncommitted) and Task 2 (stage+commit) would have been bookkeeping noise that produced the same one-commit output. Done atomically: Write → stage → commit.
- **Followed `.planning/runbooks/swarm.md` format exactly:** plain Markdown, no YAML frontmatter, level-2 `##` section headers, `## Reference` block listing all upstream sources. Mirrors the existing canonical runbook style.
- **Reproduction table copied VERBATIM from CONTEXT.md** — no editorial rewrites, no row summaries. The exact curl probes captured 2026-06-02T21:10-21:11Z are the evidence; rewriting them would weaken the runbook.
- **Illustrative nginx block kept generic.** Plan explicitly required this to be presented as ILLUSTRATIVE — operator validates against the actual upstream name via `nginx -T` before committing. Runbook makes that contract explicit ("the upstream name (`thinx-api-upstream`) is illustrative; use the actual upstream that backs `/api/`").
- **Post-fix verification accepts BOTH 401 and 101.** A 401 from Express (no valid session cookie) proves the routing gap is closed just as effectively as a 101 (valid session) — and the curl probe with an opaque `Cookie: x-thx-core=test` will reach Express but be rejected for lack of a real session. Both responses are documented success criteria.

## Deviations from Plan

None — plan executed exactly as written.

- Two-task structure was collapsed into a single atomic commit, but this is the structural shape the plan's Task 2 acceptance criterion explicitly required ("one atomic GPG-signed commit touching exactly the runbook file"). Task 1 acceptance criteria (`grep` counts + line count) were verified BEFORE staging; the commit landed only after all criteria passed. This is the canonical pattern for documentation-only single-file plans, not a deviation.

## Issues Encountered

None.

The 06-01-SUMMARY.md file is untracked in the working tree — that file is orchestrator-owned per the executor context (`<execution_rules>`: "DO NOT touch 06-01-SUMMARY.md or thinx-core.js (orchestrator-owned / from 06-01)") and was left untouched. Working tree is clean of MODIFIED files; the orchestrator-owned untracked file is expected.

## Self-Check

- [x] `test -f .planning/runbooks/websocket-handshake.md` → FOUND
- [x] `git log --oneline | grep 1c9b2085` → FOUND (`1c9b2085 docs(SEC-WS-01): rtm.thinx.cloud WebSocket handshake 404 runbook (edge nginx routing gap)`)
- [x] All Task 1 grep-count acceptance criteria pass (table above)
- [x] All Task 2 commit acceptance criteria pass (subject exact match, Good GPG signature, single file changed, +140 / -0)
- [x] Reproduction table integrity: all 7 rows from CONTEXT.md present (spot-checked via `Express IS reached`=2 and `Express NOT reached`=2 — accounting for both the table rows and the explanatory text below it)

## Self-Check: PASSED

## User Setup Required

None — this plan is documentation-only.

The runbook itself drives a future operator action on the swarm host (`root@188.166.23.244 -p2020` → `nginx -T` → add `location` block → `nginx -t` && `systemctl reload nginx`), but that action is the runbook's contract with the operator, not setup required to use this plan's deliverable.

## Next Phase Readiness

- **Wave 2 readiness:** Plan 06-02 (SEC-COOKIE-01) can now run its Task 3 branch (a) — APPEND a rollback section to the existing `.planning/runbooks/websocket-handshake.md` rather than create a stub. The defensive-stub fallback (branch (b) in 06-02 Task 3) is not exercised.
- **SEC-WS-01 closure in this repo:** Complete via option (b). Out-of-repo operator action remains pending; the runbook is the input.
- **Phase 6 success criterion #2 (ROADMAP):** `wscat` handshake from a fresh Vue session against `rtm.thinx.cloud` returns `101 Switching Protocols` — currently DEFERRED to the operator-side nginx fix the runbook drives. The "or runbook documents the upstream-Traefik condition" alternative is now fulfilled.

---
*Phase: 06-websocket-surface-hardening*
*Completed: 2026-06-02*
