# Phase 5 Context: Backend Hygiene — Cheap Sweeps

**Created:** 2026-06-02
**Milestone:** v1.9 — Backend Hygiene & Posture
**Requirements:** REFACTOR-01, REFACTOR-02, REFACTOR-05

## Domain

Land three low-blast-radius hygiene fixes that clean up structural debt in `thinx-core.js` and `lib/thinx/owner.js` plus `package.json`, with zero observable behavior change on any public route the legacy AngularJS / Vue console relies on.

In scope: trust-proxy dedup, strict-equality fix inside `password_reset`, jshint reclassification.
Out of scope (deferred): full `fs-finder` removal from `lib/` — see Decisions.

## Canonical Refs

These docs MUST be consulted by downstream agents (researcher, planner, executor) before touching code:

- `.planning/ROADMAP.md` — Phase 5 success criteria (lines 36–45) and dependency notes
- `.planning/REQUIREMENTS.md` — REFACTOR-01 (line 12), REFACTOR-02 (line 14), REFACTOR-05 (line 20) — full validation criteria
- `.planning/PROJECT.md` — compatibility constraint (no signature breaks on legacy-console-compatible routes)
- `.planning/STATE.md` — current milestone state, recent quick tasks
- `AGENTS.md` (parent root) — deploy flow (push → CI → Swarmpit autoredeploy ≤5min SLA), dependency lock rationale
- `Dockerfile` — production image build uses `npm install --omit=dev` (relevant for REFACTOR-05 validation)
- `.planning/codebase/STACK.md` — current dependency posture
- `.planning/codebase/STRUCTURE.md` — module layout reference for `lib/thinx/`

## Code Context

### REFACTOR-01 — trust proxy duplicate
- `thinx-core.js:300` — `app.set("trust proxy", 1)` (number-of-proxies form)
- `thinx-core.js:422` — `app.set('trust proxy', ['loopback', '127.0.0.1'])` (allowlist form, currently wins because it executes after)
- Note: roadmap referenced lines `:285` and `:407` — the actual current lines are `:300` and `:422` (file drift since requirements were written)

### REFACTOR-02 — strict equality in `password_reset`
- `lib/thinx/owner.js:492` — `if (reset_key != user_reset_key)` — the one `!=` inside `password_reset` (the method spans roughly `:455–500`)
- Note: roadmap referenced line `:476` — actual line is `:492` (file drift)
- Other non-strict comparisons exist in `owner.js` (`:277`, `:515`, `:572`) but are OUTSIDE `password_reset` and OUT OF SCOPE for Phase 5

### REFACTOR-05 — jshint + fs-finder reclassification
- `package.json:55` — `fs-finder: github:suculent/Node-FsFinder#master` (in `dependencies`)
- `package.json:59` — `jshint: ^2.13.4` (in `dependencies`)
- `Dockerfile:~86` — production install uses `npm install --omit=dev` (devDeps not installed in prod image)
- `jshint` usage: ZERO `require('jshint')` in `lib/` or `thinx-core.js` — safe to reclassify
- `fs-finder` usage: FIVE active call sites in `lib/`:
  - `lib/thinx/builder.js:17` (uses `finder.from()` + `finder.in()` for header/env/yml lookups at `:837/:943/:949/:955`)
  - `lib/thinx/deployment.js:10` (uses `finder.in().findFiles()` at `:301/:315`)
  - `lib/thinx/platform.js:1` (uses `finder.from().findFiles('thinx.yml')` at `:47`)
  - `lib/thinx/repository.js:7` (uses `finder.from().showSystemFiles().findDirectories('.git')` at `:29`)
  - `lib/thinx/plugins/arduino/plugin.js:7` (uses `finder.from().findFiles('*.ino')` at `:15`)

## Decisions

### REFACTOR-01 — trust proxy: keep the allowlist
- **Decision:** Remove the earlier `app.set("trust proxy", 1)` at `thinx-core.js:300`. Keep the later `app.set('trust proxy', ['loopback', '127.0.0.1'])` at `:422` as the canonical single source.
- **Rationale:** The later call currently wins (executes after the earlier one), so this is the value the system has been running with. Keeping it preserves observed behavior by definition — matches the "no change to observed IP-derivation behavior" guardrail in the requirement. Also more accurate for the swarm topology (app sits behind Traefik on loopback).
- **Action:** Delete the line at `:300`. Add a comment near `:422` explaining intent ("single source of truth for trust-proxy; allowlist form chosen because Traefik fronts the app on loopback in the swarm topology").
- **Validation:** `grep -n "trust proxy" thinx-core.js` returns exactly one canonical call. Jasmine session/auth specs green. Production smoke (login + device API call from a known-IP browser) resolves correct `req.ip`.

### REFACTOR-02 — strict equality at owner.js:492
- **Decision:** Replace `reset_key != user_reset_key` with `reset_key !== user_reset_key` at `lib/thinx/owner.js:492`. Scope is **only** the `password_reset` method.
- **Rationale:** The phase requirement (REFACTOR-02) explicitly scopes the fix to `password_reset`. Other non-strict comparisons in `owner.js` (`:277`, `:515`, `:572`) are out of Phase 5 scope — they're cleanup candidates for a future sweep but not part of this requirement.
- **Risk:** `reset_key` arrives as a query/body string; `user_reset_key` is stored in CouchDB as a string. The `!=` was masking a string/number coercion case that should not occur with current API entry points (callers in `router.auth.js` pass `req.body.reset_key` / `req.query.reset_key` — already strings). Add a unit covering the string-vs-number coercion case the `!=` was implicitly accepting.
- **Validation:** Grep inside `password_reset` shows zero `!=`/`==`. Existing `ZZ-AppSessionUserSpec.js` reset_key flow green. New unit confirms `!==` behavior for string vs. number reset_key inputs.

### REFACTOR-05 — jshint reclassification only; fs-finder stays
- **Decision:** Phase 5 scope is REDUCED to `jshint` reclassification only. `fs-finder` STAYS in `dependencies` with a written rationale.
- **Rationale:** REFACTOR-05's literal success criterion ("zero `require('fs-finder')` in `lib/`") would require rewriting 5 runtime modules (builder/deploy/repo/platform/plugin paths) — that is NOT a cheap sweep. The phase name is "Cheap Sweeps" and the milestone goal is "low-risk, isolated cleanups". The `fs-finder` fork at `github:suculent/Node-FsFinder#master` is internally owned (not a supply-chain risk from external npm) and works at runtime — moving it to devDeps would break production immediately.
- **Action:**
  1. Move `jshint` from `dependencies` to `devDependencies` in `package.json`.
  2. Keep `fs-finder` in `dependencies` — unchanged.
  3. Add a note to REFACTOR-05's tracking entry (and/or the deferred backlog) explaining: "fs-finder runtime usage in 5 lib/ modules deferred to a future phase (proposed: a v1.10 'fs-finder removal' phase that replaces with fs-extra glob + native fs.readdir recursion); accepted as-is in v1.9 because fork is internally owned (suculent/Node-FsFinder#master) and not a supply-chain exposure."
- **Validation (adjusted for Phase 5):**
  - `grep -rE "require\\(['\"]jshint['\"]\\)" lib/ thinx-core.js` returns zero hits (already true today)
  - `package.json` shows `jshint` under `devDependencies`, NOT `dependencies`
  - `package.json` still shows `fs-finder` under `dependencies` (intentional deferral, documented)
  - Production Docker image (`npm install --omit=dev`) still builds, starts, and logs `Server up at`
  - CircleCI green on the merge to `thinx-staging`; Swarmpit autoredeploy completes within 5-minute SLA

### Phase 5 scope amendment summary
- REFACTOR-01: full scope — trust-proxy dedup ✓
- REFACTOR-02: full scope — strict equality fix at line 492 ✓
- REFACTOR-05: REDUCED scope — jshint only; fs-finder portion deferred with documented rationale
- The roadmap success-criterion 3 ("`jshint` AND `fs-finder` are declared in `devDependencies`") needs to be amended OR the criterion is partially accepted with a recorded exception. Planner should produce a small ROADMAP.md edit to reflect this scope reduction.

## Deferred Ideas (captured, NOT in scope)

- **fs-finder removal sweep** — replace `finder.from()`/`finder.in()` calls in builder.js, deployment.js, platform.js, repository.js, plugins/arduino/plugin.js with `fs-extra` (already a dep) glob helpers or native `fs.promises.readdir` recursion. Touches build/deploy paths so warrants its own phase. Propose in v1.10 backlog.
- **owner.js full strict-equality sweep** — clean up `!=`/`==` at `:277`, `:515`, `:572` (outside `password_reset`). Adjacent to REFACTOR-04's owner.js async/await sweep in Phase 7 — could fold into that phase or stand alone.
- **package.json audit** — `path` (`^0.12.7`) is a userland duplicate of Node's built-in `path` module and is `require('path')`d at `thinx-core.js:302` as a no-op. Likely safe to remove from `dependencies`. Out of Phase 5 scope but flag for the v1.10 hygiene backlog.

## Open Questions for Researcher / Planner

- Should the REFACTOR-05 scope amendment be reflected via a ROADMAP.md edit, an inline note in the phase plan, or a new "scope deviation" entry in STATE.md? Planner should choose during plan-phase.
- Is there a single combined commit that touches `thinx-core.js`, `lib/thinx/owner.js`, AND `package.json`, or should each requirement land as its own atomic commit? Recommendation: three atomic commits (one per REFACTOR-NN) to keep blast radius isolated and rollback surgical — but planner has final say.

## Constraints

- No signature break on any public route the legacy AngularJS console (which Vue inherited) depends on
- All commits GPG-signed unless a per-session unsigned authorization is granted
- Production image must reach `Server up at` log line after the change (REFACTOR-05 validation gate)
- Swarmpit autoredeploy must complete within the 5-minute SLA after merge to `thinx-staging`
