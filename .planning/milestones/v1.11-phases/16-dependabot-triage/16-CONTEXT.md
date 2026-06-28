# Phase 16: Dependabot Triage - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — real alert data fetched via `gh api`; remediation scope decided by operator (Moderate).

<domain>
## Phase Boundary

Classify the 5 open default-branch Dependabot alerts via the established SEC-DEP taxonomy, remediate the agreed set with surgical `package.json` `overrides`, verify the dev toolchain still runs, and record a before→after rescan. Covers requirement **SEC-DEP-03**.

In scope: the 3 agreed overrides + verification + the deferred-item paper trail.
Out of scope: the `services/console` submodule's own Dependabot alerts (separate GSD project); upgrading the direct parents (mocha/karma/nyc/jest-junit) themselves; `uuid` remediation (deliberately deferred — see decisions).
</domain>

<decisions>
## Implementation Decisions

### The 5 alerts (fetched live 2026-06-06 via `gh api /repos/suculent/thinx-device-api/dependabot/alerts`)

| # | Sev | Package | Installed → Patched | Source parent | Scope | Disposition |
|---|-----|---------|---------------------|---------------|-------|-------------|
| 197 | Moderate | `@hapi/wreck` | 18.1.0 → 18.1.1 | `simple-oauth2@5.1.0` | **runtime** | **REMEDIATE** — override `^18.1.1` (patch bump, safe; the ONLY runtime alert) |
| 198 | High | `tmp` | 0.2.5 → 0.2.6 | `karma@6.4.4` | dev | **REMEDIATE** — override `^0.2.6` (patch bump, safe) |
| 147 | High | `serialize-javascript` | 6.0.2 → 7.0.3 | `mocha@10.8.2` | dev | **REMEDIATE** — override `^7.0.5` (clears this High RCE + #195; major 6→7 bump, verify mocha runs) |
| 195 | Moderate | `serialize-javascript` | 6.0.2 → 7.0.5 | `mocha@10.8.2` | dev | **REMEDIATE** — same override as #147 (`^7.0.5` covers both) |
| 194 | Moderate | `uuid` | 8.3.2 → 11.1.1 | `jest-junit@16`, `nyc@15` | dev | **DEFER** — `deferred-dev-only`; 8→11 is a 3-major jump that risks breaking `nyc`/`jest-junit` which pin uuid@8; not worth the toolchain risk for a dev-only moderate |

Note: the top-level direct `uuid@14.0.0` runtime dependency is NOT vulnerable — alert #194 is only about the transitive `uuid@8.3.2` inside dev tooling.

### Remediation scope: MODERATE (operator decision 2026-06-06)
- Add three surgical top-level `overrides` entries (following the existing SEC-DEP-01 pattern already in `package.json`):
  - `"@hapi/wreck": "^18.1.1"`
  - `"tmp": "^0.2.6"`
  - `"serialize-javascript": "^7.0.5"`
- Leave `uuid` un-overridden; document it as `deferred-dev-only` in REQUIREMENTS.md / SUMMARY.
- Do NOT add a `uuid` override even though it would clear alert #194 — the regression risk to `nyc`/`jest-junit` outweighs a dev-only moderate.

### Success metric reality check
- `npm audit --omit=dev` (runtime tree) ALREADY reports **0 high / 0 critical** before this phase — both Highs (#198 tmp, #147 serialize-javascript) are dev-scope. The one runtime issue is `@hapi/wreck` (1 moderate), which the override clears.
- So the SEC-DEP-03 metric ("reduce runtime-tree high count") starts at 0 and stays 0; the meaningful improvement is **runtime moderate 1 → 0** (wreck fixed) and **total open alerts 5 → 1** (only deferred uuid remains).
- Capture both the runtime audit (`npm audit --omit=dev`) and full audit before→after in the SUMMARY as the evidence.

### Verification (NON-NEGOTIABLE)
- After `npm install`, the major-version override on `serialize-javascript` (6→7, used by mocha) MUST be smoke-checked: confirm `npx mocha --version` runs and a trivial mocha invocation still loads — if mocha breaks, ROLL BACK the serialize-javascript override and reclassify it as deferred-dev-only (do not ship a broken test toolchain).
- Re-run `gh api` open-alert count and `npm audit` (full + `--omit=dev`) after the change; record the deltas.
- chai-http stays at v4 (AGENTS.md lock) — no override may bump it.

### Atomic commits
- One commit for the `package.json` overrides + `package-lock.json` (`chore(16): add SEC-DEP-03 overrides`), one for the SUMMARY/tracking. Planner's discretion on finer splits.
</decisions>

<code_context>
## Existing Code Insights

### Established override pattern (from SEC-DEP-01, already in package.json `overrides`)
- Top-level surgical pins like `"cookie": "1.0.2"`, `"glob": "11.1.0"`, `"path-to-regexp": "8.4.0"`. New entries follow the same shape (package → version range). The block already has ~38 entries; add 3 more alphabetically-adjacent where natural.
- `npm install` after editing regenerates `package-lock.json`; commit both.

### Verification commands
- `gh api -X GET /repos/suculent/thinx-device-api/dependabot/alerts -f state=open --paginate` — live alert list.
- `npm audit --omit=dev` — runtime-tree (the SEC-DEP-03 metric).
- `npm audit` — full tree (dev + runtime).
- `npm ls <pkg>` — confirm the override resolved (e.g. `npm ls @hapi/wreck` should show 18.1.1+).

### Precedent
- SEC-DEP-01 (v1.0 Phase 4): 4 surgical overrides, runtime high 9→0, taxonomy classification. SEC-DEP-02 (v1.9 Phase 10): introduced `deferred-vendored-asset` class for console. This phase reuses the taxonomy and the override mechanism.
</code_context>

<specifics>
## Specific Ideas

The `serialize-javascript` override is the one with real breakage risk (major bump into mocha's tree) — gate it on a mocha smoke check and roll back if it breaks, rather than shipping blind. Everything else (`@hapi/wreck`, `tmp`) is a safe patch bump.
</specifics>

<deferred>
## Deferred Ideas

- **uuid #194** — `deferred-dev-only`; revisit if `nyc`/`jest-junit` upgrade their uuid pin, or if the alert escalates to runtime scope. Record in REQUIREMENTS.md Future/deferred and SUMMARY.
- Upgrading the direct dev parents (mocha, karma, nyc, jest-junit) to versions that natively pull patched transitives — larger toolchain work, out of scope for a triage phase.
</deferred>
