---
phase: 32-v3-native-syntax-bc-removal
verified: 2026-10-08T16:15:00Z
status: passed
score: 25/25 must-haves verified
covered_files:
  - .planning/phases/32-v3-native-syntax-bc-removal/32-01-PLAN.md
  - .planning/phases/32-v3-native-syntax-bc-removal/32-01-SUMMARY.md
  - .planning/phases/32-v3-native-syntax-bc-removal/32-02-PLAN.md
  - .planning/phases/32-v3-native-syntax-bc-removal/32-02-SUMMARY.md
  - .planning/phases/32-v3-native-syntax-bc-removal/32-03-PLAN.md
  - .planning/phases/32-v3-native-syntax-bc-removal/32-03-SUMMARY.md
  - .planning/runbooks/swarm-configs/README.md
  - .planning/runbooks/swarm-configs/traefik-edge.D.post.yml
  - .planning/runbooks/swarm-configs/traefik-edge.D.pre.yml
  - .planning/runbooks/traefik-v3-cutover.md
  - docker-compose.traefik.yml
  - docker-swarm.yml
covered_digest: "v3:sha256:96c084e2e7f1935433dc230e036726a19db33a0335b7eb054dcf796bd3700bfc"
behavior_unverified: 0
overrides_applied: 0
requirements:
  - id: EDGE-MIG-03
    status: satisfied
    plans: [32-01, 32-02, 32-03]
prohibitions_checked: 31
prohibitions_flagged: 0
observations:
  - finding: "MQTTS :8883 refuses TCP connections from outside micro (Connection refused from the workstation to thinx.cloud / rtm.thinx.cloud / 188.166.23.244) while micro itself has 0.0.0.0:8883 LISTENing, ufw/DOCKER accept it, and /dev/tcp from micro reports OPEN"
    category: other
    scope: "outside Phase 32 — thinx_mosquitto last updated 2026-10-07T22:06Z (idx 38379325), before the phase; Traefik publishes only :80/:443; the Phase 32 must-haves and both baselines tested :8883 from micro only. Plaintext :7442 (HTTP 200) and plain MQTT :1883 (TCP accept) are OPEN from outside — the AGENTS.md keep-7442 rule holds"
    recommended: "Inspect the mosquitto TLS listener / ingress path before Phase 33/34 TLS work; not a Phase 32 gap"
---

# Phase 32: v3 Native Syntax & BC Removal Verification Report

**Phase Goal:** Convert routing rules to native v3 syntax and remove the BC switch (or document retention).
**Verified:** 2026-10-08T16:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

Mode: initial (no previous VERIFICATION.md). Phase mode: null (standard goal-backward verification; MVP mode dormant).

Evidence sources, in order of weight: (1) live read-only reads on micro (`docker service inspect`, `/dev/tcp`, `git -C /mnt/gluster/deployment/swarm`, `ls /root/.p32-traefik-admin`, `docker service logs`), (2) live behavioural probes from the workstation (bare-IP pair, HTTP/1.1 WebSocket probe, HTTPS/HTTP matrices, cert serials, external `:7442`/`:1883`), (3) committed repo state in this repo and `~/Repositories/thinx-swarm` (HEAD `158f369`, `origin/master` equal), (4) the runbook / D.pre / D.post records for transient or credentialed facts that can no longer be re-observed (throwaway tracer, task-id equality per update, `/api/overview` 30/0 — the dashboard credential was shredded by design). SUMMARY.md text was used only to locate evidence, never as evidence.

## Goal Achievement

### Observable Truths

Roadmap success criteria first (R1-R3), then plan truths (P1-x / P2-x / P3-x); plan truths that restated a roadmap SC were merged into it (32-03 "repo matches deployed" into R3; 32-03 "closes on converted-and-removed" into P2-8).

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| R1 | Routing rules are in native v3 syntax; `core.defaultRuleSyntax` removed or its retention documented | ✓ VERIFIED | Live labels: `thinx-api-ws.rule=Host(\`rtm.thinx.cloud\`) && HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)` p=200; `downtime-http`/`downtime-https`/`error-router` `PathPrefix(\`/\`)` p=2/2/1. Live `traefik_traefik` Args: `grep -c defaultRuleSyntax` = 0, `args=16`. Repo: `grep -rni "ruleSyntax\|defaultRuleSyntax"` over `docker-swarm.yml`, `docker-compose.traefik.yml`, thinx-swarm `traefik.yml/thinx.yml/downtime.yml/errorpage.yml` = 0 hits; `traefik.yml:106` carries the Phase 32 removal comment. Removed, not retained — no retention rationale required (D-09). |
| R2 | Full route parity confirmed; plaintext `:7442` + MQTT re-verified | ✓ VERIFIED | Workstation probes at verification time: HTTPS app/console/rtm/thinx.cloud/swarmpit 200, micro 401; HTTP app 200, console/rtm/thinx.cloud/swarmpit/micro 301 -> https://host/; bare-IP `301 https://188.166.23.244/` + `200`; WS `--http1.1` probe `Upgrade: websocket` and `Upgrade: WebSocket` both `HTTP/1.1 401` + `X-Forwarded-Proto: https`; serials app `051152D5A20BE36DEFA1B6FA83379CE42809`, rtm `0535CC0C71E39D9378E72893F3A2141267B0` (= D.pre.yml / P31). `http://rtm.thinx.cloud:7442/` -> 200 from outside; `thinx.cloud:1883` TCP accept from outside; micro `/dev/tcp` 7442/1883/8883 OPEN; published `thinx_api 7442->7442`, `thinx_mosquitto 1883/1884/8883`, traefik `80->80 443->443` only. Device-flow harness PASS x2 at the end state is the recorded 15:13Z run (runbook re-verify matrix); not re-run here because it registers a device (state mutation). Traefik parse-error log scan (6 h): 0. |
| R3 | Repo config matches the deployed v3 config | ✓ VERIFIED | thinx-swarm HEAD `158f36981c6f…` == `origin/master` == micro `/mnt/gluster/deployment/swarm` HEAD == mirror banner `source: thinx-swarm@158f369…`; `node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm` -> `MIRROR OK files=1`; mirror 16 `- --` lines == `traefik.yml` 16 == live `args=16`; `docker-swarm.yml` thinx-api-ws block diff vs `thinx.yml` empty; live labels on the three services byte-equal to the committed rule/priority lines; micro checkout has 0 tracked modifications (3 untracked `*.bak.20261007…` files predate the phase). |
| P1-1 | Throwaway v3.7.14 without the switch reports the four candidate rules enabled at 200/2/2/1 before any live router is touched (D-02) | ✓ VERIFIED | Transient tracer; runbook "Boot-and-discover" Run A table (`p32-ws@swarm enabled p=200 syn=-`, catch-alls p=2/2/1) is the record. Corroborated by the end state: the same four rules run enabled under the native v3 default with no override (live labels + behavioural probes). 0 `p32*` services remain (`docker service ls`). |
| P1-2 | After Stage 1 the four live routers carry the v3 rules with `ruleSyntax=v3` set in the same update; every router enabled (D-01/05/07/08) | ✓ VERIFIED | Stage 1 record rows (14:02:55 / 14:04:01 / 14:04:53) show one `docker service update` per service carrying both `--label-add rule` and `--label-add ruleSyntax=v3`; the v3 rules are live now; D.post.yml line 120 credentialed readback: all four `enabled`. |
| P1-3 | HTTP/1.1 WebSocket probe answers 401 + `X-Forwarded-Proto: https` for both Upgrade casings (D-08) | ✓ VERIFIED | Re-run from the workstation at verification time: both casings `HTTP/1.1 401 Unauthorized` + `X-Forwarded-Proto: https`, no `Server:` header. |
| P1-4 | Bare-IP pair http -> 301 https, https -> 200 (D-05/06) | ✓ VERIFIED | Re-run: `301 https://188.166.23.244/` and `200`. |
| P1-5 | Committed thinx-swarm files + `docker-swarm.yml` carry the v3 rules, mirror OK, micro HEAD == workstation HEAD before the live update (D-04) | ✓ VERIFIED | Repo state now the Stage 3 superset (v3 rules, 0 overrides); `17401bb` -> `6c01b26` -> `158f369` chain on `origin/master`; runbook records micro ff-merge before each live update; micro HEAD == `158f369` now. |
| P1-6 | Stage 1 label-only: task ids identical pre/post; `traefik_traefik` untouched at 17 args through Plan 01 (D-01) | ✓ VERIFIED | Stage 1 record: `5d7aukf4evft`, `vzyg90j8f878`, `9nitjbo580v8` pre == post per update; traefik task `i7tpgo7vv0vj` unchanged until Stage 2; `PreviousSpec` of the live service = 17 Args (D.post.yml). |
| P1-7 | D.pre.yml captures the pre-phase edge (17-flag incl. switch, four v2 rules, serials, acme stat), redacted, 0 secret markers | ✓ VERIFIED | File: line 34 `--core.defaultRuleSyntax=v2`, lines 103-114 `HeadersRegexp` / `HostRegexp(\`{host:.+}\`)` x3, lines 151-152 both serials, acme stat; apr1/bcrypt/PEM marker grep 0, e-mail regex 0; unchanged since `dfa622ac` (`git diff` empty). |
| P1-8 | [flagged assumption] Exactly four v2-only routers exist; all others are v3-valid `Host()` | ✓ VERIFIED | D.pre.yml inventory: 4 v2 rules; D.post.yml: "26 routers on plain Host() rules", histogram `{"-": 30}`; live label sweep across all services for any rule not of the form `Host(…)`, `PathPrefix(…)` or `Host(…) && HeaderRegexp(…)` returned nothing. Assumption resolved by evidence, not auto-resolved. |
| P2-1 | Live `traefik_traefik` is v3.7.14 with exactly 16 Args, no switch; swarm provider, constraint, exposedbydefault, six entrypoints present; one running task (D-09) | ✓ VERIFIED | `docker service inspect`: `traefik:v3.7.14 args=16 idx=38379738 state=completed`; switch count 0; `--providers.swarm`, `.constraints=Label(…)`, `.exposedbydefault=true`, `:80 :443 :1194 :1883 :8883 :7442` all present; `--api.insecure` 0; one task `yudql1hqdnd9 micro Running`. |
| P2-2 | Committed `traefik.yml` has no uncommented switch, a Phase 32 comment; mirror MIRROR OK at 16 flags; micro HEAD == workstation HEAD (D-04/09) | ✓ VERIFIED | `traefik.yml`: 0 switch tokens, 16 `- --` lines, comment at line 106; `MIRROR OK files=1`; HEADs equal (R3). |
| P2-3 | After Stage 2 every router enabled, bare-IP 301/200, WS 401 x2, matrices == baseline, 0 parse errors — else D-10 revert | ✓ VERIFIED | Behavioural rows re-observed live (R2); `docker service logs traefik_traefik --since 6h | grep -c "error while parsing rule\|unsupported function"` = 0; Stage 2 record: D-10 trigger evaluation none fired, revert staged and not executed. |
| P2-4 | After Stage 3 zero `ruleSyntax` labels live; four routers enabled under the inherited v3 default; committed files carry no `ruleSyntax` line (D-03) | ✓ VERIFIED | Live `ruleSyntax` label count thinx_api / downtime_downtime / errorpage_errorpage = 0 / 0 / 0; repo grep 0; D.post.yml `api_readback_15_12Z` all four `enabled … syn=-`. |
| P2-5 | Stage 2 = exactly one traefik restart (Version.Index advances, image unchanged); Stage 3 restarts nothing (D-01/03) | ✓ VERIFIED | Live idx `38379738` (from `38379311`), image unchanged `traefik:v3.7.14`, single task `yudql1hqdnd9` running since the 14:48Z restart (55 min at read time); Stage 3 record: `8v3ype7pftzh` / `vzyg90j8f878` / `5d7aukf4evft` pre == post; traefik idx unchanged across Stage 3. The 14:15:41Z `thinx_api` task change is a documented Swarmpit autoredeploy, not a Phase 32 restart. |
| P2-6 | Out-of-git 600-root full-spec backup of the pre-Stage-2 service exists on micro, never committed (P29 D-12) | ✓ VERIFIED | `stat`: `600 root 16020 /mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json`; path appears in repo only as a comment reference, the JSON is not tracked. |
| P2-7 | `:7442`, `:1883`, `:8883` stay OPEN and direct-published through the Stage 2 restart (EDGE-MIG-04 guard) | ✓ VERIFIED | micro `/dev/tcp` 7442/1883/8883 OPEN; `ss -ltn` 0.0.0.0:1883/8883/7442 LISTEN; published ports on `thinx_api` / `thinx_mosquitto`; traefik publishes 80/443 only. From outside: 7442 HTTP 200, 1883 TCP accept. See Observations for the external `:8883` refusal (pre-existing, outside the phase's causal reach). |
| P2-8 | [flagged assumption] EDGE-MIG-03 closes on the converted-AND-removed branch; no retention rationale because nothing is retained (D-09) | ✓ VERIFIED | args=16 live, 0 switch lines in `traefik.yml` and the mirror, four v3 rules live and committed, 0 overrides. REQUIREMENTS.md line 19 marks EDGE-MIG-03 `[x]`, line 66 `Complete`. |
| P3-1 | Full route parity at the end state: hosts at baseline codes, every router enabled, `/api/overview` 30 http routers / 0 errors | ✓ VERIFIED | Matrices re-observed live (R2) == Plan 01 baseline table; `30 / 0 / 0` is the recorded 15:12:34Z credentialed read (D.post.yml, runbook) — not re-readable, credential shredded by design; the Traefik error log (0 parse errors) and all behavioural probes corroborate. |
| P3-2 | `:7442` + `:1883` OPEN, direct-published; legacy device flow PASSES over plaintext and HTTPS at the end state (EDGE-MIG-04 re-verified, keep-7442) | ✓ VERIFIED | Ports: live (P2-7). Harness: runbook re-verify matrix row `p32-7442` PASS 15:13:16-25Z (register, status, OTT 200, firmware 380048 B md5Match, MQTT 1883 connect + ACL, publish, recent, disconnect) and `p32-https` PASS 15:13:25-29Z; not re-run (would register a device). External `:7442` answers 200 now. |
| P3-3 | Live end state: v3.7.14 args=16 no switch, four native rules at 200/2/2/1, zero `ruleSyntax` labels, bare-IP 301/200, WS 401 x2, serials unchanged vs D.pre.yml | ✓ VERIFIED | Every element observed live at verification time (P2-1, P2-4, P1-3, P1-4, R2 serials == D.pre.yml lines 151-152). |
| P3-5 | D.post.yml captures the end state redacted (16-flag command, four v3 rules, `ruleSyntax` ABSENT 0/4, Version.Index + restart window, acme continuity, both serials, 30/0, bare-IP + WS 401) with 0 secret markers / 0 e-mails; README names the D step | ✓ VERIFIED | D.post.yml lines 9-19, 27, 34-49 (16 flags, `${EMAIL}` templated), 109-121, 150-157, 181-197; marker grep 0, e-mail regex 0; `swarm-configs/README.md:20` names step `D` with its content. `C.post.yml` and `D.pre.yml` unchanged (`git diff dfa622ac HEAD` empty). |
| P3-6 | `/root/.p32-traefik-admin` no longer exists on micro; `--api.insecure` never set on the live service (D-12) | ✓ VERIFIED | `ls /root/.p32-traefik-admin` -> No such file or directory; live Args `api.insecure` count 0; `PreviousSpec` (17 Args) recorded without it. |
| P3-7 | Operator confirms in the browser that the console Devices page renders over the native-v3 edge and live updates arrive over the WebSocket (D-11) | ✓ VERIFIED (human gate, recorded) | `checkpoint:human-verify gate="blocking-human"` in 32-03 Task 2 approved by the operator in the browser on 2026-10-08 (32-03-SUMMARY coverage D3, `human_judgment: true`, "approved"); automated corroboration: WS router matches natively (401 probe both casings, no nginx), `rtm.thinx.cloud` 200, `console.thinx.cloud` 200. Recorded as human-verified evidence per the orchestrator's instruction, not an open item. |

**Score:** 25/25 truths verified (0 present, behavior-unverified)

### Deferred Items

None from this verification. The phase's own `deferred-items.md` records one out-of-scope item (external fotostim-stack `checkout.qooldata.com` ACME renewal 400 at the Stage 2 task start) — not a Phase 32 truth; left as recorded.

### Required Artifacts

`gsd_run query verify.artifacts` returned `total: 0` for all three plans (exit 0, empty set): the plan `must_haves.artifacts` entries are prose descriptions, not bare paths, so the verb had nothing to evaluate. Verified manually at the four levels (exists / substantive / wired / data):

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `.planning/runbooks/swarm-configs/traefik-edge.D.pre.yml` | pre-phase capture, redacted, immutable | ✓ VERIFIED | 186 lines; 17-flag command incl. switch, four v2 rules, serials, acme stat; 0 markers / 0 e-mails; unchanged since `dfa622ac` |
| `.planning/runbooks/swarm-configs/traefik-edge.D.post.yml` | end-state capture, redacted | ✓ VERIFIED | 197 lines; 16 flags, four v3 rules, `ruleSyntax labels: ABSENT`, idx 38379738, serials, acme, 30/0, probes; 0 markers / 0 e-mails; committed `cb55fec6` |
| `.planning/runbooks/swarm-configs/README.md` | D-step bullet | ✓ VERIFIED | line 20 names step `D` (16-flag, HeaderRegexp / PathPrefix, zero ruleSyntax) |
| `.planning/runbooks/traefik-v3-cutover.md` | Phase 32 section: baseline, boot-and-discover, mechanism, Stage 1/2/3 records, re-verify matrix, hand-off + ordered revert | ✓ VERIFIED | headings at lines 774, 800, 832, 962, 980, 1026, 1064, 1119, 1187, 1224; records carry verbatim commands, timestamps, task ids, readbacks |
| `docker-swarm.yml` | thinx-api-ws `HeaderRegexp` rule, no `ruleSyntax`, Phase 32 comment | ✓ VERIFIED | lines 378-385; block identical to thinx-swarm `thinx.yml`; wired: the committed block mirrors the live `thinx_api` labels byte for byte |
| `docker-compose.traefik.yml` | regenerated mirror, banner SHA = `158f369`, 16 flags, 0 switch lines | ✓ VERIFIED | banner `source: thinx-swarm@158f369…`; 16 `- --` lines; `check-traefik-mirror.js` -> `MIRROR OK files=1` (also with `--swarm-repo`); generated, not hand-edited (mirror sha256 matches) |
| thinx-swarm `traefik.yml` / `thinx.yml` / `downtime.yml` / `errorpage.yml` (sibling repo) | Stage 1-3 commits, pushed, fast-forwarded on micro | ✓ VERIFIED | commits `17401bb`, `6c01b26`, `158f369` on `master`; `origin/master` == `158f369`; micro checkout == `158f369`, 0 tracked modifications |
| live `traefik_traefik` / `thinx_api` / `downtime_downtime` / `errorpage_errorpage` on micro | 16 Args no switch; v3 rules; no `ruleSyntax` labels | ✓ VERIFIED | `docker service inspect` readbacks above |
| `micro:/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json` | 600 root, out of git | ✓ VERIFIED | `600 root 16020` |

### Key Link Verification

`gsd_run query verify.key-links` returned `total: 0` for all three plans (prose links, not from/to/via tuples). Verified manually:

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| rule change | `ruleSyntax=v3` override | one `docker service update` per service (no parse-error window) | WIRED | Stage 1 record: each row is a single command carrying both `--label-add`s |
| credentialed status filter | bare-IP behavioural probe | paired gate | WIRED | every stage record pairs the filter (empty) with `301`/`200`; filter no longer re-readable (credential shredded), probe re-observed live |
| thinx-swarm commit -> origin -> micro ff -> mirror regen + this-repo commit -> live update | repo-first chain (D-04) | WIRED | three thinx-swarm commits each precede the matching live update in the records; micro HEAD == workstation HEAD == `158f369`; mirror banner tracks it |
| throwaway `traefik_p32probe` | live edge isolation | `traefik.constraint-label=p32-probe` + matching provider constraint | WIRED (historical) | boot-and-discover record; live edge idx/args unchanged across the tracer; 0 `p32*` services remain |
| Stage 1 overrides live BEFORE switch removal; Stage 3 strip only AFTER the Stage 2 gate | ordering invariant (RESEARCH §Q1) | WIRED | timestamps: Stage 1 14:02-14:05Z, Stage 2 14:43-14:51Z (gate evaluated 14:48-14:50Z, none fired), Stage 3 15:00Z |
| 16-flag args | pre-Stage-2 600-root backup via `jq del(.[3]) \| map(@sh)` diffed index-exact against the mirror | WIRED | Stage 2 "converted static command" section (lines 1026-1063): index table, dry-print diff; live Args now index-exact to the mirror |
| EDGE-MIG-04 re-verification | same harness run twice (baseline Plan 01, end state Plan 03) | WIRED | baseline `p32-base-7442`/`p32-base-https` PASS (13:44Z); end state `p32-7442`/`p32-https` PASS (15:13Z); direct-publish model unchanged live |
| cert serial continuity | D.pre.yml values vs live | WIRED | live serials equal D.pre.yml lines 151-152 |
| credential survives until the last credentialed readback, then shredded; failure path needs no credential | lifecycle | WIRED | `HASH=MATCH` at 15:12Z, shred 15:16:48Z, `ls` -> No such file now; hand-off revert steps (a)-(d) use only behavioural probes |

### Data-Flow Trace (Level 4)

Not applicable — infrastructure/configuration phase; no rendered dynamic data. The equivalent check (committed config -> live spec) is covered by R3: committed labels and flags are the values Traefik runs, not a static fallback.

### Behavioral Spot-Checks

All run read-only from the workstation or as read-only ssh reads on micro; no mutations, no service updates, no stack deploy, no push.

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| live edge has no BC switch, 16 args, one task | `docker service inspect traefik_traefik …` | `traefik:v3.7.14 args=16 idx=38379738 state=completed`; switch count 0; task `yudql1hqdnd9 micro Running` | ✓ PASS |
| four routers native v3, zero overrides | label readback on thinx_api / downtime_downtime / errorpage_errorpage | HeaderRegexp p=200; PathPrefix(`/`) p=2/2/1; `ruleSyntax` count 0/0/0 | ✓ PASS |
| no dual label families | grep `traefik.swarm.*` vs `traefik.docker.*` per service | thinx_api: swarm.network only; downtime/errorpage: docker.network only (dead v1-era label, IN-05 deferred) | ✓ PASS |
| bare-IP catch-alls alive | `curl http://188.166.23.244/`, `curl -k https://188.166.23.244/` | `301 https://188.166.23.244/`; `200` | ✓ PASS |
| WS router matches natively, case-insensitive | `curl --http1.1 -H "Upgrade: websocket"` / `WebSocket` to `https://rtm.thinx.cloud/p32verify` | `HTTP/1.1 401 Unauthorized` + `X-Forwarded-Proto: https`, both | ✓ PASS |
| HTTPS / HTTP matrices == baseline | curl x12 | 200 x5 + micro 401; app 200 + 301 x5 | ✓ PASS |
| cert continuity | `openssl s_client … -serial -checkend 0` | app `051152D5…`, rtm `0535CC0C…`, "will not expire" | ✓ PASS |
| plaintext device port reachable from outside | `curl http://rtm.thinx.cloud:7442/` | 200 | ✓ PASS |
| plain MQTT reachable from outside | TCP connect `thinx.cloud:1883` | OPEN | ✓ PASS |
| MQTTS reachable from outside | TCP connect `thinx.cloud:8883` | Connection refused (micro-local OPEN, 0.0.0.0:8883 LISTEN) | ℹ️ INFO — pre-existing, outside the phase (see Observations) |
| no rule parse errors since the restart | `docker service logs traefik_traefik --since 6h \| grep -c …` | 0 | ✓ PASS |
| repo == deployed | HEAD comparisons + `check-traefik-mirror.js` | `158f369` everywhere; `MIRROR OK files=1`; WS block diff empty | ✓ PASS |
| credential shredded, no api.insecure, no tracer leftovers | `ls /root/.p32-traefik-admin`; args grep; `docker service ls \| grep p32` | No such file; 0; 0 | ✓ PASS |
| commits exist | `gsd_run query verify.commits dfa622ac fa72db3a db3bda26 875c20c2 5e58a669 80625887 ce8b699a cb55fec6` | `all_valid: true` (8/8) | ✓ PASS |

Not re-run (would mutate production state): the device-flow harness (registers a device) and any credentialed `/api/…` read (credential shredded by design). Both rely on the runbook / D.post.yml records.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared by the plans or present for this phase; the live behavioural probes above stand in. Status: not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| EDGE-MIG-03 | 32-01, 32-02, 32-03 | Routing rules converted to native v3 syntax and the BC switch removed (or explicitly retained with documented rationale) | ✓ SATISFIED | R1 + P2-8: four rules native v3 live and committed; switch absent from live Args, `traefik.yml`, mirror; 0 overrides; REQUIREMENTS.md line 19 `[x]`, line 66 `Complete` |
| EDGE-MIG-04 (re-verified, owned by Phase 30) | 32-03 | Legacy plaintext `:7442` + plain MQTT paths preserved | ✓ SATISFIED (re-verification) | P2-7 / P3-2 |

Orphan check: REQUIREMENTS.md maps only EDGE-MIG-03 to Phase 32; every plan declares it. No orphaned requirements.

### Prohibitions (must_haves.prohibitions)

31 prohibition statements across the three plans, all judgment-tier (no `verification:` field). Each was checked against evidence rather than LLM judgment alone; none is left unverified, so none is flagged. Grouped by concern:

| Prohibition (grouped) | Evidence | Verdict |
| --- | --- | --- |
| Never close / redirect / TLS-enforce `:7442` or plain `:1883` (AGENTS.md, EDGE-MIG-04); Stage 2 args keep `thxp=:7442`, mqtt/mqtts verbatim | live Args carry all three entrypoints; `:7442` HTTP 200 and `:1883` TCP accept from outside; direct publish unchanged | ✓ held |
| Never `docker stack deploy` / `restart.sh` on the edge | task ids unchanged except the one `--args` restart; edge `admin-auth` hash still matched the operator credential at 15:12Z after all stages (restart.sh would have reset it); no live-only secret mount dropped (D.post.yml mounts section) | ✓ held |
| No hash / secret / e-mail / key material committed; credential never printed, never on argv, never committed | marker + e-mail greps 0 on D.pre / D.post / README / runbook Phase 32 section; mirror keeps `${EMAIL}` templated; runbook records the credential only as `600 root 8` + `HASH=MATCH` | ✓ held |
| Never `--api.insecure` on the live service | live Args 0; PreviousSpec recorded without it; tracer-only use documented | ✓ held |
| No service carries both `traefik.docker.*` and `traefik.swarm.*`; each label change one update | live families per service disjoint; Stage records single-command updates | ✓ held |
| Never split rule and `ruleSyntax` across two updates; never strip an override before Stage 2 gate / on a v2-form rule | Stage 1 rows single updates; Stage 3 at 15:00Z after the 14:48-14:50Z gate; all four rules already v3 | ✓ held |
| Never edit micro's checkout in place (ssh push + ff-merge only) | checkout HEAD == origin == workstation, 0 tracked modifications; records show `p32-stage*` branches + `merge --ff-only` | ✓ held |
| Never hand-edit the mirror | `MIRROR OK` (content sha256 matches the generator output) | ✓ held |
| No `thinx-staging` push during Stage 1 / Stage 3 windows (Pitfall 7) | `thinx-staging` not pushed at all during the phase (local lead over origin recorded) | ✓ held |
| No P33/P34 scope creep (dashboard/API lockdown, TLS, ACME e-mail, exposedbydefault, log-level, socket-proxy); no dead-v1-label cleanup; stale `com.docker.stack.image` untouched; only delta = the removed switch | mirror/live still carry `exposedbydefault=true`, `--api`, `--log.level=ERROR`; 16 = 17 - 1; dead `traefik.docker.network` labels still present on downtime/errorpage | ✓ held |
| `C.post.yml` / `D.pre.yml` immutable | `git diff dfa622ac HEAD` on both: empty | ✓ held |
| Throwaway never mounts the production cert volume / production ACME CA; isolated by constraint | boot-and-discover record (staging CA, /tmp storage, `p32-probe` constraint); acme.json stat unchanged across the tracer; 0 leftovers | ✓ held |
| Exactly one blocking-human gate in the phase | 32-03 Task 2 only (`grep -c "<human-check>"` over plans = 0 deferred items; one checkpoint) | ✓ held |

### Anti-Patterns Found

Debt-marker scan (`TBD|FIXME|XXX`, `TODO|HACK|PLACEHOLDER`) over every file the phase modified in both repos plus the runbook Phase 32 section: 0 hits. Review (32-REVIEW.md): 0 critical, 0 warning, 9 info, all pre-existing and outside the diff.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | — |

Observations (not Phase 32 defects):

| # | Finding | Severity | Notes |
| --- | --- | --- | --- |
| 1 | External TCP to `:8883` (MQTTS) is refused from the workstation while micro listens on 0.0.0.0:8883 and ufw/DOCKER accept it; `thinx_mosquitto` last updated 2026-10-07T22:06Z, before the phase; Traefik does not publish 8883 | ℹ️ Info | Not reachable by any Phase 32 change (args/labels on the web edge only). Both Phase 31 and Phase 32 baselines tested `:8883` from micro, so the external state was never in the parity contract. Worth a look before the Phase 33/34 TLS work. The keep-7442 / plain-MQTT rule (AGENTS.md) is intact. |
| 2 | Plan `<verify>` commands that fail as written (mirror `git diff --quiet` after regeneration, `syn=v3` readback under the v3 default, task-age greps vs Swarmpit autoredeploys) | ℹ️ Info | Documented plan-command defects in 32-01/32-02 SUMMARYs; the intended proof (task-id equality, label readback, MIRROR OK) holds. |
| 3 | `thinx-staging` carries a 12+ commit local lead (all Phase 32) not yet pushed; CI mirror gate passes locally | ℹ️ Info | Deliberate operator timing (each push rolls `thinx_api` via Swarmpit). Repo == deployed holds regardless because the deployed edge config comes from thinx-swarm, which is pushed and fast-forwarded on micro. |

### Human Verification Required

None outstanding. The single blocking-human gate (32-03 Task 2, console renders + live WebSocket updates over the native-v3 edge) was approved by the operator in the browser on 2026-10-08 and is recorded as human-verified evidence for P3-7.

### Gaps Summary

No gaps. The phase goal is achieved in the live edge and in both repositories: the four v2-only routers run native v3 rules (`HeaderRegexp` x1, `PathPrefix(\`/\`)` x3) at their original priorities, the `--core.defaultRuleSyntax=v2` switch is gone from the live Args, `traefik.yml` and the generated mirror (16 flags), no per-router `ruleSyntax` override remains, route parity and cert continuity hold against the Plan 01 baseline on re-observation, the plaintext `:7442` and plain MQTT `:1883` device paths are open and direct-published from outside, and thinx-swarm `158f369` is simultaneously the workstation HEAD, `origin/master`, micro's deployment checkout and the mirror banner. EDGE-MIG-03 closes on the converted-and-removed branch; no retention rationale is needed because nothing is retained.

---

_Verified: 2026-10-08T16:15:00Z_
_Verifier: Claude (gsd-verifier)_
