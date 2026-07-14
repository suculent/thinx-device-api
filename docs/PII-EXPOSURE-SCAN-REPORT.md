# PII Exposure Scan Report

**Repository:** `thinx-device-api`
**Date:** 2026-07-14
**Scope:** Static, read-only audit of git-tracked source, config, script, CI, and
data files for PII (Personally Identifiable Information) and credential exposure.
**Task:** `pii-scanner`

---

## Scope & Assumptions

- **Excluded from scan (vendored / third-party / submodules):** `node_modules/`,
  `base/`, `builders/`, all `services/*` submodules (`worker`, `transformer`,
  `redis`, `couchdb`, `console`, `broker`), `spec/test_repositories/`,
  `platforms/`, `languages/`, `design/`, `img/`, `static/`, lockfiles, and
  minified/binary assets. Findings below concern only first-party code in the
  main repo.
- **Fixture-data convention:** Test data with *obviously fake* PII (e.g. the
  fictional Czech character "Jára Cimrman", `@example.com` addresses) is rated
  **low**. Fixtures containing *realistic, real-person* PII are rated **medium**.
- **Good news up front:** The codebase already ships PII/secret redactors
  (`Util.redactEmail`, `Util.redactToken` in `lib/thinx/util.js`, tagged
  `SEC-PII-01`) and uses them in most log sites (e.g. `lib/thinx/owner.js:482,
  506, 544, 630`). User passwords are stored **hashed** (`sha256(prefix + pw)`),
  not plaintext. Docker Compose / Swarm and CircleCI use `${VAR}` interpolation
  and Docker secrets rather than inline credentials. The findings below are
  gaps against that baseline, not a systemic absence of controls.
- **No SSNs, credit-card numbers, phone numbers, street addresses, dates of
  birth, or passport/driver-license numbers** were found in first-party files.
  (Long digit runs in `codeclimate.json` are coverage percentages, not card
  numbers — excluded as false positives.)

---

## Findings

### Category: pii-in-logs

#### PL-1 — GitHub access token + user PII logged in plaintext — **HIGH**
- **file:** `lib/router.github.js`
- **line:** 112
- **detail:** `console.log("validateGithubUser", { token }, { userWrapper });`
  writes the raw GitHub OAuth token (`ghat:<access_token>`) *and* `userWrapper`
  (which carries `first_name`, `last_name`, `email`) to stdout on every GitHub
  login. A leaked token grants repo access; the log also exposes user identity.
- **recommendation:** Remove the token from the log, or redact it with the
  existing `Util.redactToken(token, "ghat:")`. Log only a non-reversible id
  (e.g. `owner_id`) instead of `userWrapper`.

#### PL-2 — Newly created API key logged in plaintext — **HIGH**
- **file:** `lib/router.apikey.js`
- **line:** 38
- **detail:** `console.log(\`ℹ️ [debug] Responding with (REMOVEME) ${JSON.stringify(response)}\`);`
  serializes the create-API-key response, which includes `api_key: object.key`
  — the live secret just issued to the caller. Already self-flagged `REMOVEME`.
- **recommendation:** Delete this debug line. If a create confirmation must be
  logged, log only the alias and `hash` (already present), never `api_key`.

#### PL-3 — Full GitHub profile object logged — **MEDIUM**
- **file:** `lib/router.github.js`
- **line:** 142
- **detail:** `console.log("🔨 [debug] ... using login: ", { hdata });` dumps the
  entire GitHub profile payload (name, email, login) when the profile has no
  `name`. The trailing code comment even notes "logs personal data".
- **recommendation:** Log only `hdata.login` (or a redacted email), not the
  whole `hdata` object.

#### PL-4 — User email logged unredacted on parse error — **MEDIUM**
- **file:** `lib/router.github.js`
- **line:** 149
- **detail:** `console.log("☣️ [error] [github] [token] error parsing e-mail: " + e + " email: " + email);`
  emits the raw email. A redactor exists and is used elsewhere.
- **recommendation:** Use `Util.redactEmail(email)`.

#### PL-5 — Attempted API key logged / persisted to audit log — **MEDIUM**
- **file:** `lib/thinx/apikey.js`
- **line:** 151, 158, 172
- **detail:** `log_invalid_key()` calls `this.alog.log(owner, "Attempt to use invalid API Key: " + apikey, ...)`
  (persists the key material into the audit-log store) and
  `console.log(\`⚠️ [warning] Invalid API key request with owner ${owner} and key ${apikey}\`)`
  / `console.log(\`⚠️ [warning] APIKey '${apikey}' not found.\`)` print candidate
  keys. A mistyped-but-otherwise-valid key, or a real key that failed lookup due
  to a transient error, is written in the clear to logs and audit storage.
- **recommendation:** Redact via `Util.redactToken(apikey)` before logging, and
  store only a hash/prefix in the audit log rather than the full key.

#### PL-6 — Login username (may be email) logged — **LOW**
- **file:** `lib/router.auth.js`
- **line:** 293
- **detail:** `console.log(\`🔨 [debug] [auth] Username/password login attempt for: ${username}\`);`
  — `username` may be an email address for OAuth-linked accounts.
- **recommendation:** Redact conditionally (`Util.redactEmail`) or log the
  resolved `owner_id` instead.

#### PL-7 — Password-change diff logged (hashed value) — **LOW**
- **file:** `lib/thinx/owner.js`
- **line:** 594
- **detail:** `console.log("Cannot edit user on password-set", { _in_err }, "changes", changes);`
  — `changes` includes the new `password` field. It is already a `sha256` hash
  (not plaintext), so exposure is limited, but logging password fields at all is
  a smell and can aid offline attacks.
- **recommendation:** Strip the `password` key from `changes` before logging.

---

### Category: env-secret

#### ES-1 — CircleCI echoes the Redis password into build logs — **MEDIUM**
- **file:** `.circleci/config.yml`
- **line:** ~296 (`Inject password to configuration and broker` step)
- **detail:** `echo "Injecting secret: ${REDIS_PASSWORD}"` prints the real Redis
  password to the CI build log. Anyone with read access to the pipeline (or a
  leaked log artifact) recovers the credential.
- **recommendation:** Remove the value from the echo (e.g. `echo "Injecting Redis
  secret..."`). Never echo secret env vars.

#### ES-2 — CircleCI dumps the entire `.env` into build logs — **MEDIUM**
- **file:** `.circleci/config.yml`
- **line:** ~285 (`cat ./.env` under "Contents of ./.env")
- **detail:** `cat ./.env` prints every environment value (DB passwords, cookies,
  secrets) to the build log.
- **recommendation:** Delete the `cat ./.env` debug step, or pipe through a
  redactor that masks values.

#### ES-3 — Device API key hardcoded in tracked build template — **MEDIUM**
- **file:** `builder.thinx.json`, `builder.thinx.dist.json`
- **line:** `THINX_API_KEY` / `THINX_OWNER` fields
- **detail:** Both tracked files embed a 64-hex `THINX_API_KEY` and owner hash.
  `.gitignore` lists `builder.thinx.json`, but the file is nonetheless tracked
  (the ignore has no effect on an already-committed file), so the key ships in
  every clone. If this key is valid against staging, it is a live credential.
- **recommendation:** Rotate the key if it is real; replace with a `%%PLACEHOLDER%%`
  in the `.dist` template; `git rm --cached builder.thinx.json` to stop tracking
  the non-dist copy (history-rewrite to purge is out of autonomous scope — flag
  for maintainer).

#### ES-4 — Reusable default secret in `.env.dist` — **LOW**
- **file:** `.env.dist`
- **line:** `WORKER_SECRET=twilight_zone` (also `COUCHDB_PASS=rtmtest`,
  `COOKIE/SECRET=changeme!`)
- **detail:** Sample/dist file, so low severity, but `WORKER_SECRET=twilight_zone`
  is a concrete-looking value an operator might deploy unchanged, unlike the
  obvious `changeme!` placeholders.
- **recommendation:** Replace with an obvious placeholder like
  `WORKER_SECRET=<generate-a-random-secret>` to force operators to set it.

---

### Category: hardcoded-pii

#### HP-1 — Real third-party personal email in test fixture — **MEDIUM**
- **file:** `spec/mock-git-response.json`
- **line:** 153–154
- **detail:** Fixture contains `"name": "Mikuláš Sychra"` with
  `"email": "mikulas.sychra@gmail.com"` — a real personal Gmail address of a
  real individual, committed as GitHub-API mock data.
- **recommendation:** Replace with obviously-synthetic data (e.g.
  `test.user@example.com`). Prefer `@example.com` per RFC 2606 for all fixtures.

#### HP-2 — Maintainer email in fixtures & Dockerfiles — **LOW**
- **file:** `spec/mock-git-response.json` (multiple), `Dockerfile:3`,
  `Dockerfile.test:3`, `base/Dockerfile:3`
- **detail:** `suculent@me.com` appears as commit-author fixture data and as the
  `LABEL maintainer=` value. Maintainer labels are conventional and this is the
  project owner's own address; low risk, noted for completeness.
- **recommendation:** No action required for the Docker `LABEL` (standard
  practice). Optionally scrub the address from the mock JSON.

#### HP-3 — Fixture user with fictional-but-structured PII — **LOW**
- **file:** `_envi.json`, `spec/_envi.json`, `conf/.sample_user`
- **line:** `email`/`first_name`/`last_name`/`username` blocks
- **detail:** Test users use the fictional Czech character "Jára Cimrman"
  (`cimrman@thinx.cloud`) and `@example.com` addresses — obviously fake. These
  files also embed sample API keys / owner hashes (`ak`, `THINX_API_KEY`), but
  the identity data itself is not real PII.
- **recommendation:** Acceptable as-is (obviously fake). If desired, migrate all
  fixture emails to `@example.com` for consistency.

#### HP-4 — Realistic email literal in redaction unit test — **LOW**
- **file:** `spec/jasmine/UtilSpec.js`
- **line:** 171, 205
- **detail:** `Util.redactEmail("matej.sychra@tmcoy.cz")` uses a real-looking
  name against a fake domain (`tmcoy.cz`). It is testing the redactor, so
  exposure is minimal.
- **recommendation:** Optionally switch to `user@example.com` for the assertion.

---

### Category: unencrypted-storage

#### US-1 — Weak password hashing scheme — **MEDIUM**
- **file:** `lib/thinx/owner.js`
- **line:** 634, 665 (`password: sha256(prefix + rbody.password)`); comparison in
  `lib/router.auth.js:213`
- **detail:** Passwords are stored as a single unsalted-per-user `sha256(prefix + password)`.
  The global `prefix` acts as a pepper but there is no per-user salt and SHA-256
  is a fast hash — offline brute-force / rainbow-table resistance is far weaker
  than a purpose-built KDF. Not plaintext (so not critical), but below modern
  standards for credential storage.
- **recommendation:** Migrate to `bcrypt`, `scrypt`, or `argon2` with a per-user
  salt, ideally via a transparent rehash-on-login upgrade path.

#### US-2 — Raw API key persisted to audit log — **MEDIUM**
- **file:** `lib/thinx/apikey.js`
- **line:** 158
- **detail:** See PL-5 — `alog.log(owner, "Attempt to use invalid API Key: " + apikey)`
  writes candidate key material into the audit-log store unencrypted/unhashed.
- **recommendation:** Store only a hash or truncated prefix of the key in audit
  records.

---

### Category: gitignore-gap

#### GI-1 — `.env.*` variants not ignored — **MEDIUM** *(remediated in this PR)*
- **file:** `.gitignore`
- **detail:** Only `.env` was ignored; `.env.local`, `.env.production`, etc. were
  not, risking accidental commit of real per-environment secrets.
- **recommendation:** Added `.env.*` with `!.env.dist` / `!.env.sample`
  negations (applied in this PR).

#### GI-2 — `*.pem` / `*.key` not globally ignored — **MEDIUM** *(remediated in this PR)*
- **file:** `.gitignore`
- **detail:** Only `dhparams.pem` was ignored; any newly generated private key or
  certificate would be committable. (Already-tracked cert-probe fixture `.pem`
  files under `spec/fixtures/cert-probe/` are public **certificates only** — no
  private keys — and remain tracked; the new rule does not untrack them.)
- **recommendation:** Added `*.pem` and `*.key` (applied in this PR).

#### GI-3 — `credentials.*` / `secrets.*` not ignored — **MEDIUM** *(remediated in this PR)*
- **file:** `.gitignore`
- **detail:** Common secret-file names were uncovered.
- **recommendation:** Added `credentials.*` and `secrets.*` (applied in this PR).

#### GI-4 — Data-dump extensions not ignored — **LOW** *(remediated in this PR)*
- **file:** `.gitignore`
- **detail:** `*.sql`, `*.csv`, `*.xlsx` (common PII-bearing exports) were not
  ignored. None are currently tracked, so this is preventive.
- **recommendation:** Added `*.sql`, `*.csv`, `*.xlsx` (applied in this PR).

---

## Summary

### By category
| Category | Count |
|---|---|
| pii-in-logs | 7 |
| env-secret | 4 |
| hardcoded-pii | 4 |
| unencrypted-storage | 2 |
| gitignore-gap | 4 |
| **Total** | **21** |

### By severity
| Severity | Count |
|---|---|
| critical | 0 |
| high | 2 |
| medium | 10 |
| low | 9 |
| **Total** | **21** |

### Highest-priority actions
1. **PL-1** — stop logging the raw GitHub token + user object (`lib/router.github.js:112`).
2. **PL-2** — delete the `REMOVEME` debug line that logs the plaintext API key
   (`lib/router.apikey.js:38`).
3. **ES-1 / ES-2** — stop echoing `${REDIS_PASSWORD}` and `cat ./.env` in CI.
4. **ES-3** — rotate and untrack the hardcoded `THINX_API_KEY` in
   `builder.thinx.json` if it is a live credential.
5. **US-1** — migrate password storage from single-round SHA-256 to a proper KDF.

### Remediation applied in this PR
- `.gitignore` hardened to cover `.env.*`, `*.pem`, `*.key`, `credentials.*`,
  `secrets.*`, and `*.sql` / `*.csv` / `*.xlsx` (GI-1…GI-4). No application
  source was modified. Removing already-tracked secrets from history and
  rotating live credentials require maintainer action and are out of autonomous
  scope.
