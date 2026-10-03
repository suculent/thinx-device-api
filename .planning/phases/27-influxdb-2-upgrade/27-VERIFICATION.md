---
phase: 27-influxdb-2-upgrade
verified: 2026-10-03T14:54:00Z
status: human_needed
score: 16/17 must-haves verified
covered_files:
  - .circleci/config.yml
  - .planning/phases/27-influxdb-2-upgrade/27-01-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-01-SUMMARY.md
  - .planning/phases/27-influxdb-2-upgrade/27-02-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-02-SUMMARY.md
  - .planning/phases/27-influxdb-2-upgrade/27-03-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-03-SUMMARY.md
  - .planning/phases/27-influxdb-2-upgrade/27-04-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-04-SUMMARY.md
  - .planning/phases/27-influxdb-2-upgrade/27-05-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-05-SUMMARY.md
  - .planning/phases/27-influxdb-2-upgrade/27-06-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-06-SUMMARY.md
  - .planning/phases/27-influxdb-2-upgrade/27-07-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-07-SUMMARY.md
  - .planning/phases/27-influxdb-2-upgrade/27-08-PLAN.md
  - .planning/phases/27-influxdb-2-upgrade/27-08-SUMMARY.md
  - .planning/runbooks/influxdb2-upgrade.md
  - docker-compose.test.yml
  - docker-compose.yml
  - docker-swarm.yml
  - lib/router.auth.js
  - lib/thinx/apikey.js
  - lib/thinx/influx.js
  - lib/thinx/statistics.js
  - package-lock.json
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
covered_digest: "v2:sha256:d3097483cfe764a3f1fca549e79e84cf33f07a0f3be97c77d915832e04eb3fa6"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Log in to the Vue console on rtm.thinx.cloud as an owner with recent activity and open the dashboard and the Visits page"
    expected: "Weekly and today KPI tiles/charts render non-zero figures for KPIs with activity (production probe at 14:52 UTC: count_7d_DEVICE_CHECKIN=2, owners_7d=3; 7-day LOGIN_INVALID/BUILD_* were non-zero at 13:36), no blank panel, no console error. The /api/v2/stats and /api/v2/stats/today responses are {success:true, response:{<8 KPIs>:[n]}}"
    why_human: "Success criterion 2 names the rendered dashboard and Visits views. The API path is verified (code, StatisticsV2Spec in CI, live probe), but no automated check renders the UI for a real owner session; the operator accepted this as an open UAT item at the 27-07 deletion decision"
  - test: "Review the 19 judgment-tier prohibitions listed under 'Prohibitions (judgment tier)' and accept or reject the non-authoritative verifier verdicts"
    expected: "Each prohibition resolved by a human; the verifier found evidence of a breach for none of them"
    why_human: "All 19 are verification: judgment, flagged: true (ADR-550 D4); an LLM verdict is not authoritative and must not silently pass"
---

# Phase 27: InfluxDB 2 Upgrade Verification Report

**Phase Goal:** THiNX statistics run on InfluxDB 2 with a finite 90-day retention, with no existing `stats` history lost and no blanked dashboard.
**Verified:** 2026-10-03T14:54:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

Production evidence was gathered read-only by this verifier at 14:49–14:53 UTC on 2026-10-03 (micro manager, aggregates only, no token printed). CI evidence was read from the public CircleCI v1.1 API and GitHub commit statuses, not from the SUMMARYs.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: before the upgrade, a 1.8 backup was taken and verified restorable | ✓ VERIFIED (annex record) | Annex rows "backup" and "restore": portable backup of all DBs on both nodes, sha256 manifest OK on both, restore into a throwaway 1.8 with every count bounded by T equal (total 2379, `restore_equal=1`), then a rehearsed upgrade from that copy (`rehearsal_equal=1`). It cannot be re-run: the backup was deleted by design (D-02/D-07, annex "deletion", `p27_delete=delete-all`). The recorded numbers agree with independent evidence (truth 3). |
| 2 | SC1b: `thinx_influxdb` runs InfluxDB 2 in production | ✓ VERIFIED | Live: `thinx_influxdb` on core, Running 16 h, image `dhi.io/influxdb:2.9.1`. CircleCI proves the same image is v2 (`server_version=v2.9.1`). |
| 3 | SC1c: the pre-upgrade `stats` history can be queried, and nothing within 90 days is lost (D-01) | ✓ VERIFIED | The live probe inside `thinx_api` with the absolute W80 window `2026-07-14T22:42:48Z/2026-10-02T22:42:48Z` returned `count_window_total=501`, with LOGIN_INVALID 458, DEVICE_CHECKIN 22, BUILD_STARTED 12, BUILD_SUCCESS 9 and the rest 0. That is **identical to `p27_v1_window`** recorded on 1.8 before the cutover. It was measured **after** the 90-day shard deletion ran (`count_all_total` 2403 → 564), so it is stronger than the annex's pre-trim `window_equal_after_trim=1`. |
| 4 | SC2a: `influx.js` writes to InfluxDB 2, and new device check-ins keep appearing | ✓ VERIFIED | Live probe: `count_24h_DEVICE_CHECKIN=2`, `count_7d_DEVICE_CHECKIN=2`, `count_90d_DEVICE_NEW=4` (all 0 at the 13:36 snapshot). The current API container logged 4 `[DEVICE_CHECKIN]` lines, `[influx] write failed` 0 and `query failed` 0. The orchestrator's 14:49 probe agrees. Code path: `device.js:423` → `statsLog` → `writePoint` → WriteApi ns precision. |
| 5 | SC2b: `influx.js` reads from InfluxDB 2 through the V2 stats endpoints | ✓ VERIFIED | `router.user.js:104-127` `/api/v2/stats` → `statistics.js:80-98` `week_V2`/`today_V2` forward `(success, body)` → `influx.js` `_period` → `countsByKpi`, a Flux query with the owner as a parameter. `StatisticsV2Spec` (seeded points come back as `{KPI:[n]}`) ran in CI #15586 (1018 specs, 0 failures). The live probe reads through the same `countsDetailed`. |
| 6 | SC2c: dashboard and Visits statistics show non-zero figures (no blanked dashboard) | ? UNCERTAIN → human | Not rendered by any automated check. The operator accepted this as unmet at the 27-07 decision. The data behind it is now non-zero (truth 4). Note: the **classic** console dashboard reads `/api/user/stats` → `stats.week` (the legacy file ETL), not InfluxDB, so only the Vue dashboard/Visits (`store/stats.js` → `/stats`, `/stats/today`) depend on this phase. |
| 7 | SC3: the influx specs run in CI against InfluxDB 2 and pass | ✓ VERIFIED | Fetched independently from CircleCI. Jobs #15574 (`69677540`) and #15586 (`ddc42dd4`) both succeeded. "Starting Influx" prints the `User Organization Bucket` setup table. The test step prints `[******-spec] server_version=v2.9.1` and `1018 specs, 0 failures, 1 pending spec`; the pending spec is the unrelated `AppSpec /api/logout` xit. Two `ensure bucket=stats` lines appear in the CI log (`updated`, `unchanged`). |
| 8 | SC4: the `stats` bucket has a 90-day retention | ✓ VERIFIED | Live probe: `bucket_retention_s=7776000`, `bucket_exists=1`, `legacy_bucket_present=0`, `bucket_names=_monitoring,_tasks,stats`. The trim has actually executed (all-time 2403 → 564). |
| 9 | SC5a: `thinx_influxdb` mounts nothing from `/mnt/gluster/deployment/swarm/swarmpit/`, and its config is re-homed or dropped | ✓ VERIFIED | Live spec: the only mount is `/mnt/gluster/thinx/influxdb2:/var/lib/influxdb2`. Env is exactly the six `INFLUXD_*` keys and no v1 `INFLUXDB_*`. The config file is dropped (env only, D-16). Gluster `thinx.yml` HEAD `088a9b2` influxdb block has the same image and bind, `swarmpit/influxdb.conf` occurs 0 times and `chronograf` 0 times. The repo `docker-swarm.yml:518-532` matches. |
| 10 | SC5b: a test push still autoredeploys within 5 minutes after the upgrade | ✓ VERIFIED | CircleCI `api-registry` #15587 for `ddc42dd4` stopped at 13:35:09Z. The running `thinx_api` container started 13:35:55Z (RestartCount 0), 46 s later, with the annex recording task creation at 13:35:22Z (`autoredeploy_s=13`). Well under 300 s. |
| 11 | The connector uses `@influxdata/influxdb-client` 1.35.0 with Flux; node-influx and InfluxQL are gone (D-09) | ✓ VERIFIED | `package.json:37-38` pins both at 1.35.0. `node_modules/influx` is absent from the lockfile, there is no `require('influx')`, and grep finds no InfluxQL `SELECT…FROM` / `CREATE RETENTION` in `lib/` or `spec/`. Queries use the `flux` tagged template with `${owner}` as a parameter (`influx.js:278-288`). |
| 12 | With no `INFLUXDB_TOKEN`, stats are disabled gracefully: one log line, no-op writes, zero KPIs, boot continues (D-10) | ✓ VERIFIED | Code `influx.js:157-167`. The no-token cases of InfluxSpec/StatisticsV2Spec passed in CI. Exercised live in 27-04: annex "push dormant" shows `ensure ... action=skipped reason=no_token` with the API Running. |
| 13 | The boot ensure converges `stats` to 90 d, never rejects, logs one line, and adopts `stats/autogen` with its id kept (D-03) | ✓ VERIFIED | `thinx-core.js:168` calls it after `db.init`. I ran the unit matrix locally: `InfluxRetentionSpec` "unit (fake apis)" **9 specs, 0 failures** (skip/created/adopted/updated/unchanged/failed/timeout/legacy_present). The live API log has exactly one `ensure bucket=stats action=unchanged`. Annex "enable": `action=adopted`, `bucket_id_kept=1`. |
| 14 | D-12: `APIKEY_INVALID` stores no rejected key; `LOGIN_INVALID` carries only allow-listed labels | ✓ VERIFIED | `apikey.js:212` `statsLog(owner, APIKEY_INVALID)` has no data. `router.auth.js:39-49` uses the frozen `LOGIN_INVALID_REASONS`, else `unlisted`, for both the log line and the tag. `StatsPrivacySpec` passed in CI. |
| 15 | Secrets: `INFLUXDB_TOKEN` is mounted only on `thinx_api`; `INFLUXDB_OPERATOR_TOKEN` and `INFLUXDB_ADMIN_PASSWORD` exist and are unmounted (D-04, D-10, D-11) | ✓ VERIFIED | Live: 3 `INFLUXDB*` secrets. `thinx_api` mounts only `INFLUXDB_TOKEN`. `thinx_influxdb` mounts 0. Across all services, `operator_secret_mounts=0`. The probe shows `token_present=1`. |
| 16 | Chronograf is retired and the stack files mirror the live stack (D-13, D-14, D-16) | ✓ VERIFIED | Live `thinx_chronograf` is absent. `docker-swarm.yml` has no `chronograf`, has `INFLUXDB_TOKEN` on api and as external at top level, and has the http router `middlewares=https-redirect` (`:549`). The live label is also `https-redirect`. Gluster HEAD has chronograf 0. |
| 17 | The upgrade's extra buckets are dropped, leaving only `stats` and the system buckets (D-15) | ✓ VERIFIED | Live `bucket_names=_monitoring,_tasks,stats`. |

**Score:** 16/17 truths verified (0 present-but-behavior-unverified; 1 needs a human).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/thinx/influx.js` | v2 connector, ensure, probe helpers | ✓ VERIFIED | 561 lines, substantive. Imported by device, devices, builder, notifier, apikey, statistics, thinx-core and the probe. |
| `lib/thinx/statistics.js` | `week_V2`/`today_V2` forward the body | ✓ VERIFIED | Wired from `router.user.js`. |
| `scripts/influx-stats-probe.js` | read-only aggregate probe | ✓ VERIFIED | Ran in production and printed only aggregates, ending `INFLUX-STATS-PROBE OK`. |
| `spec/jasmine/{InfluxSpec,InfluxRetentionSpec,StatisticsV2Spec,StatsPrivacySpec,InfluxStatsProbeSpec}.js` | v2 specs | ✓ VERIFIED | Ran in CI; the server_version line comes from InfluxSpec. |
| `docker-compose.test.yml` | CI InfluxDB 2 pair | ✓ VERIFIED | `dhi.io/influxdb:2.9.1` plus `influxdb-setup`; the api gets `INFLUXDB_URL`/`INFLUXDB_TOKEN`. |
| `.circleci/config.yml` | "Starting Influx" on v2 | ✓ VERIFIED | Diff touches only the two hunks at 754 and 768 (the Starting Influx and Support Services steps). |
| `docker-compose.yml` | dev on v2, no chronograf | ✓ VERIFIED | chronograf 0. |
| `docker-swarm.yml` | stack mirror | ✓ VERIFIED | See truth 16. |
| `.planning/runbooks/influxdb2-upgrade.md` | runbook plus annex | ✓ VERIFIED | Every annex row is present (pre-flight through deletion). |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `thinx-core.js` | `influx.js` | `InfluxConnector.ensureStatsBucket()` after `db.init` (`:168`) | ✓ WIRED (one live log line) |
| `influx.js` | `secrets.js` | `readSecret("INFLUXDB_TOKEN")` (`:159, 417, 462`) | ✓ WIRED (live `token_present=1`) |
| `router.user.js` `/api/v2/stats(/today)` | `statistics.js` → `influx.js` | `stats.week_V2` → `this.influx.week` | ✓ WIRED |
| `device.js` check-in | InfluxDB 2 bucket `stats` | `recordStatsEvent` → `statsLog` → WriteApi | ✓ WIRED (live 24 h count 2) |
| CircleCI test | InfluxDB 2 | Starting Influx → `run --rm influxdb-setup` → InfluxSpec | ✓ WIRED (#15574, #15586) |
| `docker service update --secret-add INFLUXDB_TOKEN thinx_api` | boot ensure | `/run/secrets` | ✓ WIRED (it survived the SC5 autoredeploy) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `/api/v2/stats` body | `{KPI:[n]}` | Flux `count()` on bucket `stats`, filtered by owner | Yes. The live bucket holds 564 points; 7-day counts are non-zero across 3 owners | ✓ FLOWING (UI render → human) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Ensure matrix never rejects, correct action per state | `npx jasmine --config=<no-helpers> InfluxRetentionSpec.js --filter="unit (fake apis)"` | 9 specs, 0 failures | ✓ PASS |
| CI ran influx specs on v2 | CircleCI v1.1 API output for #15586/#15574 | `server_version=v2.9.1`, `1018 specs, 0 failures` | ✓ PASS |
| Prod retention, history, writes | `docker exec <thinx_api> node scripts/influx-stats-probe.js --window-start … --window-stop …` | `bucket_retention_s=7776000`, `count_window_total=501` (= the 1.8 reference), `count_24h_DEVICE_CHECKIN=2`, OK | ✓ PASS |
| Prod API influx health | `docker logs` aggregate counts | ensure 1 (`unchanged`), write failed 0, query failed 0 | ✓ PASS |
| StatsPrivacySpec / probe spec locally | jasmine without helpers | needs `/mnt/data/conf` (globals) | ? SKIP (covered by the CI run) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared or present for this phase. The phase's probe is `scripts/influx-stats-probe.js`, which this verifier ran itself in production (above).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OPS-INFLUX-01 | 27-01, 05, 06, 07 | InfluxDB 2 in production, upgraded from a verified backup, `stats` migrated | ✓ SATISFIED | Truths 1–3, 9 |
| OPS-INFLUX-02 | 27-02, 03, 04, 06, 07, 08 | `influx.js` reads and writes v2; dashboard/Visits render; CI on v2 | ✓ SATISFIED (render → human) | Truths 4–7, 11–14 |
| OPS-INFLUX-03 | 27-02, 06, 07 | 90-day bucket retention | ✓ SATISFIED | Truths 8, 13 |

No orphaned requirements: REQUIREMENTS.md maps exactly these three IDs to Phase 27, and every plan declares a subset of them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase diff, all non-planning files) | — | TBD/FIXME/XXX/TODO/HACK in added lines | — | None found |
| `lib/thinx/influx.js` | 150-155, 38-45 | WR-01: the monotonic ns counter has no drift bound after a clock step back, so points can sit in the future and drop out of `stop: now()` reads; the header comment overstates the bound | ⚠️ Warning | Under an NTP step-back, check-ins could read low until the API restarts. Not observed now. |
| `lib/thinx/influx.js` | 100-103, 243-249 | WR-02: a permanent 401/403/404 logs 2–4 lines per stats event and never latches | ⚠️ Warning | Log flood if the token is revoked or the bucket is missing. Today: 0 write failures. |
| `lib/thinx/apikey.js` | 160-175 | CR-01: `key_in_keys` substring match, so an empty or 1-char key authenticates (**predates Phase 27**) | 🛑 Critical security, **out of phase scope** | No Phase 27 must-have depends on it, so it does not fail the phase. It is a real auth bypass and needs its own tracked change with a regression spec. |
| `docker-compose.yml` | 176, 281-296 | IN-04: dev setup with an empty token silently disables stats | ℹ️ Info | Dev only |
| `docker-compose.test.yml` | 173, 268-276 | IN-05: CI throwaway literals not on the Aikido allow-list | ℹ️ Info | Possible scanner noise |

### Deviations weighed

- **Image tag-only, no `@sha256` pin (27-05 D1 human_judgment).** The must_have truth text requires `dhi.io/influxdb:2.9.1`, not a pin. It is met. The running digest `sha256:3d49ee8ee9a0` equals the rehearsed one, and `thinx_couchdb` on DHI is unpinned the same way. Accepted as Info; the Phase 28 follow-up is already recorded.
- **`INFLUXDB_TOKEN` mount exists only on the live `thinx_api` spec, not in the gluster `thinx.yml`.** This is a ⚠️ Warning. A `restart.sh` or stack deploy would silently drop it, and stats would fall back to the D-10 disabled mode with zero KPIs, which is exactly the "blanked dashboard" the goal forbids. It is documented in the runbook end state and matches the Phase 24 secrets, but nothing enforces it.
- **Diff-hygiene waiver, the CI #15564 failure followed by the ns-timestamp fix, the masked CI grep.** The masked grep is independently confirmed by the raw log `[******-spec] server_version=v2.9.1`. The ns fix is covered by the frozen-clock and step-back specs in CI. The waiver concerned Phase 26 prose and an already-published endpoint. None affects the goal.
- **27-05 first attempt denied and rolled back; second run under an operator window override.** The annex records 1.8 restored at 19:09 and `orig_changed=0` in the second run. No data effect.
- **Unsigned commits under an operator exception.** Info only.
- **Operator chose delete-all without check-in evidence.** It is one-way and done. Check-in evidence now exists (truth 4). The dashboard render is still open (human item 1).
- **CI log coverage-threshold ERROR lines** (lines 63%, below 80%). The job still succeeds. Not introduced by this phase.

### Prohibitions (judgment tier, non-authoritative LLM verdicts, all flagged for human review)

| Plan | Prohibition (short) | Verifier verdict | Evidence |
|------|---------------------|------------------|----------|
| 27-01 | No InfluxDB credential printed/logged/committed | no breach found | Annex records greps at 0; repo holds only the CI throwaway literals |
| 27-01 | No production stats data copied locally or into docs | no breach found | Annex holds aggregates only; the probe prints no owner ids |
| 27-01 | Swarmpit services and conf untouched; no restart.sh/stack deploy | no breach found | `swarmpit_influxdb` UpdatedAt 2026-10-01 06:49 (before the phase); the secret mounts survive (a stack deploy would drop them) |
| 27-02 | A stats failure never throws into or blocks request paths | no breach found | `statsLog` always resolves; outage specs passed in CI; WR-02 is noise, not blocking |
| 27-02 | No production credential committed | no breach found | `git grep` finds only `thinx-ci-influx-token` and `thinx-ci-password` in `docker-compose.test.yml` |
| 27-03 | No full rejected key or raw login input persisted or printed | no breach found | `apikey.js:212`, `router.auth.js:39-49` |
| 27-03 | The probe prints no token/URL/owner/tag, never writes | no breach found | Live output inspected: aggregates only |
| 27-04 | No main push, restart.sh or stack deploy; no push before GO | no breach found | Annex GO at 17:41, push at 17:42 |
| 27-04 | Edge password never seen (go-A) | n/a | go-B chosen |
| 27-05 | No credential in argv, logs or annex | no breach found | Annex greps at 0; mint piped into `docker secret create` |
| 27-05 | Original 1.8 dir unmodified until D-07 | no breach found (historical) | Annex `orig_changed=0`; deleted later under `delete-all` |
| 27-05 | Swarmpit untouched; no restart.sh/stack deploy | no breach found | As above |
| 27-06 | No retention applied before the backup is verified and enable answered | no breach found | Annex: enable decision, then `--secret-add` at 12:05 |
| 27-06 | Only the six named, write-free buckets dropped, with approval | no breach found | Annex re-check before each delete; live bucket list |
| 27-06 | Operator token, API token and CSRF material not recorded | no breach found | Annex: mktemp jar removed, `/dev/shm/p27` shredded |
| 27-07 | No deletion before the D-07 evidence and `delete-all`; influxdb2 never at risk | no breach found, **caveat** | The operator answered delete-all with two D-07 items unmet (shown to them). The influxdb2 data is live and intact |
| 27-07 | Swarmpit untouched, no stack deploy, no main push, unrelated gluster edits uncommitted | no breach found | Gluster HEAD `088a9b2` touches only thinx.yml (per annex) |
| 27-08 | No credential literal in `docker-compose.yml` / `config.yml`; dhi.io password on stdin | no breach found | `config.yml:763` uses `--password-stdin` |
| 27-08 | No CI step changed besides the two named; no leftover local compose project | no breach found | The diff has 2 hunks at 754 and 768 only |

### Human Verification Required

### 1. Dashboard and Visits render non-zero figures (success criterion 2)

**Test:** Log in to the Vue console on rtm.thinx.cloud as an owner with recent activity, then open the dashboard and the Visits page.
**Expected:** KPI figures render with non-zero values where there was activity (production has `count_7d_DEVICE_CHECKIN=2` across `owners_7d=3`). No blank panel. `/api/v2/stats` answers `{success:true,response:{…8 KPIs…}}`.
**Why human:** No automated check renders the UI for a real session. The operator left this open at the deletion decision.

### 2. Resolve the 19 flagged judgment-tier prohibitions

**Test:** Review the prohibitions table above.
**Expected:** Each one accepted or rejected by a human.
**Why human:** Judgment-tier verdicts from the verifier are not authoritative (ADR-550 D4).

### Gaps Summary

There are no blocking gaps. Every roadmap success criterion except the visual half of SC2 is proven by evidence this verifier gathered independently:

- **InfluxDB 2 in production:** the live service spec.
- **History kept:** the W80 window equals the 1.8 reference exactly, measured after the trim ran.
- **Writes and check-ins:** both flow live.
- **CI on v2 green:** the raw CircleCI logs.
- **90-day retention:** live and already enforcing.
- **No swarmpit mount:** the live spec and gluster HEAD.
- **Autoredeploy:** 46 s from image publish to container start.

The backup half of SC1 rests on the annex record, because the backup was deleted by design.

The status is `human_needed` for the dashboard/Visits render check and the flagged prohibitions. Two items need follow-up outside this phase:

- **CR-01** (pre-existing API-key substring-match auth bypass). It is critical and should be scheduled as its own fix.
- **The live-spec-only `INFLUXDB_TOKEN` mount.** A stack deploy would blank the stats.

WR-01 and WR-02 are robustness warnings in the new connector. No later phase (Phase 28 is Swarmpit) covers them, so they should go to the backlog.

---

_Verified: 2026-10-03T14:54:00Z_
_Verifier: Claude (gsd-verifier)_
