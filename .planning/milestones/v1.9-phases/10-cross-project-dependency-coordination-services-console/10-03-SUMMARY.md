---
phase: 10-cross-project-dependency-coordination-services-console
plan: 03
subsystem: planning-docs / runbooks
tags: [docs, runbook, dep-triage, cross-project, submodule-coordination, SEC-DEP-02]
requirements: [SEC-DEP-02]
wave: 1
dependency-graph:
  requires:
    - Plan 10-01 (.planning/dep-triage.md Phase 10 annex — referenced from the runbook's classification glossary + worked example)
    - Plan 10-02 (services/console SEC-DEP-02 phase entry + parent pointer bump — the 9-step workflow the runbook generalizes)
    - Phase 4 SEC-DEP-01 baseline (closed-set rationale taxonomy + verdict enum reproduced verbatim in Section 3)
  provides:
    - Operator-facing cross-project dependency-triage coordination runbook (durable, discoverable workflow for any future sibling-submodule Dependabot triage)
    - Codified `deferred-vendored-asset` class with paired verdict + rationale entries (one-to-one mapping mirroring Phase 4 pattern)
    - 9-step canonical submodule edit + pointer bump procedure (generalized from Plan 10-02's concrete execution)
  affects:
    - .planning/runbooks/ collection (grows from 3 → 4 runbooks; the new file lives alongside swarm.md, websocket-handshake.md, managed-logs-redaction.md)
tech-stack:
  added: []
  patterns:
    - Operator-tone runbook style (matches swarm.md / websocket-handshake.md / managed-logs-redaction.md house format)
    - Worked-example threading (Phase 10 / SEC-DEP-02 Alert 54 + Alert 52 referenced in EVERY section)
    - Self-contained glossary (full Phase 4 closed sets reproduced so operator doesn't need to context-switch)
key-files:
  created:
    - .planning/runbooks/cross-project-dependency-coordination.md (204 lines)
  modified: []
decisions:
  - One-to-one verdict↔rationale mapping for the new `deferred-vendored-asset` class (mirrors Phase 4's pattern of pairing `deferred-stale` with `stale-alert` and `deferred-dev-only` with `dev-only-scope`).
  - Push ordering policy codified in the workflow callouts — submodule branch pushed FIRST, then parent's pointer-bump commit second (prevents dangling-pointer window if submodule branch is force-pushed).
  - Pointer-bump commit message MUST cite the submodule's new HEAD SHA in the body (full 40-char hex) for auditability even if force-push later orphans the SHA in the submodule's remote.
  - Runbook is self-contained — full Phase 4 closed-set rationale taxonomy + verdict enum reproduced (no context-switch required when classifying a new alert from a sibling project).
metrics:
  duration: 2m26s
  completed: 2026-06-03
  tasks-completed: 2
  files-created: 1
  files-modified: 0
  commits: 1
  lines-added: 204
---

# Phase 10 Plan 03: Cross-Project Coordination Runbook Summary

One-liner: Created the operator-facing runbook `.planning/runbooks/cross-project-dependency-coordination.md` codifying the cross-project dependency-triage workflow first used by Phase 10 / SEC-DEP-02 (2 high-severity grunt alerts on `thinx-cloud/console`, both classified `deferred-vendored-asset`).

## What Shipped

**One new runbook file at `.planning/runbooks/cross-project-dependency-coordination.md`** (204 lines), structured as 5 numbered sections plus framing + cross-references closing block. The runbook documents:

1. **When to use this pattern** — Triggers (sibling-submodule Dependabot alerts + coordinated parent annex + optional pointer bump) and anti-patterns (unmanaged sibling project, vulnerability in parent's own tree).
2. **`gh api` recipe for Dependabot inventory** — Three copy-paste-ready recipes (open by severity, all open, dismissed-context) with the Phase 10 verbatim command (`gh api 'repos/thinx-cloud/console/dependabot/alerts?state=open&severity=high'`) and worked-example output (Alert 54 + Alert 52 grunt advisories).
3. **Classification verdict glossary** — Full Phase 4 closed-set rationale taxonomy (7 entries including the new `deferred-vendored-asset`) + full verdict enum (7 entries) reproduced so the runbook is self-contained; each entry includes a 1-sentence definition + a "future trigger to re-classify" note. `deferred-vendored-asset` entry cites Alert 54 (GHSA-rm36-94g8-835r) and Alert 52 (GHSA-m5pj-vjjf-4m3h) by GHSA ID as the first concrete application.
4. **Submodule edit + pointer bump workflow** — The 9-step canonical sequence used by Plan 10-02 (clean tree check → submodule branch check → submodule edit → submodule commit → SHA capture → return-to-parent → stage pointer → diff verify → parent commit), generalized for any sibling submodule. Includes important callouts on submodule GPG-signing config, push ordering, and SHA citation in the parent commit body.
5. **Post-merge verification checklist** — 7-box checklist covering Dependabot alert state (closed/dismissed), `.planning/dep-triage.md` annex verdict reconciliation, parent CircleCI green, sibling CI green, `git submodule status` drift check (leading SPACE = clean), runbook cross-reference validity, and the Phase 10 worked-example specific success criteria.

**Worked example threaded throughout:** Alert 54 (GHSA-rm36-94g8-835r, grunt < 1.5.3) and Alert 52 (GHSA-m5pj-vjjf-4m3h, grunt < 1.3.0) on `thinx-cloud/console`, both at the vendored `src/assets/global/plugins/jquery-validation-1.19.5/package.json`, both classified `deferred-vendored-asset`. The Phase 10 example appears 5 times across the runbook (header framing, gh api output, verdict glossary, submodule workflow callouts, verification checklist).

**One atomic GPG-signed commit on `thinx-staging`:**
- Hash: `ceda118dda0839ba947c18de9d4145ed91db1ab9`
- Subject: `docs(SEC-DEP-02): cross-project dependency coordination runbook`
- Files: 1 (the new runbook)
- Insertions: 204
- GPG signature: Good signature from Matej Sychra (key DC5CDA18C1DE3F9B29068802002B305D80BF729F)

## Tasks Executed

### Task 1: Create cross-project coordination runbook ✓

**Files created:** `.planning/runbooks/cross-project-dependency-coordination.md` (204 lines)

The runbook was authored as a single Write call following the structure specified in the plan: H1 title → framing paragraph (audience + when to use + first-codified-by) → Section 1 (when to use, with triggers + anti-patterns) → Section 2 (`gh api` recipes + auth prerequisites + worked-example output) → Section 3 (rationale taxonomy + verdict enum, both as closed sets) → Section 4 (9-step submodule edit + pointer bump workflow + callouts) → Section 5 (post-merge verification checklist) → cross-references closing block.

**Verification gates** (all passed):
- File exists and is non-empty.
- H1 title matches exactly: `# Cross-Project Dependency Coordination Runbook`.
- `deferred-vendored-asset` appears 4 times.
- `gh api` recipe appears 5 times (multiple variants).
- Exact Phase 10 command (`thinx-cloud/console/dependabot/alerts`) present.
- Both GHSA IDs (GHSA-rm36-94g8-835r, GHSA-m5pj-vjjf-4m3h) present twice each.
- Vendored manifest path (`jquery-validation-1.19.5/package.json`) appears 4 times.
- `git submodule status` appears twice (workflow step + verification checklist).
- `Phase 10 / SEC-DEP-02` appears 5 times.
- Line count: 204 (well above the 80-line minimum).

### Task 2: Atomic GPG-signed commit + verify clean tree ✓

**Files committed:** `.planning/runbooks/cross-project-dependency-coordination.md` (the only staged file)

Pre-stage state: `git status --short` showed exactly `?? .planning/runbooks/cross-project-dependency-coordination.md` (one untracked file, no other modifications) — matching the expected pre-commit state precisely.

Stage + commit was a single atomic operation via `git add` of the explicit path + `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc.

**Verification gates** (all passed):
- `git log -1 --format='%s'` matches exactly: `docs(SEC-DEP-02): cross-project dependency coordination runbook`.
- `git show --stat HEAD` reports exactly 1 file added (the new runbook), 204 insertions, 0 modifications.
- `git status --short` is empty (working tree fully clean post-commit).
- `ls .planning/runbooks/*.md | wc -l` returns `4` (was 3 pre-Phase-10-Plan-3; now contains swarm.md, websocket-handshake.md, managed-logs-redaction.md, cross-project-dependency-coordination.md).
- `git log -1 --show-signature` confirms `Good signature from "Matej Sychra <suculent@me.com>"`.

No push performed (Test-env ACCEPT pattern — operator push handles CircleCI green-gate).

## Decisions Made

- **One-to-one verdict↔rationale mapping** for the new `deferred-vendored-asset` class. The runbook codifies this as a convention for future new classes: when a new rationale class emerges, its paired verdict string SHOULD be `deferred-<class-name>` (mirroring Phase 4's `deferred-stale` ↔ `stale-alert` and `deferred-dev-only` ↔ `dev-only-scope` pairings). Keeps the verdict ↔ rationale mapping unambiguous.
- **Push ordering policy** codified in the submodule-workflow callouts. Submodule branch pushed FIRST, then parent's pointer-bump commit second. This prevents a "dangling pointer" window if the submodule branch is force-pushed between the parent pointer-bump commit and the parent push.
- **SHA citation in commit body.** The pointer-bump commit message MUST cite the submodule's new HEAD SHA (full 40-char hex) in the body so the bump remains auditable even if force-push later orphans the SHA in the submodule's remote.
- **Self-contained glossary.** The runbook reproduces the full Phase 4 closed-set rationale taxonomy + verdict enum verbatim (rather than just cross-referencing `dep-triage.md`). Tradeoff: minor duplication, but the operator does NOT need to context-switch when classifying a new sibling-project alert. Drift risk mitigated by Threat T-10-10 — a `grep -r` on stable identifiers surfaces the runbook for update if Phase 4 closed sets ever change.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan specified:
- 5 sections + framing + closing cross-references → delivered exactly that.
- All required content markers (H1 title, `deferred-vendored-asset`, exact `gh api` command, both GHSA IDs, manifest path, `git submodule status`, `Phase 10 / SEC-DEP-02`) → all present in the file.
- 80-line minimum → delivered 204 lines (more thorough operator coverage; well above floor).
- One atomic GPG-signed commit with the exact subject `docs(SEC-DEP-02): cross-project dependency coordination runbook` → delivered exactly.
- Exactly 1 file added (the new runbook) → verified via `git show --stat HEAD`.
- 4 runbooks in `.planning/runbooks/` post-commit → verified via `ls`.
- No push → confirmed (operator push deferred per Test-env ACCEPT pattern).

No Rule 1 / Rule 2 / Rule 3 auto-fixes were needed during execution. No Rule 4 architectural questions arose. No checkpoints were hit.

## Threat Surface Scan

The runbook is pure documentation; the threat surface is content-only:

- **T-10-09 Information disclosure (accept):** All content is public — public GHSA IDs (GHSA-rm36-94g8-835r, GHSA-m5pj-vjjf-4m3h), public Dependabot API recipe (no secrets), public submodule SHA references (the 27758eb… pre-bump SHA is in the GitHub-visible submodule history). No new secrets introduced.
- **T-10-10 Tampering / drift mitigated:** Runbook cross-references use stable identifiers ("Phase 10 / SEC-DEP-02", "deferred-vendored-asset" rationale class, full `.planning/...` file paths). If those targets are renamed in a future phase, `grep -r 'Phase 10 / SEC-DEP-02' .planning/` (or grepping any of the other stable identifiers) surfaces the runbook for update. The Section 5 checklist explicitly includes a runbook-cross-reference validity box.
- **T-10-11 Repudiation mitigated:** Commit GPG-signed (verified by `git log --show-signature`); commit subject + body cite Phase 10 of v1.9 as the codifying phase.
- **T-10-12 Elevation of privilege accepted:** The `gh api` recipe explicitly notes the required `gh auth status` scopes (`repo` + `security_events`). Operator misconfiguration fails with `HTTP 401 Bad credentials` or `HTTP 403 Resource not accessible by integration` — no privilege elevation, just a failed enumeration.

No new threat flags raised beyond the plan's threat model (no new files outside the planned runbook, no new endpoints, no new auth paths, no new schema or trust boundaries).

## Self-Check: PASSED

**Created files exist:**
- `.planning/runbooks/cross-project-dependency-coordination.md` → FOUND (204 lines)

**Commits exist:**
- `ceda118d` (`docs(SEC-DEP-02): cross-project dependency coordination runbook`) → FOUND on `thinx-staging`

**Runbook directory final state:**
- `swarm.md` (pre-existing)
- `websocket-handshake.md` (pre-existing)
- `managed-logs-redaction.md` (pre-existing)
- `cross-project-dependency-coordination.md` (new — this plan)

Final count: 4 markdown files in `.planning/runbooks/` ✓ (matches Task 2 verification gate).

**Working tree post-commit:** clean (empty `git status --short`).

**Phase 10 closure status:** After Plans 10-01 (annex), 10-02 (sibling schedule + pointer bump), and 10-03 (this runbook), SEC-DEP-02 success criteria #1, #2, and the foundation for #3 (the scheduling-commit pointer bump) are all satisfied. The remaining SEC-DEP-02 success criterion (#3 the LATER bump after console-side remediation merges + #4 CircleCI green-gate across that bump) is operator-side and runs via THIS runbook in a separate session — out of Phase 10 scope per 10-CONTEXT.md.

## References

- `.planning/runbooks/cross-project-dependency-coordination.md` — the new runbook (this plan's deliverable).
- `.planning/dep-triage.md` § "Phase 10 / SEC-DEP-02 (services/console) — Cross-Project Roll-up" — the parent annex this runbook references throughout (created by Plan 10-01).
- `.planning/phases/10-cross-project-dependency-coordination-services-console/10-01-SUMMARY.md` — Plan 10-01 close-out.
- `.planning/phases/10-cross-project-dependency-coordination-services-console/10-02-SUMMARY.md` — Plan 10-02 close-out (the 9-step workflow this runbook generalizes was executed concretely there).
- `.planning/ROADMAP.md` Phase 10 of v1.9 — the phase that codified this workflow.
- `.planning/REQUIREMENTS.md` SEC-DEP-02 — requirement spec.
- `.planning/phases/10-cross-project-dependency-coordination-services-console/10-CONTEXT.md` — full Phase 10 context (Alert 54 + Alert 52 classification rationale, recommended remediation, coordination sequence).
- Sibling runbooks (format precedent): `.planning/runbooks/swarm.md`, `.planning/runbooks/websocket-handshake.md`, `.planning/runbooks/managed-logs-redaction.md`.
