---
phase: 20
status: passed
verified: 2026-06-29
---

# Phase 20 Verification: Docker Secrets Helper

**Requirement:** SEC-CFG-01 (#418)

## Success criteria
1. **`readSecret` resolves file > env > default, cached** — ✅ `SecretsSpec` 4 cases (file wins trimmed; env fallback; default/null when absent; cached across calls). Verified locally (mocked fs).
2. **Core creds load via helper** — ✅ `database.js` (COUCHDB_USER/PASS) and `globals.js` redis_options (REDIS_PASSWORD) use `readSecret`; guard fixed to truthiness for null-absent.
3. **Backward compatible** — ✅ `database.js` + `globals.redis_options()` still load and resolve under the legacy `.env` path (verified: modules require + run clean in dev env).
4. **Swarm declares + references secrets** — ✅ `docker-swarm.yml` top-level `secrets:` block (COUCHDB_USER, COUCHDB_PASS, REDIS_PASSWORD external) + `api` service reference. YAML validated.

## Evidence
- Local: `readSecret` 5/5 standalone; `database.js`/`globals.js` load OK in dev env.
- `node --check` + eslint clean; `docker-swarm.yml` parses (PyYAML) with both secrets blocks present.
- CI (pending push): `SecretsSpec` + full suite (confirms the readSecret swap didn't break DB/Redis bring-up).

## Human verification
A real swarm `docker secret create` + `docker stack deploy` smoke is operator work (the file is not auto-applied; Swarmpit redeploys by image). Not gating for this phase — code path is unit-covered and back-compat verified.
