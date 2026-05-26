# Dependency Triage — Phase 4 (SEC-DEP-01)

Baseline captured: 2026-05-26 (commit SHA inserted at slice close)

Scope: All open Dependabot alerts against `suculent/thinx-device-api` as of slice-open time.

## Triage table

| Alert URL | Package | GHSA ID | Severity | Scope | Direct/Transitive | Vuln range / installed | Verdict | Rationale | Future trigger |
|-----------|---------|---------|----------|-------|-------------------|------------------------|---------|-----------|----------------|

## Fix log

| Commit SHA | Files changed | Override delta | Alerts closed (GHSA IDs) | Verification |
|------------|---------------|----------------|---------------------------|--------------|

## Post-fix baseline

### Captured at

_(filled in by Slice 3)_

### Metric snapshot

| Metric | Value |
|--------|-------|

### Deferred alerts (open by design)

_(filled in by Slice 3 — list of GHSA IDs that remain open with rationale class)_

### Artifact references

- `.planning/phases/04-dependency-triage/04-AUDIT-PRE.json` (pre-fix full tree)
- `.planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json` (pre-fix runtime tree)
- `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (pre-fix Dependabot enumeration)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST.json` (placeholder — filled by Slice 3)
- `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROD.json` (placeholder)
- `.planning/phases/04-dependency-triage/04-DEPENDABOT-POST.json` (placeholder)

## Rationale taxonomy (closed set)

- `dev-only-scope` — Package is in `devDependencies` AND production Docker image is built with `npm install --omit=dev` (Dockerfile L86). No production exploit surface.
- `stale-alert` — Live `package-lock.json` resolves to a version beyond the alert's `vulnerable_version_range`. Alert will auto-dismiss after next Dependabot scan; may be manually dismissed via UI.
- `chai-http-lock` — Fix would require bumping chai-http to v5 (ESM-only); blocked per AGENTS.md L82-92. Reserved for future; no 2026-05-26 alert triggers this class.
- `transitive-uncontrollable` — Vulnerable transitive cannot be overridden without breaking the parent (e.g., parent has hard peer dep on vulnerable range). Rare; none in current set.
- `low-severity-high-cost` — Low or medium severity AND fix cost would be HIGH (lib/ changes or major-version bumps). None in current set.
- `mitigated-by-config` — Vulnerable surface is gated by configuration not enabled in production (e.g., a feature flag is off). Requires explicit documented config check. None in current set.

## Verdict enum (closed set)

- `blocker`
- `deferred-stale`
- `deferred-dev-only`
- `deferred-locked`
- `deferred-cost`
- `deferred-low-sev`

Note: Every row in Section 1 MUST have its Verdict column drawn from this set, and every `deferred-*` row MUST cite exactly one class from Section 4 (Rationale taxonomy) in its Rationale column.
