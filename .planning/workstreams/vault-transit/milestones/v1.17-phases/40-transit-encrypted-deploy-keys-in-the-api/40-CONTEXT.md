# Phase 40: Transit-Encrypted Deploy Keys in the API - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A deploy key generated in THiNX is stored only as OpenBao Transit ciphertext (`vault:vN:…`, mode 0600 in `ssh_keys`). A keyed build decrypts it in memory and loads it into a per-attempt `ssh-agent` with `ssh-add -`. Legacy passphrase-encrypted keys keep building in the same release, with the read path chosen by file format (KEYENC-01..06).

Phase 39 is live. OpenBao 2.7.1 runs on micro, and `thinx_api` already has `BAO_ADDR`, `BAO_CACERT` (`/run/openbao/ca.pem`) and the `BAO_ROLE_ID` / `BAO_SECRET_ID` secrets. The production cut-over is therefore no longer blocked on Phase 39.

Out of scope: migrating legacy keys, removing `GIT_KEY_PASSPHRASE`, and Transit rotation/rewrap (all Phase 41). Changing port 7442 or plain MQTT is never in scope.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (milestone and Phase 39, not re-asked)
- Milestone D-01: Transit encrypts the whole private-key blob through `transit/encrypt/thinx-deploy-keys`. There is no local DEK envelope, and keys are never stored in OpenBao KV.
- Milestone D-04: dual-read, legacy passphrase keys and Transit ciphertext both accepted, until Phase 41 reports zero legacy keys.
- KEYENC-03: a new key never falls back to the passphrase.
- Phase 39: the `thinx-api` AppRole may only encrypt, decrypt and rewrap on `thinx-deploy-keys`. Its token TTL is 20 m, token_max_ttl 1 h, and the secret_id never expires. The client must renew or log in again before the 1 h hard cap. Credentials come through `readSecret()` from `/run/secrets`. TLS verifies against `BAO_CACERT` only.

### Builds during an OpenBao outage
- **D-01:** If a Transit key cannot be decrypted because OpenBao is sealed, unreachable or denying, that key is skipped with an explicit, logged reason, and the existing try-each-key loop in `lib/thinx/git.js` goes on to the owner's remaining keys, including legacy passphrase keys. An owner with a working legacy key still builds during an outage.
- **D-02:** Before giving up on a key, the client makes one quick retry, after a fresh AppRole login. Timeouts are short, so a build never hangs on OpenBao. The exact values are Claude's discretion, but they must be bounded.

### What users see on failure
- **D-03:** Key generation refused because OpenBao is unavailable returns a distinct error code, e.g. `key_service_unavailable`. Both consoles (Vue and legacy) show "Deploy keys can't be created right now, try again later." No internal detail (address, status body, token) reaches the client.
- **D-04:** A keyed build that fails because no key could be decrypted writes an explicit build-log line such as `deploy key unavailable: key service unreachable`. The build status stays the existing failure status: no new status value, no console or API change.

### Alerting
- **D-05:** The API posts to Slack once per incident: one FAILING message when it first cannot reach OpenBao (or is denied), and one RECOVERED message on the first success after that. There are no repeats in between, matching Phase 39's maintenance alerts. Use the API's existing Slack webhook (`SLACK_WEBHOOK` via `readSecret`, `lib/thinx/notifier.js`). Messages carry only the reason class, never tokens, key material or ciphertext. Incident state is held per process (the API runs as one replica); the planner decides whether to persist it.

### Rollout and rollback
- **D-06:** Develop and get CI green on the non-deploying `thinx-unit` branch, then push to `thinx-staging`, which deploys. Rollback is a git revert plus redeploy. The `main` merge and the v1.18 GitHub release stay on hold until all of v1.17 is done (operator, 2026-10-18).
- **D-07:** Add a kill-switch environment flag that disables new deploy-key generation, refused with the D-03 error, without any passphrase fallback, while builds keep reading both key kinds. It is set by one targeted `docker service update --env-add` on `thinx_api`, never by a stack deploy. Mirror the flag in `thinx-swarm/thinx.yml` and `docker-swarm.yml`, defaulting to "enabled". — **Reversibility:** reversible

### Claude's Discretion
- How the OpenBao client is built: a small HTTPS client on Node's `https`/`fetch` with the CA pinned, or a maintained library. Bias towards no new dependency.
- The in-memory key format handed to `ssh-add -` (PKCS#8 PEM vs OpenSSH), `ssh-agent` lifecycle and cleanup, and concurrency limits.
- Exact timeout and retry values (D-02), the error-code naming (D-03) and the kill-switch env name (D-07).
- How Transit vs legacy files are detected (the `vault:v` prefix vs a PEM header), including unknown or corrupt files: skip and log, never crash.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/workstreams/vault-transit/REQUIREMENTS.md`: KEYENC-01..06, milestone decisions D-01..D-06, out of scope.
- `.planning/workstreams/vault-transit/ROADMAP.md` § Phase 40: goal, production note and success criteria.

### OpenBao as deployed (Phase 39)
- `.planning/runbooks/openbao.md`: live wiring, the API attachment (§10), the AppRole, TLS/CA trust consumer and the edge gates.
- `.planning/workstreams/vault-transit/phases/39-internal-openbao-on-the-swarm/39-CONTEXT.md`, `39-06-SUMMARY.md`: API wiring, `BAO_ADDR` / `BAO_CACERT`, the secret names, the trust consumer's CA config swaps.
- `../thinx-swarm/openbao/policies/thinx-api.hcl`: exact API permissions.
- `../thinx-swarm/scripts/openbao-bootstrap.sh` (the thinx-api role, around line 228): token TTLs.
- `../thinx-swarm/tests/openbao-api-wiring.test.sh`: the proven in-task readSecret, TLS and Transit canary pattern.

### Source finding
- PwnDoc finding `6ac64bcfdd94eb38dba4c3a4` (audit `6ac4e883dd94eb38dba4b48d`), quoted in REQUIREMENTS.md.

### Project rules
- `AGENTS.md`: deploy flow, keep 7442 and plain MQTT, the edge rules.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/thinx/secrets.js` `readSecret()`: secret file first, env fallback, cached. Use it for `BAO_ROLE_ID` / `BAO_SECRET_ID`. Tests reset it with `_resetCacheForTests()`.
- `lib/thinx/notifier.js`: the existing `SLACK_WEBHOOK` posting, no-op when unset. Use it for D-05.
- `lib/thinx/rsakey.js` `generate()` / `create()`: name reservation, the 'wx' private write, then the `.pub` write, and cleanup on failure (38 WR-02/03). Keep these semantics; only the private-key encoding step changes.
- `lib/thinx/git.js` `fetchHoldingLock()`: the try-each-key loop with last-good key ordering in Redis, a per-attempt env, the checkout lock, and `baseEnv()` already stripping `GIT_KEY_PASSPHRASE` and forcing `GIT_ASKPASS=false`.

### Established Patterns
- `Git.SSH_COMMAND` is a constant shell string, with per-attempt values passed only as env vars. Transit keys need an agent-based variant: `SSH_AUTH_SOCK`, no `-i` key file, `IdentitiesOnly` semantics kept, publickey only, and no `SSH_ASKPASS` / `GIT_KEY_PASSPHRASE` in the env (KEYENC-02).
- `router.rsakey.js` answers through `Util.responder` / `Util.respond` with `{ success, response, reason }` codes. D-03's code fits there.
- No `SecretsSweepSpec` exists yet, though the ROADMAP names it. Phase 40 creates it.
- CI: `.circleci/config.yml` has `thinx-unit` branch filters; the specs live in `spec/jasmine/`; there is `docker-compose.test.yml` for the integration services (the OpenBao dev server is added there).

### Integration Points
- `lib/router.rsakey.js` (create), `lib/thinx/rsakey.js` (generate, list, revoke), `lib/thinx/git.js` (fetch, sshEnv, askfile), and both consoles' deploy-key error display.

</code_context>

<specifics>
## Specific Ideas

- The alert style copies Phase 39's: "THiNX OpenBao: … FAILING since <ts>: <REASON>. One alert per incident; recovery will be announced." and a matching RECOVERED line.

</specifics>

<deferred>
## Deferred Ideas

- Code-review findings on the Phase 39 scripts (39-REVIEW.md, CR-01 and WR-01..16) are tracked against Phase 39, not here.
- The 14 todos the tool matched (MQTT device writes, OTA, transfers, builders, the mosquitto/ssl file modes, and others) are not related to deploy-key encryption. They were reviewed and not folded in.

</deferred>
