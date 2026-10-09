---
phase: 33-dashboard-lockdown-tls-hardening
plan: 01
subsystem: infra
tags: [traefik, edge, swarm, dashboard, loopback-api, exposedbydefault, labels, nmap, sslscan, runbook]

# Dependency graph
requires:
  - phase: 32-v3-native-syntax-bc-removal
    provides: traefik:v3.7.14 on the 16-flag native-v3 static command, D.post.yml end-state capture, repo-first + auto-revert mechanics, mirror generator/checker
  - phase: 31-v2-v3-upgrade-backward-compat-mode
    provides: device-flow harness, direct-publish model (:7442/:1883/:8883 outside Traefik), 600-root out-of-git backup convention
provides:
  - Public Traefik dashboard/API route removed; api@internal served only on the loopback `mgmt` entrypoint (127.0.0.1:8080 inside the task netns) via the traefik-mgmt@swarm label router — ssh + docker exec plane only (EDGE-API-01/02)
  - --providers.swarm.exposedbydefault=false live with an identical 29-router inventory (D-07)
  - D-08 label clean-up live and committed (mosquitto TCP router, downtime/errorpage v2 network key, console/vue v1 STS labels, transformer/worker noexpose container labels, vault network key, WS rule host ${WEB_HOSTNAME})
  - scripts/traefik-edge-scan.sh (D-26 rerun scanner) + traefik-edge-scan.2026-10-08.md `## Before` capture, traefik-edge.E.pre.yml baseline, traefik-edge-hardening.md runbook with the `routers_post_A2:` phase-wide inventory baseline
  - traefik.sh scrubbed of credential/domain literals (D-04), with the live comparison recorded as two words
affects: [33-02 (Stage C/D/E build on the 17-flag state and routers_post_A2), 33-03 (scan `## After`, E.post.yml, AGENTS.md), phase-34 (D-20 redirect gaps, no-SNI, real client IPs)]

# Actuals (#2632) — same estimateTokens scale as the plan's estimate (chars/4 over the realized diff)
actuals:
  tokens: 27740
  tasks: 3
  commits: 9
plan_head_before: 123f791941e4a621e4e48b72e4554abd53c8bf1f
plan_head_after: 546137c740fef3c46a8c68b8ae534c60f9afc134

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Loopback management plane: Traefik API/dashboard on an entrypoint bound to 127.0.0.1 inside the task; gates read it with `docker exec <task> wget -qO- http://127.0.0.1:8080/api/...`; browser via laptop socat + ssh + `docker exec -i … nc`"
    - "Mgmt router declared in the traefik_traefik LABELS (not the file provider) so the swarm provider synthesises no default router; the traefik-public service port label is load-bearing and stays"
    - "Sorted-set compare of the rebuilt Args against the committed mirror (e-mail masked both sides) before every --args update — nothing reads Args by index"
    - "Overlay negative-reachability probe joins an existing traefik-public peer's netns (`docker run --network container:<peer>`) because the network is not attachable"
    - "Per-stage 600-root `docker service inspect` backup on micro is both the Args revert source and the label revert source"

key-files:
  created:
    - scripts/traefik-edge-scan.sh
    - .planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md
    - .planning/runbooks/swarm-configs/traefik-edge.E.pre.yml
    - .planning/runbooks/traefik-edge-hardening.md
  modified:
    - docker-swarm.yml
    - docker-compose.traefik.yml
    - ~/Repositories/thinx-swarm/traefik.yml
    - ~/Repositories/thinx-swarm/traefik.sh
    - ~/Repositories/thinx-swarm/thinx.yml
    - ~/Repositories/thinx-swarm/vault.yml

key-decisions:
  - "33-01: the traefik-mgmt router (PathPrefix(`/`) / mgmt / api@internal) lives in the traefik_traefik labels and the traefik-public port label is KEPT as load-bearing; --providers.file is deferred to Plan 02 Stage C (research amendments to D-01/D-02/D-10 applied as planned)"
  - "33-01: D-04 comparison recorded HASH-LITERAL=NO-MATCH and PASSWORD=NO-MATCH — both committed HASHED_PASSWORD exports were command substitutions (no literal hash in git) and the committed cleartext password never matched the live apr1 hash; the live middleware is gone since A2, rotation moot"
  - "33-01: the overlay negative probe runs from an existing traefik-public peer's network namespace (`--network container:<errorpage task>`) because `docker run --network traefik-public` is refused (network not attachable); :80 control OPEN, :8080 CLOSED"
  - "33-01: thinx-api-ws rule host is ${WEB_HOSTNAME} (= rtm.thinx.cloud), file-only — the live resolved rule is unchanged so no live update was issued"
  - "33-01: micro.thinx.cloud HTTPS-matrix baseline re-set to 200 (catch-all) after A2; `/dashboard/` on micro answers 302 (catch-all path), never 401"

patterns-established:
  - "Gate quartet after every live edge change: loopback status filter 29/0 + HTTPS code matrix (17 hosts) vs pre-stage baseline + WS 101/401 pair + bare-IP 301/200 pair, plus device ports OPEN and a per-task-id log scan"
  - "Phase-wide inventory baseline = the `routers_post_A2:` block in traefik-edge-hardening.md (29 names); every later stage diffs the live sorted names against it"

requirements-completed: [EDGE-API-01, EDGE-API-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "scripts/traefik-edge-scan.sh exists (executable, set -u, 17 D-27 hosts, 3 observable AEAD suites, FAIL predicates incl. the db/influx dashboard-401 exemption, EDGE-SCAN OK|FAIL) and the `## Before` capture records the un-hardened state (EDGE-SCAN FAIL 32, 8080/8443 closed, 7442 open, 0 secrets/e-mails)"
    requirement: EDGE-API-01
    verification:
      - kind: other
        ref: "33-01-PLAN.md Task 1 <automated> #1 (script tokens + bash -n) and #2 (capture content + hygiene greps)"
        status: pass
    human_judgment: false
  - id: D2
    description: "traefik-edge.E.pre.yml redacted baseline capture (16-flag command, 30-name router_inventory_pre, external_stack_labels D-09 dump, baseline_probe, served serials) with D.post.yml untouched"
    requirement: EDGE-API-01
    verification:
      - kind: other
        ref: "33-01-PLAN.md Task 1 <automated> #3 (16 flags, 30 @swarm names, sections, influx serial, hygiene, D.post.yml unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stage A live: traefik_traefik on 17 Args with --entrypoints.mgmt.address=127.0.0.1:8080, no --api.insecure; in-task ss shows 127.0.0.1:8080 only; overlay CLOSED, host and laptop curl rc=7, external sweep 8080/8443 closed; traefik-mgmt@swarm enabled on [mgmt] -> api@internal; loopback 29/0, overview [29,0,18,6,[Swarm]], dashboard served on the loopback; public micro.thinx.cloud/dashboard/ != 401 and /api/overview not JSON; labels exact"
    requirement: EDGE-API-02
    verification:
      - kind: integration
        ref: "33-01-PLAN.md Task 1 <automated> #6-#16 (live args, task/backup, ss bind, 29/0, routers_post_A2 diff, mgmt shape/overview/APIUrl, labels, negative reachability, public gone, bare-IP + WS, HTTPS matrix, ports) — all re-run after A2, all pass"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repo-first chain for Stage A: thinx-swarm traefik.yml (public routers + admin-auth removed, traefik-mgmt labels, LOAD-BEARING port label, mgmt flag, 17 `- --` lines, exposedbydefault still true at that point) on origin and micro; mirror MIRROR OK at 17 flags with 0 basicauth lines"
    requirement: EDGE-API-02
    verification:
      - kind: other
        ref: "33-01-PLAN.md Task 1 <automated> #4 (traefik.yml) and #5 (mirror + origin/micro SHA equality)"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-08 label clean-up: thinx.yml/docker-swarm.yml/vault.yml edited identically (parity diff empty), committed in both repos and on micro; live labels cleaned on mosquitto (0 traefik keys, ports 1883/8883 kept), downtime/errorpage (one traefik.swarm.network, no v2 key, same task ids), console/vue (0 frontend labels, same task ids), transformer/worker (0 noexpose, one restart each); inventory unchanged 29/0 == routers_post_A2; traefik_traefik untouched"
    requirement: EDGE-API-01
    verification:
      - kind: integration
        ref: "33-01-PLAN.md Task 2 <automated> #1-#7 — all pass (WS-rule grep verified with /usr/bin/grep BRE, see Issues)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Stage B: --providers.swarm.exposedbydefault=false live (17 Args, one restart), sorted router inventory identical across the flip (diff empty, 29), overview unchanged, probes == pre-row, pre-B 600-root backup with 17 Args; traefik.yml 0 `=true` tokens, mirror regenerated"
    requirement: EDGE-API-01
    verification:
      - kind: integration
        ref: "33-01-PLAN.md Task 3 <automated> #1, #3-#8 — all pass"
        status: pass
    human_judgment: false
  - id: D7
    description: "traefik.sh scrubbed: no DOMAIN/USERNAME/PASSWORD/HASHED_PASSWORD exports, EMAIL demanded from the environment with a :? guard, bootstrap lines intact, 0 e-mail/hash literals; D-04 comparison recorded as exactly two words in the runbook"
    requirement: EDGE-API-02
    verification:
      - kind: other
        ref: "33-01-PLAN.md Task 3 <automated> #2 (traefik.sh) and Task 1 <automated> #18 (exactly one HASH-LITERAL= and one PASSWORD= line)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Runbook traefik-edge-hardening.md: Reaching the API/dashboard (docker exec wget gate, nsenter fallback, socat bridge), Mechanism table, Baseline, Stage A / D-08 / Stage B records with Version.Index post-Stage-A1/A2/B equal to the live index and the 29-name routers_post_A2 block"
    requirement: EDGE-API-02
    verification:
      - kind: other
        ref: "33-01-PLAN.md Task 1 <automated> #10 and #18, Task 2 <automated> #7, Task 3 <automated> #8 — all pass"
        status: pass
    human_judgment: false

# Metrics
duration: 39min
completed: 2026-10-08
status: complete
---

# Phase 33 Plan 01: Dashboard lockdown tracer, D-08 label clean-up and exposedbydefault=false Summary

**Public Traefik dashboard/API route removed and `api@internal` moved to a loopback-only `mgmt` entrypoint inside the running task (ssh + docker exec plane, no credential anywhere), then exposure flipped to opt-in with an identical 29-router inventory — each live change one `docker service update` with a staged one-command rollback, repo-first across thinx-swarm, micro and the mirror.**

## Performance

- **Duration:** 39 min
- **Started:** 2026-10-08T22:37:30Z
- **Completed:** 2026-10-08T23:16:00Z
- **Tasks:** 3
- **Files modified:** 10 (4 created + 2 modified here; 4 modified in thinx-swarm)

## Accomplishments

- **EDGE-API-01 / EDGE-API-02 delivered live.** `traefik_traefik` runs 17 Args (`--entrypoints.mgmt.address=127.0.0.1:8080`, `--providers.swarm.exposedbydefault=false`, no `--api.insecure`, no `--providers.docker`); inside the task `ss -ltn` shows exactly `127.0.0.1:8080`; the overlay probe from a traefik-public peer namespace is CLOSED (`:80` control OPEN), host and laptop `curl :8080` exit 7, the external sweep shows 8080/8443 closed; `traefik-mgmt@swarm` (`PathPrefix(\`/\`)` / `mgmt` / `api@internal`) is the only dashboard route — `https://micro.thinx.cloud/dashboard/` answers 302/200 on the catch-all pages instead of the former 401, `/api/overview` is never Traefik JSON on any of the 17 hosts.
- **Stage A1 (args, one ~15 s restart) then A2 (label-only swap, same task id)**, each gated: loopback `29/0`, sorted names == `router_inventory_pre` − 2 public routers + `traefik-mgmt@swarm`, overview `[29,0,18,6,["Swarm"]]` (middlewares 7 → 6, admin-auth gone), mgmt router shape exact, `/` → 302 `/dashboard/`, dashboard HTML served on the loopback (`APIUrl` 1), label keys exact with the LOAD-BEARING port label kept, HTTPS matrix == baseline on 16 hosts (micro re-baselined 401 → 200), WS `101`/`401` + `X-Forwarded-Proto: https`, bare-IP `301`/`200`, 7442/1883/8883 OPEN, 0 provider errors on the new task.
- **D-08 clean-up, repo-first then label-only live:** thinx_mosquitto lost its rule-less MQTTS TCP router and opt-in labels (ports 1883/1884/8883 untouched and open); downtime/errorpage flipped `traefik.docker.network` → `traefik.swarm.network` in ONE update each (catch-alls alive: bare-IP 301/200); console/vue lost the dead v1 STS labels; transformer/worker lost the v1 `noexpose` container labels (one restart each, both Running); vault.yml and the `thinx-api-ws` rule (`${WEB_HOSTNAME}`) are file-only edits; `docker-swarm.yml` == `thinx.yml` traefik labels (parity diff empty); `traefik_traefik` untouched (`idx 38379757`).
- **Stage B (`exposedbydefault=false`, one restart)** under the identical-inventory gate: the sorted router names saved immediately before the flip equal the names read immediately after (diff empty, 29/29); `29/0`; overview unchanged; matrix/WS/bare-IP == pre-row; 0 log errors; ports OPEN. `Version.Index post-Stage-B: 38379801`.
- **Baseline + evidence:** `scripts/traefik-edge-scan.sh` and its `## Before` capture (`EDGE-SCAN FAIL 32`: CBC-SHA1 on TLS 1.2 ×17, HSTS missing ×14, micro dashboard 401; 0 `dashboard-open`/`api-exposed`; 8080/8443 closed; 7442 open; no-SNI → `CN=TRAEFIK DEFAULT CERT`), `traefik-edge.E.pre.yml` (16-flag command, 30-name credential-free `router_inventory_pre`, external-stack D-09 dump, `baseline_probe`), and the new runbook `traefik-edge-hardening.md` (Reaching the API/dashboard, Mechanism table A1→E, Baseline, Stage A / D-08 / Stage B records, `routers_post_A2:` 29-name block — the phase-wide inventory baseline).
- **D-04 closed:** `HASH-LITERAL=NO-MATCH`, `PASSWORD=NO-MATCH` (values travelled over ssh stdin only); `traefik.sh` scrubbed of every DOMAIN/USERNAME/PASSWORD/HASHED_PASSWORD export, `EMAIL` demanded from the environment, bootstrap-only NOTE added. 0 hash markers / 0 e-mail addresses in every committed artefact.
- **Keep-7442 honoured throughout:** every `--args` set carries the thxp/mqtt/mqtts flags verbatim; `thinx_mosquitto` `ports:` never touched; 7442/1883/8883 OPEN after every change; publishers unchanged (`thinx_api 7442->7442`, `traefik_traefik 80->80 443->443`).

## Task Commits

Each task was committed atomically (thinx-device-api on `thinx-staging`; thinx-swarm on `master`, pushed to origin and fast-forwarded on micro):

1. **Task 1: Stage A tracer (baseline, D-04, repo-first, A1, A2, gate, record)**
   - `2b0fae7f` feat(33): traefik-edge-scan.sh + before capture (D-26..D-29)
   - `86abd37f` docs(33): traefik-edge.E.pre.yml — redacted pre-Stage-A1 edge capture (D-09, D-29)
   - `76ab5e87` docs(33): traefik-edge-hardening.md — reaching the API, mechanism table, baseline (D-32)
   - thinx-swarm `93036a8` feat(edge): Phase 33 Stage A — loopback mgmt entrypoint + traefik-mgmt router, public dashboard routers removed
   - `7fd5f2b4` feat(33): Stage A — mirror regenerated at 17 flags
   - `a17ba31c` docs(33): Stage A record
2. **Task 2: D-08 label clean-up bundle**
   - thinx-swarm `6dc974b` chore(edge): Phase 33 D-08 label clean-up — mosquitto TCP router, v1 header/noexpose labels, vault network key, WS rule host variable
   - `a68a02ff` chore(33): D-08 label clean-up mirrored in docker-swarm.yml; mirror regenerated
   - `8150c987` docs(33): D-08 record
3. **Task 3: Stage B exposedbydefault=false + traefik.sh scrub**
   - thinx-swarm `efee92c` feat(edge): Phase 33 Stage B — exposedbydefault=false; traefik.sh scrubbed of DOMAIN/USERNAME/PASSWORD literals, EMAIL from env
   - `1c5f5f53` feat(33): Stage B — mirror regenerated (exposedbydefault=false)
   - `546137c7` docs(33): Stage B record

**Plan metadata:** see the final docs commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS).

## Files Created/Modified

- `scripts/traefik-edge-scan.sh` — laptop-only D-26 rerun scanner (nmap `ssl-enum-ciphers` + port sweep, sslscan, curl -I, openssl); 17 D-27 hosts; `FAIL <check> <host>` predicates; `BASICAUTH_HOSTS="db.thinx.cloud influx.thinx.cloud"` exempt from `dashboard-401` only; `EDGE-SCAN OK|FAIL <n>`.
- `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md` — `## Before (pre-Stage-A1, 22:44:51Z)`: verdict, per-host matrix, raw script stdout, reported-not-gating items (D-20 gaps on app/registry/db, D-16 no-SNI subject). Plan 03 appends `## After`.
- `.planning/runbooks/swarm-configs/traefik-edge.E.pre.yml` — redacted pre-phase capture in the D.post.yml shape plus `router_inventory_pre:`, `external_stack_labels:`, `d08_live_labels_pre:`, `baseline_probe:`.
- `.planning/runbooks/traefik-edge-hardening.md` — the Phase 33 sibling runbook (D-32).
- `docker-swarm.yml` — D-08 edits identical to thinx.yml. `docker-compose.traefik.yml` — regenerated after every thinx-swarm commit (17 flags, `exposedbydefault=false`, 0 basicauth lines).
- `~/Repositories/thinx-swarm/traefik.yml` — Stage A labels/flag + Stage B flag; `traefik.sh` — D-04 scrub; `thinx.yml`, `vault.yml` — D-08 edits.
- Live (not files): `traefik_traefik` Args 16 → 17 (+mgmt) → value flip (`=false`), labels swapped, `Version.Index 38379738 → 38379756 (A1) → 38379757 (A2) → 38379801 (B)`; labels cleaned on 7 services. `micro:/mnt/data/edge-rollback/traefik-p33-preA1-20261008T225429Z.json` and `traefik-p33-preB-20261008T231031Z.json` (600 root, never committed).

## Decisions Made

- Research amendments applied exactly as the plan records them: mgmt router in labels, port label kept, no `--providers.file` in this plan, `${WEB_HOSTNAME}` for the WS rule, downtime/errorpage network key flipped before Stage B, 17 flags at the end of this plan.
- Overlay negative probe: `docker run --rm --network traefik-public …` is refused on this swarm (`network traefik-public not manually attachable`), so the probe joins the `errorpage_errorpage` task's network namespace (`--network container:<id>`) — same `nc -z traefik 8080` question from the same overlay, with a `:80` control that must be OPEN. Recorded in the Stage A record.
- `micro.thinx.cloud` HTTPS-matrix baseline after A2 is **200** (`/` lands on the downtime catch-all); `/dashboard/` on micro answers **302** (catch-all path) — later stages compare against 200.
- The D-04 "HASH-LITERAL" comparison is trivially NO-MATCH because `traefik.sh` never held a literal hash (both exports were `$(openssl passwd -apr1 …)` substitutions); the meaningful result is `PASSWORD=NO-MATCH` — the committed cleartext literal was never the live credential.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Overlay reachability probe recipe not runnable on this swarm**
- **Found during:** Task 1 (Stage A2 gate step 7)
- **Issue:** the plan's `docker run --rm --network traefik-public alpine:3.20 sh -c 'nc -z -w2 traefik 8080 …'` fails with `network traefik-public not manually attachable` (the overlay was created without `--attachable`), so the negative proof could not run as written.
- **Fix:** ran the identical `nc -z -w2 traefik 8080` from inside the network namespace of an existing traefik-public-attached task (`docker run --rm --network container:<errorpage_errorpage task> alpine:3.20 …`), with `nc -z -w2 traefik 80` as a positive control → `CLOSED` / `CONTROL80=OPEN`. The host (`rc=7`), laptop (`rc=7`) and external-sweep (`8080/8443 closed`) proofs ran unchanged.
- **Files modified:** none (runbook Stage A record documents the substitute command)
- **Verification:** CLOSED on 8080, OPEN on 80 from the same namespace
- **Committed in:** `a17ba31c` (record)

---

**Total deviations:** 1 auto-fixed (1 blocking — verification-method substitution, no change to the delivered state).
**Impact on plan:** none on scope or security properties; the loopback-only claim is proven from the overlay, the host and the internet exactly as D-02 requires.

## Issues Encountered

- **Verify-literal quirks (recorded, not failures):** (a) the plan's ports/publishers `grep` literal (`… thinx_api 7442->7442 traefik_traefik …`) does not match byte-for-byte because the Go template emits a trailing space before the newline (two spaces after `7442->7442 `); it matches after `tr -s ' '`. (b) The plan's WS-rule `grep` (`Host(`${WEB_HOSTNAME}`) … (?i)websocket`) assumes BRE semantics; the laptop's `grep` is a shell function wrapping ugrep 7.8.4, which reads `${…}`/`(?i)` as regex. The literal matches 2/2 under `/usr/bin/grep` and with `grep -F`. Both affect Plans 02/03's copies of the same lines — noted in `deferred-items.md` for the verifier.
- **Mirror regeneration is not idempotent at the byte level:** the banner carries `generated:<timestamp>`, so regenerating before a commit (as the verify blocks do) dirties the tracked mirror; I restored it from HEAD each time rather than committing a timestamp-only change. The checker's `MIRROR OK` (banner SHA == thinx-swarm HEAD) is what the plan gates on and it passed at every step.
- **Drain lines on the stopping task:** after each `--args` restart (A1, B) `docker service logs` shows 13 transient `middleware … does not exist` lines on the OLD task id (the 32-02 precedent); 0 on the new task, so the per-task-id log scan is the one to trust. The new task's only ERR after A1 was the pre-existing `checkout.qooldata.com` ACME renewal error (Plan 02 Stage E).
- `.planning/STATE.md` and the `services/worker` gitlink were already modified in the working tree before this plan started (orchestrator state + an unrelated submodule pointer); neither was touched by the task commits.

## Authentication Gates

None — ssh to micro and both git remotes (GitHub origin, micro checkout over ssh) worked without prompts; GPG signing did not block any commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 33-02 (Stage C TLS options via `tls-config-2` + `--providers.file.filename`, Stage D entrypoint HSTS, Stage E ACME proof) starts from: live `traefik:v3.7.14 args=17 idx=38379801`, `routers_post_A2:` (29 names) in `traefik-edge-hardening.md`, micro HTTPS baseline 200, `exposedbydefault=false`, thinx-swarm `efee92c` == micro HEAD == origin/master, mirror `1c5f5f53` MIRROR OK at 17 flags.
- Plan 33-03: re-run `scripts/traefik-edge-scan.sh` and append `## After` to `traefik-edge-scan.2026-10-08.md`; write `traefik-edge.E.post.yml`; AGENTS.md / thinx-swarm README operator sections; the single D-31 human gate.
- Not pushed by this plan (by design): `thinx-staging` of thinx-device-api (the operator pushes when ready; no thinx_api label changed live so no Swarmpit rollout hazard was created). Both thinx-swarm commits ARE on origin/master and on micro.

## Self-Check: PASSED

- Created files exist on disk: `scripts/traefik-edge-scan.sh`, `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md`, `.planning/runbooks/swarm-configs/traefik-edge.E.pre.yml`, `.planning/runbooks/traefik-edge-hardening.md` — FOUND (re-checked before the final commit).
- Commits `2b0fae7f`, `86abd37f`, `76ab5e87`, `7fd5f2b4`, `a17ba31c`, `a68a02ff`, `8150c987`, `1c5f5f53`, `546137c7` are ancestors of HEAD on `thinx-staging` (`git rev-list --count 123f7919..546137c7` = 9); thinx-swarm `93036a8`, `6dc974b`, `efee92c` are on `master`, `origin/master` and micro.

---
*Phase: 33-dashboard-lockdown-tls-hardening*
*Completed: 2026-10-08*
