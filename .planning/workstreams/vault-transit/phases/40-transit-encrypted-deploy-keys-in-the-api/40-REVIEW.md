---
phase: 40-transit-encrypted-deploy-keys-in-the-api
reviewed: 2026-10-19T09:49:44Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - .circleci/config.yml
  - docker-compose.test.yml
  - docker-swarm.yml
  - lib/thinx/transit.js
  - lib/thinx/keyformat.js
  - lib/thinx/rsakey.js
  - lib/thinx/git.js
  - lib/thinx/builder.js
  - lib/thinx/github_link.js
  - lib/router.rsakey.js
  - thinx-core.js
  - scripts/openbao-dev.sh
  - spec/fixtures/fake-transit.js
  - spec/fixtures/mock-openbao.js
  - spec/jasmine/03-RsakeySpec.js
  - spec/jasmine/GitSpec.js
  - spec/jasmine/SecretsSweepSpec.js
  - spec/jasmine/TransitIntegrationSpec.js
  - spec/jasmine/TransitSpec.js
  - spec/jasmine/KeyFormatSpec.js
  - spec/jasmine/GitHubLinkSpec.js
  - spec/jasmine/BuilderRemoteJobSpec.js
  - spec/node/DeployKeyNames.test.js
  - services/console/src/app/js/controllers/DeploykeyController.js
  - services/console/src/test/deploykey.cjs
  - services/console/vue/src/pages/Profile/Profile.vue
  - services/console/vue/src/pages/Rsakeys/Rsakeys.vue
  - services/console/vue/tests/unit/deploy-key-actions.cjs
  - services/console/vue/tests/unit/github-token-scopes.cjs
  - /Users/sychram/Repositories/thinx-swarm/tests/openbao-api-wiring.test.sh
  - /Users/sychram/Repositories/thinx-swarm/thinx.yml
findings:
  critical: 1
  warning: 2
  info: 8
  total: 11
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-10-19T09:49:44Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Scope: the phase diff `3e605630..HEAD` in the parent repo, console commits `ec63c74..7e3d1fe`, and thinx-swarm
commit `8cfa7dd`. I read the production paths in full: `transit.js`, `keyformat.js`, the Phase 40 parts of
`git.js`, `rsakey.js`, `builder.js`, `github_link.js`, `router.rsakey.js` and `thinx-core.js`. I checked the spec
and fixture files only for whether the tests are reliable.

The secret-handling discipline holds up under tracing:
- No log line, Slack text or HTTP body carries a token, role/secret id, ciphertext or plaintext.
- `ssh-agent` and `ssh-add` get a `PATH`-only (plus socket) env.
- The PEM reaches the agent on stdin only.
- `baseEnv()` strips any inherited agent.
- The agent directory is removed and the decrypted buffer zeroed in `finally`.
- TLS trusts only `BAO_CACERT`.

The kill switch and the 503 `key_service_unavailable` path are wired the same way in both routers and both
consoles. The API routers do not use the Traefik `error-pages-middleware`, so the JSON 503 body reaches the
consoles.

Main defect: the new in-process key-file read (`keyformat.readKey`) uses a blocking `open(2)` on entries of the
shared key volume. A FIFO there freezes the whole API event loop, and I reproduced this locally. Two robustness
issues are in the outage path: the build-log attribution can be wrong, and Transit keys get no short-circuit when
OpenBao is down.

Not verified: an end-to-end SSH clone through `AGENT_SSH_COMMAND`. Every spec stubs `cloneHoldingLock`, and the
production check is still queued as end-of-phase UAT (40-05-SUMMARY).

## Critical Issues

### CR-01: `keyformat.readKey` blocks the API event loop forever on a FIFO in `ssh_keys`

**File:** `lib/thinx/keyformat.js:56` (called from `lib/thinx/git.js:782` in `fetchHoldingLock`)
**Issue:** `readKey` calls `fs.openSync(path, "r")` on the main thread. It relies on the later `fstatSync` to
reject anything that is not a regular file (comment at lines 49-50). But `open(2)` with `O_RDONLY` on a FIFO blocks
until a writer appears, so the `fstat` check is never reached.

The module's own header treats the directory as untrusted ("shared, historically world-writable volume"). On
production it is the GlusterFS `thinx/ssh_keys` tree, which `thinx_worker` also mounts read-write through
`/mnt/gluster/thinx`. One `mkfifo /mnt/data/ssh_keys/<owner>-<digits>` is therefore enough: the next keyed fetch
for that owner (build, source add, device attach) hangs the whole Node process. That takes down HTTP on
7442/7443, socket.io and MQTT handling. The process stays alive, so Swarm does not restart it.

Before Phase 40 the same file was only opened by `ssh -i` inside the git child, which the git timeout bounds and
which does not block the API. This contradicts the CONTEXT rule for unknown or corrupt files ("skip and log,
never crash") and is worse than a crash.

Reproduced locally with `mkfifo k; node -e 'require("./lib/thinx/keyformat.js").readKey("k")'`: the call never
returned, a 500 ms timer never fired, and the run was killed at 5 s.
**Fix:** Open non-blocking, so a FIFO open returns at once and the existing `fstat` check rejects it (verified
locally: `isFile=false`, no hang). Regular files are unaffected by `O_NONBLOCK`:
```js
fd = fs.openSync(String(filePath), fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
```
Add a GitSpec/KeyFormatSpec case with a `mkfifo` entry next to the existing `adir`/`dangling` cases (expect
`not_regular`).

## Warnings

### WR-01: "deploy key unavailable" is logged even when the build failed for another reason

**File:** `lib/thinx/git.js:786,807` and `lib/thinx/builder.js:1017-1018`
**Issue:** `fetchHoldingLock` records the first Transit decrypt failure in `keyUnavailable` and returns it whenever
no attempt succeeded, even after other keys were really tried and failed for unrelated reasons.

Example: an owner has an undecryptable Transit key and a legacy key. OpenBao is down, the legacy key clones, and
the clone fails with `branch_not_found` or `repo_not_found_or_no_access`. The build log still gets exactly one
cause line: `deploy key unavailable: key service unreachable`. The user and operator are then sent to OpenBao
for a typo in the branch name.

D-04 scopes the line to "a keyed build that fails **because no key could be decrypted**". The implementation
writes it when *any* key could not be decrypted.
**Fix:** Return `keyUnavailable` only when no clone attempt was made at all, or when every attempted key failed
at decryption. Track `let attempted = false;`, set it before each `cloneHoldingLock` call (legacy, keyless and
Transit-after-decrypt), then:
```js
return { ok: false, keyUnavailable: attempted ? null : keyUnavailable };
```
Or keep the current return and change the builder sentence so it does not claim to be the cause, for example
"note: a deploy key was skipped: <sentence>".

### WR-02: Each Transit key repeats the full login/retry cycle during an outage, under the checkout lock

**File:** `lib/thinx/git.js:779-788` (with `lib/thinx/transit.js:264-284`)
**Issue:** When OpenBao is stalled (TCP accepted, no answer) or blackholed, every Transit key goes through its own
`_withRetry`: up to login + op + login + op at 3 s each, which is 12 s per key.

The loop never learns that the failure is service-wide. An owner with N Transit keys waits up to 12·N s before
reaching a legacy key or failing. This is plausible: the GitHub-link flow mints a new key every time the existing
ones are "in use elsewhere".

That wait happens:
- inside the per-directory checkout lock;
- in user-facing request paths: `sources.js:293` (source add) and `devices.js:81` (attach) await `git.fetch`
  within the HTTP request;
- with 2-4 log lines and repeated logins per key.

D-02 asks that "a build never hangs on OpenBao". Each key is bounded, but the total is not.
**Fix:** After the first Transit failure whose reason is service-level (`unreachable`, `sealed`, `tls`,
`not_configured`, `denied`), skip decrypt for the remaining Transit keys in this fetch. Log them with the same
reason, and go straight to the legacy keys:
```js
if (key.kind === "transit") {
	if (serviceDown) { console.log(`[git] key ${name} skipped: deploy key unavailable: ${serviceDown}`); continue; }
	const attempt = await this.transitAttempt(...);
	if (attempt.ok) return { ok: true, keyUnavailable: null };
	if (attempt.unavailable && attempt.unavailable !== "bad_ciphertext") serviceDown = attempt.unavailable;
	...
}
```

## Info

### IN-01: Agent socket readiness is probed with `lstat`, which can succeed before `listen()`

**File:** `lib/thinx/git.js:198-208,397-398`
**Issue:** `waitForSocket` returns as soon as the socket inode exists. `ssh-agent` creates it in `bind()`, just
before `listen()`. An `ssh-add` that connects in that window gets `ECONNREFUSED`, and the key is skipped as
`agent_load_failed`. The window is microseconds, so this is a rare flake rather than a bug.
**Fix:** Treat the socket as ready only when a connect succeeds: try `net.connect(sock)` in the poll loop. Or
retry `loadIntoAgent` once on failure.

### IN-02: The decrypted key's raw response bytes are never zeroed

**File:** `lib/thinx/transit.js:185,189,152`
**Issue:** `decryptKey` documents that its caller zeroes the returned Buffer, and `withAgent` does. But two
wipeable copies of the base64 private key stay in the heap until GC: the response `chunks` Buffers and the
`Buffer.concat` result. The encrypt request body `data` is a JS string holding the base64 plaintext, and strings
cannot be wiped. This does not leak to logs, disk or env, but it is weaker than the zeroing the code advertises.
**Fix:** Keep the concatenated Buffer in a variable and call `fill(0)` on it and on each chunk after
`JSON.parse`. Note in the header that the JSON and string copies cannot be wiped.

### IN-03: `readKey` turns a legacy (possibly unencrypted) PEM into a JS string before classifying it

**File:** `lib/thinx/keyformat.js:66-67,74`
**Issue:** The `finally` zeroes `buf` because "a legacy file may hold an unencrypted key". But
`buf.toString("utf8", …)` has already made an unwipeable string copy of the whole file, including pre-2022
unencrypted `ssh-keygen -N ""` keys. The fill therefore achieves nothing for those keys.
**Fix:** Classify on the Buffer. Check whether the first non-whitespace bytes are `vault:v` or
`-----BEGIN … PRIVATE KEY-----` with a bounded slice, and stringify only the Transit case.

### IN-04: An explicit `:443` in `BAO_ADDR` silently becomes port 8200

**File:** `lib/thinx/transit.js:139`
**Issue:** WHATWG `URL` drops a scheme's default port: `new URL("https://h:443").port === ""` (verified).
`Number(url.port || 8200)` then connects to 8200. Production uses `:8200`, so nothing breaks today. A future
`BAO_ADDR=https://openbao.internal:443` would fail as `unreachable` with no hint why.
**Fix:** Default to 8200 only when the original string has no port:
`port: url.port ? Number(url.port) : (/:\d+(\/|$)/.test(String(this.addr)) ? 443 : 8200)`.
Or document that BAO_ADDR must carry a non-443 port.

### IN-05: Every HTTP 400 on decrypt is classified `bad_ciphertext`, which the incident tracker ignores

**File:** `lib/thinx/transit.js:211,316`
**Issue:** OpenBao answers 400 for more than corrupt ciphertext. Examples are a missing or renamed transit key
("encryption key not found") and, after Phase 41 rotation, ciphertext below `min_decryption_version`. Both are
`bad_ciphertext` here, and `_fail` drops that class. So a fleet-wide decrypt failure caused by key configuration
never raises the D-05 Slack alert, and every build says "stored key could not be decrypted".
**Fix:** Look at the 400 body's `errors[0]` text internally, without logging it. Map key-level messages
("encryption key not found", "decryption version") to a separate reason that does feed `_fail`. Or count
`bad_ciphertext` per window and alert past a threshold.

### IN-06: `transportReason` has a dead branch

**File:** `lib/thinx/transit.js:82-83`
**Issue:** `if (UNREACHABLE_CODES.has(c)) return "unreachable"; return "unreachable";`. The set lookup changes
nothing, so the set reads as if unknown codes were classified differently.
**Fix:** Drop the set and keep the fallthrough with its comment, or return `server_error` for codes outside the
set.

### IN-07: The dev OpenBao is published on all host interfaces with a fixed root token

**File:** `docker-compose.test.yml:299-300`, `scripts/openbao-dev.sh:17-18,47-49`
**Issue:**
- `ports: - '8200'` publishes the dev server on `0.0.0.0:<random>` with root token `thinx-ci-bao-root`. A laptop
  running `scripts/openbao-dev.sh up` exposes a root-token OpenBao to the local network. The data is throwaway,
  but this is still an open root endpoint.
- On Linux, `openbao-dev.sh` uses the predictable `${TMPDIR:-/tmp}/thinx-openbao-dev`. In a shared `/tmp`
  another user can pre-create that directory before `chmod 700`.
**Fix:** Use `'127.0.0.1::8200'`, and make the state dir with `mktemp -d`, recording its path, or fail if it
already exists and is not owned by `$USER`.

### IN-08: A Transit key that decrypts but cannot be loaded leaves no reason in the build log

**File:** `lib/thinx/git.js:757-766`, `lib/thinx/builder.js:1017`
**Issue:** `agent_start_failed` / `agent_load_failed` reach only the API console log. For example, `ssh-agent` is
missing from the base image, or the plaintext is not a valid PEM. `keyUnavailable` stays null, so an owner whose
only keys are Transit keys sees a bare `error` state with no explanation.
**Fix:** Return `{ ok: false, unavailable: null, agentFailure: e.code }` and log a fixed sentence such as
"deploy key could not be loaded" when no clone was attempted. This reuses the WR-01 "attempted" tracking.

---

_Reviewed: 2026-10-19T09:49:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
