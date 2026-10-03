---
phase: 27-influxdb-2-upgrade
reviewed: 2026-10-03T14:48:25Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - .circleci/config.yml
  - docker-compose.test.yml
  - docker-compose.yml
  - docker-swarm.yml
  - lib/router.auth.js
  - lib/thinx/apikey.js
  - lib/thinx/influx.js
  - lib/thinx/statistics.js
  - package.json
  - scripts/aikido-known-false-positives.json
  - scripts/influx-stats-probe.js
  - spec/jasmine/InfluxRetentionSpec.js
  - spec/jasmine/InfluxSpec.js
  - spec/jasmine/InfluxStatsProbeSpec.js
  - spec/jasmine/StatisticsV2Spec.js
  - spec/jasmine/StatsPrivacySpec.js
  - spec/jasmine/ZZ-AppSessionUserV2DeleteSpec.js
  - thinx-core.js
findings:
  critical: 1
  warning: 2
  info: 6
  total: 9
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-10-03T14:48:25Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the phase diff `0d28807c..HEAD` for all 18 files. I also checked the call sites that the changed code reaches: `device.js`, `router.user.js`, `router.js`, `secrets.js`, `design_upsert.js` and `validator.js`. To check claims that depend on the client library, I ran small Node checks against the installed `@influxdata/influxdb-client@1.35.0`. They covered Flux escaping of `"` and `${`, line-protocol tag escaping, `flush()` rejecting on the first failed attempt while the retry buffer keeps retrying, and the number of log lines each write produces when the server answers 401.

The phase's own code is sound in the areas that matter most:
- The owner only reaches Flux as an escaped parameter.
- `ensureStatsBucket` never rejects. When a lookup fails, it skips instead of creating a second `stats` bucket.
- The KPI callback fix in `statistics.js` matches what `router.user.js` expects.
- The D-12 allow-list covers every `auditLogError` call site.
- The probe is read-only and prints only aggregates.

I found no blocker introduced by this phase. There are two robustness problems in the new write path (WR-01, WR-02).

The one critical finding (CR-01) is **pre-existing and outside the phase diff**. It sits in `APIKey.verify`'s key match, in the same function whose line 212 this phase edited. It is a real authentication bypass, so it is reported here rather than left out.

## Critical Issues

### CR-01: API key check is a substring match, so an empty or one-character key authenticates (pre-existing, not introduced by phase 27)

**File:** `lib/thinx/apikey.js:160-175` (reached from `lib/thinx/device.js:1156` and `lib/thinx/device.js:1269`)
**Issue:** `key_in_keys` accepts a key when `value.indexOf(apikey) !== -1`, for both the stored key and its stored sha256 hash. `"<64-hex>".indexOf("")` returns `0`, and a single hex character matches almost any stored key.

`verify()` (line 188) rejects only `undefined` and `null`. `ott_request` (`device.js:1154-1156`) and the firmware-update path (`device.js:1240-1269`) pass `req.headers.authentication` through unchanged. So `Authentication: ` (empty) or `Authentication: a`, together with a known owner id, passes API-key authentication.

Owner ids are not secret: they appear in device firmware and MQTT topics. The `router.js:185` path is narrower, because `sanitka.udid` forces exactly 36 hex/dash characters, but any 36-character slice of a key or hash still passes there.

The phase edited line 212 of this same verify flow, which is why this surfaced.
**Fix:** Compare whole values in constant time, and reject empty or short input before reading Redis:
```js
const crypto = require("crypto");
function safeEqual(a, b) {
	const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
	return x.length === y.length && crypto.timingSafeEqual(x, y);
}
key_in_keys(apikey, json_keys) {
	if (typeof apikey !== "string" || apikey.length < 32) return false;
	const keys = JSON.parse(json_keys);
	return keys.some((k) => safeEqual(k.key, apikey) || safeEqual(k.hash, apikey));
}
```
Track it as its own change with a regression spec: an empty key, a one-character key and a 36-character slice must all be rejected. Then check whether `rejectLogin`'s `password.indexOf(user_data.password)` (`lib/router.auth.js`) needs the same fix.

## Warnings

### WR-01: The monotonic ns counter can pin timestamps ahead of the wall clock for the whole process lifetime, which hides points from `today`/`week` and the probe

**File:** `lib/thinx/influx.js:150-155` (doc claim at lines 38-45)
**Issue:** `nextTimestamp()` returns `max(wall, lastNs + 1)`.
- **Clock steps back.** After an NTP step back of Δ, or after a container starts with a clock that runs ahead and is later corrected, every following write gets `lastNs + k`. That stays up to Δ ahead of real time until the wall clock catches up.
- **Queries miss those points.** `countsDetailed` and `countAll` use `stop: now()`, so they exclude these points. For that period the dashboard KPIs and the probe's `count_10m_*` read low or zero, with no log line.
- **No recovery.** `lastNs` is never reset, even by `_resetForTests`, so the effect lasts until the process restarts.
- **The header comment is wrong.** It says a timestamp "runs ahead of the wall clock by at most one nanosecond per write issued within the same millisecond". That only holds when the clock never steps back, which is exactly the case `StatisticsV2Spec` tests.

**Fix:** Bound the drift. If `lastNs - wall` is more than a small limit (for example 1 s = 1e9 ns), resync to `wall`. A rare collision is better than invisible points. Correct the comment to state the real bound.
```js
const MAX_LEAD_NS = BigInt(1000000000);
lastNs = (wall > lastNs || lastNs - wall > MAX_LEAD_NS) ? wall : lastNs + BigInt(1);
```

### WR-02: A persistent non-retryable write failure (revoked token, missing bucket) logs two lines per stats event forever and never latches

**File:** `lib/thinx/influx.js:100-103, 243-249`
**Issue:** Each `statsLog` flushes on its own.
- **Two lines per event.** A run against a stub returning 401 produced exactly two lines per event: `[influx] Write to InfluxDB failed. 401` from the client logger and `[influx] write failed 401` from `writePoint`. A 503 produces up to four, one per retry.
- **Common triggers.** This happens when `INFLUXDB_TOKEN` is rotated or revoked, or when bucket `stats` is missing because the boot ensure was `skipped` or `failed`. Every device check-in, build and login then adds log lines, and every point is lost.
- **Nothing latches.** The "statistics disabled" latch only fires when there is no token. So a permanent 401/403/404 never switches the connector into a quiet, disabled state.

**Fix:** When a write fails with 401, 403 or 404, latch a module-level "write refused" state: log one line, then drop writes without an HTTP call until a cooldown passes (for example 5 minutes), and re-probe after that. Alternatively, rate-limit the `write failed` line to one per status code per minute. Either way, a revoked token costs one log line per cooldown, not one per check-in.

## Info

### IN-01: Org fallback `|| orgList[0]` can target an org other than `INFLUXDB_ORG`

**File:** `lib/thinx/influx.js:429, 480`
**Issue:** `bucketStatus` and `ensureStatsBucket` both pick `orgList.find(name === orgName) || orgList[0]`. A conformant server answers `getOrgs({org})` with 404 or with exactly that org, so the fallback is dead code. If it ever ran (a server that ignores the filter), the boot repair would rename, patch or create a bucket in another org while writes and queries keep using the `INFLUXDB_ORG` name.
**Fix:** Drop the `|| orgList[0]` fallback and return `skipped/no_org` when no name matches.

### IN-02: `bucketStatus` lists at most 100 buckets with no name filter

**File:** `lib/thinx/influx.js:431`
**Issue:** `getBuckets({ orgID, limit: 100 })` decides `exists` and `legacyPresent` from a single page. If an org ever has more than 100 buckets, the probe can report `bucket_absent` for a bucket that exists. That will not happen with today's layout of `stats` plus system buckets.
**Fix:** Look up `bucket` and `LEGACY_BUCKET` by `name`, the same way `ensureStatsBucket.find` does, and keep the unfiltered page only for `names`.

### IN-03: A query failure is answered as `(true, zeros)`, the same as "no activity"

**File:** `lib/thinx/influx.js:259-264, 353-366`
**Issue:** `countsByKpi` returns zeros on any failure, and `_period` always calls back `success = true`. The dashboard cannot tell an InfluxDB outage or a bad token from a quiet day. For the no-token case this is by design (D-10). For query failures it hides an outage from the UI; the only trace is the `query failed` log line.
**Fix:** Optional. Pass a flag such as `{degraded: true}` in the body, or call back `success = false` when `r.reason` is not `no_token`, so the console can show a "stats unavailable" state.

### IN-04: The dev compose silently disables stats when `INFLUXDB_TOKEN` is unset

**File:** `docker-compose.yml:176, 281-296`
**Issue:** With `INFLUXDB_TOKEN` missing from `.env`, `influxdb-setup` runs `influx setup --token ""` and the CLI generates a random operator token. Meanwhile the API gets `INFLUXDB_TOKEN=` (empty), and `readSecret` returns `""`, which disables stats. Two smaller points: the setup container passes the admin password and token on argv (visible in the container process list), and on success it echoes the `influx setup` output. This file is dev only.
**Fix:** Fail the setup one-shot early when either variable is empty, for example `[ -n "$$INFLUXDB_TOKEN" ] && [ -n "$$INFLUXDB_PASSWORD" ] || { echo "influxdb-setup: INFLUXDB_TOKEN/INFLUXDB_PASSWORD required"; exit 1; }`.

### IN-05: The CI-only token and password literals are not on the Aikido allow-list

**File:** `docker-compose.test.yml:173, 268-276`; `scripts/aikido-known-false-positives.json`
**Issue:** `thinx-ci-influx-token` and `thinx-ci-password` are documented throwaway values for an ephemeral tmpfs instance, which is acceptable. The phase removed the four InfluxQL false positives but added no entry for these literals. A hardcoded-secret rule may then flag them as new findings.
**Fix:** Add a `verified` entry for each literal, or have CI pass them through env so the file holds no literal.

### IN-06: `StatsPrivacySpec` checks `auditLogError` by parsing source with regexes and running it through `new Function`

**File:** `spec/jasmine/StatsPrivacySpec.js:49-72, 151-193`
**Issue:** The LOGIN_INVALID tests regex-parse `router.auth.js` and lift `auditLogError` into `new Function(...)` with stub bindings. Harmless refactors break them, for example a multi-line array literal, a label defined as a constant, or `auditLogError` starting to use another closure variable. They fail as false negatives, not by missing a leak, so this is a maintenance cost and not a correctness hole.
**Fix:** Optional. Export `LOGIN_INVALID_REASONS` and a pure `loginInvalidLabel(data)` helper from a small module that `router.auth.js` uses, and test that helper directly.

---

_Reviewed: 2026-10-03T14:48:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
