# Requirements: THiNX Device API — v1.14 Backlog & Hardening Sweep

**Defined:** 2026-09-25
**Core Value:** The IoT device API stays available and trustworthy across release cycles — every public route the legacy AngularJS console relied on keeps working with no signature breaks; push → CI → Swarmpit autoredeploy stays under a 5-minute SLA.

**Research:** `.planning/research/SUMMARY.md` (+ STACK / FEATURES / ARCHITECTURE / PITFALLS)

## v1.14 Requirements

### CI & SAST

- [ ] **CI-01**: CodeQL analysis runs on push to `main` and `thinx-staging` and on PRs to `main`, using `github/codeql-action@v4` + `actions/checkout@v7` (`javascript-typescript`, `build-mode: none`); the check is non-required and GitHub default setup stays off
- [x] **CI-02**: Every CircleCI login to `registry.thinx.cloud:5000` goes through the retrying `registry-login` command (including the test job at `.circleci/config.yml:~767`); no login passes the password on the command line
- [ ] **CI-03**: The Vue console footer links point at the Vue console host in the live bundle (`VUE_WEB_HOSTNAME` verified end to end); the dead runtime `VUE_APP_CONSOLE_HOSTNAME` env is removed from `docker-swarm.yml`

### Build Pipeline Sinks

- [ ] **SEC-EXEC-01**: `lib/thinx/git.js` runs git via argv (`execFileSync("git", …)`), with no shell string and no `ssh-agent sh -c` wrapper; SSH auth uses a constant `GIT_SSH_COMMAND` + askpass with `GIT_KEY_PASSPHRASE` passed explicitly; stderr is captured so success detection is unchanged; a private-repo build succeeds in production
- [ ] **SEC-EXEC-02**: The remote-builder command (`builder.js:~944`) runs via argv, and the `shell-escape` dependency is removed
- [ ] **SEC-PATH-01**: Every builder read/write of a repo-controlled file (incl. `thinx.yml` write-back) is contained by `realpath` + `path.relative` and refuses symlinks; `device.owner` / `device.udid` are sanitized before building `BUILD_PATH`
- [ ] **SEC-PATH-02**: Firmware repositories are cloned with `core.symlinks=false`

### Secrets

- [ ] **SEC-CFG-02**: The 9 credentials read in `lib/` load through `readSecret()` with env fallback kept and null-safe guards (`readSecret` returns `null`); each is provisioned as a swarm secret one service at a time (not via `restart.sh`), plus a new `CSRF_SECRET`; `docker-swarm.yml` mirrors the stack (incl. its stale api image reference)

### CSRF

- [ ] **SEC-CSRF-02** (WR-06): The CSRF token is HMAC-signed and bound to the session id; the priming GET creates a short-TTL pre-session; a stale/invalid token is re-minted rather than echoed; the key comes from `CSRF_SECRET` (HKDF-from-session-secret fallback, fail closed, never random); a `CSRF_MODE` (legacy|signed) switch allows rollback independently of `CSRF_ENFORCE`; the wire contract (`XSRF-TOKEN` / `X-XSRF-TOKEN` / `…/csrf-token` / `csrf_token_invalid`) is unchanged
- [ ] **SEC-CSRF-03**: The session id is regenerated at every interactive login (password, token login, Google, GitHub) but not on the per-request Bearer bridge; the login response sets the new `XSRF-TOKEN`; logout clears it
- [ ] **SEC-CSRF-04** (WR-04): `POST /api/v2/user` requires a valid CSRF token (no machine-client exemption); the priming contract is documented in OpenAPI
- [ ] **SEC-CSRF-05**: Cookie-authenticated mutation routes (`DELETE /api/v2/user`, `POST /api/user/delete`, `/api/gdpr/revoke`, `/api/v2/profile`) require the CSRF token; Bearer / API-key requests stay exempt
- [ ] **SEC-CSRF-06**: Under enforcement, cold login on both consoles, Google and GitHub OAuth, a forced `thinx_api` redeploy mid-session, and the classic register / forgot-password / reset-confirm flows all work

### Console Edge

- [ ] **SEC-CSP-03**: The gluster `/mnt/gluster/deployment/swarm/console/default.conf` is the canonical console header config, hardened with `Referrer-Policy`, `Permissions-Policy` and `X-Permitted-Cross-Domain-Policies: none`; each console host emits exactly one CSP header
- [ ] **SEC-CSP-04**: Both image `default.conf` files (classic + Vue) and the `.planning/runbooks/swarm-configs/` snapshots mirror the gluster headers; a normalising parity script confirms it

### Log Paging

- [ ] **LOG-01**: CouchDB design docs are upserted idempotently (rev-aware) at boot, so view changes reach production; new views live in a new design doc (`_design/logs` untouched)
- [ ] **LOG-02**: The legacy no-param audit-log call keeps its response shape and 200-item cap but returns the caller's own newest 200 entries with their real `flags` (owner-keyed view)
- [ ] **LOG-03**: A Vue Console user can page through the audit log beyond 200 entries (opt-in `limit` / `cursor`; response keeps `response` as an array and adds `paging: {limit, has_more, next_cursor}`; cursor never carries the owner)
- [ ] **LOG-04**: A Vue Console user can page through the build list; the paged path has no prune side effect; the console submodule pointer is bumped and deployed

### Ops — InfluxDB

- [ ] **OPS-INFLUX-01**: `thinx_influxdb` runs InfluxDB 2 in production, upgraded from a verified backup, with existing `stats` data migrated
- [ ] **OPS-INFLUX-02**: `lib/thinx/influx.js` reads and writes against InfluxDB 2 and the dashboard / Visits statistics still render; CI runs the influx specs against InfluxDB 2
- [ ] **OPS-INFLUX-03**: `stats` data has a finite 90-day retention (bucket retention)

### Ops — Swarmpit

- [ ] **OPS-SWARM-01**: Swarmpit runs 1.10 in production and registry-triggered autoredeploy still completes within the 5-minute SLA
- [ ] **OPS-SWARM-02**: Swarmpit stats are disabled and `swarmpit_influxdb` is removed (the `swarmpit/influxdb.conf` file `thinx_influxdb` mounts is preserved or re-homed); autoredeploy verified by a test push
- [ ] **OPS-SWARM-03**: `swarmpit_agent` is removed; autoredeploy verified by a test push; `swarmpit_db` untouched

## Future Requirements

- **SEC-CFG-03**: Remove env-var fallbacks for swept secrets (`WORKER_SECRET` waits on the worker repo)
- **SEC-CFG-04**: Move `config.json`-held secrets (session secret, JWT material) and host scripts to swarm secrets
- **SEC-CSP-02**: `unsafe-eval` removal — blocked on AngularJS console retirement
- **SEC-CSP-05**: Retire the gluster bind mount so images own the console headers
- **SEC-CSRF-07**: `__Host-` cookie prefix / cookie rename
- TEST-CHAI-01, OPS-02, OPS-03, `uuid #194` — carried deferrals

## Out of Scope

| Feature | Reason |
|---------|--------|
| CSRF exemption for machine clients | Decided 2026-09-25: registrants must prime the token |
| `saveUninitialized: true` | Creates a Redis session per anonymous hit; the pre-session is created only by the priming GET |
| Editing `_design/logs` in place | Forces a full re-index of the view the retention cron relies on |
| `skip` paging / `total_rows` | Slow on large views; `has_more` suffices |
| Replacing Swarmpit (shepherd / webhook) | v1.14 trims and upgrades it; replacement is a later decision |
| Upgrading `swarmpit_influxdb` to v2 | It is being removed (OPS-SWARM-02) |
| `csrf-csrf` / `csurf` libraries | ~30 lines of `node:crypto` suffice; csurf is deprecated |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CI-01 | Phase 22 | Pending |
| CI-02 | Phase 22 | Complete |
| CI-03 | Phase 22 | Pending |
| SEC-EXEC-01 | Phase 23 | Pending |
| SEC-EXEC-02 | Phase 23 | Pending |
| SEC-PATH-01 | Phase 23 | Pending |
| SEC-PATH-02 | Phase 23 | Pending |
| SEC-CFG-02 | Phase 24 | Pending |
| SEC-CSRF-02 | Phase 25 | Pending |
| SEC-CSRF-03 | Phase 25 | Pending |
| SEC-CSRF-04 | Phase 25 | Pending |
| SEC-CSRF-05 | Phase 25 | Pending |
| SEC-CSRF-06 | Phase 25 | Pending |
| SEC-CSP-03 | Phase 25 | Pending |
| SEC-CSP-04 | Phase 25 | Pending |
| LOG-01 | Phase 26 | Pending |
| LOG-02 | Phase 26 | Pending |
| LOG-03 | Phase 26 | Pending |
| LOG-04 | Phase 26 | Pending |
| OPS-INFLUX-01 | Phase 27 | Pending |
| OPS-INFLUX-02 | Phase 27 | Pending |
| OPS-INFLUX-03 | Phase 27 | Pending |
| OPS-SWARM-01 | Phase 28 | Pending |
| OPS-SWARM-02 | Phase 28 | Pending |
| OPS-SWARM-03 | Phase 28 | Pending |

**Coverage:**

- v1.14 requirements: 25 total
- Mapped to phases: 25 (Phases 22–28)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-25*
*Last updated: 2026-09-25 after roadmap creation (traceability mapped to Phases 22–28)*
