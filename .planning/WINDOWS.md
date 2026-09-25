---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 1
total_count: 1
last_updated: 2026-09-25T13:09:46.556Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 22 | unrun-verify | .planning/phases/22-ci-sast-baseline/22-02-PLAN.md |  | 22-02 Task 3 (D-13) gluster thinx.yml line + live thinx_console --env-rm not applied: auto-mode permission denial; operator commands in 22-02-SUMMARY Open Items | fixed |  | 2026-09-25T12:59:05.006Z | 2026-09-25T13:09:46.556Z |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "22",
    "file": ".planning/phases/22-ci-sast-baseline/22-02-PLAN.md",
    "line": null,
    "description": "22-02 Task 3 (D-13) gluster thinx.yml line + live thinx_console --env-rm not applied: auto-mode permission denial; operator commands in 22-02-SUMMARY Open Items",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-25T12:59:05.006Z",
    "resolved_at": "2026-09-25T13:09:46.556Z",
    "milestone": "v1.14"
  }
]
````
