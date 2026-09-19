# Task: Support Docker Secrets in Swarm mode (#418)

**Type:** enhancement · **Effort:** M · **Risk:** medium (touches credential
loading swarm-wide) · **Priority:** relevant to current swarm deployment work

## Current state (verified)
- ~145 `process.env.*` reads across the codebase (≈161 incl. specs).
- Central config singleton: `lib/thinx/globals.js` (11 env reads) — the natural
  integration point. Other hotspots: `thinx-core.js`, `messenger.js`,
  `owner.js`, `database.js`, `queue.js`, `router.github.js`, `router.slack.js`,
  `services/transformer/*`, `services/worker/class.js`.
- **No** `/run/secrets` handling anywhere; **no** `secrets:` blocks in
  `docker-compose.yml` or `docker-swarm.yml`. Secrets currently flow via `.env`
  → `environment:` (anti-pattern).

## Goal
Add a shared helper that prefers a Docker secret file
`/run/secrets/<name>` over `process.env.<name>`, with env fallback for
backward compatibility, and adopt it for sensitive variables.

## Design
New module `lib/thinx/secrets.js`:
```js
// readSecret(name, defaultValue = null)
// 1. if /run/secrets/<name> exists → return its trimmed contents
// 2. else if process.env[name] defined → return it (optionally warn: deprecated)
// 3. else → defaultValue
```
- Sync read (config runs at boot); cache results.
- Case/normalization: support lowercase secret filenames mapping to UPPER env
  names if the team prefers (decide one convention; document it).
- Import and use from `globals.js` first, then ripple outward.

## Sensitive vars to migrate (priority order)
1. **Core:** `REDIS_PASSWORD` (globals.js:97–98), `COUCHDB_USER` /
   `COUCHDB_PASSWORD` / `COUCHDB_SECRET` / `COUCHDB_COOKIE` (database.js:14–15,
   compose).
2. **Secondary:** `WORKER_SECRET` (queue.js:352–353, builder.js:216,
   transformer/trans.js:90–92), `MAILGUN_API_KEY` (owner.js:13, transfer.js),
   `SLACK_BOT_TOKEN` (messenger.js:128–148), `GITHUB_CLIENT_SECRET`
   (router.github.js:58,62), `SLACK_CLIENT_SECRET` (router.slack.js:29),
   `GOOGLE_OAUTH_SECRET` (router.google.js), `ROLLBAR_ACCESS_TOKEN`
   (globals.js:150–152), `GIT_KEY_PASSPHRASE`.
3. **Services:** transformer + worker token reads.

## Scope of changes
- Add `lib/thinx/secrets.js`.
- Refactor the reads above to `readSecret("NAME", fallback)` — start with
  Priority 1, land incrementally.
- Update `docker-swarm.yml` (primary target): add top-level `secrets:` block and
  per-service `secrets:` references; remove the migrated vars from
  `environment:`.
- Update `docker-compose.yml` similarly (or document that compose keeps env and
  only swarm uses secrets).
- Docs: secret provisioning workflow (`docker secret create ...`) and the
  env→secret precedence rule.

## Acceptance criteria
- [ ] `readSecret()` returns secret-file value when `/run/secrets/<name>` exists,
      else env value, else default; result cached.
- [ ] Priority-1 credentials (Redis + CouchDB) load via `readSecret()` and work
      both with a swarm secret and with the legacy `.env` path.
- [ ] `docker-swarm.yml` declares and references the migrated secrets; stack
      deploys and services connect using secret files (no plaintext env for
      those vars).
- [ ] Backward compatible: existing `.env`-based local/dev runs still boot.
- [ ] Helper unit-tested (file present, file absent→env, both absent→default).

## Verification
- Unit spec for `secrets.js` (mock fs for `/run/secrets`).
- Deploy `docker-swarm.yml` with `docker secret create` for Redis/CouchDB; verify
  API connects and no secret appears in `docker service inspect` env.

## Notes
- Mind `thinx_api ↔ mosquitto` co-location and the OOM/redis-client constraints
  when changing how credentials load — a bad secret read must fail loudly at
  boot, not silently retry.

## Commit(s)
- `feat(config): add readSecret helper preferring /run/secrets over env (#418)`
- `refactor(config): load redis+couchdb credentials via readSecret (#418)`
- `chore(swarm): declare and wire docker secrets for core credentials (#418)`
