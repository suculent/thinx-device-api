---
status: diagnosed
trigger: CI 00-AppSpec "POST /api/login (invalid)" returns 503 service_unavailable instead of 403, deterministic on thinx-staging after Phases 15/16; root 503 at router.auth.js:287 when Owner.validate() returns false (CouchDB user-view error/hang)
created: 2026-06-07
updated: 2026-06-07
root_cause: CouchDB owners_by_username design-view query in Owner.validate() errors/times out (30s) on the first spec (view-readiness/index-build race on fresh CI test DB) -> cb(false) -> router.auth.js:287 503. v1.11 touched no auth/owner/couch/nano code; only runtime dep delta (@hapi/wreck) is off this path. Likely a pre-existing race exposed by v1.11 startup-timing shift, or coincident CI-env change.
fix: (not applied) #1 test-harness view-warmup beforeAll with retry-until-ready (safe); #2 optional Owner.validate retry-once on transient view error (needs product review). Confirm attribution via CI revert experiment.
---

# Debug: ci-login-503-couchdb

## Symptoms

- **Expected:** `POST /api/login` with invalid creds (`username:'test'`) → 403 `{"success":false,"response":"invalid_credentials"}` (router.auth.js:292).
- **Actual:** 503 `service_unavailable` (router.auth.js:287) + a 30000ms async timeout. `326 specs, 1 failure`.
- **Error path:** `Owner.validate(username, cb)` invokes `cb(false)` → router.auth.js:285-287 returns 503. Comment there: "owner.validate() passes `false` when the user DB view errors (e.g. CouchDB unavailable during a deploy)."
- **Timeline:** Pipeline **5266 GREEN** (pre-Phases 15/16, influx-fix build). Pipelines **5269 + 5270 both RED, identical** (a re-run reproduced it exactly — deterministic, NOT flaky).
- **Reproduction:** CircleCI `test` job on `thinx-staging` (commit `30ee8d17`). NOT reproducible locally — the full Jasmine suite needs Docker-provisioned `/mnt/data/conf/config.json` (absent in dev). Investigation must use CI logs (CircleCI MCP tools available: `mcp__circleci__get_build_failure_logs`, `get_latest_pipeline_status`, `get_job_test_results`) + static code/lockfile analysis.

## What changed in v1.11 (the only delta between green 5266 and red 5269)

- Phase 15: fs-finder removal — `lib/thinx/{builder,deployment,platform,repository,plugins/arduino/plugin}.js` + new `lib/thinx/finder.js`. (file-finding only; CI logs show `findAllRepositories` completing fine.)
- Phase 16: `package.json` overrides — `@hapi/wreck ^18.1.1` (only RUNTIME dep; used by simple-oauth2 in `lib/router.google.js`), `tmp ^0.2.6`, `serialize-javascript ^7.0.5` (both dev).
- **`package-lock.json` was regenerated twice** (15-04 npm install after fs-finder removal; 16-01 npm install after overrides).
- 6 spec files added/extended.
- **NO** auth / owner / CouchDB / session / nano code was touched.

## Current Focus

hypothesis: The `npm install` runs in Phases 15/16 drifted `package-lock.json` runtime transitives beyond the 3 intended overrides — bumping a dependency in the CouchDB/HTTP/DB path (e.g. `nano`, its `axios`/`http` stack, or a shared transitive) to a version that makes `Owner.validate()`'s user-directory view query hang/error at startup (the 30s timeout = a hung call). The `@hapi/wreck` bump is the secondary suspect (only deliberate runtime change).
test: Diff `package-lock.json` runtime dependency versions between the last green state (parent of `9c8e2292`, i.e. before v1.11) and current `30ee8d17`. Identify every RUNTIME (non-dev) package whose resolved version changed. Cross-reference against the CouchDB/DB/HTTP path (`lib/thinx/owner.js` Owner.validate, the nano/couchdb client, redis).
expecting: One or more unintended runtime transitive bumps in the DB/HTTP layer; OR confirmation that only @hapi/wreck changed at runtime (which would refocus on wreck's effect on startup/OAuth init).
next_action: gather initial evidence — (1) `git diff <pre-v1.11>..HEAD -- package-lock.json` filtered to runtime deps; (2) read lib/thinx/owner.js Owner.validate() to see the exact CouchDB view call and its client; (3) pull the CircleCI 5269/5270 test-job logs around app startup for any DB-client init error or unhandled rejection preceding the first spec.

## Evidence

- timestamp 2026-06-07: 5266 green / 5269+5270 red established via CircleCI MCP. Failure is a single spec; all fs-finder specs (Finder/Builder/Repository/Platform/Plugin) passed in the red runs. 503 path confirmed at router.auth.js:285-287 by reading source.

## Eliminated

- hypothesis: "flaky test" — ELIMINATED. Two independent re-runs (5269, 5270) failed identically on the same assertion. Deterministic.
- hypothesis: "v1.11 directly changed the login/auth/couch code" — ELIMINATED. `git diff 9c8e2292^..30ee8d17` shows v1.11 touched only the 6 fs-finder modules + package.json/lock + 6 specs; no auth/owner/couch/session file changed.
- hypothesis: "fs-finder removal purged a transitive (q/escape-regexp/operator-compare) that other code relied on" — ELIMINATED. Lockfile diff confirms those 3 were depended on **only by fs-finder** (pre-v1.11 lock) and are `require()`d by nothing in the repo (not declared, not imported anywhere in lib/spec/root). Their removal breaks nothing.
- hypothesis: "@hapi/wreck 18.1.0→18.1.2 bump breaks the login path" — LARGELY ELIMINATED as a *direct* cause. `Owner.validate()` queries CouchDB via `nano` (`userlib.view("users","owners_by_username")`), not wreck. wreck is used only by simple-oauth2 in `lib/router.google.js`, which is `require()`d at startup but makes NO network call at boot (client config only). So wreck is not on the startup path nor the username/password login path. (Residual: cannot 100% rule out an indirect startup-timing effect without a CI experiment.)

## Lockfile delta (decisive evidence)

`package-lock.json` runtime (non-dev) changes pre-v1.11 → HEAD — the COMPLETE runtime delta:
- `@hapi/wreck` 18.1.0 → 18.1.2 (intended override; not on the failing path)
- `fs-finder` 1.8.5 → removed (intended)
- `q` 1.0.1 → removed, `escape-regexp` 0.0.1 → removed, `operator-compare` 1.0.3 → removed (all three: fs-finder-only transitives, used by nothing else)

So v1.11 changed **no runtime code or dependency that `Owner.validate()` / the CouchDB `nano` client / the session layer depends on.**

## Resolution (root cause + proposed fix — diagnosis, NOT applied)

**Root cause:** The `owners_by_username` CouchDB **design-view query inside `Owner.validate()` errors/times out (30s)** on the FIRST spec (`00-AppSpec`) → `cb(false)` → `router.auth.js:287` returns 503 instead of 403. This is a **CouchDB view-readiness / index-build race on the fresh CI test database** — the `users` design-doc view is not yet queryable when the first request lands. The login path has **no retry/tolerance** for a transient view error, so the race surfaces as a hard 503.

**v1.11's role:** Not a code/dependency regression — v1.11 touched none of the auth/owner/CouchDB/nano/session code, and its only runtime dep change (`@hapi/wreck`) is off this path. The green(5266)→red(5269/5270) correlation is best explained by v1.11 **shifting process/startup timing** (new `finder.js` module load + 6 added spec files altering test-process timing/memory) enough to consistently LOSE a pre-existing CouchDB view-indexing race that 5266 happened to win — OR an independent CI-environment change coincident with the push. Either way the underlying fragility (no view-readiness guard in the login/test path) is pre-existing and not introduced by v1.11 code.

**Decisive confirmation experiment (requires CI — cannot run suite locally):** push a branch that reverts ONLY the v1.11 commits (or just re-runs the current HEAD a 3rd time after a CouchDB-warm delay). If reverting v1.11 → green, v1.11 timing is implicated; if still red → purely environmental/pre-existing CI CouchDB-readiness.

**Recommended fix (addresses the real fragility, independent of attribution):**
1. **Test-harness view warmup (preferred):** in the spec bootstrap (a global `beforeAll` or the CI `test` step), query the `users` views (`owners_by_username`, etc.) with retry-until-ready BEFORE the suite runs, so the index is built before `00-AppSpec` hits it. Pure test-infra change; zero product-behavior risk.
2. **Product resilience (optional, broader):** in `Owner.validate()` / the login path, retry a transient `userlib.view` error once (short backoff) before returning 503 — distinguishes "view warming up" from genuine "DB down." Changes product behavior; needs its own review + a regression spec.

Neither fix is applied here (diagnosis only): fix #1 is the safe first move, fix #2 needs a deliberate product decision. Both should be validated by a CI run, not locally.

status: diagnosed
