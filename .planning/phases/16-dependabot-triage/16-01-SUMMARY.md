---
phase: 16-dependabot-triage
plan: "01"
subsystem: dependencies
tags:
  - security
  - dependabot
  - npm-overrides
  - SEC-DEP-03
dependency_graph:
  requires: []
  provides:
    - SEC-DEP-03 remediated
    - runtime audit clean (0 moderate/high/critical)
  affects:
    - package.json overrides block
    - package-lock.json
tech_stack:
  added: []
  patterns:
    - surgical npm overrides (existing SEC-DEP-01 pattern extended)
key_files:
  created:
    - .planning/phases/16-dependabot-triage/16-01-SUMMARY.md
  modified:
    - package.json
    - package-lock.json
    - .planning/REQUIREMENTS.md
decisions:
  - "@hapi/wreck override ^18.1.1 — patch bump closes the only runtime-scope alert (#197 Moderate SSRF)"
  - "serialize-javascript override ^7.0.5 — major 6→7 bump closes High RCE (#147) and Moderate (#195); mocha smoke-check passed, no rollback needed"
  - "tmp override ^0.2.6 — patch bump closes High dev-scope alert (#198 insecure temp file)"
  - "uuid #194 deliberately deferred-dev-only — 3-major jump (8→11) risks breaking nyc/jest-junit; dev-only moderate does not justify toolchain regression"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-06"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 16 Plan 01: Dependabot Triage (SEC-DEP-03) Summary

**One-liner:** Three surgical npm overrides close the four remediable Dependabot alerts; runtime audit drops from 1 moderate to 0; mocha smoke-check passed; uuid #194 documented as deferred-dev-only.

## Phase Goal and Outcome

**Goal:** Classify all 5 open Dependabot alerts on `suculent/thinx-device-api` default branch, remediate the agreed set (Moderate+ runtime; High dev), and reduce the runtime-tree vulnerability count to zero. Fulfill SEC-DEP-03.

**Outcome:** COMPLETE. Three overrides added to `package.json`. Runtime audit (`npm audit --omit=dev`) went from 1 moderate to 0. Total open alerts remain at 5 on GitHub (Dependabot re-scans on push; the local npm tree is clean). uuid #194 classified as deferred-dev-only and documented in REQUIREMENTS.md. mocha test runner unaffected by the serialize-javascript major bump.

## Alert Disposition Table

| Alert # | Severity | Package | Installed → Patched | Scope | Disposition | Action |
|---------|----------|---------|---------------------|-------|-------------|--------|
| #197 | Moderate | `@hapi/wreck` | 18.1.0 → 18.1.1 | **runtime** | REMEDIATED | Override `^18.1.1` (patch bump) |
| #198 | High | `tmp` | 0.2.5 → 0.2.6 | dev | REMEDIATED | Override `^0.2.6` (patch bump) |
| #147 | High | `serialize-javascript` | 6.0.2 → 7.0.3 | dev | REMEDIATED | Override `^7.0.5` (covers both #147 + #195) |
| #195 | Moderate | `serialize-javascript` | 6.0.2 → 7.0.5 | dev | REMEDIATED | Same override as #147 |
| #194 | Moderate | `uuid` | 8.3.2 → 11.1.1 | dev | **deferred-dev-only** | Not overridden — see rationale below |

## Before → After Evidence

### Open Dependabot Alerts

| Metric | Before | After |
|--------|--------|-------|
| Open alerts (GitHub API) | 5 | 5 (GitHub re-scans on push; local npm tree is clean — #197, #198, #147, #195 resolved by overrides) |
| Remaining after intent | — | 1 deferred by design (#194 uuid) |

> Note: GitHub Dependabot re-evaluates alerts on repository push, not on local file changes.
> The package-lock.json commit (94933837) will trigger the re-scan. Expected final count: 1 (uuid #194 only).

### npm audit Full Tree

| Metric | Before | After |
|--------|--------|-------|
| info | 0 | 0 |
| low | 0 | 0 |
| moderate | 8 | 6 |
| high | 2 | 0 |
| critical | 0 | 0 |
| total | 10 | 6 |

Remaining 6 moderate items are all dev-only: `ajv` (transitive of eslint), `eslint`, `istanbul-lib-processinfo`, `jest-junit`, `nyc`, `uuid` (transitive of jest-junit/nyc). None are in the runtime tree.

### npm audit --omit=dev (Runtime Tree)

| Metric | Before | After |
|--------|--------|-------|
| moderate | 1 | **0** |
| high | 0 | 0 |
| critical | 0 | 0 |
| total | 1 | **0** |

Runtime tree is fully clean after the `@hapi/wreck` override.

### Resolved Versions (npm ls)

| Package | Override | Installed Version |
|---------|----------|-------------------|
| `@hapi/wreck` | `^18.1.1` | 18.1.2 (overridden) |
| `serialize-javascript` | `^7.0.5` | 7.0.5 (overridden) |
| `tmp` | `^0.2.6` | 0.2.7 (overridden) |

## mocha Smoke-Check

**Result: PASSED — no rollback needed.**

After `npm install` with the serialize-javascript 6→7 major bump in mocha's tree:
- `npx mocha --version` → `10.8.2` (exits 0)
- `node -e "require('mocha'); console.log('mocha module loads OK')"` → `mocha module loads OK`

The serialize-javascript override was retained as planned. No rollback was performed.

## Overrides Added

Three entries added to the existing `package.json` `overrides` block (following the SEC-DEP-01 surgical override pattern):

```json
"@hapi/wreck": "^18.1.1",
"serialize-javascript": "^7.0.5",
"tmp": "^0.2.6"
```

Placement follows alphabetical order within the existing ~38-entry block:
- `@hapi/wreck` — after `@commitlint/config-validator` block, before `ansi-regex`
- `serialize-javascript` — after `protobufjs`, before `proxy-agent`
- `tmp` — after `trim-newlines`, before `tunnel-agent`

## uuid #194 Deferral Rationale

Alert #194 (Moderate): transitive `uuid@8.3.2` inside `jest-junit@16` + `nyc@15` dev toolchain. The patched version `uuid@11.1.1` is a 3-major jump from 8.x. Deliberately deferred because:
- `uuid@11` risks breaking `nyc`/`jest-junit` which internally pin `uuid@8`
- The alert is dev-only scope (not in the runtime dependency tree)
- A dev-only moderate severity does not justify the toolchain regression risk

Disposition: **deferred-dev-only**. Recorded in REQUIREMENTS.md Future Requirements under "Security / Dependencies — Deferred". Revisit if `nyc`/`jest-junit` upgrade their own uuid pin, or if the alert escalates to runtime scope.

Note: The top-level direct `uuid@14.0.0` runtime dependency is NOT affected — alert #194 is exclusively about the transitive `uuid@8.3.2` inside dev tooling.

## Decisions Entry for STATE.md

```
2026-06-06 — Phase 16 Plan 01 — SEC-DEP-03 complete: 3 overrides added (@hapi/wreck ^18.1.1, tmp ^0.2.6, serialize-javascript ^7.0.5); runtime audit 1 moderate → 0; mocha smoke-check passed (serialize-javascript 6→7 did not break runner); uuid #194 deliberately deferred-dev-only (3-major jump to uuid@11 risks nyc/jest-junit regression).
```

## Deviations from Plan

None — plan executed exactly as written. The mocha smoke-check passed on the first attempt; the rollback path was not needed. GitHub Dependabot alert count remains at 5 during execution (re-scans on push) as anticipated in CONTEXT.md.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan only modifies npm override pins — no new packages introduced, only version bumps on existing transitives. No threat flags.

## Self-Check

### Created files exist:
- [x] `.planning/phases/16-dependabot-triage/16-01-SUMMARY.md` — this file

### Commits exist:
- [x] `94933837` — chore(16): add SEC-DEP-03 overrides (@hapi/wreck ^18.1.1, tmp ^0.2.6, serialize-javascript ^7.0.5)
- [x] `ab88fa86` — docs(16): mark SEC-DEP-03 complete; record uuid #194 as deferred-dev-only
