# Phase 40: Transit-Encrypted Deploy Keys in the API - Research

**Researched:** 2026-10-19
**Domain:** Node.js API ↔ OpenBao Transit/AppRole client, in-memory SSH key handling (ssh-agent), dual-format key storage, CI integration with an OpenBao dev server
**Confidence:** HIGH (every load-bearing behaviour was probed locally against the exact `openbao/openbao:2.7.1` image and the exact base image `dhi.io/node:26-alpine3.24-dev`; nothing touched production)

## Summary

The change is narrow in code but has several traps. Deploy keys are written by `RSAKey.generate()` (`lib/thinx/rsakey.js:581-637`) as an `aes-256-cbc` PKCS#8 PEM under the single `GIT_KEY_PASSPHRASE`. They are consumed by `Git.fetchHoldingLock()` (`lib/thinx/git.js:543-570`), which runs `ssh -i <keyfile>` with an `SSH_ASKPASS` helper that prints the passphrase. **No ssh-agent exists today.** Phase 40 adds a small Transit client on Node's `https` module (no new dependency). The client logs in with AppRole, re-logs in rather than renewing (the live policy denies `renew-self`), pins `BAO_CACERT`, and bounds every request with `AbortSignal.timeout`. New keys become `vault:vN:` files. A Transit key's build attempt decrypts in memory, starts a private `ssh-agent -D -a <0700 dir>/agent.sock`, pipes the PEM to `ssh-add -`, and points ssh at a **public-key file** with `-i`. That last step matters: with `IdentitiesOnly=yes` and no `-i`, OpenSSH does not offer the agent's key at all (verified).

Five findings change the plan. (1) `SecretsSweepSpec.js` already exists (839 lines, with a `withSecrets`/`freshRequire`/`captureLogs` harness), contrary to CONTEXT, so Phase 40 **extends** it. Its "generate() refuses when the passphrase is absent" case, and `03-RsakeySpec` (11), must be rewritten because new keys no longer use the passphrase. (2) The Phase 39 gate `thinx-swarm/tests/openbao-api-wiring.test.sh --source` contains a `scope_guard` that **fails by design** when `rsakey.js`, `git.js` or `package*.json` change, or when a lib file named `*openbao|vault|transit|bao*` is added. `openbao-verify.sh --api-service` also requires that the only `BAO_*`/`VAULT_*` env keys on `thinx_api` are `BAO_ADDR` and `BAO_CACERT`. Phase 40 must update the thinx-swarm test, and the D-07 kill switch must not start with `BAO_` or `VAULT_`. (3) Legacy keys come in at least two shapes: an encrypted PKCS#8 since 2022, and an **unencrypted** `ssh-keygen -N ""` key before that. Format detection must therefore treat any PEM-armored private key as legacy. The GitSpec fixture `k1` ("not a real key") would then become "unknown" and break specs (g), (h) and the askpass cases. (4) Transit `associated_data` would bind a ciphertext to its filename, but OpenBao 2.7.1 `rewrap` rejects AAD-encrypted ciphertext (`cipher: message authentication failed`, verified), which would break Phase 41 KEYMIG-03. Do not use AAD. (5) The CI dev server works with `-dev-tls`: the cert SANs include the container hostname. AppRole accepts fixed throwaway `role_id`/`secret_id` values through `role-id` and `custom-secret-id`, so CI needs no secret files and no bind mounts, which matters because the CI job uses remote Docker.

**Primary recommendation:** Build a module-level singleton `lib/thinx/transit.js` on `https.request` with the pinned CA, AppRole re-login, one retry after a fresh login, `AbortSignal.timeout(3000)` per request and reason-class errors. Add a `lib/thinx/keyformat.js` detector and a per-attempt `ssh-agent` helper in `git.js`. Thread a `key_service_unavailable` code through `rsakey.create()` → router (HTTP 503) → both consoles. Add `THINX_DEPLOY_KEYGEN=disabled` as the kill switch, an `openbao` + `openbao-setup` pair in `docker-compose.test.yml`, and the thinx-swarm test update. Develop on `thinx-unit` (only the `test` job runs there).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Key generation + Transit encrypt | API / Backend (`rsakey.js`) | OpenBao (Transit) | The key pair is made in the API process memory; only Transit holds the encryption key |
| Ciphertext at rest | Database / Storage (Gluster `ssh_keys`, 0600 files) | — | Files hold only `vault:vN:` text; same directory and naming as today |
| AppRole login, token lifetime, timeouts | API / Backend (`transit.js`) | — | Credentials come from `/run/secrets` through `readSecret`; the token stays in memory only |
| Decrypt + ssh-agent per attempt | API / Backend (`git.js`, runs the clone) | OS (ssh-agent child process) | git runs inside the API task (`builder.prefetchPrivate`, `sources`, `devices`), not in the worker |
| Format detection / dual read | API / Backend (`keyformat.js`) | — | Picks the legacy (askpass) or Transit (agent) path per file |
| Refusal message | Browser / Client (Vue + Legacy consoles) | API (503 code) | Each console maps `key_service_unavailable` to one fixed sentence |
| Outage alert | API / Backend (Slack via `slack-notify`) | — | Per-process incident state, like `redis-health.js` |
| Kill switch | Swarm config (`thinx_api` env) | API reads it at call time | One `docker service update --env-add`, mirrored in `thinx.yml`/`docker-swarm.yml` |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried forward (milestone and Phase 39, not re-asked)
- Milestone D-01: Transit encrypts the whole private-key blob through `transit/encrypt/thinx-deploy-keys`. There is no local DEK envelope, and keys are never stored in OpenBao KV.
- Milestone D-04: dual-read, legacy passphrase keys and Transit ciphertext both accepted, until Phase 41 reports zero legacy keys.
- KEYENC-03: a new key never falls back to the passphrase.
- Phase 39: the `thinx-api` AppRole may only encrypt, decrypt and rewrap on `thinx-deploy-keys`. Its token TTL is 20 m, token_max_ttl 1 h, and the secret_id never expires. The client must renew or log in again before the 1 h hard cap. Credentials come through `readSecret()` from `/run/secrets`. TLS verifies against `BAO_CACERT` only.

#### Builds during an OpenBao outage
- **D-01:** If a Transit key cannot be decrypted because OpenBao is sealed, unreachable or denying, that key is skipped with an explicit, logged reason, and the existing try-each-key loop in `lib/thinx/git.js` goes on to the owner's remaining keys, including legacy passphrase keys. An owner with a working legacy key still builds during an outage.
- **D-02:** Before giving up on a key, the client makes one quick retry, after a fresh AppRole login. Timeouts are short, so a build never hangs on OpenBao. The exact values are Claude's discretion, but they must be bounded.

#### What users see on failure
- **D-03:** Key generation refused because OpenBao is unavailable returns a distinct error code, e.g. `key_service_unavailable`. Both consoles (Vue and legacy) show "Deploy keys can't be created right now, try again later." No internal detail (address, status body, token) reaches the client.
- **D-04:** A keyed build that fails because no key could be decrypted writes an explicit build-log line such as `deploy key unavailable: key service unreachable`. The build status stays the existing failure status: no new status value, no console or API change.

#### Alerting
- **D-05:** The API posts to Slack once per incident: one FAILING message when it first cannot reach OpenBao (or is denied), and one RECOVERED message on the first success after that. There are no repeats in between, matching Phase 39's maintenance alerts. Use the API's existing Slack webhook (`SLACK_WEBHOOK` via `readSecret`, `lib/thinx/notifier.js`). Messages carry only the reason class, never tokens, key material or ciphertext. Incident state is held per process (the API runs as one replica); the planner decides whether to persist it.

#### Rollout and rollback
- **D-06:** Develop and get CI green on the non-deploying `thinx-unit` branch, then push to `thinx-staging`, which deploys. Rollback is a git revert plus redeploy. The `main` merge and the v1.18 GitHub release stay on hold until all of v1.17 is done (operator, 2026-10-18).
- **D-07:** Add a kill-switch environment flag that disables new deploy-key generation, refused with the D-03 error, without any passphrase fallback, while builds keep reading both key kinds. It is set by one targeted `docker service update --env-add` on `thinx_api`, never by a stack deploy. Mirror the flag in `thinx-swarm/thinx.yml` and `docker-swarm.yml`, defaulting to "enabled". — **Reversibility:** reversible

### Claude's Discretion
- How the OpenBao client is built: a small HTTPS client on Node's `https`/`fetch` with the CA pinned, or a maintained library. Bias towards no new dependency.
- The in-memory key format handed to `ssh-add -` (PKCS#8 PEM vs OpenSSH), `ssh-agent` lifecycle and cleanup, and concurrency limits.
- Exact timeout and retry values (D-02), the error-code naming (D-03) and the kill-switch env name (D-07).
- How Transit vs legacy files are detected (the `vault:v` prefix vs a PEM header), including unknown or corrupt files: skip and log, never crash.

### Deferred Ideas (OUT OF SCOPE)
- Code-review findings on the Phase 39 scripts (39-REVIEW.md, CR-01 and WR-01..16) are tracked against Phase 39, not here.
- The 14 todos the tool matched (MQTT device writes, OTA, transfers, builders, the mosquitto/ssl file modes, and others) are not related to deploy-key encryption. They were reviewed and not folded in.

Also out of scope (CONTEXT § Phase Boundary): migrating legacy keys, removing `GIT_KEY_PASSPHRASE`, and Transit rotation/rewrap (all Phase 41). Changing port 7442 or plain MQTT is never in scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KEYENC-01 | New key → Transit, only `vault:vN:…` (0600) in `ssh_keys`; plaintext never on disk | Pattern 2 (generate → encrypt → `'wx'` 0o600 write); ciphertext shape verified (`vault:v1:` + base64, ~4.4 KB for a 4096-bit PKCS#8 PEM) |
| KEYENC-02 | Keyed fetch decrypts in memory, `ssh-add -` into a per-attempt `ssh-agent`; no `GIT_KEY_PASSPHRASE`/`SSH_ASKPASS` for Transit keys | Pattern 4 (agent lifecycle) and Pattern 5 (`Git.AGENT_SSH_COMMAND` with `-i <pub>`), verified against a real sshd and `git clone` |
| KEYENC-03 | Sealed/unreachable/denied → keygen refused, keyed build fails with explicit logged status, no passphrase fallback; HTTPS builds, :7442, plain MQTT unaffected | Pattern 3 (reason classes; verified 503 sealed / 403 bad token / 400 bad secret / `ABORT_ERR` / `ECONNREFUSED`); D-03 503 path through both consoles; D-04 build-log line; the public path (`prefetchPublic`, `baseEnv`) does not touch Transit |
| KEYENC-04 | AppRole login, renew or re-login, timeouts, no tokens/plaintext/ciphertext in logs (SecretsSweepSpec) | `renew-self`/`lookup-self`/`revoke-self` are 403 for this role (verified), so re-login only, `lease_duration` 1200 s; `AbortSignal.timeout`; extend the existing SecretsSweepSpec harness |
| KEYENC-05 | Unit specs with mocked OpenBao + integration spec against an OpenBao dev server in `docker-compose.test.yml`; CI green | In-process https mock with a runtime node-forge CA (verified); compose `openbao` + `openbao-setup` pattern verified end to end locally |
| KEYENC-06 | Dual read selected by file format | Pattern 1 (`keyformat.detect`): `vault:v<N>:` → transit; any `-----BEGIN … PRIVATE KEY-----` → legacy; anything else → skip + log |
</phase_requirements>

## Project Constraints (from AGENTS.md / CLAUDE.md)

There is no root `CLAUDE.md`. `AGENTS.md` and the global `~/.claude/CLAUDE.md` apply:

- **Port 7442 and plain MQTT stay.** No hardening may close or TLS-enforce them. Phase 40 touches neither. The verification must still show :7442 check-in and plain MQTT working after cut-over.
- **chai-http stays at `^4.3.0`.** Do not bump it. New specs use the existing CommonJS `chai.request(app)` style.
- **A push to `thinx-staging` deploys production** (CircleCI → `registry.thinx.cloud:5000` → Swarmpit). Phase 40 code goes to `thinx-unit` first (D-06). AGENTS.md's "push to the current branch to trigger CI" is overridden here: the current branch is `thinx-staging`.
- **Push parent to `thinx-staging`, never `main`.** The `main` merge is held until v1.17 is done.
- **Live `thinx_api` changes go through one `docker service update`** with a 0600 root spec backup, never `docker stack deploy`/`restart.sh`. The D-07 kill switch follows this.
- **thinx-swarm is repo-first.** Micro cannot reach GitHub, so updates go by ssh push + ff-merge into `/mnt/gluster/deployment/swarm` and are never edited in place. A `master` push triggers CI error-page rebuilds; wait for them before an edge gate.
- **Subagent safety:** never run env-dumping commands (`env`, `export`, `set`, `printenv`, `declare -p`). The same goes for new code: never log `process.env` or a git/ssh `env` object (git.js already says "Never log env").
- **Use `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 …` literally** for any cut-over step.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node `https` (built in) | Node 26.9.0 in base image `dhi.io/node:26-alpine3.24-dev` [VERIFIED: `docker run … node --version`] | OpenBao HTTP API client with `ca` pin, `servername`, `signal` | Same pattern Phase 39 proved inside the live API task (`tests/openbao-api-wiring.test.sh:242-262`); no dependency; the CircleCI-checked scope guard flags `node-vault`/`openbao` deps |
| Node `crypto.generateKeyPair` (built in) | — | RSA-4096 key pair, private key as **unencrypted** PKCS#8 PEM in memory | Already used by `rsakey.generate`; only `cipher`/`passphrase` are dropped for Transit keys |
| OpenSSH client `ssh`, `ssh-agent`, `ssh-add` | OpenSSH_10.3p1, OpenSSL 3.5.8 in the base image (`apk add openssh-client` in `base/Dockerfile:36`) [VERIFIED: container probe] | Per-attempt in-memory key holder | Already in the image; `ssh-add -` reads the key from stdin, so nothing touches disk |
| `node-forge` | `^1.4.0` (existing dependency, `package.json`) | `toOpenSSH` public-key conversion (exists); runtime test CA/leaf for the mock OpenBao | Already a dependency; no committed private keys (gitleaks-safe) |
| `slack-notify` | `^2.0.6` (existing) | D-05 FAILING/RECOVERED messages | Same package and pattern as `redis-health.js` / `notifier.js` |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `openbao/openbao` | `2.7.1` (same tag as production, pinned by tag) | CI dev server (`server -dev -dev-tls`) and `bao` CLI for the setup one-shot | `docker-compose.test.yml` only |
| jasmine | `^5.12.0` (existing) | Unit + integration specs in `spec/jasmine/` | All new API specs |
| `node:test` | built in | Optional offline checks in `spec/node/` (e.g. key-format table) | Fast checks that need no services |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `https.request` | global `fetch` (undici) | Custom CA needs an undici `Agent({connect:{ca}})` dispatcher, and `undici` is not an exposed module without adding the package. Rejected. |
| `https.request` | `axios` 1.20.0 (existing dep) with `httpsAgent` | Works, but adds interceptor/redirect behaviour and error objects that embed request config (headers, so the token) in `error.config`, which is a leak risk if ever logged. Rejected. |
| `https.request` | `node-vault` / any Vault SDK | New dependency, flagged by the thinx-swarm scope guard, mostly unmaintained, and covers 1% of what is needed. Rejected. |
| PKCS#8 PEM into `ssh-add -` | Convert to OpenSSH private format first | Not needed: `ssh-add -` loads PKCS#8 and PKCS#1 PEM (verified). One fewer conversion. |
| Transit `associated_data` bound to filename | Owner-binding header inside the plaintext (optional, see Open Questions) | AAD breaks `rewrap` in 2.7.1 (verified) and therefore Phase 41 KEYMIG-03 |

**Installation:** none. No package is added.

## Package Legitimacy Audit

No external package is installed by this phase. Every library above is a Node built-in or an existing `package.json` dependency (`node-forge`, `slack-notify`, `jasmine`). The CI image `openbao/openbao:2.7.1` is the tag production runs (VAULT-01).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none added) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    Console (Vue / Legacy)
                           │ PUT /api/v2/rsakey | GET /api/user/rsakey/create (CSRF)
                           ▼
   router.rsakey.js ──► rsakey.create()
                           │ kill switch THINX_DEPLOY_KEYGEN=disabled? ──yes──► callback(false,"key_service_unavailable")
                           │ reserveIdentifier (claim .pub 'wx')
                           ▼
                     generateKeyPair (RSA-4096, PKCS#8 PEM, unencrypted, memory only)
                           │
                           ▼
                     transit.encrypt(pem) ──► https://openbao.internal:8200 (CA = BAO_CACERT)
                           │   ├─ token missing/expiring → auth/approle/login (role_id/secret_id via readSecret)
                           │   ├─ 403 → one fresh login + one retry (D-02)
                           │   └─ failure → reason class ─► incident tracker ─► Slack FAILING (once)
                ok ◄───────┴─────── fail ─► releaseIdentifier ─► 503 {success:false,response:"key_service_unavailable"}
                │
                ▼
     write <owner>-<ts> 'wx' 0600 = "vault:vN:…\n"  then .pub (OpenSSH, 0644)

   Build / source add / device attach ──► git.fetch(owner,url,branch,path)  [checkout lock]
                           │ for key in orderKeys(owner, names):
                           ▼
                     keyformat.detect(file) ──unknown──► log "key <name> skipped: unknown_key_format"; next
                       │legacy                      │transit
                       ▼                            ▼
          askpass helper + ssh -i file      transit.decrypt(ct) ──fail──► log "key <name> skipped: deploy key unavailable: <class>"; next
          (unchanged legacy path)                   │ok (Buffer)
                                                    ▼
                                      ssh-agent -D -a <mkdtemp 0700>/agent.sock  (+ -t backstop)
                                      ssh-add -  ◄── PEM on stdin; buffer.fill(0)
                                      write <dir>/key.pub (derived from the PEM, public only)
                                      git clone/pull with GIT_SSH_COMMAND = AGENT variant (-i key.pub, IdentitiesOnly, BatchMode)
                                      finally: kill agent, rm -rf dir
                           ▼
                 ok → rememberKey; return {ok:true}
                 all failed → {ok:false, keyUnavailable:<class|null>}
                           ▼
            builder: blog.log(build_id, owner, udid, "deploy key unavailable: key service unreachable") ; existing "error" state
```

### Recommended Project Structure
```
lib/thinx/
├── transit.js        # NEW: OpenBao Transit/AppRole client (singleton + class for tests), reason classes, incident tracker hook
├── keyformat.js      # NEW: detect(fileText) -> "transit" | "legacy" | "unknown"; pure, no I/O beyond the caller's read
├── rsakey.js         # generate(): Transit path; create(): kill switch + key_service_unavailable
├── git.js            # fetchDetailed(); per-attempt agent; AGENT_SSH_COMMAND; baseEnv also strips SSH_AUTH_SOCK/SSH_AGENT_PID
├── builder.js        # prefetchPrivate surfaces keyUnavailable → one build-log line (D-04)
└── github_link.js    # createAndPush: map key_service_unavailable (503) instead of rsa_key_creation_failed (500)
lib/router.rsakey.js  # 503 key_service_unavailable
spec/jasmine/
├── TransitSpec.js               # NEW unit: mocked https OpenBao (runtime forge CA)
├── TransitIntegrationSpec.js    # NEW integration: real dev server (skips when BAO_ADDR unset)
├── KeyFormatSpec.js             # NEW (or spec/node/KeyFormat.test.js)
├── GitSpec.js                   # extend: agent path, fixture k1 -> PEM-armored placeholder
├── 03-RsakeySpec.js             # rewrite (11): no passphrase dependency; Transit refusal
└── SecretsSweepSpec.js          # extend: BAO_ROLE_ID/BAO_SECRET_ID + token/ct/plaintext never logged
docker-compose.test.yml          # openbao + openbao-setup + api env/volume
services/console/vue/src/pages/Rsakeys/Rsakeys.vue + tests/unit/deploy-key-actions.cjs
services/console/src/app/js/controllers/DeploykeyController.js + src/test/deploykey.cjs
../thinx-swarm/tests/openbao-api-wiring.test.sh   # retire the Phase-40 scope guard; allow the kill-switch env
../thinx-swarm/thinx.yml + docker-swarm.yml         # THINX_DEPLOY_KEYGEN=enabled
```

### Pattern 1: Format detection (KEYENC-06)
**What:** Classify a private-key file by its content, never by its name.
**When:** Every keyed attempt in `git.js`. Phase 41's migration will reuse it.
```javascript
// lib/thinx/keyformat.js — pure; the caller reads the file (cap e.g. 64 KiB, utf8)
const TRANSIT = /^vault:v[1-9][0-9]*:[A-Za-z0-9+/]+={0,2}$/;          // verified shape: vault:v1:<base64>
const PEM_PRIVATE = /^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----$/;        // ENCRYPTED / RSA / OPENSSH / (none)
function detect(text) {
  if (typeof text !== "string") return "unknown";
  const t = text.trim();
  if (TRANSIT.test(t)) return "transit";                              // single line, nothing else
  const first = t.split(/\r?\n/, 1)[0];
  if (PEM_PRIVATE.test(first)) return "legacy";                       // passphrase PKCS#8 (2022+) or unencrypted ssh-keygen (pre-2022)
  return "unknown";                                                   // skip + log the class, never the content
}
```
Legacy history [VERIFIED: `git show e9816427 -- lib/thinx/rsakey.js`]: before 2022-05-17 keys came from `ssh-keygen -C "${owner}@${process.env.THINX_HOSTNAME}" -q -N "" -t rsa -f ${keyname}`, which is **unencrypted**. Since then the code uses `privateKeyEncoding: { type: 'pkcs8', … cipher: 'aes-256-cbc', passphrase }`. Both are "legacy" and keep the existing askpass path. ssh ignores askpass for an unencrypted key.

### Pattern 2: Transit key generation (KEYENC-01, KEYENC-03)
Keep the 38 WR-02/03 semantics of `generate()` exactly (`'wx'` private write, then `.pub`, cleanup on failure). Change only the encoding step:
```javascript
// in generate(): no passphrase lookup for new keys; refusal comes from Transit, never a fallback
generateKeyPair('rsa', { modulusLength: 4096,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' } },            // no cipher: plaintext lives only in memory
  async (err, publicKey, privateKey) => {
    if (err) return callback(err);
    let ct;
    try { ct = await transit.encryptKey(Buffer.from(privateKey, 'utf8')); }   // returns "vault:vN:…"
    catch (e) { return callback(Object.assign(new Error('key_service_unavailable'), { code: 'key_service_unavailable', reason: e.reason })); }
    // then the existing try { toOpenSSH; fs.writeFileSync(private_path, ct + "\n", { flag: "wx", mode: 0o600 }); chmod; .pub … }
  });
```
`create()` then maps `err.code === 'key_service_unavailable'` to `callback(false, "key_service_unavailable")` after `releaseIdentifier`. The kill-switch check goes at the top of `create()`, before `reserveIdentifier`, so no claim file is ever made.
Router: `if (!success && response === "key_service_unavailable") return Util.failureResponse(res, 503, "key_service_unavailable");`
`github_link.js` `createAndPush`: map the same code to `{ status: 503, success: false, response: "key_service_unavailable" }` instead of `rsa_key_creation_failed`.

### Pattern 3: Transit client (KEYENC-04, D-02, D-05)
```javascript
// lib/thinx/transit.js — sketch; values in quotes below are verified against the live policy and 2.7.1
const https = require("https"); const fs = require("fs");
const { readSecret } = require("./secrets.js");
const KEY = "thinx-deploy-keys";                    // policy paths: transit/{encrypt,decrypt,rewrap}/thinx-deploy-keys
const REQUEST_TIMEOUT_MS = 3000;                    // per HTTP request, covers DNS+connect+TLS+body (AbortSignal)
const REFRESH_MARGIN_MS = 120000;                   // re-login when < 2 min of the 20 min token is left

class TransitError extends Error { constructor(reason, status) { super("transit_" + reason); this.reason = reason; this.status = status || null; } }
// reason classes (the only thing ever logged / alerted / shown in build logs):
//   not_configured (no/invalid BAO_ADDR, non-https, CA unreadable, missing role/secret)
//   unreachable    (ECONNREFUSED, ENOTFOUND, EAI_AGAIN, ECONNRESET, ABORT_ERR timeout)
//   tls            (UNABLE_TO_VERIFY_LEAF_SIGNATURE, ERR_TLS_CERT_ALTNAME_INVALID, CERT_HAS_EXPIRED, DEPTH_ZERO_SELF_SIGNED_CERT, …)
//   sealed         (HTTP 503)
//   denied         (HTTP 403 after the retry; login HTTP 400 "invalid role or secret ID")
//   bad_ciphertext (decrypt HTTP 400 — a per-key data problem, NOT an incident)
//   server_error   (other 5xx / unparseable body)
```
Rules:
- `BAO_ADDR` must parse as `https:`. Anything else → `not_configured`. Never send credentials over plain HTTP.
- `ca: fs.readFileSync(process.env.BAO_CACERT)` replaces the default trust store (system trust refuses the private CA: verified `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Never set `rejectUnauthorized: false`. A two-certificate overlap bundle in one PEM string verifies (verified), so the trust consumer's overlap phase works. A CA swap restarts the task (runbook §10), so reading the CA once per process is enough.
- Token handling: `POST /v1/auth/approle/login {role_id, secret_id}` returns `auth.client_token`, `auth.lease_duration` (1200 for this role), `renewable: true`, `policies: ["thinx-api"]` (verified). **Do not call `auth/token/renew-self`**: it returns 403 for this role, as do `lookup-self` and `revoke-self` (verified; policy header `thinx-swarm/openbao/policies/thinx-api.hcl:3-6`). Re-login when `now > expiresAt - REFRESH_MARGIN_MS`. Use a single-flight login promise, so concurrent decrypts share one login.
- D-02 retry: on a 403 (token expired or revoked) or a transport error during encrypt/decrypt, drop the token, log in once more and retry once. Worst case per key: login + op + login + op ≈ 4 × 3 s = 12 s, bounded.
- Payloads: `encrypt {plaintext: base64(pem)}` returns `data.ciphertext` (`vault:v1:…`) and `data.key_version`. `decrypt {ciphertext}` returns `data.plaintext` (base64). Return a `Buffer` and let callers zero it (`buf.fill(0)`) after use. JS strings cannot be wiped, so keep the decrypted PEM in Buffers end to end.
- Cap the response body at 64 KiB. Never log a body, header, token, role/secret id, ciphertext or plaintext; log `[transit] <op> failed: <reason> status=<n>` only.
- Incident tracker (D-05): `fail(reason)` on any class except `bad_ciphertext` → if healthy, send FAILING once and remember `since`. `ok()` → if failing, send RECOVERED once. Mirror `redis-health.js` (an injectable `slackNotify` factory, webhook from `readSecret("SLACK_WEBHOOK")`, a no-op when unset, async `.catch`). Message text after Phase 39 (`thinx-swarm/scripts/openbao-common.sh:593-595`): `THiNX OpenBao: API Transit FAILING on <host> since <ts>: <REASON>. One alert per incident; recovery will be announced.` / `THiNX OpenBao: API Transit RECOVERED on <host>; failing since <ts> (<REASON>).` Per-process state is enough: a restart that is still failing alerts once more, which is acceptable for one replica.
- Do not `require("./notifier.js")` from `transit.js`. Its module load pulls in `globals`, `database` and `couch` (`lib/thinx/notifier.js:1-14`). Use `slack-notify` directly, as `redis-health.js` does.

### Pattern 4: Per-attempt ssh-agent (KEYENC-02)
Verified flow (locally and inside `dhi.io/node:26-alpine3.24-dev` with Alpine `openssh-client`): `fs.mkdtempSync(os.tmpdir()+"/thinx-agent-")` gives a 0700 dir. `spawn("ssh-agent", ["-D", "-a", sock, "-t", String(lifetimeS)])`: `-D` keeps it in the foreground, so the child pid **is** the agent; `-t` is a backstop key lifetime. Poll until `sock` exists (≤1 s). Then `spawn("ssh-add", ["-q", "-"], { env: { PATH, SSH_AUTH_SOCK: sock } })` with the PEM on stdin, exit 0. `ssh-add -l` shows 1 key. On SIGTERM the socket file is removed.
```javascript
// finally-block contract: agent.kill("SIGTERM"); await close; fs.rmSync(dir, {recursive:true, force:true}); pemBuf.fill(0)
```
- Derive the public key from the decrypted PEM: `crypto.createPublicKey(pemBuf)` → SPKI PEM → `RSAKey.toOpenSSH(...)`. Write it to `<dir>/key.pub` (public material only). This beats trusting the `.pub` on the shared, historically world-writable volume.
- Choose `-t` larger than the whole `cloneHoldingLock` (clone + pull, each up to `gitTimeoutMs` = 600000 ms): `2 * gitTimeoutMs / 1000 + 60` = 1260 s. The agent is killed in `finally` long before that; `-t` only matters if Node somehow skips `finally`. If the container dies, the agent dies with it.
- Delete `SSH_AUTH_SOCK` and `SSH_AGENT_PID` in `baseEnv()`, so neither the keyless path nor the legacy path can see an inherited agent.
- Concurrency: one agent per attempt, and attempts are already serialised per checkout dir by `withCheckoutLock`. No extra limit is needed.

### Pattern 5: Agent SSH command (KEYENC-02)
**Verified:** with `IdentitiesOnly=yes` and **no** `-i`, ssh does not offer the agent's key (AUTH FAIL). With `IdentitiesOnly=yes -i <public key file>` the agent's matching key is used (AUTH OK), and `git clone` over ssh through `GIT_SSH_COMMAND` succeeds. `IdentityAgent=none` with only the `.pub` fails, which proves the key really comes from the agent.
```javascript
static get AGENT_SSH_COMMAND() {   // constant shell string; per-attempt values only via env (Phase 23 rule)
  return 'ssh -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=publickey ' +
         '-o PasswordAuthentication=no -o BatchMode=yes -o "GlobalKnownHostsFile=$THINX_GIT_SEEDED_KNOWN_HOSTS" ' +
         '-o "UserKnownHostsFile=$THINX_GIT_LEARNED_KNOWN_HOSTS" -o "IdentityAgent=$SSH_AUTH_SOCK" -i "$THINX_GIT_KEY_PUB"';
}
agentEnv(sock, pubPath) {           // NO SSH_ASKPASS, NO SSH_ASKPASS_REQUIRE, NO GIT_KEY_PASSPHRASE
  return Object.assign(this.baseEnv(), { GIT_SSH_COMMAND: Git.AGENT_SSH_COMMAND, SSH_AUTH_SOCK: sock,
    THINX_GIT_KEY_PUB: pubPath, THINX_GIT_SEEDED_KNOWN_HOSTS: this.options.seededKnownHosts,
    THINX_GIT_LEARNED_KNOWN_HOSTS: this.knownHostsFiles().learned });
}
```
`BatchMode=yes` keeps ssh from ever prompting; the probe used it and authenticated. Keep `Git.SSH_COMMAND` and `sshEnv()` unchanged for legacy keys.

### Pattern 6: Fetch result with skip reason (D-01, D-04)
`fetch()` must keep returning a boolean: `sources.js:293` and `devices.js:81` use `.then((fetched) => …)`. Add `fetchDetailed()`, which resolves `{ ok, keyUnavailable }`. `keyUnavailable` is the reason class of the first Transit key that could not be decrypted, and only when no attempt succeeded. Then `fetch = (...) => fetchDetailed(...).then(r => r.ok)`. `builder.prefetchPrivate` is documented as "free of CouchDB calls" (`builder.js:720-722`), so return the reason to the caller (an out-param object or a second method) and let the build flow at `builder.js:1005-1008` write `blog.log(build_id, owner, udid, "deploy key unavailable: " + sentence)` before the existing `blog.state(..., "error")`. Sentences: unreachable → `key service unreachable`; sealed → `key service sealed`; denied → `key service refused the request`; tls → `key service certificate not trusted`; not_configured → `key service not configured`; bad_ciphertext → `stored key could not be decrypted`. No address or status body may appear in them.

### Anti-Patterns to Avoid
- **Writing the decrypted PEM to a temp file for `ssh -i`.** This violates KEYENC-01/02. Use the agent.
- **`IdentitiesOnly=yes` without `-i <pub>` on the agent path.** The key is silently not offered (verified).
- **Falling back to `GIT_KEY_PASSPHRASE` when Transit fails at keygen.** Forbidden by KEYENC-03. The existing "refuse when passphrase unset" branch must not survive in the Transit path.
- **Opening a Slack incident on `bad_ciphertext`.** That is one damaged file, not a service outage.
- **Logging `e.message` from `https` or including a response body.** Log the class and status only.
- **Reading `GIT_KEY_PASSPHRASE` in the agent env.** `baseEnv()` already deletes it; do not add it back.
- **Transit `associated_data`.** It breaks `rewrap` in 2.7.1, and Phase 41 needs rewrap.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key encryption at rest | Local AES/DEK envelope | Transit `encrypt`/`decrypt` | Milestone D-01; the key must never leave OpenBao |
| Holding a private key for ssh | Temp key file, FIFO, custom askpass | `ssh-agent` + `ssh-add -` | Nothing on disk; verified in the base image |
| Request timeouts | Hand-built timers that only cover `socket.setTimeout` | `AbortSignal.timeout(ms)` passed as `signal` to `https.request` | Covers DNS, connect, TLS and a hung server (verified: `ABORT_ERR` at 504 ms for a 500 ms limit) |
| Test TLS certificates | Committed PEM key fixtures | `node-forge` CA/leaf minted at spec start (~170 ms) | No private keys in git (gitleaks), always valid |
| Slack debounce | New notifier plumbing | The `redis-health.js` pattern (injectable `slackNotify`) | Already tested (RedisHealthSpec H1–H4) |
| OpenBao SDK | Generic Vault client | Four HTTP calls on `https` | Small surface, the scope guard flags SDKs |

**Key insight:** the risky parts are leak paths (logs, env, disk, plaintext HTTP) and hangs, not crypto. Every one of them is controlled by keeping the client tiny and the error output a fixed set of reason classes.

## Runtime State Inventory

Not a rename or migration phase (the migration is Phase 41). The categories that do change state:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New `ssh_keys/<owner>-<ts>` files hold `vault:vN:` text. Existing legacy files are untouched. Redis `gitkey:<owner>` holds only a filename (`git.js:519-528`). | Code only. No data migration in Phase 40. |
| Live service config | `thinx_api` already carries the BAO network, secrets, CA config and env (39-06). The kill switch defaults to enabled when unset, so no live change is needed at cut-over. | None at cut-over; `--env-add THINX_DEPLOY_KEYGEN=disabled` only as a rollback lever |
| OS-registered state | None. The ssh-agent is a per-attempt child process, not a service. Verified by reading `git.js`; no cron or systemd unit involved. | None |
| Secrets/env vars | `BAO_ROLE_ID`/`BAO_SECRET_ID` (existing secrets), `BAO_ADDR`/`BAO_CACERT` (existing env), `GIT_KEY_PASSPHRASE` stays (legacy read path). New: `THINX_DEPLOY_KEYGEN` (not secret). | Mirror the env in `thinx.yml` + `docker-swarm.yml`; update the thinx-swarm wiring test |
| Build artifacts | The API image is rebuilt by CI on the `thinx-staging` push (normal deploy). The thinx-swarm `--live` SPEC_DELTA compares the live spec with the 39-06 backup; a new image is likely to show as drift there [ASSUMED]. | Planner: note it in the cut-over gate, or have the normalization ignore `ContainerSpec.Image` |

## Common Pitfalls

### Pitfall 1: The Phase 39 wiring test fails on Phase 40 by design
**What goes wrong:** `tests/openbao-api-wiring.test.sh --source` prints `SCOPE_PHASE40_FILE_CHANGED` / `SCOPE_NEW_CLIENT` / `SCOPE_NEW_DEPENDENCY`. The `--source` contract also compares `thinx.yml`/`docker-swarm.yml` with the 39 baseline, minus the five OpenBao additions, so the new env line makes them differ.
**Why:** `scope_guard()` (`thinx-swarm/tests/openbao-api-wiring.test.sh:115-123`) diffs `lib/thinx/rsakey.js lib/thinx/git.js package.json package-lock.json` against `PARENT_BASE` and greps new lib files for `openbao|vault|transit|bao`.
**How to avoid:** One thinx-swarm task. Bound the scope guard to the Phase 39 range (or drop it, since its purpose has expired), add `THINX_DEPLOY_KEYGEN` to the contract's allowed api additions, and extend `--self-test`. Repo-first, then ssh push + ff-merge on micro.
**Warning signs:** an operator running the Phase 39 gate after cut-over sees FAIL lines.

### Pitfall 2: Kill-switch name collides with the OpenBao env guard
**What goes wrong:** `openbao-verify.sh --api-service` fails `API_ENV_KEYS`, and `--live` fails `SPEC_ATTACHMENTS`.
**Why:** both require the `^(BAO|VAULT)_` env keys on `thinx_api` to be exactly `BAO_ADDR,BAO_CACERT` (`openbao-verify.sh:359-360`; `openbao-api-wiring.test.sh:194`).
**How to avoid:** Name it `THINX_DEPLOY_KEYGEN` (values `enabled`/`disabled`; unset = enabled), read at call time like `THINX_MQTT_DEVICE_WRITES` (`messenger.js:506-508`).

### Pitfall 3: GitSpec fixture `k1` becomes "unknown"
**What goes wrong:** `(g)`, `(h)`, the askpass 401 test and the ssh-unreachable test stop making a keyed attempt.
**Why:** `GitSpec.js:72` writes `"not a real key\n"`, which strict detection classifies as unknown, so the key is skipped.
**How to avoid:** Change the fixture to a PEM-armored placeholder (`-----BEGIN ENCRYPTED PRIVATE KEY-----\n…\n-----END ENCRYPTED PRIVATE KEY-----\n`) so it stays "legacy", and add separate transit and unknown fixtures.

### Pitfall 4: Specs that assert the passphrase-dependency of `generate()`
**What goes wrong:** `SecretsSweepSpec.js:826-838` expects `"GIT_KEY_PASSPHRASE is not set; refusing to generate a deploy key"`, and `03-RsakeySpec.js:217-229` (11) expects an error when the passphrase is unset. Under Transit, generation no longer needs the passphrase.
**How to avoid:** Rewrite both. New assertion: with `GIT_KEY_PASSPHRASE` **set** and Transit unavailable, `generate()` refuses, writes no private file, and logs no passphrase (the KEYENC-03 no-fallback proof). Keep the `keyPassphrase()` file/env cases (the legacy read path still uses it).

### Pitfall 5: Every spec that creates a key now needs Transit
**What goes wrong:** `03-RsakeySpec` (300, 03, 03b, 06, 07, 14) and `GitHubSpec` (000) call `rsakey.create()`. Without OpenBao they fail.
**How to avoid:** Give `RSAKey` an injectable Transit seam (`rsakey.transit = fake`, the same pattern as `git.rsa` in `git.js:476-479`) so `03-RsakeySpec` uses a deterministic in-memory fake. In CI the compose dev server also provides a real one, which covers `GitHubSpec` and the integration spec. ZZ specs are skipped on CircleCI node 0 (`package.json` `split-tests`), so `ZZ-RouterRSAKeySpec` will not catch regressions there; run it locally.

### Pitfall 6: Dev-TLS hostname mismatch in CI
**What goes wrong:** `ERR_TLS_CERT_ALTNAME_INVALID` from the api container.
**Why:** The `-dev-tls` leaf SANs are `localhost, localhost4, localhost6, localhost.localdomain, <container hostname>, 127.0.0.1` (verified). A compose container's hostname defaults to its id, not the service name.
**How to avoid:** Set `hostname: openbao` on the service and `BAO_ADDR=https://openbao:8200`. Share `vault-ca.pem` through a named volume mounted at `/openbao/file`. The image dir is owned by `openbao`, so the new volume inherits a writable owner; a non-existent mount point fails with `stat … no such file or directory` (verified).

### Pitfall 7: The CI job uses remote Docker, so bind-mounted secrets do not work
**What goes wrong:** `secrets: file:` or `./x:/run/secrets/x` bind mounts land on the remote host and come up empty.
**How to avoid:** The setup one-shot pins throwaway values: `bao write auth/approle/role/thinx-api/role-id role_id=thinx-ci-bao-role` and `bao write -f auth/approle/role/thinx-api/custom-secret-id secret_id=thinx-ci-bao-secret`. The api container gets them as env (`readSecret` env fallback). Verified working on 2.7.1. These are labelled CI throwaways, like `thinx-ci-influx-token`.

### Pitfall 8: `renew-self` assumed to work
**What goes wrong:** Renewal is 403, the token expires after 20 min, and the next decrypt fails.
**How to avoid:** Re-login only (verified 403 on renew/lookup/revoke-self). Each login yields a fresh 20 min token. The 1 h `token_max_ttl` caps renewals, which this client never makes.

### Pitfall 9: Build-log line requires a CouchDB call from a CouchDB-free function
**What goes wrong:** Writing `blog.log` inside `prefetchPrivate` contradicts its documented contract (`builder.js:720-722`).
**How to avoid:** Return the reason and let the build flow (`builder.js:1005-1008`) write the line.

### Pitfall 10: The 503 body must survive to the consoles
Verified, so no surprise expected: the API router uses only `sslheaders@swarm` (`thinx.yml` thinx-api-https router) and the entrypoint default is `security-headers@file`. The 400–599 `error-pages-middleware` is attached only to the db/influx routers, so the JSON body reaches the browser. Vue `api.js` returns a non-2xx JSON body that has a `success` field unchanged (`core/api.js:133-140`, `parseResult`). The Legacy `.fail` reads `jqXHR.responseJSON`, and `xhrFailed` only redirects on 401 (`thinx-api.js:271-275`).

### Pitfall 11: Console changes are not covered by `thinx-unit` CI
**What goes wrong:** `test-vue-console` runs only on `thinx-console`, `thinx-staging` and `main` (`.circleci/config.yml` workflow `main`), and `thinx-console` also **publishes** the Vue registry image.
**How to avoid:** Run `cd services/console/vue && yarn test:unit && node ../src/test/deploykey.cjs` locally before the `thinx-staging` push. The console change only adds a sentence for a new code, so deploying it early is harmless.

## Code Examples

### Pinned-CA request with a hard timeout (verified pattern)
```javascript
// Source: tests/openbao-api-wiring.test.sh:250-260 (proven in the live API task) + local AbortSignal probe
function call(method, path, { body, token } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: ADDR.hostname, port: Number(ADDR.port || 8200), path: "/v1/" + path, method,
      ca: CA, rejectUnauthorized: true, agent: AGENT, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: Object.assign({ "content-type": "application/json" },
        token ? { "x-vault-token": token } : {}, data ? { "content-length": Buffer.byteLength(data) } : {})
    }, (res) => {
      const chunks = []; let size = 0;
      res.on("data", (c) => { size += c.length; if (size > 65536) return req.destroy(); chunks.push(c); });
      res.on("end", () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* never echo */ }
        resolve({ status: res.statusCode, json: j }); });
    });
    req.on("error", (e) => resolve({ code: String(e && e.code || "ERROR") }));   // ABORT_ERR, ECONNREFUSED, TLS codes
    if (data) req.write(data); req.end();
  });
}
```

### CI compose services (verified end to end locally; the policy text equals `thinx-swarm/openbao/policies/thinx-api.hcl:9-19`)
```yaml
  openbao:
    image: openbao/openbao:2.7.1
    hostname: openbao                     # dev-tls leaf SAN
    networks: [internal]
    environment:
      - BAO_DEV_ROOT_TOKEN_ID=thinx-ci-bao-root   # throwaway, ephemeral CI instance only
    command: ["server", "-dev", "-dev-no-store-token", "-dev-tls", "-dev-tls-cert-dir=/openbao/file", "-dev-listen-address=0.0.0.0:8200"]
    volumes: ["openbao-devtls:/openbao/file"]
  openbao-setup:                          # like influxdb-setup; `docker compose run --rm openbao-setup`
    image: openbao/openbao:2.7.1
    depends_on: [openbao]
    networks: [internal]
    restart: "no"
    volumes: ["openbao-devtls:/devtls:ro"]
    environment: [BAO_ADDR=https://openbao:8200, BAO_CACERT=/devtls/vault-ca.pem, BAO_TOKEN=thinx-ci-bao-root]
    entrypoint: [sh, -c, >-
      i=0; until [ -f /devtls/vault-ca.pem ] && bao status >/dev/null 2>&1; do i=$$((i+1)); [ $$i -gt 60 ] && exit 1; sleep 1; done;
      bao secrets enable transit &&
      bao write -f transit/keys/thinx-deploy-keys type=aes256-gcm96 exportable=false allow_plaintext_backup=false &&
      bao write transit/keys/thinx-deploy-keys/config deletion_allowed=false && bao auth enable approle &&
      printf '%s\n' 'path "transit/encrypt/thinx-deploy-keys" { capabilities = ["update"] }' 'path "transit/decrypt/thinx-deploy-keys" { capabilities = ["update"] }' 'path "transit/rewrap/thinx-deploy-keys" { capabilities = ["update"] }' | bao policy write thinx-api - &&
      bao write auth/approle/role/thinx-api token_policies=thinx-api token_no_default_policy=true token_type=service token_ttl=20m token_max_ttl=1h secret_id_ttl=0 secret_id_num_uses=0 bind_secret_id=true &&
      bao write auth/approle/role/thinx-api/role-id role_id=thinx-ci-bao-role &&
      bao write -f auth/approle/role/thinx-api/custom-secret-id secret_id=thinx-ci-bao-secret >/dev/null && echo OPENBAO-SETUP-OK]
# api: add `- openbao` to depends_on, `- 'openbao-devtls:/run/openbao-dev:ro'` to volumes, and env
#   BAO_ADDR=https://openbao:8200, BAO_CACERT=/run/openbao-dev/vault-ca.pem, BAO_ROLE_ID=thinx-ci-bao-role, BAO_SECRET_ID=thinx-ci-bao-secret
# top level: volumes: { openbao-devtls: {} }
# CircleCI test job, before "Running Unit and Integration Tests": docker compose up -d openbao && docker compose run --rm openbao-setup
```
The role parameters equal production (`thinx-swarm/scripts/openbao-bootstrap.sh:240-241`: `token_policies=thinx-api token_no_default_policy=true token_type=service token_ttl=20m token_max_ttl=1h secret_id_ttl=0 secret_id_num_uses=0 bind_secret_id=true`). This was verified locally with Compose v2 (newer than CI's pinned `docker compose v2.4.1`). The file format `version: '2.2'` with named volumes is standard, but the first CI run is the real check.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ssh-keygen -N ""` unencrypted key files | Node `generateKeyPair` PKCS#8 + `aes-256-cbc` under `GIT_KEY_PASSPHRASE` | 2022-05-17 (`e9816427`) | Both shapes exist on disk, so both are "legacy" |
| `ssh -i keyfile` + `SSH_ASKPASS` passphrase | Transit ciphertext + per-attempt `ssh-agent` (`ssh-add -`) | Phase 40 | Legacy path unchanged until Phase 41 |
| Token renew-self | Re-login per 20 min token | Phase 39 policy (no default policy) | Client never calls `auth/token/*` |

**Deprecated/outdated:** nothing removed in Phase 40. `GIT_KEY_PASSPHRASE`, `create_askfile`, `sshEnv` and `keyPassphrase()` remain for legacy keys until KEYMIG-02.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Swarmpit's autoredeploy changes `ContainerSpec.Image`, so the thinx-swarm `--live` SPEC_DELTA reports drift after any API image deploy | Runtime State Inventory | Low: a cut-over gate shows a FAIL that has to be explained; no runtime impact |
| A2 | CircleCI's pinned `docker compose v2.4.1` handles the compose snippet (named volume, `hostname`, `$$` escaping) like the newer local Compose did | Code Examples | Medium: the first `thinx-unit` CI run would fail at service start; fix in CI, no prod impact |
| A3 | 3 s per request and 120 s refresh margin suit the internal overlay (OpenBao answers in ms) | Pattern 3 | Low: tunable constants; bounded either way |
| A4 | Pre-2022 unencrypted keys are still in `ssh_keys` in production | Pattern 1 | None: the detector handles them either way. Phase 41 will count them. |

## Open Questions (RESOLVED)

All three questions were settled during planning (2026-10-19). Each carries its RESOLVED line and the plan that settles it.

1. **Owner binding of ciphertext (optional hardening).**
   - What we know: anyone who can write to `ssh_keys` can copy owner A's ciphertext to a file named after owner B, and B's builds would then use A's key. The same is true of legacy files today (one passphrase), so this is not a regression. Transit AAD would close it, but breaks `rewrap` on 2.7.1 (verified).
   - What's unclear: whether the operator wants it in Phase 40.
   - Recommendation: optional. Prefix the plaintext with a one-line header naming the owner (e.g. `thinx-deploy-key:v1 owner=<64hex>\n` + PEM), check it after decrypt, and strip it before `ssh-add`. It survives rewrap because the plaintext is unchanged. If adopted, Phase 41's migration must write the same header. Default: skip, record as accepted residual, unchanged from legacy.
   - **RESOLVED (40-02):** not adopted in Phase 40; the default applies. New ciphertext holds bare PKCS#8 PEM with no owner header and no Transit AAD (40-02 Task 1, `<reversibility rating="costly">`), and the cross-owner swap is recorded as an accepted residual, unchanged from legacy (40-02 threat T-40-09). The header remains an option for Phase 41's decrypt and re-encrypt pass.

2. **Boot-time OpenBao probe.**
   - What we know: with lazy login, a misconfiguration surfaces only at the first keygen or Transit-keyed build.
   - Recommendation: one non-blocking login a few seconds after start (no Transit op, no retry storm). It feeds the incident tracker, so a broken deploy alerts within seconds. The API must start and serve even when the probe fails, because `:7442`, MQTT and HTTPS builds do not depend on it.
   - **RESOLVED (40-01):** adopted as recommended. 40-01 Task 2 adds `Transit.probeSoon()`: one AppRole login on an unref'd 5 s timer, skipped when `ENVIRONMENT=test` or `BAO_ADDR` is unset, feeding only the incident tracker, with every rejection caught; `thinx-core.js` calls it once during init. 40-05 Task 3 checks for `[transit] probe ok` after the rollout.

3. **Where the D-04 sentence is assembled.** Planner's choice between an out-param on `prefetchPrivate` and a new `prefetchPrivateDetailed`. Either way `fetch()` stays boolean for `sources.js`/`devices.js`.
   - **RESOLVED (40-02):** out-param. 40-02 Task 3 gives `prefetchPrivate` an optional fifth parameter `outcome`, filled from `git.fetchDetailed(...).keyUnavailable`; it still resolves a boolean and makes no CouchDB call. `run_build` writes `deploy key unavailable: <Transit.unavailableSentence(reason)>` before the existing error state, and `fetch()` stays boolean for `sources.js` and `devices.js`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (local) | Local integration run of the compose pair | ✓ | 29.8.2 | CI only |
| `openbao/openbao:2.7.1` image | Dev server + setup | ✓ (local cache) | 2.7.1 (a5db72c) | pulled in CI |
| `dhi.io/node:26-alpine3.24-dev` (base FROM) | Agent behaviour parity | ✓ (local cache) | Node 26.9.0, OpenSSH 10.3p1 | — |
| Node (laptop) | `jasmine`, `node --test` | ✓ | v25.1.0 (base image runs 26) | — |
| `ssh-agent`/`ssh-add` (laptop) | Running GitSpec locally | ✓ | OpenSSH_10.3p1 (LibreSSL) | — |
| `openssh-client` in API image | KEYENC-02 at runtime | ✓ via `thinxcloud/base` (`base/Dockerfile:36`) | 10.3p1 | — |
| sshd in the CI test container | Full ssh clone in CI | ✗ | — | Hermetic agent assertions in GitSpec. The real private-repo build is an operator UAT at cut-over. |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** sshd in CI (use agent-level assertions plus the operator UAT).

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json`. This compact map is included because the orchestrator asked for it.

| Property | Value |
|----------|-------|
| Framework | jasmine `^5.12.0` (`spec/support/jasmine.json`, `spec/jasmine/*Spec.js`, random=false) + `node:test` for `spec/node` |
| Quick run (laptop) | `npx jasmine spec/jasmine/TransitSpec.js spec/jasmine/KeyFormatSpec.js spec/jasmine/GitSpec.js spec/jasmine/03-RsakeySpec.js spec/jasmine/SecretsSweepSpec.js` |
| Integration (laptop) | `docker compose -f docker-compose.test.yml up -d openbao && docker compose -f docker-compose.test.yml run --rm openbao-setup`, then run `TransitIntegrationSpec.js` with `BAO_ADDR`/`BAO_CACERT` pointing at it, or rely on CI |
| Full suite | CircleCI `test` job on `thinx-unit` (`docker compose up --build api`, exit code + `N specs, 0 failures`) |
| Consoles | `cd services/console/vue && yarn test:unit && node ../src/test/deploykey.cjs` (local; not run on `thinx-unit`) |

| Req ID | Behaviour | Test Type | Proof |
|--------|-----------|-----------|-------|
| KEYENC-01 | New key file = one `vault:vN:` line, mode 0600, `.pub` OpenSSH; no PEM on disk | unit (fake Transit) + integration (dev server) | `fs.statSync().mode & 0o777 === 0o600`; `keyformat.detect(file) === "transit"`; scan the ssh_keys temp dir for `PRIVATE KEY`, nothing found |
| KEYENC-02 | Transit attempt env has `SSH_AUTH_SOCK`, `AGENT_SSH_COMMAND`, no `SSH_ASKPASS`/`GIT_KEY_PASSPHRASE`; agent holds exactly 1 key during the attempt; socket dir gone afterwards | unit (GitSpec spy on `cloneHoldingLock` runs `ssh-add -l` with the env) | assertions inside the spy plus a post-attempt `existsSync` |
| KEYENC-02 (e2e) | Private GitHub repo builds with a new key | manual UAT at cut-over | build log success; `docker exec` check that no `thinx-agent-*` dir remains |
| KEYENC-03 | Sealed/unreachable/denied → `create` gives `key_service_unavailable`, router gives 503, no file written, passphrase never used; build gives the D-04 log line | unit (mock 503/403/hang/closed port) + integration (`sys/seal` the dev server last) | response code, empty dir, captured log line |
| KEYENC-03 | HTTPS builds, :7442, plain MQTT unaffected | existing suites + cut-over smoke | existing GitSpec public path; operator: `curl http://188.166.23.244:7442/…` 200, MQTT 1883 open |
| KEYENC-04 | Re-login near expiry and after 403; single-flight; timeout bound; no token/ct/plaintext/role/secret in logs | unit (mock with short `lease_duration`) + SecretsSweepSpec | login count; elapsed time < bound; `expectNoFakeValues` with new FAKE entries |
| KEYENC-05 | CI green with the dev server | CI | `thinx-unit` pipeline green |
| KEYENC-06 | legacy PKCS#8-encrypted, legacy unencrypted, transit, unknown → correct path / skip | unit (KeyFormatSpec table + GitSpec order test: transit fails then legacy succeeds) | path taken per fixture; D-01 fallthrough |

**Wave 0 gaps:** `TransitSpec.js`, `TransitIntegrationSpec.js`, `KeyFormatSpec.js` (new); GitSpec fixture fix; compose `openbao`/`openbao-setup`; CircleCI step. The SecretsSweepSpec harness already exists.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (service-to-service) | AppRole role_id/secret_id from `/run/secrets` via `readSecret`; never in env in prod (verified file-first in 39-06) |
| V3 Session Management | yes (OpenBao token) | In-memory only, 20 min, re-login, never persisted or logged |
| V4 Access Control | yes | Policy limited to encrypt/decrypt/rewrap on one key; owner→key selection unchanged (`getKeyPathsForOwner`, Redis value used only if `===` an own key) |
| V5 Input Validation | yes | `keyformat.detect` strict regexes; size cap on file read and response body; `isSafeGitValue` unchanged |
| V6 Cryptography | yes | Transit `aes256-gcm96`, non-exportable. No local crypto. TLS with a pinned private CA. |
| V7 Error Handling & Logging | yes | Reason classes only; SecretsSweepSpec proves it; client sees one fixed code |
| V9 Communications | yes | `https:` only, `ca` pin, hostname verification (`ERR_TLS_CERT_ALTNAME_INVALID` on mismatch, verified) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token, ciphertext or key in logs/Slack/build log | Information disclosure | Fixed reason-class vocabulary; SecretsSweepSpec fake-value sweep; no `e.message`/body logging |
| Credentials sent to a spoofed OpenBao | Spoofing | `https` + pinned `BAO_CACERT` + SAN check; refuse `http:` |
| Plaintext key on disk (temp file, swap of a write) | Information disclosure | Memory → `ssh-add -` stdin; Buffers zeroed; agent socket in a 0700 dir |
| Passphrase handed to a Transit attempt or a hostile remote | Information disclosure | Agent env has no `SSH_ASKPASS`/`GIT_KEY_PASSPHRASE`; `BatchMode=yes`; `GIT_ASKPASS=false` kept |
| OpenBao hang stalls builds/API | Denial of service | `AbortSignal.timeout` per request, one retry, async (event loop free) |
| Cross-owner ciphertext swap on Gluster | Tampering | Accepted residual, same as legacy (Open Question 1 offers a header binding) |
| Inherited agent from the container env | Elevation | `baseEnv()` deletes `SSH_AUTH_SOCK`/`SSH_AGENT_PID` |

## Sources

### Primary (HIGH confidence)
- Repo source read this session: `lib/thinx/rsakey.js` (581-682), `lib/thinx/git.js` (1-571), `lib/thinx/secrets.js` (1-51), `lib/router.rsakey.js` (1-132), `lib/thinx/notifier.js`, `lib/thinx/redis-health.js`, `lib/thinx/builder.js` (700-790, 990-1060), `lib/thinx/github_link.js` (95-140), `spec/jasmine/SecretsSweepSpec.js`, `GitSpec.js`, `03-RsakeySpec.js`, `docker-compose.test.yml`, `.circleci/config.yml` (686-1000), `Dockerfile`, `base/Dockerfile`, both consoles' deploy-key code.
- thinx-swarm read this session: `openbao/policies/thinx-api.hcl:1-19`, `scripts/openbao-bootstrap.sh:226-245`, `tests/openbao-api-wiring.test.sh:1-312`, `scripts/openbao-verify.sh:34-42,349-362`, `scripts/openbao-common.sh:572-595`, `thinx.yml:232-312`, `errorpage.yml`, `traefik.yml:105`.
- Local probes (throwaway containers, removed afterwards; no production contact): `openbao/openbao:2.7.1` dev / dev-tls server (AppRole custom ids, login fields, encrypt/decrypt shape, 403 on renew/lookup/revoke-self, 503 sealed, 400 bad secret/ciphertext, SAN list, AAD vs rewrap); `dhi.io/node:26-alpine3.24-dev` (ssh-agent/ssh-add PKCS#8/PKCS#1, `IdentitiesOnly` behaviour against a real sshd, `git clone` via agent); Node https with a forge CA (pin, system-trust refusal, overlap bundle, `AbortSignal.timeout`); a compose pair with a named-volume CA.
- Phase 39 artifacts: `39-06-SUMMARY.md`, `39-CONTEXT.md`, `39-RESEARCH.md:185`, `.planning/runbooks/openbao.md` §10.

### Secondary (MEDIUM confidence)
- OpenBao API docs (openbao.org/api-docs) could not be fetched (JS-rendered page). Every API behaviour above was instead verified empirically against the exact 2.7.1 image.

### Tertiary (LOW confidence)
- None relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Built-ins and existing deps; versions read from the images.
- Architecture: HIGH. Identity selection, agent lifecycle, OpenBao semantics and the compose pattern were each executed.
- Pitfalls: HIGH. Each is tied to a file:line read this session; A1/A2 are flagged ASSUMED.

**Research date:** 2026-10-19
**Valid until:** 2026-11-18 (stable; re-check if OpenBao moves past 2.7.1 or the base image's OpenSSH changes)
