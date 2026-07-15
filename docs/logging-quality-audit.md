# Logging Quality Audit

## Scope

This audit covers backend/API logging quality only:

- `thinx-core.js`
- `thinx.js`
- `lib/**/*.js`
- selected service entrypoints:
  - `services/worker/worker.js`
  - `services/transformer/index.js`
  - `services/transformer/app.js`
  - `services/transformer/transformer.js`

The audit intentionally does not mass-convert every remaining `console.*` call,
and does not scan bundled console frontend vendor assets.

## Current Audit Counts

Latest command:

```sh
npm run --silent logging-audit -- --json
```

Current report summary:

- Files scanned: 80
- `console.*` calls: 897
- `logger.*` calls: 20
- Tracked event occurrences: 26
- Sensitive findings: 21
- High-risk sensitive findings: 0
- Severity-string mismatches: 607
- Tracked event quality gaps: 0

## Fixed High-Risk Findings

- Raw websocket cookie headers in `thinx-core.js` are redacted with
  `Util.redactCookieHeader()`, preserving cookie names only.
- OAuth handoff/access token logs in `lib/router.github.js`,
  `lib/router.google.js`, `lib/router.gdpr.js`, and `lib/router.auth.js` now
  redact tokens or avoid logging them.
- Full OAuth `userWrapper` and GitHub `hdata` payload logging was removed.
- Invalid local-login failures no longer log the submitted username.
- `LOGIN_INVALID`, `BUILD_FAILED`, `BUILD_STARTED`, `BUILD_SUCCESS`,
  `DEVICE_CHECKIN`, and `DEVICE_NEW` now have warn-level logger coverage while
  preserving existing `InfluxConnector.statsLog` calls.

## Build Event Decision

`BUILD_COMPLETED` remains an operational line. It is not part of
`statistics.js` `owner_template`, which tracks `BUILD_SUCCESS`. Successful local
build exits now emit `BUILD_SUCCESS` via the logger/metrics helper so local
build success can be counted consistently with the existing statistics model.

## Bounded Auth-Module Fixes (audit.js, router.js, apikey.js)

A second, deliberately narrow remediation slice targets the auth-sensitive
modules that the first slice left untouched. These are log-only changes (no
control-flow changes), verified by `npm run lint` and the isolated
`UtilSpec` / `LoggingQualityAuditSpec` suites:

- **Severity mismatches → correct level.** Genuine error paths that were logged
  via `console.log` now use `console.error`; `[warning]`-tagged lines now use
  `console.warn`:
  - `lib/thinx/audit.js`: `_buildRecord` missing-message notice → `console.warn`;
    `log()` insertion failure and `fetch()` failure → `console.error`.
  - `lib/router.js`: host-header-mismatch and blacklist-check-failed warnings →
    `console.warn`; failed API-key authentication → `console.warn`.
  - `lib/thinx/apikey.js`: `save_apikeys` set failure, circuit-breaker OPEN,
    key-generator errors, Redis-unavailable/`get` errors, and the
    `revoke`/`list` error paths → `console.error`.
- **Secret/token leakage → redacted or removed.**
  - `lib/thinx/apikey.js` no longer logs the full `json_keys` blob (cleartext
    keys + hashes) in `create()` and `revoke()`; the "saving first API key"
    debug line logs only the alias.
  - Attempted invalid API-key values in `log_invalid_key()` (both the audit-log
    entry and the console warning) and `key_in_keys()` are now passed through
    `Util.redactToken()`, printing only a short deterministic prefix.

The stats-parser contract is untouched by this slice: none of these files emit
`[OID:...] [EVENT]` lines consumed by `statistics.js`, so no `logger.warn()`
level was changed or downgraded.

## Remaining Backlog

The remaining findings are lower-risk and intentionally left for follow-up:

- Convert broad backend `console.*` usage to the shared logger.
- Resolve severity-string mismatches where messages tagged `[error]`,
  `[warning]`, `[info]`, or `[debug]` still go through `console.log`.
- Review remaining medium-risk payload logs (device response payloads in
  particular) and replace them with redacted structured context. API-key
  payload logging was addressed in the bounded auth-module slice above.
- Consider standardizing non-template event markers such as `NEW_SESSION`,
  `DEVICE_ATTACH`, `MESH_ATTACH`, and transfer events.

## Verification

Focused verification commands:

```sh
npm run --silent logging-audit -- --json
npx jasmine spec/jasmine/LoggingQualityAuditSpec.js spec/jasmine/UtilSpec.js spec/jasmine/LoggerSpec.js spec/jasmine/MetricsCoverageSpec.js
```
