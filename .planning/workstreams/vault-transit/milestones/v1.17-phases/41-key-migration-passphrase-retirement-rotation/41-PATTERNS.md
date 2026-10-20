# Phase 41: Key Migration, Passphrase Retirement & Rotation - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 22 (new + modified, both repos)
**Analogs found:** 21 / 22. All analog paths are git-tracked. Checked with `git ls-files` in thinx-device-api and in thinx-swarm.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/migrate-deploy-keys.js` (NEW) | CLI utility (in-task) | batch / file-I/O + request-response (Transit) | `scripts/purge-orphaned-rsa-keys.js` (CLI/report), `lib/thinx/keyformat.js` (bounded read), `lib/thinx/rsakey.js:498-525` (atomic replace) | exact (CLI), role-match (I/O) |
| `lib/thinx/transit.js` (MOD: `rewrapKey`, D-13 class, `err.op`) | service client | request-response | itself: `_encryptOnce`/`_decryptOnce`/`_classify`/`_fail` | exact |
| `lib/thinx/git.js` (MOD: delete legacy path, D-09 skip, T-40-12) | service | request-response | itself: lines 841-844 (unknown-skip branch) | exact |
| `lib/thinx/rsakey.js` (MOD: delete `keyPassphrase()` 96-107, reword 603) | service | CRUD | n/a (deletion) | n/a |
| `scripts/purge-orphaned-rsa-keys.js` (MOD: header 10-14) | CLI | batch | n/a (comment) | n/a |
| `Dockerfile:63`, `Dockerfile.test:127-128`, `docker-compose.yml:174`, `docker-compose.test.yml:127`, `docker-swarm.yml:33,105-106,330,359` (MOD) | config | n/a | n/a (line deletions) | n/a |
| `docker-compose.test.yml` + `scripts/openbao-dev.sh` (MOD: dev admin token for rotation spec) | config | n/a | existing BAO_* wiring in the same files | exact |
| `spec/fixtures/fake-transit.js` (MOD: `rewrapKey`, `rotate()`, `minDecryption`) | test fixture | in-memory | itself | exact |
| `spec/fixtures/mock-openbao.js` (MOD: rewrap route, too-old / key-not-found 400s) | test fixture | request-response | itself: `OPS` + `defaultAnswer` | exact |
| `spec/jasmine/MigrateDeployKeysSpec.js` (NEW) | test (unit) | file-I/O | `spec/node/DeployKeyNames.test.js` (tmp-dir + FakeTransit fixture), `spec/jasmine/TransitSpec.js` (chai/jasmine shape) | role-match |
| `spec/jasmine/TransitRotationSpec.js` (NEW) | test (integration) | request-response | `spec/jasmine/TransitIntegrationSpec.js` | exact |
| `spec/jasmine/TransitSpec.js` (MOD: rewrap, retired_version, latch) | test (unit) | request-response | itself (`harness`, `reasonOf`) | exact |
| `spec/jasmine/GitSpec.js`, `KeyFormatSpec.js`, `03-RsakeySpec.js`, `SecretsSweepSpec.js`, `spec/node/DeployKeyNames.test.js` (MOD) | test | n/a | themselves | exact |
| `spec/node/PassphraseRetired.test.js` (NEW) | test (static gate) | file scan | `spec/node/CiPipelineGates.test.js` (node:test + fs/path header) | role-match |
| `package.json` (MOD: add to `test:node`, line 36) | config | n/a | line 36 | exact |
| thinx-swarm `thinx.yml:46-47,256,292` (MOD) | config | n/a | n/a (deletion) | n/a |
| thinx-swarm `tests/openbao-api-wiring.test.sh` (MOD: flip KEPT→ABSENT) | test (gate) | transform (jq) | itself, lines 80-88, 165-166, 204-207 | exact |
| thinx-swarm `scripts/openbao-verify.sh:36,354` (MOD) | ops script | request-response | itself, lines 354-357 | exact |
| `.planning/runbooks/openbao.md` (MOD: §11, new §12) | docs | n/a | existing §6/§11 | exact |
| Audit notification for quarantine (D-03) | service call | event | `lib/thinx/audit.js:60` `log(owner, message, flag, cb)` | role-match |

## Pattern Assignments

### `scripts/migrate-deploy-keys.js` (CLI, batch + file-I/O)

**Analog:** `scripts/purge-orphaned-rsa-keys.js` (123 lines)

**Header and arg parsing** (lines 1-57). Copy the doc block (modes, flags, "Usage (inside the API container)"), `'use strict'`, and flag parsing:
```javascript
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const JSON_OUT = args.includes('--json');
if (args.includes('--help') || args.includes('-h')) { console.log([ 'Usage: ...', ... ].join('\n')); process.exit(0); }
const RSAKey = require('../lib/thinx/rsakey.js');
const rsakey = new RSAKey();               // rsakey.ssh_keys = the key dir
```
For this script the modes are `--dry-run | --migrate | --rewrap | --report`, and the default should be the non-writing mode, like `--scan` in the analog.

**Report pattern** (lines 88-122). Build one `report` object, print `JSON.stringify(report, null, 2)` for `--json`, otherwise print aligned `[migrate-deploy-keys] label :` lines, and end with an explicit `process.exit(code)`. The explicit exit matters (RESEARCH Pitfall 7): the Transit shared client and its timers must not keep the process alive. The abort path prints `console.error('[purge-orphaned-rsa-keys] aborted:', result); process.exit(1);` with a class only, never a message. The report shape is in RESEARCH §Code Examples (lines 554-569).

**Bounded read.** The script needs the legacy text, but `keyformat.readKey` zeroes it. Mirror `lib/thinx/keyformat.js` lines 33-43 and 55-85: `OPEN_FLAGS = O_RDONLY | O_NONBLOCK`, `fstatSync(fd).isFile()`, the `MAX_KEY_FILE_BYTES` cap via `readBounded(fd)`, and `buf.fill(0)` plus `closeSync` in `finally`. Reuse `keyformat.detect(text)` and `keyformat.MAX_KEY_FILE_BYTES` (both exported, line 87); do not re-implement the regexes.

**Atomic replace.** Analog `lib/thinx/rsakey.js:498-525` (`replacePublicKey`):
```javascript
const tmp_path = this.ssh_keys + "/." + filename + ".pub." + crypto.randomBytes(6).toString("hex") + ".tmp";
fs.writeFileSync(tmp_path, text, { flag: "wx", mode: mode });
fs.chmodSync(tmp_path, mode); // the umask may have narrowed the create mode
if (typeof stillListed === "function") { const state = stillListed(); if (state !== true) { fs.unlinkSync(tmp_path); return ...; } }
fs.renameSync(tmp_path, pub_path);
// catch: if (!e || e.code !== "EEXIST") try { fs.unlinkSync(tmp_path) } catch {}
```
Adapt it as follows: the suffix is `.keymig.tmp`, the mode is fixed `0o600`, the write is `openSync(tmp,"wx",0o600)` then write, `fsyncSync`, `closeSync`, and the pre-rename check is the hash re-check plus `.pub` exists (RESEARCH Pattern 2 steps 1-6). Use `rsakey.keyStillListed(owner, filename, pub_path)` (rsakey.js:490-496) for the "still listed" predicate. It returns `null` on an unknown state, which means do not rename.

**Transit use.** Call `Transit.shared()` or `new Transit()` (transit.js:86-116), then `encryptKey(buf)`, `decryptKey(ct)` → Buffer (the caller zeroes it), and the new `rewrapKey(ct)`. Compare the decrypted bytes with `crypto.timingSafeEqual`. To inject a fake in specs, follow DeployKeyNames: put the script's work in an exported function that takes `{ sshKeysDir, transit, audit }`, and keep the CLI wrapper thin (`if (require.main === module)`).

---

### `lib/thinx/transit.js` (service client, request-response)

**Analog:** itself.
- **New op `rewrap`.** Copy `_decryptOnce` (lines 341-347) and the public `decryptKey` (379-383). Validate the input prefix with `/^vault:v[1-9][0-9]*:/` (`_rejectInput("rewrap","bad_ciphertext")`), then `this._op("rewrap", () => this._withRetry((token) => this._rewrapOnce(token, ct)))`. RESEARCH lines 309-316 sketch the body. Update the header comment (lines 4-7) to list four calls.
- **D-13 class.** Add the reason to `REASONS` (36-44) and `SENTENCES` (59-66). In `_classify` (204-213), add a branch before line 211: `s === 400 && (op === "decrypt" || op === "rewrap") && Array.isArray(r.json && r.json.errors) && r.json.errors.includes(ERR_TOO_OLD)`. Compare by equality and never log the string. Also map `op === "rewrap"` 400 to `bad_ciphertext` like decrypt. Optional: `key_missing` for "encryption key not found", plus git.js `SERVICE_DOWN_REASONS` (git.js:29).
- **Incident gate.** `_fail` (315-321) returns early for `bad_ciphertext`. Add the new class there, or route it to a separate per-process latch (`this._retiredAlerted`) that posts once through `_post` (304-313) and is never cleared by `_ok` (323-329). Spec this explicitly (RESEARCH Pattern 4, the flapping pitfall).
- **IN-10.** Set `err.op` on the TransitError in `_logFailure` / `_op` / `_login` (225-249). The `TransitError` constructor is at lines 68-75.
- **Log discipline (lines 18-22).** The only line format is `"[transit] <op> failed: <reason> status=<n>"` (`_logFailure`, 215-217).

---

### `lib/thinx/git.js` (service, legacy removal)

**Analog:** the existing unknown-skip branch, lines 841-844:
```javascript
if (key.kind !== "legacy") {
	console.log(`[git] key ${name} skipped: ${key.cause}`);
	continue;
}
```
Change the condition to `key.kind !== "transit"` and derive the cause as `legacy_format_unsupported` when `key.kind === "legacy"`. Delete lines 845-860 (the askpass clone block). Also delete `sshEnv()` (457-467), `create_askfile`/`delete_askfile` (~656-672) and `ASKPASS_PREFIX`. Check `Git.SSH_COMMAND` usage and the `readSecret` import before removing them. **T-40-12:** line ~801 `console.log(\`[git] fetch attempt with key ${name} failed: ${e && e.message}\`)` becomes a fixed token. The neighbouring `e.code` branch (798-799) is the style to copy.

---

### `spec/fixtures/fake-transit.js` (fixture)

**Analog:** itself (72 lines). Copy the `encryptKey`/`decryptKey` shape (49-67): a `calls` counter, `_maybeFail(op)`, a `_store` Map, and a hard-coded `"vault:v1:"` prefix. Add `this.version = 1`, `this.minDecryption = 1`, and `rotate()` (version++). Encrypt emits `"vault:v" + this.version + ":"`. Decrypt and rewrap parse vN, and when vN < minDecryption they throw `new TransitError(<D-13 class>, 400)`. Add `rewrapKey(ct)`, which resolves `{ ciphertext, version }`, add `rewrap` to the `calls` object and `failOps`, and extend `STATUS` (line 25).

### `spec/fixtures/mock-openbao.js` (fixture)

**Analog:** itself. Add `"/v1/transit/rewrap/thinx-deploy-keys": "rewrap"` to `OPS` (71-75) and `rewrap: 0` to `counters` (101). Copy the decrypt branch of `defaultAnswer` (127-131) for rewrap, and add `key_version` to the response the way encrypt does (125). Add `rewrap` to the token check at 118-120. The scripted too-old error uses the existing `script(fn)` hook: `{status:400, body:{errors:["ciphertext or signature version is disallowed by policy (too old)"]}}`. No new mechanism is needed.

### `spec/jasmine/TransitRotationSpec.js` (integration)

**Analog:** `spec/jasmine/TransitIntegrationSpec.js` lines 1-60. Copy the header comment, `WIRED`/`IN_CI`, `guard()` (pending locally, `fail` under CircleCI), `slackStub()`, `makeTransit()` with `{slackNotify, webhook:null}`, and `reasonOf()`. Add a dev admin-token env for rotate/config, and lower `min_decryption_version` again in `afterAll` (Pitfall 5: the dev server is shared).

### `spec/jasmine/MigrateDeployKeysSpec.js` (unit)

**Analogs:** the `spec/node/DeployKeyNames.test.js` fixture (lines 7-36) and `spec/jasmine/TransitSpec.js` (lines 1-45, chai `expect` and a log sink).
```javascript
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'thinx-home-'));
process.env.HOME = TEST_HOME;   // before any lib/ require (WR-05)
function fixture(transitOptions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thinx-keys-'));
  const key = Object.create(RSAKey.prototype); key.ssh_keys = dir; key.transit = new FakeTransit(transitOptions);
  return {dir, key};
}
```
Generate synthetic keys at test time with `crypto.generateKeyPairSync("rsa", {modulusLength: 2048})` and export them as encrypted pkcs8 / pkcs1 / OpenSSH (mock-openbao.js:25-31 shows the generator). Never commit key material.

### `spec/node/PassphraseRetired.test.js` (static gate)

**Analog:** `spec/node/CiPipelineGates.test.js` lines 6-16 (`node:assert/strict`, `node:test`, paths resolved from `__dirname + "/../../"`). Body: RESEARCH lines 586-592 (`git grep` over lib, scripts, the Dockerfiles, the compose files and docker-swarm.yml). Wrap the call because exit 1 means no match. Register the file in `package.json` line 36 `test:node`, next to `spec/node/DeployKeyNames.test.js`.

---

### thinx-swarm `tests/openbao-api-wiring.test.sh` (gate, jq)

**Analog:** itself.
- **Line 80-81 `API_SECRETS`:** drop `"GIT_KEY_PASSPHRASE"` from the array and from the ok text.
- **Lines 87-88:** invert into `PASSPHRASE_ABSENT`, in the same `jq -e ... && ok X || bad Y` style:
```bash
jq -e '(.secrets | has("GIT_KEY_PASSPHRASE") | not) and (.services.api.secrets | index("GIT_KEY_PASSPHRASE") == null) and ([.services.api.environment[] | select(startswith("GIT_KEY_PASSPHRASE="))] | length == 0)' "$c" >/dev/null \
  && ok PASSPHRASE_ABSENT "$l" || bad PASSPHRASE_PRESENT "$l"
```
  The model is the KEYGEN_SWITCH check (lines 89-91).
- **Self-test CASES (165-166):** flip to `passphrase-env-readded|.services.api.environment += ["GIT_KEY_PASSPHRASE=${GIT_KEY_PASSPHRASE}"]` and `passphrase-secret-readded|.services.api.secrets += ["GIT_KEY_PASSPHRASE"]`. The format is `name|jq-expr`.
- **Live check (204, 207):** change `length == 1` to `length == 0`, add an Env-key check on `.Spec` (and report `.PreviousSpec` separately), and update the expected `ADD` string and message on line 207. Also update the `JQ_STRIP`/`NORM` baselines and the header (13-14).

### thinx-swarm `scripts/openbao-verify.sh`

**Analog:** itself, lines 354-357 (the `for n in ...` loop with `obc_ok`/`obc_bad`). Remove `GIT_KEY_PASSPHRASE` from the loop and add one absence check in the same style:
```bash
jq -e '[.[0].Spec.TaskTemplate.ContainerSpec.Secrets[]? | select(.SecretName == "GIT_KEY_PASSPHRASE")] | length == 0' >/dev/null <<<"$s" \
  && obc_ok API_PASSPHRASE_ABSENT "$API_SVC" || obc_bad API_PASSPHRASE_STILL_MOUNTED
```
Env checks print names only, as in line 359 (`split("=")[0]`). Update header line 36.

## Shared Patterns

### Output discipline (no secret material)
**Source:** `lib/thinx/transit.js:18-22`, `lib/thinx/keyformat.js:12-14,80`
**Apply to:** the migration script, transit.js, git.js, every spec and gate. Log classes and counts only. Never log PEM, ciphertext, passphrase, `e.message` from crypto/Transit, or paths in quarantine entries (owner and key id only). Zero buffers with `fill(0)` in `finally`.

### Error class model
**Source:** `TransitError` (transit.js:68-75); `reason` is checked, the message is always `"transit_" + reason`.
**Apply to:** the new reason class, the `rewrapKey` failures, and the FakeTransit `STATUS` map.

### Slack alert / incident
**Source:** `transit.js` `_post` (304-313), `_fail` (315-321), `_ok` (323-329). Every spec injects `slackNotify` stubs (TransitSpec `harness`, lines 16-31).

### Owner notification (D-03)
**Source:** `lib/thinx/audit.js:60` `log(owner, message, flag, callback)`. Use a fixed sentence and flag `warning` (RESEARCH OQ-1). The script must wait for the callback before `process.exit`.

### Live ops commands (runbook / plan actions)
Always use the literal `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 '...docker exec "$C" node scripts/migrate-deploy-keys.js --dry-run --json'` form (RESEARCH lines 571-583). Make one `docker service update` per change, from a 0600 spec backup. Never `stack deploy`/`restart.sh`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| OpenSSH → PKCS#8 conversion (inside `migrate-deploy-keys.js`) | utility | file-I/O on `/dev/shm` | No code in the repo runs `ssh-keygen -p -m PKCS8`. Use RESEARCH Pattern 1 (lines 243-281) and an `execFile` without a shell. |

## Metadata

**Analog search scope:** `scripts/`, `lib/thinx/`, `spec/fixtures/`, `spec/jasmine/`, `spec/node/`, `package.json`, the compose files and Dockerfiles; thinx-swarm `tests/`, `scripts/`, `thinx.yml`
**Files scanned:** ~18
**Pattern extraction date:** 2026-10-20
