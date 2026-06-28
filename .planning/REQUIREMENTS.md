# Requirements: THiNX Device API — v1.12 Inbox Drawdown

**Defined:** 2026-06-28
**Core Value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on (which Vue inherited) keeps working with no signature breaks. Operational pipeline (push → CI → Swarmpit autoredeploy) stays under a 5-minute SLA.

## v1.12 Requirements

Requirements for the v1.12 Inbox Drawdown milestone. Each maps to exactly one roadmap phase. Sourced from `/gsd-inbox` triage of open GitHub issues; scoped task notes in `.planning/inbox-tasks/`.

### Security / PII

- [ ] **SEC-PII-03**: When an owner is deleted via `DELETE /api/v2/gdpr`, every owner-scoped artifact is purged across all stores by a single orchestrator: the user document, all device documents, all build documents, all RSA key files for the owner, the `deploy_path` and `repo_path` filesystem trees, and all Redis keys (`ak:<owner>` + `/<owner>/*`, deleted not 1s-expired), plus per-device MQTT credentials. The orchestrator is idempotent, reused by the scheduled `purgeOldUsers()` path, and writes a per-step audit line. Every filesystem delete is guarded by a path-prefix assertion that cannot escape `data_root/.../<owner>`. (GitHub #353, `priority`) — Acceptance: a seeded owner with devices/builds/keys/Redis/fs dirs is fully removed; `KEYS /<owner>/*` + `ak:<owner>` return empty immediately; a crafted owner id cannot delete outside the owner subtree; the previously-skipped delete spec is un-skipped.

### GitHub Integration

- [ ] **GH-01**: A logged-in user can submit a GitHub access token to an authenticated endpoint (using the session owner, not a hardcoded test owner). The token is validated against GitHub (`GET /user/keys`) before anything is stored; on failure the call returns 401 and stores nothing. On success the token is persisted on the caller's user document via `owner.addGitHubAccessToken()`. The stored token is never returned in any API response or profile payload. (GitHub #392) — Acceptance: valid token → stored; invalid token → 401, not stored; token absent from all GET/profile responses.
- [ ] **GH-02**: On a successful token link, if the user has no RSA key one is created automatically (`rsakey.create`), and the user's public key is pushed to their GitHub account (`POST /user/keys`), treating 201 (created) and 422 (already exists) as success. (GitHub #392) — Acceptance: a user with no keys ends up with a key created and pushed; a user with an existing key has it pushed without duplication error. Tests mock the GitHub API (no live calls) to avoid worsening the known `GitHubSpec` flakiness.

### Security / Configuration

- [ ] **SEC-CFG-01**: A shared `readSecret(name, default)` helper resolves `/run/secrets/<name>` with precedence over `process.env[name]`, falling back to env (back-compat) then the default; results are cached. It is adopted for the core credentials — Redis password (`lib/thinx/globals.js`) and CouchDB user/pass (`lib/thinx/database.js`) — and `docker-swarm.yml` declares a top-level `secrets:` block and references those secrets on the relevant services. Existing `.env`-based local/dev boot continues to work unchanged. (GitHub #418) — Acceptance: helper returns secret-file value when present, else env, else default (unit-tested with mocked fs); core creds load via the helper under both a swarm secret and the legacy `.env` path.

## Future Requirements

Acknowledged and deferred — candidates not in the v1.12 roadmap.

### GitHub Integration — Deferred

- **GH-03 (console UI)**: Vue console Profile screen to enter / replace / clear the GitHub token (masked), surfacing link status. Owned by the `services/console` submodule's own GSD project (`services/console/.planning/`) per standing scope boundary — not this repo's milestone.

### Security / Configuration — Deferred

- **SEC-CFG-02 (full sweep)**: Extend `readSecret()` adoption to the remaining ~20 sensitive env vars (WORKER_SECRET, MAILGUN_API_KEY, SLACK_*, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, ROLLBAR_ACCESS_TOKEN, GIT_KEY_PASSPHRASE) and the transformer/worker services. Deferred to keep v1.12 shippable; core creds first proves the pattern.

### Carried from v1.11 (4×-deferred — keep/drop call still pending)

- **TEST-CHAI-01** — chai-http v5 ESM migration (locked per `AGENTS.md`).
- **OPS-02 / OPS-03** — pure swarm-side OPS, orthogonal to this codebase.
- **uuid #194** — `deferred-dev-only` (transitive `uuid@8` in nyc/jest-junit).

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Vue console Profile GitHub-token UI | `services/console` submodule frontend work; owned by the console submodule's GSD project. Tracked as deferred GH-03. |
| Full process.env → readSecret sweep (all ~145 sites) | v1.12 ships the helper + core creds only; remaining sites tracked as SEC-CFG-02. |
| GitHub deploy-key deletion on GDPR purge | Depends on per-user token (GH-01) landing first; cross-feature coupling deferred until both stabilize. Noted in #353 task. |
| CI CouchDB 503 / deploy of v1.11 Phases 15/16 | Operator/infra follow-on, not v1.12 feature scope. |
| Multi-tenant revamp / v2 API features | Future major milestone, not v1.x. |

## Traceability

Filled by the roadmap (each REQ → exactly one phase).

| REQ-ID | Phase |
|--------|-------|
| SEC-PII-03 | — |
| GH-01 | — |
| GH-02 | — |
| SEC-CFG-01 | — |
