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

v1.15 remains unfinished and paused; its original state/roadmap/requirements are in milestones/v1.15-*-IN-PROGRESS.md. Phases 29–34 remain untouched. Resume its phase 32 after this independent console milestone.

## Decisions

Use thinx-staging baseline, paired console branch and parent submodule pointer. Preserve API signatures, legacy plaintext transport, existing dependency locks. No source credentials in git.

## Verification

Local unit/regression checks, builds, source security checks, and lint pass. GitHub connector write access restored; paired feature branches are being published with draft PRs to thinx-staging. CLI credentials remain unavailable. Browser validation could not run because Chromium downloads were invalid. CI and production acceptance pending. See v1.16-VERIFICATION.md.

## Next Action

Check feature-branch CI and review paired PRs. Deployment builds run only after changes reach thinx-staging. Verify registry build results and live rollout before closing v1.16.
