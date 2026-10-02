---
phase: 26-vue-console-log-paging
plan: 10
subsystem: ui
status: complete
gap_closure: true
gap_ids: [G-26-1]
tags: [vue, console, ui, a11y, contrast, deploy, gap-closure]

requires:
  - phase: 26-vue-console-log-paging
    provides: "26-05 Vue History paging UI (rowClass warning/danger rows); 26-07 Push 2 deploy path; 26-UAT gap G-26-1"
provides:
  - "Dark-theme warning and danger audit rows in Vue History: cells tinted at .2 alpha, $header-color text, 7.71/7.91 (warning) and 9.12/9.35 (danger) contrast on even/odd rows"
  - "tests/unit/table-row-contrast.cjs in npm run test:unit: compiles the real theme, runs a mini-cascade, fails below 4.5:1"
  - "Fix live on console.thinx.cloud (console 3153cac, parent gitlink a0a1e097), four CI jobs green, thinx_api rebooted with _design/paging action=unchanged x2"
affects: [26-UAT test 1 re-test by the operator, Phase 26 verification closeout]

actuals:
  tokens: 4790
  tasks: 3
  commits: 1
plan_head_before: 0ebb82bc137437be1e25144402ffccaa317b5a5f
plan_head_after: a0a1e09721d9819bdefefebfd65847410f9dae25

tech-stack:
  added: []
  patterns:
    - "Contrast regression check over the compiled theme: sass compileString + a mini-cascade over candidate selectors, WCAG 2.x luminance, no browser"
    - "Bootstrap row variants in a dark theme: tint the cells only, make the row transparent, qualify with tr. so specificity wins regardless of import order"

key-files:
  created:
    - services/console/vue/tests/unit/table-row-contrast.cjs
    - .planning/phases/26-vue-console-log-paging/26-10-SUMMARY.md
  modified:
    - services/console/vue/src/styles/_overrides.scss
    - services/console/vue/package.json
    - services/console (gitlink 3e77525 -> 3153cac)

key-decisions:
  - "Row text uses $header-color, not the $text-color the gap note suggested: a visible .2 warning tint with $text-color measures 4.44:1 and fails AA; $header-color gives 7.71:1 or more"
  - "Tint applied to cells only, never to row and cells both (double tint would drop warning to 3.58:1 with $text-color)"
  - "Operator answered push at the Task 2 gate (D-14); push ran 13:15 UTC, outside 01:00-05:00 and 09:25-10:15"
  - "The SUMMARY/closeout commit is not pushed: any thinx-staging push redeploys thinx_api, so the next parent push carries it"

patterns-established:
  - "UI colour fixes ship with a compiled-theme contrast check in test:unit that fails on regression"

requirements-completed: [LOG-03]

coverage:
  - id: D1
    description: "Warning and danger audit rows have a dark tint and text at or above 4.5:1 on even and odd rows"
    requirement: LOG-03
    verification:
      - kind: unit
        ref: "npm --prefix services/console/vue run -s test:unit (table-row-contrast.cjs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fix served by console.thinx.cloud through the thinx-staging deploy path"
    requirement: LOG-03
    verification:
      - kind: other
        ref: "curl console.thinx.cloud/js/app.js: served_warning_fix=1 served_danger_fix=1 served_paging_ui=1"
        status: pass
    human_judgment: false
  - id: D3
    description: "History rows read well in the browser; badges, info rows, scrolling, filters and Load more unchanged (UAT test 1 re-test)"
    requirement: LOG-03
    verification: []
    human_judgment: true
    rationale: "Perceived readability and an unchanged look need a human eye on the live console; the operator re-runs UAT test 1"

duration: "about 15 min active (Task 1 to 13:12 UTC; Task 3 13:15-13:22 UTC), split by the Task 2 checkpoint"
completed: 2026-10-02
---

# Phase 26 Plan 10: Readable dark-theme warning and danger rows (G-26-1) Summary

**Warning and danger rows in the Vue History audit table now get a dark orange or red cell tint with `$header-color` text: 7.71:1 and 7.91:1 for warning, 9.12:1 and 9.35:1 for danger (even/odd), where Bootstrap's pale fill gave about 1.1:1. A compiled-theme contrast check in `test:unit` guards it. The fix is live on console.thinx.cloud: console `3153cac`, signed gitlink `a0a1e097`, four CI jobs green, all three services rolled, and the thinx_api reboot left `_design/paging` unchanged.**

## Performance

- **Duration:** about 15 min active. Task 1 finished at 13:12 UTC (console commits 15:12 +0200). The operator answered the gate. Task 3 ran 13:15–13:22 UTC.
- **Tasks:** 3 of 3. Task 1 is the tracer, Task 2 the decision gate (answer `push`), Task 3 the deploy.
- **Files modified:** 3 console files plus the parent gitlink.

## Task 1 (tracer): failing check, override, bundle, live baseline

**RED.** `2c8ad4c` adds `vue/tests/unit/table-row-contrast.cjs` and wires it into `test:unit`. Against the pre-fix theme it exited 1, with FAIL on the warning and danger row text contrast and dark-tint checks, while the info and badge guards printed ok. The handoff did not keep the verbatim RED console lines. I recomputed the pre-fix values from the compiled Bootstrap rules the plan records (pale fill `rgb(247.44,225.04,183.6)` / `rgb(239.88,200.4,200.4)`, `.table` text `rgba(244,244,245,.6)`):

| Variant | Pre-fix text contrast | Pre-fix bg luminance | Check verdict |
|---|---|---|---|
| warning | 1.09:1 | 0.772 | FAIL (< 4.5, > 0.1) |
| danger | 1.22:1 | 0.642 | FAIL (< 4.5, > 0.1) |

The pale fill is opaque on the cells, so the result is the same on odd and even rows.

**GREEN.** `3153cac` adds the block after `.table-sm` in `_overrides.scss`: `tr.table-warning` / `tr.table-danger` get a transparent background and `$header-color`; their `> td` / `> th` cells get `rgba(theme-color(<v>), .2)`, `$header-color` and `$table-border-color`. The current `test:unit` run (re-run during Task 3, rc=0, 58 ok lines, no FAIL):

```
ok   warning even row text contrast 7.71 >= 4.5 (text #e3e2e3 on #4d403f, ...)
ok   warning odd row text contrast 7.91 >= 4.5 (text #e3e2e2 on #4b3e3b, ...)
ok   warning row background is a dark tint (bg #4d403f luminance 0.055 <= 0.1, differs from panel #272b4e)
ok   danger even row text contrast 9.12 >= 4.5 (text #e3e0e4 on #472e4b, ...)
ok   danger odd row text contrast 9.35 >= 4.5 (text #e3e0e4 on #462c47, ...)
ok   danger row background is a dark tint (bg #472e4b luminance 0.038 <= 0.1, differs from panel #272b4e)
ok   info and default rows keep the Bootstrap variant rules (no tr.-qualified info or default variant)
ok   flag badges keep their look (.badge-warning #e49400, .badge-danger #c93c3c, .badge color rgba(244,244,245,.9))
```

**Gates printed in Task 1:** ROW-CONTRAST-GREEN, BUNDLE-HAS-ROW-FIX (production build: dist CSS carries both cell overrides, dist JS carries the paging UI), CONSOLE-FIX-COMMITTED (3 files, 2 commits, signature G, clean worktree) and LIVE-BASELINE-RECORDED (`served_paging_ui=1 served_row_fix_before=0`).

## Task 2: decision gate

The operator answered **push** ("push when it's ready"). The orchestrator re-verified at 13:14 UTC: both console commits signed G, the submodule worktree clean, contrast check 0 FAIL, the time outside both blocked windows.

## Task 3: deploy

### Pre-push (13:15 UTC)

- **Timing:** 13:15 UTC, outside 01:00–05:00 and 09:25–10:15. No thinx-staging CircleCI job was queued or running (`active_jobs=0`).
- **Secret scan:** `secret_hits=0`. The console diff had no hits. The parent diff had only allowed hits, all in `26-10-PLAN.md`: the manager ssh endpoint AGENTS.md already publishes (IP, key name, port), and the pattern-list text itself (`hooks.slack.com/services/` as a literal pattern name, not a webhook).
- **Rollback digests** (first 12 hex, queried by service name):

| Service | Node before | Digest before | Node after | Digest after |
|---|---|---|---|---|
| thinx_vue | micro | `d89370e2b6c3` | micro | `0fe9a5a81a90` |
| thinx_console | core | `5c951638aaa2` | core | `9420fec56980` |
| thinx_api | micro | `6eb2db4671a6` | micro | `a39b646bbb0e` |

### Pushes

- **Console:** `git -C services/console push origin thinx-staging`, fast-forward `3e77525..3153cac`.
- **Gitlink:** only `services/console` staged. Signed commit `a0a1e097` `chore(26): bump console to the readable warning rows fix (G-26-1)`, signature G.
- **Parent:** `git push origin thinx-staging`, fast-forward `66b78cce..a0a1e097`. It carried the signed docs commits `753c0ff4`, `1d1c9bbc`, `da8bdaf7` and `0ebb82bc`, all signature G.
- VUE-FIX-PUSHED-AND-BUMPED: `console=3153cac… gitlink=3153cac…`, not the pre-fix `3e775252`.

### CI (pushed SHA `a0a1e097`)

| Job | Build | Result |
|---|---|---|
| test | #15562 | success 13:18:13 |
| api-registry | #15563 | success 13:19:55 |
| console-classic-registry | #15559 | success 13:17:55 |
| vue-console-registry | #15556 | success 13:20:58 |

Four-job line: `api-registry=success console-classic-registry=success test=success vue-console-registry=success`.

### Rollout and live checks

- thinx_console was running its new digest by 13:21:17; thinx_vue and thinx_api were Running their new digests at 13:21:48, within a minute of the last image publish.
- **Served bundle** (`https://console.thinx.cloud/js/app.js`, cache-busted): `served_warning_fix=1 served_danger_fix=1 served_paging_ui=1`, so ROW-FIX-SERVED. The baseline was 0 for the override.
- **thinx_api boot** since the gitlink commit (13:15:44Z): `upsert_unchanged=2`, `upsert_rewritten=0`, `state=Running`.

## Task Commits

1. **Task 1 (tracer):** console `2c8ad4c` (test, RED) and `3153cac` (fix, GREEN), both signed, pushed in Task 3.
2. **Task 2:** checkpoint:decision, no commit.
3. **Task 3:** parent `a0a1e097` (chore, gitlink bump, signed, pushed).

**Plan metadata:** the docs commit carrying this SUMMARY, STATE and ROADMAP (signed, not pushed).

## Files Created/Modified

- `services/console/vue/tests/unit/table-row-contrast.cjs`: plain-node WCAG check over the compiled theme, with info and badge guards
- `services/console/vue/src/styles/_overrides.scss`: dark-theme warning and danger row and cell rules
- `services/console/vue/package.json`: `test:unit` runs the contrast check
- `services/console`: gitlink `3e77525` -> `3153cac`

## Decisions Made

- **`$header-color` for row text (discretion).** The gap note suggested `$text-color`. With a visible .2 warning tint, that text measures 4.44:1 and fails AA. `$header-color` gives 7.71:1 or more for warning and 9.12:1 or more for danger.
- **Cells only.** The tint sits on `> td` / `> th`. The row is transparent, so the stripe still shows on odd rows and the tint is never applied twice.
- **Closeout not pushed.** Pushing the SUMMARY commit would redeploy thinx_api again; the next parent push carries it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Info/default guard narrowed to History's row variants**
- **Found during:** Task 1 (RED step)
- **Issue:** A guard that flagged any `tr.`-qualified `.table-*` selector other than warning and danger would fail on the unchanged theme, because bootstrap-vue ships its own `tr.table-active` hover rules. Those are not History row variants, and this plan does not touch them.
- **Fix:** The guard matches only `tr.table-(info|default)`, as the plan's label states, with a comment explaining why `tr.table-active` stays out.
- **Files modified:** `services/console/vue/tests/unit/table-row-contrast.cjs`
- **Verification:** the guard prints ok on the GREEN run (above). Note: the handoff named this deviation only as "guard narrowing"; the issue text here is reconstructed from the guard comment in the committed check (lines 394-397).
- **Committed in:** `2c8ad4c`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** None on scope. The guard still catches what the plan meant to forbid.

## Issues Encountered

- **commitlint warnings.** The console `commit-msg` hook printed footer-leading-blank warnings on the console commits. They are warnings, not rejections; both commits landed signed.
- **Plan commit ledger missing.** Task 1 did not write `.git/gsd-plan-head-before-26-10`. The base is the parent HEAD recorded in the handoff (`0ebb82bc`); `git rev-list --count 0ebb82bc..a0a1e097` = 1. The two console commits live in the submodule and are not part of that count.
- **RED lines not preserved.** See Task 1. I did not re-run the check against a temporary pre-fix copy of the theme, because that command was denied in this session. The ratios above are recomputed from the compiled values instead.

## User Setup Required

None.

## Next Phase Readiness

- **UAT test 1 re-test (operator).** On console.thinx.cloud, hard-refresh (Cmd+Shift+R), open History from the sidebar (a reload of `/#/app/history` lands on the dashboard; that is the known deep-link issue), and in the Audit Log tab check that:
  - warning and danger rows show a dark orange or red tint and read as easily as the others;
  - the Flags badges look as before;
  - unflagged and info rows look as before;
  - scrolling, the filters and Load more behave as in the first pass.
  Record the result with `/gsd-verify-work 26`. UAT test 1 and G-26-1 are left open until then.
- **Rollback:** revert the two console commits and push both repos, or pin one service: `docker service update --with-registry-auth --image <recorded digest> thinx_vue` (digest before: `d89370e2b6c3`). Placement floats, so query the node first.
- UAT test 3 (the first scheduled retention run) is still due 2026-10-03 09:40 UTC.

## Self-Check: PASSED

- FOUND: services/console/vue/tests/unit/table-row-contrast.cjs
- FOUND: services/console/vue/src/styles/_overrides.scss (tr.table-warning)
- FOUND: console commits 2c8ad4c, 3153cac on origin/thinx-staging
- FOUND: parent commit a0a1e097 on origin/thinx-staging
