# Structured Logger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `console.log/warn/error` calls across `lib/` with a Winston logger singleton that writes colorized output to the console and plain-text events to the stats log file.

**Architecture:** A new singleton `lib/thinx/logger.js` exports one Winston instance with two transports — Console (all levels) and File (`warn`+ only, plain-text format matching the existing `statistics.js` line parser). Every `lib/` file replaces its `console.*` calls with `logger.*`; lines containing stats event keywords and `[OID:]` must use `logger.warn` so they survive the `parse_oid()` filter in `statistics.js`.

**Tech Stack:** Winston 3.x, Node.js (existing), Jasmine/Chai (existing test framework)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `lib/thinx/logger.js` | Winston singleton, two transports |
| Modify | `package.json` | Add `winston` dependency |
| Modify | `lib/thinx/globals.js` | Replace 24 console calls |
| Modify | `lib/thinx/builder.js` | Replace 87 console calls; stats events → `warn` |
| Modify | `lib/thinx/device.js` | Replace 90 console calls; stats events → `warn` |
| Modify | `lib/thinx/messenger.js` | Replace 62 console calls |
| Modify | `lib/thinx/owner.js` | Replace 58 console calls |
| Modify | `lib/thinx/apikey.js` | Replace console calls |
| Modify | `lib/thinx/notifier.js` | Replace console calls |
| Modify | `lib/thinx/devices.js` | Replace console calls |
| Modify | `lib/thinx/statistics.js` | Replace console calls (stats.js itself uses console — safe to replace) |
| Modify | `lib/thinx/influx.js` | Replace console calls |
| Modify | `lib/router.auth.js` | Replace console calls; LOGIN_INVALID → `warn` |
| Modify | `lib/router.*.js` (remaining 12) | Replace console calls |
| Modify | `lib/thinx/*.js` (remaining ~15) | Replace console calls |
| Create | `spec/jasmine/LoggerSpec.js` | Unit test for logger module |

---

## Stats Event Lines — Must Use `logger.warn`

These specific lines contain `[OID:...]` + a stats keyword. They **must** be `logger.warn`, not `logger.info`, because `statistics.js:parse_oid()` skips lines containing `[info]`.

| File | Line(s) | Keyword |
|---|---|---|
| `lib/router.auth.js` | 199, 204 | `LOGIN_INVALID` |
| `lib/router.auth.js` | 282 | `LOGIN_INVALID` |
| `lib/thinx/device.js` | 406 | `DEVICE_CHECKIN` |
| `lib/thinx/device.js` | 974 | `DEVICE_NEW` |
| `lib/thinx/builder.js` | 240 | `BUILD_FAILED` |
| `lib/thinx/builder.js` | 256 | `BUILD_STARTED` |
| `lib/thinx/builder.js` | 363 | `BUILD_COMPLETED` |

All other `[OID:]`-tagged lines (NEW_SESSION, TRANSFER_ACCEPT, DEVICE_ATTACH, etc.) are not tracked by `statistics.js` and can use `logger.info`.

---

## Task 1: Install Winston and create logger singleton

**Files:**
- Modify: `package.json`
- Create: `lib/thinx/logger.js`

- [ ] **Step 1: Add winston to package.json dependencies**

In `package.json`, add `"winston": "^3.17.0"` to the `dependencies` object (alphabetically between `"ws"` and `"yaml"`):

```json
"winston": "^3.17.0",
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: winston appears in `node_modules/winston/`, no errors.

- [ ] **Step 3: Write the failing test for the logger**

Create `spec/jasmine/LoggerSpec.js`:

```js
const logger = require('../../lib/thinx/logger');

describe("Logger", function () {

  it("(01) should export a logger object", function () {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it("(02) should not throw when logging at each level", function () {
    expect(() => logger.info("test info")).not.toThrow();
    expect(() => logger.warn("test warn")).not.toThrow();
    expect(() => logger.error("test error")).not.toThrow();
  });

  it("(03) should have at least two transports (console + file)", function () {
    expect(logger.transports.length).toBeGreaterThanOrEqual(2);
  });

});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx jasmine spec/jasmine/LoggerSpec.js
```

Expected: FAIL — `Cannot find module '../../lib/thinx/logger'`

- [ ] **Step 5: Create `lib/thinx/logger.js`**

```js
/*
 * Shared Winston logger instance.
 *
 * Console transport: all levels (colorized in development).
 * File transport: warn+ only, plain-text format for statistics.js line parser.
 *
 * Stats event lines (e.g. "[OID:xxx] [BUILD_STARTED]") must be logged at
 * logger.warn(), not logger.info(), because statistics.js:parse_oid() skips
 * lines containing "[info]".
 */

const winston = require('winston');
const path = require('path');

const Globals = require('./globals.js');
const DATA_ROOT = Globals.app_config().data_root;
const LOG_FILE = path.join(DATA_ROOT, 'statistics', 'latest.log');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Plain-text format for the file transport — must match what statistics.js parses
const fileFormat = printf(({ level, message, timestamp: ts }) => {
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
});

// Human-readable format for the console
const consoleFormat = process.env.ENVIRONMENT === 'development'
  ? combine(colorize(), timestamp(), printf(({ level, message, timestamp: ts }) => `[${ts}] ${level}: ${message}`))
  : combine(timestamp(), printf(({ level, message, timestamp: ts }) => `[${ts}] [${level.toUpperCase()}] ${message}`));

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(errors({ stack: true }), timestamp()),
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new winston.transports.File({
      filename: LOG_FILE,
      level: 'warn',
      format: fileFormat
    })
  ]
});

module.exports = logger;
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx jasmine spec/jasmine/LoggerSpec.js
```

Expected: 3 specs, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/thinx/logger.js spec/jasmine/LoggerSpec.js
git commit -m "feat: add winston logger singleton with console and file transports"
```

---

## Task 2: Replace console calls in `lib/thinx/globals.js`

**Files:**
- Modify: `lib/thinx/globals.js`

`globals.js` has 24 console calls. It is required by `logger.js` itself, so it **cannot** require logger (circular dependency). Leave `globals.js` console calls as-is, or replace only with direct `process.stdout.write` if needed. Actually — leave `globals.js` using `console.log`; it is infrastructure-level bootstrap code that runs before the logger is usable.

- [ ] **Step 1: Verify no circular dependency risk**

`globals.js` → no `require('./logger')` — fine.
`logger.js` → `require('./globals.js')` — fine.
If `globals.js` were to `require('./logger')`, it would cause a circular dep. It will not.

- [ ] **Step 2: No changes needed**

`globals.js` keeps its `console.log` calls. It is boot-time infrastructure; structured logging does not apply here.

- [ ] **Step 3: Commit note**

No commit needed for this task.

---

## Task 3: Replace console calls in `lib/thinx/statistics.js`

**Files:**
- Modify: `lib/thinx/statistics.js`

`statistics.js` has a small number of its own `console.log` calls (for internal debug/error messages). These are safe to replace with `logger.*`. Note: `statistics.js` **reads** the log file — it does not write to it via the logger; the file transport in the logger writes the file.

- [ ] **Step 1: Add logger import to statistics.js**

At the top of `lib/thinx/statistics.js`, after the existing requires, add:

```js
const logger = require("./logger.js");
```

- [ ] **Step 2: Replace console calls in statistics.js**

Replace each `console.log` / `console.warn` / `console.error` in `lib/thinx/statistics.js`:

| Line | Old | New |
|---|---|---|
| 74 | `console.log("Stats path", ...)` | `logger.info(...)` |
| 81 | `console.log(e)` | `logger.error(e)` |
| 147 | `console.log(\`ℹ️ [info] [closeParsers]...\`)` | `logger.info(...)` — remove emoji prefix |
| 150 | `console.log(\`☣️ [error] [closeParsers]...\`)` | `logger.error(...)` — remove emoji prefix |
| 155 | `console.log(\`☣️ [error] [closeParsers]...\`)` | `logger.error(...)` — remove emoji prefix |
| 168 | `console.log(\`🔨 [debug] unlinking...\`)` | `logger.debug(...)` — remove emoji prefix |
| 222 | `console.log({ statsWriteError })` | `logger.error("statsWriteError", statsWriteError)` |
| 241 | `console.log("mkdirp(dirpath) failed with", d)` | `logger.error("mkdirp(dirpath) failed", d)` |
| 260 | `console.log("[PARSE] THiNX log not found...")` | `logger.warn(...)` |
| 306 | `console.log(error_string)` | `logger.error(error_string)` |
| 312 | `console.log("[warning] [stats]...")` | `logger.warn(...)` |
| 329 | `console.log("[AGGREGATE] THiNX log not found...")` | `logger.warn(...)` |
| 365 | `console.log("aggregate parser closed: Writing stats...")` | `logger.info(...)` |
| 398 | `console.log("ℹ️ [info] [today] Setting new exit_callback...")` | `logger.info(...)` |
| 405 | `console.log("🔨 [debug] today: Looking for file...")` | `logger.debug(...)` |
| 409 | `console.log(\`ℹ️ [info] [today] Statistics not found...\`)` | `logger.info(...)` |
| 417 | `console.log(\`ℹ️ [info] [today] [nonce]...\`)` | `logger.info(...)` |

The emoji prefixes (`ℹ️`, `☣️`, `🔨`) were manual level indicators — Winston's level does this now, so drop the emojis from the message strings.

- [ ] **Step 3: Run the stats spec to verify nothing broke**

```bash
npx jasmine spec/jasmine/ZZZ-StatisticsSpec.js
```

Expected: 8 specs, 0 failures (or same pass/fail ratio as before).

- [ ] **Step 4: Commit**

```bash
git add lib/thinx/statistics.js
git commit -m "refactor: replace console calls with logger in statistics.js"
```

---

## Task 4: Replace console calls in `lib/thinx/builder.js` (stats events critical)

**Files:**
- Modify: `lib/thinx/builder.js`

87 console calls. Contains critical stats event lines that must use `logger.warn`.

- [ ] **Step 1: Add logger import**

At the top of `lib/thinx/builder.js`, after the existing requires, add:

```js
const logger = require("./logger.js");
```

- [ ] **Step 2: Replace stats event lines with logger.warn**

These specific lines must become `logger.warn` (not `logger.info`):

```js
// line 240 — was: console.log(`[OID:${owner}] [BUILD_FAILED] REMOTE execution failed; no socket.`);
logger.warn(`[OID:${owner}] [BUILD_FAILED] REMOTE execution failed; no socket.`);

// line 256 — was: console.log(`[OID:${owner}] [BUILD_STARTED]`);
logger.warn(`[OID:${owner}] [BUILD_STARTED]`);

// line 363 — was: console.log(`[OID:${owner}] [BUILD_COMPLETED] LOCAL [builder] with code ${code}`);
logger.warn(`[OID:${owner}] [BUILD_COMPLETED] LOCAL [builder] with code ${code}`);

// line 583 — was: console.log("[builder] [BUILD_STARTED] at", start_timestamp);
logger.warn(`[BUILD_STARTED] at ${start_timestamp}`);
```

- [ ] **Step 3: Replace all remaining console.log/warn/error in builder.js with logger equivalents**

Pattern rules for the remaining ~83 calls:
- `console.log(...)` → `logger.info(...)`
- `console.warn(...)` → `logger.warn(...)`
- `console.error(...)` → `logger.error(...)`
- Lines with emoji prefix `☣️` → `logger.error(...)`, drop emoji
- Lines with emoji prefix `ℹ️` → `logger.info(...)`, drop emoji
- Lines with emoji prefix `🔨` → `logger.debug(...)`, drop emoji

- [ ] **Step 4: Run builder spec**

```bash
npx jasmine spec/jasmine/XBuilderSpec.js
```

Expected: same pass/fail count as before this change.

- [ ] **Step 5: Commit**

```bash
git add lib/thinx/builder.js
git commit -m "refactor: replace console calls with logger in builder.js"
```

---

## Task 5: Replace console calls in `lib/thinx/device.js` (stats events critical)

**Files:**
- Modify: `lib/thinx/device.js`

90 console calls. Contains `DEVICE_CHECKIN` and `DEVICE_NEW` stats event lines.

- [ ] **Step 1: Add logger import**

```js
const logger = require("./logger.js");
```

- [ ] **Step 2: Replace stats event lines with logger.warn**

```js
// line 406 — was: console.log("[OID:" + reg.owner + "] [DEVICE_CHECKIN] Checkin Existing device: " + JSON.stringify(reg.udid, null, 4));
logger.warn(`[OID:${reg.owner}] [DEVICE_CHECKIN] Checkin Existing device: ${JSON.stringify(reg.udid, null, 4)}`);

// line 974 — was: console.log(`[OID:${registration_owner}] [DEVICE_NEW]`);
logger.warn(`[OID:${registration_owner}] [DEVICE_NEW]`);
```

- [ ] **Step 3: Replace all remaining console.* in device.js**

Apply the same level-mapping rules as Task 4 for the remaining ~88 calls.

- [ ] **Step 4: Run device spec**

```bash
npx jasmine spec/jasmine/DeviceSpec.js
```

Expected: same pass/fail count as before.

- [ ] **Step 5: Commit**

```bash
git add lib/thinx/device.js
git commit -m "refactor: replace console calls with logger in device.js"
```

---

## Task 6: Replace console calls in `lib/router.auth.js` (stats events critical)

**Files:**
- Modify: `lib/router.auth.js`

Contains `LOGIN_INVALID` stats event lines.

- [ ] **Step 1: Add logger import**

`router.auth.js` is in `lib/`, not `lib/thinx/`, so the path is:

```js
const logger = require("./thinx/logger.js");
```

- [ ] **Step 2: Replace LOGIN_INVALID lines with logger.warn**

```js
// line 199 — was: console.log(`[OID:${user_data.owner}] [LOGIN_INVALID] not activated/no password.`);
logger.warn(`[OID:${user_data.owner}] [LOGIN_INVALID] not activated/no password.`);

// line 204 — was: console.log(`[OID:${user_data.owner}] [LOGIN_INVALID] Password mismatch.`);
logger.warn(`[OID:${user_data.owner}] [LOGIN_INVALID] Password mismatch.`);

// line 282 — was: console.log(`[OID:0] [LOGIN_INVALID] with username ${username}`);
logger.warn(`[OID:0] [LOGIN_INVALID] with username ${username}`);
```

- [ ] **Step 3: Replace remaining console.* in router.auth.js**

Apply level-mapping rules for the remaining calls.

- [ ] **Step 4: Run auth-related spec**

```bash
npx jasmine spec/jasmine/ZZ-AppSession.js
```

Expected: same pass/fail count as before.

- [ ] **Step 5: Commit**

```bash
git add lib/router.auth.js
git commit -m "refactor: replace console calls with logger in router.auth.js"
```

---

## Task 7: Replace console calls in remaining high-count lib/thinx files

**Files:**
- Modify: `lib/thinx/messenger.js` (62 calls)
- Modify: `lib/thinx/owner.js` (58 calls)
- Modify: `lib/thinx/influx.js`
- Modify: `lib/thinx/apikey.js`
- Modify: `lib/thinx/notifier.js`
- Modify: `lib/thinx/devices.js`

None of these contain tracked stats event keywords (their stats events go through `InfluxConnector.statsLog()` directly, not via console), so all `console.log` → `logger.info`.

- [ ] **Step 1: Add logger import to each file**

For files in `lib/thinx/`:
```js
const logger = require("./logger.js");
```

- [ ] **Step 2: Replace console.* in messenger.js**

Apply level-mapping rules to all 62 calls in `lib/thinx/messenger.js`.

- [ ] **Step 3: Replace console.* in owner.js**

Apply level-mapping rules to all 58 calls in `lib/thinx/owner.js`.

- [ ] **Step 4: Replace console.* in influx.js, apikey.js, notifier.js, devices.js**

Apply level-mapping rules to each file.

- [ ] **Step 5: Run related specs**

```bash
npx jasmine spec/jasmine/MessengerSpec.js spec/jasmine/02-OwnerSpec.js spec/jasmine/ApikeySpec.js spec/jasmine/NotifierSpec.js spec/jasmine/DevicesSpec.js spec/jasmine/InfluxSpec.js
```

Expected: same pass/fail counts as before.

- [ ] **Step 6: Commit**

```bash
git add lib/thinx/messenger.js lib/thinx/owner.js lib/thinx/influx.js lib/thinx/apikey.js lib/thinx/notifier.js lib/thinx/devices.js
git commit -m "refactor: replace console calls with logger in messenger, owner, influx, apikey, notifier, devices"
```

---

## Task 8: Replace console calls in all remaining lib/thinx/*.js files

**Files:**
- Modify: `lib/thinx/acl.js`, `lib/thinx/apienv.js`, `lib/thinx/audit.js`, `lib/thinx/auth.js`, `lib/thinx/buildlog.js`, `lib/thinx/coap.js`, `lib/thinx/database.js`, `lib/thinx/deployment.js`, `lib/thinx/gdpr.js`, `lib/thinx/git.js`, `lib/thinx/github.js`, `lib/thinx/json2h.js`, `lib/thinx/jwtlogin.js`, `lib/thinx/oauth-github.js`, `lib/thinx/platform.js`, `lib/thinx/plugins.js`, `lib/thinx/plugins/pine64/plugin.js`, `lib/thinx/queue.js`, `lib/thinx/queue_action.js`, `lib/thinx/repository.js`, `lib/thinx/rsakey.js`, `lib/thinx/sanitka.js`, `lib/thinx/sources.js`, `lib/thinx/transfer.js`, `lib/thinx/util.js`

- [ ] **Step 1: Add logger import to each file**

For `lib/thinx/plugins/pine64/plugin.js` (deeper path):
```js
const logger = require("../../logger.js");
```

For all other files in `lib/thinx/`:
```js
const logger = require("./logger.js");
```

- [ ] **Step 2: Replace console.* in each file**

Apply level-mapping rules in each file:
- `console.log(...)` → `logger.info(...)`
- `console.warn(...)` → `logger.warn(...)`
- `console.error(...)` → `logger.error(...)`
- Emoji prefixes: `☣️` → `logger.error`, `ℹ️` → `logger.info`, `🔨` → `logger.debug` (drop emoji from message)

- [ ] **Step 3: Run the full test suite**

```bash
npx jasmine
```

Expected: same aggregate pass/fail count as before this PR.

- [ ] **Step 4: Commit**

```bash
git add lib/thinx/
git commit -m "refactor: replace console calls with logger in remaining lib/thinx files"
```

---

## Task 9: Replace console calls in all remaining lib/router.*.js files

**Files:**
- Modify: `lib/router.js`, `lib/router.apikey.js`, `lib/router.build.js`, `lib/router.deviceapi.js`, `lib/router.gdpr.js`, `lib/router.github.js`, `lib/router.google.js`, `lib/router.logs.js`, `lib/router.mesh.js`, `lib/router.profile.js`, `lib/router.rsakey.js`, `lib/router.slack.js`, `lib/router.source.js`, `lib/router.user.js`

All router files are in `lib/`, so the import path is:

```js
const logger = require("./thinx/logger.js");
```

- [ ] **Step 1: Add logger import to each router file**

Add the line above to each of the 14 router files.

- [ ] **Step 2: Replace console.* in each router file**

Apply level-mapping rules. Note: `lib/router.google.js:61,113` and `lib/router.auth.js` (already done in Task 6) contain `[OID:]` lines but none of them are tracked stats event keywords — use `logger.info`.

- [ ] **Step 3: Run router-level specs**

```bash
npx jasmine spec/jasmine/ZZ-AppSession.js spec/jasmine/ZZ-RouterDeviceAPISpec.js spec/jasmine/ZZ-RouterBuilderSpec.js spec/jasmine/ZZ-RouterAPIKeySpec.js
```

Expected: same pass/fail counts as before.

- [ ] **Step 4: Run full suite**

```bash
npx jasmine
```

Expected: same aggregate pass/fail.

- [ ] **Step 5: Commit**

```bash
git add lib/router*.js
git commit -m "refactor: replace console calls with logger in all router files"
```

---

## Task 10: Enable `no-console` ESLint rule

Per IMPROVEMENTS.md §8, `no-console` should be enabled after the logger is in place.

**Files:**
- Modify: `.eslintrc.js` (or `.eslintrc`)

- [ ] **Step 1: Read the current ESLint config**

Open `.eslintrc.js` and find the `"no-console": 0` entry.

- [ ] **Step 2: Enable the rule**

Change:
```js
"no-console": 0
```
to:
```js
"no-console": "error"
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: zero `no-console` violations. If any remain, they are missed replacements — fix them.

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.js  # or .eslintrc
git commit -m "chore: enable no-console ESLint rule"
```

---

## Task 11: Update IMPROVEMENTS.md

**Files:**
- Modify: `IMPROVEMENTS.md`

- [ ] **Step 1: Mark item #1 as completed**

In `IMPROVEMENTS.md`, update item 1:

Change:
```markdown
### 1. Replace `console.log` with a Structured Logger
```
to:
```markdown
### 1. ~~Replace `console.log` with a Structured Logger~~ ✅ Implemented
**Status:** Completed.

Winston logger singleton at `lib/thinx/logger.js` with Console and File transports. Stats event lines logged at `warn` level to preserve compatibility with `statistics.js` log parser. `no-console` ESLint rule enabled.
```

Also update the summary table row for item 1 to show ~~strikethrough~~ ✅.

- [ ] **Step 2: Commit**

```bash
git add IMPROVEMENTS.md
git commit -m "docs: mark structured logger improvement as completed"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `lib/thinx/logger.js` created with Winston, two transports — Task 1
- ✅ `winston` added to `package.json` — Task 1
- ✅ Stats event lines use `logger.warn` — Tasks 4, 5, 6
- ✅ `statistics.js` not modified (its parser is unchanged) — no task needed; Tasks 3 replaces only `statistics.js`'s own console calls, not its parsing logic
- ✅ `globals.js` excluded (circular dep risk) — Task 2
- ✅ `no-console` ESLint rule enabled — Task 10
- ✅ All 49 lib files covered across Tasks 3–9
- ✅ IMPROVEMENTS.md updated — Task 11

**Placeholder scan:** No TBDs, TODOs, or vague "handle errors" steps found.

**Type consistency:** `logger` is the exported Winston instance in every task — consistent name and import path throughout.
