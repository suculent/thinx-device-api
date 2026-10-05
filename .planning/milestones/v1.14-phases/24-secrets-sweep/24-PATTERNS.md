# Phase 24: Secrets Sweep - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 17
**Analogs found:** 17 / 17 (submodules need an inline helper, no shared module there)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/thinx/messenger.js` (128, 147 SLACK_BOT_TOKEN) | service | request-response | `lib/thinx/database.js:16-17` | exact |
| `lib/router.slack.js` (29 SLACK_CLIENT_SECRET) | route | request-response | `lib/thinx/git.js:245` | exact |
| `lib/thinx/notifier.js` (43, 257 SLACK_WEBHOOK) | service | event-driven | itself (already has "not set" info log) + `database.js` | exact |
| `lib/thinx/redis-health.js` (44 SLACK_WEBHOOK) | service | event-driven | itself (`opts.webhook` injection, line 44/61) | exact |
| `lib/router.github.js` (40/44/172) | route | request-response | `globals.js:98-104` (guarded use) | exact |
| `lib/router.google.js` (29, module load) | route | request-response | `globals.js:98-104` | role-match |
| `lib/thinx/owner.js` (13, module load) | service | CRUD | `globals.js:98-104` | role-match |
| `lib/thinx/transfer.js` (12, module load) | service | CRUD | same as owner.js | role-match |
| `lib/thinx/globals.js` (153-155 Rollbar) | config | transform | `globals.js:98-104` (same file) | exact |
| `lib/thinx/queue.js` (451-452 WORKER_SECRET) | service | event-driven | `git.js:245` | exact |
| `lib/thinx/builder.js` (309 WORKER_SECRET) | service | request-response | `git.js:245` | exact |
| `lib/thinx/rsakey.js` (28 GIT_KEY_PASSPHRASE) | utility | transform | `git.js:15,245` (D-04: must match) | exact |
| `services/worker/class.js:1`, `services/worker/worker.js:11` | service (submodule) | event-driven | `services/worker/worker.js:11-14` + `lib/thinx/secrets.js` | role-match |
| `services/transformer/app.js:11` | service (submodule) | request-response | same as worker.js | role-match |
| `docker-swarm.yml` | config | - | its own `secrets:` block lines 37-43 and api `secrets:` 221-224 | exact |
| `spec/jasmine/*` new "both absent" specs (e.g. `SecretsSweepSpec.js` or per-module additions) | test | - | `spec/jasmine/SecretsSpec.js`, `spec/jasmine/GitSpec.js:538-546` | exact |

## Pattern Assignments

### Core read pattern (all `lib/` files)

**Source:** `lib/thinx/secrets.js` lines 20-51 — `readSecret(name, defaultValue)` returns file > env > default (default `null`), cached per name, `_resetCacheForTests()` exported.

**Import** (`lib/thinx/git.js:15`, `database.js:6`):
```js
const { readSecret } = require("./secrets.js"); // #418: Docker secrets > env
```
Routers in `lib/` use `require("./thinx/secrets.js")`.

**Guarded use + fallback** (`lib/thinx/globals.js:96-104`):
```js
const { readSecret } = require("./secrets.js");
const redis_password = readSecret("REDIS_PASSWORD");
if (redis_password) {
  config.password = redis_password;
} else if (...) { ... }
```
**Inline use with falsy default** (`lib/thinx/git.js:245`):
```js
GIT_KEY_PASSPHRASE: readSecret("GIT_KEY_PASSPHRASE") || ""
```
Replace `process.env.X` with `readSecret("X")` at each use site (D-01). Replace the verbose
`typeof (process.env.X) !== "undefined" && ... !== null` checks (messenger.js:128/147,
router.github.js:40, globals.js:153) with `const x = readSecret("X"); if (x) {...}`.

### D-02 "integration off" info log
**Source:** `lib/thinx/notifier.js:43-45`, `lib/thinx/redis-health.js:61`:
```js
const webhook = process.env.SLACK_WEBHOOK;
if (!webhook) {
    console.log("ℹ️ [info] [notifier.js] SLACK_WEBHOOK not set — skipping app-start notification");
```
Copy this `ℹ️ [info] [<module>] <NAME> not set — <integration> disabled` wording; name only, never value.

### Module-load readers (owner.js:11-14, transfer.js:12, router.google.js:26-30)
Current (owner.js:11-14):
```js
const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
```
Wrap: `const mailgun_key = readSecret("MAILGUN_API_KEY"); const mg = mailgun_key ? mailgun.client({...key: mailgun_key}) : null;` then log once and guard every `mg.messages.create` call site with `if (!mg)`. Google: skip building `oAuthConfig`/routes when the secret is null. Because these read at load, specs must `_resetCacheForTests()` and re-require (delete `require.cache[...]`) to test the absent case.

### `lib/thinx/globals.js:153-160` Rollbar (D-03)
```js
if ((typeof (process.env.ROLLBAR_ACCESS_TOKEN) !== "undefined") && (process.env.ROLLBAR_ACCESS_TOKEN !== null)) {
  _rollbar = new Rollbar({ accessToken: process.env.ROLLBAR_ACCESS_TOKEN, ... });
```
Becomes `const rollbar_token = readSecret("ROLLBAR_SERVER_TOKEN") || readSecret("ROLLBAR_ACCESS_TOKEN"); if (rollbar_token) {...}`. `readSecret` is already required at line 98 inside a function — hoist or re-require locally.

### `lib/thinx/rsakey.js:27-31` (D-04)
```js
static keyPassphrase() {
    const passphrase = process.env.GIT_KEY_PASSPHRASE;
    if ((typeof (passphrase) !== "string") || (passphrase.length < 1)) return null;
```
Swap to `readSecret("GIT_KEY_PASSPHRASE")`; keep the null-return guard (line 246 already refuses to generate).

### `lib/thinx/queue.js:451-453`, `builder.js:309` (WORKER_SECRET)
```js
if ((typeof (process.env.WORKER_SECRET) !== "undefined")) { socket.auth.token = process.env.WORKER_SECRET; ...
secret: process.env.WORKER_SECRET || null
```
→ `readSecret("WORKER_SECRET")` (default already null).

### Submodules `services/worker` and `services/transformer`
No `secrets.js` there. Current (`worker.js:11-14`, `transformer/app.js:11-14`):
```js
if (exists(process.env.ROLLBAR_ACCESS_TOKEN)) {
    var Rollbar = require('rollbar');
    r = new Rollbar({ accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
```
`services/worker/class.js:1` reads dead `ROLLBAR_TOKEN`. Add a minimal local `readSecret` copied from `lib/thinx/secrets.js:20-44` (fs + path-containment, file > env), then `readSecret("ROLLBAR_SERVER_TOKEN") || readSecret("ROLLBAR_ACCESS_TOKEN")`; worker also reads `WORKER_SECRET` via it wherever it validates. Commit in submodule, push, then bump pointer (Phase 23 order).

### `docker-swarm.yml`
Top-level block (lines 37-43):
```yaml
secrets:
  COUCHDB_USER:
    external: true
```
Api service (217-224):
```yaml
#    image: ${REGISTRY}/thinx/api:swarm
    image: thinxcloud/api:latest
    secrets:
      - COUCHDB_USER
```
Add external entries for SLACK_BOT_TOKEN, SLACK_WEBHOOK, GITHUB_CLIENT_SECRET, GOOGLE_OAUTH_SECRET, MAILGUN_API_KEY, ROLLBAR_SERVER_TOKEN, WORKER_SECRET, GIT_KEY_PASSPHRASE, CSRF_SECRET (SLACK_CLIENT_SECRET only if created). Api image → `${REGISTRY}/thinx/api:swarm` (D-10). Add `secrets:` lists to `worker` (line ~423; WORKER_SECRET, ROLLBAR_SERVER_TOKEN) and `transformer` (line ~177; ROLLBAR_SERVER_TOKEN) — neither has one today. Leave env lines (D-06). Note: the existing COUCHDB/REDIS mounts in yml are not live (D-08) — do not change.

### Specs
**Source:** `spec/jasmine/SecretsSpec.js:10-56` — chai `expect`, stub `fs.existsSync`/`readFileSync`, `_resetCacheForTests()` in before/afterEach, restore stubs, delete env.
```js
beforeEach(function () { origExists = fs.existsSync; origRead = fs.readFileSync; _resetCacheForTests(); });
it("returns the default when neither file nor env is present", function () {
    fs.existsSync = () => false;
    expect(readSecret(ABSENT_NAME)).to.equal(null);
```
**Real-credential save/restore** (`spec/jasmine/GitSpec.js:538-546`):
```js
saved = process.env.GIT_KEY_PASSPHRASE;
process.env.GIT_KEY_PASSPHRASE = PASS;
secrets._resetCacheForTests();
...
if (typeof (saved) === "undefined") delete process.env.GIT_KEY_PASSPHRASE; else process.env.GIT_KEY_PASSPHRASE = saved;
secrets._resetCacheForTests();
```
Warning from SecretsSpec header: never clear COUCHDB_*/REDIS_PASSWORD in specs. Always restore real names and reset cache in afterEach, or later suites (CI, ZZ-*) lose env values. Existing per-module specs to extend: `MessengerSpec.js`, `NotifierSpec.js`, `RedisHealthSpec.js` (use `opts.webhook`), `03-RsakeySpec.js`, `TransferSpec.js`, `02-OwnerSpec.js`, `ZZ-RouterOAuthSpec.js`, `QueueSpec.js`, `BuilderRemoteJobSpec.js`.

## Shared Patterns
- **Read:** `readSecret("NAME")` at use site, `lib/thinx/secrets.js:20`.
- **Absent:** one `ℹ️ [info]` log naming the integration (`notifier.js:45`), no client built with null.
- **Test cache:** `_resetCacheForTests()` (`secrets.js:47-49`).

## No Analog Found
None. Submodule helper is a copy of `lib/thinx/secrets.js`. Production rollout (`docker secret create`, `docker service update --secret-add`) is ops, not code; follow CONTEXT D-05..D-12.

## Metadata
**Search scope:** lib/, spec/jasmine/, services/worker, services/transformer, docker-swarm.yml
**Pattern extraction date:** 2026-09-29
