---
gsd_state_version: "1.0"
milestone: v1.16
milestone_name: Console Usability & Deploy Keys
current_phase: 38
status: awaiting_ci_and_acceptance
last_updated: "2026-10-09"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# STATE — THiNX Device API

## Current Position

v1.16 phases 35–38 implemented and locally verified from Google Drive THiNX/TODOs.md.

## Preserved Work

v1.15 remains unfinished and paused; its original state/roadmap/requirements are in milestones/v1.15-*-IN-PROGRESS.md. Concurrent staging work completed phases 32–33. Latest v1.15 state, roadmap and requirements are preserved; resume Phase 34 after this independent console milestone. Phase 34 context was gathered concurrently on thinx-staging (`phases/34-ops-surface-reduction-sla-close-out/34-CONTEXT.md`); resume with plan-phase 34.

## Decisions

Use thinx-staging baseline, paired console branch and parent submodule pointer. Preserve API signatures, legacy plaintext transport, existing dependency locks. No source credentials in git.

## Verification

Local unit/regression checks, builds, source security checks, and lint pass. GitHub connector write access restored; console PR #32 is merged and API PR #572 is approved for thinx-staging. CLI credentials remain unavailable. Browser validation could not run because Chromium downloads were invalid. CI and production acceptance pending. See v1.16-VERIFICATION.md.

## Next Action

API PR #572 is merged into thinx-staging (concurrent v1.15 Phase 34 context preserved). Monitor staging test and registry image jobs, then verify live rollout before closing v1.16.
