# Phase 48: Deep Links & Close-out - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 48-Deep Links & Close-out
**Areas discussed:** Cypress gate topology, Legacy release (CI-06), Ledger scope & Phase 44 nits, POL-01 look & feel

---

## Cypress gate topology

| Option | Description | Selected |
|--------|-------------|----------|
| Parent job | Parent `test-vue-console` job; registry/hub builds require it | ✓ |
| Status check by SHA | Parent queries the CircleCI API for console `test_vue` on the submodule SHA | |
| Console repo only | Procedural gate, not a literal `requires` | |

| Option (live login.spec) | Description | Selected |
|--------|-------------|----------|
| Stub in CI, opt-in live | Stubbed `/api/login`; live only with `CYPRESS_LIVE_LOGIN=1` | ✓ |
| Stub only | Delete the live test | |
| Live with CI account | Dedicated account in a CircleCI context | |

| Option (visitAppRoute) | Description | Selected |
|--------|-------------|----------|
| Hard-load + regression spec | Helper becomes a plain hard load; dedicated deep-link spec | ✓ |
| Keep workaround | Only add the regression spec | |

| Option (oauth-return CSRF) | Description | Selected |
|--------|-------------|----------|
| Same-origin API in CI | No app change | ✓ |
| App: forced prime wins | Change `ensureCsrfToken` | |
| Both | | |

| Option (.env.test) | Description | Selected |
|--------|-------------|----------|
| Inspect, untrack, rotate if real | | ✓ |
| Leave it | Todo | |

## Legacy release (CI-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Full revert | Remove the parameter and the `when` | |
| Flip default to true | Keep the parameter as a kill switch | ✓ |

**Legacy fixes before release (multi):** IN-03/04/05, build toast `undefined`, `deviceBuilds.push` throw,
log-overlay `{init}`: all selected.

| Option (IN-05) | Description | Selected |
|--------|-------------|----------|
| Restore `goals.length > 0` | Match the sibling handlers | ✓ |
| Relax all handlers | | |

| Option (verification) | Description | Selected |
|--------|-------------|----------|
| Unit + live UAT | | |
| Unit only | Local tests plus the standard `console-retest` | ✓ |

## Ledger scope & Phase 44 nits

**Phase 44 nits fixed (multi):** `.alert-danger` contrast, view-toggle aria-labels, focusable warning tips,
sort order and row ids: all selected.

| Option (View-log limits) | Description | Selected |
|--------|-------------|----------|
| Defer to ledger | | ✓ |
| Refresh after Build only | | |

| Option (IN-08 depth) | Description | Selected |
|--------|-------------|----------|
| The review's named cases | | ✓ |
| Minimal + defer | | |

| Option (ledger location) | Description | Selected |
|--------|-------------|----------|
| Update 35-REVIEW-DISPOSITION.md | | ✓ |
| New 48-FIX-LEDGER.md | | |

| Option (IN-01) | Description | Selected |
|--------|-------------|----------|
| Review's fix + caller audit | | ✓ |
| Keep `{}`, fix callers | | |

## POL-01 look & feel

| Option (account menu) | Description | Selected |
|--------|-------------|----------|
| User icon + aria-label | | ✓ |
| Keep cog, add label | | |
| Icon + owner name | | |

| Option (Build Firmware) | Description | Selected |
|--------|-------------|----------|
| Until POST /build settles | | ✓ |
| Until the build finishes | | |

| Option (Detail width) | Description | Selected |
|--------|-------------|----------|
| max-width ~1140px, left-aligned | | ✓ |
| Two-column on xl | | |
| You decide | | |

| Option (ship order) | Description | Selected |
|--------|-------------|----------|
| Vue+gate, then Legacy in one pipeline | | ✓ |
| Legacy first | | |
| You decide | | |

## Claude's Discretion

- The `App.vue` initial-route wait mechanism, the same-origin mechanism for Cypress, the JUnit reporter, and the
  executor image.
- The user icon, the colour value, the tooltip copy, and where the unit tests go.

## Deferred Ideas

- View-log paging and live refresh.
- A git history rewrite for `.env.test`, if needed.
