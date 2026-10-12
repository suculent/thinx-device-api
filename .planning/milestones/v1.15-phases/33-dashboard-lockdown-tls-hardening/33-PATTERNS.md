# Phase 33: Dashboard Lockdown & TLS Hardening - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** 19 (6 thinx-swarm files, 3 this-repo config/script files, 1 new script, 4 captures/docs, 3 runbook/README/AGENTS docs, 2 planning artefacts; plus 2 scripts invoked-not-edited and the live services mutated by `docker service update`)
**Analogs found:** 18 / 19 (the only "no analog" is the thinx-swarm `README.md`, which is a 1-byte file today)

All analog paths are git-tracked (`git ls-files` verified in both repos on 2026-10-08; no `.gsd/` mirrors involved). Paths under `~/Repositories/thinx-swarm` are tracked in that sibling repo (master `158f369`). Nothing in this phase is application code; every artefact is a config edit, a shell script, a redacted capture or a runbook record, so the analogs are the Phase 31/32 artefacts of the same kind.

**Research corrections the planner must carry (RESEARCH §Q1/§Q3, falsified locally):** the `traefik-public` port label is load-bearing and stays; the `traefik-mgmt` router lives in the `traefik_traefik` **labels**, not in `tls.toml`; the file provider carries TLS only and is added in **Stage C** together with `tls-config-2` (configs are immutable, no hot reload); end state is **19** flags, not 18; the WS rule uses **`${WEB_HOSTNAME}`**, not `${THINX_HOSTNAME}`; `downtime_downtime`/`errorpage_errorpage` carry the v2 `traefik.docker.network` key live and must be flipped in one update before Stage B.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `~/Repositories/thinx-swarm/traefik.yml` (labels `:37-39`, `:59-81`; command block `:94-144`; configs `:167-170`) | config (static command + deploy labels) | transform (label/flag edit, one stage per commit) | itself — the Phase 31/32 comment+flag style at `traefik.yml:95-107,112-119`; Phase 32 Stage 2 record (`traefik-v3-cutover.md:1026-1062`) | exact |
| `~/Repositories/thinx-swarm/traefik/tls.toml` (full rewrite, TLS only) | config (file-provider dynamic config) | transform | itself `tls.toml:1-18` (same TOML shape; RESEARCH §Q2 gives the complete replacement) | exact |
| `~/Repositories/thinx-swarm/traefik.sh` (D-04 scrub) | config (bootstrap launcher) | — | itself `traefik.sh:1-28`; the `${EMAIL?Variable not set}` guard idiom in `traefik.yml:130` | exact |
| `~/Repositories/thinx-swarm/thinx.yml` (`:76-79` mosquitto, `:188`/`:438` noexpose, `:290` api middlewares, `:307` WS rule, `:365` console middlewares, `:369-370`/`:419-420` v1 STS) + `docker-swarm.yml` (`:121-124`, `:243`/`:510`, `:351`, `:379`, `:437`, `:441-442`/`:491-492`) | config (swarm stack deploy labels) | transform (label delete/rename) | `32-PATTERNS.md:29-56` (the paired edit of the same WS block in Phase 32); the two files are byte-identical in their traefik label sets | exact |
| `~/Repositories/thinx-swarm/vault.yml:35` (`traefik.docker.network` → `traefik.swarm.network`) | config | transform | `~/Repositories/thinx-swarm/downtime.yml:19-21` (the already-migrated unquoted label triple) | exact |
| `~/Repositories/thinx-swarm/README.md` (operator section, currently 1 byte) | doc | — | **none** — see "No Analog Found"; use `AGENTS.md:3-14` list style + RESEARCH §Q1 recipes | none |
| `docker-compose.traefik.yml` (regenerated after every thinx-swarm commit) | config (generated mirror) | transform (generated) | `scripts/generate-traefik-mirror.js:92-97` banner builder; `32-PATTERNS.md:122-140` | exact |
| `scripts/traefik-edge-scan.sh` (new, D-26) | utility (read-only live probe script) | request-response (curl/nmap/sslscan → stdout matrix) | `scripts/console-live-headers.sh:1-51` (closest: `set -u`, `HOSTS=` list, per-host loop, `OK`/`FAIL n` + exit 1); header-comment style from `scripts/csrf-live-probe.sh:1-40`; RESEARCH "Scan script skeleton" (`33-RESEARCH.md:733-755`) | exact |
| `.planning/runbooks/swarm-configs/traefik-edge-scan.<date>.md` (new, D-29) | doc (dated redacted evidence capture) | file-I/O | `.planning/runbooks/swarm-configs/traefik-acme-inventory.2026-10-06.md:1-30` (dated metadata-only capture with a Markdown matrix) | role-match |
| `.planning/runbooks/swarm-configs/traefik-edge.E.pre.yml` / `E.post.yml` (new step pair) | doc (redacted live capture) | file-I/O (ssh inspect → sed redact on micro → commit) | `.planning/runbooks/swarm-configs/traefik-edge.D.post.yml` (header `:1-21`, `command:` `:37-53`, `configs:` `:62-65`, `labels:` `:72-101`, `tls_toml:` `:129-147`, `acme_json:` `:151-160`, `entrypoints:` `:163-170`, `direct_publish:` `:172-175`) | exact |
| `.planning/runbooks/swarm-configs/README.md` (append step `E`) | doc | — | itself `README.md:20` (the per-step bullet that lists `C`/`D`) | exact |
| `.planning/runbooks/traefik-edge-hardening.md` (new sibling runbook, D-32) | doc (runbook) | — | `.planning/runbooks/traefik-v3-cutover.md` §Mechanism (`:962-979`), §Stage 2 record (`:1064-1118`), §Stage 3 record (`:1119-1140`) | exact |
| `AGENTS.md` (new section "Traefik dashboard/API access" + pointer) | doc (project instructions) | — | itself `AGENTS.md:16-22` ("Legacy plaintext device port — keep 7442": one bold `##`, dated operator decision, imperative do-not) and `:3-14` (deployment bullets with literal ssh form) | exact |
| `.planning/runbooks/traefik-edge-fixforward.md` rows #2–#5, `ROADMAP.md`, `STATE.md` ("16-flag" → "19-flag" where they describe the current state) | doc | — | the rows themselves `traefik-edge-fixforward.md:16-19` | exact |
| `33-NN-PLAN.md` (planner output) | plan | — | `32-02-PLAN.md:1-80` (frontmatter `must_haves` with `truths`/`artifacts`/`key_links`/`prohibitions`), `:147-189` (live-mutation task with `<precondition>`, auto-revert prose, `<verify>` `<automated>`/`<fails_when>` pairs) | exact |
| `scripts/generate-traefik-mirror.js`, `scripts/check-traefik-mirror.js` | utility (invoked, NOT edited) | file-I/O | — (`package.json:25-26` npm targets) | n/a |
| Live `traefik_traefik` (args ×4 stages + labels + config swap + `--force`), `thinx_mosquitto`, `downtime_downtime`, `errorpage_errorpage`, `thinx_console`, `thinx_vue`, `thinx_api`, external stacks (not files) | runtime config | request-response (ssh) | runbook Stage 2 `--args` record (`traefik-v3-cutover.md:1070-1082`), Stage 3 `--label-rm` record (`:1130-1139`); RESEARCH "Stage A2 / Stage C live command" (`33-RESEARCH.md:710-729`) | exact |
| `acme.json` on the named volume (Stage E: snapshot, prune, `--force`) | runtime data | file-I/O | runbook §Pre-cutover rollback snapshot (`traefik-v3-cutover.md:403-413`: `umask 077`, 600/700 root, "real values never leave the host"); RESEARCH §Q6 procedure (`33-RESEARCH.md:475-493`) | exact |
| `docker config tls-config-2` (new swarm config object) | runtime config | — | `traefik.yml:167-170` (`name: tls-config-${CONFIG:-1}`); RESEARCH §Q9 `docker config create` from the micro checkout (`33-RESEARCH.md:575`) | exact |

## Pattern Assignments

### `~/Repositories/thinx-swarm/traefik.yml` (config — static command + labels; Stages A1, A2, B, C, D)

**Analog:** itself. Every prior phase edited this file with the same two conventions: (1) a `# Phase NN (REQ-ID, D-xx): …` comment line directly above the flag/label it explains, and (2) one commit per stage so `git log` maps 1:1 to `docker service update` events.

**Comment + flag style to copy** (`traefik.yml:104-105` and `:112-119`):
```yaml
      # Expose every constraint-matching service by default (P30 D-05: audit deferred to Phase 33)
      - --providers.swarm.exposedbydefault=true
      # D-03 (Phase 30, EDGE-MIG-04): the vpn/mqtt/mqtts/thxp entrypoints below are VESTIGIAL —
      # defined here but NOT host-published by Traefik (Traefik publishes only :80/:443).
```
Stage B rewrites the first comment (keep the P30 reference, add `Phase 33 (EDGE-API-01, D-07): flipped to false — every edge service opts in with traefik.enable=true`). New flags go in the same `- --flag` list-item form, each with its own one-line `# Phase 33 (…, D-xx)` comment. Placement is free (nothing reads Args by index — RESEARCH A5); keep the `${EMAIL?Variable not set}` guard at `:130` untouched.

**Label block target state** — copy verbatim from RESEARCH "Code Examples" (`33-RESEARCH.md:681-707`): keep `traefik.enable`, `traefik.swarm.network`, `traefik.constraint-label`, the load-bearing `traefik.http.services.traefik-public.loadbalancer.server.port=8080` (with the LOAD-BEARING comment), add the three `traefik-mgmt` router labels, keep `https-redirect`, `security-headers` and `error-pages-middleware` definitions; delete `:37-39` (`admin-auth`), `:59-75` (both public routers), `:80-81` (the `admin-auth,error-pages-middleware` ref). The file uses unquoted list items except the three `error-pages-middleware` lines, which are double-quoted because of `{status}` — preserve that mix.

**Configs block** (`traefik.yml:167-170`) — Stage C changes only the default:
```yaml
configs:
  tls-config:
    name: tls-config-${CONFIG:-1}
    file: ./traefik/tls.toml # or /mnt/data/ingress/traefik/tls.toml
```
→ `name: tls-config-${CONFIG:-2}` plus a comment that swarm configs are immutable (bump `CONFIG`, `--config-rm/--config-add`, one restart).

**Flag-count gate idiom** (`32-02-PLAN.md:133`, reusable with 17/18/19 per stage):
```bash
test "$(grep '^ *- --' "$HOME/Repositories/thinx-swarm/traefik.yml" | wc -l | tr -d ' ')" -eq 19
```

---

### `~/Repositories/thinx-swarm/traefik/tls.toml` (config — file provider, Stage C)

**Analog:** itself. The current file (`tls.toml:1-18`) already has the `[tls] / [tls.options] / [tls.options.default]` nesting and a `cipherSuites = [ … ]` array with 8-space-indented quoted names — keep that indentation so the `diff` reads as a pure content change.

**Current content to replace** (`tls.toml:4-6`, note `sniStrict = true` and the four CBC suites plus the three TLS 1.3 names that Traefik ignores):
```toml
      minVersion = "VersionTLS12"
      sniStrict = true
      cipherSuites = [
```
**Target:** the complete block in RESEARCH §Q2 (`33-RESEARCH.md:343-365`) — `sniStrict = false`, `curvePreferences = ["X25519", "CurveP256"]`, the six ECDHE AEAD suites, the 7-line header comment. No `alpnProtocols`, no `preferServerCipherSuites`, no `maxVersion`.

**Deployed-bytes gate** (RESEARCH §Q8 "Config mounted (C)" and §Q9):
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker config create tls-config-2 /mnt/gluster/deployment/swarm/traefik/tls.toml && docker config inspect tls-config-2 --format '{{.Spec.Data}}' | base64 -d | sha256sum"
# expect: == sha256sum ~/Repositories/thinx-swarm/traefik/tls.toml  (created FROM the micro checkout, never scp'd)
```

---

### `~/Repositories/thinx-swarm/traefik.sh` (config — bootstrap launcher, D-04 scrub)

**Analog:** itself (`traefik.sh:1-28`, 28 lines) and the env-guard idiom already in `traefik.yml:130`.

**Keep** lines 1-10 (network create ×2, `NODE_ID`, node label) and line 27 (`docker stack deploy -c ./traefik.yml traefik`, bootstrap only). **Delete** every `export` of `DOMAIN`, `USERNAME`, `PASSWORD`, both `HASHED_PASSWORD` lines and the `# This step will require the password` comment (`:12-25`).

**Replace** the `export EMAIL=<literal>` line with the yml's own guard shape:
```bash
# Phase 33 (EDGE-TLS-03, D-04/D-21): EMAIL comes from the environment — never a literal in git (P29 D-12).
: "${EMAIL:?set EMAIL in the environment before running traefik.sh}"
# NOTE: this script is first-time bootstrap only. Live edge changes go via `docker service update`
# (args/labels/configs), never `docker stack deploy` / restart.sh — see AGENTS.md.
```

**D-04 compare (before Stage A2, values over stdin only)** — copy the two one-liners from RESEARCH §Q8 row "D-04 hash compare" (`33-RESEARCH.md:547`); output is exactly `HASH-LITERAL=MATCH|NO-MATCH` and `PASSWORD=MATCH|NO-MATCH`. Pattern precedent: `32-PATTERNS.md:334-337` (apr1 compare on micro with `openssl passwd -apr1 -salt "$SALT" -stdin`, print a word only, no `set -x`).

**Post-scrub gate:**
```bash
test "$(grep -cE '^export (DOMAIN|USERNAME|PASSWORD|HASHED_PASSWORD)=' "$HOME/Repositories/thinx-swarm/traefik.sh")" -eq 0 && grep -q ':.*EMAIL:?' "$HOME/Repositories/thinx-swarm/traefik.sh"
```

---

### `~/Repositories/thinx-swarm/thinx.yml` + `docker-swarm.yml` (config — D-08 label clean-up, D-17 optional ref removal)

**Analog:** `32-PATTERNS.md:29-56` — the Phase 32 paired edit of the identical `thinx-api-ws` block; both files carry byte-identical traefik label sets and must stay identical (the only permitted diff is the 3 SEC-CFG-04 secret attachments). Both files use the **double-quoted** list-item style for traefik labels — keep it.

**Edits, line-exact (thinx.yml / docker-swarm.yml):**

| Edit | thinx.yml | docker-swarm.yml | Action |
|---|---|---|---|
| mosquitto: delete 4 labels (`tcp.services.mosquitto…port`, `tcp.routers.mosquitto-secure.entrypoints`, `traefik.enable`, `traefik.swarm.network`) | `:76-79` | `:121-124` | delete; leave `swarmpit.service.deployment.autoredeploy=true` and `ports:` untouched |
| WS rule host | `:307` | `:379` | `Host(\`rtm.thinx.cloud\`)` → ``Host(`${WEB_HOSTNAME}`)``; keep `&& HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)` byte-exact |
| v1 STS labels | `:369-370`, `:419-420` | `:441-442`, `:491-492` | delete both lines on console and vue |
| `noexpose` container labels | `:188`, `:438` | `:243`, `:510` | delete (note: ContainerSpec label → live `--container-label-rm` restarts transformer/worker, RESEARCH Pitfall 11) |
| redundant `security-headers@swarm` refs (optional, after Stage D) | `:290` → `sslheaders@swarm`; `:365` delete | `:351`, `:437` | same |

**Current WS line** (`docker-swarm.yml:379`; `thinx.yml:307` identical) and the console analog that already uses the variable (`thinx.yml:361`):
```yaml
        - "traefik.http.routers.thinx-api-ws.rule=Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)"
        - "traefik.http.routers.thinx-console-https.rule=Host(`${WEB_HOSTNAME}`)"
```
**Comment pattern** (`docker-swarm.yml:377-378`): extend the existing comment with one `# Phase 33 (EDGE-API-01, D-08): Host is ${WEB_HOSTNAME} (= rtm.thinx.cloud), NOT ${THINX_HOSTNAME} (= app) — 32-REVIEW IN-05 as corrected by 33-RESEARCH §Q3.` line.

**Parity check idiom** (`32-PATTERNS.md:54`): `diff <(grep -o 'traefik\.[^"]*' docker-swarm.yml | sort) <(grep -o 'traefik\.[^"]*' ~/Repositories/thinx-swarm/thinx.yml | sort)` → empty (RESEARCH §Q9: the one extra `traefik.swarm.network` string in `docker-swarm.yml:370` is a comment — strip comment lines first with `grep -v '^ *#'`).

---

### `~/Repositories/thinx-swarm/vault.yml:35` and the live `downtime_downtime` / `errorpage_errorpage` key flip (config — v2 → v3 network label)

**Analog:** `~/Repositories/thinx-swarm/downtime.yml:19-21` — the same triple already migrated (unquoted style, which `vault.yml` also uses):
```yaml
        - traefik.enable=true
        - traefik.swarm.network=traefik-public
        - traefik.constraint-label=traefik-public
```
`vault.yml:35` becomes `- traefik.swarm.network=traefik-public` (file-only; no `vault` service runs).

**Live flip, ONE update per service, never both keys at once** (RESEARCH §Q3 item 2 / Pitfall 10; precedent 31-03 B1 in `traefik-v3-cutover.md:518-522`):
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-rm traefik.docker.network --label-add traefik.swarm.network=traefik-public downtime_downtime"
# expect: rc 0; task id pre == post; label readback: exactly one traefik.swarm.network line, zero traefik.docker.network
```

---

### `docker-compose.traefik.yml` (generated mirror — regenerate after EVERY thinx-swarm commit)

**Analog:** `32-PATTERNS.md:122-140`; generator banner `scripts/generate-traefik-mirror.js:92-97`:
```javascript
function buildMirror(sourceBody, sourceSha, nowIso) {
    const body = redactSecrets(sourceBody);
    const line1 = BANNER_PREFIX + sourceSha + " generated:" + nowIso + " by " + GENERATOR;
    const line2 = SHA256_PREFIX + sha256(body);
    return line1 + "\n" + line2 + "\n" + body;
}
```
The checker's freshness mode compares the banner SHA to `git -C <swarm-repo> rev-parse HEAD` (`check-traefik-mirror.js:22-23,70`) — so a `tls.toml`-only, `thinx.yml`-only or `README.md`-only thinx-swarm commit **also** needs regeneration (RESEARCH Pitfall 12). `redactSecrets` (`generate-traefik-mirror.js:67-76`) masks `basicauth.users=…:<hash>` and UUIDs; after Stage A2 there is no basicauth line left in `traefik.yml`, which is fine (the regex simply does not match).

**Command + gate** (`traefik-v3-cutover.md:1051-1053`, flag count per stage):
```bash
node scripts/generate-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm" && node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"
# expect: MIRROR-GENERATED ok source=thinx-swarm@<sha> -> docker-compose.traefik.yml ; MIRROR OK files=1
grep -c '^ *- --' docker-compose.traefik.yml      # expect: 17 after A, 17 after B, 18 after C, 19 after D
git diff --quiet -- docker-compose.traefik.yml    # after commit: regeneration is idempotent
```

---

### `scripts/traefik-edge-scan.sh` (utility — new, D-26..D-28)

**Analog:** `scripts/console-live-headers.sh` (51 lines, the closest read-only live header probe in the repo). Copy its skeleton; fill the body from the RESEARCH skeleton (`33-RESEARCH.md:735-754`).

**Header + variables pattern** (`console-live-headers.sh:1-19`):
```bash
#!/usr/bin/env bash
#
# console-live-headers.sh — Phase 25 live edge-header check for both console hosts (read-only).
#
# … prints one line per host/path …
# then `LIVE-HEADERS OK` when every line … otherwise `LIVE-HEADERS FAIL {n}` and exit 1.
# Only header names and those fixed values are printed.

set -u

HOSTS="rtm.thinx.cloud console.thinx.cloud"
```
**Per-host loop + verdict pattern** (`console-live-headers.sh:21-51`):
```bash
fail=0
for host in $HOSTS; do
    headers=$(curl -sS -m 20 -A thinx-p25-probe -o /dev/null -D - "https://${host}${path}" | tr -d '\r')
    …
    [ "$ok" = "1" ] || fail=$((fail + 1))
done
if [ "$fail" = "0" ]; then echo "LIVE-HEADERS OK"; else echo "LIVE-HEADERS FAIL ${fail}"; exit 1; fi
```
**Apply to the new script:** `set -u` (not `-e`: a closed port or refused handshake is a *result*, not a crash — `probe-rtm-handshake.sh:22-25` records the same "detect-only, failures surface in text" rule); `EDGE_IP=188.166.23.244`; `HOSTS=` = the D-27 list; `WANT12=` the three observable `ECDHE_RSA` suites (RESEARCH Pitfall 6 — never expect the ECDSA names); one `## Port sweep` section then one `## <host>` section per host; each predicate prints `FAIL <check> <host>` on miss; end with `EDGE-SCAN OK` or `EDGE-SCAN FAIL <n>` + `exit 1` so the plan's `<fails_when>` is "any line starting with FAIL / exit non-zero". Print header names and fixed values only — no response bodies, no cert bodies (secret hygiene). Document in the header that it runs from the laptop only (micro sees `10.0.0.2`, RESEARCH §Q7). Usage line as in `csrf-live-probe.sh:11-14` (`scripts/traefik-edge-scan.sh > .planning/runbooks/swarm-configs/traefik-edge-scan.$(date -u +%F).md`-style redirect is the intended use). `shellcheck`-clean, quoted expansions, no `eval` (`probe-rtm-handshake.sh:21-24`).

---

### `.planning/runbooks/swarm-configs/traefik-edge-scan.<date>.md` (doc — dated redacted evidence capture)

**Analog (role-match):** `traefik-acme-inventory.2026-10-06.md:1-30` — a dated, metadata-only capture with a short provenance preamble and one Markdown matrix.

**Preamble pattern** (`traefik-acme-inventory.2026-10-06.md:1-13`):
```markdown
# Traefik ACME certificate inventory — 2026-10-06

Phase 29 (EDGE-RECON-01, D-10). Metadata only — **no private keys, no certificate bodies** …
- **Authoritative ACME storage (live):** …
- **Certificates issued:** 24. … Metadata read via `jq …` + `openssl x509 -noout -issuer -enddate` …
```
**Apply:** `# Traefik edge external scan — <YYYY-MM-DD>` → `Phase 33 (EDGE-API-01/02, EDGE-TLS-01/02/03, D-26..D-29). Laptop-only (`nmap 7.94`, `sslscan 2.2.2`, `curl`, `openssl 3.6.3`); no third-party scanner; header names + fixed values + port states only.` → a `## Before (pre-Stage-A1, <UTC>)` and `## After (post-Stage-E, <UTC>)` section, each the script's stdout plus a per-host matrix with columns `host | https code | HSTS | TLS1.0/1.1 | TLS1.2 suites | TLS1.3 | cert serial`; `## Reported, not gating` for D-20 redirect gaps and D-16 no-SNI subject. Secret-marker grep → 0 (Shared Patterns below).

---

### `.planning/runbooks/swarm-configs/traefik-edge.E.pre.yml` / `E.post.yml` (doc — redacted live captures)

**Analog:** `traefik-edge.D.post.yml` (immutable Phase 32 record). Copy the section order and the comment-per-line idiom; `E.pre.yml` should differ from `D.post.yml` only in header/timestamps.

**Header pattern** (`traefik-edge.D.post.yml:1-21`): phase/requirement/decision ids, capture time UTC, `AUTHORITATIVE SOURCE = running task state (P30 D-08)`, "Redacted + NOT executable per swarm-configs/README (secrets -> literal `<redacted>`, `${VAR}` kept templated …)", "Redaction was applied ON micro", image tag line, `STEP E POST — …` summary, "Delta vs traefik-edge.E.pre.yml: …", "Rollback sources (REAL values, 600 root, never committed), by path only:".

**`command:` section** (`D.post.yml:37-53`) — one flag per line with a trailing `# …` note; for `E.post.yml` list the 19 flags, marking the three new ones `# Phase 33 Stage A1/C/D` and the flip `# Phase 33 Stage B`. Keep `--certificatesresolvers.le.acme.email=${EMAIL}` templated.

**`configs:` section** (`D.post.yml:62-65`):
```yaml
  configs:
    - config_name: tls-config-1                           # committed: name tls-config-${CONFIG:-1}, so CONFIG=1 live
      target: /traefik/tls.toml
      mode: "0444"                                        # sha256 7e43d8f9… == committed thinx-swarm/traefik/tls.toml (zero drift, re-read 15:14Z)
```
→ `tls-config-2` / `${CONFIG:-2}` / the new sha256.

**`labels:` section** (`D.post.yml:72-101`) — map form, basicauth value `<redacted>`; `E.post.yml` drops `admin-auth` + `traefik-public-*` and adds the three `traefik-mgmt` lines; `traefik.http.services.traefik-public.loadbalancer.server.port: "8080"` stays with a `# LOAD-BEARING` comment.

**`tls_toml: |`** (`D.post.yml:129-147`) — the mounted file verbatim (new content in E.post). **`acme_json:`** (`D.post.yml:151-160`) — `stat_pre`/`stat_post`, `certificates:` (24 → 23), served serials (influx serial NEW in E.post), `re_challenges_in_phase: 1` with the influx reissue timestamp. **`entrypoints:`** (`D.post.yml:163-170`) — add `":8080 mgmt": { defined_in_traefik: true, traefik_published: false, bound: "127.0.0.1 inside the task netns only", notes: "api@internal via traefik-mgmt@swarm; ssh + docker exec plane" }`. **`direct_publish:`** (`D.post.yml:172-175`) — re-verified harness line.

Add new sections for this phase in the same `key: value # comment` style: `mgmt_api_inventory:` (29 routers / 18 services / 6 middlewares, providers `["Swarm","File"]`), `hsts_matrix:` (17 hosts → `1`), `ws_probe:` (`101` cookie-less / `401` cookie, no STS on the 101), `external_scan:` (link to `traefik-edge-scan.<date>.md`).

---

### `.planning/runbooks/swarm-configs/README.md` (append step `E`)

**Analog:** itself `README.md:20` — the single bullet that enumerates steps:
```markdown
- `traefik-edge.<step>.{pre,post}.yml` — the Traefik edge service (…) captured before/after each edge step, redacted on micro before being read off the host. Steps: `A`/`B` (Phase 30, …), `C` (Phase 31 v2.11 -> v3.7.14 hop, BC mode: 17-flag command …), `D` (Phase 32 native-v3 rules + BC-switch removal: 16-flag command, …). Each `.post.yml` is an immutable phase record; the next phase opens a new step pair instead of editing it.
```
Append inside the `Steps:` list: `` `E` (Phase 33 dashboard lockdown + TLS hardening: 19-flag command — loopback `mgmt` entrypoint, `exposedbydefault=false`, file provider loading `tls-config-2`, entrypoint-default `security-headers@swarm` — `traefik-mgmt` router labels, ACME store 23 entries) ``. Add one bullet for the scan capture: `` `traefik-edge-scan.<YYYY-MM-DD>.md` — laptop external scan (nmap/sslscan/curl) before/after matrix for Phase 33; header names, port states and fixed values only. `` Line 38 (`${VAR}` templated rule) already covers `${EMAIL}`/`${CONFIG}`; after D-04 `${DOMAIN}`/`${USERNAME}`/`${HASHED_PASSWORD}` no longer occur — leave the sentence, it is historical.

---

### `.planning/runbooks/traefik-edge-hardening.md` (doc — new sibling runbook, D-32)

**Analog:** `.planning/runbooks/traefik-v3-cutover.md` §Mechanism + §Stage records. Reuse its three building blocks verbatim in shape:

**(1) Mechanism table** (`traefik-v3-cutover.md:962-979`): intro sentence "Every live change is one `docker service update`; repo first (D-04) before each stage. No stack deploy, no `restart.sh`, no `--api.insecure` on the live service." then a `| Stage | Command shape | Risk … |` table — one row per A1/A2/B/C/D/E (+ the D-08 label-only rows between them) with the per-stage rollback command in the risk cell.

**(2) Stage record block** (`traefik-v3-cutover.md:1064-1118`): bold outcome paragraph → "Precondition re-read" line → fenced command block with `# expect:` lines → `| Time (UTC) | Step | Observed |` table → "**D-30 trigger evaluation: none fired**" paragraph → a standalone `Version.Index post-Stage-X: <N>` line (the next stage's `<precondition>` reads it back) → "Repo state == live state after this task" line.

**Command-block idiom** (`traefik-v3-cutover.md:1070-1077`), the `jq map(@sh)` rebuild from the 600-root backup that every `--args` stage copies:
```
ssh micro "umask 077; B=/mnt/data/edge-rollback/traefik-p32-prestage2-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B && chmod 600 \$B; \
  jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; …"
# expect: 17 ; … — this file is the 17-flag revert source, 600 root, never leaves micro, never committed
ssh micro "ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | del(.[3]) | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: rc 0; ONE task restart; image unchanged; Version.Index advances; args=16
```
Phase 33 variants: `+ ["--entrypoints.mgmt.address=127.0.0.1:8080"]` (A1), `map(if . == "--providers.swarm.exposedbydefault=true" then "--providers.swarm.exposedbydefault=false" else . end)` (B), `+ ["--providers.file.filename=/traefik/tls.toml"]` with `--config-rm tls-config-1 --config-add source=tls-config-2,target=/traefik/tls.toml,mode=0444` (C), `+ ["--entrypoints.https.http.middlewares=security-headers@swarm"]` (D) — RESEARCH `33-RESEARCH.md:722-729`. Backup names `traefik-p33-pre<Stage>-<UTC>.json`.

**(3) Label-only record** (`traefik-v3-cutover.md:1130-1139`): one `docker service update --detach --label-rm … <svc>` per line, `# expect each: rc 0; task id pre == post (label-only); label readback = …`, then a `grep -c` over the label dump → `0`.

New sections this runbook must add (no analog, write from RESEARCH §Q1): "Reaching the API/dashboard" — the gate recipe (`docker exec $C wget -qO- http://127.0.0.1:8080/api/overview`, `33-RESEARCH.md:305-308`), the `nsenter` fallback (`:310`), the laptop `socat` bridge (`:314-322`). Runbook prose may abbreviate to `ssh micro "…"` (the file's own convention, `traefik-v3-cutover.md:11`); plans must not.

---

### `AGENTS.md` (doc — new section + pointer)

**Analog:** itself `AGENTS.md:16-22` — the operator-decision section shape:
```markdown
## Legacy plaintext device port — keep 7442

The plaintext HTTP device port **7442** (next to HTTPS 7443) and plain (non-TLS) MQTT are
**required**: … Operator decision 2026-10-04. Do not close,
redirect or TLS-enforce them as a "hardening" fix; any hardening on these paths must keep plaintext
clients working.
```
and the deployment bullets `AGENTS.md:12-14` (literal ssh form, swarm path).

**Apply:** add `## Traefik dashboard/API access — ssh plane only (Phase 33)` directly after the keep-7442 section: 3-5 lines stating there is no public dashboard/API (D-01), the API is on the loopback `mgmt` entrypoint inside the task, the gate one-liner (`ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); docker exec \$C wget -qO- http://127.0.0.1:8080/api/overview"`), the socat bridge one-liner for a browser, "never `--api.insecure`, never `docker stack deploy`/`restart.sh` for edge changes (use `docker service update`)", and the pointer `See .planning/runbooks/traefik-edge-hardening.md`. Add one bullet under `## Deployment` (`:3-14`): `- Edge (Traefik) changes: docker service update only — see "Traefik dashboard/API access" below.`

---

### `33-NN-PLAN.md` (planner output)

**Analog:** `32-02-PLAN.md`. Frontmatter `must_haves` (`:20-56`) splits `truths` (observable live/repo facts, each citing D-xx), `artifacts` (files + live objects + the 600-root backup path by name), `key_links` (ordering dependencies), `prohibitions` (keep-7442, no stack deploy, no `--api.insecure`, no two-label bridge, never edit micro's checkout in place, never hand-edit the mirror, no `thinx-staging` push mid-stage). Copy those prohibitions verbatim and add: "never remove the `traefik-public` port label", "never add `--providers.file` while `tls-config-1` is mounted", "never set `alpnProtocols`", "`acme.json` edit → `--force` within seconds, snapshot first", "D-04 compare values travel over ssh stdin only".

**Live-mutation task shape** (`32-02-PLAN.md:147-189`): `<precondition>` names the exact live state and the backup; the action prose carries pre-flight backup → dry-print masked → index-exact diff vs the mirror → "pre" gate row → fire ONE update → wait Running → evaluate triggers **in order** → auto-revert without a human → record a standalone `Version.Index post-Stage-X:` line.

**`<verify>` pairs to copy** (`32-02-PLAN.md:170-189`; swap counts/tokens):
```xml
<automated>ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len .Spec.TaskTemplate.ContainerSpec.Args}}'" | grep -qx 'traefik:v3.7.14 args=16'</automated>
<fails_when>grep exits 1 — the live service is not on the 16-flag command (…).</fails_when>
<automated>test "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 15 http://188.166.23.244/)" = '301 https://188.166.23.244/' && test "$(curl -sk -o /dev/null -w '%{http_code}' -m 15 https://188.166.23.244/)" = '200'</automated>
<fails_when>either comparison fails — the catch-all routers died silently (…), a D-10 trigger.</fails_when>
```
Replace the credentialed status filter (`:178`, `/root/.p32-traefik-admin`) with the loopback form from RESEARCH §Q8 row "mgmt router + API reachable":
```bash
test -z "$(ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); docker exec \$C wget -qO- http://127.0.0.1:8080/api/http/routers | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status'")"
```
and the WS probe (`:182-183`) with the **101/401 pair** (cookie-less → `HTTP/1.1 101`, cookie → `HTTP/1.1 401` + `X-Forwarded-Proto: https`; RESEARCH Pitfall 7).

---

### Live `docker service update` commands (runtime config — not files)

**Analog:** Stage 2 (`--args`) and Stage 3 (`--label-rm`) records above; RESEARCH "Stage A2 live command" (`33-RESEARCH.md:711-720`) is the ready-made A2 form (10 `--label-rm` + 3 `--label-add` in ONE update, backticks escaped as `` \` `` inside the double-quoted remote string). Per-stage expectations: `--args`/`--config-*`/`--force` → one task restart ~15 s, `Version.Index` advances; `--label-*` → same task id. Record the `Version.Index` after every stage.

**acme.json snapshot/edit** (Stage E) — copy the snapshot shape from `traefik-v3-cutover.md:403-413` (`umask 077`, dir 700 root, files 600 root, "real values never leave the host") and the procedure block from RESEARCH §Q6 (`33-RESEARCH.md:475-493`): snapshot three files → `rm` the two stale ones → `jq del(…)` into `acme.json.new` → `jq -e` count check → `chmod 600` → `mv` → `docker service update --detach --force traefik_traefik` in the **same** remote command (seconds between edit and restart, Pitfall 9) → watch the influx serial change.

## Shared Patterns

### Repo-first chain with the thinx-swarm → micro fast-forward
**Source:** `traefik-v3-cutover.md:1047-1053` (Stage 2 record); `32-PATTERNS.md:319-327`; memory `thinx-swarm-deploy-checkout.md`
**Apply to:** every stage (A, B, C, D) and every D-08 file edit: edit thinx-swarm → commit → `git push origin master` → push to micro as `p33-stage<X>` → `git merge --ff-only` on micro → regenerate mirror + commit `docker-swarm.yml`/mirror here → THEN the `docker service update`.
```bash
cd ~/Repositories/thinx-swarm && git push origin master
GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020" git push ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/heads/p33-stageA
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "cd /mnt/gluster/deployment/swarm && git status --short | grep -v '^??' | wc -l; git merge --ff-only p33-stageA && git branch -d p33-stageA && git rev-parse HEAD"
# expect: 0 ; Fast-forward ; HEAD == workstation HEAD
```
Never edit files in place on micro. Stage C additionally creates `tls-config-2` **from the micro checkout** after the ff-merge.

### Micro ssh literal form + remote quoting
**Source:** `AGENTS.md:13`; memory `micro-ssh-direct-form.md`; `32-02-PLAN.md:170-189`
**Apply to:** every PLAN `<automated>` and executor command. Write `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "…"` literally; inside the double-quoted remote string escape `$` as `\$` and backticks as `` \` ``; use `$C` = `$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1)` for `docker exec` (node-local — Traefik is pinned to micro, still assert exactly one running task).

### 600-root out-of-git backup before every mutation
**Source:** `traefik-v3-cutover.md:403-413,1070-1078`; RESEARCH §Q6 step 1
**Apply to:** each `--args` stage (full `docker service inspect` JSON → `/mnt/data/edge-rollback/traefik-p33-pre<Stage>-<UTC>.json`), Stage A2 (same file is the label revert source), Stage E (`traefik-p33-acme-<UTC>/` dir 700 with the three acme files). `umask 077`, `chmod 600`, never copied off micro, referenced in captures **by path only**.

### Gate quartet: status filter + HTTPS matrix + WS 101/401 pair + bare-IP pair (+ TLS handshake triple from Stage C)
**Source:** `32-PATTERNS.md:339-350`; RESEARCH §Q8 table (`33-RESEARCH.md:522-549`) and D-30 trigger list (`:551`)
**Apply to:** the "pre" row before and the gate after every stage A1, A2, B, C, D, E and each D-08 live update.
```bash
# (1) status filter via the loopback API (A2 onward): prints nothing
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); docker exec \$C wget -qO- http://127.0.0.1:8080/api/http/routers | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status + \"  \" + (.error|tostring)'"
# (2) HTTPS code matrix — 17 hosts, identical to the pre-stage baseline (re-baseline micro.thinx.cloud after A2)
for H in rtm.thinx.cloud app.thinx.cloud console.thinx.cloud thinx.cloud www.thinx.cloud swarmpit.thinx.cloud registry.thinx.cloud db.thinx.cloud influx.thinx.cloud www.fotostim.com www.fotostim.cz fotostim.com fotostim.cz igraczech.com www.igraczech.com www.syxra.cz micro.thinx.cloud; do curl -sS -o /dev/null -m 15 -w "$H %{http_code}\n" https://$H/; done
# (3) WS pair: cookie-less -> HTTP/1.1 101 Switching Protocols ; with Cookie -> HTTP/1.1 401 + X-Forwarded-Proto: https (after D: the 101 still has NO STS line)
K=dGhlIHNhbXBsZSBub25jZQ==; curl -s --http1.1 -D - -o /dev/null -m 10 -H 'Connection: upgrade' -H 'Upgrade: websocket' -H "Sec-WebSocket-Key: $K" -H 'Sec-WebSocket-Version: 13' https://rtm.thinx.cloud/ | head -1
# (4) bare-IP pair: 301 https://188.166.23.244/ ; 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -m 15 http://188.166.23.244/; curl -sk -o /dev/null -w '%{http_code}\n' -m 15 https://188.166.23.244/
# (5) Stage C only: -tls1_2 and -tls1_3 succeed, -tls1_1 and CBC fail, for rtm/app/console
for H in rtm.thinx.cloud app.thinx.cloud console.thinx.cloud; do echo | openssl s_client -connect $H:443 -servername $H -tls1_2 -cipher ECDHE-RSA-AES128-SHA 2>&1 | grep -c 'handshake failure'; done   # expect: 1 x3
```
Before A2 the status filter cannot use the loopback path; take the 30-router list from `D.post.yml` (verified 15:12Z) as the baseline (RESEARCH Open Question 4) rather than re-staging a credential.

### Loopback management plane (replaces the P32 credential pattern)
**Source:** RESEARCH §Q1 (`33-RESEARCH.md:302-322`), §Q8 rows "mgmt bind", "Not reachable from the overlay / host / internet"
**Apply to:** every API readback from A2 on, AGENTS.md, the runbook, thinx-swarm README. Gates: `docker exec $C wget -qO- http://127.0.0.1:8080/api/…` (busybox `wget`, no `curl` in the image). Fallback: `nsenter -t $(docker inspect -f '{{.State.Pid}}' $C) -n curl …`. Negative proofs after A1: `nsenter … ss -ltn | grep 8080` → `127.0.0.1:8080` only; overlay `docker run --rm --network traefik-public alpine:3.20 sh -c 'nc -z -w2 traefik 8080'` → CLOSED; host `curl 127.0.0.1:8080` → rc 7; laptop `curl 188.166.23.244:8080` → rc 7. The P32 `/root/.p32-traefik-admin` file and `shred -u` step are **not** needed (D-03).

### Device-flow harness + port triple (keep-7442 guard)
**Source:** `32-PATTERNS.md:356-364`; RESEARCH §Q8 rows "Ports open (micro)" and "Device-flow harness"
**Apply to:** baseline before A1 and the D-31 evidence set after E (and after C, since TLS options touch the HTTPS device path).
```bash
cd ~/Repositories/thinx-mcp-device && THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs p33-7442 http://rtm.thinx.cloud 7442 thinx.cloud 1883
cd ~/Repositories/thinx-mcp-device && THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs p33-https https://app.thinx.cloud
# expect: PASS each; recreate the harness per 31-03-SUMMARY D5 if /tmp was cleaned
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "for p in 7442 1883 8883; do timeout 3 bash -c \"</dev/tcp/127.0.0.1/\$p\" && echo \$p OPEN || echo \$p CLOSED; done"   # expect: 3x OPEN
```

### Secret hygiene in committed artefacts (P29 D-12)
**Source:** `swarm-configs/README.md:34-38`; `31-03-PLAN.md:173`; `32-PATTERNS.md:366-368`; RESEARCH §Q8 "Capture hygiene" and "D-04 hash compare"
**Apply to:** `E.pre.yml`, `E.post.yml`, `traefik-edge-scan.<date>.md`, the runbook, AGENTS.md, thinx-swarm README, every SUMMARY, the scrubbed `traefik.sh`. Redact on micro before reading output; `<redacted>` for any hash; `${EMAIL}`/`${CONFIG}` templated; the D-04 result is a word (`MATCH`/`NO-MATCH`), never a value. Gate before every commit:
```bash
test "$(grep -Ec '\$apr1\$|\$2[aby]\$|BEGIN |PRIVATE KEY|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' <file>)" -eq 0
```
(exclude the literal `api@internal` / `security-headers@swarm` tokens from the e-mail regex — they have no dot-TLD after `@`, so the regex above does not match them; verify once on `E.post.yml`.)

### Phase-comment convention in config files
**Source:** `traefik.yml:95-107,112-119`; `downtime.yml:23`; `docker-swarm.yml:377-378`
**Apply to:** every edited line in `traefik.yml`, `tls.toml`, `thinx.yml`, `docker-swarm.yml`, `vault.yml`, `traefik.sh`. Form: `# Phase 33 (REQ-ID, D-xx): <what changed and why, one or two lines>` directly above the line; removals get a comment that does **not** repeat the removed token (RESEARCH Pitfall 8 precedent — gates grep for the token, e.g. `admin-auth`, `traefik-public-https`, `exposedbydefault=true`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `~/Repositories/thinx-swarm/README.md` | doc (operator-facing deploy-repo README) | — | The file is 1 byte today; no other README in thinx-swarm. Write it from scratch using `AGENTS.md:3-14` bullet style: purpose of the repo, "edge changes = `docker service update`, never `stack deploy`/`restart.sh`", how to reach the Traefik dashboard (socat bridge recipe, RESEARCH `33-RESEARCH.md:314-322`) and the JSON API (`docker exec … wget`), the `CONFIG` bump rule for `tls.toml`, `EMAIL` from the environment, and a pointer to `thinx-device-api/.planning/runbooks/traefik-edge-hardening.md`. Commit it in thinx-swarm (triggers a mirror regeneration — Pitfall 12). |

Note for the planner: `33-CONTEXT.md` D-13 says "18 flags"; the mirror/flag-count gates must use **19** (RESEARCH §Q3). CONTEXT D-01 says the `traefik-public` port label is removed; the gate "labels on traefik_traefik (A2)" must instead assert it is **present** (RESEARCH Pitfall 1). Both corrections need the user nod flagged in RESEARCH Open Question 1 — surface them in the plan's `must_haves.truths` with the `[flagged assumption]` prefix used in `32-02-PLAN.md:28`.

## Metadata

**Analog search scope:** `.planning/phases/32-v3-native-syntax-bc-removal/{32-PATTERNS.md,32-02-PLAN.md}`, `.planning/runbooks/traefik-v3-cutover.md` (§Mechanism, §Stage 2/3 records, §Pre-cutover snapshot, §Rollback), `.planning/runbooks/swarm-configs/{README.md,traefik-edge.D.post.yml,traefik-acme-inventory.2026-10-06.md}`, `.planning/runbooks/traefik-edge-fixforward.md`, `scripts/{console-live-headers.sh,probe-rtm-handshake.sh,csrf-live-probe.sh,generate-traefik-mirror.js,check-traefik-mirror.js}`, `docker-swarm.yml`, `AGENTS.md`, `package.json`, `services/traefik/update.sh`, `~/Repositories/thinx-swarm/{traefik.yml,traefik/tls.toml,traefik.sh,thinx.yml,vault.yml,downtime.yml,README.md}`
**Files scanned:** 24
**Pattern extraction date:** 2026-10-08
