---
phase: 31-v2-v3-upgrade-backward-compat-mode
verified: 2026-10-07T22:35:00Z
status: human_needed
score: 20/20 must-haves verified
covered_files:
  - ".planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-01-PLAN.md"
  - ".planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-01-SUMMARY.md"
  - ".planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-02-PLAN.md"
  - ".planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-02-SUMMARY.md"
  - ".planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-03-PLAN.md"
  - ".planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-03-SUMMARY.md"
  - ".planning/runbooks/swarm-configs/traefik-edge.C.post.yml"
  - ".planning/runbooks/swarm-configs/traefik-edge.C.pre.yml"
  - ".planning/runbooks/traefik-v3-cutover.md"
  - "docker-compose.traefik.yml"
  - "docker-swarm.yml"
covered_digest: "v3:sha256:d7c4697f57f3cafb5dfc3528dbadaa3d480101d6fdfbf164ffc9be10c5e5df89"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 6
  total: 6
  not_honored: []
requirements:
  - id: EDGE-MIG-02
    status: satisfied
    plans: [31-01, 31-02, 31-03]
  - id: EDGE-MIG-04
    status: satisfied
    plans: [31-03]
    note: "mapped to Phase 30 in REQUIREMENTS.md; re-verified by 31-03 after the v3 hop (not orphaned)"
human_verification:
  - test: "Resolve the 12 judgment-tier prohibitions (listed under 'Prohibitions' below). Each carries a NON-AUTHORITATIVE LLM-judge verdict of 'not violated' with repo/live evidence; per ADR-550 D4 (B-with-guard) a judgment-tier prohibition is never silently green and needs explicit human resolution at the end-of-phase checkpoint."
    expected: "Operator confirms each 'not violated' verdict (or names the one that is wrong). Flag: unverified-prohibition — human review recommended."
    why_human: "Prohibitions are must-NOT statements with no `verification:` tier declared (default judgment); the verifier may judge but may not close them."
  - test: "Re-run the post-B2 router gate read-only against the live v3 edge through the admin-auth dashboard router: curl -u <operator-creds> https://micro.thinx.cloud/api/http/routers | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status'"
    expected: "Prints nothing (the 2026-10-07T22:07:57Z record). /api/overview shows http routers 30 / errors 0, services 18 / 0, middlewares 7 / 0, providers [\"Swarm\"]."
    why_human: "The live service has no --api.insecure and the dashboard sits behind admin-auth; the verifier does not hold the credential. Behavioural corroboration already gathered: all 10 probed hosts serve their baseline code and the three formerly-@docker routers apply their middleware chains (HSTS/nosniff/frame-deny visible on rtm + console; WS probe 200)."
---

# Phase 31: v2→v3 Upgrade (backward-compat mode) Verification Report

**Phase Goal:** Upgrade to current Traefik v3.x with `core.defaultRuleSyntax: v2`, via the official three-phase rollout, rollback-able.
**Verified:** 2026-10-07T22:35:00Z (UTC; the operator's local date is 2026-10-08)
**Status:** human_needed
**Re-verification:** No — initial verification

Evidence basis: repo greps/diffs, `node scripts/check-traefik-mirror.js`, the external `~/Repositories/thinx-swarm` checkout, and **read-only** production inspection over `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020` (`docker service inspect|ps|logs`, `stat`, `curl -o /dev/null`, `openssl s_client`, `jq` over `acme.json`, `/dev/tcp` connects). No production mutation was performed. Live `docker service inspect` output necessarily displayed the resolved ACME e-mail and the `admin-auth` apr1 hash in the verifier session; **neither value is recorded in this report or any committed file** (P29 D-12).

## Goal Achievement

### Observable Truths

| #  | Truth | Source | Status | Evidence |
|----|-------|--------|--------|----------|
| 1  | Running current v3.x image with the BC switch; all routes serve identically | ROADMAP SC1 | ✓ VERIFIED | Live `traefik_traefik`: `traefik:v3.7.14 args=17 v=38379311`, task `traefik_traefik.1 micro Running` (container `StartedAt 2026-10-07T22:04:51Z`, `restarts=0`, `oom=false`); Args[0..3] = `--providers.swarm`, `--providers.swarm.constraints=Label(...)`, `--providers.swarm.exposedbydefault=true`, `--core.defaultRuleSyntax=v2`. Live matrix (22:30Z): https app/console/rtm/thinx.cloud/swarmpit/fotostim.com/fotostim.cz/igraczech.com/www.syxra.cz all **200**; http console/rtm/thinx.cloud/swarmpit/fotostim.*/igraczech/www.syxra **301 → https**; http app 200 (by design); https micro **401** (admin-auth). Identical to the 21:52Z v2.11 baseline in the runbook. BC switch exercised live: the v2-syntax `HostRegexp(\`{host:.+}\`)` downtime catch-all served an unknown SNI host (`https unknown-host=200`, `http → 301`). |
| 2  | The prepare→migrate-prod→(defer routing) rollout is followed; rollback to v2 is demonstrated or staged-ready | ROADMAP SC2 | ✓ VERIFIED | Prepare: boot-and-discover record (commit `a5c56133`, runbook §Boot-and-discover; probe gone: `docker service ls --filter name=traefik_v3probe` → 0). Migrate-prod: live cutover B1 22:04:47Z → B2 → C (commit `f0302672`; live state matches). Defer routing: `docker-swarm.yml` diff vs `247c9236` contains **only** `@docker→@swarm` and `traefik.docker.network→traefik.swarm.network` lines — no rule edits; `--core.defaultRuleSyntax=v2` live. Rollback staged-ready (D-02): on micro `/mnt/data/edge-rollback/traefik-2026-10-07/` **700 root**, `acme.json` **600 root**, `resolved-snapshot.yml` **600 root**, `traefik-p31-precutover-20261007T203816Z.json` **600 root**; rollback image present locally by digest (`docker image inspect traefik:v2.11@sha256:d57faa4f…` → `sha256:32c7339c302b…`, no pull needed); runbook §Rollback Steps 0-4 with `# expect:` lines, Stage-C clause marked mandatory; dry-verify throwaways gone (`gsd_rbdry*` → 0). Rollback execution itself not exercised in P31 by design (SC allows staged-ready). |
| 3  | ACME + TLS posture preserved under v3; plaintext `:7442` + MQTT re-verified | ROADMAP SC3 | ✓ VERIFIED | Live `openssl s_client app.thinx.cloud:443`: serial `051152D5A20BE36DEFA1B6FA83379CE42809`, issuer Let's Encrypt `YR2`, notAfter `Dec 28 05:50:33 2026`, `Certificate will not expire` — same serial the runbook recorded for the pre-cutover snapshot (no re-issuance). `acme.json` live `301121 1791410693 600 root` (mtime = 22:04:53Z, the single v3 start-up rewrite; no writes since), `jq '.le.Certificates|length'` = **24**. `le` resolver + `tlschallenge` + `/certificates/acme.json` args unchanged; `tls-config-1` config still mounted; committed `tls.toml` sha256 `7e43d8f9…` = C.post record. Device paths: `/dev/tcp/127.0.0.1/{7442,1883,8883}` all **OPEN**; `http://rtm.thinx.cloud:7442/` → **200** (plaintext); `thinx_api` publishes `7442→7442` ingress, `thinx_mosquitto` publishes `1883,1884,8883`. Full legacy flow (check-in → OTT → firmware → MQTT) = harness PASS record 22:08Z + operator approval at the 31-03 Task 3 blocking-human gate (relayed by the orchestrator); not re-run by the verifier (state-mutating). |
| 4  | Converted `thinx-swarm/traefik.yml` contains `--providers.swarm` and `--core.defaultRuleSyntax=v2` and no `--providers.docker*` flag | 31-01 | ✓ VERIFIED | `~/Repositories/thinx-swarm/traefik.yml` HEAD `5e19c000…`: lines 104/106/109/112 = the four swarm/BC flags, `image: traefik:v3.7.14`; mirror `docker-compose.traefik.yml`: 17 command lines, `--providers.docker` non-comment count **0**. |
| 5  | A throwaway `traefik:v3.7.14` boots the converted config (1/1) and every expected router reports `enabled` | 31-01 | ✓ VERIFIED | Record: probe converged 1/1 at t=10 s, 32 routers / 29 enabled, the 3 disabled = exactly the 3 live `@docker` labels (designed falsification; gate deferred by operator decision A, CLOSED by the 31-03 post-B2 gate printing nothing at 22:07:57Z). Live corroboration: the identical 17-arg config boots the production task in ~4 s with `restarts=0`, and the three routers in question now serve with their chains applied (rtm/console HSTS+nosniff+frame-deny; WS probe 200). Probe cannot be re-observed (torn down by design). |
| 6  | Every `@docker` middleware ref → `@swarm` and every `traefik.docker.network` → `traefik.swarm.network` in the authoritative live source | 31-01 | ✓ VERIFIED | `docker-swarm.yml`: `@docker` count **0**; `@swarm` at :349 (`sslheaders@swarm,security-headers@swarm`), :380 (`sslheaders@swarm`), :434 (`security-headers@swarm`); uncommented `traefik.docker.network` **0**; `traefik.swarm.network` ×6 (:124,:184,:338,:423,:474,:548). Live `thinx_api`/`thinx_console` `Spec.Labels` carry the same `@swarm` values; all 16 traefik-enabled services live: `docker.network=0 swarm.network=1 @docker=0`. |
| 7  | Mirror regenerates from the new thinx-swarm HEAD and `check-traefik-mirror.js` prints MIRROR OK | 31-01 | ✓ VERIFIED | Ran `node scripts/check-traefik-mirror.js` and `… --swarm-repo ~/Repositories/thinx-swarm` → **`MIRROR OK files=1`**, rc 0. Banner `source: thinx-swarm@5e19c0003eec…` = external HEAD; `mirror-sha256:660e859b…`. |
| 8  | The boot-and-discover instance never writes the production `acme.json` (ACME neutralized) | 31-01 | ✓ VERIFIED | Record: probe mounted only `docker.sock:ro`, storage `/tmp/acme-test.json`, LE staging CA, `Endpoint.Ports null`; `acme.json` `301146 1791377596` before and after. Live mtime chain corroborates: the only write since that baseline is `1791410693` = 22:04:53Z (v3 production start). |
| 9  | Boot-and-discover asserts the discovered router set equals the complete expected set (not empty, not a subset) | 31-01 | ✓ VERIFIED | Runbook table lists every `traefik-edge.A.pre.yml` router discovered `@swarm` (plus registry/db/influx not in A.pre); only `mosquitto-secure` TCP router undiscoverable — pre-existing P30 D-03 dead router (no `traefik.constraint-label`), identical under v2/v3. Live: 30 http routers (= 32 − `api@internal`/`dashboard@internal` which exist only under the probe's `--api.insecure`). |
| 10 | The edit changes only the forced provider flags + own network label; all other flag/label order preserved; the duplicate `traefik-public-https.middlewares` key carried unchanged | 31-01 | ✓ VERIFIED | `git diff 247c9236..HEAD -- docker-compose.traefik.yml` non-comment lines: image, `traefik.docker.network→traefik.swarm.network`, and the 4 provider/BC flags **only**. `diff` of all `--entrypoints/--certificatesresolvers/--accesslog/--log/--api` lines vs `247c9236:docker-compose.traefik.yml` → **IDENTICAL**. Duplicate key present at :80 (`admin-auth`) and :86 (`admin-auth,error-pages-middleware`). Live Args[4..16] match C.pre index-for-index. |
| 11 | A fresh out-of-git 600 pre-cutover snapshot (resolved static config + `acme.json` copy) exists on micro; `acme.json` 600 root, dir 700 root | 31-02 | ✓ VERIFIED | Live `stat`: `700 root /mnt/data/edge-rollback/traefik-2026-10-07/`, `600 root …/acme.json`, `600 root …/resolved-snapshot.yml`. `git ls-files | grep -iE 'acme.json|resolved-snapshot|precutover|edge-rollback'` → **none tracked**. |
| 12 | A full-spec `docker service inspect traefik_traefik` backup is captured 600 root out-of-git before any mutation | 31-02 | ✓ VERIFIED | Live `stat`: `600 root /mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json`; timestamp (20:38Z) precedes B1 (22:04:47Z); referenced by path only in the runbook. |
| 13 | The v3→v2.11 rollback (image retag + 17-flag args revert + `@swarm→@docker` label revert + `acme.json` restore) is documented with `# expect:` lines and dry-verified, one command away | 31-02 | ✓ VERIFIED | Runbook §"Rollback (v3 -> v2.11) — staged-ready": Step 1 `acme.json` restore FIRST, Step 2 one `docker service update --image <d57faa4f digest> --args "$(jq … map(@sh) …)"`, Step 3 label reverts incl. the now-mandatory Stage-C re-adds on 5 multi-network services, Step 4 verify matrix, regression triggers; dry-verify table (Run A tag / Run B digest: 17/17 args identical to live, backtick constraint intact, 0 tasks scheduled, live `Version.Index` unchanged). Preconditions confirmed live: snapshot files present, rollback digest image present on micro, `traefik:v2.11.0` greps PASS. Dry-verify is a past run (throwaways torn down: 0 left). |
| 14 | Committed `traefik-edge.C.pre.yml` captures the v2.11 live state with every secret redacted and `${VAR}` templated | 31-02 | ✓ VERIFIED | File present (128 lines); apr1/bcrypt/PEM marker count **0**; e-mail regex **0**; `${USERNAME}:<redacted>`, `${EMAIL}`, `${DOMAIN}`, `${CONFIG}` templated; command block = the 17-flag v2.11 set in live order (matches the pre-phase mirror). |
| 15 | The live `traefik_traefik` runs `traefik:v3.7.14` with `--providers.swarm` + `--core.defaultRuleSyntax=v2`, no `--providers.docker*`; publishes only `:80/:443` | 31-03 | ✓ VERIFIED | Live inspect (22:30Z): image `traefik:v3.7.14`, 17 args, `providers.swarm` ×3, `providers.docker` ×0, `core.defaultRuleSyntax=v2` ×1, `thxp.address=:7442` ×1; `Endpoint.Ports` = `80->80 443->443` only; exactly one running task; `Spec.UpdatedAt 2026-10-07T22:04:56Z`, `UpdateStatus completed`. |
| 16 | Every web host serves HTTPS 200 and redirect hosts 301 — identical to the v2.11 baseline; every live router `enabled` | 31-03 | ✓ VERIFIED | Live matrix in truth 1 (10 hosts + micro 401 + catch-all). Middleware-chain proof on the three B2 routers: `rtm.thinx.cloud` and `console.thinx.cloud` responses carry `strict-transport-security: max-age=31536000; includeSubDomains; preload`, `x-content-type-options: nosniff`, `x-frame-options: DENY` (= `security-headers@swarm` resolved); WS-upgrade probe on rtm → 200 (`thinx-api-ws@swarm`). "Every router enabled" via the admin-auth API: record 22:07:57Z (filter empty, 30/18/7, 0 errors) — not independently re-run (credential; see Human Verification). `registry.thinx.cloud` returns 400 via Traefik: pre-existing backend-scheme mismatch, not a hop regression (see Anti-Patterns ℹ️). |
| 17 | `:7442` plaintext + `:1883/:8883` MQTT keep accepting connections and the full legacy flow works at the human-verify gate; direct-publish model unchanged | 31-03 / EDGE-MIG-04 | ✓ VERIFIED | Live: 7442/1883/8883 OPEN; `http://rtm.thinx.cloud:7442/` 200 plaintext (not redirected, not TLS-enforced); `thinx_api` `Endpoint.Ports` `7442→7442 ingress`; `thinx_mosquitto` `1883/1884/8883`. Harness record 22:08Z PASS (register → status → OTT 200 → firmware 380048 B md5Match → MQTT connect/ACL/publish/recent/disconnect) over `:7442`+`:1883`; operator approved the gate ("approved, console checked", relayed by the orchestrator). Not re-run by the verifier (registers a device = state mutation). |
| 18 | A valid TLS cert is served on `:443` under the preserved `le` resolver; `acme.json` intact with no re-challenge storm | 31-03 | ✓ VERIFIED | Truth 3 evidence: serial unchanged vs snapshot record, `checkend 0` valid, 24 certs, single start-up rewrite only, `docker service logs --since 2h` errors = only the v2.11 task's shutdown `use of closed network connection` lines at 22:04:50Z (no ACME errors). |
| 19 | Because `:7442/:1883/:8883` are published directly (not through Traefik), an interrupted cutover/rollback never interrupts the legacy paths; the D-02 snapshot returns the edge to v2.11 one command away [spec-less concurrency edge] | 31-03 | ✓ VERIFIED | Structural: `thinx_api`/`thinx_mosquitto` publish in `ingress` mode, Traefik publishes only 80/443 — no dependency path. Observed behaviour during the real ~2-min web outage (22:04:50–22:06:45Z): runbook records `:7442/:1883/:8883` OPEN throughout while every web host was 404 — the invariant was exercised live, not just inferred. Rollback readiness: truth 2/13. |
| 20 | `traefik-edge.C.post.yml` captures the v3 live end state, redacted/templated | 31-03 | ✓ VERIFIED | File present (164 lines); marker count **0**, e-mail regex **0**; command block = live Args index-exact (17 flags, same order as live inspect); labels/ports/mounts match live; `acme_json` block matches live `stat` `301121 1791410693 600 root`; app-stack label block matches live `thinx_api`/`thinx_console` labels. |

**Score:** 20/20 truths verified (0 present, behavior-unverified). 31-03's "rollout followed; rollback staged-ready; routing deferred to P32" truth was de-duplicated into SC2 (truth 2).

### Prohibitions (must-NOT, judgment tier — NON-AUTHORITATIVE LLM-judge verdicts, flagged for human resolution)

| # | Prohibition | Plan | LLM-judge verdict | Evidence |
|---|-------------|------|-------------------|----------|
| P1 | No native v3 routing-rule conversion; `core.defaultRuleSyntax=v2` stays on | 31-01, 31-03 | not violated (flagged) | Live Args contain `--core.defaultRuleSyntax=v2`; `docker-swarm.yml` diff has no `rule=` changes; v2 `HostRegexp({host:.+})` catch-all served live. |
| P2 | `exposedbydefault` stays `true`, moved into `providers.swarm` only | 31-01 | not violated (flagged) | Live Args[2] `--providers.swarm.exposedbydefault=true`. |
| P3 | No `--providers.swarm.endpoint` added | 31-01 | not violated (flagged) | Not present in live Args or committed files; `docker.sock:ro` bind is the only socket mount. |
| P4 | Never hand-edit `docker-compose.traefik.yml` | 31-01 | not violated (flagged) | `check-traefik-mirror.js` → `MIRROR OK files=1`; `mirror-sha256` banner intact. |
| P5 | No cleartext secrets/hashes/key material in committed artifacts | 31-01, 31-02, 31-03 | not violated (flagged) | apr1/bcrypt/PEM marker count 0 in runbook, C.pre, C.post, both compose files; the only e-mail in the runbook is the fake `rollback-dryrun@example.invalid`. |
| P6 | No dashboard/API, ACME, TLS min/HSTS, log-level or socket-proxy change (P33/P34) | 31-01, 31-03 | not violated (flagged) | Live Args[4..16] identical to C.pre; `--api` without `--api.insecure`; `tls-config-1` mounted, committed `tls.toml` sha unchanged; `--log.level=ERROR`. |
| P7 | The out-of-git snapshot is never committed or scp'd into a repo | 31-02 | not violated (flagged) | `git ls-files` has no acme/snapshot/precutover file; runbook references paths only. |
| P8 | No live `traefik_traefik` mutation in plan 02 | 31-02 | not violated (flagged) | Record: `Version.Index 38379257` unchanged across 31-02; live history shows the spec changes only at Stage A (38379296) and B1 (38379311). |
| P9 | No change closes, redirects or TLS-enforces `:7442` or plain MQTT (AGENTS.md 2026-10-04) | 31-03 | not violated (flagged) | `http://rtm.thinx.cloud:7442/` → 200 plaintext; 1883 OPEN; published directly. |
| P10 | Cutover does not change Traefik's published ports (`:80/:443` only) | 31-03 | not violated (flagged) | Live `Endpoint.Ports` `80->80 443->443`. |
| P11 | No dashboard lockdown / ACME / TLS change in plan 03 | 31-03 | not violated (flagged) | Same evidence as P6; micro dashboard still 401 behind `admin-auth`. |
| P12 | No native v3 rule conversion in plan 03 | 31-03 | not violated (flagged) | Same as P1. |

No `verification: test` prohibitions were declared; nothing fails closed under the test-tier rule.

### Required Artifacts

`gsd_run query verify.artifacts` returned `total: 0` for all three plans (exit 1): the plans declare `must_haves.artifacts` as free-text strings, not `{path, provides}` objects, so the verb found nothing to evaluate. Step 4 was performed manually at all levels.

| Artifact | Expected | Exists | Substantive | Wired / Data | Status |
|----------|----------|--------|-------------|--------------|--------|
| `~/Repositories/thinx-swarm/traefik.yml` (external) | converted v3 static command + own `traefik.swarm.network` label | ✓ HEAD `5e19c000` | ✓ 4 swarm/BC flags, image v3.7.14 | ✓ feeds the mirror (MIRROR OK) and is byte-equal to live Args | ✓ VERIFIED (unpushed — see ⚠️) |
| `docker-swarm.yml` | `@docker→@swarm` + network-label renames in the authoritative live source | ✓ | ✓ 3 refs + 6 labels renamed, nothing else | ✓ live `Spec.Labels` on thinx_api/console/vue/mosquitto/couchdb/influxdb match | ✓ VERIFIED |
| `docker-compose.traefik.yml` | regenerated mirror, banner SHA = thinx-swarm HEAD | ✓ | ✓ 17 flags, 0 `--providers.docker` | ✓ `MIRROR OK files=1`; live Args index-exact | ✓ VERIFIED |
| `.planning/runbooks/traefik-v3-cutover.md` | rename inventory + mechanism + boot-and-discover + snapshot + rollback + live cutover record | ✓ 706 lines | ✓ all six sections, `# expect:` convention, CORRECTION markers on the invalidated bridge rows | ✓ paths/commands match live state | ✓ VERIFIED |
| `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml` | redacted v2.11 pre-hop capture | ✓ | ✓ 17-flag v2.11 command, labels, mounts, tls.toml | ✓ = pre-phase mirror; 0 secrets | ✓ VERIFIED |
| `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml` | redacted v3 end-state capture | ✓ | ✓ 17-flag v3 command, delta header, acme block | ✓ = live inspect; 0 secrets | ✓ VERIFIED |
| out-of-git `/mnt/data/edge-rollback/traefik-2026-10-07/` + `traefik-p31-precutover-20261007T203816Z.json` (micro) | 600/700 root, NOT committed | ✓ live `stat` | ✓ acme.json + resolved-snapshot.yml + full inspect | ✓ rollback Step 1/2 inputs; not in git | ✓ VERIFIED |
| live `traefik_traefik` on `traefik:v3.7.14` | swarm provider + BC, :80/:443 only | ✓ | ✓ 17 args | ✓ serves every probed host | ✓ VERIFIED |

### Key Link Verification

`gsd_run query verify.key-links` returned `total: 0` (string-form `key_links`); verified manually.

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `thinx_api` `thinx-api-https`/`-ws` routers | `sslheaders@swarm`, `security-headers@swarm` (`docker-swarm.yml:349,380`) | middleware chain under the swarm provider | ✓ WIRED | rtm response carries HSTS/nosniff/frame-deny/xss headers; WS probe 200; live labels `…@swarm` |
| swarm provider | every router `enabled` (the `@docker` dangling-ref detector) | `/api/http/routers` status filter | ✓ WIRED (record + behaviour) | probe: 3 predicted disabled; post-B2 live: filter empty 22:07:57Z; all probed hosts serve |
| `generate-traefik-mirror.js` → `check-traefik-mirror.js` | `MIRROR OK` | anti-drift spine | ✓ WIRED | ran live: `MIRROR OK files=1` with and without `--swarm-repo` |
| single `acme.json` named volume | cert continuity on cutover and rollback | restore-from-snapshot before retag | ✓ WIRED | served serial unchanged; snapshot `acme.json` 600 root present; runbook Step 1 precedes Step 2 |
| traefik service (swarm provider) ↔ app-stack `@swarm` labels | land together at cutover | B1 → B2 within 10 s | ✓ WIRED | live: 0 `@docker`, 16/16 `swarm.network`, 0 dual-label services |
| published ports | traefik :80/:443; thinx_api :7442; mosquitto :1883/:8883 | direct publish | ✓ WIRED | live `Endpoint.Ports` on all three services |

### Data-Flow Trace (Level 4)

Not applicable in the UI sense (infrastructure phase). The equivalent trace — committed source → mirror → live Args → served responses — was walked end to end: `thinx-swarm/traefik.yml@5e19c000` → `docker-compose.traefik.yml` (MIRROR OK) → live `ContainerSpec.Args` (17/17 index-exact) → HTTPS 200 with v3-resolved middleware headers. Status: ✓ FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Mirror integrity | `node scripts/check-traefik-mirror.js` | `MIRROR OK files=1` rc 0 | ✓ PASS |
| Live image/args | `docker service inspect traefik_traefik …Image/len Args/Version.Index` | `traefik:v3.7.14 args=17 v=38379311` | ✓ PASS |
| BC switch honours v2 syntax | `curl -k --resolve unknown-host.example:443:127.0.0.1 https://unknown-host.example/` (HostRegexp catch-all) | 200; http → 301 | ✓ PASS |
| Route parity (10 hosts) | `curl -o /dev/null -w '%{http_code}'` https + http | all baseline codes | ✓ PASS |
| `@swarm` chain applied | `curl -sSI https://rtm.thinx.cloud/` | HSTS preload, nosniff, DENY, xss | ✓ PASS |
| Cert validity + continuity | `openssl s_client … x509 -checkend 0 -serial` | valid; serial = snapshot | ✓ PASS |
| Device ports | `/dev/tcp/127.0.0.1/{7442,1883,8883}`; `curl http://rtm.thinx.cloud:7442/` | OPEN ×3; 200 | ✓ PASS |
| Snapshot/backup modes | `stat -c '%a %U'` ×4 | 700/600/600/600 root | ✓ PASS |
| Rollback image local | `docker image inspect traefik:v2.11@sha256:d57faa4f…` | image id `32c7339c…` | ✓ PASS |
| No probe/dry-run leftovers | `docker service ls --filter name=traefik_v3probe|gsd_rbdry` | 0 / 0 | ✓ PASS |
| Every router enabled via admin-auth API | needs credential | not run | ? SKIP → human |
| Full legacy device flow (harness) | state-mutating (registers a device) | not run; operator-approved at gate | ? SKIP → attested |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist or are declared by the phase. Not applicable.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| EDGE-MIG-02 | 31-01, 31-02, 31-03 | Upgrade v2.x → current v3.x with `core.defaultRuleSyntax: v2` via the official three-phase rollout; each hop rollback-able | ✓ SATISFIED | Truths 1–2, 4–16, 18–20 |
| EDGE-MIG-04 | 31-03 | `:7442` + plain MQTT keep accepting legacy check-in, OTT, firmware after every hop | ✓ SATISFIED (re-verified) | Truths 3, 17, 19; REQUIREMENTS.md maps it to Phase 30 — 31-03 re-verifies, not orphaned |

Orphaned requirements: none (REQUIREMENTS.md maps only EDGE-MIG-02 to Phase 31, and plan 31-0x claim it).

### Decision Coverage

`check.decision-coverage-verify`: 6/6 trackable CONTEXT.md decisions (D-01, D-01a, D-02, D-03, D-04, D-05) honored by shipped artifacts. All trackable CONTEXT.md decisions are honored by shipped artifacts.

### Anti-Patterns Found

Debt-marker scan (`TBD|FIXME|XXX`, `TODO|HACK|PLACEHOLDER`) over the five modified files: **0 hits**. Commits `60f76b4a 1fe2b791 a5c56133 6fa445d3 a1156a47 edd9bf86 f0302672` all valid (`verify.commits` 7/7).

| File / Scope | Line | Pattern | Severity | Impact |
|--------------|------|---------|----------|--------|
| live `registry_registry` labels | — | `loadbalancer.server.port=5000` with no `server.scheme=https` while the registry sets `REGISTRY_HTTP_TLS_CERTIFICATE/KEY` → Traefik → backend returns 400 "Client sent an HTTP request to an HTTPS server" | ℹ️ Info | Pre-existing: labels unchanged by the hop; the direct `:5000` path (the actual deploy path) answers `/v2/` 401 normally. Not in the v2.11 baseline matrix, so parity is unprovable; candidate for the P33/P34 edge inventory (add `scheme=https` or drop the router). |
| `thinx-staging` branch / `thinx-swarm` repo | — | phase-31 commits and `thinx-swarm@5e19c000` are **unpushed** (operator decision at the 31-03 gate) | ⚠️ Warning | The CI `check-traefik-mirror` gate has not run on CI for the v3 config (passes locally); the edge source of truth exists only on this workstation until pushed. Live edge does not depend on it. |
| runbook §Cutover mechanism (31-01 rows A, C) | :132, :136 | mechanism-table claim "v3 ignores `traefik.docker.*`" was wrong live → ~1 min 55 s web outage (22:04:50–22:06:45Z) | ℹ️ Info | Recorded as a Rule-3 deviation with CORRECTION markers and a hard input for P32–P34 (single-step label migrations). Goal still achieved; device paths unaffected. |
| `31-01-SUMMARY.md` | provides/accomplishments | says "18 flags"; corrected to 17 by 31-02 in the runbook | ℹ️ Info | Historical only; the artifact Plan 03 consumed (runbook/mirror) is correct. |
| plan `<verify>` / runbook inspect commands | — | `docker service inspect … Spec.Labels|Args` prints the live `admin-auth` apr1 hash and ACME e-mail to the operator/verifier terminal | ℹ️ Info | Unavoidable for the check; nothing recorded here or in git. Consider a `sed`-redacting wrapper for future phases (31-02 already did this on micro). |

### Human Verification Required

#### 1. Resolve the 12 judgment-tier prohibitions

**Test:** Review the Prohibitions table above (P1–P12). Each has a non-authoritative LLM-judge verdict "not violated" with repo/live evidence.
**Expected:** Operator confirms each verdict, or names the one that is wrong.
**Why human:** ADR-550 D4 — judgment-tier prohibitions are never silently green; interactive verification requires explicit human resolution per item at the end-of-phase checkpoint. Flag: `unverified-prohibition — human review recommended`.

#### 2. Post-B2 "every router enabled" gate, read-only, through the admin-auth dashboard

**Test:** `curl -u <operator-creds> https://micro.thinx.cloud/api/http/routers | jq -r '.[] | select(.status!="enabled") | .name + "  " + .status'` and `… /api/overview`.
**Expected:** Prints nothing; overview `http routers 30 / errors 0`, `services 18 / 0`, `middlewares 7 / 0`, providers `["Swarm"]` (the 2026-10-07T22:07:57Z record).
**Why human:** The live service has no `--api.insecure` and the API sits behind `admin-auth`; the verifier holds no credential. Behavioural corroboration is already strong (10/10 hosts serve; the three B2 routers apply their middleware chains), so this is a confirmation, not a suspected gap.

Already attested (no action unless re-confirmation is wanted): the full legacy device flow over `:7442` + plain MQTT and the console render were approved by the operator at the 31-03 Task 3 blocking-human gate (relayed by the orchestrator, 2026-10-08 local); the verifier re-checked only the non-mutating parts (ports open, `:7442` HTTP 200 plaintext, direct publish).

### Gaps Summary

No gaps. Every roadmap success criterion and every plan must-have is observably true in the repository and on the live swarm: the production edge runs `traefik:v3.7.14` with `--providers.swarm` + `--core.defaultRuleSyntax=v2` (v2 rule syntax proven live via the `HostRegexp` catch-all), every probed route serves its v2.11 baseline code with the `@swarm` middleware chains applied, the Let's Encrypt cert serial is unchanged and valid, the plaintext `:7442` and MQTT ports are open and direct-published, the committed source/mirror/live Args agree index-for-index (MIRROR OK), and the v2.11 rollback is staged-ready on micro (600/700-root snapshot + full-spec backup + digest image present locally + documented, dry-verified return path with the Stage-C clause now mandatory). Status is `human_needed` only because the phase's judgment-tier prohibitions require explicit operator resolution and the admin-auth router filter could not be re-run without a credential. Operational follow-ups, not gaps: push `thinx-staging` and `thinx-swarm@5e19c000` so the CI mirror gate runs; the pre-existing `registry.thinx.cloud` backend-scheme mismatch belongs in the P33/P34 inventory.

---

_Verified: 2026-10-07T22:35:00Z_
_Verifier: Claude (gsd-verifier)_
