---
phase: 34-ops-surface-reduction-sla-close-out
verified: 2026-10-11T18:02:00Z
status: passed
score: 12/12 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  previous_verified: 2026-10-11T17:50:00Z
  gaps_closed:
    - "34-05 must-have: one clean external scan run (WINDOWS #20). The recorded vps run (17:51:24Z–17:53:50Z, d9ebca9d) is a complete single run ending in EDGE-SCAN OK. The verifier ran it again from vps at 17:58:31Z–18:00:20Z (rc=0) and the output matched the recorded run line for line (154/154)."
  gaps_remaining: []
  regressions: []
covered_files:
  - ".planning/PROJECT.md"
  - ".planning/ROADMAP.md"
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
covered_digest: "v3:sha256:803b9efed4845b7bf8f3fb46e5527efa0df71f246096f00823778538599de0a0"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 34: Ops Surface Reduction & SLA Close-out Verification Report

**Phase goal:** Reduce the operational attack surface and confirm the deploy SLA end-to-end.
**Verified:** 2026-10-11T18:02Z (re-verification #2; initial 17:20Z, re-verification #1 17:50Z)
**Status:** passed
**Re-verification:** Yes. The one remaining gap, WINDOWS #20 (a single clean external scan run), is closed. This verifier reproduced the result independently.

Both halves of the goal hold. The attack-surface half was re-checked live at 17:55–18:00Z: WARN level, a JSON access log with 3 drops, a socket-proxy-only Docker API, tls-config-3, HSTS once, the device ports, and now one clean external scan with all 16 hosts and the retired-host probes. The SLA half rests on `### P34 SLA run 2`: 380 s against the operator's 600 s budget, unchanged since the last report.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | SC1 / EDGE-OPS-01: log level WARN in production; the access log is free of secrets | ✓ VERIFIED | Carried from 17:20Z (46169 JSON lines; 0 forbidden keys, 0 `?`, 0 auth markers). Regression check 17:59Z: the live `traefik_traefik` has `args=24`, `--log.level=WARN` and `--accesslog.format=json`. |
| 2 | SC2 / EDGE-OPS-02: Traefik reaches the Docker API through a read-only socket-proxy, with no raw docker.sock mount | ✓ VERIFIED | Carried from 17:20Z (in-task `_ping` OK, secrets 403, POST 405; behavioural proof through the rollout). Regression check 17:59Z: `--providers.swarm.endpoint=tcp://traefik_socket-proxy:2375`; the only mount is `traefik_traefik-public-certificates`; `traefik_socket-proxy` is 1/1, `Up 11 hours (healthy)`; overview `[29,0,18,6,["Swarm","File"]]`; 0 routers not enabled. |
| 3 | SC3a / EDGE-OPS-03: push → CI → Swarmpit measured ≤ 600 s end-to-end on an edge change | ✓ VERIFIED | Carried. `### P34 SLA run 2`: L1 331.4 s + L2 39.9 s + L3 9.1 s = **380.4 s ≤ 600 s** (FAIL against the original 300 s by 80 s; the operator raised the budget after the run, and every record says so). Nothing in the SLA records has changed since 1359dd34 (`git diff 1359dd34 HEAD` touches only WINDOWS.md and the scan capture). |
| 4 | SC3b: swarm runbook updated | ✓ VERIFIED | Carried. `swarm.md` is unchanged since the last report. |
| 5 | D-15/D-16: tls-config-3 with `security-headers@file` as the https default; Go-default curves | ✓ VERIFIED | Live 17:59Z: configs `tls-config-3`; arg `--entrypoints.https.http.middlewares=security-headers@file`. Laptop 17:55Z: `curl -sI https://rtm.thinx.cloud/` returns HTTP/2 200 with **exactly 1** `strict-transport-security: max-age=31536000; includeSubDomains; preload`. The vps scans show `hsts 1` and the three ECDHE_RSA AEAD suites on all 16 hosts, TLS 1.3 yes and legacy none. |
| 6 | D-17: db/registry `:80` redirect-only; app `:80` plaintext on purpose | ✓ VERIFIED | Laptop 17:56Z: `http://db` 301, `http://app` 200, `https://db` 401. The vps scan shows `redirect` 301 to https on 15 hosts and app 200. |
| 7 | D-19: retired ACME entries pruned | ✓ VERIFIED | Carried (16 entries, 0 retired names). The retired `micro.thinx.cloud` answers `api=404 dashboard=404 routers=404` (laptop, `curl -k`), the same as the scan's retired-host line. |
| 8 | D-18 + WR-06: edge credential rotated; bcrypt hash outside the worker-bound tree | ✓ VERIFIED | Carried (label sha12 `4b8f8bbd91b2`, `$2y$12$`, secrets file 600/dir 700, 0 binds). The `.env` line removal is still not independently checked, because reading `.env` files is forbidden. It rests on the runbook record, as before. |
| 9 | Device paths: 7442 / 1883 / 8883 open; MQTTS 8883; 1884 removed | ✓ VERIFIED | Laptop → `188.166.23.244` at 17:55Z: **7442 OPEN, 1883 OPEN, 8883 OPEN, 1884 CLOSED**; 8080/2375 CLOSED. The scan from vps also prints `port 7442 rtm.thinx.cloud open`. The cert and the harness PASS ×2 (17:02Z) are carried. |
| 10 | Repo == origin == micro checkout; mirror and label parity | ✓ VERIFIED | thinx-swarm: laptop HEAD `88d0e5a` == origin/master `88d0e5a` == micro `/mnt/gluster/deployment/swarm` HEAD `88d0e5a`, 0 tracked-dirty (the 17:50Z report had `5005ca0`; `88d0e5a` is the README-only drift fix recorded there). Mirror, parity and spec are carried; the edge Args and Configs are unchanged live. |
| 11 | 34-REVIEW-FIX: all 14 findings fixed | ✓ VERIFIED | Carried. No implementation file has changed since 1359dd34. |
| 12 | 34-05 must-have: one clean external scan run ends in EDGE-SCAN OK (16 live hosts) | ✓ VERIFIED | **Recorded run** (d9ebca9d, vps 37.60.254.174, 17:51:24Z–17:53:50Z), checked line by line. The port sweep has all 4 ports (80/443 open, 8080/8443 filtered, never open), `port 7442 … open`, and the no-SNI subject. There are **16** host sections in exactly the script's `HOSTS` order, each with all 8 report lines (16× each of https/hsts/tls12/tls13/legacy/dashboard/redirect/serial). hsts≠1: 0; tls13≠yes: 0; legacy≠none: 0; dashboard sig≠0: 0; tls12 set mismatch: 0; dashboard 401 only on the exempt db/influx. The retired line reads `micro.thinx.cloud api=404 dashboard=404 sig=0`. It ends in `EDGE-SCAN OK` with **0** FAIL lines; it is the only `EDGE-SCAN OK` in the file. The script is unchanged since `43a60bea`. **Independent reproduction:** the verifier ran the same script (sha256 `b67d3c1e…` locally == in the container) once from vps, in a `--rm debian:12-slim` container, at 17:58:31Z–18:00:20Z: **rc=0, `EDGE-SCAN OK`**, and the output is **identical** to the recorded 154 lines (`diff` empty). Live cert serials on 6 sampled hosts match the run. WINDOWS #20 is `fixed` in both the table and the JSON (resolved 2026-10-11T17:54:12Z). The front-matter counts open 16 / fixed 4 / total 20 agree with the JSON, and all three phase-34 windows (#18, #19, #20) are fixed. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `~/Repositories/thinx-swarm/traefik.yml` | 24 flags, WARN, JSON log with 3 drops, full-name endpoint, socket-proxy, tls-config-3 | ✓ VERIFIED | live Args 24, matching args present |
| `~/Repositories/thinx-swarm/traefik/tls.toml` | security-headers middleware, no curve list | ✓ VERIFIED (live) | tls-config-3; HSTS once on 16/16 |
| `~/Repositories/thinx-swarm/{restart.sh,thinx.sh}` | literal loader, bcrypt only | ✓ VERIFIED | carried |
| `docker-compose.traefik.yml` | generated mirror at 24 | ✓ VERIFIED | carried |
| `docker-swarm.yml` | label parity | ✓ VERIFIED | carried |
| `scripts/traefik-edge-scan.sh` | HOSTS 16 + RETIRED_HOSTS probes | ✓ VERIFIED | full run executed by the verifier: rc=0 |
| `.planning/runbooks/swarm.md` | SLA recipe + socket-proxy ops | ✓ VERIFIED | carried |
| `.planning/runbooks/traefik-edge-hardening.md` | P34 records incl. SLA run 2 | ✓ VERIFIED | two stale scan lines (Info, below) |
| `.planning/runbooks/swarm-configs/traefik-edge.F.post.yml` | end-state capture | ✓ VERIFIED | exists |
| `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md` | a single EDGE-SCAN OK run | ✓ VERIFIED | `## Clean single run — 2026-10-11` section; the 34-05 automated check's capture half (`awk '/^## After \(post-P34/{f=1} f' … \| grep -q 'EDGE-SCAN OK'`) now passes, and its fresh-run half passed in the verifier's own vps run |
| `.planning/WINDOWS.md` | #20 fixed | ✓ VERIFIED | table + JSON + counts consistent |
| `AGENTS.md` | edge notes current | ✓ VERIFIED | carried |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `traefik_traefik` | `traefik_socket-proxy` | `tcp://traefik_socket-proxy:2375` | WIRED | 29/0 routers, proxy healthy (17:59Z) |
| https entrypoint | `security-headers@file` | tls-config-3 | WIRED | HSTS ×1 on all 16 hosts (vps) and rtm (laptop) |
| `couch-auth` / `influx-auth` | secrets file | loader | WIRED | carried; db/influx 401 in the scan |
| thinx-swarm repo | micro checkout | ssh push + ff | WIRED | `88d0e5a` ×3 |
| `traefik.yml` | `docker-compose.traefik.yml` | mirror generator | WIRED | carried |
| SLA recipe | `### P34 SLA run 2` | swarm.md § SLA | WIRED | carried |
| scan script | scan capture | stdout pasted | WIRED | the verifier's run == the recorded run |

### Data-Flow Trace (Level 4)

Not applicable. This phase changes infrastructure only.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| One full external scan run | `scripts/traefik-edge-scan.sh` in a `--rm debian:12-slim` container on vps (script piped in, sha checked) | rc=0, `EDGE-SCAN OK`, 0 FAIL, identical to the recorded run | ✓ PASS |
| Single HSTS on rtm | `curl -sI https://rtm.thinx.cloud/` | HTTP/2 200, 1× `max-age=31536000; includeSubDomains; preload` | ✓ PASS |
| Device ports from the public IP | `nc -z -G 5 188.166.23.244 <port>` | 7442/1883/8883 OPEN, 1884 CLOSED, 8080/2375 CLOSED | ✓ PASS |
| Retired host exposure | `curl -sk` micro.thinx.cloud `/api/overview`, `/api/http/routers`, `/dashboard/` | 404 / 404 / 404 | ✓ PASS |
| Live edge config | loopback API + `docker service inspect` on micro | `[29,0,18,6]`, 0 not enabled, args 24, tls-config-3, WARN, proxy endpoint, proxy healthy | ✓ PASS |
| Cert serials current | `openssl s_client … -serial` on 6 hosts | all match the run | ✓ PASS |

### Probe Execution

There are no `scripts/*/tests/probe-*.sh` probes. The phase's gate is the external scan, and this verifier executed it (above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| EDGE-OPS-01 | 34-01, 34-05 | Log level INFO/WARN; access logs free of secrets | ✓ SATISFIED | truth 1 |
| EDGE-OPS-02 | 34-01, 34-02, 34-05 | Docker API via a read-only socket-proxy | ✓ SATISFIED | truth 2 |
| EDGE-OPS-03 | 34-03, 34-04, 34-05 | push → CI → Swarmpit SLA end-to-end (600 s) | ✓ SATISFIED | truth 3 |

All three are `[x]` / Complete in `v1.15-REQUIREMENTS-IN-PROGRESS.md` (lines 35–37, 72–74). No orphaned requirements.

### Anti-Patterns Found

No TBD/FIXME/XXX markers. Four doc drifts remain after d9ebca9d. None is a blocker.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `.planning/runbooks/traefik-edge-hardening.md` | 2534–2536 | `## Recorded for later` still lists "External scan re-run from a stable uplink" as pending (not struck through like the SLA item above it) | ℹ️ Info | Strike it through and point at the `## Clean single run — 2026-10-11` section |
| `.planning/runbooks/traefik-edge-hardening.md` | 1975 | the re-verify matrix row "external scan" still says "no single full run clean … deviation" | ℹ️ Info | Add the 2026-10-11 vps run |
| `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-09.md` | ~239 | the `## After` verdict paragraph still says "No single full run printed the OK verdict line"; the clean run is appended at the end without a forward reference | ℹ️ Info | One-line forward pointer |
| `.planning/STATE.md` | 39 | "verification pending (EDGE-OPS-03 open gap, WINDOWS #19; full clean scan owed, WINDOWS #20)" | ℹ️ Info | The orchestrator updates this when the phase closes |
| git | — | `d9ebca9d` is local only: `origin/thinx-staging` is still at `1359dd34` | ℹ️ Info | Push when convenient (docs only, no CI effect on the edge) |

### Human Verification Required

None. The device-flow harness was not re-run because it mutates device state; its last recorded PASS ×2 is 2026-10-11 17:02Z, and the port and HTTPS checks above confirm both device paths are reachable.

### Gaps Summary

**Re-verification 2026-10-11 18:02Z: all gaps closed (2 of 2 across the two rounds).**

1. ~~EDGE-OPS-03 / SC3~~ was closed at 17:50Z by `### P34 SLA run 2` (380 s, PASS at the 600 s budget).
2. ~~WINDOWS #20~~ is closed now. The vps run in d9ebca9d is a complete single run: port sweep, 7442 guard, 16 hosts × 8 lines in script order, retired-host probes, `EDGE-SCAN OK`, 0 FAIL. The verifier did not take the paste on trust: it ran the unchanged script once more from vps and got rc=0 with byte-identical output. The laptop-uplink cause stated in the earlier report is consistent with this, since the same script runs clean from another network.

Phase 34 achieves its goal. Only the Info-level doc drift above remains.

---

_Verified: 2026-10-11T17:20Z; re-verified 17:50Z and 18:02Z_
_Verifier: Claude (gsd-verifier)_
