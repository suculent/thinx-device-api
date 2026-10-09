---
phase: 33-dashboard-lockdown-tls-hardening
verified: 2026-10-09T10:54:02Z
status: passed
score: 23/23 must-haves verified
covered_files:
  - ".planning/phases/32-v3-native-syntax-bc-removal/deferred-items.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-01-PLAN.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-01-SUMMARY.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-02-PLAN.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-02-SUMMARY.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-03-PLAN.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-03-SUMMARY.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-REVIEW-DISPOSITION.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-REVIEW-FIX.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/33-REVIEW.md"
  - ".planning/phases/33-dashboard-lockdown-tls-hardening/deferred-items.md"
  - ".planning/runbooks/swarm-configs/README.md"
  - ".planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md"
  - ".planning/runbooks/swarm-configs/traefik-edge.E.post.yml"
  - ".planning/runbooks/swarm-configs/traefik-edge.E.pre.yml"
  - ".planning/runbooks/traefik-edge-fixforward.md"
  - ".planning/runbooks/traefik-edge-hardening.md"
  - "AGENTS.md"
  - "docker-compose.traefik.yml"
  - "docker-swarm.yml"
  - "scripts/check-traefik-mirror.js"
  - "scripts/generate-traefik-mirror.js"
  - "scripts/traefik-edge-scan.sh"
covered_digest: "v3:sha256:48b496adff2c2571c0e50ca23f4bd6e2745ad3e0f6bd34dbf0cfd2b3beebdf09"
sibling_repo: "thinx-swarm master b04f066dee01661e10a52153f16a7cc111855551 (== origin/master == micro /mnt/gluster/deployment/swarm HEAD, 0 tracked modifications on micro); phase commits 158f369..e29f19d (8) + review-fix d156e79 (WR-01) and b04f066 (WR-05)"
behavior_unverified: 0
overrides_applied: 0
prohibitions_total: 18
prohibitions_resolved: 14
prohibitions_flagged: 4 # judgment-tier, historical/process statements with no deterministic end-state evidence. NON-AUTHORITATIVE LLM-judge verdict "consistent with the records"; unverified-prohibition, human review recommended (see human_verification item 1)
re_verification:
  previous_status: human_needed
  previous_score: 23/23
  reason: "stale fingerprint: code-review fixes landed after the 10:40:11Z report (thinx-device-api 0d93e119 CR-01, f3e5905d WR-01 mirror, 33469869 Phase 34 record, 935689ee review-fix report; thinx-swarm d156e79 WR-01, b04f066 WR-05)"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  rechecked_truths: [4, 6, 8, 10, 11, 13, 15, 21]
observations:
  - finding: "MQTTS :8883 is refused from the internet (laptop `nc -z` CLOSED again at 10:5x UTC 2026-10-09) while plain MQTT :1883 and plaintext :7442 are OPEN; thinx_mosquitto still publishes 8883->8883/ingress unchanged"
    category: other
    scope: "pre-existing, recorded identically by 32-VERIFICATION.md (2026-10-08T16:15Z, before Phase 33 started); no Phase 33 change or review fix touched mosquitto ports; the ROADMAP criterion names only plaintext :7442, which is OPEN and answers HTTP 200"
    recommended: "Phase 34: probe :7442/:1883/:8883 against the public IP (not 127.0.0.1) in the gate quartet; inspect the mosquitto TLS listener (services/broker/config/mosquitto.conf `listener 8883`, cert/key under /mqtt/ssl/) and the ingress path on core. See human_verification item 2"
  - finding: "Untracked `traefik.yml.bak.20261007120354.pre-p30-pilot` in micro's deploy checkout still carries one `--pilot.token=` line (count per 33-REVIEW-FIX; value never read)"
    category: security
    scope: "not in git and not a Phase 33 artefact; the four tracked copies are gone (`git ls-files | grep traefik.yml.bak` = 0 on micro and the laptop, `git grep -- --pilot.token=` at HEAD = 0 files); recorded under `## Recorded for Phase 34` (WR-01 follow-up)"
    recommended: "Operator moves it to /mnt/data/edge-rollback/ (600 root) or deletes it (Phase 34 item)"
human_verification:
  - test: "Confirm the four process prohibitions that only the operator who watched the execution can attest (the end state is consistent with all four, but it cannot prove the history): (a) no `docker stack deploy` / `restart.sh` was used for any edge change in Phase 33; (b) downtime_downtime / errorpage_errorpage never carried `traefik.docker.network` and `traefik.swarm.network` at the same time (one `--label-rm … --label-add …` update each); (c) `--providers.file.filename` was never live while `tls-config-1` was the mounted file (Stage C was ONE update with `--config-rm tls-config-1 --config-add tls-config-2`); (d) no dashboard credential file was pre-staged or created on micro"
    expected: "Operator answers yes to all four (the runbook Stage A/D-08/C records and the Version.Index chain 38379738 -> 38379946 with live idx 38379946, unchanged through the review-fix pass, agree; thinx-staging is still ahead of origin and never pushed, so the push-during-label-update prohibition is already deterministic)"
    why_human: "Judgment-tier prohibitions about past actions; the verifier can read only the end state and the records written by the executor"
  - test: "Decide what to do about MQTTS :8883 being refused from the internet while plain MQTT :1883 and plaintext :7442 are open: either accept (plain MQTT is the operator-required path, AGENTS.md 2026-10-04) and carry the fix to Phase 34, or treat as an incident. Reproduce from the laptop: `nmap -Pn -p 1883,8883 188.166.23.244` (1883 open, 8883 closed) and `openssl s_client -connect thinx.cloud:8883` (Connection refused)"
    expected: "Operator decision recorded; recommended Phase 34 items: external (public-IP) port probes in the gate quartet, mosquitto TLS listener / cert mount check on core"
    why_human: "Pre-existing production condition outside the Phase 33 change set (observed already by 32-VERIFICATION); whether it is acceptable is an operator decision, not a Phase 33 gap"
---

# Phase 33: Dashboard Lockdown & TLS Hardening Verification Report

**Phase Goal:** Close the dashboard/API surface and enforce modern TLS on the v3 edge.
**Verified:** 2026-10-09T10:54:02Z (live edge re-read 10:50–10:54 UTC; thinx-staging HEAD `935689ee`, thinx-swarm HEAD `b04f066`)
**Status:** human_needed. Every must-have is VERIFIED and there are no gaps. Two items are still open for the operator, carried unchanged from the previous report: the 4 judgment-tier process prohibitions, and the pre-existing MQTTS `:8883` observation.
**Re-verification:** Yes. The previous report (2026-10-09T10:40:11Z, `human_needed`, 23/23) went stale when the code-review fixes landed after it was written.
**Mode:** standard (ROADMAP `mode: null`)

## What this re-verification covered

The baseline is the previous report. Truths whose evidence was not touched by the review-fix commits are carried forward, and each was regression-checked against the live edge and the repositories. Every truth that depends on a changed file was re-checked with fresh evidence:

| Changed input | Commit | Truths re-checked | Fresh evidence |
| ------------- | ------ | ----------------- | -------------- |
| `scripts/traefik-edge-scan.sh` (CR-01 fail-closed) | `0d93e119` | 4, 13 | 33-01 Task 1 static verify literal run with `/usr/bin/grep`: PASS. `bash -n`: OK. The set of predicate and verdict strings is a strict superset of the pre-fix one (0 removed; added `tool-missing`, `port-sweep-error`, `port-sweep-missing`, `EDGE-SCAN PREFLIGHT`). The `HOSTS=` line hashes the same before and after. `set -e` count is 0 and `set -u` count is 1. **One live run: `EDGE-SCAN OK`, exit 0, 0 `FAIL ` lines** (10:51:53Z–10:53:43Z, `/tmp/p33-reverify-scan.txt`). |
| `docker-compose.traefik.yml` (mirror banner) | `f3e5905d` | 6, 8, 21 | `node scripts/check-traefik-mirror.js` → `MIRROR OK files=1` (integrity mode and `--swarm-repo` freshness mode). 19 `- --` flags, 0 `basicauth`. Banner `thinx-swarm@b04f066dee01661e10a52153f16a7cc111855551`. The commit diff is the banner line only. |
| thinx-swarm `README.md`, 4× `traefik.yml.bak.*` removed | `d156e79` | 8, 21, P6 | Laptop HEAD == origin/master == micro HEAD == `b04f066`. micro has 0 tracked modifications. Tracked `traefik.yml.bak*` = 0 on the laptop and on micro. `git grep -- --pilot.token=` at HEAD = 0 files. README trailing-slash `/dashboard/` text intact (lines 60, 65). `traefik.yml`/`tls.toml`/`traefik.sh`/`thinx.yml` unchanged `e29f19d..b04f066` (`git diff --stat` empty). `traefik.yml` 19 flags. |
| thinx-swarm `vault.yml` (WR-05) | `b04f066` | 10 | `traefik.swarm.network=traefik-public` still present (line 41; 0 `traefik.docker.*`). `ports:` absent (YAML parse: `{'vault': False}`). `vault-http.middlewares=https-redirect` added. NOT-DEPLOYED header. |
| runbook `## Recorded for Phase 34` (WR-02/03/04/05/WR-01 follow-up) | `33469869` | 21 | Additive only: +32 / −0 lines. `### Human gate result (33-03 Task 3, D-31)` intact at line 852, followed by `## Recorded for Phase 34` at 856. |
| Live edge (no fix touched it) | — | 1, 2, 3, 5, 11, 12, 14, 17, 22 | Read-only re-read gave identical values; see Behavioral Spot-Checks. |

Secret-marker greps (apr1 hash, bcrypt hash, PEM armour header, private-key marker; the 33-01 plan regex) and e-mail-address greps return 0 on every touched artefact: scan script, mirror, runbook, E.post.yml, the scan capture, the three review files, and thinx-swarm README/vault.yml/traefik.yml/traefik.sh/tls.toml. The one exception is AGENTS.md, whose single hit is the pre-existing GitHub ssh clone URL at line 245 (user-at-host form, not a mailbox). No hash, key, token, `acme.json` content or e-mail address was printed or written. Live Args were counted (`acme.email=` present 1, `example.com` 0) and never printed in full.

## Goal Achievement

### Observable Truths

ROADMAP success criteria (rows 1–4) are the contract. Rows 5–23 are the merged PLAN frontmatter truths, deduplicated, including the research amendments and discretion resolutions. **R** = re-checked with fresh evidence in this run. **C** = carried forward with a regression check.

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | **SC1** Port 8080 not externally reachable, `--api.insecure` disabled, dashboard off in prod / `api@internal` only on a non-public path | ✓ VERIFIED (C) | Re-read 10:5x UTC: live Args 19, `--api` + `--entrypoints.mgmt.address=127.0.0.1:8080`, `api.insecure` 0, no `--providers.docker`. Traefik publishes `80->80/ingress 443->443/ingress` only. In-task `/proc/net/tcp` LISTEN for port 8080 = `0100007F:1F90` only (1 row). Laptop `curl :8080` rc=7. Scan: `8080/tcp closed`, `8443/tcp closed`, 0 `api-exposed` / `dashboard-open` / `dashboard-401`, `dashboard … sig=0` on all 17 hosts (micro 302). Previous evidence unchanged: overlay `nc -z traefik 8080` CLOSED with `:80` control OPEN, `traefik-mgmt@swarm` → `api@internal`. Interpretation (D-01/D-02/D-06): the dashboard is not served to production at all. |
| 2 | **SC2** HTTPS min TLS 1.2 (prefer 1.3), modern cipher set, HSTS sent, plaintext `:7442` unaffected | ✓ VERIFIED (C) | Re-read: rtm `-tls1_1` → `no protocols available`, `-tls1_2` → TLSv1.2, `-tls1_3` → TLSv1.3, `ECDHE-RSA-AES128-SHA` refused. Scan: `tls12` = exactly the three ECDHE_RSA AEAD suites on 17/17 hosts, `tls13 yes` 17/17, `legacy none` 17/17, `hsts … 1` 17/17. `http://188.166.23.244/` 0 STS lines. `http://rtm.thinx.cloud:7442/` HTTP 200. `:1883` OPEN. Publishers `thinx_api 7442->7442/ingress`, `thinx_mosquitto 1883/1884/8883` unchanged. |
| 3 | **SC3** ACME real operator e-mail (not the `example.com` placeholder), `acme.json` 600, renewal verified | ✓ VERIFIED (C) | Re-read: `acme.email=` present 1, `example.com` 0 (value never read). Previous evidence stands untouched (no fix touched the store or the live service; idx unchanged): `acme.json` `600 root`, 23 entries, `influx.thinx.cloud` reissued via TLS-ALPN (serial `05806B4C…`, notAfter 2027-01-07), 0 ACME failure lines on live task `k47479ipt1mb`. |
| 4 | **SC4** External scan confirms no open dashboard and the expected TLS posture | ✓ VERIFIED (R) | **Fresh run of the CR-01 script:** `EDGE-SCAN OK`, exit 0, 0 `FAIL ` lines, 17 host sections; `80 open 443 open 8080 closed 8443 closed`, `port 7442 rtm.thinx.cloud open`, `nosni-subject CN=TRAEFIK DEFAULT CERT`; hsts 17/17 = 1; tls12 full AEAD set 17/17 (the earlier one-host nmap flake did not recur, so no `openssl` fallback was needed); dashboard codes 404 ×14, registry 400, db/influx 401 (exempt, `sig=0`), micro 302. The script now fails closed on missing or broken tools and on curl/jq/sslscan/nmap errors, so this `OK` cannot come from a skipped predicate. The committed `## Before` (`EDGE-SCAN FAIL 32`) / `## After` (`EDGE-SCAN OK`) capture is unchanged. |
| 5 | Stage A end state: mgmt entrypoint + `traefik-mgmt` labels exact, port label kept (LOAD-BEARING), middlewares https-redirect / security-headers / error-pages stay, no admin-auth / traefik-public-http(s) label; loopback 29/0, services 18, middlewares 6, `/` → 302 `/dashboard/`, dashboard served on loopback, no credential pre-staged | ✓ VERIFIED (C) | Re-read: overview `[29,0,18,6,["Swarm","File"]]`. Routers 29, not-enabled 0. Middlewares = `couch-auth error-pages-middleware https-redirect influx-auth security-headers sslheaders` (@swarm). Same task and idx as the previous run, so the label set read there still holds. |
| 6 | Research amendments: port label KEPT; mgmt router in LABELS not the file provider; file provider deferred to Stage C; phase end state 19 flags | ✓ VERIFIED (R) | Live nargs 19. thinx-swarm `traefik.yml` 19 `- --` lines and unchanged since `e29f19d`. Mirror 19 flags, `MIRROR OK`. E.post.yml 19 (unchanged). |
| 7 | D-06: `micro.thinx.cloud/dashboard/` no longer 401; `/api/overview` never Traefik JSON and `/dashboard/` never dashboard HTML on any of 17 hosts; db/influx 401 by backend auth; 8080/8443 not open | ✓ VERIFIED (C) | Fresh scan: micro `/dashboard/` 302 `sig=0`; 0 `api-exposed` (now evaluated with captured body + jq rc, not a pipe); db/influx 401; 8080/8443 closed. |
| 8 | D-04 / D-21: compare recorded as exactly two words; `traefik.sh` has no DOMAIN/USERNAME/PASSWORD/HASHED_PASSWORD export, EMAIL demanded with `:?`; `traefik.yml` no longer references those vars | ✓ VERIFIED (R) | `traefik.sh` / `traefik.yml` unchanged `e29f19d..b04f066`. Mirror 0 `basicauth`. 0 markers / 0 e-mails on both. README now correctly separates HEAD (no credential) from history (pre-`efee92c` password and Pilot token retrievable). Rotation is a recorded Phase 34 operator item (WR-02), which is outside this truth's scope (committed files at HEAD). |
| 9 | D-07 Stage B: `exposedbydefault=false` live, sorted inventory identical to the baseline, every router enabled | ✓ VERIFIED (C) | Live arg `--providers.swarm.exposedbydefault=false`; routers 29 / not-enabled 0; idx unchanged, so the previous 29/29 name diff stands. |
| 10 | D-08 / D-09 label bundle live and in files: mosquitto 0 traefik labels with ports published; downtime/errorpage `traefik.swarm.network` only; console/vue 0 `frontend.headers`; transformer/worker 0 `noexpose`; vault.yml swarm key; WS rule `${WEB_HOSTNAME}`; docker-swarm.yml == thinx.yml labels; external stacks untouched | ✓ VERIFIED (R for vault.yml, C otherwise) | `vault.yml` after WR-05: `traefik.swarm.network=traefik-public` at line 41, 0 `traefik.docker.*`, plus `vault-http` → `https-redirect` and no host `ports:`. Stack not deployed (per review fix; no live router; not in scan HOSTS). `thinx.yml` and `docker-swarm.yml` unchanged since the previous run. mosquitto publishes `1883/1884/8883` ingress. |
| 11 | D-10 / D-30: one `--args` update per static stage from a 600-root backup, label-only changes task-id-stable, gate quartet after every change, auto-revert on trigger | ✓ VERIFIED (R) | Live `idx=38379946 upd=completed` == recorded post-Stage-E, so the review-fix pass made **no** live edge update. Single running task `k47479ipt1mb` on micro ("Running 2 hours ago"). Backups and stage records as before. |
| 12 | `:7442` / `:1883` (+ `:8883`) OPEN and direct-published after every change; harness PASS over `https://app.thinx.cloud` and over `:7442` + `:1883` | ✓ VERIFIED (C) | `:7442` HTTP 200, `:1883` OPEN, thxp/mqtt/mqtts flags verbatim in live Args, publishers unchanged. `:8883` is still refused externally: pre-existing, observation and human item 2, not a gap. The harness PASS ×2 is the executor record accepted at D-31; it was not re-run because it is mutating. |
| 13 | D-26..D-29: `scripts/traefik-edge-scan.sh` exists (laptop-only, 17 D-27 hosts, 3 observable AEAD suites, `FAIL <check> <host>`, `EDGE-SCAN OK\|FAIL <n>`, db/influx `dashboard-401` exemption) and the `## Before` capture records the un-hardened state | ✓ VERIFIED (R) | `-rwxr-xr-x` 10178 B, 221 lines. 33-01 Task 1 `<automated>` block PASS (with `/usr/bin/grep`). `bash -n` OK. All 17 hosts, the three suites, all 9 required predicate/verdict literals and `BASICAUTH_HOSTS="db.thinx.cloud influx.thinx.cloud"` present. Exit codes documented (0 OK / 1 FAIL / 2 preflight). Fail-closed paths confirmed by code read: preflight loop over 13 tools + jq self-test → `FAIL tool-missing` + exit 2 with no verdict; nmap rc and per-port state lines; captured curl/jq rc on `api-exposed` / `dashboard-open` / `dashboard-401`; sslscan protocol-table check. `## Before` capture unchanged. |
| 14 | Stage C (EDGE-TLS-01): 19 Args incl. `--providers.file.filename=/traefik/tls.toml`; `tls-config-2` mounted with sha == committed `tls.toml`; providers `[Swarm, File]`; `default` option per D-14; wire behaviour as SC2 | ✓ VERIFIED (C) | Re-read: `configs=tls-config-2->/traefik/tls.toml`, providers `["Swarm","File"]`, `docker config ls` → `tls-config-2` only. `tls.toml` unchanged `e29f19d..b04f066`, so the previous sha match (`bb0cba95…`) still holds. Wire as SC2. |
| 15 | Amendment D-10/D-13: file provider rides in Stage C with immutable `tls-config-2` in ONE update; `tls-config-2` created FROM micro's checkout | ✓ VERIFIED (R) | Stage C record unchanged. micro checkout HEAD now `b04f066` == laptop == origin/master, 0 tracked modifications. The ff-merge of `d156e79`/`b04f066` touched only README, the four backups and vault.yml, and the deployed bytes' source file is unchanged. |
| 16 | Discretion: `curvePreferences = ["X25519","CurveP256"]`; `alpnProtocols`/`preferServerCipherSuites`/`maxVersion` OMITTED | ✓ VERIFIED (C) | `tls.toml` unchanged; TLS 1.3 negotiates (scan `tls13 yes` 17/17); IN-03 (X25519MLKEM768) remains `open` info, already recorded for Phase 34. |
| 17 | Stage D (EDGE-TLS-02): 19 Args incl. `--entrypoints.https.http.middlewares=security-headers@swarm`; `/api/entrypoints` shows it; exactly one HSTS header on 17 hosts; none on http | ✓ VERIFIED (C) | Re-read `/api/entrypoints`: `https` `["security-headers@swarm"]`, `http`/`mgmt`/`mqtt`/`mqtts`/`thxp`/`vpn` null. Scan HSTS 17/17. http 0 STS. (WR-03 single-point-of-failure design concern: deferred to Phase 34. It does not falsify the truth.) |
| 18 | Amendment D-18 + discretion: headers middleware never touches the 101 upgrade; redundant per-router refs removed; HSTS still exactly 1 on app/rtm | ✓ VERIFIED (C) | Re-probe: `--http1.1` upgrade on rtm → `101`. Scan hsts rtm/app = 1. Files unchanged. |
| 19 | D-19 / D-20: directive unchanged, thinx.cloud NOT submitted to preload; redirect gaps recorded not fixed | ✓ VERIFIED (C) | Scan compares the exact directive (17/17). Redirect gaps visible as recorded (registry 400, db 401 on http). WR-04 adds the `couch-auth`-on-`:80` item to `## Recorded for Phase 34`. |
| 20 | Stage E (EDGE-TLS-03) detail: `_acme.json`/`__acme.json` gone and snapshotted; store 23; influx new serial; rtm/app serials unchanged vs E.pre.yml; 0 ACME failures on live task; D-22 citation; D-24 decided | ✓ VERIFIED (C) | No fix touched the store or the service (idx unchanged). Previous evidence stands. |
| 21 | Plan 03: E.post.yml capture; README step `E` + scan bullet; D.post/E.pre untouched; runbook matrix + hand-off + `## Recorded for Phase 34`; AGENTS.md Deployment bullet + ssh-plane section; thinx-swarm README; fix-forward rows #2–#5 done; mirror regenerated; `tls-config-1` removed | ✓ VERIFIED (R) | Mirror regenerated at `b04f066`, `MIRROR OK`, 19 flags. Runbook `## Recorded for Phase 34` extended additively with WR-01/02/03/04/05 items. AGENTS.md: Deployment bullet line 15, `## Traefik dashboard/API access — ssh plane only (Phase 33)` line 25, trailing-slash `/dashboard/` text lines 37–38 intact, keep-7442 section (line 17) precedes it. thinx-swarm README trailing-slash text intact (lines 60, 65). `tls-config-1` absent. E.post.yml / scan capture: 0 markers / 0 e-mails. |
| 22 | D-03 / D-05: dashboard reachable for humans only via the documented socat → ssh → `docker exec` bridge, no credential; exactly the six known middlewares, no ipAllowList / rateLimit | ✓ VERIFIED (C) | Re-read middleware list = the six known (none ipallowlist/ratelimit); mgmt bind loopback-only; bridge recipe intact in AGENTS.md and README. |
| 23 | D-31 backstop truth: operator confirms in the browser that `https://rtm.thinx.cloud/` loads over the hardened edge, Devices page renders, WebSocket completes, and accepts the evidence bundle (`verification: backstop`); exactly one blocking-human gate, last task | ✓ VERIFIED (explicit evidence, C) | Recorded operator approval in `traefik-edge-hardening.md` `### Human gate result (33-03 Task 3, D-31)` (line 852, unchanged by `33469869`): "relayed 2026-10-09 ≈10:05 UTC … console OK … dashboard via the laptop bridge OK after the trailing-slash correction … No revert step executed". The only `checkpoint:human-verify` in the phase. The review fixes changed nothing on the live edge (idx unchanged), so the approval still applies to the current state. Not re-asked, per the backstop rule. |

**Score:** 23/23 truths verified (0 present, behavior-unverified; 0 overrides)

### Prohibitions (must-NOT, judgment-tier; no `verification:` field on any item)

These are 18 unique statements. 14 resolve on deterministic end-state evidence. 4 are historical/process statements that only the operator can attest, so they are flagged `unverified-prohibition — human review recommended` and routed to Human Verification item 1. The review-fix pass was checked against every row: it made no live update (idx 38379946 unchanged), merged on micro by ff-only (0 tracked modifications), and committed no secret.

| # | Prohibition | Evidence (this run) | Verdict |
|---|-------------|---------------------|---------|
| P1 | Never `--api.insecure` | Live Args 0; repo hits are the "Never --api.insecure" comments only | resolved |
| P2 | Never close/redirect/TLS-enforce/re-route `:7442` / `:1883` / `:8883`; flags verbatim; mosquitto `ports:` untouched | Flags verbatim; publishers unchanged; `:7442` 200, `:1883` OPEN; `:8883` publish spec unchanged (external refusal pre-dates the phase) | resolved |
| P3 | Never `docker stack deploy` / `restart.sh` for edge changes | Version.Index chain == recorded and unchanged through the review fix; history not provable | **flagged** (LLM-judge: consistent) |
| P4 | Never remove the port label / `traefik-mgmt` labels; never touch the inventory | Routers 29 / 0 not-enabled; idx unchanged | resolved |
| P5 | Never mgmt router only in the file provider; never load `tls-config-1` | `tls-config-2` mounted, `tls-config-1` gone; Stage C ordering is historical | **flagged** for the ordering only (LLM-judge: consistent) |
| P6 | No hash / password / salt / e-mail / private key / acme content in any committed file or runbook line | 0 markers / 0 e-mails on all touched artefacts (see above); thinx-swarm HEAD now has 0 tracked files with `--pilot.token=` (WR-01 removed the four backups). The historic dashboard password and Pilot token in thinx-swarm **history** predate Phase 33. Rotation is recorded for Phase 34 (WR-02) | resolved (HEAD); history item deferred |
| P7 | No service carries both `traefik.docker.*` and `traefik.swarm.*` families, even briefly | End state clean; "even briefly" is historical | **flagged** (LLM-judge: consistent) |
| P8 | Never edit files in place in micro's checkout; never hand-edit the generated mirror | micro HEAD `b04f066` via ff-only, 0 tracked modifications; mirror regenerated by the generator, banner == HEAD, `MIRROR OK` | resolved |
| P9 | No `ipAllowList` / `rateLimit` | Six known middlewares only | resolved |
| P10 | Do not push thinx-staging while a live update touches thinx_api labels | `thinx-staging…origin/thinx-staging [ahead 52]`, never pushed | resolved |
| P11 | C.post / D.pre / D.post (and E.pre) immutable | Not touched by any review-fix commit (commit file lists above) | resolved |
| P12 | Never submit thinx.cloud to the HSTS preload list; directive unchanged | Previous `unknown` status; directive exact on 17/17 | resolved |
| P13 | acme.json edit discipline (snapshot + `--force`, prune only qooldata + influx) | Unchanged since the previous run | resolved |
| P14 | Never set `alpnProtocols` / `preferServerCipherSuites` / `maxVersion` | `tls.toml` unchanged | resolved |
| P15 | Exactly one blocking-human gate; never auto-approved | Unchanged | resolved (documentary) |
| P16 | Plan 03: no live mutation except `docker config rm tls-config-1` | idx 38379946 == post-Stage-E, same task, through the review-fix pass too | resolved |
| P17 | Never pre-stage or create a dashboard credential on micro | No basic-auth on any mgmt path; filesystem not searched | **flagged** (LLM-judge: consistent) |
| P18 | Keep-7442 section of AGENTS.md not weakened; new section after it | Line 17 keep-7442 precedes line 25 Phase 33 section | resolved |

### Required Artifacts

`gsd-tools query verify.artifacts` / `verify.key-links` parsed 0 items for all three plans, because the plans' `must_haves.artifacts` / `key_links` are prose strings. Step 4/5 tooling is therefore not applicable, and every artifact was checked manually.

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/traefik-edge-scan.sh` | D-26 rerun scanner, executable, fail-closed | ✓ VERIFIED (R) | exists, +x, `bash -n` OK, 221 lines, static verify PASS, **runs end-to-end → `EDGE-SCAN OK` exit 0** |
| `.planning/runbooks/swarm-configs/traefik-edge-scan.2026-10-08.md` | `## Before` + `## After` + reported-not-gating | ✓ VERIFIED (C) | unchanged; 0 markers / 0 e-mails |
| `.planning/runbooks/swarm-configs/traefik-edge.E.pre.yml` | redacted baseline | ✓ VERIFIED (C) | unchanged |
| `.planning/runbooks/swarm-configs/traefik-edge.E.post.yml` | redacted end-state capture | ✓ VERIFIED (C) | unchanged; 0 markers / 0 e-mails |
| `.planning/runbooks/traefik-edge-hardening.md` | stage records, matrix, hand-off, gate result, Phase 34 record | ✓ VERIFIED (R) | +32/−0 in `33469869`; gate result line 852; Phase 34 record 856+; 0 markers / 0 e-mails |
| `.planning/runbooks/traefik-edge-fixforward.md` | rows #2–#5 done | ✓ VERIFIED (C) | unchanged |
| `.planning/runbooks/swarm-configs/README.md` | step `E` + scan bullet | ✓ VERIFIED (C) | unchanged |
| `AGENTS.md` | Deployment bullet + Phase 33 section | ✓ VERIFIED (R) | lines 15, 25–47; `/dashboard/` lines 37–38; keep-7442 intact |
| `docker-swarm.yml` | D-08 + post-D edits == thinx.yml | ✓ VERIFIED (C) | unchanged since the previous run |
| `docker-compose.traefik.yml` | generated mirror, 19 flags, banner == thinx-swarm HEAD | ✓ VERIFIED (R) | `MIRROR OK files=1`, banner `b04f066`, 19 flags, 0 basicauth |
| thinx-swarm `traefik.yml` / `traefik/tls.toml` / `traefik.sh` / `thinx.yml` | as phase end state | ✓ VERIFIED (R) | unchanged `e29f19d..b04f066`; `traefik.yml` 19 flags |
| thinx-swarm `vault.yml` | swarm key; (WR-05) deploy-safe | ✓ VERIFIED (R) | swarm network label kept; no `ports:`; https-redirect |
| thinx-swarm `README.md` | operator README | ✓ VERIFIED (R) | bridge + trailing-slash text intact; secret-hygiene sentence qualified (HEAD vs history) |
| Live `traefik_traefik` | 19 Args, `tls-config-2`, 80/443 only | ✓ VERIFIED (R) | idx 38379946, task `k47479ipt1mb` |
| thinx-swarm commits | master == origin == micro | ✓ VERIFIED (R) | all `b04f066` (8 phase commits + `d156e79` + `b04f066`) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `--entrypoints.mgmt.address=127.0.0.1:8080` | `traefik-mgmt` router | entrypoint `mgmt` | ✓ WIRED | 29/0 routers enabled; loopback bind |
| `traefik-mgmt` router | `api@internal` | `service=api@internal` | ✓ WIRED | `/api/overview` served on the loopback only |
| `--providers.file.filename=/traefik/tls.toml` | `tls-config-2` | mount `/traefik/tls.toml` | ✓ WIRED | providers `[Swarm, File]`; wire cipher behaviour |
| `--entrypoints.https.http.middlewares=security-headers@swarm` | `security-headers` middleware | entrypoint default chain | ✓ WIRED | `/api/entrypoints`; HSTS 17/17 |
| `thinx-api-ws` rule `${WEB_HOSTNAME}` | live `Host(`rtm.thinx.cloud`)` | stack `.env` | ✓ WIRED (C) | files unchanged; WS 101 |
| Stage E prune + `--force` | influx reissue via TLS-ALPN | `tlschallenge=true` | ✓ WIRED (C) | unchanged |
| thinx-swarm HEAD → micro checkout → mirror banner → CI check | repo == deployed | ssh push + ff-only; generator/check scripts | ✓ WIRED (R) | `b04f066` on all three; `MIRROR OK` |
| Inventory baseline `routers_post_A2:` | stage gates | sorted-name diff | ✓ WIRED (C) | 29 routers, idx unchanged |
| CR-01 preflight / rc capture | `EDGE-SCAN OK` verdict | `fail` counter + exit 2 | ✓ WIRED (R) | every new FAIL path increments `fail` or exits 2 before any verdict (code read) |

### Data-Flow Trace (Level 4)

Not applicable in the UI sense. The equivalent check is whether the committed files actually govern the live edge. Committed `tls.toml` (unchanged) → `tls-config-2` → mounted → provider `File` → wire behaviour (1.1/CBC refused, AEAD-only). Committed `traefik.yml` (unchanged, 19 flags) → live Args 19 (mirror check). All ✓ FLOWING. The review-fix commits changed no file that feeds the live edge.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 33-01 Task 1 static verify | plan `<automated>` line 194 with `/usr/bin/grep` | `T1-STATIC-VERIFY PASS` | ✓ PASS |
| Scan script syntax | `bash -n scripts/traefik-edge-scan.sh` | OK | ✓ PASS |
| Predicate/verdict strings preserved | `echo "FAIL …"` / `EDGE-SCAN` set, `0d93e119^` vs HEAD | 0 removed, 4 added | ✓ PASS |
| Mirror integrity + freshness | `node scripts/check-traefik-mirror.js` (± `--swarm-repo`) | `MIRROR OK files=1` ×2; 19 flags; 0 basicauth | ✓ PASS |
| Repo == deployed | `git rev-parse HEAD` laptop / origin / micro | all `b04f066…`; micro 0 tracked mods | ✓ PASS |
| Live Args | ssh `docker service inspect` (counted, not printed) | 19; `api.insecure` 0; `example.com` 0; mgmt/file/https-middleware/thxp/mqtt/mqtts present | ✓ PASS |
| Live service state | `Version.Index`, task, configs, ports | `38379946 completed`; `k47479ipt1mb` micro; `tls-config-2` only; 80/443 ingress only | ✓ PASS |
| Loopback API | `docker exec … wget /api/overview`, `/api/http/routers`, `/api/entrypoints`, `/api/http/middlewares` | `[29,0,18,6,["Swarm","File"]]`; 29/0; https `["security-headers@swarm"]`; six middlewares | ✓ PASS |
| mgmt bind | in-task `/proc/net/tcp{,6}` LISTEN `:1F90` | 1 row, `0100007F:1F90` | ✓ PASS |
| 8080 external | `curl -m5 http://188.166.23.244:8080/` | rc=7 | ✓ PASS |
| TLS versions + CBC (rtm) | `openssl s_client -tls1_1/-tls1_2/-tls1_3`, `-cipher ECDHE-RSA-AES128-SHA` | refused / 1.2 / 1.3 / refused | ✓ PASS |
| Plaintext + MQTT | `curl :7442`, `nc -z 1883` | 200 / OPEN | ✓ PASS |
| No HSTS on http | `curl -sI http://188.166.23.244/` | 0 STS | ✓ PASS |
| WebSocket upgrade | `curl --http1.1` upgrade on rtm | 101 | ✓ PASS |
| Scan fail-closed without jq | temp PATH without jq | not run (permission denied in this session); code-read confirms exit 2 path; fixer recorded `FAIL tool-missing jq` / `exit=2` | ? SKIP (non-must-have) |
| Device-flow harness | not run | mutating; executor PASS ×2 accepted at D-31 | ? SKIP |
| MQTTS `:8883` external | `nc -z -w5 188.166.23.244 8883` | CLOSED (pre-existing) | ℹ️ observation |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| `scripts/traefik-edge-scan.sh` (post-CR-01, 2026-10-09 10:51:53Z–10:53:43Z) | `timeout 480 bash scripts/traefik-edge-scan.sh` | exit 0; last line `EDGE-SCAN OK`; 0 `FAIL ` lines; 17 host sections; tls12 full set 17/17; hsts 17/17; tls13 17/17; legacy none 17/17 | PASS |

No nmap flake this time, so the per-suite `openssl` fallback was not needed. The run-1 flake from the previous report (console, one suite listed) remains recorded there as history.

### Requirements Coverage

The PLAN frontmatter declares 33-01 `[EDGE-API-01, EDGE-API-02]`, 33-02 `[EDGE-TLS-01, EDGE-TLS-02, EDGE-TLS-03]` and 33-03 all five. REQUIREMENTS.md maps exactly these five IDs to Phase 33 (traceability rows 67–71 `Complete`, checklist rows 24–31 `[x]`). No requirement is orphaned and no ID is unaccounted for.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| EDGE-API-01 | 33-01, 33-03 | Dashboard/API not reachable unauthenticated from outside; 8080 closed externally (or bound internal-only), `--api.insecure` disabled | ✓ SATISFIED | Truths 1, 5, 7; fresh scan 8080/8443 closed, 0 api/dashboard hits; loopback bind; 0 `api.insecure` |
| EDGE-API-02 | 33-01, 33-03 | If kept, dashboard via `api@internal` behind auth; otherwise disabled in production | ✓ SATISFIED | No production route; `api@internal` only on the in-task loopback behind the ssh plane (D-01/D-02/D-06) |
| EDGE-TLS-01 | 33-02, 33-03 | Min TLS 1.2 (prefer 1.3), modern cipher set | ✓ SATISFIED | Truths 2, 14–16; fresh scan 17/17 AEAD-only + TLS 1.3; rtm 1.1/CBC refused |
| EDGE-TLS-02 | 33-02, 33-03 | HSTS on HTTPS at the edge (documented max-age) without affecting plaintext device paths | ✓ SATISFIED | Truths 2, 17–19; HSTS 17/17 exact; `:7442` 200; 0 STS on http |
| EDGE-TLS-03 | 33-02, 33-03 | ACME real operator e-mail, `acme.json` 600, issuance/renewal verified | ✓ SATISFIED | Truths 3, 20; 0 `example.com`; 600 root; influx TLS-ALPN reissue |

### Anti-Patterns Found

The debt-marker scan (`TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER`) found 0 hits in every file changed since the previous run: the scan script, the mirror, the runbook additions, and thinx-swarm README and vault.yml. Earlier phase files were already 0.

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| runbook / E.pre.yml / E.post.yml | `ports_micro`, gate rows | `8883 OPEN` measured on micro's loopback | ℹ️ Info | Carried from previous report; Phase 34 should probe the public IP |
| deferred-items.md | items 1–2 | plan `<automated>` literals that need `/usr/bin/grep` / whitespace normalisation / `{{json}}` | ℹ️ Info | Documented quirks; this run used `/usr/bin/grep` for the Task 1 literal |
| thinx-swarm laptop checkout | `landing` submodule | ` M landing` (pointer differs from the recorded commit; last `landing` commit 2025-05-12) | ℹ️ Info | Pre-existing, unrelated to Phase 33; micro checkout has 0 tracked modifications |
| micro deploy checkout | untracked `traefik.yml.bak.20261007120354.pre-p30-pilot` | one `--pilot.token=` line (count only) | ℹ️ Info (security hygiene) | Not in git; recorded for Phase 34 (WR-01 follow-up); see observations |
| 33-REVIEW-DISPOSITION.md | WR-02/03/04, IN-01..06 | skipped/open review findings | ℹ️ Info | Advisory ledger; WR-02/03/04 recorded under `## Recorded for Phase 34`; none falsifies a Phase 33 must-have |

### Human Verification Required

#### 1. Attest the four process prohibitions (judgment-tier, history not provable from the end state)

**Test:** Confirm that during Phase 33 (a) no `docker stack deploy` / `restart.sh` was used for any edge change; (b) downtime_downtime / errorpage_errorpage never carried `traefik.docker.network` and `traefik.swarm.network` simultaneously; (c) `--providers.file.filename` never went live while `tls-config-1` was the mounted file; (d) no dashboard credential file was pre-staged or created on micro.
**Expected:** Yes to all four. The end state is consistent with each: the Version.Index chain 38379738 → 38379946 == live and unchanged through the review fix; only `traefik.swarm.network` is live; `tls-config-2` is mounted and `tls-config-1` is gone; there is no basic-auth on any mgmt path. `thinx-staging` has never been pushed, so the push-during-label-update prohibition is already deterministic.
**Why human:** These are judgment-tier must-NOTs about past actions. The verifier can read only the end state and the executor's records.

#### 2. Decide on MQTTS `:8883` being refused from the internet (pre-existing, escalated)

**Test:** From the laptop: `nmap -Pn -p 1883,8883 188.166.23.244` → `1883 open`, `8883 closed`; `openssl s_client -connect thinx.cloud:8883` → Connection refused. In this run, `nc -z 188.166.23.244 8883` was again CLOSED while `1883` was OPEN. `thinx_mosquitto` still publishes `8883->8883/ingress` unchanged. `services/broker/config/mosquitto.conf` declares `listener 8883` with cert/key under `/mqtt/ssl/`.
**Expected:** The operator records a decision. Option one: accept it as-is (plain MQTT `:1883` and plaintext `:7442` are the operator-required legacy paths and are OPEN) and carry it to Phase 34 (public-IP port probes in the gate quartet; mosquitto TLS listener / cert mount check on core). Option two: open an incident now.
**Why human:** This is a production reachability question outside the Phase 33 change set, and the Phase 32 verifier already observed it. Whether MQTTS must be externally reachable is an operator/product decision.

### Gaps Summary

No gaps, and no regressions from the review-fix pass. The CR-01 scan rewrite keeps every predicate and verdict string, passes the 33-01 Task 1 static literal and `bash -n`, and its first live run printed `EDGE-SCAN OK` with exit 0 and zero FAIL lines. That `OK` now carries more weight than before, because missing or broken tools and transport errors can no longer leave a predicate silently unchecked. The WR-01 mirror regeneration changed only the banner: `MIRROR OK` with 19 flags, and HEAD agrees across laptop, origin and micro at `b04f066`. The WR-01/WR-05 thinx-swarm changes touched no file that feeds the live edge. The live edge itself is unchanged: same Version.Index, same task, 19 Args, 29/0 routers, HSTS 17/17, `:7442`/`:1883` publishers.

The phase goal is achieved: the dashboard/API surface is closed and TLS on the v3 edge is modern. Status stays `human_needed` for the same two operator items as before (the four judgment-tier process prohibitions and the pre-existing `:8883` refusal). Neither blocks Phase 34.

### Deferred Items

No gaps were deferred to later phases. Items the phase and its review recorded for Phase 34 are in `traefik-edge-hardening.md` `## Recorded for Phase 34` and fit ROADMAP Phase 34 "Ops Surface Reduction & SLA Close-out":

- D-05, D-20, D-16, the curve policy, retired ACME names, fotostim, the `tls-config-1` recreate path, and log level / socket-proxy / SLA
- New from the review: WR-02 credential rotation, WR-03 HSTS middleware moved to the file provider, WR-04 `couch-auth` on `:80`, the WR-05 vault image pin / delete decision, and the WR-01 untracked micro backup

The two observations above (public-IP port probes, `:8883`) should be added to that list.

### Verifier side effects

None on the edge. Remote commands were read-only (`docker service inspect/ps`, `docker config ls`, `docker exec … wget` on the loopback API, `/proc/net/tcp` reads, `git rev-parse/status/ls-files`). The one host-side artefact was a transient `/tmp/.p33ov.json` on micro, holding the `/api/overview` JSON (no secrets). It was written and removed within the same command.

---

_Verified: 2026-10-09T10:54:02Z_
_Verifier: Claude (gsd-verifier)_
