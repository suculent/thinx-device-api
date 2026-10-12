---
phase: 32-v3-native-syntax-bc-removal
plan: 03
subsystem: infra
tags: [traefik, swarm, routing, v3, verification, runbook, device-paths, edge, migration]
requires:
  - phase: 32-v3-native-syntax-bc-removal
    provides: "32-01: four routers on native v3 rules + traefik-edge.D.pre.yml baseline (13:44Z) + device-flow harness baseline PASS x2; 32-02: BC switch removed live (traefik_traefik args=16, Version.Index 38379738, task yudql1hqdnd9) and the four ruleSyntax=v3 overrides stripped (0 labels live, thinx-swarm 158f369, this repo 80625887/ce8b699a)"
provides:
  - "Full RESEARCH §Q3 re-verify of the native-v3 end state against the Plan 01 baseline (15:12-15:14Z): router status filter empty, /api/overview 30/0/0, ruleSyntax histogram {\"-\": 30}, four routers enabled with v3 rules at priorities 200/2/2/1, traefik:v3.7.14 args=16 idx=38379738 with 0 switch tokens in the live Args, HTTPS/HTTP matrices identical line for line incl. the 7 external hosts, bare-IP 301/200, WS 401 + X-Forwarded-Proto: https for both Upgrade casings, app + rtm serials == D.pre.yml, acme.json 301121 B / 24 certs, tls-config sha unchanged, :7442/:1883/:8883 OPEN and direct-published, log scan 0, task ids unchanged since Stage 3 (ROADMAP success criterion 2)"
  - "Repo == deployed proven (ROADMAP success criterion 3): thinx-swarm HEAD == micro /mnt/gluster/deployment/swarm HEAD == origin/master == mirror banner == 158f36981c6f128dbc4b0dcd2f6d378124852e6f; check-traefik-mirror.js MIRROR OK files=1 at 16 flags; docker-swarm.yml thinx-api-ws block diff vs thinx.yml empty; 0 ruleSyntax / 0 switch lines in any committed file"
  - "EDGE-MIG-04 re-verified at the end state: device-flow harness PASS over http://rtm.thinx.cloud:7442 + mqtt://thinx.cloud:1883 (p32-7442, 15:13:16-25Z) and over https://app.thinx.cloud (p32-https, 15:13:25-29Z), all 8 steps each"
  - "Redacted end-state capture .planning/runbooks/swarm-configs/traefik-edge.D.post.yml (16-flag command, four v3 rules, ruleSyntax labels ABSENT 0/4, Version.Index + Stage 2 restart window, acme.json continuity, both serials, 30/0 overview, bare-IP + WS 401 + harness results; 0 secret markers, 0 e-mails) and the swarm-configs/README.md per-step bullet naming steps A/B/C/D"
  - "Runbook close-out: ### Re-verify matrix (Phase 32, 2026-10-08 15:12-15:14 UTC) vs the Plan 01 baseline (13:44Z) and ### Live production state at hand-off (Phase 32, for the Task 2 human-verify gate) with the ordered revert command set (overrides first, then the 17-flag --args, then repo revert)"
  - "D-12 credential /root/.p32-traefik-admin verified (HASH=MATCH, overview 200) then shredded on micro at 15:16:48Z — the only live mutation of this plan"
  - "Operator approval at the single blocking-human gate (D-11): console renders and live updates arrive over the WebSocket on the native-v3 edge; legacy :7442 + plain-MQTT evidence accepted; D-06 behaviour change acknowledged. EDGE-MIG-03 closes on the converted-and-removed branch (D-09)"
affects: [traefik-edge, thinx-swarm, phase-33, phase-34]
actuals:
  tokens: 13065
  tasks: 2
  commits: 1
plan_head_before: 03f9dc38e4eb172cefe52190691e6e59a64b6498
plan_head_after: cb55fec6cacd18e92ca70b511745ea533de835de
tech-stack:
  added: []
  patterns:
    - "D.{pre,post}.yml capture pair per edge step: the post capture is redacted on micro before any byte is read off the host, diffed against the pre capture, and committed as an immutable phase record; the next phase opens a new step letter"
    - "Re-verify matrix vs baseline: the same §Q3 suite that produced the baseline is re-run top to bottom at the end state and recorded row by row (Baseline | End state | Verdict) so every claim is an observed value, never an assumption"
    - "Ordered revert for a syntax-default change: re-add the per-router overrides (label-only) BEFORE re-adding the v2 default switch — under v2 the HeaderRegexp router would be disabled the moment the switch returns"
    - "Credential lifecycle: stage before the phase, verify at each credentialed read (HASH=MATCH + overview 200), shred after the last credentialed readback; the human-gate failure path is designed to need no credential"
key-files:
  created:
    - .planning/runbooks/swarm-configs/traefik-edge.D.post.yml
    - .planning/phases/32-v3-native-syntax-bc-removal/32-03-SUMMARY.md
  modified:
    - .planning/runbooks/swarm-configs/README.md
    - .planning/runbooks/traefik-v3-cutover.md
key-decisions:
  - "EDGE-MIG-03 closes on the converted-and-removed branch (D-09): the switch is gone from the live Args, traefik.yml and the mirror, and no per-router override remains — no retention rationale exists because nothing is retained"
  - "Human gate approved on the native-v3 end state; the D-06 hostless/bare-IP behaviour change (HTTP/1.0 hostless GET answered 301 by downtime-http instead of Traefik's bare 404) is accepted as recorded since Stage 1"
  - "The dashboard credential was shredded immediately after the last credentialed readback, before the human gate: any later credentialed re-check requires the operator to re-stage the file, and the gate's revert path was written to need none"
  - "thinx-staging deliberately NOT pushed in this plan (operator timing, 31-03 precedent: every push rolls thinx_api via Swarmpit); the 12-commit local lead carries all of Phase 32 and the CI mirror gate passes locally"
patterns-established:
  - "Pattern: close a migration phase with a paired redacted capture (pre/post), a row-by-row re-verify matrix against the pre-phase baseline, and a hand-off section that states the live state, the repo state and an ordered revert — then one human gate"
  - "Pattern: per-plan submodule-pointer dirt that predates the phase (services/worker here, landing in thinx-swarm) is recorded in the matrix and left untouched, never reset or committed by the phase"
requirements-completed: [EDGE-MIG-03]
coverage:
  - id: D1
    description: "Native-v3 routing end state verified: 16-flag traefik_traefik with no BC switch, 0 ruleSyntax overrides, four routers enabled with v3 rules at priorities 200/2/2/1, 30/0/0 overview, route parity with the 13:44Z baseline incl. externals, bare-IP 301/200, WS 401 x2, serials and acme.json continuity, repo == deployed"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: other
        ref: "32-03-PLAN.md Task 1 V1-V12 all PASS as written (status filter, overview, label readback, HTTPS/HTTP matrices, bare-IP pair, WS probe x2, serials/checkend, acme.json, tls-config sha, ports, log scan, repo==deployed, D.post.yml markers); runbook 'Re-verify matrix (Phase 32, 2026-10-08 15:12-15:14 UTC)' rows all identical or at designed end-state value"
        status: pass
    human_judgment: false
  - id: D2
    description: "Legacy device paths re-verified at the end state over plaintext :7442 + plain MQTT :1883 and over HTTPS (EDGE-MIG-04): register -> status -> OTT -> firmware md5Match -> MQTT connect + ACL -> publish -> recent -> disconnect"
    requirement: "EDGE-MIG-04"
    verification:
      - kind: e2e
        ref: "/tmp/p31-device-flow/thinx-device-flow.mjs run p32-7442 (15:13:16-25Z, http://rtm.thinx.cloud:7442 + mqtt://thinx.cloud:1883) PASS and p32-https (15:13:25-29Z, https://app.thinx.cloud) PASS; logs /tmp/p32-harness-7442.log, /tmp/p32-harness-https.log; /dev/tcp 7442/1883/8883 OPEN x3; published ports thinx_api 7442->7442, thinx_mosquitto 1883/1884/8883, traefik 80/443 only"
        status: pass
    human_judgment: false
  - id: D3
    description: "Console renders and live WebSocket updates arrive on the native-v3 edge (thinx-api-ws on HeaderRegexp, no override); operator accepts the automated evidence bundle and the D-06 behaviour change"
    requirement: "EDGE-MIG-03"
    verification: []
    human_judgment: true
    rationale: "Browser-observed by the operator at the D-11 checkpoint:human-verify gate=blocking-human (console-retest checklist: Devices page renders, wss://rtm.thinx.cloud/… 101 with live updates); operator typed 'approved' on 2026-10-08. Automation cannot observe a browser-side live update."
  - id: D4
    description: "Redacted D.post.yml capture, README D-step bullet, runbook re-verify matrix + hand-off committed with 0 secret markers / 0 e-mails; C.post.yml and D.pre.yml unchanged; D-12 credential shredded on micro"
    requirement: "EDGE-MIG-03"
    verification:
      - kind: other
        ref: "commit cb55fec6 (3 files, +286); secret-marker grep (apr1 / bcrypt / PEM-block markers) -> 0 and e-mail regex -> 0 on D.post.yml and README; git diff on C.post.yml / D.pre.yml empty; ssh micro 'ls /root/.p32-traefik-admin' -> No such file (shred 15:16:48Z)"
        status: pass
    human_judgment: false
duration: 22 min
completed: 2026-10-08
status: complete
---

# Phase 32 Plan 03: Full re-verify, D.post capture and console gate Summary

**The native-v3 edge was verified end to end against the 13:44Z Plan 01 baseline — every row of the RESEARCH §Q3 suite identical or at its designed end-state value (`traefik:v3.7.14 args=16 idx=38379738`, 30/0/0 routers with `ruleSyntax` absent everywhere, matrices and serials unchanged, bare-IP `301`/`200`, WS `401` x2, `:7442`/`:1883`/`:8883` OPEN with the device-flow harness PASS over plaintext and HTTPS, repo == deployed at thinx-swarm `158f369`), captured as the redacted `traefik-edge.D.post.yml`, closed out in the runbook with the re-verify matrix and the ordered revert, the D-12 credential shredded, and the operator approved the console over the converted WebSocket router at the single blocking-human gate — EDGE-MIG-03 closes as converted-and-removed, EDGE-MIG-04 re-verified.**

## Performance

- **Duration:** 22 min (includes the human-gate wait between Task 1 close-out at 15:19Z and the operator's approval) | **Started:** 2026-10-08T15:11:56Z | **Completed:** 2026-10-08T15:33Z | **Tasks:** 2 (1 auto + 1 `checkpoint:human-verify gate="blocking-human"`) | **Files:** 4 (1 capture created, 2 runbook files modified, this SUMMARY) | **Live mutations:** 1 (credential shred); 0 service updates, 0 restarts

## Accomplishments

- **Task 1 — Full re-verify of the native-v3 end state (EDGE-MIG-03 + EDGE-MIG-04 evidence bundle).** The complete §Q3 suite ran top to bottom at 15:12-15:14Z with the D-12 credential (`600 root 8`, `HASH=MATCH`, `/api/overview` 200): router status filter empty; overview **30 / 0 / 0** (18 services, 7 middlewares, 0 tcp, provider `["Swarm"]`); the four converted routers `enabled` at p=200/2/2/1 with rules ``Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)`` and ``PathPrefix(`/`)`` x3 and the `ruleSyntax` field absent; histogram `{"-": 30}`; live `traefik_traefik` `traefik:v3.7.14 args=16 idx=38379738 update=completed`, task `yudql1hqdnd9`, exactly one running task, `grep -c core.defaultRuleSyntax` over the live Args -> 0, `PreviousSpec` = same image with 17 Args; label readback 0 `ruleSyntax` lines across `thinx_api` / `downtime_downtime` / `errorpage_errorpage`. HTTPS matrix app/console/rtm/thinx.cloud/swarmpit **200**, micro **401**; the 7 resolvable external hosts **200**, `igraczech.unitednewschannel.net` **000** (DNS, pre-existing); HTTP redirect matrix app 200, every other host 301 -> `https://<host>/`; bare-IP `301 https://188.166.23.244/` + `200` (`server: nginx`); hostless HTTP/1.0 `301` (D-06, record only); WS probe `HTTP/1.1 401 Unauthorized` + `X-Forwarded-Proto: https` for `websocket` and `WebSocket`, no `Server:` header. Serials app `051152D5A20BE36DEFA1B6FA83379CE42809` / rtm `0535CC0C71E39D9378E72893F3A2141267B0` == D.pre.yml, `checkend 0` ok; `acme.json` `301121 1791470908 600 root`, 24 certs (size unchanged, mtime = the Stage 2 one-time start rewrite); `tls-config-1` sha256 `7e43d8f919317184…` == committed `tls.toml`. `:7442` / `:1883` / `:8883` **OPEN**; publishes `thinx_api 7442->7442`, `thinx_mosquitto 1883/1884/8883`, traefik `80/443` only. Device-flow harness **`p32-7442` PASS** (15:13:16-25Z: register over `http://rtm.thinx.cloud:7442`, status, OTT 200, firmware 380048 B `md5Match`, `mqtt://thinx.cloud:1883` connected + both ACL grants, publish, recent, disconnect) and **`p32-https` PASS** (15:13:25-29Z over `https://app.thinx.cloud`, same 8 steps). Log scan `error while parsing rule|unsupported function` since 14:48Z -> 0. Task ids `8v3ype7pftzh` / `vzyg90j8f878` / `5d7aukf4evft` unchanged since Stage 3. Repo == deployed: thinx-swarm HEAD == micro checkout == `origin/master` == mirror banner == `158f36981c6f128dbc4b0dcd2f6d378124852e6f`, `MIRROR OK files=1`, 16/16 `- --` lines, WS block diff empty, 0 `ruleSyntax` / 0 switch lines committed. All 12 `<automated>` verify commands PASS as written.
- **`traefik-edge.D.post.yml`** captured 15:14:20Z and redacted on micro before being read (197 lines): the 16-flag command with no switch line, the four v3 rules, `ruleSyntax labels: ABSENT  # 0/4`, `Version.Index 38379738` + the Stage 2 restart window, `acme.json` continuity, both serials, the 30/0 overview, the bare-IP / WS 401 / harness results; 0 hash/key markers, 0 e-mail matches; `C.post.yml` / `D.pre.yml` untouched. `swarm-configs/README.md` gained the per-step bullet `traefik-edge.<step>.{pre,post}.yml` naming steps A/B (Phase 30), C (Phase 31) and D (Phase 32).
- **Runbook close-out** (`.planning/runbooks/traefik-v3-cutover.md`, +88 lines): `### Re-verify matrix (Phase 32, 2026-10-08 15:12-15:14 UTC) vs the Plan 01 baseline (13:44Z)` (21 rows, Baseline | End state | Verdict, verdict "every row identical to the baseline or at its designed end-state value; nothing to revert") and `### Live production state at hand-off (Phase 32, for the Task 2 human-verify gate)` (live state, repo state, push status, the credential-free failure path and the ordered revert (a)-(d): overrides first, then the 17-flag `--args` from `micro:/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json`, then the behavioural re-check, then the repo reverts).
- **Credential shred (D-12).** `/root/.p32-traefik-admin` verified at 15:12Z, used for the credentialed rows, **shredded at 15:16:48Z** (`ls` -> `No such file`). The only live mutation of this plan; no `--api.insecure` was ever set.
- **Task 2 — Human-verify console gate (D-11).** The operator confirmed in the browser that the console renders and live updates arrive over the WebSocket on the native-v3 edge, accepted the legacy `:7442` + plain-MQTT evidence, and typed **"approved"**. No revert executed. EDGE-MIG-03 closes on the converted-and-removed branch (D-09).

## Task Commits

1. **Task 1: Full re-verify of the native-v3 end state, D.post.yml capture, README + runbook close-out, credential shred** - `cb55fec6` (docs)
2. **Task 2: Human-verify console gate (blocking-human, D-11)** - approved by the operator (no commit)

**Plan metadata:** the two `docs(32-03)` commits that follow `cb55fec6` (this SUMMARY; then STATE + ROADMAP + REQUIREMENTS close-out). `actuals.commits` is measured as `git rev-list --count 03f9dc38..cb55fec6` = 1 at SUMMARY-write time.

## Files Created/Modified

- `.planning/runbooks/swarm-configs/traefik-edge.D.post.yml` - new (197 lines), redacted end-state capture of `traefik_traefik` + the converted router labels; immutable Phase 32 record paired with `D.pre.yml`
- `.planning/runbooks/swarm-configs/README.md` - one bullet: `traefik-edge.<step>.{pre,post}.yml` naming A/B (P30), C (P31), D (P32) and the immutability rule
- `.planning/runbooks/traefik-v3-cutover.md` - `### Re-verify matrix (Phase 32, …)` + `### Live production state at hand-off (Phase 32, …)` with the ordered revert command set
- `.planning/phases/32-v3-native-syntax-bc-removal/32-03-SUMMARY.md` - this file
- Live on micro (not a file): `/root/.p32-traefik-admin` shredded 15:16:48Z. Workstation scratch (not committed): `/tmp/p32-harness-7442.log`, `/tmp/p32-harness-https.log`

## Decisions Made

- EDGE-MIG-03 closes as "converted AND removed" (D-09): live Args, `traefik.yml` and the mirror carry no switch; no override remains; the flagged assumption from Plans 01/02 is resolved by this evidence bundle plus the operator's approval, not auto-resolved.
- D-06 behaviour change (hostless / bare-IP requests answered by the downtime/error pages) accepted by the operator at the gate, as recorded since Stage 1.
- Credential shredded before the gate; the gate's failure path was written to need no credential (behavioural probes + HTTPS matrix), so no re-staging is required unless a credentialed re-check is wanted later.
- `thinx-staging` not pushed (operator timing; 31-03 precedent). Local lead over `origin/thinx-staging` = 12 commits (all Phase 32) at the time of this SUMMARY; the CI mirror gate passes locally.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed. **Impact:** none; the ordered revert was documented and never needed.

### Notes (recorded nuances, not deviations)

- Both repos carry pre-existing dirty submodule pointers that predate Phase 32 (` M services/worker` here, ` M landing` in thinx-swarm). Recorded in the matrix "working trees" row, left untouched.
- The dashboard API omits `ruleSyntax` under the v3 default (`omitempty`): "no override" reads as the field absent (`syn=-`) on all 30 routers; override removal is proven on the `docker service inspect` labels (0 lines), as 32-01/32-02 anticipated.
- The runbook e-mail regex has exactly 1 hit, the pre-existing Phase 31 placeholder `rollback-dryrun@example.invalid`; D.post.yml and README have 0.
- micro lists two `RepoDigests` for `traefik:v3.7.14` but the image id `5a93040e…` is unchanged since Phase 31 (recorded as a comment in D.post.yml).
- The Stage 2 restart window was ~15 s (old-task drain), as 32-02 recorded; the hand-off text and the revert step (b) say "~15 s" where the plan's gate text said "~4 s".

## Issues Encountered

- None blocking. The pre-existing `igraczech.unitednewschannel.net` DNS failure (curl `000`) and the external fotostim-stack ACME renewal error (`checkout.qooldata.com`, 400 authorization, logged at the Stage 2 start) remain as recorded in 32-01/32-02 and `deferred-items.md`; neither is a Phase 32 effect and neither changed at the end state.
- Human-gate wait: Task 1 closed at ~15:19Z; the plan paused at the `blocking-human` checkpoint until the operator's "approved". The wait is included in the 22 min duration.

## User Setup Required

None new. `32-USER-SETUP.md` (status Complete since 32-01) covered the single operator item, the D-12 credential; its lifecycle is now closed — the file was shredded on micro at 15:16:48Z, so the USER-SETUP verification command now returns `No such file`, which is the expected end state. Re-stage it only if a credentialed dashboard re-check is wanted in Phase 33.

## Known Stubs

None — no application code; the runbook Phase 32 section is complete (no placeholders remain).

## Threat Flags

None — no new network endpoint, auth path, file access pattern or schema change. This plan read the live edge and shredded one credential file; T-32-09 (`:7442`/`:1883` DoS) mitigated by the OPEN x3 + harness PASS x2 evidence, T-32-10 (secret disclosure) by the 0-marker/0-e-mail gates on every committed file, T-32-12 (silent WS breakage) by the operator's browser gate. Dashboard protection, TLS, ACME, `exposedbydefault` and log level untouched (P33/P34).

## Next Phase Readiness

- **Phase 32 complete** (3/3 plans; EDGE-MIG-03 converted-and-removed; EDGE-MIG-04 re-verified). Live end state at hand-off: `traefik_traefik` `traefik:v3.7.14 args=16 idx=38379738`, task `yudql1hqdnd9` (Running since 14:48:26Z), 30/30 routers enabled, `ruleSyntax` absent everywhere, bare-IP `301`/`200`, WS `401` x2, serials unchanged, `acme.json` `301121 1791470908 600 root`, `:7442`/`:1883`/`:8883` OPEN and direct-published.
- **Push pending:** the 12 Phase 32 commits (32-01, 32-02, 32-03 Task 1) plus this plan's close-out commits are local on `thinx-staging`; the operator pushes when ready (every push rolls `thinx_api` via Swarmpit, ~6 min). `check-traefik-mirror.js` passes locally, so the CI mirror gate will pass.
- **Revert source retained:** `micro:/mnt/data/edge-rollback/traefik-p32-prestage2-20261008T144309Z.json` (600 root, 17-flag Args). The ordered revert in the runbook hand-off (overrides first, then `--args`) remains valid; after it the edge is at the Stage 1 end state, not the Phase 31 start state.
- **Inherited by Phases 33/34** (not touched here, per the plan's prohibitions): dead Traefik v1 labels (`traefik.frontend.headers.STSPreload`/`STSSeconds` on console/vue, `traefik.backend.*.noexpose` on transformer/worker) and the missing `security-headers@swarm` on `thinx-vue-console-https` (31-REVIEW IN-05); the pre-existing `registry.thinx.cloud` 400 and the `checkout.qooldata.com` ACME renewal retry (P33 inventory); the D-06 note that hostless / bare-IP requests are now answered by the downtime/error pages; the dashboard credential must be re-staged for any credentialed `/api/http/routers` readback.
- Swarmpit may autoredeploy `thinx_api` / `downtime_downtime` / `errorpage_errorpage` independently (seen 14:15:41Z today); compare task ids, not ages.

## Self-Check: PASSED

- Files: `.planning/runbooks/swarm-configs/traefik-edge.D.post.yml` FOUND (197 lines, committed in `cb55fec6`); `.planning/runbooks/swarm-configs/README.md` D-step bullet FOUND; runbook headings FOUND (`### Re-verify matrix (Phase 32, 2026-10-08 15:12-15:14 UTC)`, `### Live production state at hand-off (Phase 32`); `C.post.yml` / `D.pre.yml` unchanged
- Commits reachable from HEAD: `cb55fec6` — `git rev-list --count 03f9dc38..cb55fec6` = 1 = `actuals.commits`
- Secret-marker grep (apr1 / bcrypt / PEM-block markers) -> 0 on this SUMMARY, D.post.yml and README; e-mail regex -> 0 on D.post.yml and README
- Task 1 V1-V12 PASS as written (15:12-15:19Z); Task 2 approved by the operator; working tree at close-out: only the pre-existing ` M services/worker`

---
*Phase: 32-v3-native-syntax-bc-removal*
*Completed: 2026-10-08*
