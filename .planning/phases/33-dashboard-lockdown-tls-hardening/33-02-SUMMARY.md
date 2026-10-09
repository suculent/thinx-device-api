---
phase: 33-dashboard-lockdown-tls-hardening
plan: 02
subsystem: infra
tags: [traefik, edge, tls, ciphers, hsts, acme, tls-alpn, file-provider, swarm-config, runbook]

# Dependency graph
requires:
  - phase: 33-dashboard-lockdown-tls-hardening (plan 01)
    provides: 17-flag loopback-governed edge (mgmt entrypoint, exposedbydefault=false), routers_post_A2 29-name baseline, gate quartet, repo-first + 600-root backup mechanics, traefik-edge.E.pre.yml served serials
  - phase: 32-v3-native-syntax-bc-removal
    provides: traefik:v3.7.14 native-v3 static command, mirror generator/checker, auto-revert mechanics, the checkout.qooldata.com deferred item
  - phase: 31-v2-v3-upgrade-backward-compat-mode
    provides: device-flow harness, direct-publish :7442/:1883/:8883 model, acme.json snapshot shape
provides:
  - Stage C live: AEAD-only `default` TLS option (TLS 1.2 min, six ECDHE AEAD suites, X25519 + P-256, sniStrict false) loaded through `--providers.file.filename=/traefik/tls.toml` from the immutable swarm config `tls-config-2` (18 flags) — CBC and TLS 1.1 refused on the wire, TLS 1.3 preferred (EDGE-TLS-01)
  - Stage D live: `security-headers@swarm` as the `https` entrypoint default middleware (19 flags) — HSTS `max-age=31536000; includeSubDomains; preload` exactly once on all 17 edge hosts, 101 WebSocket upgrade untouched, redundant per-router refs removed repo-first + label-only (EDGE-TLS-02)
  - Stage E live: ACME proven end to end — real e-mail (0 example.com), TLS-ALPN + storage unchanged, acme.json 600 root at 23 entries (dead checkout.qooldata.com pruned, influx.thinx.cloud reissued via TLS-ALPN with a new serial), stale 2023 key files removed from the volume and preserved in a 700/600-root out-of-git snapshot (EDGE-TLS-03)
  - thinx-swarm `94da01c` / `1578d2f` / `c03c529` (origin + micro), mirror at 19 flags, docker-swarm.yml == thinx.yml traefik labels, Stage C/D/E records in traefik-edge-hardening.md, Phase 32 checkout.qooldata.com deferred item resolved
affects: [33-03 (scan `## After`, E.post.yml with acme_json 24 -> 23 + influx serial NEW, tls-config-1 removal, D-31 human gate), phase-34 (D-20 redirect gaps, X25519MLKEM768 curve note, no-SNI default cert)]

# Actuals (#2632) — same estimateTokens scale as the plan's estimate (chars/4 over the realized diff)
actuals:
  tokens: 12063
  tasks: 3
  commits: 6
plan_head_before: 92382890a684a1f2a93f308a31e1f9da0bcd11a3
plan_head_after: ccb68f4ce52fb50b49dc0002f6a627f7db9052b7

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TLS options live in a git-tracked tls.toml mounted as an IMMUTABLE swarm config (tls-config-N); changing them = bump N, `docker config create` FROM micro's fast-forwarded checkout, hash-compare against the committed file, then ONE `docker service update --args … --config-rm/--config-add` (one restart, never a hot reload)"
    - "Entrypoint-level default middleware (`--entrypoints.https.http.middlewares=…`) instead of per-router refs — every present and future HTTPS router gets the header set; 1xx responses bypass the headers middleware so WebSocket 101s are untouched"
    - "acme.json surgery under a running Traefik: 700/600-root snapshot of every store file first, jq into a temp copy, `jq -e` count assertion, chmod 600 + atomic mv, `--force` restart in the SAME remote command (sub-second gap); proof = new served serial + store count, never log lines (ERROR level)"
    - "Verification evidence as counts/serials only — the ACME e-mail is a `grep -c example.com` → 0, hashes/keys/addresses never written"

key-files:
  created: []
  modified:
    - docker-swarm.yml
    - docker-compose.traefik.yml
    - .planning/runbooks/traefik-edge-hardening.md
    - .planning/phases/32-v3-native-syntax-bc-removal/deferred-items.md
    - .planning/phases/33-dashboard-lockdown-tls-hardening/deferred-items.md
    - ~/Repositories/thinx-swarm/traefik/tls.toml
    - ~/Repositories/thinx-swarm/traefik.yml
    - ~/Repositories/thinx-swarm/thinx.yml

key-decisions:
  - "33-02: curvePreferences SET to [X25519, CurveP256] (explicit, scannable policy) — this drops the Go-default X25519MLKEM768 post-quantum hybrid on TLS 1.3; recorded in the Stage C record as a Phase 34 revisit item (T-33-12 accepted)"
  - "33-02: alpnProtocols / preferServerCipherSuites / maxVersion omitted from tls.toml so `acme-tls/1` stays advertised — Stage E's forced TLS-ALPN reissue is the end-to-end proof that renewals survive Stage C"
  - "33-02: the D-18 per-router fallback is NOT needed — the WebSocket 101 carries 0 STS lines after Stage D (1xx bypass holds); the two redundant per-router security-headers refs were removed after the 17/17 gate, repo-first then label-only"
  - "33-02: D-22 renewal evidence = pre-edit acme.json mtime + served notAfter 2026-12-28 (Traefik runs at --log.level=ERROR, no renewal INFO line exists); forced reissue host = influx.thinx.cloud (stats only, 401 to anonymous), not db.thinx.cloud"
  - "33-02: D-24 verdict decided by measurement — qooldata_router_refs 0 (E.pre.yml) / 0 (live), so the pruned checkout.qooldata.com entry is not re-requested (0 obtain-failure lines); the Phase 32 deferred item is resolved with an owner-notification note"
  - "33-02: a swarm raft leader election (06:49Z, core -> micro) re-saved every service and bumped Version.Index without changing content; later `post-Stage-X` index gates compare against the index recorded right after that stage's own update"

patterns-established:
  - "Per-stage gate quartet + ports + per-task-id log scan after every live edge change, with the TLS handshake triple (1.2 ok / 1.3 ok / 1.1 refused) and the CBC-refusal probe added from Stage C on"
  - "Stage records carry the staged revert command verbatim and a `D-30 trigger evaluation:` line even when nothing fired"

requirements-completed: [EDGE-TLS-01, EDGE-TLS-02, EDGE-TLS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Stage C: tls.toml rewritten as the AEAD-only default TLS option (TLS 1.2 min, six ECDHE AEAD suites, X25519/P-256, sniStrict false, Phase 33 header with the CONFIG bump rule); traefik.yml at 18 flags with `--providers.file.filename=/traefik/tls.toml` and `tls-config-${CONFIG:-2}`; mirror MIRROR OK at 18; tls-config-2 bytes == committed file"
    requirement: EDGE-TLS-01
    verification:
      - kind: other
        ref: "33-02-PLAN.md Task 1 <automated> (tls.toml greps, traefik.yml 18 `- --` lines, mirror check, config sha via `{{json .Spec.Data}}` form)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stage C live: traefik:v3.7.14 args=18, providers [Swarm, File], Configs tls-config-2 @ /traefik/tls.toml mode 292, in-task sha == committed; on the wire rtm/app/console TLS 1.2 + 1.3 verify 0, TLS 1.1 refused, ECDHE-RSA-AES128-SHA (CBC) refused, P-384 refused; nmap TLS 1.2 set == the three ECDHE_RSA AEAD suites, TLSv1.3 on x25519, no TLSv1.0/1.1 sections; gate quartet == pre-row; 7442/1883/8883 OPEN; harness PASS over https://app.thinx.cloud and over :7442 + :1883"
    requirement: EDGE-TLS-01
    verification:
      - kind: integration
        ref: "traefik-edge-hardening.md ### Stage C record rows (1)-(12); openssl s_client triple + -cipher probe; nmap ssl-enum-ciphers; /tmp/p31-device-flow/thinx-device-flow.mjs p33c-https + p33c-7442 RESULT: PASS"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stage D live: args=19 with `--entrypoints.https.http.middlewares=security-headers@swarm`; /api/entrypoints https default chain [security-headers@swarm], http none; HSTS `max-age=31536000; includeSubDomains; preload` exactly 1 on all 17 D-27 hosts (3/17 -> 17/17); WS 101 with 0 STS lines + cookie probe 401; HTTPS matrix == pre-row; http://188.166.23.244/ 0 STS; redundant per-router refs removed in thinx.yml + docker-swarm.yml (parity diff empty) and live (task ids unchanged) with STS still exactly 1 on app/rtm/console"
    requirement: EDGE-TLS-02
    verification:
      - kind: integration
        ref: "traefik-edge-hardening.md ### Stage D record rows 08:27:0x-08:29:45; 33-02-PLAN.md Task 2 <automated> blocks"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stage E live: live Args 1 acme.email / 0 example.com / tlschallenge=true / storage unchanged / args=19; snapshot dir traefik-p33-acme-20261009T085846Z 700 root with the three files 600 root; volume holds acme.json only (600 root, 23 entries, 1 influx, 0 qooldata); influx.thinx.cloud serves Let's Encrypt serial 05806B4C8B028F41EC3ACCC00DF3C6A50B04 (≠ 05B91929242266AC45C0BD14E89A6C4F8247, notAfter 2027-01-07, -checkend 6912000 ok, 401); rtm/app serials == E.pre.yml; widened ACME log scan 0; 29/0 == routers_post_A2; one running task args=19; matrix/WS/bare-IP == pre-row; ports OPEN"
    requirement: EDGE-TLS-03
    verification:
      - kind: integration
        ref: "33-02-PLAN.md Task 3 <automated> blocks 1-6 — all PASS (run 2026-10-09 09:02-09:04Z)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Runbook records: ### Stage C record (Version.Index post-Stage-C 38379918, CBC before/after, X25519MLKEM768 note), ### Stage D record (HSTS 3/17 -> 17/17, 101-without-STS, post-D ref removal, D-19/D-20 notes, post-Stage-D 38379931), ### Stage E record (SNAP path by name, 24 -> 22 -> 23, both influx serials, `D-22 renewal evidence:` line with notAfter + 2026-09-29, `qooldata_router_refs: 0 (E.pre.yml) / 0 (live)`, post-Stage-E 38379946 == live); Phase 32 deferred item resolved (`Phase 33 Stage E`, `will not re-request`); 0 secret markers / 0 e-mails"
    requirement: EDGE-TLS-03
    verification:
      - kind: other
        ref: "33-02-PLAN.md Task 3 <automated> block 7 (re-run piece-wise, all components pass) and Task 1/2 record greps"
        status: pass
    human_judgment: false
  - id: D6
    description: "Repo == deployed at the end of the plan: thinx-swarm c03c529 == micro checkout HEAD == mirror banner; `check-traefik-mirror.js` MIRROR OK files=1 at 19 flags; docker-swarm.yml == thinx.yml traefik labels; live traefik_traefik 19 Args (sorted set == mirror)"
    requirement: EDGE-TLS-01
    verification:
      - kind: other
        ref: "git -C ~/Repositories/thinx-swarm rev-parse HEAD vs micro `git -C /mnt/gluster/deployment/swarm rev-parse HEAD` (c03c529 == c03c529); node scripts/check-traefik-mirror.js → MIRROR OK files=1; grep -c '^ *- --' docker-compose.traefik.yml → 19"
        status: pass
    human_judgment: false

# Metrics
duration: 79min
completed: 2026-10-09
status: complete
---

# Phase 33 Plan 02: TLS hardening, edge-wide HSTS and ACME renewal proof Summary

**AEAD-only TLS 1.2+/1.3 default option loaded from an immutable swarm config via the file provider (18 flags), `security-headers@swarm` promoted to the `https` entrypoint default so all 17 edge hosts send HSTS exactly once (19 flags), and ACME proven end to end by pruning the dead `checkout.qooldata.com` entry plus `influx.thinx.cloud` under a 700/600-root snapshot and watching Traefik reissue influx via TLS-ALPN within ~11 s of the forced restart — three live `docker service update`s, each gated by the D-30 quartet, no revert fired.**

## Performance

- **Duration:** 79 min wall clock (07:46Z → 09:05Z), of which ≈24 min was the blocking-human checkpoint pause before Stage E (08:30Z → 08:54Z)
- **Started:** 2026-10-09T07:46:00Z (Task 1 precondition re-read)
- **Completed:** 2026-10-09T09:05:00Z
- **Tasks:** 3 (Task 3 executed by this continuation agent; Tasks 1–2 by the previous executor)
- **Files modified:** 8 (5 in thinx-device-api, 3 in thinx-swarm) + live swarm objects

## Accomplishments

- **EDGE-TLS-01 (Stage C) live.** `~/Repositories/thinx-swarm/traefik/tls.toml` rewritten as the `default` TLS option — `minVersion = "VersionTLS12"`, `sniStrict = false`, `curvePreferences = ["X25519", "CurveP256"]`, exactly six `TLS_ECDHE_(ECDSA|RSA)_WITH_(AES_128_GCM_SHA256|AES_256_GCM_SHA384|CHACHA20_POLY1305)` suites, 0 CBC / 0 TLS 1.3 names / no ALPN, server-preference or max-version keys. `tls-config-2` was created on micro FROM the fast-forwarded checkout (decoded sha256 `bb0cba95ea22e973…` == committed) after a DEBUG parse probe on a throwaway container (0 `invalid CipherSuite|invalid CurveID|error`, 3 `tls.toml` lines), then ONE update applied `--providers.file.filename=/traefik/tls.toml` together with `--config-rm tls-config-1 --config-add source=tls-config-2,…` (fire 08:17:18.6Z → task `5agre1dyzrot` Running 08:17:35.5Z). On the wire rtm/app/console negotiate TLS 1.2 and 1.3 (verify 0), refuse TLS 1.1, **refuse `ECDHE-RSA-AES128-SHA` (CBC) — accepted before the stage** — and refuse P-384; nmap sees exactly the three ECDHE_RSA AEAD suites on TLS 1.2, `TLSv1.3` on `ecdh_x25519`, `least strength: A`. Harness `RESULT: PASS` over `https://app.thinx.cloud` (the device path under the new options, D-15) and over `http://rtm.thinx.cloud:7442` + `mqtt://thinx.cloud:1883`.
- **EDGE-TLS-02 (Stage D) live.** `--entrypoints.https.http.middlewares=security-headers@swarm` (fire 08:26:21.7Z → task `36ssa5zcgpv0` Running 08:26:38.4Z); `/api/entrypoints` shows the `https` default chain `["security-headers@swarm"]` and `http` none; exact-directive `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` **exactly once on all 17 D-27 hosts (3/17 → 17/17)** including registry's 400, the db/influx 401s, the three external stacks and micro's catch-all; the cookie-less WebSocket upgrade still answers `HTTP/1.1 101 Switching Protocols` with **0** STS lines (1xx bypass — D-18 fallback not needed), the cookie probe `401` + `X-Forwarded-Proto: https`; plain HTTP on the bare IP carries 0 STS (D-20). The two redundant per-router refs (`thinx-api-https` → `sslheaders@swarm`, `thinx-console-https` line removed) were then dropped repo-first (thinx.yml + docker-swarm.yml, parity diff empty) and label-only live (task ids unchanged), HSTS still exactly 1 on app/rtm/console. D-19: directive unchanged, one-year max-age documented, thinx.cloud NOT submitted to the preload list.
- **EDGE-TLS-03 (Stage E) live.** Live Args: `acme.email=` 1, `example.com` 0 (real operator address — value never written), `tlschallenge=true` 1, `acme.storage=/certificates/acme.json` 1. Snapshot `/mnt/data/edge-rollback/traefik-p33-acme-20261009T085846Z/` (700 root; `acme.json` 301121 / `_acme.json` 177391 / `__acme.json` 202409, all 600 root, `cmp`-identical) → the two April-2023 key files deleted from the live volume (D-23) → ONE remote command: `jq del(checkout.qooldata.com, influx.thinx.cloud)` into `acme.json.new`, `jq -e length == 22`, 0 pruned names left, `chmod 600`, atomic `mv`, `docker service update --detach --force traefik_traefik` 0.6 s later (fire 09:00:26.0Z → task `k47479ipt1mb` Running ≈09:00:31Z). First laptop sample at 09:00:37Z already showed the NEW Let's Encrypt certificate: serial `05B91929242266AC45C0BD14E89A6C4F8247` → **`05806B4C8B028F41EC3ACCC00DF3C6A50B04`** (issuer YR1, notAfter 2027-01-07 = +90 d, `-checkend 6912000` ok) — TLS-ALPN through the swarm ingress works on the hardened edge (T-33-08 falsified). Store **24 → 22 → 23**, `291145 600 root`, influx 1 / qooldata 0; widened ACME log scan (`Error renewing ACME|Unable to obtain ACME certificate|Unable to generate a certificate`) on the new task **0** — the start-time `checkout.qooldata.com` renewal error is gone for the first time since the v3 cutover; rtm `0535CC…67B0` / app `051152…2809` serials == E.pre.yml, console unchanged.
- **D-22 / D-24 evidence recorded, not asserted:** `D-22 renewal evidence: acme.json pre-edit mtime 2026-10-09 08:26:37.434917336 +0000; served notAfter rtm/app/console = Dec 28 2026 (renewal pass 2026-09-29)` and `qooldata_router_refs: 0 (E.pre.yml) / 0 (live)` — the Phase 32 deferred item is resolved as "pruned, will not re-request, stack owner to be notified".
- **Every stage under the D-30 quartet, no trigger fired:** status filter `29/0` and sorted names == `routers_post_A2:` after C, D and E; HTTPS matrix 17/17 == pre-row each time; WS 101/401; bare-IP 301/200; `7442 OPEN 1883 OPEN 8883 OPEN` after every restart (AGENTS.md keep-7442); the staged reverts (pre-C 17 flags + config swap back, pre-D 18 flags, snapshot restore + `--force`) were never executed. `Version.Index post-Stage-C: 38379918`, `post-Stage-D: 38379931`, `post-Stage-E: 38379946` — each == live at record time.
- **Repo == deployed:** thinx-swarm `94da01c` → `1578d2f` → `c03c529` on origin/master and on micro (`/mnt/gluster/deployment/swarm` ff-merged each time, dirty=0); mirror regenerated three times (18, 19, 19 flags), `MIRROR OK files=1`; `docker-swarm.yml` == `thinx.yml` traefik labels; 0 secret markers / 0 e-mail addresses in every committed file.

## Task Commits

Each task was committed atomically (thinx-device-api on `thinx-staging`, not pushed; thinx-swarm on `master`, pushed to origin and fast-forwarded on micro):

1. **Task 1: Stage C — AEAD-only default TLS options via the file provider + tls-config-2 (18 flags)**
   - thinx-swarm `94da01c` feat(edge): Phase 33 Stage C — AEAD-only default TLS options via the file provider, tls-config-2 (EDGE-TLS-01 D-13..D-16)
   - `b99210f8` feat(33): Stage C — mirror regenerated at 18 flags
   - `77035a77` docs(33): Stage C record
2. **Task 2: Stage D — security-headers@swarm as the https entrypoint default (19 flags), per-router refs removed**
   - thinx-swarm `1578d2f` feat(edge): Phase 33 Stage D — security-headers@swarm as the https entrypoint default middleware (EDGE-TLS-02 D-17)
   - `525a63fb` feat(33): Stage D — mirror regenerated at 19 flags
   - thinx-swarm `c03c529` chore(edge): Phase 33 post-D — drop redundant per-router security-headers refs (D-17)
   - `4fccd9bc` chore(33): post-D — redundant per-router security-headers refs dropped in docker-swarm.yml; mirror regenerated
   - `9734cc27` docs(33): Stage D record
3. **Task 3: Stage E — ACME evidence and renewal proof**
   - `ccb68f4c` docs(33): Stage E ACME record; deferred checkout.qooldata.com item resolved

**Plan metadata:** the final docs commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS). Measured: `git rev-list --count 92382890..ccb68f4c` = 6 thinx-device-api commits; 3 thinx-swarm commits (`efee92c..c03c529`).

## Files Created/Modified

- `~/Repositories/thinx-swarm/traefik/tls.toml` — full rewrite: 7-line Phase 33 header (CONFIG bump rule, `default` applies to every TLS router, TLS 1.3 suites fixed by Go, alpnProtocols left default for `acme-tls/1`, preferServerCipherSuites omitted), `[tls.options.default]` with minVersion / sniStrict / curvePreferences / six AEAD cipherSuites.
- `~/Repositories/thinx-swarm/traefik.yml` — `configs:` `name: tls-config-${CONFIG:-2}` + immutability comment; `--providers.file.filename=/traefik/tls.toml` after the tlschallenge line (Stage C, 18 flags); `--entrypoints.https.http.middlewares=security-headers@swarm` after `--entrypoints.https.address=:443` (Stage D, 19 flags).
- `~/Repositories/thinx-swarm/thinx.yml` + `docker-swarm.yml` — post-D: `thinx-api-https.middlewares=sslheaders@swarm`, `thinx-console-https.middlewares` line removed, D-17 comments.
- `docker-compose.traefik.yml` — regenerated after each thinx-swarm commit; final banner `c03c529`, 19 flags, MIRROR OK.
- `.planning/runbooks/traefik-edge-hardening.md` — `### Stage C record`, `### Stage D record`, `### Stage E record` (each with the staged revert, the gate table, `D-30 trigger evaluation: none fired`, `Version.Index post-Stage-X`).
- `.planning/phases/32-v3-native-syntax-bc-removal/deferred-items.md` — checkout.qooldata.com item `status: resolved` with the evidence-chosen note.
- `.planning/phases/33-dashboard-lockdown-tls-hardening/deferred-items.md` — second item: the three Task 1 verify literals that cannot pass as written against v3.7.14 / Docker 29 (for the verifier).
- Live (not files): docker config `tls-config-2` (new; `tls-config-1` left unreferenced for Plan 03); `traefik_traefik` Args 17 → 18 → 19, config mount swapped, one `--force` restart, `Version.Index 38379808 → 38379918 → 38379931 → 38379946`; thinx_api / thinx_console labels; acme.json 24 → 23, `_acme.json` / `__acme.json` gone; influx.thinx.cloud reissued. `micro:/mnt/data/edge-rollback/traefik-p33-preC-20261009T081658Z.json`, `traefik-p33-preD-20261009T082554Z.json` (600 root) and `traefik-p33-acme-20261009T085846Z/` (700 root, three files 600 root) — never committed.

## Decisions Made

- Research amendments applied as planned: file provider rides in Stage C with `tls-config-2` (config swap + one restart); end state 19 flags; D-18 fallback not needed; redundant per-router refs removed after the 17/17 gate.
- `curvePreferences` SET (X25519, P-256) — explicit scannable policy; the Go-default X25519MLKEM768 hybrid is no longer offered (recorded for Phase 34, T-33-12 accepted). `alpnProtocols` / `preferServerCipherSuites` / `maxVersion` omitted.
- D-22 forced-reissue host = `influx.thinx.cloud` (stats, 401 to anonymous) rather than `db.thinx.cloud` (primary datastore); the renewal citation is the pre-edit store mtime + served notAfter because Traefik logs at ERROR.
- D-24 verdict chosen by the measured `qooldata_router_refs` 0/0 — "will not re-request"; owner notification carried in the deferred item.
- Version.Index drift from the 06:49Z leader election treated as met in substance (content unchanged); later index gates compare against the per-stage recorded index.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 precondition `Version.Index == post-Stage-B` did not hold (38379808 vs recorded 38379801)**
- **Found during:** Task 1 (Stage C precondition re-read, 07:46Z)
- **Issue:** At 06:49:03Z the swarm raft leader moved from `core` to `micro` (unattended-upgrades on `core`); the new leader re-saved all 21 services with Docker default fields filled in, bumping every Version.Index. `Spec` vs `PreviousSpec` on `traefik_traefik` differed only by those defaults; Args, labels, configs, image and the running task were the Stage B end state.
- **Fix:** Investigated read-only (`docker events`, `journalctl -u docker`, spec diff), treated the precondition as met in substance, recorded the cause in the Stage C record and established that later `post-Stage-X` gates compare against each stage's own recorded index.
- **Files modified:** `.planning/runbooks/traefik-edge-hardening.md` (Stage C record)
- **Verification:** all other precondition facts matched exactly; the C/D/E index gates afterwards equal live.
- **Committed in:** `77035a77`

**2. [Rule 3 - Blocking] Three Task 1 verify literals cannot pass against Traefik v3.7.14 / Docker 29 as written — substitute proofs used**
- **Found during:** Task 1 (Stage C gate)
- **Issue:** (a) `docker config inspect --format '{{.Spec.Data}}' | base64 -d` — Go prints the `[]byte` as decimal numbers; (b) `/api/rawdata | jq -e '.tls.options…'` — the v3.7.14 API does not expose TLS options (`rawdata` keys are middlewares/routers/services; `/api/tls*` → 404); (c) the parse probe's `grep -ci 'tls.toml' >= 1` holds only at `--log.level=DEBUG`.
- **Fix:** (a) `--format '{{json .Spec.Data}}' | tr -d '"' | base64 -d | sha256sum` (matched the committed file); (b) the default option proven on the wire (CBC + P-384 refused, nmap set == the three RSA AEAD suites, TLS 1.3 on x25519), by the in-task config sha and by the DEBUG probe's `Configuration received` TLS block; (c) probe re-run at DEBUG. All recorded in the Stage C record and in Phase 33 `deferred-items.md` for the verifier.
- **Files modified:** `.planning/runbooks/traefik-edge-hardening.md`, `.planning/phases/33-dashboard-lockdown-tls-hardening/deferred-items.md`
- **Verification:** the substitute checks pass; no live regression.
- **Committed in:** `77035a77`

---

**Total deviations:** 2 auto-fixed (2 blocking — one environmental index drift, one verification-method substitution). No scope change; no live state differs from the plan's must-haves.
**Impact on plan:** none on the delivered security properties; both are documented for the verifier.

## Issues Encountered

- **Checkpoint (human-action, blocking-human) before Stage E:** the auto-mode permission classifier denied the remote command that deletes the two 2023 key files and edits the live `acme.json`; nothing executed, the store was untouched. The operator chose "option 2" — added a Phase 33 allow entry to `.claude/settings.local.json` covering the Stage E snapshot, stale-file deletion, `jq` prune via `acme.json.new` + chmod + mv, and `docker service update --detach --force traefik_traefik` — and the plan resumed at Task 3 step 1. Stage E was then executed exactly as the plan writes it (no command was split or rephrased). Pause 08:30Z → 08:54Z.
- **`docker service logs` without `--tail` over 24 h hung the first Task 3 ssh probe** (moved to background by the tool); all later log scans use `--since 10m/30m` under `timeout 90` and completed in seconds. The 24-hour baseline count was not needed — the per-task-id scan since the restart is the gate.
- **Verify-literal quirks (Plan 01 carry-over, recorded):** the laptop `grep` is a ugrep-wrapping shell function; Task 3's verify blocks were run with `grep` pinned to `/usr/bin/grep`. Block 7 reported `rc=2` once under my `eval` wrapper (shell quoting of `\$apr1\$`), and passed component-by-component when run directly.
- **Reissue speed:** the plan expected the default certificate first and the LE certificate within ~60 s; the first laptop sample 11 s after the fire already served the new certificate (TLS-ALPN obtain completed during the start-up window). Recorded as observed.
- `services/worker` gitlink was already modified in the working tree before this plan and was never staged.

## Authentication Gates

None — ssh to micro and both git remotes worked without prompts.

## User Setup Required

None - no external service configuration required. (Operator follow-up, not setup: notify the fotostim stack owner that `checkout.qooldata.com` / `checkout.fotostim.com` / `checkout.fotostim.cz` are no longer certificate-managed by this edge — carried in the Phase 32 deferred item.)

## Next Phase Readiness

- Plan 33-03 starts from: live `traefik:v3.7.14 args=19 idx=38379946`, task `k47479ipt1mb`, providers `["Swarm","File"]`, `tls-config-2` mounted, `https` default middleware `security-headers@swarm`, acme.json 23 entries 600 root, influx serial `05806B4C8B028F41EC3ACCC00DF3C6A50B04`, rtm/app serials unchanged, `routers_post_A2:` 29/0, thinx-swarm `c03c529` == micro HEAD == origin/master, mirror `4fccd9bc` MIRROR OK at 19 flags.
- Plan 33-03 to do: `traefik-edge.E.post.yml` (`acme_json:` 24 → 23, `re_challenges_in_phase: 1`, influx serial NEW), `scripts/traefik-edge-scan.sh` `## After` (expect EDGE-SCAN OK; report the dropped X25519MLKEM768 and the D-20 redirect gaps as non-gating), `docker config rm tls-config-1`, AGENTS.md / thinx-swarm README operator sections, the single D-31 human gate.
- Requirements EDGE-TLS-01/02/03 are also declared by Plan 33-03, so REQUIREMENTS.md marks them complete only when 33-03's SUMMARY exists (shared-ID gate).
- Not pushed by this plan (by design): `thinx-staging` of thinx-device-api. thinx-swarm commits ARE on origin/master and on micro.
- Phase 34 items recorded: D-20 (`thinx-api-http` no https-redirect, `registry-http` no middleware), curve policy revisit (restore X25519MLKEM768 by omitting `curvePreferences`), no-SNI default certificate subject.

---
*Phase: 33-dashboard-lockdown-tls-hardening*
*Completed: 2026-10-09*

## Self-Check: PASSED

- Modified files exist on disk (5 in thinx-device-api, 3 in thinx-swarm) — FOUND.
- Commits `b99210f8`, `77035a77`, `525a63fb`, `4fccd9bc`, `9734cc27`, `ccb68f4c` are ancestors of HEAD on `thinx-staging` (`git rev-list --count 92382890..ccb68f4c` = 6); thinx-swarm `94da01c`, `1578d2f`, `c03c529` are ancestors of `master` (== origin/master == micro).
- 0 secret markers / 0 e-mail addresses in this SUMMARY.
