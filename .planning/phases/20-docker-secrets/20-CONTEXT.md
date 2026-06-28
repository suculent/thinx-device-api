# Phase 20: Docker Secrets Helper - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning
**Mode:** Authored from `.planning/inbox-tasks/418-docker-secrets-swarm.md`.

<domain>
## Phase Boundary
Add a shared `readSecret()` helper preferring `/run/secrets/<name>` over `process.env`, adopt it for the core Redis + CouchDB credentials, and wire `docker-swarm.yml`. Back-compat with `.env` is mandatory. (SEC-CFG-01, #418.) Remaining ~20 sensitive vars are deferred (SEC-CFG-02).
</domain>

<decisions>
1. New `lib/thinx/secrets.js` depends only on `fs` (no Globals) → safe to use from foundational modules without a require cycle. Caches per name.
2. Adopt in `database.js` (COUCHDB_USER/PASS) and `globals.js` redis_options (REDIS_PASSWORD) only — proves the pattern on the highest-value creds.
3. `database.js` guard switched from `typeof !== "undefined"` to truthiness (`user && pass`) because `readSecret` returns `null` (not undefined) when absent.
4. `docker-swarm.yml`: top-level `secrets:` block (external) + reference on the `api` service. Operator creates the secrets before a full `docker stack deploy`; this file is not auto-applied (Swarmpit redeploys by image), so the edit cannot break the running stack.
</decisions>

<code_context>
- `lib/thinx/globals.js:96` redis password read.
- `lib/thinx/database.js:14` COUCHDB creds.
- `docker-swarm.yml` api service env (199-200), redis (110/115).
</code_context>

<specifics>
## Acceptance
- secret file > env > default (unit-tested, mocked fs); core creds load via helper under both swarm secret and legacy .env; existing dev boot works.
</specifics>

<deferred>
- SEC-CFG-02: remaining sensitive vars (WORKER_SECRET, MAILGUN_API_KEY, SLACK_*, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, ROLLBAR_ACCESS_TOKEN, GIT_KEY_PASSPHRASE) + transformer/worker services.
</deferred>
