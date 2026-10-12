---
phase: 32-v3-native-syntax-bc-removal
plan: 01
subsystem: infra
tags: [traefik, swarm, routing, v3, labels, edge, migration, rule-syntax]
requires:
  - phase: 31-v2-v3-upgrade-backward-compat-mode
    provides: "traefik v3.7.14 on the live edge with --core.defaultRuleSyntax=v2 (17 flags, Version.Index 38379311); boot-and-discover probe recipe; device-flow harness; swarm-configs capture convention"
provides:
  - "D-02 tracer proof: the four native-v3 rules (Host && HeaderRegexp, 3x PathPrefix(`/`)) parse and report enabled on an isolated throwaway traefik:v3.7.14 booted WITHOUT the BC switch (Run A) and under Stage 1's exact live condition — v2 default + per-router ruleSyntax=v3 (Run B); exact HeadersRegexp parse-error text and the enabled-but-dead {host:.+} catch-alls recorded as silent-failure evidence"
  - "Redacted pre-phase capture swarm-configs/traefik-edge.D.pre.yml (17-flag command incl. the switch, the four v2 rules, app + rtm cert serials, acme.json stat, baseline probe results; 0 secret markers, 0 e-mails)"
  - "Runbook §Native v3 rules + BC-switch removal (Phase 32): Baseline table, Boot-and-discover record, Mechanism table (Stages 1/2/3), Stage 1 record with timeline + end check; Stage 2/3 placeholders for Plan 32-02"
  - "Stage 1 repo-first (D-04): thinx-swarm 17401bb (thinx.yml HeaderRegexp + ruleSyntax=v3; downtime.yml/errorpage.yml PathPrefix(`/`) + ruleSyntax=v3) on origin/master and fast-forwarded on micro; this repo docker-swarm.yml identical WS block + regenerated docker-compose.traefik.yml (MIRROR OK, banner 17401bb, 17 flags)"
  - "Stage 1 LIVE: thinx-api-ws, downtime-http, downtime-https, error-router run their native v3 rules with ruleSyntax=v3 overrides on thinx_api / downtime_downtime / errorpage_errorpage (one label-only update per service, rule + override together, task ids unchanged); every live router enabled (30/0); bare-IP 301/200; HTTP/1.1 WS probe 401 + X-Forwarded-Proto https for both Upgrade casings; HTTPS/HTTP matrices identical to baseline; traefik_traefik untouched at 17 flags"
  - "Baseline evidence for Plans 32-02/32-03: matrices incl. externals, bare-IP pair, hostless line, WS 401 x2, cert serials, task ids, ports OPEN, harness PASS x2"
affects: [32-02, 32-03, traefik-edge, thinx-swarm]
actuals:
  tokens: 10245
  tasks: 3
  commits: 3
plan_head_before: bc27e1ad5a147e511e3f6cff87843bbea4cca0a9
plan_head_after: db3bda26beb0ca182b185c6e507ee7312da58d89
tech-stack:
  added: []
  patterns:
    - "Boot-and-discover with constraint isolation: a throwaway traefik:v3.7.14 sees only services labelled traefik.constraint-label=p32-probe (plus the live traefik-public set read-only); 1-replica alpine rules service with an explicit loadbalancer.server.port label; gate = exactly N p32-* routers enabled, not merely 'no disabled ones'"
    - "Rule + ruleSyntax=v3 in ONE docker service update per service (no parse-error window); per-router rollback = v2 rule --label-add + override --label-rm in one update, valid while the switch is live"
    - "Gate pair: credentialed /api/http/routers status filter PAIRED with a behavioural probe targeting the router just changed (bare-IP 301/200 for catch-alls, --http1.1 WebSocket 401 for the WS router) — the status filter alone is blind to a dead {host:.+} catch-all under native v3"
    - "Repo-first chain per stage: thinx-swarm commit -> origin push -> push to micro as a temp ref + git merge --ff-only -> mirror regenerated + this-repo commit -> THEN docker service update"
key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.D.pre.yml
    - .planning/phases/32-v3-native-syntax-bc-removal/32-USER-SETUP.md
  modified:
    - .planning/runbooks/traefik-v3-cutover.md
    - docker-swarm.yml
    - docker-compose.traefik.yml
    - "~/Repositories/thinx-swarm/thinx.yml (sibling repo, 17401bb)"
    - "~/Repositories/thinx-swarm/downtime.yml (sibling repo, 17401bb)"
    - "~/Repositories/thinx-swarm/errorpage.yml (sibling repo, 17401bb)"
key-decisions:
  - "p32-rules throwaway ran at --replicas 1 (alpine:3.20 sleep), not D-02's literal 'scaled-to-zero': a 0-replica service yields 0 tasks -> 0 dockerData -> 0 routers, so a 0-replica probe proves nothing (RESEARCH §Q2 / Pitfall 3); isolation came from traefik.constraint-label=p32-probe instead"
  - "Probe Run A observed the live routers read-only (constraint p32-probe || traefik-public, RESEARCH Open Q1): recorded the exact 'unsupported function: HeadersRegexp' text and the enabled-but-dead {host:.+} catch-alls, which justify the bare-IP probe in every later gate"
  - "Stage 1 order errorpage -> downtime -> thinx_api (lowest blast radius first; the WS 401 probe is the final Stage 1 check); each gated on task id pre == post, label readback, API readback, status filter and the router-specific behavioural probe"
  - "Priorities 1/2/200 kept unchanged (D-07 research verdict: explicit priorities are used verbatim in v3)"
  - "The non-idempotent mirror regeneration (Task 2 verify V4) and the Swarmpit-autoredeploy task ages (Task 3 verify V8) are reported as plan-command defects with the intent proven by other evidence, not silently rewritten"
patterns-established:
  - "Pattern: every live gate in Phase 32 reads the task id immediately before the update (Swarmpit autoredeploy can roll downtime/errorpage independently when the operator rebuilds their images)"
  - "Pattern: under a v3 default the dashboard API omits the ruleSyntax field (omitempty) instead of echoing v3 — 'inherited v3' reads as absent; explicit overrides read as v3"
requirements-completed: [EDGE-MIG-03]
coverage:
  - id: D1
    description: "D-02 tracer: the four candidate v3 rules parse and report enabled on an isolated traefik:v3.7.14 probe booted WITHOUT the BC switch (Run A) and under v2 default + per-router ruleSyntax=v3 (Run B); throwaway torn down with the live edge untouched"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: other
        ref: "probe exec /api/http/routers | jq select(.name|startswith(\"p32-\")) -> Run A 4/4 enabled p=200/2/2/1 (ruleSyntax field absent = inherited default); Run B (args=19 incl. --core.defaultRuleSyntax=v2, 4x ruleSyntax=v3 labels) 4/4 enabled syn=v3; probe-seen thinx-api-ws@swarm disabled with 'unsupported function: HeadersRegexp' in Run A, enabled in Run B; live /api/overview 30/0 throughout; after rm: p32 filters empty, acme.json 301121 1791410693 600 root, traefik_traefik v3.7.14 args=17 idx=38379311"
        status: pass
    human_judgment: false
  - id: D2
    description: "Baseline + redacted traefik-edge.D.pre.yml committed (17 flags incl. the switch, four v2 rules, both cert serials, 0 secret markers, 0 e-mails); C.post.yml untouched"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: other
        ref: "grep '^ *- --' D.pre.yml | wc -l -> 17; grep '^ *- --core.defaultRuleSyntax=v2' -> 1; served_app_thinx_cloud + served_rtm_thinx_cloud present; apr1/bcrypt/PEM grep -> 0; e-mail regex -> 0; git diff --quiet HEAD -- C.post.yml -> clean; git ls-files D.pre.yml -> tracked (commit dfa622ac)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stage 1 repo-first: thinx-swarm Stage 1 commit on origin and fast-forwarded on micro BEFORE the live update; this repo docker-swarm.yml WS block identical to thinx.yml; mirror MIRROR OK at 17 flags with banner = thinx-swarm HEAD"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: other
        ref: "grep -c HeadersRegexp docker-swarm.yml -> 0; HeaderRegexp rule + ruleSyntax=v3 + priority=200 present; errorpage.yml/downtime.yml PathPrefix(`/`) + ruleSyntax=v3 (2+1), 0 uncommented HostRegexp; diff of the thinx-api-ws block docker-swarm.yml vs thinx.yml -> empty; check-traefik-mirror.js -> MIRROR OK files=1, 17 flags, banner source=thinx-swarm@17401bb; origin/master == micro HEAD == 17401bb (micro `git status` 0 tracked mods); commits thinx-swarm 17401bb, this repo fa72db3a"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stage 1 live: the four routers run native v3 rules with ruleSyntax=v3 overrides, every live router enabled, catch-alls alive (bare-IP 301/200), WS router answers 401 natively for both Upgrade casings, no task restart, traefik_traefik untouched at 17 flags"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: integration
        ref: "live label readback: 4x ruleSyntax=v3, 3x rule=PathPrefix(`/`), 1x Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`), 0 HeadersRegexp, 0 {host:, priorities 200/2/2/1; credentialed API: status filter empty, 4x 'enabled syn=v3', /api/overview 30/0/0; bare-IP 301 https://188.166.23.244/ + 200; --http1.1 WS probe 401 + X-Forwarded-Proto: https (websocket and WebSocket), no Server: nginx; task ids pre == post per update (5d7aukf4evft, vzyg90j8f878, 9nitjbo580v8); traefik_traefik v3.7.14 args=17 idx=38379311; runbook ### Mechanism (Phase 32) + ### Stage 1 record (32-01 Task 3 present (commit db3bda26)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Regression guard: HTTPS/HTTP matrices (incl. the 7 resolvable external hosts) identical to the baseline after Stage 1; :7442/:1883/:8883 OPEN; device-flow harness PASS over :7442+:1883 and over HTTPS at baseline (EDGE-MIG-04 re-verify continues in 32-03)"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: integration
        ref: "end check 14:05:36Z vs baseline 13:44Z: https app/console/rtm/thinx.cloud/swarmpit 200, micro 401, externals 200 (same DNS-unresolvable name 000 both times); http app 200, all others 301 -> https://<host>/; ports 7442/1883/8883 OPEN; harness p32-base-7442 PASS, p32-base-https PASS; live traefik log 'error while parsing rule|unsupported function' -> 0"
        status: pass
    human_judgment: false
duration: 40 min
completed: 2026-10-08
status: complete
---

# Phase 32 Plan 01: Tracer + Stage 1 native-v3 rules Summary

**The four v2-only Traefik routers (`thinx-api-ws`, `downtime-http`, `downtime-https`, `error-router`) now run their native v3 rules live under per-router `ruleSyntax=v3` overrides — proven first on an isolated throwaway `traefik:v3.7.14` booted without the BC switch (4/4 enabled, the live `HeadersRegexp` rule disabled with `unsupported function: HeadersRegexp`, the `{host:.+}` catch-alls enabled-but-dead), then committed repo-first in thinx-swarm (`17401bb`, on origin and fast-forwarded on micro) and this repo (`fa72db3a`, mirror MIRROR OK at 17 flags), then applied with three label-only `docker service update`s (rule + override together) that restarted nothing: every live router enabled (30/0), bare-IP `301`/`200`, HTTP/1.1 WebSocket `401` + `X-Forwarded-Proto: https` for both `Upgrade` casings, matrices identical to baseline, `traefik_traefik` untouched at 17 flags for Plan 32-02's Stage 2.**

## Performance

- **Duration:** 40 min | **Started:** 2026-10-08T13:44:07Z | **Completed:** 2026-10-08T14:24:59Z | **Tasks:** 3 (1 tracer, 2 auto; 0 checkpoints) | **Files modified:** 5 in this repo (2 created incl. USER-SETUP, 3 modified) + 3 in thinx-swarm; live labels on 3 swarm services; 2 throwaway services created and removed

## Accomplishments

- **Task 1 — tracer (D-02).** Precondition held: `/root/.p32-traefik-admin` `600 root` (8 B), apr1 `HASH=MATCH`, `/api/overview` 200; live edge `traefik:v3.7.14 args=17 idx=38379311`; micro checkout clean and fast-forwardable. Inventory re-read: exactly 4 v2-only routers (flagged assumption #2 held). Baseline recorded (matrices incl. 8 external Host() values read live — 7 answer 200/301, `igraczech.unitednewschannel.net` does not resolve; bare-IP `301`/`200`; hostless `404`; WS `401` x2; serials `051152D5…`/`0535CC0C…`; ports OPEN; harness PASS x2). `traefik-edge.D.pre.yml` captured and redacted on micro (body identical to C.post.yml). Throwaway `p32-rules` (1 replica, constraint-label `p32-probe`, 4 candidate routers) + `traefik_p32probe` (18 args, no switch, no host ports, docker.sock:ro, staging CA): **Run A** 4/4 `p32-*` enabled p=200/2/2/1 under native v3; probe-seen live `thinx-api-ws@swarm` disabled with the exact predicted error; live catch-alls enabled-but-dead; live overview 30/0 with 0 p32 routers. **Run B** (full 19-flag `--args` incl. the switch + 4 `ruleSyntax=v3` labels): 4/4 enabled `syn=v3`, live WS router enabled again. Teardown clean; acme.json and `traefik_traefik` unchanged. Commit `dfa622ac`. Tracer feedback gate: all 7 `<verify>` commands re-run post-commit, 7/7 PASS.
- **Task 2 — Stage 1 repo-first (D-04).** `errorpage.yml` / `downtime.yml`: ``PathPrefix(`/`)`` + `ruleSyntax=v3` + Phase 32 comment (priority lines byte-untouched); `thinx.yml` + `docker-swarm.yml`: `HeadersRegexp` -> `HeaderRegexp` + `ruleSyntax=v3` + comment (blocks identical). thinx-swarm `17401bb` pushed to origin/master, pushed to micro as `p32-stage1` and `git merge --ff-only` there (`677e3a9..17401bb`, 0 tracked mods, temp branch deleted). Mirror regenerated: `MIRROR OK files=1`, banner `thinx-swarm@17401bb`, 17 flags. Commit `fa72db3a`. No live update, no thinx-staging push.
- **Task 3 — Stage 1 live (D-01).** 14:02:55Z `errorpage_errorpage`, 14:04:01Z `downtime_downtime` (both routers in one update), 14:04:53Z `thinx_api` — each rc 0, task id pre == post, label + API readback `enabled syn=v3` with unchanged priority, status filter empty, behavioural probe green (bare-IP `301`/`200`; WS `401` + `X-Forwarded-Proto: https` both casings). End check identical to baseline; hostless line moved `404` -> `301` (D-06 accepted). Runbook Mechanism table + Stage 1 record committed `db3bda26`.
- **Secret hygiene (P29 D-12).** The dashboard password was read only into a shell variable on micro; `HASH=MATCH`/`overview=200` are the only outputs; 0 hash/key markers and 0 e-mails in D.pre.yml; the runbook's single e-mail-like line is the pre-existing Phase 31 `@example.invalid` placeholder. The credential file stays in place for 32-02/32-03 (32-03 shreds it).

## Task Commits

1. **Task 1: Tracer — baseline + D.pre capture + boot-and-discover (D-02)** - `dfa622ac` (docs)
2. **Task 2: Stage 1 repo-first — v3 rules + ruleSyntax=v3 in thinx-swarm and this repo, mirror regenerated** - `fa72db3a` (feat); sibling repo thinx-swarm `17401bb` (feat(edge))
3. **Task 3: Stage 1 live — four routers converted, gated, recorded** - `db3bda26` (docs)

**Plan metadata:** see the final `docs(32-01)` commit (SUMMARY + USER-SETUP + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `.planning/runbooks/swarm-configs/traefik-edge.D.pre.yml` (created) - redacted Phase 32 start-state capture: 17-flag command incl. `--core.defaultRuleSyntax=v2`, the four v2 rules under `app_stack_labels_pre_phase32`, app + rtm serials, acme stat, baseline probe results
- `.planning/runbooks/traefik-v3-cutover.md` - new `## Native v3 rules + BC-switch removal (Phase 32 / EDGE-MIG-03, 2026-10-08)` with Baseline, Boot-and-discover (Run A/B, teardown), Mechanism (Phase 32), Stage 1 record + end check, Stage 2/3 placeholders
- `docker-swarm.yml` - thinx-api-ws rule `HeaderRegexp`, `ruleSyntax=v3` line, Phase 32 comment; priority 200 unchanged
- `docker-compose.traefik.yml` - regenerated mirror (banner `thinx-swarm@17401bb`, 17 flags)
- `.planning/phases/32-v3-native-syntax-bc-removal/32-USER-SETUP.md` (created) - D-12 credential staging, recorded Complete
- `~/Repositories/thinx-swarm/{thinx.yml,downtime.yml,errorpage.yml}` - Stage 1 commit `17401bb` (on origin/master and micro)
- Live on micro (not files): `errorpage_errorpage`, `downtime_downtime`, `thinx_api` router rule labels + four `ruleSyntax=v3` labels; `traefik_p32probe` and `p32-rules` created and removed

## Decisions Made

- `p32-rules` at `--replicas 1` with constraint-label isolation (see Deviations, plan-instructed record).
- Probe Run A also observed the live routers read-only (RESEARCH Open Q1) — the recorded parse-error text and silent-dead catch-alls are the evidence that every later gate pairs the status filter with the bare-IP probe.
- Stage 1 order errorpage -> downtime -> thinx_api, WS 401 probe as the final Stage 1 check.
- Priorities 1/2/200 unchanged (D-07).
- Two plan `<automated>` commands that cannot pass as written were reported as defects with the intent proven otherwise (see Issues), not rewritten.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `p32-rules` ran with `--replicas 1` where D-02 literally says "scaled-to-zero throwaway"**
- **Found during:** Task 1 Step 4 (plan-instructed record)
- **Issue:** D-02's wording would yield a service with 0 tasks; the swarm provider builds servers from running tasks only (no `lbswarm`), so 0 tasks -> 0 `dockerData` -> 0 routers in `/api/http/routers` — the gate would print nothing and look green while proving nothing (RESEARCH §Q2 / Pitfall 3).
- **Fix:** 1 replica of `alpine:3.20 sleep 3600` with `traefik.http.services.p32.loadbalancer.server.port=80`, isolated from the live edge by `traefik.constraint-label=p32-probe`; the gate asserts **exactly 4** `p32-*` routers enabled; the task owned no host port and was removed in Step 6.
- **Files modified:** none (live throwaway only; recorded in the runbook Boot-and-discover section)
- **Verification:** Run A 4/4 enabled; live `/api/overview` 30/0 and 0 `p32-` routers seen by the live edge during the probe; `docker service ls` filters empty after teardown
- **Commit:** `dfa622ac`

---

**Total deviations:** 1 auto-fixed (plan-instructed).
**Impact on plan:** None on scope or mechanism — the correction was pre-authorized by the plan text; the throwaway proved the rules and was torn down with the live edge provably untouched.

## Issues Encountered

- **Swarmpit autoredeploy of `downtime_downtime` / `errorpage_errorpage` during the baseline (not caused by this plan).** The operator's thinx-swarm commit `498afa7` (nginx hardening of both images) triggered `swarmpit.service.deployment.autoredeploy`: errorpage rolled at 13:20:56Z, downtime at 13:45:31Z — the latter while the baseline task-id read ran, so one `docker service ps` read showed no running downtime task. Both were 1/1 within seconds; the fresh ids were taken as the baseline and re-read immediately before each Stage 1 update (pre == post for all three).
- **Plan verify command defect — Task 2 V4.** `generate-traefik-mirror.js … && git diff --quiet -- docker-compose.traefik.yml` cannot pass after the commit: regeneration rewrites the banner `generated:<ISO-UTC>` timestamp, so the diff is never empty (1 line). The intent is met (`MIRROR OK files=1`, 17 flags, banner SHA = thinx-swarm HEAD, mirror committed in `fa72db3a`); the regenerated file was restored to its committed state with `git checkout -- docker-compose.traefik.yml`.
- **Plan verify command defect — Task 3 V8.** The negated `Running (About a minute|N (seconds|minutes)) ago` grep matched `downtime_downtime` (23 min) and `errorpage_errorpage` (47 min) because of the autoredeploy above, which predates every Stage 1 update. The intent (label-only updates restart nothing) is proven by the per-update task ids: `5d7aukf4evft`, `vzyg90j8f878`, `9nitjbo580v8` identical before and after.
- **Run A `ruleSyntax` expectation.** The plan expected the p32 routers to read `ruleSyntax v3 (inherited)`; under a v3 default the API omits the field (`omitempty`) — it reads `-`. The v3 parse is proven by the matcher split (HeaderRegexp enabled, HeadersRegexp disabled) and Run B shows the explicit `v3`. Recorded in the runbook as observed. Plan 32-02's Stage 3 readback should expect the field to be absent, not `v3`.
- **Precondition wording.** The plan's precondition says micro's checkout is "at the same commit as the workstation thinx-swarm master … (fast-forwardable)". Micro was at `677e3a9` and the workstation at `498afa7` (operator's commit, one ahead, not yet on origin); `677e3a9` is its ancestor, so the fast-forward property held and the plan proceeded. The Task 2 `git push origin master` therefore also published `498afa7`, and the micro fast-forward carried its Dockerfile/nginx.conf changes (thinx-swarm has no CI; nothing was deployed by that). The operator's other uncommitted thinx-swarm changes (`landing` submodule pointer) were left unstaged.
- **External host `igraczech.unitednewschannel.net`** (one of the Host() values of `igraczech-https@swarm`) does not resolve in DNS — curl `000` at baseline and after Stage 1; pre-existing, recorded only.

## User Setup Required

`32-USER-SETUP.md` created with status **Complete**: the only human item (D-12 credential `/root/.p32-traefik-admin`, 600 root on micro) was staged by the operator before execution and verified by Task 1 (`HASH=MATCH`, `overview=200`). It remains in place for Plans 32-02 and 32-03; Plan 32-03 shreds it.

## Known Stubs

None — no application code; the runbook `### Stage 2 record (32-02)` / `### Stage 3 record (32-02)` headings are intentional placeholders that Plan 32-02 fills.

## Threat Flags

None — no new network endpoint, auth path, file access pattern or schema change; the throwaway owned no host port and is gone; the live edge's static command and dashboard protection are unchanged.

## Next Phase Readiness

- **Ready for 32-02** (Stage 2: `--args` 17 -> 16 on `traefik_traefik`, one task restart; then Stage 3: `--label-rm ruleSyntax` x4). Start state: `traefik:v3.7.14 args=17 idx=38379311`, task `i7tpgo7vv0vj` (Running since 2026-10-07T22:04:51Z); four routers `enabled syn=v3` under explicit overrides, so the switch can go in either direction safely; acme.json `301121 1791410693 600 root`.
- Baseline values for the Stage 2 gate are in the runbook Baseline table and D.pre.yml (bare-IP `301`/`200`, WS `401` x2, matrices, serials, task ids). Expect the hostless line to stay `301` (downtime-http) and the API `ruleSyntax` field to be **absent** after Stage 3.
- Repo state equals live state: thinx-swarm `17401bb` (origin + micro), this repo `fa72db3a`+`db3bda26`, mirror MIRROR OK at 17 flags. `thinx-staging` is NOT pushed (Pitfall 7 / operator timing) — the local lead over `origin/thinx-staging` grows by this plan's commits.
- Swarmpit may autoredeploy `downtime_downtime` / `errorpage_errorpage` whenever the operator rebuilds their images; Stage 3's task-id gate must re-read ids immediately before each update, as Stage 1 did.
- The dashboard credential file stays on micro until 32-03.

## Self-Check: PASSED

- Files: `traefik-edge.D.pre.yml` FOUND (tracked, `dfa622ac`); `32-USER-SETUP.md` FOUND; runbook Phase 32 section FOUND (`## Native v3 rules + BC-switch removal (Phase 32`, `### Boot-and-discover (32-01 Task 1, D-02 tracer`, `### Mechanism (Phase 32)`, `### Stage 1 record (32-01 Task 3`); `docker-swarm.yml` + `docker-compose.traefik.yml` committed in `fa72db3a`
- Commits reachable from HEAD: `dfa622ac`, `fa72db3a`, `db3bda26` — `git rev-list --count bc27e1ad..db3bda26` = 3 = `actuals.commits`; sibling repo `17401bb` on origin/master and micro
- Acceptance criteria re-run at close-out: Task 1 verify 7/7 PASS (post-commit tracer gate); Task 2 verify V1-V3, V5 PASS, V4 intent PASS (command defect recorded); Task 3 verify V1-V7, V9 PASS, V8 intent PASS (command defect recorded)
- Production state at close-out (read-only): `traefik_traefik` `v3.7.14 args=17 idx=38379311`; four routers `enabled syn=v3`; status filter empty; bare-IP `301`/`200`; WS `401` x2

---
*Phase: 32-v3-native-syntax-bc-removal*
*Completed: 2026-10-08*
