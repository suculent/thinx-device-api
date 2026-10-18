# Deferred Items — Phase 48.1

Out-of-scope discoveries made while executing the phase plans. Each entry stays `open` until the
fix lands and the entry is marked `status: resolved`.

## Deferred Items

- Build-log search: stepping to a match does not scroll the log box (BUILD-03, UI-B06)
  status: acknowledged
  **Found during:** 48.1-03 Task 3 (`build-log-search.spec.js`, 2026-10-18), with a throwaway
  probe spec (deleted, never committed) that wrapped `Element.prototype.scrollTop`.
  **What:** `BuildLogDialog.vue` `step()` sets `current` and queues `scrollToCurrent()` with
  `this.$nextTick`. The `<pre ref="log">` lives in a non-static `b-modal`, whose
  `BVTransporter` (bootstrap-vue 2.21.2) pushes the new slot vnodes to its target from its
  `updated()` hook. Vue 2 calls `updated()` hooks after `resetSchedulerState()`, so the
  target's re-render is queued as a *new* tick, after the dialog's `scrollToCurrent` callback.
  `scrollToCurrent` therefore finds the previous `.build-log-match--current` (the first match,
  offsetTop 57) and sets `scrollTop = -198.5` (clamped to 0). Measured: `scrollHeight` 2372,
  `clientHeight` 526, current mark `offsetTop` 1169, `scrollTop` 0 after the step; the only
  app-side `scrollTop` write was `-198.5`. The highlight moves; the view does not. Same path for
  Enter / Shift+Enter stepping and for the first match after a term change (harmless there, the
  first match is near the top). `tests/unit/build-log-search.cjs` T6 exercises `scrollToCurrent`
  with a mocked element, so it cannot see the ordering.
  **Why deferred:** plan 48.1-03 is test-only and prohibits changes under `vue/src` (flagged,
  CI-07). The spec asserts that the current mark moves and carries a comment naming the missing
  `scrollTop` assertion to add once fixed.
  **Candidate fix (one file, `vue/src/components/BuildLogDialog/BuildLogDialog.vue`):** scroll
  after the transporter has rendered, e.g. `this.$nextTick(() => this.$nextTick(() =>
  this.scrollToCurrent()))` in `step()` and `selectFirst()`, or scroll from the dialog's
  `updated()` hook guarded by a `pendingScroll` flag; then add the `scrollTop > 0` assertion to
  `build-log-search.spec.js` test 1 and a unit check that the scroll is scheduled after the
  modal body update. Owner decision: 48.1-04, a quick task, or a Phase 48.1 follow-up.
