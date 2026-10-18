# Phase 43 — UI Review

**Audited:** 2026-10-13
**Baseline:** 43-UI-SPEC.md (approved 2026-10-12; frame rules F-1..F-5, UI-D-01..06)
**Screenshots:** not captured (code-only audit by instruction: no production login, no credentials, no local dev server used)
**Interaction captures:** off (workflow.ui_interaction_capture not set). All interaction findings below come from the code.

Surface: Legacy toastr toasts rendered by `parseNotification` in
`services/console/src/app/js/controllers/LogviewController.js` (console `cfff199`, no change this phase), fed by the
frames `lib/thinx/builder.js` now sends through `messenger.sendToOwner`. Since the console is frozen (D-14), any toast
regression this phase can only come from the frames. Those frames are what this review mostly scores.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Contract strings are exact, but a successful dry run ends with a red raw code `"DRY_RUN_OK"` (WR-03), and the worker's exit failure always says `"Failed"` (WR-04) |
| 2. Visuals | 3/4 | Escaping holds and the type allow-list holds; a 20 s non-deduplicated stack per build in every tab, with JSON-quoted bodies |
| 3. Color | 2/4 | F-2 "failure is never green" can still be broken: a `status: OK` substring in build output sends a green `Completed`, and the real failure is dropped (WR-02); dry-run success shows red |
| 4. Typography | 3/4 | Inherited 14px 400/700 as contracted; quoted JSON bodies and snake_case reason codes read as machine text |
| 5. Spacing | 3/4 | Vendor geometry untouched; the only explicit spacing is the inline `style="margin: 0 8px 0 8px"` on the No button |
| 6. Experience Design | 2/4 | `deviceBuilds[udid].push` throws for a device with no build history, so the toast is lost (pre-existing); duplicate actionable replies across tabs; refused sockets fail silently |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **BLOCKER (F-2): a green `Completed` toast can follow a failed build** (`lib/thinx/builder.js:553-558`, `processShellData`). The match is a substring test (`status: OK` / `STATUS OK`). Any build output line such as `Upload status: OK` sends a green terminal frame and marks the build `Success`. The real failure is then dropped. Users are told their firmware built when it did not. Fix: match only the builder's exact line (`[builder] Build Stage completed with status: OK`), or drop the shell-side success path and let `processExitData` be the single terminal source. Add a spec: an OK-like log line followed by `processExitData({status:"FAILED"})` must give one `error` frame and no `success` frame.
2. **WARNING: a successful dry run ends in a red `"DRY_RUN_OK"` toast** (`builder.js:524-532`). `processExitData` treats only statuses that start with `OK` as success, so `DRY_RUN_OK` goes through the error branch. The user sees red for a success and the build log state is set to that string. Fix: add `DRY_RUN_OK` to the success branch. It should send `Completed` (or a dedicated success body), never `error`.
3. **WARNING: a device with no build history loses every build toast in that tab** (`LogviewController.js:227`). `$rootScope.meta.deviceBuilds[msg.udid].push` throws when the array is undefined. This happens before the toastr call, so none of the three Build Status toasts appear. Before this phase no build frame ever reached the console, so the bug was invisible. Phase 43 makes it user-facing. Fix (Phase 48 Legacy batch): `(deviceBuilds[udid] = deviceBuilds[udid] || []).push(...)`. Record it as a known UAT caveat until then.

Additional:
4. **WARNING:** the worker's exit-failure payload has no `status` field, so every remote failure toast reads `"Failed"` and the build-log state does not change (WR-04). Spec F2a feeds a shape the worker never sends. Pass the worker's real failure reason through.
5. **WARNING:** an actionable prompt appears in every open tab, and answering it in two tabs sends two replies (spec: unresolved). There is no visual cue that a prompt was answered elsewhere.
6. **WARNING:** after Send, the `.toastr-input` stays visible and editable, because only the button's parent div collapses (`LogviewController.js:315-317`). An empty string can also be sent, since there is no validation and Send is never disabled.
7. **WARNING:** an upgrade refused by the per-owner cap is silent in the UI (`wss.onclose` is a no-op, :89). The user gets no toasts and nothing tells them why. The contract accepts this, but it still hurts the user. WR-01 (dead sockets keep their slots) makes it more likely to happen.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)
- Frozen bodies are exact: `Pulling repository` (builder.js:938), `Building...` (:1291), `Completed` (:529, :558). The title is `Build Status`, and every failure reason code is sent with `false` (:297-1261). These match the contract table.
- BLOCKER-adjacent: the copy can contradict the outcome. `"DRY_RUN_OK"` arrives as an error toast (WR-03), and `Completed` can follow a failure (WR-02, see Color).
- `"Failed"` is the only remote failure copy (WR-04). That is generic copy, and the actual cause is not shown.
- The body is rendered as `thinxEscapeHtml(JSON.stringify(msg.body))` (:325), so users see `"Completed"` with quotes. The contract accepts this (UI-D-03), but it still looks like machine output.
- Reason codes (`worker_busy`, `error_starting_build`) reach users as snake_case identifiers. UI-D-03 defers friendlier copy. That is a deferral, not a pass.
- The fallback toast text `toastr.error("Error", "WebSocket NOT supported by your Browser!")` (:120) has its title and body arguments swapped. Pre-existing.

### Pillar 2: Visuals (3/4)
- NOTIF-01 holds. Every device field goes through `thinxEscapeHtml` (:11-18, :254-255, :325, :362). The type allow-list `thinxToastMethod` (:21-23) and `thinxSafeNid` gate everything that reaches markup, ids and selectors.
- The toast stack has no de-duplication (`preventDuplicates: false`). A build gives 3 toasts × 20 s × every tab, newest on top. That matches the contract, but the stack is noisy, and the frozen Legacy UI has no grouping or replace-in-place.
- The terminal toast has no visual link to its device (the body is only the code, and the udid is not shown). With two parallel builds you cannot tell which `"Completed"` belongs to which device.

### Pillar 3: Color (2/4)
- Accent (`success` #51A351) is reserved for progress and completion frames. Every `notify(..., false)` maps to `error` through `successStringFromBool` (:117), and the remote-worker guard now passes `false` (:297). These parts of F-2 hold.
- F-2 is violated in two paths. (a) WR-02: a `status: OK` substring sends green `Completed` before the real failure, which is then suppressed. (b) WR-03: `DRY_RUN_OK` is a success shown in `error` red. Either way, the colour does not match the outcome, and colour is the user's primary signal.
- White text on #51A351 is about 3:1, below AA (a known issue, deferred to Phase 48 CI-06). It is unchanged, but this phase now shows these green toasts for the first time.

### Pillar 4: Typography (3/4)
- 14px 400 body and 700 title (`.toast-title`), as in the contract. No new sizes or weights.
- Quoted JSON bodies and raw reason codes are the only typographic noise. Nothing in the frame shape distinguishes the hierarchy between title and body.

### Pillar 5: Spacing (3/4)
- No layout change. The vendor values (15/15/15/50 padding, 6px stack gap, 300px width) are as listed.
- The 8px gap for the No button is an inline style (:265), not a class. The `<br><br>` pairs (:260-261, :292-293) give the spacing between body, nid and actions. That is ad hoc markup spacing, outside the scale. Pre-existing and frozen by D-14.

### Pillar 6: Experience Design (2/4)
- Covered: the invalid nid and unknown type show no toast (fail closed). Owner-only delivery holds (F-5, D-12). No log lines reach the notification socket (F-4). The terminal frame carries `build_id` (F-3, `notify` builds the D-11 shape).
- `deviceBuilds[udid].push` throws for a device with no history (:227), and all toasts for that frame are lost. This is now reachable for every first build.
- A tab whose first socket opens from the log overlay sends `logtail`, not `init` (IN-04), so it never subscribes and gets no toasts.
- Actionable toasts: replies are duplicated across tabs. The input stays live after Send. Empty replies are allowed. There is no answered-elsewhere state.
- A refused upgrade (cap) and a socket drop are both silent: `onclose` no-op (:89, :116), with no reconnect and no indicator. WR-01: half-open sockets are not terminated, so they keep using cap slots.
- Status-frame correctness depends on WR-02/03/04. 43-VERIFICATION is `human_needed` (52/56), and the D-16 rtm UAT is still pending.

Registry audit: not applicable (no shadcn, no third-party registry; toastr 2.1.3 vendored).

---

## Files Audited
- `services/console/src/app/js/controllers/LogviewController.js` (:8-25, :55-150, :205-370)
- `lib/thinx/builder.js` (:117, :180-205, :290-410, :515-560, :836-1291)
- `.planning/workstreams/vue-console/phases/43-notification-delivery/43-UI-SPEC.md`, `43-CONTEXT.md`, `43-0{1,2,3}-SUMMARY.md`, `43-VERIFICATION.md`, `43-REVIEW.md`
