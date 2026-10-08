---
phase: 32-v3-native-syntax-bc-removal
plan: 02
subsystem: infra
tags: [traefik, swarm, routing, v3, static-config, rule-syntax, bc-switch, edge, migration]
requires:
  - phase: 32-v3-native-syntax-bc-removal
    provides: "32-01: four routers on native v3 rules with ruleSyntax=v3 overrides live (thinx-swarm 17401bb, this repo fa72db3a/db3bda26); traefik-edge.D.pre.yml baseline; runbook Phase 32 section with Baseline table and Stage 2/3 placeholders; dashboard credential /root/.p32-traefik-admin staged on micro"
provides:
  - "Stage 2 repo-first (D-04, D-09): thinx-swarm 6c01b26 removes the v2 rule-syntax backward-compat flag from traefik.yml (17 -> 16 flags, comment rewritten without the flag token) on origin/master and fast-forwarded on micro; mirror docker-compose.traefik.yml regenerated MIRROR OK at 16 flags (commit 875c20c2)"
  - "Stage 2 LIVE (D-01, D-09, D-10): traefik_traefik on traefik:v3.7.14 with 16 Args and no BC switch after ONE --args update (fire 14:48:11Z, new task yudql1hqdnd9 Running 14:48:26Z, Version.Index 38379311 -> 38379738, image unchanged, exactly one running task); 600-root 17-flag revert source micro:/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json; D-10 gate green on all four triggers, revert staged and NOT fired"
  - "Stage 3 repo-first + LIVE (D-03): thinx-swarm 158f369 and this repo 80625887 delete the four ruleSyntax=v3 lines (errorpage.yml, downtime.yml, thinx.yml, docker-swarm.yml); three --label-rm updates at 15:00:26Z with task ids identical pre/post; 0 ruleSyntax labels live; API ruleSyntax field absent on all 30 routers (inherited v3 default); mirror banner 158f369 still 16 flags"
  - "Runbook records: ### Stage 2 — converted static command (32-02 Task 1), ### Stage 2 record (32-02 Task 2) with the standalone 'Version.Index post-Stage-2: 38379738' line, ### Stage 3 record (32-02 Task 3) with the Phase 32 live end state for 32-03"
  - "EDGE-MIG-03 'converted AND removed' evidence: args=16 live, 0 switch lines in traefik.yml and the mirror, 0 overrides live or in git, every router enabled, behavioural probes and matrices identical to the Plan 01 baseline"
affects: [32-03, traefik-edge, thinx-swarm]
actuals:
  tokens: 6203
  tasks: 3
  commits: 4
plan_head_before: c58f9f26ec16818194a7b1ed1632bddc243907c6
plan_head_after: ce8b699a99436a18a8ca1599ef1f74cb267e052f
tech-stack:
  added: []
  patterns:
    - "Stage 2 --args rebuild: fresh 600-root full-spec backup on micro -> jq 'del(.[3]) | map(@sh) | join(\" \")' -> dry-print with the e-mail masked TO END OF LINE on both sides (the mirror's ${EMAIL?Variable not set} contains spaces) -> index-exact diff vs the committed mirror -> ONE docker service update --args; revert = the same update with map(@sh) over the full backup list"
    - "Record Version.Index only after UpdateStatus.State=completed — the index advances once more when the update settles (38379727 mid-update -> 38379738 completed)"
    - "Under a v3 default the dashboard API omits ruleSyntax (omitempty): 'no override' reads as the field absent on every router; assert override removal on docker service inspect labels, not on the API echoing v3"
    - "Repo-first chain per stage (thinx-swarm commit -> origin -> micro temp ref + git merge --ff-only -> mirror regen + this-repo commit -> live update), applied twice (Stage 2, Stage 3)"
key-files:
  created: []
  modified:
    - docker-compose.traefik.yml
    - docker-swarm.yml
    - .planning/runbooks/traefik-v3-cutover.md
    - "~/Repositories/thinx-swarm/traefik.yml (sibling repo, 6c01b26)"
    - "~/Repositories/thinx-swarm/thinx.yml (sibling repo, 158f369)"
    - "~/Repositories/thinx-swarm/downtime.yml (sibling repo, 158f369)"
    - "~/Repositories/thinx-swarm/errorpage.yml (sibling repo, 158f369)"
key-decisions:
  - "Index-exact dry-print diff masks the ACME e-mail to end of line on both sides: the plan's suggested [^ ]+ mask stops at the first space inside the mirror's ${EMAIL?Variable not set} placeholder and produced a false mismatch on the e-mail line only; the corrected mask gave 16/16 identical and only then was the update fired"
  - "The recorded 'Version.Index post-Stage-2' is the settled value 38379738 (UpdateStatus completed at 14:48:31Z), not the 38379727 read while the update was still 'updating'; Task 3's verify compares the live index against this line and it held through Stage 3"
  - "Two log observations around the Stage 2 restart were classified as non-triggers: 13 'middleware … does not exist' ERR lines emitted only by the OLD task during its 14:48:23Z drain (partial dynamic config to a stopping task; none on the new task), and one start-time 'Error renewing ACME certificate' for the external fotostim stack's checkout.qooldata.com cert (ACME authorization 400, unrelated to rule syntax) — neither is a rule-parse error; the D-10 triggers are the status filter, HTTPS matrix, WS 401 and bare-IP pair, all green"
  - "thinx_api's running task is 8v3ype7pftzh (Swarmpit autoredeployed it at 14:15:41Z with a new image digest, between Plan 32-01's Stage 1 and this plan); adopted as the Stage 3 pre-update id and re-read immediately before the --label-rm, per the 32-01 pattern"
  - "Three plan <automated> commands that cannot pass as written (Task 1/3 V2 banner-timestamp git diff, Task 3 V5 API echoing syn=v3, Task 3 V7 task-age grep) were reported as plan-command defects with the intent proven by other evidence, not rewritten"
patterns-established:
  - "Pattern: every --args update on traefik_traefik is preceded by a fresh out-of-git 600-root full-spec backup on micro that doubles as the revert source; the dry-print of the rebuilt list is diffed index-exact against the committed mirror before anything fires"
  - "Pattern: the Stage 2 restart window is measured fire -> new task Running (15 s here vs 4 s in 31-03 — the difference is the old task's stop time, not the new task's boot); the provider re-converges within ~30 s"
requirements-completed: [EDGE-MIG-03]
coverage:
  - id: D1
    description: "Stage 2 repo-first: thinx-swarm traefik.yml without the BC switch (16 flags, Phase 32 removal comment without the flag token) on origin and fast-forwarded on micro BEFORE the live update; mirror MIRROR OK at 16 flags with the device/MQTT entrypoints and exposedbydefault intact; live still args=17 at task end"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: other
        ref: "grep -v '^ *#' traefik.yml | grep -c core.defaultRuleSyntax -> 0 (token count incl. comments also 0); '# Phase 32 (EDGE-MIG-03' at :106; grep '^ *- --' | wc -l -> 16; providers.swarm x3, exposedbydefault=true, vpn/mqtt/mqtts/thxp entrypoints present; origin/master == micro HEAD == 6c01b26 (micro 0 tracked mods, Fast-forward 17401bb..6c01b26); check-traefik-mirror.js -> MIRROR OK files=1, banner 6c01b26, 16 flags, 0 uncommented switch, 0 --providers.docker; live args=17 before Task 2 (verify V1, V3, V4, V5 PASS; V2 intent PASS — banner timestamp diff only)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stage 2 live: traefik_traefik on traefik:v3.7.14 with 16 Args and no BC switch, one task restart, Version.Index advanced, one running task; D-10 gate green (status filter empty, HTTPS matrix == baseline, WS 401 + X-Forwarded-Proto https both casings, bare-IP 301/200); log scan 0; serials == D.pre.yml; checkend 0; 600-root backup on micro; Stage 2 record with the standalone Version.Index line committed"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: integration
        ref: "backup traefik-p32-prestage2-20261008T144309Z.json 600 root 16020 B, 17 Args, .[3] = the switch; dry-print 16/16 index-exact vs mirror; update rc 0 at 14:48:11Z, task yudql1hqdnd9 Running 14:48:26Z, 'traefik:v3.7.14 args=16 idx=38379738 update=completed', running tasks 1; /api/overview 30/0/0; status filter empty; four routers enabled syn=v3 (overrides still set); ruleSyntax histogram 26 absent + 4 v3; HTTPS 14-host matrix and HTTP redirect matrix == baseline; WS 401 + X-Forwarded-Proto: https (websocket, WebSocket), no nginx; bare-IP 301 https://188.166.23.244/ + 200; hostless 301; serials 051152D5…/0535CC0C…, checkend 0 ok; log scan 0; acme.json size 301121 unchanged (mtime moved on the v3 start rewrite); 7442/1883/8883 OPEN, publishes unchanged; runbook 'Version.Index post-Stage-2: 38379738' == live; secret markers 0 (verify V1-V12 all PASS as written)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stage 3: 0 ruleSyntax lines in docker-swarm.yml / thinx.yml / downtime.yml / errorpage.yml and 0 labels live; v3 rules + priorities 200/2/2/1 intact; WS block identical across the two repos; thinx-swarm 158f369 on origin and micro; mirror MIRROR OK at 16 with banner 158f369; four routers enabled under the inherited v3 default; probes green; no restarts; traefik_traefik args=16 with the Task 2 Version.Index; Stage 3 record committed"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: integration
        ref: "grep -hv '^ *#' <4 files> | grep -c ruleSyntax -> 0; HeaderRegexp rule x1 in docker-swarm.yml and thinx.yml; PathPrefix(`/`) x3; priorities 1/2/2/200 unchanged; WS block diff empty; origin/master == micro HEAD == 158f369; MIRROR OK files=1, 16 flags, banner 158f369; live labels: 0 ruleSyntax, 3 PathPrefix rules, WS rule + priority=200; three updates rc 0, task ids 5d7aukf4evft / vzyg90j8f878 / 8v3ype7pftzh identical pre/post; API 4/4 enabled with ruleSyntax absent, histogram {'-':30}; status filter empty; overview 30/0/0; bare-IP 301/200; WS 401 x2; HTTPS/HTTP matrices == baseline; traefik args=16 idx=38379738 == runbook line; log scan 0; ports OPEN (verify V1, V3, V4, V6 PASS; V2 intent PASS — banner timestamp; V5 intent PASS — API omits ruleSyntax under v3; V7 intent PASS — thinx_api age from the pre-plan autoredeploy)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Regression guard across both stages (EDGE-MIG-02/04): HTTPS and HTTP matrices incl. the 7 resolvable external hosts identical to the 13:44Z baseline after Stage 2 and after Stage 3; cert serials unchanged; :7442/:1883/:8883 OPEN and direct-published through the one restart; no other static flag changed"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: integration
        ref: "Stage 2 (14:49-14:50Z) and Stage 3 (15:00-15:01Z) matrices: app/console/rtm/thinx.cloud/swarmpit 200, micro 401, fotostim.com/www/fotostim.cz/www/igraczech.com/www/www.syxra.cz 200, igraczech.unitednewschannel.net 000 (DNS, pre-existing); HTTP app 200, all others 301 -> https://<host>/; serials app 051152D5A20BE36DEFA1B6FA83379CE42809 / rtm 0535CC0C71E39D9378E72893F3A2141267B0 both times; 7442/1883/8883 OPEN both times; thinx_api 7442->7442, thinx_mosquitto 1883/1884/8883, traefik 80/443 only; live Args: providers.swarm x3, exposedbydefault=true, six entrypoints incl. thxp=:7442, three le ACME flags, accesslog/log/log.level=ERROR/api — only the switch removed"
        status: pass
    human_judgment: false
duration: 25 min
completed: 2026-10-08
status: complete
---

# Phase 32 Plan 02: Stage 2 BC-switch removal + Stage 3 override strip Summary

**The live Traefik edge now runs the native v3 rule parser with no backward-compat switch and no per-router overrides: `--core.defaultRuleSyntax=v2` was removed repo-first (thinx-swarm `6c01b26`, mirror `875c20c2` at 16 flags) and then live with ONE `docker service update --args` on `traefik_traefik` (fire 14:48:11Z, new task `yudql1hqdnd9` Running 14:48:26Z, `Version.Index 38379311 -> 38379738`, image `traefik:v3.7.14` unchanged) under the D-10 auto-revert triggers — status filter empty, HTTPS matrix identical to baseline, HTTP/1.1 WebSocket probe `401` + `X-Forwarded-Proto: https` for both `Upgrade` casings, bare-IP `301`/`200` — none of which fired; then the four `ruleSyntax=v3` overrides were deleted repo-first (thinx-swarm `158f369`, this repo `80625887`) and stripped live with three label-only `--label-rm` updates that restarted nothing, leaving every one of the 30 routers enabled under the inherited v3 default with committed files equal to micro's checkout and the live spec.**

## Performance

- **Duration:** 25 min | **Started:** 2026-10-08T14:37:56Z | **Completed:** 2026-10-08T15:03:22Z | **Tasks:** 3 (all auto; 0 checkpoints) | **Files modified:** 3 in this repo + 4 in thinx-swarm; live: 1 `--args` update (1 task restart), 3 label-only updates (0 restarts)

## Accomplishments

- **Task 1 — Stage 2 repo-first (D-04, D-09).** `traefik.yml` line 108 (the switch) deleted and the two comment lines above it rewritten to a `# Phase 32 (EDGE-MIG-03, D-09)` removal note that never names the flag token (Pitfall 8): 0 token occurrences in the file, 16 `- --` lines, every other flag byte-identical. thinx-swarm `6c01b26` pushed to `origin/master`, pushed to micro as `p32-stage2`, `git merge --ff-only` there (`17401bb..6c01b26`, 0 tracked modifications, temp branch deleted). Mirror regenerated: `MIRROR OK files=1`, banner `thinx-swarm@6c01b26`, 16 flags, 0 uncommented switch lines, 0 `--providers.docker`, device/MQTT entrypoints and `exposedbydefault=true` intact. Runbook `### Stage 2 — converted static command (32-02 Task 1)` with the 17 -> 16 index table. Commit `875c20c2`. Live still `args=17` at task end (verified).
- **Task 2 — Stage 2 live (D-01, D-09, D-10).** Precondition held (4/4 `enabled syn=v3`, filter empty, 30/0, four override labels, credential `600 root`, micro HEAD `6c01b26`). Pre-flight on micro: full-spec backup `traefik-p32-prestage2-20261008T144309Z.json` (`600 root`, 17 Args, `.[3]` = the switch; never copied off micro); 16-flag set rebuilt via `jq del(.[3]) | map(@sh)`, dry-printed masked and diffed **index-exact 16/16** against the committed mirror (swarm x3 / docker x0 / BC x0 / thxp x1); "pre" gate row = baseline. **One** `--args` update at 14:48:11Z (rc 0, `n_args_to_apply=16`); the old task drained for ~13 s, the new task `yudql1hqdnd9` was Running at 14:48:26Z on `traefik:v3.7.14`, exactly one running task, `UpdateStatus completed` at 14:48:31Z, `Version.Index 38379738`. Provider converged by 14:48:57Z (`/api/overview` 30/0/0). D-10 triggers: (1) status filter empty, (2) HTTPS 14-host matrix == baseline, (3) WS `401` + `X-Forwarded-Proto: https` for `websocket` and `WebSocket`, no nginx, (4) bare-IP `301 https://188.166.23.244/` + `200` — **none fired, revert not executed**. Evidence set: four routers `enabled syn=v3` (overrides still explicit), the other 26 routers now read `ruleSyntax` absent (inherited v3); HTTP redirect matrix == baseline; serials == D.pre.yml, `checkend 0` ok; log scan 0; `acme.json` size `301121` unchanged (one-time start rewrite moved the mtime, as in 31-03); ports OPEN; publishes unchanged. Runbook `### Stage 2 record (32-02 Task 2)` with the standalone `Version.Index post-Stage-2: 38379738` line. Commit `5e58a669`. All 12 `<verify>` commands PASS as written.
- **Task 3 — Stage 3 (D-03, D-04).** Exactly four lines deleted (`errorpage.yml` 1, `downtime.yml` 2, `thinx.yml` 1, `docker-swarm.yml` 1); rules, priorities 1/2/2/200 and Phase 32 comments untouched; WS block identical across the repos. thinx-swarm `158f369` on origin and fast-forwarded on micro (`6c01b26..158f369`, 0 tracked mods); mirror `MIRROR OK` at 16 flags with banner `158f369` (body unchanged, Pitfall 6). Commit `80625887`. Live at 15:00:26Z: `errorpage_errorpage` -> `downtime_downtime` (both routers in one update) -> `thinx_api`, each rc 0 with task id pre == post (`5d7aukf4evft`, `vzyg90j8f878`, `8v3ype7pftzh`), label readback = v3 rule + priority and no `ruleSyntax`; 0 `ruleSyntax` labels across the three services. Gate at 15:00:56Z-15:01:28Z: four routers `enabled` with `ruleSyntax` absent (histogram `{"-": 30}`), filter empty, 30/0/0, both matrices == baseline, bare-IP `301`/`200`, WS `401` x2, serials unchanged, `traefik_traefik` `args=16 idx=38379738` unchanged, log scan 0, ports OPEN. Runbook `### Stage 3 record (32-02 Task 3)` + Phase 32 live end state. Commit `ce8b699a`.
- **Secret hygiene (P29 D-12).** The dashboard password was read only into a shell variable on micro and `unset`; the backup carries the real e-mail and apr1 hash and is referenced by path only; the dry-print masked the e-mail; 0 hash/key markers and 0 non-placeholder e-mails in the runbook, mirror and `docker-swarm.yml`. `/root/.p32-traefik-admin` left in place for 32-03.

## Task Commits

1. **Task 1: Stage 2 repo-first — BC switch removed from traefik.yml, mirror regenerated at 16 flags** - `875c20c2` (feat); sibling repo thinx-swarm `6c01b26` (feat(edge))
2. **Task 2: Stage 2 live — one --args update on traefik_traefik, D-10 gate green, record** - `5e58a669` (docs)
3. **Task 3: Stage 3 — four ruleSyntax overrides removed repo-first, stripped live with --label-rm, record** - `80625887` (chore) + `ce8b699a` (docs); sibling repo thinx-swarm `158f369` (chore(edge))

**Plan metadata:** see the final `docs(32-02)` commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `docker-compose.traefik.yml` - regenerated twice (Stage 2: banner `6c01b26`, 17 -> 16 flags; Stage 3: banner `158f369`, body unchanged)
- `docker-swarm.yml` - `traefik.http.routers.thinx-api-ws.ruleSyntax=v3` line removed; `HeaderRegexp` rule, priority 200 and the Phase 32 comment kept; block identical to `thinx.yml`
- `.planning/runbooks/traefik-v3-cutover.md` - `### Stage 2 — converted static command (32-02 Task 1)`, `### Stage 2 record (32-02 Task 2)` (timeline, D-10 evaluation, `Version.Index post-Stage-2: 38379738`), `### Stage 3 record (32-02 Task 3)` (three updates, end check, Phase 32 live end state)
- `~/Repositories/thinx-swarm/traefik.yml` - Stage 2 commit `6c01b26` (switch removed, comment rewritten)
- `~/Repositories/thinx-swarm/{thinx.yml,downtime.yml,errorpage.yml}` - Stage 3 commit `158f369` (four override lines removed)
- Live on micro (not files): `traefik_traefik` Args 17 -> 16 (task `i7tpgo7vv0vj` -> `yudql1hqdnd9`, `Version.Index 38379738`); `ruleSyntax` labels removed from `errorpage_errorpage`, `downtime_downtime`, `thinx_api`; `micro:/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json` (600 root, out of git)

## Decisions Made

- E-mail masked to end of line in the index-exact diff (the plan's `[^ ]+` mask false-mismatched on the mirror's `${EMAIL?Variable not set}` placeholder); nothing fired until the diff was empty.
- `Version.Index post-Stage-2` recorded as the settled value `38379738` (after `UpdateStatus completed`), not the mid-update `38379727`.
- Old-task drain ERR lines and the external-stack ACME renewal error classified as non-triggers (see Issues).
- `thinx_api` task `8v3ype7pftzh` (pre-plan Swarmpit roll) adopted and re-read immediately before the Stage 3 update.
- Three plan verify commands that cannot pass as written reported as defects, not rewritten (see Issues).

## Deviations from Plan

None - plan executed exactly as written. (The e-mail-mask correction was inside the executor's own diff tooling while carrying out the plan's "compare masked" instruction; no file, command order, scope or live step changed.)

**Total deviations:** 0 auto-fixed. **Impact:** none; the D-10 revert was staged and never needed.

## Issues Encountered

- **Stage 2 restart window 15 s, not ~4 s.** `docker service ps --filter desired-state=running` was empty from 14:48:11Z to 14:48:24Z while the old task `i7tpgo7vv0vj` stopped; the new task was Starting at 14:48:25Z and Running at 14:48:26Z. The extra time is the old task's stop, not a slow boot or crash-loop (one task, no restarts after). Web only; `:7442`/`:1883`/`:8883` are direct-published and stayed OPEN.
- **Old-task drain log lines (not a trigger).** At 14:48:23Z the stopping task logged 13 `ERR … middleware "https-redirect@swarm" / "security-headers@swarm" does not exist` lines (a partial dynamic config delivered to the draining task). The new task logged none; the rule-parse scan is 0; every router is enabled. Recorded in the Stage 2 record.
- **ACME renewal error on the new task (external stack, pre-existing class).** At 14:48:34Z the new task logged one `Error renewing ACME certificate: {checkout.qooldata.com [checkout.fotostim.com checkout.fotostim.cz]} … invalid authorization … 400` — the start-time renewal pass for a fotostim-stack certificate whose domain fails ACME authorization. Unrelated to rule syntax; the served app/rtm serials are unchanged. A 24-hour log history scan was started to confirm it predates this plan but had not finished at close-out (the access log volume makes `docker service logs --since 24h` slow). Logged to `deferred-items.md` for the external stack owner.
- **`thinx_api` autoredeployed before this plan.** Swarmpit rolled `thinx_api` at 14:15:41Z (new image digest `15bab212…`, task `9nitjbo580v8` -> `8v3ype7pftzh`) between Plan 32-01's Stage 1 (14:05Z) and this plan (14:38Z). Not caused by Phase 32; the Stage 3 gate used the fresh id (pre == post).
- **Plan verify command defects (intent proven otherwise, not rewritten):** Task 1 V2 and Task 3 V2 — `generate-traefik-mirror.js … && git diff --quiet -- docker-compose.traefik.yml` cannot pass after the commit because regeneration rewrites the banner `generated:<timestamp>` (1-line diff; `MIRROR OK`, 16 flags, mirror committed; file restored with `git checkout --`). Task 3 V5 — `grep '^enabled syn=v3$' … -eq 4` reads `enabled syn=-` x4 because the API omits `ruleSyntax` under the v3 default (the 32-01 finding the plan text itself anticipated); the label readback (V4) and the probes prove the end state. Task 3 V7 — the negated `Running N minutes ago` grep matches `thinx_api` (45 min) from the pre-plan autoredeploy; the per-update task ids prove Stage 3 restarted nothing.
- **Plan dry-print mask nit.** The plan's suggested `sed -E 's/acme.email=[^ ]+/acme.email=<masked>/'` masks the live side correctly but leaves ` not set}` on the mirror side; mask to end of line.

## User Setup Required

None new. `32-USER-SETUP.md` (from 32-01, status Complete) still applies: `/root/.p32-traefik-admin` remains on micro for Plan 32-03, which shreds it.

## Known Stubs

None — no application code; the runbook placeholders from 32-01 are now filled.

## Threat Flags

None — no new network endpoint, auth path, file access pattern or schema change. One static flag was removed and four labels were deleted; the dashboard protection, TLS, ACME, `exposedbydefault` and log level are unchanged (P33/P34 untouched). The 600-root backup and the credential stay on micro only.

## Next Phase Readiness

- **Ready for 32-03** (full re-verify incl. the device-flow harness, `traefik-edge.D.post.yml` capture, README D-step bullet, credential shred, the single `blocking-human` console gate). Live end state: `traefik_traefik` `traefik:v3.7.14 args=16 idx=38379738`, task `yudql1hqdnd9` (Running since 14:48:26Z); 30/30 routers enabled, `ruleSyntax` absent everywhere; bare-IP `301`/`200`; WS `401` x2; serials unchanged; `acme.json` `301121 1791470908 600 root`.
- Repo state == live state: thinx-swarm `158f369` (origin + micro), this repo `875c20c2` / `5e58a669` / `80625887` / `ce8b699a`, mirror `MIRROR OK` at 16 flags (banner `158f369`). `thinx-staging` is NOT pushed (operator timing; the local lead over `origin/thinx-staging` now includes 32-01 and 32-02).
- 17-flag revert source for the whole phase: `micro:/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json` (600 root). Re-adding the switch is one `--args` update with `map(@sh)` over its full Args list.
- 32-03's `D.post.yml` should record: 16 flags, the four v3 rules, `ruleSyntax labels: ABSENT`, `Version.Index 38379738`, the restart window, and expect the API `ruleSyntax` field absent (not `v3`).
- Swarmpit may autoredeploy `thinx_api` / `downtime_downtime` / `errorpage_errorpage` independently (seen today at 14:15:41Z for thinx_api); task-age assertions on those services are not meaningful — compare ids.

## Self-Check: PASSED

- Files: `docker-compose.traefik.yml` committed in `875c20c2` and `80625887` (banner `158f369`, `MIRROR OK files=1`, 16 flags); `docker-swarm.yml` committed in `80625887` (0 `ruleSyntax`); runbook headings FOUND (`### Stage 2 — converted static command (32-02 Task 1`, `### Stage 2 record (32-02 Task 2`, `### Stage 3 record (32-02 Task 3`); sibling files on thinx-swarm `158f369` == origin/master == micro
- Commits reachable from HEAD: `875c20c2`, `5e58a669`, `80625887`, `ce8b699a` — `git rev-list --count c58f9f26..ce8b699a` = 4 = `actuals.commits`
- Acceptance criteria re-run at close-out: Task 1 V1, V3, V4, V5 PASS, V2 intent PASS (banner timestamp defect); Task 2 V1-V12 PASS as written; Task 3 V1, V3, V4, V6 PASS, V2/V5/V7 intent PASS (defects recorded above)
- Production state at close-out (read-only, 15:01Z): `traefik:v3.7.14 args=16 idx=38379738`, one running task; 30/0/0; `ruleSyntax` histogram `{"-": 30}`; bare-IP `301`/`200`; WS `401` x2; 7442/1883/8883 OPEN

---
*Phase: 32-v3-native-syntax-bc-removal*
*Completed: 2026-10-08*
