---
phase: "27"
slug: "influxdb-2-upgrade"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-03"
---

# Phase 27 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| production data → node-local backup → other node | Portable 1.8 backup copied node to node over an ssh pipe | Owner ids, raw rejected API keys in old APIKEY_INVALID tags (high) |
| executor → production nodes over ssh → containers | Backup, restore, rehearsal, cutover and deletes run as root | Root shell on production (critical) |
| executor → micro /dev/shm → one-shot containers | Credentials generated and consumed on the node only | InfluxDB admin password, operator token (critical) |
| production output → SUMMARY / runbook (public repo) | Evidence must be aggregate-only | Counts and booleans only |
| login form / Authentication header → auditLogError, apikey → stats and logs | Attacker-controlled input reaches stats tags | Usernames, rejected keys (medium) |
| npm registry → node_modules | Two new packages enter the runtime image | Supply chain (high) |
| local repo → origin thinx-staging → CI → private registry → production | A push redeploys the API | Code and repo contents (high) |
| CircleCI env → docker login; CI compose → throwaway InfluxDB | Registry password used in CI; test-only credential lives in the repo | Registry password (medium), throwaway token (low) |
| developer env → dev compose | Dev InfluxDB credentials interpolated from the shell | Dev credentials (low) |
| InfluxDB bucket admin; gluster data path | One-way retention and deletion; 1.8 original, copy and v2 data share one volume | Stats history (high) |
| executor → gluster swarm repo | Production stack file with unrelated uncommitted edits | Stack config (medium) |

---

## Threat Register

Register authored at plan time across 27-01..27-08 (each plan carries its own plan-scoped `T-27-SC` supply-chain row).

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-27-01 | Information disclosure | backup contents (owner ids, raw rejected API keys in old `data` tags) | high | mitigate | The backup sits root-only under /root/phase27 (0700) on node-local disk, outside gluster and the repo. The node-to-node copy is node-direct or an ssh pipe, never written to the executor. Only counts are kept. Deleted … | closed |
| T-27-02 | Information disclosure | rehearsal credentials | low | mitigate | Random throwaway values live in /dev/shm/p27r under umask 077, reach containers only via --env-file, are grep-checked absent from upgrade.log and the CQ export, and are shredded in teardown. | closed |
| T-27-03 | Denial of service | backup and restore load on the 0.2-CPU 1.8 service and node disks | medium | mitigate | Time-window precondition; the free-space STOP rule; restore and rehearsal run in throwaway containers capped at 512 MB and 0.5 CPU with --network none; the backup itself is a read-only stream. | closed |
| T-27-04 | Tampering | wrong container targeted (`name=influxdb` also matches swarmpit_influxdb) | medium | mitigate | Placement query first; select by the swarm service label thinx_influxdb; swarmpit services are only read (getent). | closed |
| T-27-05 | Tampering | Flux query built from the owner (countsByKpi) | medium | mitigate | `flux` tagged-template parameters only, so there is no string concatenation. The owner regex makes invalid input give zeros. The InfluxSpec injection case proves a quote-bearing owner is inert. | closed |
| T-27-06 | Denial of service | stats path inside device, build and login handlers | high | mitigate | One module-level WriteApi with bounded retries (maxRetries 2, maxRetryTime 10000, maxBufferLines 1000). writePoint and statsLog never throw or reject. Queries are wrapped in a 5 s timeout. Outage and no-token specs as… | closed |
| T-27-07 | Information disclosure | client error logging (HttpError carries headers, including Authorization, and the URL) | high | mitigate | `setLogger` replaced by terse `[influx] <msg> <reason>` lines. reasonOf reads only statusCode, code or timeout, never message or body. The outage spec asserts no log line contains the token. | closed |
| T-27-08 | Denial of service | series cardinality from arbitrary measurement names | medium | mitigate | writePoint drops any measurement outside EventTaxonomy.names() (spec case). | closed |
| T-27-09 | Information disclosure | CI token literal in docker-compose.test.yml | low | accept | A test-only value for an ephemeral tmpfs instance on the CI docker host. Production tokens are minted randomly by `influx auth create` in 27-05 and never committed. | closed |
| T-27-10 | Information disclosure | APIKEY_INVALID data tag and console line (raw rejected key) | high | mitigate | statsLog is called without data, so there is no tag and no console detail. The only mention left is log_invalid_key's 6-character redaction. StatsPrivacySpec asserts the key appears in no argument or captured log line. | closed |
| T-27-11 | Information disclosure | LOGIN_INVALID label (raw login input) | medium | mitigate | The `LOGIN_INVALID_REASONS` allow-list maps anything else to `unlisted`. A static spec pins all call sites to allow-listed literals. | closed |
| T-27-12 | Information disclosure | probe output | medium | mitigate | Aggregate-only key=value contract. The spec rejects a URL, the token or a 64-hex value in the output. The probe requires no config and prints no owner. | closed |
| T-27-13 | Information disclosure | cross-owner stats in the V2 routes | medium | mitigate | The owner comes from the session (router.user.js, unchanged) and reaches Flux as a parameter. StatisticsV2Spec seeds two owners and asserts isolation. | closed |
| T-27-14 | Tampering | wrong deploy path (main push, stack deploy, push before GO) | medium | mitigate | thinx-staging only; the push happens only after the blocking-human GO; no restart.sh or stack deploy (WR-02 hazard, Chronograf password reset). | closed |
| T-27-15 | Information disclosure | secrets in the pushed diff | high | mitigate | Pre-push scan of the added lines for key headers, cloud and SaaS token shapes, 64-hex values, the AGENTS.md endpoint, key and port (derived at run time), and the CI token outside its allowed files. secret_hits=0 is re… | closed |
| T-27-16 | Information disclosure | the edge password staged for go-A | high | mitigate | The operator types it with `read -rs` into /dev/shm/p27/admin_pw (umask 077) in their own session. The executor checks only `test -s` and mode 600 and never reads or prints the file. | closed |
| T-27-17 | Information disclosure | operator token, admin password, API token | critical | mitigate | Values live only in /dev/shm/p27 (umask 077) and reach containers via --env-file, a file argument, stdin or a name-only -e. The default `--influx-configs-path` keeps the CLI config inside the removed container. upgrad… | closed |
| T-27-18 | Tampering | migrated data integrity / rollback copy | high | mitigate | The upgrade runs on a copy; the original is proven unmodified by content: a sha256 manifest taken after scale=0 converged (and re-taken identical after the copy) still matches after the switch (orig_changed=0), indepe… | closed |
| T-27-19 | Information disclosure | basic-auth credentials over plain HTTP | medium | mitigate | The http router is set to https-redirect only (D-14), and a curl check requires a 30x redirect to https. | closed |
| T-27-20 | Elevation of privilege | API token scope (org all-access) | medium | accept | D-04: the operator accepted the wider scope for boot self-healing. It is mounted only on thinx_api (27-06), and the operator token is never mounted (D-11). | closed |
| T-27-21 | Denial of service | swarmpit_app's `influxdb` DNS could flip to thinx_influxdb and then fail auth | low | transfer | Phase 28 owns swarmpit_app. Resolution is recorded before and after the cutover, and the 27-07 push test detects autoredeploy impact. | closed |
| T-27-22 | Tampering | one-way trim armed without approval or without proof | high | mitigate | Blocking-human decision. A read-only tracer proves equal counts first. The W80 equality re-check after the trim is armed proves no in-window loss. The backup exists until 27-07. | closed |
| T-27-23 | Tampering | deleting a bucket that still receives writes | medium | mitigate | Zero-writes-since-cutover checks in Task 1 and again right before each delete; only the six named candidates; enable-all only. | closed |
| T-27-24 | Information disclosure | CSRF cookie and token used for the write proof | low | mitigate | mktemp jar removed at once; the token is held in a variable and unset, never echoed; only the HTTP code and counts are printed. | closed |
| T-27-25 | Information disclosure | operator token left on the node | medium | mitigate | `shred -u` of /dev/shm/p27 on every path, including defer. The verify requires shm_left=0. | closed |
| T-27-26 | Tampering | deleting the live /mnt/gluster/thinx/influxdb2 through a prefix or glob | critical | mitigate | Exact paths only, with no glob or variable prefix. The pre-delete mount scan matches exact path or path plus "/". The post-check requires the influxdb2 directory present, thinx_influxdb Running and the probe OK. | closed |
| T-27-27 | Tampering | gluster thinx.yml commit sweeping unrelated uncommitted edits | medium | mitigate | Index-only commit of the Phase 27 hunks. The verify requires head_files=thinx.yml and no working-tree drift for those hunks, measured against the pre-edit baseline count of the unrelated edits (`p27_wt_influx_base`). | closed |
| T-27-28 | Denial of service | autoredeploy broken after the upgrade | medium | mitigate | The SC5 push measures autoredeploy_s ≤ 300. If no task appears, swarm-autopull-recovery rung 1 is offered through a checkpoint, and the executor runs no recovery command itself. | closed |
| T-27-29 | Information disclosure | retained copies of old stats (raw rejected API keys in old tags) and pre-change specs (v1 credentials) | medium | mitigate | Deleted at the approved D-07 checkpoint. Until then they are root-only (0700/0600) on node-local disk. | closed |
| T-27-30 | Information disclosure | dhi.io registry password in the "Starting Influx" step | medium | mitigate | The login reads the CircleCI env var through `--password-stdin` only, exactly once in the job (CI-INFLUX-ORDER-OK counts it), and is never echoed or put in argv. The local e2e run skips the line, so no CI credential i… | closed |
| T-27-31 | Information disclosure | dev compose InfluxDB credentials | low | mitigate | INFLUXDB_USERNAME, INFLUXDB_PASSWORD and INFLUXDB_TOKEN are `${VAR}` references in environment entries and `$$VAR` inside the setup `sh -c`; DEV-COMPOSE-NO-LITERALS parses the file and fails on any literal value, in l… | closed |
| T-27-32 | Denial of service | CI suite starting before InfluxDB is onboarded | low | mitigate | The setup one-shot waits for `influx ping` and runs before "Starting Support Services"; the order check pins login < up < setup < support services, and the e2e run requires the setup table. | closed |
| 27-01/T-27-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed in this plan. Images are pulled by pinned tag and their digests are recorded. | closed |
| 27-02/T-27-SC | Tampering | npm installs (@influxdata/influxdb-client, -apis) | high | mitigate | The research Package Legitimacy Audit rates both OK: official influxdata repo, about 189k and 65k weekly downloads, postinstall null. Exact 1.35.0 pins, and `npm ls` checks the resolved versions. No [ASSUMED] or [SUS]… | closed |
| 27-03/T-27-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed in this plan. | closed |
| 27-04/T-27-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed here. The two client packages were vetted in 27-02 and are installed by the CI image build. | closed |
| 27-05/T-27-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. Images are pulled by pinned tag and their digests recorded. | closed |
| 27-06/T-27-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. | closed |
| 27-07/T-27-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. | closed |
| 27-08/T-27-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. Images are pinned by tag 2.9.1. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Per-threat verification evidence (implementation file:line or runbook annex row) is in the 2026-10-03 audit below; operational mitigations rest on `.planning/runbooks/influxdb2-upgrade.md` annex L493–509 and `27-VERIFICATION.md`, with a live read-only re-check on micro.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-27-01 | T-27-09 | CI-only throwaway InfluxDB token/password committed in `docker-compose.test.yml`; server runs on tmpfs and is destroyed per job | plan 27-02 (operator-approved plan) | 2026-10-02 |
| AR-27-02 | T-27-20 | API token is an all-access token for the single `stats` workload (D-04); mounted on thinx_api only, operator secrets unmounted | plan 27-04 / D-04 | 2026-10-02 |
| AR-27-03 | 27-0x/T-27-SC (low, 7 plans) | No new packages in those plans; image digests recorded in the annex | plans 27-01, 27-03..27-08 | 2026-10-02 |
| AR-27-04 | T-27-15 (deviation) | First push's diff-hygiene gate showed secret_hits=1 endpoint_hits=1 port_hits=1: a pattern name in prose and a manager endpoint already public in 18 files and AGENTS.md; no new secret pushed (re-scan clean) | operator (waive-reviewed) | 2026-10-02 |
| AR-27-05 | T-27-21 (transfer) | Swarmpit's InfluxDB host pin is transferred to Phase 28 (runbook "Phase 28 follow-ups") | plan 27-04 | 2026-10-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-03 | 40 | 40 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

### Security Audit 2026-10-03

| Metric | Count |
|--------|-------|
| Threats found | 40 |
| Closed | 40 |
| Open | 0 |

Notes from the audit:
- Plan attribution corrected: 27-01 holds T-27-01..04, 27-03 holds T-27-10..13, 27-04 holds T-27-14..16, 27-05 holds T-27-17..21, 27-06 holds T-27-22..25, 27-07 holds T-27-26..29 (the register above is generated from the plan files).
- T-27-03: the `influxd upgrade` one-shot had no memory/CPU cap (ran 3 s on micro, not on the 1.8 node) — accepted as closed.
- T-27-16 not exercised (go-B chosen).
- Core `/root/phase27` deletion rests on the annex record only.
- Unregistered flags: none.

Informational (outside the register):
- `INFLUXDB_TOKEN` is mounted only on the live thinx_api spec; `restart.sh` / stack deploy drops it and stats go to zero (availability; runbook L520–524).
- WR-02: refused writes (401/403/404) log 2–4 lines per event and never latch.
- IN-04: dev setup one-shot passes credentials on argv inside the container (dev only).
- CI test InfluxDB publishes 8086 on an ephemeral host port with the throwaway token (covered by AR-27-01).
- Carry the `SWARMPIT_INFLUXDB` pin (runbook L535–538) into the Phase 28 plan.
- Out of scope: **CR-01** API-key substring authentication bypass in `lib/thinx/apikey.js` `key_in_keys` (pre-existing, critical) — tracked as quick task 261003-s59. The manager endpoint is public in `AGENTS.md` and 18 other files, contradicting runbook L12–17.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-03
