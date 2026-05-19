# Testing
*Generated: 2026-05-18 | Focus: quality | Scope: services/console (Vue SPA frontend)*
> Note: This document covers testing for `services/console/`. The main backend uses Jasmine 5 + nyc (see STACK.md); its test details are not yet mapped here.

## Framework
- **Cypress 9.5.4** — E2E only, no unit test framework (no Jest/Vitest)
- Run: `npm run test` (in `vue/`) — starts dev server then runs Cypress headlessly via `start-server-and-test`

## Test File Locations

| Path | Status |
|------|--------|
| `vue/cypress/integration/` | Active |
| `src/cypress/integration/` | Legacy / dead |

Only **1 active spec file**: `vue/cypress/integration/login.spec.js`

## Custom Cypress Commands
Defined in `vue/cypress/support/commands.ts`:
- `cy.login()` — performs login flow
- `cy.saveLocalStorage()` / `cy.restoreLocalStorage()` — session persistence helpers

## Fixtures
- `vue/cypress/fixtures/thinx.json` — single fixture file with hardcoded test credentials

## Coverage
- **Zero coverage tooling** — no thresholds, no Istanbul/nyc, no coverage reports
- No unit tests for store modules (`auth.js`, `devices.js`), API client (`core/api.js`), or mixins

## Critical Gaps

### HIGH
- The active `it.only` login test has a `// TODO This is failing! Fix me!` comment with no post-click assertion — the test suite is effectively broken
- Other `it` blocks in `vue/cypress/integration/login.spec.js` reference an undefined `data` variable (fixture not imported)
- `src/cypress/integration/owner.spec.js` references undefined globals — would throw `ReferenceError` at runtime

### MED
- No E2E coverage beyond the Login page
- Two parallel Cypress directories (`vue/cypress/` and `src/cypress/`) — diverged/dead legacy tests create confusion

### LOW
- No unit tests for Vuex store modules or API client
- No component-level tests (no Vue Test Utils or similar)

## Test Run Command
```bash
cd vue && npm run test
# Uses: start-server-and-test → serves dev → runs cypress run
```
