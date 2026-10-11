---
phase: 34-ops-surface-reduction-sla-close-out
verified: 2026-10-11T17:20:00Z
status: gaps_found
score: 10/12 must-haves verified
covered_files:
  - ".planning/WINDOWS.md"
  - ".planning/milestones/v1.15-REQUIREMENTS-IN-PROGRESS.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-01-PLAN.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-01-SUMMARY.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-02-PLAN.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-02-SUMMARY.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-03-PLAN.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-03-SUMMARY.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-04-PLAN.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-04-SUMMARY.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-05-PLAN.md"
  - ".planning/phases/34-ops-surface-reduction-sla-close-out/34-05-SUMMARY.md"
  - ".planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md"
  - ".planning/runbooks/swarm-configs/traefik-edge.F.post.yml"
  - ".planning/runbooks/swarm.md"
  - ".planning/runbooks/traefik-edge-hardening.md"
  - "AGENTS.md"
  - "docker-compose.traefik.yml"
  - "docker-swarm.yml"
  - "lib/thinx/rsakey.js"
  - "scripts/traefik-edge-scan.sh"
  - "spec/jasmine/03-RsakeySpec.js"
  - "spec/node/DeployKeyNames.test.js"
covered_digest: "v3:sha256:a4b5f0d628f205a977320a982b47a9e71e2632f9c34204e10e306dbcce927a0b"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "ROADMAP SC3 / EDGE-OPS-03: push -> CI -> Swarmpit measured <= 5 minutes end-to-end on an edge change"
    status: failed
    reason: "Never measured. Operator decision (b) on 2026-10-09 recorded it as an open gap (sla_verdict: OPEN-GAP, WINDOWS #19). Run 1 (21045c42) was NO-MEASUREMENT: test build 15839 was red on 03-RsakeySpec, so api-registry never ran. CircleCI never ran `test` for 8bc8ecf6, the push that carried the RSA spec fix 9020f3ca (only console/snyk jobs exist for that SHA). The final push fea9712e (2026-10-11T17:08:23Z) landed inside CircleCI's 'Infrastructure Maintenance' window (13:30-17:30Z, status page 'Service Under Maintenance'), had no readiness block and no instrumented T_PUSH, so it is not a valid sample."
    artifacts:
      - path: ".planning/runbooks/traefik-edge-hardening.md"
        issue: "### P34 SLA run 1 = NO-MEASUREMENT; sla_verdict OPEN-GAP; no ### P34 SLA run 2"
      - path: ".planning/WINDOWS.md"
        issue: "#19 open"
    missing:
      - "One valid timed sample per swarm.md § SLA verification: green `test` + `api-registry` on the thinx-staging tip, CircleCI not degraded or in maintenance, T_PUSH taken immediately before the push, L1/L2/L3 recorded as `### P34 SLA run 2`, verdict PASS iff total <= 300 s"
      - "If that sample is a FAIL, either a CI speed-up (L1 is the likely breaker) and a re-measure, or explicit operator acceptance of the measured total"
  - truth: "34-05 must-have: the external scan `## After` prints EDGE-SCAN OK over the 16 live hosts (one full run)"
    status: failed
    reason: "No single full scripts/traefik-edge-scan.sh run was clean on 2026-10-09. The laptop uplink dropped at the tail of each run, and 1.1.1.1 dropped in the same seconds. All 16 hosts pass every predicate only as a composite of runs 1 and 6. WINDOWS #20 is open."
    artifacts:
      - path: ".planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md"
        issue: "## After is a composite, not one clean run"
    missing:
      - "One clean full `scripts/traefik-edge-scan.sh` run from a stable uplink that ends in `EDGE-SCAN OK`, appended to the scan capture; then mark WINDOWS #20 fixed"
next_action: "Two things close this phase. (1) EDGE-OPS-03: one green CI run plus a timed deploy per `.planning/runbooks/swarm.md` § SLA verification, recorded as `### P34 SLA run 2`. Push a signed evidence commit to thinx-staging while CircleCI is healthy; the pipeline went green on fea9712e (test 15859, api-registry 15860), so the precondition now holds. A FAIL stays an open gap unless the operator explicitly accepts the measured total. (2) WINDOWS #20: one clean full `scripts/traefik-edge-scan.sh` run from a stable uplink ending in EDGE-SCAN OK, appended to `swarm-configs/traefik-edge-scan.2026-10-09.md`. Also fix the doc staleness listed under Anti-Patterns. The thinx-swarm README:42 bare endpoint name is the one to fix first."
---

# Phase 34: Ops Surface Reduction & SLA Close-out Verification Report

**Phase goal:** Reduce the operational attack surface and confirm the deploy SLA end-to-end.
**Verified:** 2026-10-11T17:20Z
**Status:** gaps_found
**Re-verification:** No (initial verification)

The attack-surface half of the goal holds live: WARN level, a secret-free JSON access log, a socket-proxy-only Docker API, tls-config-3, an ACME prune, and a bcrypt edge credential stored outside the worker's bind mount. The SLA half does not hold. The deploy SLA has never been measured. ROADMAP SC3 and EDGE-OPS-03 stay open, as the operator decided on 2026-10-09.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence (gathered 2026-10-11 17:09–17:20Z) |
|---|---|---|---|
| 1 | SC1 / EDGE-OPS-01: log level WARN in production; the access log is free of secrets | ✓ VERIFIED | Live `traefik_traefik` has 24 Args, including `--log.level=WARN`, `--accesslog.format=json` and `RequestPath`/`RequestLine`/`ClientUsername=drop`. I read the current container's whole log since its 06:47:41Z start with `timeout 30 docker logs`: 46177 lines, 46169 of them JSON. Keys RequestPath / RequestLine / ClientUsername: **0/0/0**. JSON lines containing `?`: **0**. `authorization` / `bearer ` / `Basic ` / `ott=` / `code=`: **0** each. Non-access lines: exactly the 8 known start-up WRN, 0 ERR. |
| 2 | SC2 / EDGE-OPS-02: Traefik reaches the Docker API through a read-only socket-proxy, with no raw docker.sock mount | ✓ VERIFIED | Mounts are `traefik_traefik-public-certificates` only. In-task `ls /var/run/docker.sock` returns "No such file". The endpoint is `tcp://traefik_socket-proxy:2375`, and in-task `nslookup` returns only `10.234.34.2`. From inside Traefik: `_ping` OK, `/v1.44/secrets` **403**, POST **405**. The proxy is `wollomatic/socket-proxy:1.13.1`, 1/1 `(healthy)`, `65534:998` (the socket gid is 998), read-only rootfs, no published port. Its healthcheck is `["CMD","/healthcheck"]` with `start-first`, and its allow-list is the anchored GET/HEAD set. `traefik-socket` is internal, not attachable, `10.234.34.0/24`, with exactly 2 services. **Behavioural proof:** the fea9712e rollout replaced `thinx_api` at 17:15:11Z, and Traefik's `thinx-api@swarm` server list holds exactly the new task's traefik-public IP, so the provider saw the redeploy through the proxy. Overview `[29,0,18,6,["Swarm","File"]]`, 0 non-enabled routers, router-name md5 `218439c68631` (== F.pre list). |
| 3 | SC3a / EDGE-OPS-03: push → CI → Swarmpit measured ≤ 5 min end-to-end on an edge change | ✗ FAILED | Not measured. See the Gaps Summary. |
| 4 | SC3b: swarm runbook updated | ✓ VERIFIED | `.planning/runbooks/swarm.md` lines 43–115 hold the end-to-end D-12 recipe: preconditions, T_PUSH, L1 through the CircleCI `Push to private registry` step, L2 with `{{json .Status.Timestamp}}`, L3 = the first 2xx/3xx JSON line with `ServiceAddr == <NEWIP>:7442` read via `timeout 30 docker logs`, the PASS rule, and the OPEN-GAP note. The `## Traefik Docker API socket-proxy` section (293–380) covers the failure mode, health, restart and rollback. |
| 5 | D-15/D-16: tls-config-3 with `security-headers@file` as the https default, the `@swarm` copy retired, Go-default curves | ✓ VERIFIED | Live Configs `["tls-config-3"]` is the only `tls-config-*` in the swarm. Arg `--entrypoints.https.http.middlewares=security-headers@file`. 0 `security-headers` labels on `traefik_traefik`. `security-headers@file` is enabled. HSTS appears exactly once on rtm/app/csrf/db/influx. `openssl -tls1_3 -groups X25519MLKEM768` reports `Negotiated TLS1.3 group: X25519MLKEM768`, and TLS 1.1 is refused. |
| 6 | D-17: db/registry `:80` redirect-only, app `:80` plaintext on purpose | ✓ VERIFIED | Laptop: `http://db` → 301 with 0 `WWW-Authenticate`; `http://registry` → 301; `http://influx` → 301; `http://app.thinx.cloud/` → 200, not redirected. The live label `thinx-db-http.middlewares=https-redirect` matches both stack files. |
| 7 | D-19: retired ACME entries pruned | ✓ VERIFIED | acme.json is `600 root:root` with **16** entries and **0** of the seven retired main names (counts only). |
| 8 | D-18 + WR-06: edge credential rotated; hash is bcrypt and stored outside the worker-bound tree | ✓ VERIFIED | `couch-auth` / `influx-auth` label sha12 is **`4b8f8bbd91b2`** on both (== the WR-06 record). Both are `admin:` + `$2y$12$`, apr1 0, removeHeader true, users 1, enabled. `/mnt/gluster/deployment/secrets` is `700 root:root`, `edge-basicauth` is `600 root:root`, and 0 services bind that path (0 for `thinx_worker`). `/root/.p34-basicauth` is absent (shredded). `restart.sh` / `thinx.sh` at `5005ca0`: `load_kv_file` literal reader, `HASHED_PASSWORD` taken only from the secrets file, group/other-readable refused, bcrypt `$2y$` cost 10–31 regex, all before `docker stack rm`; `bash -n` OK. Live db/influx https → 401 + Basic challenge. **Not independently checked:** the removal of the `HASHED_PASSWORD` line from `/mnt/gluster/thinx/.env`. Reading `.env` files is forbidden, so that rests on the runbook record (62 → 61 lines, worker count 0). |
| 9 | Device paths: 7442 / 1883 / 8883 stay open; MQTTS on 8883 with the thinx.cloud cert; 1884 removed | ✓ VERIFIED | Laptop → `188.166.23.244`: **7442 OPEN, 1883 OPEN, 8883 OPEN, 1884 CLOSED** (8080/2375 CLOSED). The `:8883` cert is `subject=CN=thinx.cloud`, notAfter Dec 28 2026. `thinx_mosquitto` publishes `[1883,8883]`; `thinx_api` publishes `[7442]`. `/etc/cron.d/mosquitto-cert-renew` is `644 root`, and its log shows daily `unchanged thinx.cloud` lines on 10-10 and 10-11. Device-flow harness: not re-run, because it registers devices (state-mutating). The last recorded PASS ×2 is 2026-10-11 17:02Z (WR-06 record). |
| 10 | Repo == origin == micro checkout; mirror and label parity | ✓ VERIFIED | thinx-swarm: laptop HEAD `5005ca0` == origin/master `5005ca0` == micro `/mnt/gluster/deployment/swarm` HEAD `5005ca0` (branch master, tracked-dirty 0). This repo: HEAD `fea9712e` == `origin/thinx-staging`. `check-traefik-mirror.js` prints `MIRROR OK files=1`, and both `traefik.yml` and the mirror have 24 `- --` lines. `docker-swarm.yml` and `thinx.yml` traefik label sets (users values masked) diff empty: port 5984, couch and influx `removeheader=true`, mosquitto 8883 with no 1884. Live `traefik_traefik` Spec vs PreviousSpec differs only by the WR-02 endpoint plus engine-defaulted fields. |
| 11 | 34-REVIEW-FIX: all 14 findings fixed | ✓ VERIFIED (spot-checked) | `34-REVIEW-FIX.md` frontmatter: `status: all_fixed`, 14/14. Live: WR-02 endpoint, WR-03 influx removeHeader, IN-01 healthcheck + start-first, WR-06 bcrypt/location. Repo: WR-01/WR-06 loaders; WR-04 `RETIRED_HOSTS="micro.thinx.cloud"` with HOSTS 16; WR-05 `mkdtempSync` + `afterAll rmSync` in `03-RsakeySpec`; IN-08 `wx` claim in `rsakey.js`. `node --test spec/node/DeployKeyNames.test.js` gives **6/6 pass**. CI: `test` 15859 on fea9712e (which carries 9020f3ca + a70837ee) is **success**, the first green `test` on thinx-staging since 75e083eb. D-20 was dropped as recorded: 0 commits touch `vault.yml`/`vault.conf` since `b04f066`. |
| 12 | 34-05 must-have: one clean external scan run ends in EDGE-SCAN OK | ✗ FAILED | WINDOWS #20 is open. The `## After` result is a composite of two runs. |

**Score:** 10/12 truths verified (0 present-but-behavior-unverified)

### Deferred Items

None. Every later phase in ROADMAP.md (35+) belongs to v1.16, Console Usability & Deploy Keys, and none of them names the SLA or the edge scan.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `~/Repositories/thinx-swarm/traefik.yml` | 24 flags, WARN, JSON log with 3 drops, full-name endpoint, socket-proxy service, tls-config-3 | ✓ VERIFIED | lines 86, 105, 141–154, 185–212, 230, 259 |
| `~/Repositories/thinx-swarm/traefik/tls.toml` | security-headers middleware, no curve list | ✓ VERIFIED (live) | served as tls-config-3; PQ group negotiated; HSTS once |
| `~/Repositories/thinx-swarm/{restart.sh,thinx.sh}` | literal loader, bcrypt only, secrets file | ✓ VERIFIED | `5005ca0`, `bash -n` OK |
| `docker-compose.traefik.yml` | generated mirror at 24 | ✓ VERIFIED | MIRROR OK files=1 |
| `docker-swarm.yml` | label parity with thinx.yml | ✓ VERIFIED | parity diff empty |
| `scripts/traefik-edge-scan.sh` | HOSTS 16 + RETIRED_HOSTS probes | ✓ VERIFIED | syntax OK (no full run performed by the verifier) |
| `.planning/runbooks/swarm.md` | end-to-end SLA recipe + socket-proxy ops | ✓ VERIFIED | present, current endpoint name |
| `.planning/runbooks/traefik-edge-hardening.md` | P34 records, dispositions, revert set, SLA record | ✓ VERIFIED (minor staleness, see Anti-Patterns) | all records present |
| `.planning/runbooks/swarm-configs/traefik-edge.F.post.yml` | end-state capture | ✓ VERIFIED | exists |
| `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md` `## After` | EDGE-SCAN OK | ✗ PARTIAL | composite only (gap 2) |
| `AGENTS.md` | edge notes current | ✓ VERIFIED | proxy full name, 24 flags, tls-config-3, bcrypt location, MQTTS 8883 |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `traefik_traefik` | `traefik_socket-proxy` | `--providers.swarm.endpoint=tcp://traefik_socket-proxy:2375` over `traefik-socket` | WIRED | 29/0 routers; the new thinx_api task IP appeared through the proxy after the 17:15Z rollout |
| https entrypoint | `security-headers@file` | tls-config-3 file provider | WIRED | HSTS ×1 on every probed host |
| `couch-auth` / `influx-auth` labels | secrets file | `restart.sh` / `thinx.sh` loader | WIRED | live sha12 == expected render `4b8f8bbd91b2` |
| thinx-swarm repo | micro checkout | ssh push + `--ff-only` | WIRED | `5005ca0` ×3 |
| thinx-swarm `traefik.yml` | `docker-compose.traefik.yml` | `generate-traefik-mirror.js` | WIRED | MIRROR OK |
| SLA recipe | measured `### P34 SLA run 2` | swarm.md § SLA verification | NOT_WIRED | no valid run exists (gap 1) |

### Data-Flow Trace (Level 4)

Not applicable. The phase changes infrastructure and renders no dynamic UI data. For the served-via-edge marker, the edge server list equals the new task's IP; see truth 2.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Proxy refuses secrets and writes from inside Traefik | `docker exec <traefik> wget …/v1.44/secrets` and `--post-data` | 403 / 405, `_ping` OK | ✓ PASS |
| Access log carries no query or auth material | time-bounded `docker logs` counts since 06:47Z | 0 forbidden keys, 0 `?`, 0 auth markers in 46169 JSON lines | ✓ PASS |
| PQ hybrid offered | `openssl s_client -tls1_3 -groups X25519MLKEM768` | `Negotiated TLS1.3 group: X25519MLKEM768` | ✓ PASS |
| Device ports from the public IP | `nc -z -G 5 188.166.23.244 <port>` | 7442/1883/8883 OPEN, 1884 CLOSED | ✓ PASS |
| MQTTS cert | `openssl s_client -connect 188.166.23.244:8883 -servername thinx.cloud` | `CN=thinx.cloud`, notAfter 2026-12-28 | ✓ PASS |
| Deploy-key naming (IN-08) | `node --test spec/node/DeployKeyNames.test.js` | 6 pass / 0 fail | ✓ PASS |
| Edge after the thinx_api rollout | loopback API + laptop curls | 29/0, 0 not-enabled; rtm 200, csrf 200, 7442 OPEN | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED. The phase declares no `scripts/*/tests/probe-*.sh` probes. Its gate is the external scan, which is gap 2.

### Requirements Coverage

Source: `.planning/milestones/v1.15-REQUIREMENTS-IN-PROGRESS.md`, lines 35–37 and 72–74. All three are still `[ ]` / Pending there.

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| EDGE-OPS-01 | 34-01, 34-05 | Log level reduced to INFO/WARN; access logs free of secrets | ✓ SATISFIED | truth 1 (the checkbox is still unticked; orchestrator bookkeeping) |
| EDGE-OPS-02 | 34-01, 34-02, 34-05 | Docker API via a read-only socket-proxy, not a raw mount | ✓ SATISFIED | truth 2 (checkbox still unticked) |
| EDGE-OPS-03 | 34-03, 34-04, 34-05 | 5-min push → CI → Swarmpit SLA verified end-to-end | ✗ BLOCKED | truth 3: OPEN-GAP, never measured |

No orphaned requirements: REQUIREMENTS-IN-PROGRESS maps exactly these three IDs to Phase 34, and the plans claim all three.

### Anti-Patterns Found

No TBD/FIXME/XXX debt markers were found in the phase's implementation files. The findings are documentation drift. Each one is a ⚠️ Warning or ℹ️ Info, not a blocker.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `~/Repositories/thinx-swarm/README.md` | 42 | still says `--providers.swarm.endpoint=tcp://socket-proxy:2375`, the bare alias that WR-02 retired (line 82 of the same file is correct). This is in the repo, origin and the micro checkout. | ⚠️ Warning | invites someone to restore the collision-prone name |
| `.planning/runbooks/traefik-edge-hardening.md` | 2479–2482 | `## Recorded for later` still lists "Edge basic-auth hash → bcrypt … needs the plaintext again" as pending. It was done on 2026-10-11 (`### P34 WR-06 bcrypt + move record`). | ⚠️ Warning | stale open item |
| `.planning/WINDOWS.md` #19 / the SLA record | 36 / 1863 | do not record that 8bc8ecf6 never got a `test` run, that fea9712e was pushed during CircleCI maintenance (not a sample), or that `test` went green on fea9712e | ℹ️ Info | the next measurer lacks this context |
| `.planning/ROADMAP.md` | Phase 34, 34-04 line | still says "+ vault.yml re-pin (folded D-18..D-20)". D-20 was dropped and moved to v1.17. The 34-02 line still names `tcp://socket-proxy:2375` (historical). | ℹ️ Info | stale plan list |
| `34-REVIEW-FIX.md` | 45–51 | "thinx_mosquitto does not listen on :8883" is not marked superseded by `### P34 MQTTS 8883 record` | ℹ️ Info | misleading if read alone |
| `traefik-edge-hardening.md` | 1920–1964 | the hand-off snapshot (17:06Z on 10-09) lists the old endpoint and Version.Index 38380188. All services were respec'd swarm-wide at 2026-10-11T06:47:33Z (idx 38380400; Traefik and the proxy got new tasks, and engine defaults were added). | ℹ️ Info | dated snapshot; live state verified consistent |
| `~/Repositories/thinx-swarm` (laptop) | — | the working tree has a modified `landing` submodule pointer (`c07d3c9` → `2cdbb6e`). It is not committed, and the micro checkout is clean. | ℹ️ Info | unrelated to the phase; don't sweep it into an edge commit |

### Non-sample observation (context for gap 1, NOT an SLA measurement)

fea9712e was pushed at 17:08:23Z during the maintenance window. `test` 15859 succeeded at 17:11:39Z. The `api-registry` 15860 step "Push to private registry" ended at **17:13:45.47Z**, about **322 s** after the push. The new `thinx_api` task (`qntushc2e953`, digest `096c3cf47d1f`) was Running at **17:15:11Z**, about **408 s** after the push, and the edge routes to it. This does not count as a sample: no readiness block, no instrumented T_PUSH, and CircleCI was in maintenance. It does support the runbook's expectation that L1 (CI) alone can use up the 300 s budget, and the 2026-10-08 history (~285–301 s) points the same way. Expect a valid run 2 to come out FAIL unless CI is sped up. In that case the gap stays open until the operator accepts the number or CI changes.

### Human Verification Required

None that would change the verdict. The harness was not re-run because it mutates device state. Its last recorded PASS ×2 is from 2026-10-11 17:02Z, and the port and HTTPS checks above confirm both device paths are reachable.

### Gaps Summary

Both gaps have the same cause: work that needed a healthy external dependency could not complete. Neither is a defect in the delivered edge.

1. **EDGE-OPS-03 / ROADMAP SC3: the SLA was never measured (BLOCKER).** The operator chose `sla_verdict: OPEN-GAP` on 2026-10-09. Every candidate push since then has been invalid:
   - 21045c42: red `test`.
   - 8bc8ecf6: CircleCI ran no `test` job for it.
   - fea9712e: pushed inside CircleCI's 13:30–17:30Z maintenance window, with no instrumentation.

   The runbook half of SC3 is satisfied. **To close it:** with CircleCI healthy and the thinx-staging tip green (true since fea9712e), push one signed evidence commit and time it per `.planning/runbooks/swarm.md` § SLA verification, recording `### P34 SLA run 2`. PASS iff the total is ≤ 300 s. A FAIL stays open unless the operator explicitly accepts it.
2. **WINDOWS #20: no single clean external scan run.** Every host passes only as a composite. **To close it:** run `scripts/traefik-edge-scan.sh` once from a stable uplink, append the `EDGE-SCAN OK` run to `swarm-configs/traefik-edge-scan.2026-10-09.md`, and mark #20 fixed.

The post-plan operator changes are consistent across the runbook, both repos and live, as are all 14 review fixes: thinx-db port 5984, couch-auth and influx-auth removeHeader, the full-name proxy endpoint, the proxy healthcheck with start-first, the literal loader, MQTTS 8883 with 1884 removed and the renew cron, and WR-06 bcrypt with the move. The D-20 drop to v1.17 is respected.

---

_Verified: 2026-10-11T17:20Z_
_Verifier: Claude (gsd-verifier)_
