# Phase 40: Transit-Encrypted Deploy Keys in the API - Pattern Map

**Mapped:** 2026-10-19
**Files analyzed:** 22
**Analogs found:** 20 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/thinx/transit.js` (NEW) | service/client | request-response (HTTPS) + event (incident alert) | `lib/thinx/redis-health.js` (Slack/incident), `../thinx-swarm/tests/openbao-api-wiring.test.sh:242-262` (pinned-CA https) | role-match |
| `lib/thinx/keyformat.js` (NEW) | utility | transform (pure) | `RSAKey.validateKeyName` in `lib/thinx/rsakey.js` (pure `{ok,reason}` check) | partial |
| `lib/thinx/rsakey.js` (MOD: generate/create) | service | file-I/O | itself, lines 580-634 / 639-680 | exact |
| `lib/thinx/git.js` (MOD: AGENT_SSH_COMMAND, agentEnv, baseEnv, fetchDetailed) | service | process spawn / file-I/O | itself, lines 198-265, 539-571 | exact |
| `lib/thinx/builder.js` (MOD: D-04 log line) | service | batch | itself, lines 724-751, 1004-1008 | exact |
| `lib/thinx/github_link.js` (MOD: 503 mapping) | service | request-response | itself, line 113-116 | exact |
| `lib/router.rsakey.js` (MOD: 503) | route | request-response | itself, `createRSAKey` lines 8-30, rename handler 53-58 | exact |
| `services/console/vue/src/pages/Rsakeys/Rsakeys.vue` (MOD) | component | request-response | itself, lines 136-148 | exact |
| `services/console/src/app/js/controllers/DeploykeyController.js` (MOD) | component | request-response | itself, lines 58-100 | exact |
| `services/console/vue/tests/unit/deploy-key-actions.cjs` (MOD) | test | — | itself | exact |
| `services/console/src/test/deploykey.cjs` (MOD) | test | — | itself | exact |
| `spec/jasmine/TransitSpec.js` (NEW) | test (unit, mocked https) | request-response | `spec/jasmine/RedisHealthSpec.js` (injected slackNotify), `SecretsSweepSpec.js` harness | role-match |
| `spec/jasmine/TransitIntegrationSpec.js` (NEW) | test (integration) | request-response | `spec/jasmine/GitSpec.js` (real resources, skip-guarded) | partial |
| `spec/jasmine/KeyFormatSpec.js` (NEW) | test | transform | `spec/jasmine/SecretsSpec.js` | role-match |
| `spec/jasmine/GitSpec.js` (MOD) | test | — | itself (fixture line 72) | exact |
| `spec/jasmine/03-RsakeySpec.js` (MOD, case 11 rewrite) | test | — | itself lines 217-229 | exact |
| `spec/jasmine/SecretsSweepSpec.js` (MOD) | test | — | itself (`withSecrets` 54, `freshRequire` 114, `captureLogs` 156; case 826-838) | exact |
| `docker-compose.test.yml` (MOD: openbao + openbao-setup) | config | — | its own `influxdb` / `influxdb-setup` pair, lines 243-290 | exact |
| `.circleci/config.yml` (MOD: start openbao + setup before tests) | config | — | existing influxdb-setup run step in `test` job | exact |
| `docker-swarm.yml` + `../thinx-swarm/thinx.yml` (MOD: `THINX_DEPLOY_KEYGEN=enabled`) | config | — | `THINX_MQTT_DEVICE_WRITES=1` (`docker-swarm.yml:363`, `thinx.yml:283`) | exact |
| `../thinx-swarm/tests/openbao-api-wiring.test.sh` (MOD: retire scope_guard, allow env) | test (shell gate) | — | itself, `scope_guard` lines 115-123, `cmd_source` 125-141, `cmd_self_test` 143+ | exact |
| Kill-switch reader (inside `rsakey.js`) | utility | config read | `Messenger.mqttDeviceWritesEnabled()` `lib/thinx/messenger.js:505-508` | exact |

## Pattern Assignments

### `lib/thinx/transit.js` (service, request-response + incident alert)

**Analog A (incident/Slack, injectable factory):** `lib/thinx/redis-health.js` (tracked)

Imports + options seam (lines 20, 45-73):
```javascript
const { readSecret } = require('./secrets.js'); // #418: Docker secrets > env
...
function attach(client, opts) {
    opts = opts || {};
    const webhook = ('webhook' in opts) ? opts.webhook : readSecret('SLACK_WEBHOOK');
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    let slackFactory = opts.slackNotify;
    if (!slackFactory) {
        try { slackFactory = require('slack-notify'); }
        catch (e) { console.log('☣️ [error] [redis-health] slack-notify package unavailable:', ...); }
    }
    if (!webhook) console.log('ℹ️ [info] [redis-health] SLACK_WEBHOOK not set — Redis outage notifications disabled');
    let inOutage = false;
    const slack = (webhook && slackFactory) ? slackFactory(webhook) : null;
```
Safe async post (lines 76-93) - copy verbatim, change username/text:
```javascript
    function postSafely(text) {
        if (!slack) return;
        try {
            const sendResult = slack.send({ text, username: 'redis-health', icon_emoji: ':rotating_light:', channel: '#thinx' });
            if (sendResult && typeof sendResult.catch === 'function') {
                sendResult.catch((e) => console.log('☣️ [error] [redis-health] SlackNotify.send failed (async):', ...));
            }
        } catch (e) { console.log('☣️ [error] [redis-health] SlackNotify.send threw:', ...); }
    }
```
Deviation: do NOT log `e.message` from https; log only `[transit] <op> failed: <reason> status=<n>`. Message text from RESEARCH Pattern 3 (Phase 39 style). Do NOT require `notifier.js` (pulls globals/database/couch).

**Analog B (pinned-CA https call):** `../thinx-swarm/tests/openbao-api-wiring.test.sh:242-262` (in-task node snippet) and RESEARCH "Code Examples" `call()` - use `https.request` with `ca`, `rejectUnauthorized: true`, `signal: AbortSignal.timeout(3000)`, 64 KiB body cap, resolve `{status,json}` or `{code}`.

**Secrets:** `readSecret('BAO_ROLE_ID')`, `readSecret('BAO_SECRET_ID')` from `lib/thinx/secrets.js` (exports `readSecret`, `_resetCacheForTests`, line 51). Export a singleton plus the class for tests.

---

### `lib/thinx/keyformat.js` (utility, pure transform)
No direct analog; use RESEARCH Pattern 1 verbatim (`detect(text) -> "transit"|"legacy"|"unknown"`). Style: CommonJS `module.exports = { detect }`, as `secrets.js:51`.

---

### `lib/thinx/rsakey.js` (service, file-I/O) - modify `generate()` / `create()`

**Current passphrase gate to remove for new keys** (lines 585-591):
```javascript
const passphrase = RSAKey.keyPassphrase();
if (passphrase === null) {
    console.log("ℹ️ [info] [rsakey] GIT_KEY_PASSPHRASE not set — deploy-key generation disabled");
    return callback(new Error("GIT_KEY_PASSPHRASE is not set; refusing to generate a deploy key"));
}
```
**Encoding step to change** (lines 593-605): drop `cipher`/`passphrase` from `privateKeyEncoding`; make the callback async and `await this.transit.encryptKey(Buffer.from(privateKey))` before the write.

**Keep exactly - WR-02/03 write block** (lines 614-632):
```javascript
let openssh_key; let privateStage = false;
try {
    openssh_key = RSAKey.toOpenSSH(publicKey, name || "thinx-" + date) + "\n";
    privateStage = true;
    fs.writeFileSync(private_path, privateKey, { flag: "wx", mode: 0o600 });   // -> ct + "\n"
    fs.chmodSync(private_path, 0o600);
    fs.writeFileSync(public_path, openssh_key);
    fs.chmodSync(public_path, 0o644);
} catch (e) {
    if (privateStage && e.code !== "EEXIST") { try { fs.unlinkSync(private_path); } catch { } }
    return callback(e);
}
callback(null, openssh_key, privateKey);   // do NOT return plaintext PEM any more
```
**create()** (lines 639-680): kill switch goes first, before `reserveIdentifier` (line 651). Map `err.code === 'key_service_unavailable'` after `releaseIdentifier(i_owner, date)` (pattern at line 660) to `callback(false, "key_service_unavailable")`.

**Kill switch reader** - copy `lib/thinx/messenger.js:505-508`:
```javascript
static mqttDeviceWritesEnabled() { return process.env.THINX_MQTT_DEVICE_WRITES === "1"; }
```
-> `static deployKeygenEnabled() { return process.env.THINX_DEPLOY_KEYGEN !== "disabled"; }` (unset = enabled; never `BAO_*`/`VAULT_*`).

**Test seam:** mirror `git.js:476-479` lazy `this.rsa` - `this.transit` defaults to the singleton, overridable in specs.

---

### `lib/thinx/git.js` (service, process spawn)

**Constant ssh command pattern** (lines 198-215) - add `AGENT_SSH_COMMAND` next to it (RESEARCH Pattern 5), same constant-string/env-only rule:
```javascript
static get SSH_COMMAND() {
    return 'ssh -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o "GlobalKnownHostsFile=$THINX_GIT_SEEDED_KNOWN_HOSTS" -o "UserKnownHostsFile=$THINX_GIT_LEARNED_KNOWN_HOSTS" -i "$THINX_GIT_KEY"';
}
```
**baseEnv** (lines 247-254) - add `delete env.SSH_AUTH_SOCK; delete env.SSH_AGENT_PID;`:
```javascript
baseEnv() {
    const env = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "false" });
    delete env.GIT_KEY_PASSPHRASE;
    return env;
}
```
**sshEnv** (lines 256-265) - template for `agentEnv(sock, pubPath)`: same `Object.assign(this.baseEnv(), {...})` but no `SSH_ASKPASS*`, no `GIT_KEY_PASSPHRASE`.

**Try-each-key loop** (lines 539-570) - becomes `fetchDetailed()`; `fetch()` keeps boolean contract (`sources.js:293`, `devices.js:81`):
```javascript
fetch(owner, url, branch, buildPath) {
    return withCheckoutLock(buildPath, () => this.fetchHoldingLock(owner, url, branch, buildPath));
}
...
for (const name of await this.orderKeys(owner, names)) {
    const keyPath = path.join(this.options.sshKeysDir, name);
    let askpass = null;
    try {
        askpass = this.create_askfile();
        if ((await this.cloneHoldingLock(buildPath, url, branch, this.sshEnv(keyPath, askpass))).ok === true) {
            this.rememberKey(owner, name); return true;
        }
    } catch (e) {
        console.log(`[git] fetch attempt with key ${name} failed: ${e.message}`);
    } finally { if (askpass !== null) this.delete_askfile(askpass); }
}
```
Insert per key: read file (cap 64 KiB) -> `keyformat.detect` -> unknown: log + continue; legacy: existing body; transit: decrypt -> agent (RESEARCH Pattern 4) -> `cloneHoldingLock(..., this.agentEnv(sock, pub))` -> `finally` kill agent, `rmSync(dir)`, `buf.fill(0)`. Never log env.

---

### `lib/thinx/builder.js` (D-04)
Failure site (lines 1004-1008):
```javascript
if (!(await this.prefetchPrivate(br, BUILD_PATH, sanitized_url, sanitized_branch))) {
    blog.state(build_id, owner, udid, "error");
    return callback(false, "git_fetch_failed");
}
```
Add `blog.log(build_id, owner, udid, "deploy key unavailable: " + sentence)` before `blog.state`. `prefetchPrivate` (724-751) stays CouchDB-free; return the reason via out-param.

---

### `lib/router.rsakey.js` (route)
Copy the special-code-then-generic shape from `renameRSAKey` (lines 53-57):
```javascript
rsakey.rename(owner, filename, body.name, (success, response, reason) => {
    if (success) return Util.responder(res, true, response);
    if (response === "invalid_key_name") return invalidKeyName(res, reason);
    if (response === "key_not_found") return Util.failureResponse(res, 404, "key_not_found");
    Util.failureResponse(res, 500, "rename_failed");
});
```
In `createRSAKey` (line 21-24 callback) add: `if (!success && response === "key_service_unavailable") return Util.failureResponse(res, 503, "key_service_unavailable");`

### `lib/thinx/github_link.js`
Line 113-116 `createAndPush`: branch on `info === "key_service_unavailable"` -> `callback({ status: 503, success: false, response: "key_service_unavailable" })` before the existing 500 `rsa_key_creation_failed`.

---

### Consoles
**Vue** `Rsakeys.vue` lines 143-147 - add a branch beside `invalid_key_name`:
```javascript
if (result && result.response === 'invalid_key_name') { this.createServerReason = ...; return; }
this.error = 'Could not generate the deploy key. Try again.';
```
-> `if (result && result.response === 'key_service_unavailable') { this.error = "Deploy keys can't be created right now, try again later."; return; }`

**Legacy** `DeploykeyController.js`: use `showCreateError( sentence )` (lines 66-71, text-only, toastr) in the `.done` non-success branch and in `.fail` via `error.responseJSON.response` (503 path; `xhrFailed` only redirects on 401). Fixed sentence constant alongside `CREATE_FAILED`.
Tests: extend `vue/tests/unit/deploy-key-actions.cjs` and `src/test/deploykey.cjs` (plain node, `node:assert/strict`).

---

### Specs
- **TransitSpec.js**: copy injection style from `spec/jasmine/RedisHealthSpec.js` (H1-H4: fake `slackNotify` factory recording `send` payloads, injected `now`); mint CA/leaf at runtime with `node-forge` (no committed keys).
- **SecretsSweepSpec.js**: reuse `withSecrets(spec, fn)` (line 54; `"absent"` / `{env}` / `{file}` entries), `freshRequire(relPath, stubs)` (114), `captureLogs(fn)` (156); usage at 239-240. Rewrite 826-838 per RESEARCH Pitfall 4; add BAO_ROLE_ID/BAO_SECRET_ID/token/ciphertext never-logged cases.
- **GitSpec.js** line 72: `fs.writeFileSync(path.join(keysDir, "k1"), "not a real key\n", { mode: 0o600 })` -> PEM-armored placeholder; add transit + unknown fixtures.
- **03-RsakeySpec.js** (11) lines 217-229: rewrite to "passphrase set + Transit down -> refuse, no private file"; set `rsakey.transit = fake` for 300/03/03b/06/07/14.

---

### `docker-compose.test.yml`
Copy the `influxdb-setup` one-shot (lines 261-290):
```yaml
  influxdb-setup:
    image: influxdb:2.9.1
    depends_on: [influxdb]
    networks: [internal]
    restart: "no"
    entrypoint:
      - sh
      - -c
      - >-
        i=0; until influx ping --host http://influxdb:8086 >/dev/null 2>&1;
        do i=$$((i+1)); [ $$i -gt 60 ] && exit 1; sleep 1; done;
        influx setup ... --token thinx-ci-influx-token
```
and the api env comment style (lines 169-173: "throwaway for that ephemeral CI instance, never a production credential"). Full openbao/openbao-setup body: RESEARCH "CI compose services" (`hostname: openbao`, named volume `openbao-devtls`).

### Swarm env mirror
`docker-swarm.yml:363` and `../thinx-swarm/thinx.yml:283` both carry `- "THINX_MQTT_DEVICE_WRITES=1"`; add `- "THINX_DEPLOY_KEYGEN=enabled"` adjacent. Note: `../thinx-swarm/docker-swarm.yml` does not exist - the `docker-swarm.yml` mirror is the parent-repo file.

### `../thinx-swarm/tests/openbao-api-wiring.test.sh`
Scope guard to retire/bound (lines 115-123):
```bash
scope_guard() { # scope_guard PARENT_REPO PARENT_BASE   Phase 40/41 paths untouched ...
  ch=$(git -C "$r" diff --name-only "$b" -- lib/thinx/rsakey.js lib/thinx/git.js package.json package-lock.json)
  ... bad SCOPE_PHASE40_FILE_CHANGED
  added=$( ... | grep -iE 'openbao|vault|transit|bao' || true)  # transit.js would trip this
  ... bad SCOPE_NEW_DEPENDENCY
}
```
Called from `cmd_source` line 140. Contract allowed-additions (around line 194, `^(BAO|VAULT)_` = `BAO_ADDR,BAO_CACERT`) must also allow `THINX_DEPLOY_KEYGEN`; extend `cmd_self_test` (143+) with a mutation case. Output vocabulary: `ok NAME "detail"` / `bad NAME "detail"`.

## Shared Patterns

### Secrets
**Source:** `lib/thinx/secrets.js` (`readSecret(name, default)`, file then env, cached; `_resetCacheForTests`). Apply to transit.js (BAO_ROLE_ID, BAO_SECRET_ID, SLACK_WEBHOOK).

### Error/response shape
**Source:** `Util.failureResponse(res, status, code)` / `Util.responder(res, success, response)` in `lib/router.rsakey.js`. Codes only, no internal detail.

### Logging
Emoji-prefixed module-tagged lines (`ℹ️ [info] [rsakey] ...`, `☣️ [error] [redis-health] ...`). For Transit: reason class + status only; never env, body, token, ciphertext, plaintext ("Never log env" rule in git.js).

### Env flags read at call time
**Source:** `lib/thinx/messenger.js:505-508`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| per-attempt ssh-agent helper (in `git.js`) | utility | process lifecycle | No ssh-agent use exists; follow RESEARCH Pattern 4 |
| `lib/thinx/keyformat.js` | utility | transform | No format detector; RESEARCH Pattern 1 |

## Metadata
**Analog search scope:** `lib/`, `lib/thinx/`, `spec/jasmine/`, `services/console/{vue,src}`, `docker-compose.test.yml`, `docker-swarm.yml`, `../thinx-swarm/{thinx.yml,tests/}`
**Files scanned:** ~20
**Pattern extraction date:** 2026-10-19
