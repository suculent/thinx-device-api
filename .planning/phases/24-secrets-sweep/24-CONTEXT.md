# Phase 24: Secrets Sweep - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Every credential the API reads in `lib/` can come from a Docker swarm secret in production, the
migration causes no outage, and `CSRF_SECRET` exists for Phase 25 (SEC-CFG-02).

In scope:
- the 9 `lib/` credentials: `SLACK_BOT_TOKEN`, `SLACK_CLIENT_SECRET`, `SLACK_WEBHOOK`,
  `GITHUB_CLIENT_SECRET`, `GOOGLE_OAUTH_SECRET`, `MAILGUN_API_KEY`, the Rollbar server token,
  `WORKER_SECRET` and `GIT_KEY_PASSPHRASE`
- their production provisioning as swarm secrets on `thinx_api`, `thinx_worker` and
  `thinx_transformer`
- a new `CSRF_SECRET`
- `docker-swarm.yml` mirroring the live stack

Out of scope:
- removing the env fallbacks (SEC-CFG-03)
- `config.json` secrets and mounting the existing DB/Redis secrets (SEC-CFG-04)
- the Rollbar console/client token (pending todo)
- using `CSRF_SECRET` (Phase 25)

</domain>

<decisions>
## Implementation Decisions

### Code & null safety
- **D-01:** Call `readSecret(name)` at each use site, following the existing
  `lib/thinx/git.js` / `database.js` / `globals.js` pattern. No central secrets-config module.
- **D-02:** A credential with no secret file and no env var turns its integration off. The code
  logs one info line naming the integration, never the value, and must not initialise a client
  with `null`/`undefined`. Specs cover the "both absent" case for every integration.
- **D-03:** Rollbar, server half only. API, worker and transformer read
  `readSecret("ROLLBAR_SERVER_TOKEN")`, falling back to `readSecret("ROLLBAR_ACCESS_TOKEN")`.
  The console/client half (`ROLLBAR_CLIENT_TOKEN`, a new `post_client_item` token) stays in
  `.planning/todos/pending/2026-09-28-split-rollbar-server-and-client-tokens.md`. The worker's
  dead `ROLLBAR_TOKEN` init in `services/worker/class.js:1` is fixed as part of this (worker
  submodule commit plus pointer bump). The transformer submodule gets the same read.
- **D-04:** `lib/thinx/rsakey.js` reads `GIT_KEY_PASSPHRASE` through `readSecret` too, so it
  matches `git.js` (the 23-01 note that both must change together).

### Production rollout
- **D-05:** Services go one at a time:
  1. `thinx_api`: its 8 credentials plus `CSRF_SECRET`. `SLACK_CLIENT_SECRET` gets a secret only
     if a value exists; it is unset in prod today, so Slack OAuth stays off and the missing path
     is D-02.
  2. `thinx_worker`: `WORKER_SECRET`, `ROLLBAR_SERVER_TOKEN`.
  3. `thinx_transformer`: `ROLLBAR_SERVER_TOKEN`.
  
  Each step is a `docker service update --secret-add …` on that one service, with the
  integrations re-checked before the next. Never `restart.sh` or `docker stack deploy` (it
  resets the chronograf password; see memory swarm-stack-deploy-and-couchdb-dhi).
- **D-06:** Env vars stay in the service spec this phase. The secret file wins over env in
  `readSecret`; removing the env vars is SEC-CFG-03.
- **D-07:** Secret values come from the current service env values, with no rotation, except
  `WORKER_SECRET`. It gets a new random value because logs from before 23-02 contain it. It is
  rotated in the same change window for `thinx_api` and `thinx_worker`: create the secret, then
  update the API and the worker together so both read the new value. Because the env fallback
  still holds the old value, the secret file must win on both sides before the rotation counts.
- **D-08:** The existing but unmounted `COUCHDB_USER`/`COUCHDB_PASS`/`REDIS_PASSWORD` secrets and
  the stale 3-year-old `ROLLBAR_TOKEN` secret are out of scope. Record them; delete nothing.

### CSRF_SECRET, docker-swarm.yml, verification
- **D-09:** `CSRF_SECRET` is 32 random bytes generated on the swarm host
  (`openssl rand -hex 32 | docker secret create CSRF_SECRET -`). The value never leaves the host
  or reaches the transcript or a log. It is mounted on `thinx_api` only and is unused until
  Phase 25; verification checks that the file exists at `/run/secrets/CSRF_SECRET` (length only).
- **D-10:** `docker-swarm.yml` declares the live secrets as `external: true` and attaches them to
  the right services. It also corrects the stale api image to `${REGISTRY}/thinx/api:swarm`. No
  wider env/config re-sync.
- **D-11:** Verification is split:
  - **Automated (executor):**
    - Slack webhook notification
    - a Rollbar test item from the API (and worker/transformer if feasible)
    - worker authentication, via one real remote build
    - Mailgun, via a password-reset mail to an operator-owned address
    - `CSRF_SECRET` file present
  - **Human, once at the end:** GitHub OAuth login and Google OAuth login.
- **D-12:** Rollback is per service: `docker service update --secret-rm <name>`. Env is still
  present, so the fallback keeps working. For `WORKER_SECRET`, roll back both services together.

### Claude's Discretion
- Plan split and wave layout, as long as code lands and deploys before any `--secret-add`.
- Spec style for the "both absent" cases.
- The exact info-log wording.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/thinx/secrets.js` `readSecret(name, default)`:
  - reads `/run/secrets/<name>` first, then `process.env[name]`, then the default
  - caches per name
  - has path-containment on the name
- Already used for `REDIS_PASSWORD` (`globals.js:98`), `COUCHDB_USER`/`COUCHDB_PASS`
  (`database.js:16`) and `GIT_KEY_PASSPHRASE` (`git.js:245`).

### Established Patterns
- The integrations read `process.env` directly today:
  - `messenger.js:128/147` `SLACK_BOT_TOKEN`
  - `router.slack.js:29` `SLACK_CLIENT_SECRET`
  - `notifier.js:43/257` and `redis-health.js:44` `SLACK_WEBHOOK`
  - `router.github.js:40/44/172` `GITHUB_CLIENT_SECRET`
  - `router.google.js:29` `GOOGLE_OAUTH_SECRET`
  - `owner.js:13` and `transfer.js:12` `MAILGUN_API_KEY` (read at module load)
  - `globals.js:153-155` `ROLLBAR_ACCESS_TOKEN`
  - `queue.js:451-452` and `builder.js:309` `WORKER_SECRET`
  - `rsakey.js:28` `GIT_KEY_PASSPHRASE`
- Some of these read at module load, so the tests must be able to reset the `readSecret`
  cache or inject values.

### Integration Points
- **Live swarm (2026-09-29):**
  - `thinx_api` has env keys `COUCHDB_PASS`, `REDIS_PASSWORD`, `SLACK_BOT_TOKEN`,
    `SLACK_WEBHOOK`, `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_OAUTH_ID/SECRET`, `MAILGUN_API_KEY`,
    `ROLLBAR_ACCESS_TOKEN`, `ROLLBAR_ENVIRONMENT`, `WORKER_SECRET`, `GIT_KEY_PASSPHRASE` and
    `CSRF_ENFORCE`.
  - `thinx_worker` has `ROLLBAR_ACCESS_TOKEN`, `ROLLBAR_ENVIRONMENT` and `WORKER_SECRET`.
  - `thinx_transformer` has `ROLLBAR_ACCESS_TOKEN` and `ROLLBAR_ENVIRONMENT`.
  - None of the three mounts any secret.
- **Existing swarm secrets:** `COUCHDB_PASS`, `COUCHDB_USER`, `REDIS_PASSWORD`,
  `REGISTRY_HTTP_SECRET`, `ROLLBAR_TOKEN` (stale).
- **Submodules:**
  - `services/worker`: Rollbar init in `class.js:1` reads the unset `ROLLBAR_TOKEN`;
    `worker.js:11` reads `ROLLBAR_ACCESS_TOKEN`.
  - `services/transformer`: `app.js` Rollbar.
  - Push each submodule to its remote before the parent; see Phase 23 for push order and the
    registry/Docker Hub split.
- **Access:** ssh to `micro` must use the literal form `ssh root@188.166.23.244 -i ~/.ssh/DOKey2
  -p2020 …`, which is pre-approved (memory micro-ssh-direct-form).
- **`docker-swarm.yml`:** the api service uses `image: thinxcloud/api:latest`, which is stale;
  the live image is `${REGISTRY}/thinx/api:swarm`. There is already a top-level `secrets:` block.

</code_context>

<specifics>
## Specific Ideas

- Secret values never appear in the transcript, logs, commits or planning docs. Verify with
  SHA-256 fingerprint prefixes only, following the pattern used for the Rollbar token check on
  2026-09-28.
- The public repo must not gain hosts, keys or ssh endpoints.
- Mailgun check: send the password-reset mail to an operator-owned address, not a real
  customer's.

</specifics>

<deferred>
## Deferred Ideas

- SEC-CFG-03: remove the env fallbacks once the secrets are proven.
- SEC-CFG-04: `config.json` secrets and mounting the existing DB/Redis secrets.
- The Rollbar console/client token split: the pending todo.
- Deleting the stale `ROLLBAR_TOKEN` secret: after the server token migration is proven.

</deferred>
