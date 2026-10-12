---
phase: 31-v2-v3-upgrade-backward-compat-mode
plan: 03
subsystem: infra
tags: [traefik, edge, migration, v3, cutover, device-paths]

# Dependency graph
requires:
  - phase: 31-01
    provides: "converted v3 static command (17 flags: swarm provider + core.defaultRuleSyntax=v2), @docker->@swarm + network-label renames, ordered surgical A/B1/B2/C cutover mechanism + post-B2 router gate, boot-and-discover proof"
  - phase: 31-02
    provides: "out-of-git 600 pre-cutover snapshot on micro (acme.json + resolved spec + full-spec backup) + staged-ready, dry-verified v3->v2.11 rollback"
provides:
  - "LIVE production edge on traefik:v3.7.14 (digest e849695b…): --providers.swarm x3 + --core.defaultRuleSyntax=v2, 17 args index-exact vs the committed docker-compose.traefik.yml, zero --providers.docker*, ports :80/:443 only, 1 task on micro (Version.Index 38379311, Running since 2026-10-07T22:04:51Z)"
  - "Route parity proven against the 21:52Z v2.11 baseline: https app/console/rtm/thinx.cloud/swarmpit 200, micro 401, http redirect hosts 301, http app 200; 30 http routers / 18 services / 7 middlewares all enabled, 0 errors, 0 warnings, providers [Swarm], 0 @docker strings in /api/rawdata"
  - "Cert continuity: app.thinx.cloud serial 051152D5A20BE36DEFA1B6FA83379CE42809 and rtm serial unchanged vs the 31-02 snapshot; acme.json 24/24 cert + 24/24 key blobs identical (v3 one-time rewrite dropped only le.Account.KeyType); no re-challenge"
  - "EDGE-MIG-04 re-verified post-hop: :7442/:1883/:8883 OPEN throughout (direct publish, unaffected even during the web outage); full legacy device flow (register -> status -> OTT -> firmware 380048 B md5Match -> MQTT connect/ACL/publish/recent/disconnect) PASS over http://rtm.thinx.cloud:7442 + mqtt://thinx.cloud:1883; operator confirmed the console Devices page over HTTPS/WS"
  - "Committed redacted v3 end-state capture swarm-configs/traefik-edge.C.post.yml (pairs with C.pre.yml; delta = image, 4 provider flags, network-label key)"
  - "Runbook §Live cutover record: timeline, re-verify matrix, deviation root cause, plan <verify> acceptance, hand-off state; CORRECTION markers on the two mechanism-table rows that claimed a zero-window label bridge"
  - "Deferred 31-01 Task 3 criterion CLOSED: post-B2 router filter select(.status!=\"enabled\") printed nothing at 22:07:57Z"
affects: [32, 33, 34]

# Actuals (#2632) — same scale as the plan estimate (chars/4 over the realized diff)
actuals:
  tokens: 7420
  tasks: 3
  commits: 1
plan_head_before: 9bdebdb60e7f8b7590b7666daa0389debc7051ba
plan_head_after: f0302672ba76d20b59238cb22eb9ffe2cb3c8c18

# Tech tracking
tech-stack:
  added: ["traefik:v3.7.14 (LIVE production edge since 2026-10-07T22:04:51Z; swarm provider, BC mode)"]
  patterns:
    - "Ordered surgical cutover: one docker service update per step (B1 image+args+label-rm on traefik_traefik, B2 label-add on the @docker-ref services), --args rebuilt ON micro from the 600-root backup via jq map(@sh), dry-printed and diffed index-exact against the committed mirror before firing; no stack deploy, no restart.sh"
    - "Under Traefik v3's swarm provider a service MUST NOT carry both traefik.docker.* and traefik.swarm.* label families, even briefly — the provider skips it (both Docker and Swarm labels are defined). Label migrations are single-step (--label-rm old --label-add new in one update), never bridged"
    - "Dashboard credential handled host-side only: operator places the password in a 600-root file on micro, the executor reads it into a shell var on the host, verifies against the live apr1 hash, deletes the file at task end; no secret value in any output or commit"
    - "acme.json continuity proven by content, not size: per-certificate cert/key blob compare against the snapshot (24/24 identical) after v3's one-time structural rewrite"
    - "Post-hop device-path proof = same harness run twice (v2.11 baseline before B1, v3 after the post-B2 gate) over the plaintext :7442 + :1883 path and the HTTPS path, then a blocking-human gate for console/WS judgment"

key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.C.post.yml
  modified:
    - .planning/runbooks/traefik-v3-cutover.md

key-decisions:
  - "Live edge cut over to traefik:v3.7.14 BC mode via ordered surgical service updates (B1 22:04:47Z -> B2 22:04:57Z -> C 22:06:39Z), operator-authorized at the Task 1 blocking-human decision gate (proceed); rollback staged but NOT needed"
  - "Stage A/C 'both-label bridge' is INVALID under v3's swarm provider — it skips any service carrying both label families; the 31-01 mechanism-table claim that v3 ignores traefik.docker.* was wrong live. Stage C was pulled forward into the cutover (Rule 3) and all future label migrations (P32-P34) are single-step updates"
  - "Operator accepted the Task 3 gate on the harness device-flow evidence plus a personal console check (approved, console checked, 2026-10-08) — no rollback trigger"
  - "Operator deferred the thinx-staging push: the CI mirror gate / image rollout runs on the operator's own timing; the phase-31 commits stay local (not a cutover deviation — the live edge is already on v3)"
  - "Runbook §Rollback Step 3's Stage-C clause is now mandatory (Stage C has run): a v3->v2.11 return must re-add traefik.docker.network=traefik-public on thinx_api, thinx_mosquitto, thinx_couchdb, thinx_influxdb, swarmpit_app"

patterns-established:
  - "traefik-edge.<letter>.post.yml captured immediately after the hop, redacted on micro, diffable against the .pre twin — the delta list in its header is the executed change set"
  - "Every live cutover records a B1->B2 window (here 10 s) and a web-outage window (here 1 min 55 s) with the root cause, so the next hop's mechanism table is calibrated on observed, not predicted, provider behavior"

requirements-completed: [EDGE-MIG-02, EDGE-MIG-04]

coverage:
  - id: D1
    description: "Live traefik_traefik runs traefik:v3.7.14 in BC mode: resolved Args contain --providers.swarm + --core.defaultRuleSyntax=v2, zero --providers.docker*, 17 flags, exactly one running task, published ports :80/:443 only"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "ssh micro \"docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len .Spec.TaskTemplate.ContainerSpec.Args}}'\" -> traefik:v3.7.14 args=17 (re-run 2026-10-08 at close-out); plan <verify> V1 (swarm + BC grep) PASS, V2 (no providers.docker) PASS, 1 running task PASS at 22:10:50Z"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every live router reports status==enabled post-B2 (T-31-08; closes the deferred 31-01 Task 3 criterion)"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "curl -u … https://micro…/api/http/routers | jq 'select(.status!=\"enabled\")' -> printed nothing at 22:07:57Z; /api/overview http routers 30 / errors 0 / warnings 0, services 18 / 0, middlewares 7 / 0, providers [\"Swarm\"]; grep -c '@docker' /api/rawdata -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Route parity + cert continuity vs the v2.11 baseline: every web host serves its baseline code; :443 cert valid (checkend 0) with unchanged serials"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "matrix 22:07:57Z vs 21:52Z: https app/console/rtm/thinx.cloud/swarmpit 200/200/200/200/200, https micro 401, http console/rtm/thinx.cloud/swarmpit/micro 301 -> https, http app 200 — identical; openssl s_client app.thinx.cloud:443 | x509 -checkend 0 -> 'Certificate will not expire' (V3 PASS); serial 051152D5A20BE36DEFA1B6FA83379CE42809 == snapshot; rtm serial 0535CC0C71E39D9378E72893F3A2141267B0 == snapshot; V4 PASS"
        status: pass
    human_judgment: false
  - id: D4
    description: "acme.json continuity through the hop — no re-challenge storm (T-31-09)"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "per-cert blob compare live acme.json vs /mnt/data/edge-rollback/traefik-2026-10-07/acme.json -> 24/24 certificate + 24/24 key blobs identical; sole structural delta le.Account.KeyType dropped (301146 -> 301121 bytes, 600 root kept); 1 ACME log line after start = pre-existing checkout.qooldata.com renewal retry (same as v2.11), not a storm"
        status: pass
    human_judgment: false
  - id: D5
    description: "Legacy device flow over :7442 + plain MQTT survives the hop (EDGE-MIG-04 / D-05 / T-31-04): ports open and direct-published, full check-in -> OTT -> firmware -> MQTT round-trip"
    requirement: EDGE-MIG-04
    verification:
      - kind: integration
        ref: "THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs post-7442 http://rtm.thinx.cloud 7442 thinx.cloud 1883 -> PASS at 22:08Z (register, status, OTT 200, firmware 380048 B md5Match, MQTT connected + both ACL grants, publish, recent, disconnect); same harness over https://app.thinx.cloud -> PASS; plan <verify> V5 (:7442/:1883/:8883 TCP accept) PASS, V6 (thinx_api publishes 7442; thinx_mosquitto 1883/8883) PASS"
        status: pass
    human_judgment: true
    rationale: "blocking-human gate — operator approved on harness evidence + console check (2026-10-08). The automated harness proves the protocol round-trip; whether it represents what a real __DISABLE_HTTPS__ THiNXLib device does is the operator's judgment, and the plan made that gate blocking-human by design."
  - id: D6
    description: "Console + WebSocket over the v3 edge (console-retest: served bundle, WS target via the thinx-api-ws@swarm router, Devices page renders)"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "WS upgrade probe https://rtm.thinx.cloud/ -> 200 (pre and post); thinx-api-ws@swarm enabled with sslheaders@swarm; https console.thinx.cloud 200"
        status: pass
    human_judgment: true
    rationale: "Operator personally confirmed the console Devices page renders over the new edge ('approved, I checked the console too', 2026-10-08) — the render/parse-error judgment is visual and cannot be made by the executor."
  - id: D7
    description: "Committed redacted v3 end-state capture traefik-edge.C.post.yml — no resolved secret/hash/key material, ${VAR} templated (P29 D-12)"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "test -f traefik-edge.C.post.yml && grep -Ec '\\$apr1\\$|\\$2[aby]\\$|BEGIN |PRIVATE KEY' -> 0 (V7 PASS; re-run at close-out: 0); e-mail regex over C.post.yml -> 0; runbook -> 1 hit = rollback-dryrun@example.invalid (fake dry-verify placeholder)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Repo consistency with the live state: docker-swarm.yml carries 0 @docker refs and 0 uncommented traefik.docker.network labels; the docker-compose.traefik.yml mirror matches thinx-swarm@5e19c000"
    requirement: EDGE-MIG-02
    verification:
      - kind: other
        ref: "grep -c '@docker' docker-swarm.yml -> 0; grep -E '^[^#]*traefik\\.docker\\.network' docker-swarm.yml | wc -l -> 0; node scripts/check-traefik-mirror.js -> MIRROR OK files=1 (rc 0)"
        status: pass
    human_judgment: false

# Metrics
duration: "19 min live window (2026-10-07T21:52Z -> 22:11Z) + operator gate resolved 2026-10-08; close-out same day"
completed: 2026-10-08
status: complete
---

# Phase 31 Plan 03: Live v3.7.14 cutover of the production edge (BC mode) Summary

**The production :80/:443 edge now runs `traefik:v3.7.14` with the swarm provider and `core.defaultRuleSyntax=v2`, cut over on 2026-10-07 at 22:04:47Z by ordered surgical `docker service update`s after an operator `proceed`: 17 args index-exact against the committed mirror, 30/30 routers enabled, every web host serving its v2.11 baseline code, both Let's Encrypt serials and all 24 acme.json cert/key blobs unchanged, `:7442`/`:1883`/`:8883` open and direct-published throughout, and the full legacy device flow (check-in, OTT, 380 KB firmware, plain MQTT) passing post-hop — approved by the operator at the blocking-human gate with a personal console check. The hop cost a ~2-minute web outage because v3's swarm provider refuses services carrying both `traefik.docker.*` and `traefik.swarm.*` labels, which invalidated the planned Stage A/C "zero-window bridge" and pulled Stage C forward into the cutover. Rollback stayed staged and was not needed.**

## Performance

- **Duration:** ~19 min of live-window execution (2026-10-07T21:52Z baseline -> 22:11Z plan `<verify>`), plus the operator gate (resolved 2026-10-08) and this close-out
- **Started:** 2026-10-07T21:52Z (v2.11 baseline matrix; Task 1 `proceed` recorded earlier the same evening)
- **Completed:** 2026-10-08 (Task 3 approved)
- **Tasks:** 3 (1 `checkpoint:decision`, 1 `auto`, 1 `checkpoint:human-verify`; both checkpoints `gate="blocking-human"`, both resolved by the operator through the orchestrator)
- **Files modified:** 2 in this repo (1 created, 1 modified); live `traefik_traefik` + 17 other swarm services mutated by label on `micro`

## Accomplishments

- **Task 1 — operator go/no-go (checkpoint:decision, blocking-human).** The operator was shown the 31-01 boot-and-discover result, the 31-02 snapshot by path (`micro:/mnt/data/edge-rollback/traefik-2026-10-07/` + `traefik-p31-precutover-20261007T203816Z.json`), the exact cutover command set (A / B1 / B2 / C) and the exact rollback command set, and selected **proceed** (2026-10-07).
- **Task 2 — live cutover + route/cert parity (auto).** Baseline matrix and device-flow harness run on v2.11 at 21:52-21:57Z; Stage A (add `traefik.swarm.network` on 16 services, task ids unchanged); pre-B1 re-check incl. a dry-printed, index-exact 17/17 args diff against `docker-compose.traefik.yml`; **B1** at 22:04:47Z (`--image traefik:v3.7.14 --args "$(jq … map(@sh) …)" --label-rm traefik.docker.network`), v3 task Running at 22:04:51Z (~4 s, no crash-loop); **B2a/B2b** at 22:04:52/22:04:57Z (`@docker` -> `@swarm` middleware refs on `thinx_api`, `thinx_console`; B1->B2 window 10 s); **C** pulled forward at 22:06:35-39Z (15 label-only `--label-rm traefik.docker.network`, 4 s, zero task restarts); recovery 22:06:48Z; **post-B2 gate** 22:07:57Z (router filter empty; 30/18/7 all enabled, 0 errors/warnings, providers `["Swarm"]`, 0 `@docker` strings) — this also **closes the deferred 31-01 Task 3 criterion**. Re-verify matrix identical to baseline (https 200s, micro 401, http 301s, http app 200); cert serials unchanged, `checkend 0` valid; acme.json 24/24 cert + 24/24 key blobs identical to the snapshot; WS probe 200; all 15 Stage-C task ids pre == post; backends all on `traefik-public` `10.0.1.0/24` (T-31-10). Post-cutover device-flow harness PASS over `:7442`+`:1883` and over HTTPS. `traefik-edge.C.post.yml` captured and redacted on `micro`, committed with 0 secret markers. Plan `<verify>` V1-V7 PASS at 22:10:50Z. Commit `f0302672`.
- **Task 3 — legacy device flow + console (checkpoint:human-verify, blocking-human).** Operator reviewed the harness evidence (register -> status -> OTT -> firmware 380048 B `md5Match` -> MQTT connect with both ACL grants -> publish -> recent -> disconnect, over plaintext `:7442` and `mqtt://:1883`) and personally confirmed the console Devices page renders over HTTPS/WS on the new edge: **approved, console checked** (2026-10-08). No rollback trigger. The operator additionally decided **not to push `thinx-staging`** at this time (CI mirror gate / image rollout on the operator's own timing).
- **Secret hygiene (P29 D-12).** The dashboard `admin-auth` password lived only in `micro:/root/.p31-traefik-admin` (600 root, operator-placed) and a host-side shell variable; verified `MATCH` against the live apr1 hash; file deleted at the end of Task 2. 0 hash/key/e-mail markers in anything committed.

## Task Commits

1. **Task 1: Operator authorizes the one-way live v3 cutover** — no commit (checkpoint:decision -> `proceed`, 2026-10-07, via orchestrator)
2. **Task 2: Live v3 cutover — converted config applied to `traefik_traefik`, route parity + cert validity asserted** — `f0302672` (feat)
3. **Task 3: Human-verify — legacy device flow over :7442 + plain MQTT survives the v3 hop** — no commit (checkpoint:human-verify -> `approved, console checked`, 2026-10-08, via orchestrator)

**Plan metadata:** finalization commit (docs: complete plan — SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml` (created) — redacted live v3.7.14 end-state capture (22:09:51Z): image + digest comment, 17-flag command in live order with per-flag delta annotations, ports, labels, mounts, configs; header lists the exact delta vs `C.pre.yml` and the untouched out-of-git rollback pair by path
- `.planning/runbooks/traefik-v3-cutover.md` — §"Live cutover record (31-03 Task 2)" appended: timeline, re-verify matrix, deviation + root cause, plan `<verify>` acceptance table, live state at hand-off with the now-mandatory rollback Step 3 Stage-C clause; two **CORRECTION** markers on the 31-01 mechanism-table rows ("v3 ignores `traefik.docker.*`" / "Stage C any time after B")
- Live on `micro` (not files): `traefik_traefik` image/args/labels; `thinx_api`, `thinx_console` middleware labels; `traefik.swarm.network` added on 16 and `traefik.docker.network` removed from 16 traefik-enabled services

## Decisions Made

- **Proceed with the one-way cutover** (operator, Task 1) on the strength of boot-and-discover green + staged rollback + open window.
- **Cutover executed as ordered surgical updates**, `--args` rebuilt on `micro` from the 600-root backup via `jq map(@sh)`, dry-printed and diffed index-exact against the committed mirror before firing — no `docker stack deploy`, no `restart.sh`.
- **Stage C pulled forward into the cutover** when v3 rejected the dual-label bridge (Rule 3; inside the pre-authorized command set, so no Rule-4 stop); rollback explicitly considered and rejected because Stage C was faster (4 s, no restarts) and the regression cause was identified from the provider log.
- **The Stage A/C "both-label bridge" is invalid under v3** and must not be reused: future label migrations (P32-P34) are single-step `--label-rm old --label-add new` updates on each service, never a bridged state.
- **Rollback Step 3 Stage-C clause is now mandatory** for any v3 -> v2.11 return (re-add `traefik.docker.network=traefik-public` on the five multi-network services).
- **Operator accepted the device-flow gate** on harness evidence + personal console check; **operator deferred the `thinx-staging` push** (CI mirror gate on their timing).

## Deviations from Plan

**1. [Rule 3 - Blocking] Stage C pulled forward into the cutover; ~2-minute web outage (22:04:50Z - 22:06:45Z)**
- **Found during:** Task 2, between B1 and the first post-B2 gate attempt (22:05:18Z)
- **Issue:** The 31-01 mechanism table stated that v3 "ignores `traefik.docker.*`", so Stage A left both network-label families on all traefik-enabled services as a zero-window bridge and Stage C was scheduled as "any time after B" cleanup. Live, Traefik v3's swarm provider refuses any service that defines both families (`ERR Skip container error="both Docker and Swarm labels are defined" providerName=swarm`, 105 lines by 22:06Z). After B1 the 15 bridged services were undiscovered: every web host answered `404 page not found` from the moment the v2 task stopped (22:04:50Z) until the provider picked up Stage C. The 22:05:18Z router-filter read was vacuous because the API itself was unrouted. `:7442`/`:1883`/`:8883` were unaffected throughout (direct publish, D-05).
- **Fix:** Stage C executed immediately (22:06:35-39Z): 15 detached, label-only `docker service update --label-rm traefik.docker.network <svc>` — 4 s total, zero task restarts, inside the pre-authorized command set. Recovery at 22:06:48Z (all web hosts 200; 0 skip errors after C); routers converged 17 -> 30 by 22:07:57Z. Web outage ~1 min 55 s. Rollback not needed.
- **Files modified:** `.planning/runbooks/traefik-v3-cutover.md` (deviation section + two CORRECTION markers in the 31-01 mechanism table + rollback Step 3 clause made mandatory in the hand-off state)
- **Verification:** re-verify matrix at 22:07:57Z identical to the v2.11 baseline; router filter empty; plan `<verify>` V1-V7 PASS at 22:10:50Z; all 15 Stage-C task ids pre == post
- **Committed in:** `f0302672`

---

**Total deviations:** 1 (Rule 3, blocking)
**Impact on plan:** No scope change, no mechanism change beyond ordering, no rollback. The outage is the single observable cost of the hop and is recorded with its root cause; the correction (no label bridge under v3; single-step label migrations) is a hard input to P32-P34.

**Not a deviation:** the plan's Task 2 action said "push `thinx-staging` so the CI mirror gate runs"; the operator decided at the Task 3 gate not to push yet. The live edge is already on v3 and the repo artifacts are committed locally, so the cutover itself is complete; the push/CI gate is tracked under Next Phase Readiness as an operator-timed item.

## Issues Encountered

- **Dashboard credential gap.** The post-B2 router gate needs `/api/http/routers` behind `admin-auth`, and the apr1 hash cannot be inverted. Resolved by the operator placing the password in `micro:/root/.p31-traefik-admin` (600 root); the executor read it into a shell variable on the host only, verified `MATCH` against the live hash (`/api/overview` 200 under v2.11 at 22:04Z), and deleted the file at the end of Task 2. No secret value in any output or commit.
- **acme.json rewritten once by v3 at start** (`301146 1791377596` -> `301121 1791410693`, 600 root kept). Benign: 24/24 cert and 24/24 key blobs identical to the 31-02 snapshot; the only structural delta is `le.Account.KeyType` dropped (the 25-byte size change). Served serials unchanged.
- **Pre-existing ACME retry, not caused by the hop:** the single ACME log line after start is the renewal retry for the long-expired external cert #15 (`checkout.qooldata.com`, DNS -> 217.11.249.139), identical to v2.11 behavior — a P33 item, not a re-challenge storm.
- **Router count 30 vs the 31-01 probe's 32:** the probe ran `--api.insecure=true`, which adds `api@internal` + `dashboard@internal` (and 2 internal middlewares, 7 vs 9). Services 18 = 18.
- **Stale bookkeeping label** `com.docker.stack.image=traefik:v2.11@…` remains on `traefik_traefik` (only a stack deploy rewrites it; cosmetic, noted in `C.post.yml`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Stage A/C label bridge is invalid under v3** — any P32 (native rule conversion), P33 (TLS/dashboard/ACME hardening) or P34 (log/socket-proxy) edit that touches `traefik.*` labels on a traefik-enabled service must be a single `docker service update --label-rm … --label-add …` per service; never leave a service carrying both `traefik.docker.*` and `traefik.swarm.*`.
- **`thinx-staging` is unpushed by operator decision** — the phase-31 commits (and the rest of the local lead over `origin/thinx-staging`; `git log --oneline origin/thinx-staging..HEAD | wc -l` = 54 at close-out, the remote ref may be stale) stay local until the operator pushes; the CI mirror gate (`check-traefik-mirror`, which passes locally: `MIRROR OK files=1`) has not run on CI for the v3 config yet. The live edge does not depend on it.
- **`~/Repositories/thinx-swarm@5e19c000` is unpushed** (31-01 readiness item; operator's call) — the committed mirror banner references that SHA.
- **Rollback Step 3 Stage-C clause is mandatory** for any v3 -> v2.11 return (Stage C has run); the 31-02 snapshot/backup pair on `micro` is untouched and still the restore source.
- **`checkout.qooldata.com` expired-cert renewal retry** continues under v3 exactly as under v2.11 — P33 inventory item (`traefik-acme-inventory.2026-10-06.md`); decide renew vs. drop the router.
- **`--providers.swarm.exposedbydefault=true`** carried verbatim (wart) — P33 fix-forward, unchanged by this plan.
- **Live edge state for P32 to start from:** `traefik_traefik` = `traefik:v3.7.14` (digest `e849695b…`), 17 args, `Version.Index 38379311`, ports 80/443, 1 task on `micro`; `acme.json` `301121 1791410693 600 root` (24 certs); labels: 16 `traefik.swarm.network`, 0 `traefik.docker.network`, 0 `@docker` refs.

## Self-Check: PASSED

- Files: `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml` FOUND; `.planning/runbooks/traefik-v3-cutover.md` FOUND (§Live cutover record present, lines 597-706); `31-03-PLAN.md` FOUND
- Commits reachable from HEAD: `f0302672` FOUND (`git log --oneline 9bdebdb6..HEAD` = exactly that commit); `git rev-list --count 9bdebdb6..f0302672` = 1 = `actuals.commits`; evaluation-scope check run at close-out (see return)
- Repo-side plan `<verification>` re-run at close-out: `grep -c '@docker' docker-swarm.yml` -> 0 PASS; uncommented `traefik.docker.network` in `docker-swarm.yml` -> 0 PASS; secret markers in `C.post.yml` -> 0 PASS; secret markers in runbook -> 0 PASS; e-mail regex -> 0 in `C.post.yml`, 1 fake `@example.invalid` placeholder in the runbook PASS; `node scripts/check-traefik-mirror.js` -> `MIRROR OK files=1` PASS
- Production-side (read-only, 2026-10-08): `docker service inspect traefik_traefik` -> `traefik:v3.7.14 args=17` PASS (unchanged since 22:04:56Z). All other production checks quoted from the Task 2 record (V1-V7 PASS at 22:10:50Z); no production mutation at close-out
- Operator gates: Task 1 `proceed`; Task 3 `approved, console checked` — both recorded via the orchestrator

---
*Phase: 31-v2-v3-upgrade-backward-compat-mode*
*Completed: 2026-10-08*
