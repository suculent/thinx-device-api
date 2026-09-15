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

The auditor reports missing root/service files explicitly. This keeps counts
interpretable when optional service submodule files are not checked out in a
local workspace. Sensitive and statistics-event checks are call-span aware, so
multi-line `console.*`/`logger.*` calls are inspected as one log statement.

## Current Audit Counts

Latest command:

```sh
npm run --silent logging-audit -- --json
```

Current report summary:

- Files scanned: 80
- Missing scoped files: 0
- Service entrypoints scanned: 4
- Service entrypoints missing: 0
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

## Remaining Backlog

The remaining findings are lower-risk and intentionally left for follow-up:

- Convert broad backend `console.*` usage to the shared logger.
- Resolve severity-string mismatches where messages tagged `[error]`,
  `[warning]`, `[info]`, or `[debug]` still go through `console.log`.
- Review medium-risk payload logs, especially API-key and device response
  payload logging, and replace them with redacted structured context.
- Consider standardizing non-template event markers such as `NEW_SESSION`,
  `DEVICE_ATTACH`, `MESH_ATTACH`, and transfer events.

## Verification

Focused verification commands:

```sh
npm run --silent logging-audit -- --json
ENVIRONMENT=development JASMINE_CONFIG_PATH=spec/empty.json npx jasmine spec/jasmine/LoggingQualityAuditSpec.js spec/jasmine/UtilSpec.js spec/jasmine/LoggerSpec.js spec/jasmine/MetricsCoverageSpec.js
```
