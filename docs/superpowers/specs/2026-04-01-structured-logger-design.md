# Structured Logger Design

**Date:** 2026-04-01  
**Status:** Approved  
**Scope:** Replace `console.log/warn/error` across `lib/` with a Winston-based structured logger

---

## Problem

The codebase has ~792 `console.log` calls across 49 files in `lib/`. This makes it impossible to control log levels per environment, route logs to aggregation services, or filter signal from noise.

---

## Decision

**Library:** Winston (not Pino)

Pino writes JSON by default. `statistics.js` parses the log file as plain text looking for `[OID:owner]` and event keywords per line. Using Pino would require `pino-pretty` as a file transport to produce the required format — adding complexity. Winston's `printf` format gives direct control over the exact string written to the file transport, making it the correct fit.

**Approach:** Single shared logger singleton in `lib/thinx/logger.js`

---

## Architecture

### New file: `lib/thinx/logger.js`

A singleton module that creates and exports one Winston logger instance with two transports:

**Console transport**
- Level: `LOG_LEVEL` env var, defaults to `info`
- Format: colorized in `development` environment, plain JSON in production

**File transport**
- Output: `DATA_ROOT/statistics/latest.log` (same path as `statistics.js` reads)
- Level: `warn` minimum
- Format: `printf` producing:
  ```
  [ISO-timestamp] [LEVEL] message
  ```
  This matches what `statistics.js`'s `parse_oid()` and `parse_oid_date_and_line()` already scan.

`DATA_ROOT` is read from `Globals.app_config().data_root` at module load time — same pattern used by `statistics.js`.

### Why `warn` minimum for the file transport

`statistics.js`'s `parse_oid()` (called during `aggregate()`) explicitly skips lines containing `[info]`, `[warning]`, or `🔨 [debug]`. The stat event lines (e.g. `[OID:xxx] [BUILD_STARTED]`, `[OID:xxx] [LOGIN_INVALID]`) must survive this filter. Logging them at `warn` level ensures they appear in the file and are not skipped.

---

## Call-site conventions

Each file in `lib/` adds at the top:
```js
const logger = require('./logger'); // adjust relative path as needed
```

Replacement mapping:
- `console.log(...)` → `logger.info(...)`
- `console.warn(...)` → `logger.warn(...)`
- `console.error(...)` → `logger.error(...)`

**Critical:** Any `console.log` line that contains a stats event keyword AND an `[OID:...]` pattern must be replaced with `logger.warn(...)` (not `logger.info`). Examples:
- `console.log(`[OID:${owner}] [BUILD_STARTED]`)` → `logger.warn(...)`
- `console.log(`[OID:${user.owner}] [LOGIN_INVALID]`)` → `logger.warn(...)`
- `console.log(`[OID:${owner}] [DEVICE_NEW]`)` → `logger.warn(...)`

Stats event lines that already use `[OID:]` prefix with keywords from the `owner_template`:
`APIKEY_INVALID`, `LOGIN_INVALID`, `DEVICE_NEW`, `DEVICE_CHECKIN`, `DEVICE_REVOCATION`, `BUILD_STARTED`, `BUILD_SUCCESS`, `BUILD_FAILED`

---

## What does NOT change

- `lib/thinx/statistics.js` — zero modifications; the file transport output is format-compatible with the existing line parser
- `lib/thinx/influx.js` — `InfluxConnector.statsLog()` calls are separate from console logging and remain unchanged
- Test files under `spec/` — no changes needed

---

## Files affected

All files in `lib/` containing `console.log`, `console.warn`, or `console.error`. The IMPROVEMENTS.md analysis counts ~49 files. Key files to verify for stats event lines:

- `lib/router.auth.js` — `[LOGIN_INVALID]` lines
- `lib/thinx/device.js` — `[DEVICE_CHECKIN]`, `[DEVICE_NEW]` lines
- `lib/thinx/builder.js` — `[BUILD_STARTED]`, `[BUILD_FAILED]` lines
- `lib/thinx/apikey.js` — `[APIKEY_INVALID]` lines (indirect, via InfluxConnector)

---

## Dependencies

Add to `package.json` dependencies:
```json
"winston": "^3.17.0"
```

No other new dependencies. Winston 3.x has a small, stable dependency tree.
