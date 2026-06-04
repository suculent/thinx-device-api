# Phase 13: SEC-WS-01 Edge Handshake Closure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 13-sec-ws-01-edge-handshake-closure-ops-exec-01
**Areas discussed:** Plan structure + operator coordination model, Config snippet persistence form, Pre-fix probe scripted vs manual, SEC-WS-01 rollback procedure

---

## Plan structure + operator coordination model

| Option | Description | Selected |
|--------|-------------|----------|
| A — Single plan with CHECKPOINT | One PLAN.md. Executor produces prep artifacts, returns `## CHECKPOINT REACHED`, operator runs SSH, executor resumes and writes annex. Matches v1.9 Phase 3 OPS-01 rung-by-rung pattern. | ✓ |
| B — Two plans (prep + annex) | 13-01 prep + pre-fix probe baseline; 13-02 post-fix annex + config snippet. Clear plan boundaries; ambiguous between-plan state. | |
| C — Single plan with sentinel JSON | Executor exits with TODO marker. Operator writes EXECUTION-DONE.json. Second invocation detects sentinel and writes annex. Fully decoupled timing. | |
| D — Plan is the operator's CHECKLIST.md | Plan generates markdown checklist operator ticks through during SSH. Closest to real ops; requires manual paste. | |

**User's choice:** A — Single plan with CHECKPOINT (Recommended)
**Notes:** Matches the v1.9 Phase 3 OPS-01 pattern that landed cleanly (Rung 1 + checkpoint-gated Rungs 2-4). Single plan-file means the entire SEC-WS-01 closure narrative reads top-to-bottom in one PLAN.md. Resume contract documented in D-03: executor must detect (a) absence of `## PHASE COMPLETE`, (b) presence of operator-provided sentinel inputs (post-fix probe output + post-fix server-block snapshot), (c) annex-input fields (timestamp, initials, notes). If sentinels missing, re-emit CHECKPOINT rather than fabricating.

---

## Config snippet persistence form

| Option | Description | Selected |
|--------|-------------|----------|
| A — Full server-block snapshots (before + after) | `.planning/runbooks/swarm-configs/rtm.thinx.cloud-server.{pre,post}.nginx`. Establishes swarm-configs/ convention for v1.11+ OPS phases. Max forensic via git diff. | ✓ |
| B — Just the new location block | Single ~10-line snippet at `.planning/runbooks/swarm-configs/sec-ws-01-location-block.nginx`. Minimal but loses ordering context. | |
| C — Inline in runbook annex only | Code fences inside websocket-handshake.md annex. No new file. Co-located with procedure. | |
| D — Both: full snapshots + inline diff | Option A files + unified diff embedded in annex. Two sources of truth; max forensic. | |

**User's choice:** A — Full server-block snapshots (Recommended)
**Notes:** Establishes a new `.planning/runbooks/swarm-configs/` directory convention. v1.11+ OPS phases (OPS-02 swarm memberlist, OPS-03 yml fixes) inherit. Snapshot extraction recipe documented in D-06: `nginx -T 2>&1 | awk '/server_name rtm.thinx.cloud/,/^}/' > <path>.nginx`. Snapshots committed as-is (no reformatting per D-07). README documents the convention per D-08.

---

## Pre-fix probe scripted vs manual

| Option | Description | Selected |
|--------|-------------|----------|
| A — `scripts/probe-rtm-handshake.sh` | Shell script captures 7-row reproduction table programmatically. Outputs plain text for verbatim paste into annex. Reusable for future SEC-WS regressions. Matches Phase 11 / Phase 9 OPS-script precedent. | ✓ |
| B — Inline curl in runbook, manual paste | No new script. Operator copy-pastes curl commands and captures outputs by hand. Simplest; most paste-prone-to-error. | |
| C — Probe script + Phase 12 ZZ-spec wrapper | scripts/probe-rtm-handshake.sh runs the 7-row table AND invokes Phase 12 in-process Jasmine spec. Higher rigor; couples to test-image setup. | |

**User's choice:** A — scripts/probe-rtm-handshake.sh (Recommended)
**Notes:** Reusable for future SEC-WS regressions; operator can re-run anytime. Plain-text output designed for verbatim paste into runbook annex (zero formatting drift). Matches Phase 11 BASE-IMG-01 `set -euo pipefail` + shellcheck-clean pattern (D-09 captures the hardening requirements). The Phase 12 in-process spec is the CI-time regression gate; this live-rtm script is the OPS-time evidence gate. They cover different layers — deliberately decoupled per D-11. Combined wrapper deferred to v1.11.

---

## SEC-WS-01 rollback procedure

| Option | Description | Selected |
|--------|-------------|----------|
| A — Explicit rollback section | Append SEC-WS-01 rollback section to websocket-handshake.md mirroring SEC-COOKIE-01 section format. Uses pre-fix server-block snapshot from Area 2 as restore source. < 5min SLA. | ✓ |
| B — git revert + cp restore one-liner | Inline note: 'cp pre.nginx, nginx -s reload'. No dedicated section. | |
| C — Defer to future incident response | Skip rollback docs in Phase 13. Generate ad-hoc fix when needed. | |

**User's choice:** A — Explicit rollback section (Recommended)
**Notes:** Mirrors the existing SEC-COOKIE-01 rollback section in the same runbook (parallel format: When to roll back / Diagnosis check / Rollback recipe / Post-rollback verification / SLA). Restore source is the pre-fix server-block snapshot persisted per D-05 — pairs naturally with Area 2's full-snapshot decision. < 5min SLA matches the SEC-COOKIE-01 SLA. Explicitly covers 3 failure modes per D-17: (a) nginx -t fail (safety-cleanup), (b) reload succeeded but new block intercepts unintended route, (c) Vue console regression on flow that worked pre-fix. Trade-off documented in D-18: rollback restores the BROKEN state — WS subscribe will be broken again, but the swarm host is in a known-good state.

---

## Claude's Discretion

The following areas were deferred to the planner during write_context, not the user:

- `scripts/probe-rtm-handshake.sh` exact output format (text-only vs lightly structured)
- Annex section appended to runbook vs separate annex file (recommendation: append for co-location)
- CHECKPOINT prompt verbiage (D-25 documents required content; planner crafts exact text)
- Probe script invocation interface (bare vs `--baseline`/`--verify` flags — recommendation: keep simple, no flags)
- Plan task count (4-6 tasks expected; planner partitions during plan-phase)

## Deferred Ideas

Captured in CONTEXT.md under `<deferred>` block. Summary:

- Combined live-rtm + in-process spec wrapper — deferred to v1.11
- Auto-applied nginx config provisioning (Ansible/Terraform) — pure OPS, v2+
- Migrate existing OPS runbooks to swarm-configs/ convention retroactively — v1.11+
- CHECKPOINT prompt automation (Slack-bot etc.) — v2+ noise/signal call
- Annex format as structured YAML frontmatter — deferred (current markdown is human-readable)
- Multi-host swarm-configs/ for broader edge layer — v1.11+
