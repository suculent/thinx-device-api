# Phase 26 plan check, iteration 1 (gsd-plan-checker, 2026-10-01)

**Verdict:** ISSUES FOUND. 1 blocker, 4 warnings, 3 info. The revision loop is at iteration 1 of 3.

All of these hold:
- LOG-01 to LOG-04 are covered.
- The dependency graph is acyclic: 01, 03, 04 and 05 run first, then 02, then 06, 07 and 08.
- D-01 to D-19 are each implemented.
- AGENTS.md is honoured.
- Every one-way operation has a dry run that prints only aggregates, followed by a blocking `checkpoint:decision`.
- The cursor carries only `{v, k, i}`, and both range ends are bound to the session owner.
- Deletion is contained: `safepath`, lstat to require real directories, depth exactly 3, and symlinks refused.
- The CLIs print aggregates only.

```yaml
issues:
  - plan: null
    dimension: research_resolution
    severity: blocker
    required_property: "RESEARCH.md carries no unresolved open question"
    description: "26-RESEARCH.md '## Open Questions' (line 617) has no (RESOLVED) marker on the heading or on any question. All 7 are actually decided: Q1=D-16, Q2=D-17, Q3=D-19, Q4=D-19 (DeviceDetail note in 26-05), Q5=D-15, Q6 deferred, Q7=D-18"
    fix_hint: "Mark the heading (RESOLVED) and annotate each question with its D-xx"
  - plan: "26-06"
    task: 3
    dimension: nyquist_compliance
    severity: warning
    required_property: "The automated check after a one-way apply fails when the applied targets did not converge to zero"
    description: "D15-POST-DRYRUN-CLEAN asserts only the OK line plus hygiene. The zero-count requirement exists only in the fails_when prose"
    fix_hint: "Assert users_with_reset_key=0 / audit_with_object_flags=0 for the mapped targets"
  - plan: "26-08"
    task: 3
    dimension: nyquist_compliance
    severity: warning
    required_property: "Per-root convergence and the OTA baseline comparison are decided by a command that can fail"
    description: "RETENTION-CONVERGED checks only audit_expired=0. The per-root zero folder/orphan counts and the build.json/avatar.json baseline equality are judged by hand"
    fix_hint: "Feed the approved roots and baseline counts into the verify commands"
  - plan: "26-08"
    task: 3
    dimension: context_compliance
    severity: warning
    required_property: "The scheduled destructive run avoids the 06:25-07:10 UTC cron.daily/unattended-upgrade window, or justifies it"
    description: "/etc/cron.daily runs at 25 6 * * *, inside the window the phase forbids for manual runs. Apt has bounced dockerd there before (2026-09-22 outage)"
    fix_hint: "Use a dedicated /etc/cron.d time outside 01:00-05:00 and 06:25-07:10, or record a justification"
  - plan: "26-08"
    task: 2
    dimension: context_compliance
    severity: warning
    required_property: "The D-16 per-root approval can approve each root on its own"
    description: "The options lack repos-only, although --roots repos is supported and repos holds most of the reclaimable data"
    fix_hint: "Add a repos-only option mapped to --apply --roots repos"
  - plan: "26-07"
    task: 1
    dimension: verify_path_resolvability
    severity: warning
    required_property: "Every <automated> command target resolves"
    description: "Probe: script_missing, prefix form, rawTarget 'services/console/vue', command 'npm --prefix services/console/vue run -s build ...' (BUNDLE-HAS-PAGING)"
    fix_hint: "Confirm the command resolves as written"
  - plan: "26-05"
    dimension: scope_sanity
    severity: warning
    required_property: "Each plan stays within the per-plan file budget"
    description: "26-05 modifies 14 files (the blocker threshold is 15); 26-02 modifies 10"
    fix_hint: "Consider moving the Cypress harness repair and fixtures into their own plan"
  - plan: "26-03"
    dimension: key_links_planned
    severity: info
    description: "The key_link 'plan 26-06 Task 2 / plan 26-07 Task 1' is stale; the apply is 26-06 Task 3"
  - plan: "26-04"
    dimension: cross_plan_data_contracts
    severity: info
    description: "The orphan sweep builds its record set from builds_by_time, which omits docs with no numeric time, so such a record's old folder would be swept. Build the set from builds_by_owner_time too, or add a spec case"
  - plan: "26-04"
    dimension: architectural_tier_compliance
    severity: info
    description: "The wrapper drops :ro on both roots whenever --apply is present. Mount only the roots in --roots read-write"
```
