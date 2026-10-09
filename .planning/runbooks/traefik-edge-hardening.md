# Traefik edge hardening — Phase 33 (dashboard lockdown, exposure flip, TLS options, HSTS, ACME)

Sibling of `traefik-v3-cutover.md` (Phases 29–32). Scope: **EDGE-API-01 / EDGE-API-02** (public Traefik
dashboard/API route removed, API moved to a loopback-only management entrypoint inside the task, exposure
opt-in) and **EDGE-TLS-01 / 02 / 03** (AEAD-only TLS 1.2 options via the file provider, edge-wide HSTS via the
`:443` entrypoint default middleware, ACME e-mail/permissions/renewal proof). The image stays `traefik:v3.7.14`
(P31 D-03 — exact tag, never `@sha256`). **Never `--api.insecure`** on the live service, in `traefik.yml` or in
a throwaway on micro (D-02, P32 D-12). **Never `docker stack deploy` / `restart.sh`** for an edge change
(drops the live-only secret mounts, resets the edge auth hashes) — every live mutation is ONE
`docker service update` (`--args` / `--label-*` / `--container-label-rm` / `--config-*` / `--force`), repo
first (P32 D-04), with a 600-root out-of-git backup on micro and a one-command rollback. **Keep-7442:** the
plaintext `:7442` device port and plain MQTT `:1883` (+ `:8883`) are direct-published by `thinx_api` /
`thinx_mosquitto`, never by Traefik — nothing in this phase may close, redirect, TLS-enforce or re-route them
(AGENTS.md operator decision 2026-10-04); the thxp/mqtt/mqtts entrypoint flags stay verbatim in every
`--args` set. Runbook prose abbreviates the manager as `ssh micro "…"`; the literal form is
`ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "…"` (AGENTS.md).

Companion captures: `swarm-configs/traefik-edge.E.pre.yml` (before Stage A1), `swarm-configs/traefik-edge.E.post.yml`
(after Stage E, Plan 03), `swarm-configs/traefik-edge-scan.2026-10-08.md` (external scan before/after,
`scripts/traefik-edge-scan.sh`). Decisions: `.planning/phases/33-dashboard-lockdown-tls-hardening/33-CONTEXT.md`
with the research amendments recorded in `33-01-PLAN.md` (port label kept, mgmt router in labels, 19 flags,
`${WEB_HOSTNAME}` for the WS rule).

## Reaching the API/dashboard (ssh plane only)

Since Phase 33 Stage A there is **no public route** to the Traefik API or dashboard on any hostname and no
credential anywhere. `--api` stays enabled; `api@internal` is served by the `traefik-mgmt@swarm` router on
the `mgmt` entrypoint, which is bound to **`127.0.0.1:8080` inside the Traefik task's network namespace** —
not on the overlay, not on the host, not on the internet, nothing host-published. The only path is the
operator's existing ssh + docker plane on micro (D-02/D-03). `C` is always the running task's container id:
`C=$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1)` (Traefik is pinned to
micro by `node.labels.Traefik == true`; `docker exec` is node-local).

**Gate recipe (JSON API, used by every verification in this phase):**

```
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "C=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1); docker exec \$C wget -qO- http://127.0.0.1:8080/api/overview"
# expect (after Stage A2): {"http":{"routers":{"total":29,"warnings":0,"errors":0},"services":{"total":18,...},"middlewares":{"total":6,...}},...,"providers":["Swarm"]}  (+"File" after Stage C)
ssh micro "C=…; docker exec \$C wget -qO- http://127.0.0.1:8080/api/http/routers | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status'"
# expect: prints nothing (the D-30 status filter)
```

The image (`traefik:v3.7.14` = Alpine + BusyBox) ships `wget` and `nc` but **no `curl`**. Host-side
fallback that runs the host's curl inside the task's netns:

```
ssh micro "C=…; P=\$(docker inspect -f '{{.State.Pid}}' \$C); nsenter -t \$P -n curl -s http://127.0.0.1:8080/api/overview"
ssh micro "C=…; P=\$(docker inspect -f '{{.State.Pid}}' \$C); nsenter -t \$P -n ss -ltn | grep 8080"
# expect: exactly one LISTEN line, 127.0.0.1:8080 — never *:8080 / 0.0.0.0:8080
```

**Browser dashboard (D-03) — laptop bridge, nothing installed on micro.** `ssh -L` alone cannot reach a
container's loopback (sshd connects from the host namespace), so the laptop runs a `socat` listener that
spawns one ssh + `docker exec -i … nc` per browser connection:

```
C=$(ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik | head -1")
socat TCP-LISTEN:8080,bind=127.0.0.1,reuseaddr,fork EXEC:"ssh root@188.166.23.244 -i $HOME/.ssh/DOKey2 -p2020 docker exec -i $C nc 127.0.0.1 8080"
# then open http://127.0.0.1:8080/dashboard/ in the laptop browser; Ctrl-C the socat to close the bridge
```

`/dashboard` without the trailing slash returns 404 from `api@internal`; use `/dashboard/` or open `http://127.0.0.1:8080/` which redirects.

Add `-o ControlMaster=auto -o ControlPath=~/.ssh/cm-%r@%h:%p -o ControlPersist=60` to the inner `ssh` so the
dashboard's parallel asset requests reuse one connection. The bridge binds the laptop's loopback only and
disappears with the socat process; the same recipe works via the host netns
(`EXEC:"ssh … nsenter -t <pid> -n nc -q0 127.0.0.1 8080"`). The Phase 32 pre-staged credential file is not
needed anymore (no auth on the loopback path).

## Mechanism (Phase 33)

Every live change is one `docker service update`; repo first (P32 D-04 — thinx-swarm commit → origin →
micro `git merge --ff-only` → mirror regenerated and committed here) before each stage. No stack deploy, no
`restart.sh`, no `--api.insecure` on the live service. Every `--args` stage starts from a fresh 600-root
`docker service inspect` backup (`micro:/mnt/data/edge-rollback/traefik-p33-pre<Stage>-<UTC>.json`), rebuilds
the Args with `jq map(@sh)`, dry-prints them with the e-mail masked and compares them as a sorted set against
the committed mirror before firing. After every live change the **gate quartet** runs: loopback status
filter (29 routers / 0 not-enabled, A2 onward), HTTPS code matrix over the 17 D-27 hosts identical to the
pre-stage baseline, WS pair (cookie-less upgrade → `HTTP/1.1 101`, cookie probe → `401` +
`X-Forwarded-Proto: https`), bare-IP pair (`301 https://188.166.23.244/` + `200`), plus `7442/1883/8883 OPEN`
and a log scan for `port is missing|does not exist|error while parsing` on the new task. Any D-30 trigger
reverts WITHOUT a human, then reports.

| Stage | Command shape | Task restart | Gate | One-command rollback |
|---|---|---|---|---|
| **A1 — loopback `mgmt` entrypoint** (`--args`, 16 → 17; Plan 01 Task 1) | `ARGS=$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + ["--entrypoints.mgmt.address=127.0.0.1:8080"] \| map(@sh) \| join(" ")' <pre-A1 backup>)`; `docker service update --detach --args "$ARGS" traefik_traefik` | **yes** (~15 s, web only — `:7442/:1883/:8883` are direct-published) | inside the task `ss -ltn` lists `127.0.0.1:8080` and no wildcard 8080; `/api/overview` on the loopback answers 404 (listener up, no router yet); HTTPS matrix == baseline; WS pair; bare-IP pair; log scan 0 | `--args` with the backup's 16 flags (`map(@sh)`) |
| **A2 — router swap** (label-only; Plan 01 Task 1) | ONE update: `--label-rm` ×10 (`admin-auth` users, `traefik-public-http.{rule,entrypoints,middlewares}`, `traefik-public-https.{rule,entrypoints,tls,service,tls.certresolver,middlewares}`) + `--label-add` ×3 (`traefik-mgmt.rule=PathPrefix(\`/\`)`, `.entrypoints=mgmt`, `.service=api@internal`); the `traefik-public` service **port label stays** (load-bearing — RESEARCH Pitfall 1) | **no** (same task id) | loopback `29/0`; sorted names == `router_inventory_pre` − 2 public + `traefik-mgmt@swarm`, no `traefik-traefik@swarm`; overview `[29,0,18,6,["Swarm"]]`; mgmt router `enabled/[mgmt]/api@internal`; `/` → 302 `/dashboard/`, dashboard HTML served; overlay `nc traefik 8080` CLOSED, host + laptop curl rc=7; public `micro.thinx.cloud/dashboard/` != 401 and `/api/overview` not JSON; matrix (16 hosts) == baseline; WS; bare-IP | `--label-add` the ten labels back with their values read by jq from the pre-A1 backup ON micro + `--label-rm` the three `traefik-mgmt` labels (one update) |
| **D-08 label clean-up** (label-only; Plan 01 Task 2, between A2 and B) | per service, ONE update each: `thinx_mosquitto --label-rm` ×4 (TCP router/service + opt-in labels; `ports:` untouched); `downtime_downtime` / `errorpage_errorpage` `--label-rm traefik.docker.network --label-add traefik.swarm.network=traefik-public` (never both keys at once — Pitfall 10); `thinx_console` / `thinx_vue` `--label-rm traefik.frontend.headers.STSPreload --label-rm traefik.frontend.headers.STSSeconds`; `thinx_transformer` / `thinx_worker` `--container-label-rm traefik.backend.<svc>.noexpose` | **no** for the five edge services (task ids identical); **yes** for transformer/worker (ContainerSpec change — accepted, not edge services) | loopback `29/0`; names == `routers_post_A2:`; overview 29/18/6; bare-IP pair (catch-alls alive after the network-key flip); WS pair; matrix; mosquitto still publishes 1883/8883; `traefik_traefik` untouched (`args=17`, Version.Index unchanged) | re-add the previous label(s) of the service just changed from `E.pre.yml` `d08_live_labels_pre` / `docker service inspect` history |
| **B — `exposedbydefault=false`** (`--args`, 17 → 17; Plan 01 Task 3) | `ARGS=$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args \| map(if . == "--providers.swarm.exposedbydefault=true" then "--providers.swarm.exposedbydefault=false" else . end) \| map(@sh) \| join(" ")' <pre-B backup>)`; one `--args` update | **yes** | the sorted router-name inventory immediately before and after the flip is identical (diff empty — every edge service opts in with `traefik.enable=true`); `29/0`; overview; matrix; WS; bare-IP; log scan 0 | `--args` with the pre-B backup's 17 flags |
| **C — TLS options** (`--args` 17 → 18 + config swap; Plan 02) | `docker config create tls-config-2 /mnt/gluster/deployment/swarm/traefik/tls.toml` (from the micro checkout after the ff-merge); ONE update: `--args "<18 flags: + --providers.file.filename=/traefik/tls.toml>" --config-rm tls-config-1 --config-add source=tls-config-2,target=/traefik/tls.toml,mode=0444` (swarm configs are immutable — never a hot reload, Pitfall 4) | **yes** | providers `["Swarm","File"]`; `-tls1_2` / `-tls1_3` handshakes succeed and CBC / `-tls1_1` fail on rtm/app/console; nmap TLS 1.2 set == the three RSA AEAD suites; quartet | `--args` with the pre-C 17 flags `--config-rm tls-config-2 --config-add source=tls-config-1,target=/traefik/tls.toml,mode=0444` |
| **post-D ref removal** (label-only; Plan 02, after D is green) | `thinx_api --label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@swarm`; `thinx_console --label-rm traefik.http.routers.thinx-console-https.middlewares` | **no** | exactly one `Strict-Transport-Security` header on rtm/app; `29/0` | re-add the two `security-headers@swarm` refs |
| **D — HSTS entrypoint default** (`--args` 18 → 19; Plan 02) | `--args "<19 flags: + --entrypoints.https.http.middlewares=security-headers@swarm>"` | **yes** | HSTS `1` on all 17 hosts; the WS 101 still carries no STS line (1xx bypass — proven, recorded not gated); quartet | `--args` with the pre-D 18 flags |
| **E — ACME proof** (`--force`; Plan 02) | snapshot `acme.json` + the two stale 2023 files to `/mnt/data/edge-rollback/traefik-p33-acme-<UTC>/` (700/600 root) → `rm` the stale files → `jq del(…)` of `checkout.qooldata.com` + `influx.thinx.cloud` → `chmod 600` → `mv` → `docker service update --detach --force traefik_traefik` in the SAME remote command (Pitfall 9) | **yes** | influx serial changes (Let's Encrypt, notAfter ≈ +90 d); store 23 entries; 0 `Error renewing ACME`; `acme.json` 600 root | `cp -p <snapshot>/acme.json` back + `chmod 600` + `--force` |

Static-flag count after each stage: 16 (before) → **17** (A1) → 17 (B) → 18 (C) → **19** (D). Nothing
reads Args by index (RESEARCH A5): the new flags sit mid-file in `traefik.yml` but at the end of the live
Args, so every dry-print compares as a sorted set, not index-exact.

## Baseline (33-01 Task 1, 2026-10-08 22:37–22:46 UTC)

Precondition re-read (22:39Z, read-only): live `traefik:v3.7.14 args=16 idx=38379738 upd=completed`, one
running task `yudql1hqdnd9` (micro, Running 8 h, container `35bfaaa9a179`); Args: 0 matching
`mgmt.address|file.filename|https.http.middlewares`, 1 `exposedbydefault=true`, 0 matching
`api.insecure|providers.docker`. Inside the task `ss -ltn | grep -c ':8080 '` → **0** (no 8080 listener
before A1); `wget` and `nc` present in the image, no `curl`. thinx-swarm `158f369` == micro
`/mnt/gluster/deployment/swarm` HEAD == origin/master, workstation clean (`--ignore-submodules=all`);
`/mnt/data/edge-rollback/` present (P30–P32 files). Laptop tools: nmap 7.94, sslscan 2.2.2, OpenSSL 3.6.3,
jq, socat, node v25.1.0; device-flow harness `/tmp/p31-device-flow/thinx-device-flow.mjs` present (3010 B).

**Hostname variables (RESEARCH Open Question 3):** live `thinx-console-https.rule` = `Host(\`rtm.thinx.cloud\`)`
(committed `${WEB_HOSTNAME}`), live `thinx-api-https.rule` = `Host(\`app.thinx.cloud\`)` (committed
`${THINX_HOSTNAME}`), live `thinx-api-ws.rule` = `Host(\`rtm.thinx.cloud\`) && HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)`;
micro's deploy env (`grep -E '^(WEB_HOSTNAME|THINX_HOSTNAME)=' /mnt/gluster/deployment/swarm/.env`, two lines
only) → **`WEB_HOSTNAME=rtm / THINX_HOSTNAME=app confirmed`** — the WS rule edit (Task 2) uses `${WEB_HOSTNAME}`.
**Assumption A1:** `grep -rls 'micro.thinx.cloud\|tls-config-1' /etc/cron* /etc/systemd | wc -l` on micro → **0**.

**Gate quartet before any change (laptop, 22:39Z):** HTTPS matrix rtm/app/console/thinx.cloud/www.thinx.cloud/
swarmpit **200**, registry **400**, db **401**, influx **401**, www.fotostim.com/www.fotostim.cz/fotostim.com/
fotostim.cz/igraczech.com/www.igraczech.com/www.syxra.cz **200**, micro **401** (dashboard basic-auth); WS
cookie-less → `HTTP/1.1 101 Switching Protocols`, cookie probe `/p33probe` → `HTTP/1.1 401 Unauthorized` +
`X-Forwarded-Proto: https`; bare-IP `301 https://188.166.23.244/` + `200`; micro `7442 OPEN 1883 OPEN 8883 OPEN`,
publishers `thinx_api 7442->7442`, `traefik_traefik 80->80 443->443`, `thinx_mosquitto 1883->1883 1884->1884
8883->8883`; served serials rtm `0535CC0C71E39D9378E72893F3A2141267B0`, app `051152D5A20BE36DEFA1B6FA83379CE42809`,
influx `05B91929242266AC45C0BD14E89A6C4F8247` (= D.post.yml); public `https://micro.thinx.cloud/dashboard/` →
401, `/api/overview | jq -e .http` → rc 5; laptop `curl http://188.166.23.244:8080/` → rc 7; traefik log scan
(30 min) → 0. External scan `EDGE-SCAN FAIL 32` (`swarm-configs/traefik-edge-scan.2026-10-08.md` `## Before`).

**Router inventory before Stage A2** (30 names, derived credential-free from the `traefik.http.routers.<name>.`
label keys of the 16 traefik-labelled services, suffixed `@swarm` — RESEARCH Open Question 4; also committed as
`router_inventory_pre:` in `traefik-edge.E.pre.yml`):

routers_pre:
  - downtime-http@swarm
  - downtime-https@swarm
  - error-router@swarm
  - fotostimcom-http@swarm
  - fotostimcom-https@swarm
  - fotostimcz-http@swarm
  - fotostimcz-https@swarm
  - igraczech-http@swarm
  - igraczech-https@swarm
  - landing-page-http@swarm
  - landing-page-https@swarm
  - registry-http@swarm
  - registry-https@swarm
  - swarmpit-http@swarm
  - swarmpit-https@swarm
  - syxra-http@swarm
  - syxra-https@swarm
  - thinx-api-http@swarm
  - thinx-api-https@swarm
  - thinx-api-ws@swarm
  - thinx-console-http@swarm
  - thinx-console-https@swarm
  - thinx-db-http@swarm
  - thinx-db-https@swarm
  - thinx-influx-http@swarm
  - thinx-influx-https@swarm
  - thinx-vue-console-http@swarm
  - thinx-vue-console-https@swarm
  - traefik-public-http@swarm
  - traefik-public-https@swarm

Expected after A2: the same list minus `traefik-public-http@swarm` and `traefik-public-https@swarm` plus
`traefik-mgmt@swarm` = 29 names, every one `enabled`, no `traefik-traefik@swarm` (Pitfall 2).

### Stage A record (33-01 Task 1, 2026-10-08 22:47–22:58 UTC)

**Outcome: the live `traefik_traefik` runs the 17-flag static command with the loopback `mgmt` entrypoint
bound to `127.0.0.1:8080` inside the task netns (one restart, fire 22:55:04Z → new task Running 22:55:19Z),
the public dashboard routers and the `admin-auth` basic-auth middleware are gone and the `traefik-mgmt@swarm`
router serves `api@internal` on `mgmt` only (label-only swap, same task id); the loopback API reports
29 routers / 0 not-enabled, the dashboard is served on the loopback and nowhere else, `:8080` is
unreachable from the overlay, the host and the internet, every behavioural probe equals the baseline, the
device ports are open. No D-30 trigger fired; the staged reverts were NOT used.**

Precondition re-read (22:39Z): `traefik:v3.7.14 args=16 idx=38379738 upd=completed`, task `yudql1hqdnd9`;
0 Args matching `mgmt.address|file.filename|https.http.middlewares`, `exposedbydefault=true` present; thinx-swarm
`158f369` == micro HEAD == origin/master, clean; `/mnt/data/edge-rollback/` present; laptop tools + harness present.

Repo first (P32 D-04): thinx-swarm `93036a8` (`feat(edge): Phase 33 Stage A — …`) → `git push origin master`
→ pushed to micro as `p33-stageA`, `git merge --ff-only` (dirty=0, 1 file changed 24+/25−), branch deleted,
micro HEAD `93036a8` == workstation == origin → mirror regenerated here (`MIRROR-GENERATED ok
source=thinx-swarm@93036a8…`, `MIRROR OK files=1`, 17 `- --` lines, 0 basicauth lines, regeneration
idempotent) and committed (`feat(33): Stage A — mirror regenerated at 17 flags`, `7fd5f2b4`).

**D-04 comparison (Step 4, BEFORE A2, values over ssh stdin only, `openssl passwd -apr1 -salt <live salt> -stdin`,
no `set -x`, nothing printed but the words):**

HASH-LITERAL=NO-MATCH
PASSWORD=NO-MATCH

Both committed `HASHED_PASSWORD` exports in `traefik.sh` are `$(openssl passwd -apr1 …)` command substitutions,
not literal hashes (so the HASH-LITERAL comparison is trivially NO-MATCH), and they differ from each other; the
committed cleartext `PASSWORD` literal does NOT reproduce the live apr1 hash under the live salt — the literal in
git was never the live credential. The live middleware disappeared with A2 (below), so rotation is moot; the
`traefik.sh` scrub lands in the Stage B commit (Task 3). Nothing else about the credential is recorded anywhere.

```
ssh micro "umask 077; B=/mnt/data/edge-rollback/traefik-p33-preA1-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B && chmod 600 \$B; \
  jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B"
# expect: 600 root; 16 — this file is the A1 Args revert source AND the A2 label revert source; never leaves micro, never committed
ssh micro "jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--entrypoints.mgmt.address=127.0.0.1:8080\"] | .[]' \$B | sed -E 's/acme.email=.*/acme.email=<masked>/' | sort"
# expect: 17 lines == `grep '^ *- --' docker-compose.traefik.yml` sorted (leading '- ' stripped, e-mail line masked on both sides) — a SORTED-SET compare, not index-exact (the new flag is mid-file in traefik.yml, last in the live Args)
ssh micro "ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--entrypoints.mgmt.address=127.0.0.1:8080\"] | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: rc 0; ONE task restart; image unchanged; Version.Index advances; args=17
ssh micro "docker service update --detach --label-rm traefik.http.middlewares.admin-auth.basicauth.users --label-rm traefik.http.routers.traefik-public-http.rule --label-rm traefik.http.routers.traefik-public-http.entrypoints --label-rm traefik.http.routers.traefik-public-http.middlewares --label-rm traefik.http.routers.traefik-public-https.rule --label-rm traefik.http.routers.traefik-public-https.entrypoints --label-rm traefik.http.routers.traefik-public-https.tls --label-rm traefik.http.routers.traefik-public-https.service --label-rm traefik.http.routers.traefik-public-https.tls.certresolver --label-rm traefik.http.routers.traefik-public-https.middlewares --label-add 'traefik.http.routers.traefik-mgmt.rule=PathPrefix(\`/\`)' --label-add traefik.http.routers.traefik-mgmt.entrypoints=mgmt --label-add traefik.http.routers.traefik-mgmt.service=api@internal traefik_traefik"
# expect: rc 0; same task id; within 15 s the loopback /api/http/routers lists traefik-mgmt@swarm enabled and no traefik-public-*
```

| Time (UTC) | Step | Observed |
|---|---|---|
| 22:44:51–22:46:51 | external scan (before) | `EDGE-SCAN FAIL 32` — CBC on TLS 1.2 ×17, HSTS missing ×14, `dashboard-401 micro.thinx.cloud`; 8080/8443 `closed`, 7442 open; 0 `dashboard-open` / 0 `api-exposed` (`traefik-edge-scan.2026-10-08.md`) |
| 22:47–22:52 | Steps 1–3 committed | `2b0fae7f` scan script + before capture; `86abd37f` `traefik-edge.E.pre.yml`; `76ab5e87` this runbook (Reaching / Mechanism / Baseline) |
| 22:52 | D-04 compare | two words above; both exports are command substitutions and differ from each other |
| 22:53 | repo first | thinx-swarm `93036a8` on origin + micro (ff, dirty=0); mirror `7fd5f2b4` MIRROR OK at 17 flags |
| 22:54:29 | pre-flight backup | `/mnt/data/edge-rollback/traefik-p33-preA1-20261008T225429Z.json` — `600 root`, 15833 B, Args length **16**; live task `yudql1hqdnd9`, `idx=38379738` |
| 22:54 | dry-print + sorted-set diff | 17 masked live-set lines vs 17 mirror lines: **diff empty (17/17)**; thxp/mqtt/mqtts/mgmt address flags all present (4/4) |
| **22:55:04.4** | **A1 fire** | `docker service update --detach --args "<17 flags>" traefik_traefik` → **rc 0** |
| 22:55:04–22:55:19 | drain + start | old task `yudql1hqdnd9` stopped; **new task `v3znc0mq2jwz`** `traefik:v3.7.14` micro **Running 22:55:19.5Z** (fire → Running ≈ 15 s, as 32 Stage 2); exactly **1** running task; `args=17 idx=38379756 upd=completed` |
| 22:55:25 | A1 bind proof | `nsenter -t <pid> -n ss -ltn \| grep ':8080 '` → exactly `LISTEN 0 4096 127.0.0.1:8080 0.0.0.0:*` — no wildcard; loopback `wget http://127.0.0.1:8080/api/overview` → **404** (listener up, no router yet — expected) |
| 22:55:25 | A1 log scan | `port is missing\|does not exist\|error while parsing` since the fire: **0 on the new task**; 13 transient `does not exist` lines all on the stopping task `yudql1hqdnd9` (same drain artefact as 32 Stage 2); the new task's only ERR line is the pre-existing `Error renewing ACME certificate: checkout.qooldata.com` start-time pass (Plan 02 Stage E) |
| 22:55:25 | A1 gate (laptop) | HTTPS matrix 17/17 **== baseline** (micro still 401 — A2 not yet fired); WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301 https://188.166.23.244/` + `200`; laptop `curl :8080` rc=7; micro `7442 OPEN 1883 OPEN 8883 OPEN` — no trigger |
| **22:56:39.7** | **A2 fire** | the ONE label update above (10 `--label-rm` + 3 `--label-add`) → **rc 0**; task id **unchanged `v3znc0mq2jwz`**; `idx 38379756 → 38379757` |
| 22:56:50 | convergence | loopback status filter **`29/0`** 10 s after the fire |
| 22:56:50 | (1)–(5) loopback | names: **29, == `router_inventory_pre` − traefik-public-http/https + traefik-mgmt (diff empty), 0 `traefik-traefik@swarm`**; overview **`[29,0,18,6,["Swarm"]]`** (middlewares 7 → 6, admin-auth gone); `traefik-mgmt@swarm` = `{"status":"enabled","entryPoints":["mgmt"],"service":"api@internal","rule":"PathPrefix(\`/\`)"}`; `/` → `302 Found` + `Location: /dashboard/`; `/dashboard/` → `200`, `APIUrl` count **1** (dashboard kept, loopback only — D-03) |
| 22:56:50 | (6) labels readback | router keys exactly `traefik.http.routers.traefik-mgmt.{entrypoints,rule,service}`; the only service key `traefik.http.services.traefik-public.loadbalancer.server.port`; middleware keys = https-redirect ×2, security-headers ×7, error-pages-middleware ×3; **0** admin-auth / traefik-public-* keys |
| 22:56:50 / 22:59 | (7) negative reachability | host `curl http://127.0.0.1:8080/api/overview` → **rc=7**; laptop `curl http://188.166.23.244:8080/` → **rc=7**; laptop `nmap -p 8080,8443` → both `closed`; overlay: `docker run --rm --network container:<errorpage_errorpage task> alpine:3.20 nc -z -w2 traefik 8080` → **CLOSED** with the `:80` control → OPEN (the research recipe `--network traefik-public` is refused on this swarm — `network traefik-public not manually attachable` — so the probe joins an existing traefik-public peer's netns instead; same question, same answer) |
| 22:56:51 | (8) public gone (D-06) | `https://micro.thinx.cloud/dashboard/` → **302** (catch-all page path, NOT 401); `https://micro.thinx.cloud/` → **200** (downtime catch-all — **micro's new HTTPS-matrix baseline code for every later stage**); `/api/overview` on micro → `jq -e .http` rc 5 (not Traefik JSON) |
| 22:56:51 | (9) laptop gate | HTTPS matrix for the other 16 hosts **== baseline**; WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301` + `200`; log scan **0 on the new task**; `7442 OPEN 1883 OPEN 8883 OPEN`; publishers `thinx_api 7442->7442`, `traefik_traefik 80->80 443->443` (the plan's literal `grep` for this line needs `tr -s ' '` — the Go template emits a trailing space before the newline — recorded, not a live difference) |

**D-30 trigger evaluation: none fired** ((1) `29/0`, (2) matrix == baseline on 16 hosts + micro re-baselined 401 → 200,
(3) WS 101/401 + `X-Forwarded-Proto: https`, (4) bare-IP 301/200, log scan 0 on the new task). The A1 revert
(`--args` with the 16 flags from `traefik-p33-preA1-20261008T225429Z.json`) and the A2 revert (`--label-add` the
ten labels back from the same backup + `--label-rm` the three mgmt labels) were staged and **not executed**.

Version.Index post-Stage-A1: 38379756
Version.Index post-Stage-A2: 38379757

Repo state == live state after this task: thinx-swarm `93036a8` (origin + micro), mirror `7fd5f2b4` MIRROR OK at
17 flags, live `traefik_traefik` 17 Args (sorted set == mirror) with the traefik-mgmt labels and no public router.

The phase-wide inventory baseline (every later plan diffs the live sorted router names against this block):

routers_post_A2:
  - downtime-http@swarm
  - downtime-https@swarm
  - error-router@swarm
  - fotostimcom-http@swarm
  - fotostimcom-https@swarm
  - fotostimcz-http@swarm
  - fotostimcz-https@swarm
  - igraczech-http@swarm
  - igraczech-https@swarm
  - landing-page-http@swarm
  - landing-page-https@swarm
  - registry-http@swarm
  - registry-https@swarm
  - swarmpit-http@swarm
  - swarmpit-https@swarm
  - syxra-http@swarm
  - syxra-https@swarm
  - thinx-api-http@swarm
  - thinx-api-https@swarm
  - thinx-api-ws@swarm
  - thinx-console-http@swarm
  - thinx-console-https@swarm
  - thinx-db-http@swarm
  - thinx-db-https@swarm
  - thinx-influx-http@swarm
  - thinx-influx-https@swarm
  - thinx-vue-console-http@swarm
  - thinx-vue-console-https@swarm
  - traefik-mgmt@swarm

### D-08 label clean-up record (33-01 Task 2, 2026-10-08 23:00–23:07 UTC)

**Outcome: the seven D-08 live label updates landed — five label-only on edge services (task ids identical
pre/post), two container-label removals that restarted `thinx_transformer` / `thinx_worker` once each (accepted,
not edge services); the router inventory is unchanged at 29/0 and byte-identical to `routers_post_A2:`, the
catch-alls survived the `downtime`/`errorpage` network-key flip, MQTT stays published and open, and
`traefik_traefik` was not touched (`args=17`, Version.Index 38379757 == post-Stage-A2).**

Precondition re-read (23:00Z): Stage A record present with `Version.Index post-Stage-A2: 38379757` == live;
loopback status filter `29/0`; thinx-swarm HEAD == micro HEAD (`93036a8`, then `6dc974b` after the repo step).

Repo first (P32 D-04): thinx-swarm `6dc974b` (`chore(edge): Phase 33 D-08 label clean-up — …`: `thinx.yml` mosquitto
TCP router/service + opt-in labels removed with `ports:` untouched, dead v1 `traefik.frontend.headers.*` on
console/vue and the v1 `traefik.backend.*` container labels on transformer/worker removed, `thinx-api-ws` rule host
→ `${WEB_HOSTNAME}` file-only; `vault.yml` → `traefik.swarm.network`) → origin → micro `p33-d08` ff-merge (dirty=0,
2 files 12+/14−) → mirror regenerated (`MIRROR-GENERATED ok source=thinx-swarm@6dc974b…`, `MIRROR OK files=1`,
still 17 flags) → this repo `a68a02ff` (`docker-swarm.yml` with the identical edits — comment-stripped traefik-label
parity diff empty — plus the mirror). The plan's WS-rule `grep` passes under `/usr/bin/grep` (BRE, 2/2 files);
the laptop's `grep` shell function wraps ugrep 7.8.4, which reads `${…}` / `(?i)` as regex — recorded, not a
content difference (`grep -F` and `/usr/bin/grep` both match).

```
ssh micro "docker service update --detach --label-rm traefik.tcp.routers.mosquitto-secure.entrypoints --label-rm traefik.tcp.services.mosquitto.loadbalancer.server.port --label-rm traefik.enable --label-rm traefik.swarm.network thinx_mosquitto"
ssh micro "docker service update --detach --label-rm traefik.docker.network --label-add traefik.swarm.network=traefik-public downtime_downtime"
ssh micro "docker service update --detach --label-rm traefik.docker.network --label-add traefik.swarm.network=traefik-public errorpage_errorpage"
ssh micro "docker service update --detach --label-rm traefik.frontend.headers.STSPreload --label-rm traefik.frontend.headers.STSSeconds thinx_console"
ssh micro "docker service update --detach --label-rm traefik.frontend.headers.STSPreload --label-rm traefik.frontend.headers.STSSeconds thinx_vue"
ssh micro "docker service update --detach --container-label-rm traefik.backend.transformer.noexpose thinx_transformer"
ssh micro "docker service update --detach --container-label-rm traefik.backend.worker.noexpose thinx_worker"
# expect (1)-(5): rc 0; task id pre == post (label-only); readback = keys gone, downtime/errorpage exactly one traefik.swarm.network and zero v2 key
# expect (6)-(7): rc 0; ONE task restart each (ContainerSpec change), one Running task afterwards, 0 noexpose container labels
```

| Time (UTC) | Update | Task id pre → post | Readback |
|---|---|---|---|
| 23:05:37 | (1) `thinx_mosquitto` `--label-rm` ×4 | `siy2hydafq9y` → `siy2hydafq9y` (unchanged) | `traefik.` label keys **0**; published ports still `1883 1884 8883` |
| 23:05:37 | (2) `downtime_downtime` network-key flip (ONE update) | `vzyg90j8f878` → `vzyg90j8f878` (unchanged) | `traefik.swarm.network=traefik-public` **1**, `traefik.docker.network` **0** |
| 23:05:37 | (3) `errorpage_errorpage` network-key flip (ONE update) | `5d7aukf4evft` → `5d7aukf4evft` (unchanged) | `traefik.swarm.network=traefik-public` **1**, `traefik.docker.network` **0** |
| 23:05:37 | (4) `thinx_console` v1 STS labels | `4kznxokagqek` → `4kznxokagqek` (unchanged) | `traefik.frontend` keys **0** |
| 23:05:38 | (5) `thinx_vue` v1 STS labels | `og84ysuwhv97` → `og84ysuwhv97` (unchanged) | `traefik.frontend` keys **0** |
| 23:05:38–23:05:53 | (6) `thinx_transformer` `--container-label-rm` | `40zuy7aoq0ot` → **`o4oh3xu52822`** (restarted, Running 23:05:53) | `noexpose` container labels **0** |
| 23:05:53–23:06:08 | (7) `thinx_worker` `--container-label-rm` | `nuvdfke2zhq8` → **`ppfx56ozhnbn`** (restarted, Running 23:06:08) | `noexpose` container labels **0**; transformer + worker **2** running tasks |
| 23:06:38 | gate (loopback, after 30 s) | — | status filter **`29/0`**; sorted names **== `routers_post_A2:` (diff empty, 29)** — the catch-alls `downtime-http/https@swarm`, `error-router@swarm` present; overview **`[29,0,18,6,["Swarm"]]`**; live `thinx-api-ws.rule` still `Host(\`rtm.thinx.cloud\`) && HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)` (file-only edit, resolved value unchanged — no live update needed) |
| 23:06:38 | gate (traefik_traefik untouched) | `v3znc0mq2jwz` (unchanged since A1) | `traefik:v3.7.14 args=17 idx=38379757` == `Version.Index post-Stage-A2`; log scan `port is missing\|does not exist\|error while parsing` (3 min) **0**; `7442 OPEN 1883 OPEN 8883 OPEN` |
| 23:06:39 | gate (laptop) | — | bare-IP `301 https://188.166.23.244/` + `200` (catch-alls alive after the flip); WS `101` / `401` + `X-Forwarded-Proto: https`; HTTPS matrix 17/17 **== post-A2 baseline** (micro 200) |

**Triggers: none fired** — no revert needed (revert source for each service: `traefik-edge.E.pre.yml`
`d08_live_labels_pre` + `docker service inspect … PreviousSpec`). The three external stacks
(`fotostim_landing-com`, `fotostim_landing-cz`, `igraczech-com_web`, `syxra-cz_web`) were **NOT touched** by this
plan — no D-08 decision requires a label change on them (D-09); their pre-change label-key dump is
`external_stack_labels:` in `traefik-edge.E.pre.yml`, and the edge-wide stages reach them inevitably.

Repo state == live state after this task: thinx-swarm `6dc974b` (origin + micro), this repo `a68a02ff`
(`docker-swarm.yml` == `thinx.yml` traefik labels; mirror MIRROR OK at 17 flags); live labels on the seven
services match the committed files; `traefik_traefik` untouched.

### Stage B record (33-01 Task 3, 2026-10-08 23:08–23:13 UTC)

**Outcome: the live `traefik_traefik` runs the 17-flag static command with `--providers.swarm.exposedbydefault=false`
(one restart, fire 23:11:31Z → new task Running 23:11:46Z); the sorted router-name inventory read over the loopback
API immediately before and after the flip is identical (inventory diff: empty — every edge service opts in with
`traefik.enable=true`, D-07), every router enabled, every behavioural probe equals the pre-row, device ports open.
No D-30 trigger fired; the staged revert was NOT used. End state of Plan 33-01: 17 Args (mgmt entrypoint,
exposedbydefault=false), 29 routers enabled, ready for Plan 02 Stage C.**

Precondition re-read (23:08Z): D-08 record present; live `downtime_downtime` / `errorpage_errorpage` carry
`traefik.swarm.network` (0 v2 keys); loopback `29/0`; thinx-swarm HEAD == micro HEAD; the D-04 words are in the
Stage A record above.

Repo first (P32 D-04): thinx-swarm `efee92c` (`feat(edge): Phase 33 Stage B — exposedbydefault=false; traefik.sh
scrubbed …`: `traefik.yml` flag flipped with the P30 D-05 comment rewritten and 0 `=true` tokens left anywhere in the
file; `traefik.sh` keeps the two `docker network create` lines, `NODE_ID`, the node label and the `docker stack deploy
-c ./traefik.yml traefik` line, loses every `export DOMAIN/USERNAME/PASSWORD/HASHED_PASSWORD` line and the
password-step comment, and demands `EMAIL` from the environment with `: "${EMAIL:?…}"` + the bootstrap-only NOTE) →
origin → micro `p33-stageB` ff-merge (dirty=0, 2 files 10+/15−) → mirror regenerated (`MIRROR-GENERATED ok
source=thinx-swarm@efee92c…`, `MIRROR OK files=1`, 17 flags, 1 `exposedbydefault=false`, 0 `=true`) → this repo
`1c5f5f53`. **D-04 closure:** the scrubbed `traefik.sh` carries no e-mail address and no password-like literal; git
history keeps the old literals, but the live `admin-auth` middleware disappeared with Stage A2 and the committed
`PASSWORD` literal never matched the live hash (`PASSWORD=NO-MATCH`), so rotation is moot — nothing to rotate.

```
ssh micro "umask 077; B=/mnt/data/edge-rollback/traefik-p33-preB-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B && chmod 600 \$B; \
  jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args[]' \$B | grep -c '^--providers.swarm.exposedbydefault=true$'"
# expect: 600 root; 17 ; 1 — this file is the Stage B revert source, never leaves micro, never committed
ssh micro "jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(if . == \"--providers.swarm.exposedbydefault=true\" then \"--providers.swarm.exposedbydefault=false\" else . end) | .[]' \$B | sed -E 's/acme.email=.*/acme.email=<masked>/' | sort"
# expect: 17 lines == the mirror's 17 `- --` lines sorted (e-mail masked both sides) — sorted-set compare
ssh micro "ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(if . == \"--providers.swarm.exposedbydefault=true\" then \"--providers.swarm.exposedbydefault=false\" else . end) | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: rc 0; ONE task restart; image unchanged; Version.Index advances; args=17 with exposedbydefault=false
```

| Time (UTC) | Step | Observed |
|---|---|---|
| 23:10:31 | pre-flight backup | `/mnt/data/edge-rollback/traefik-p33-preB-20261008T231031Z.json` — `600 root`, 14999 B, Args length **17**, `exposedbydefault=true` present ×1; live task `v3znc0mq2jwz`, `idx=38379757` |
| 23:10 | dry-print + sorted-set diff | 17 masked live-set lines (with `=false`) vs 17 mirror lines: **diff empty (17/17)**; thxp/mqtt/mqtts/mgmt address flags 4/4 |
| 23:10:42 | pre-row | loopback **`29/0`**; live sorted names saved to the laptop (`/tmp/p33-preB-routers.txt`) — **29, == `routers_post_A2:`**; HTTPS matrix 17/17 == post-A2 baseline (micro 200); WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301` + `200` |
| **23:11:31.6** | **B fire** | `docker service update --detach --args "<17 flags, =false>" traefik_traefik` → **rc 0** |
| 23:11:31–23:11:46 | drain + start | old task `v3znc0mq2jwz` stopped; **new task `puse77wvt5xk`** `traefik:v3.7.14` micro **Running 23:11:46.7Z** (fire → Running ≈ 15 s); exactly **1** running task; `args=17 idx=38379801 upd=completed`; live Args contain `exposedbydefault=false` ×1 and no `=true` |
| 23:11:52 | convergence | loopback status filter **`29/0`** 5 s after the new task started |
| 23:11:52 | (2) identical inventory (D-07) | `diff /tmp/p33-preB-routers.txt <(live sorted names)` → **inventory diff: empty** (29/29) — no service dropped out of discovery under opt-in exposure |
| 23:11:52 | (3) overview | **`[29,0,18,6,["Swarm"]]`** — unchanged |
| 23:11:52 | (7) log scan | `port is missing\|does not exist\|error while parsing` since the fire: **0 on the new task** (13 transient `does not exist` lines on the stopping task `v3znc0mq2jwz`, same drain artefact as A1 / 32 Stage 2); **0 ERR lines** on the new task |
| 23:11:52 | (8) ports + bind | `7442 OPEN 1883 OPEN 8883 OPEN`; in-task `ss -ltn` → `127.0.0.1:8080` only (mgmt bind survived the restart) |
| 23:11:54 | (4)–(6) laptop | HTTPS matrix 17/17 **== pre-row**; WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301 https://188.166.23.244/` + `200`; laptop `curl :8080` rc=7 |

**D-30 trigger evaluation: none fired** ((1) `29/0`, (2) inventory diff empty, (3) overview unchanged, (4) matrix ==
pre-row, (5) WS 101/401, (6) bare-IP 301/200, (7) log scan 0 on the new task, (8) ports open). The revert (`--args`
with the 17 flags of `traefik-p33-preB-20261008T231031Z.json`, `=true` back) was staged and **not executed**.

Version.Index post-Stage-B: 38379801

Repo state == live state after this task: thinx-swarm `efee92c` (origin + micro), mirror `1c5f5f53` MIRROR OK at 17
flags with `exposedbydefault=false`, live `traefik_traefik` 17 Args (sorted set == mirror), `traefik-mgmt` labels,
29 routers enabled == `routers_post_A2:`. Plan 02 Stage C starts from here (17 → 18 flags, `tls-config-2`).

### Stage C record (33-02 Task 1, 2026-10-09 07:46–08:21 UTC)

**Outcome: the live `traefik_traefik` runs the 18-flag static command with `--providers.file.filename=/traefik/tls.toml`
and the immutable swarm config `tls-config-2` mounted at `/traefik/tls.toml` (one restart, fire 08:17:18.6Z → new task
`5agre1dyzrot` Running 08:17:35.5Z, ≈17 s); the loopback API reports providers `["Swarm","File"]` with the inventory
unchanged (29/0 == `routers_post_A2:`); on the wire rtm/app/console negotiate TLS 1.2 and TLS 1.3 (verify 0), refuse
TLS 1.1, now REFUSE the CBC suite `ECDHE-RSA-AES128-SHA` (accepted before this stage) and refuse P-384 (curve policy
applied); nmap sees exactly the three ECDHE_RSA AEAD suites on TLS 1.2, TLSv1.3 present on `ecdh_x25519`, `least
strength: A`; every behavioural probe equals the pre-row; 7442/1883/8883 OPEN; the device-flow harness PASSES over
HTTPS (the TLS options are on the device path, D-15) and over :7442 + :1883. No D-30 trigger fired; the staged revert
(pre-C 17 flags + `--config-rm tls-config-2 --config-add source=tls-config-1,…`) was NOT used.**

Precondition re-read (07:46Z): `traefik:v3.7.14 args=17`, `--entrypoints.mgmt.address=127.0.0.1:8080` and
`--providers.swarm.exposedbydefault=false` present, Configs `tls-config-1` @ `/traefik/tls.toml` mode 292, `docker config
ls --filter name=tls-config-2 -q` empty, loopback `29/0`, overview `[29,0,18,6,["Swarm"]]`, thinx-swarm `efee92c` ==
micro HEAD (dirty=0), harness present. **Version.Index was 38379808, not the recorded `post-Stage-B: 38379801`** — the
same task `puse77wvt5xk` (container started 23:11:45Z, 0 restarts) was still running. Cause, read-only from `docker
events` + `journalctl -u docker`: at 06:49:03Z the swarm raft leader moved from `core` to `micro` (election, term
7937/7938; `core` ran unattended-upgrades at 06:25Z) and the new leader re-saved ALL 21 services at 06:49:27Z with Docker's
default fields filled in (StopGracePeriod, RestartPolicy, UpdateConfig, DNSConfig) — `Spec` vs `PreviousSpec` on
`traefik_traefik` differs only by those defaults plus the Stage B flag flip; Args, labels, configs, image and the task
are the Stage B end state. Treated as met in substance (the content the index protects is unchanged); recorded as a
deviation in `33-02-SUMMARY.md`. A leader election bumps every service's Version.Index — later `post-Stage-X` index
gates compare against the index right after that stage's own update, which this record provides.

Repo first (P32 D-04): thinx-swarm `94da01c` (`feat(edge): Phase 33 Stage C — …`: `traefik/tls.toml` rewritten as the
`default` TLS option — `minVersion = "VersionTLS12"`, `sniStrict = false`, `curvePreferences = ["X25519", "CurveP256"]`,
six ECDHE AEAD `cipherSuites`, 7-line Phase 33 header with the CONFIG bump rule, 0 CBC / 0 TLS 1.3 names / no ALPN,
server-preference or max-version keys; `traefik.yml` + `--providers.file.filename=/traefik/tls.toml` after the
tlschallenge line, `configs:` `name: tls-config-${CONFIG:-2}` with the immutability comment, 18 `- --` lines) → `git push
origin master` → pushed to micro as `p33-stageC`, `git merge --ff-only` (dirty=0, 2 files 22+/10−), branch deleted, micro
HEAD `94da01c` == workstation == origin → mirror regenerated here (`MIRROR-GENERATED ok source=thinx-swarm@94da01c…`,
`MIRROR OK files=1`, 18 flags) and committed (`feat(33): Stage C — mirror regenerated at 18 flags`, `b99210f8`).

Parse pre-validation on micro (throwaway, no host ports, no swarm provider — Boot-and-discover precedent): `timeout 10
docker run --rm --name p33-tlsprobe -v /mnt/gluster/deployment/swarm/traefik/tls.toml:/traefik/tls.toml:ro
traefik:v3.7.14 --providers.file.filename=/traefik/tls.toml --entrypoints.https.address=:443 --log.level=DEBUG` →
`invalid CipherSuite|invalid CurveID|error` lines **0**; `tls.toml` lines **3** (`*file.Provider provider configuration
{"filename":"/traefik/tls.toml"…}`, `add watcher on: /traefik/tls.toml`, `Configuration received … "tls":{"options":{…`);
at `--log.level=INFO` the file-provider lines are not emitted (DEBUG only — the plan's `>= 1` expectation needs DEBUG);
no `p33-tlsprobe` container left behind. Then `docker config create tls-config-2 /mnt/gluster/deployment/swarm/traefik/tls.toml`
(FROM the fast-forwarded checkout) → decoded sha256 `bb0cba95ea22e973…` == `shasum -a 256` of the committed laptop file.
Readback note: `docker config inspect --format '{{.Spec.Data}}'` prints the `[]byte` as decimal numbers (`base64 -d` →
`invalid input`); the working form is `--format '{{json .Spec.Data}}' | tr -d '"' | base64 -d | sha256sum`.

```
ssh micro "umask 077; B=/mnt/data/edge-rollback/traefik-p33-preC-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B && chmod 600 \$B; \
  jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Configs[0].ConfigName' \$B"
# expect: 600 root; 17 ; tls-config-1 — this file is the Stage C Args + config revert source, never leaves micro, never committed
ssh micro "jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--providers.file.filename=/traefik/tls.toml\"] | .[]' \$B | sed -E 's/acme.email=.*/acme.email=<masked>/' | sort"
# expect: 18 lines == the mirror's 18 `- --` lines sorted (e-mail masked both sides) — sorted-set compare
ssh micro "ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--providers.file.filename=/traefik/tls.toml\"] | map(@sh) | join(\" \")' \$B); \
  docker service update --detach --args \"\$ARGS\" --config-rm tls-config-1 --config-add source=tls-config-2,target=/traefik/tls.toml,mode=0444 traefik_traefik"
# expect: rc 0; ONE task restart; image unchanged; Version.Index advances; args=18; Configs -> tls-config-2; providers ["Swarm","File"]
```

| Time (UTC) | Step | Observed |
|---|---|---|
| 07:50–07:55 | precondition index drift investigated | leader election 06:49:03Z (`core` → `micro`), all 21 services re-saved 06:49:27Z; `traefik_traefik` content == Stage B end state; same task/container; see above |
| 08:05 | repo first | thinx-swarm `94da01c` on origin + micro (ff, dirty=0); mirror `b99210f8` MIRROR OK at 18 flags |
| 07:59 / 08:00 | parse pre-validation | INFO run: 0 error lines, 0 `tls.toml` lines; DEBUG run: 0 error lines, 3 `tls.toml` lines incl. `add watcher on: /traefik/tls.toml` and the TLS options in `Configuration received`; leftover containers 0 |
| 08:00 | `tls-config-2` created | from `/mnt/gluster/deployment/swarm/traefik/tls.toml`; decoded sha256 `bb0cba95ea22e973…` == committed (match) |
| 08:12:50 | pre-row (laptop) | HTTPS matrix 17/17 == post-A2 baseline (micro 200); WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301 https://188.166.23.244/` + `200`; TLS baseline rtm/app/console: `-tls1_2` ok + verify 0, `-tls1_3` ok, `-tls1_1` `no protocols available`, **CBC `ECDHE-RSA-AES128-SHA` ACCEPTED (handshake failure count 0 ×3) — the "before"** |
| 08:13:29 | pre-row (micro) | loopback `29/0`; sorted names saved to `/tmp/p33-preC-routers.txt` == `routers_post_A2:` (diff empty); task `puse77wvt5xk`, `idx=38379808 args=17`; `7442 OPEN 1883 OPEN 8883 OPEN`; publishers `thinx_api 7442->7442`, `traefik_traefik 80->80 443->443` |
| 08:16:58 | pre-flight backup | `/mnt/data/edge-rollback/traefik-p33-preC-20261009T081658Z.json` — `600 root`, 14548 B, Args length **17**, `Configs[0].ConfigName` `tls-config-1` |
| 08:17 | dry-print + sorted-set diff | 18 masked live-set lines vs 18 mirror lines: **diff empty (18/18)**; thxp/mqtt/mqtts/mgmt address flags 4/4 |
| **08:17:18.6** | **C fire** | the ONE update above (`--args` 18 flags + `--config-rm tls-config-1 --config-add source=tls-config-2,target=/traefik/tls.toml,mode=0444`) → **rc 0** |
| 08:17:18–08:17:35 | drain + start | old task `puse77wvt5xk` stopped; **new task `5agre1dyzrot`** `traefik:v3.7.14` micro **Running 08:17:35.5Z** (fire → Running ≈ 17 s); exactly **1** running task; `args=18`, Configs `{"n":"tls-config-2","t":"/traefik/tls.toml","m":292}`; `idx=38379918 upd=completed` once settled |
| 08:18:3x | (1)–(3) loopback | status filter **`29/0`**; sorted names **== pre-row == `routers_post_A2:` (diff empty)**; overview **`[29,0,18,6,["Swarm","File"]]`**; in-task `sha256sum /traefik/tls.toml` = `bb0cba95ea22e973…` == committed |
| 08:18:3x | (4) TLS options via the API | **not observable**: `/api/rawdata` keys are `["middlewares","routers","services"]` (0 `VersionTLS12` hits), `/api/tls` and `/api/tls/options` → 404 — Traefik v3.7.14 does not expose TLS options over the API; the plan's rawdata `jq -e` cannot pass on any build. Proof substitutes: the config sha in the task, the DEBUG probe's `Configuration received` with the `tls.options` block, providers `["Swarm","File"]`, and the wire rows below |
| 08:18:40 | (5) TLS triple + CBC (laptop) | rtm/app/console each: `-tls1_2` → `Protocol : TLSv1.2` + `Verify return code: 0`; `-tls1_3` → `TLSv1.3` + verify 0; `-tls1_1` → `no protocols available` (never a completed handshake); **`-tls1_2 -cipher ECDHE-RSA-AES128-SHA` → `handshake failure` (count 1 ×3) — CBC REFUSED (before: accepted)**; `-curves P-384` → `handshake failure` ×3 (curvePreferences applied); negotiated rtm 1.2 `ECDHE-RSA-AES128-GCM-SHA256`, 1.3 `TLS_AES_128_GCM_SHA256` |
| 08:19 | (6) nmap `ssl-enum-ciphers` rtm | TLSv1.2 set **exactly** `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`, `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`, `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256` (all `secp256r1`, grade A); `TLSv1.3:` section present (three `TLS_AKE_*` on **`ecdh_x25519`**); no `SSLv3:`/`TLSv1.0:`/`TLSv1.1:` sections; `least strength: A`. **Curve note: `X25519MLKEM768` is no longer offered** — the explicit `curvePreferences = ["X25519", "CurveP256"]` traded the Go-default post-quantum hybrid for an explicit, scannable policy (D-14 hint; T-33-12 accepted). Phase 34 may omit the key to restore the Go default (X25519MLKEM768 + X25519 + P-256 + P-384 + P-521). The ECDSA suites in the list are unobservable (RSA-4096 certificates, RESEARCH Pitfall 6) |
| 08:18:40 | (7)–(9) laptop | HTTPS matrix 17/17 **== pre-row** (diff empty); WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301 https://188.166.23.244/` + `200` |
| 08:18:3x | (10)–(11) micro | log scan `invalid CipherSuite\|invalid CurveID\|does not exist\|port is missing\|error while parsing` since the fire: **0 on the new task** (13 transient `does not exist` lines on the stopping task `puse77wvt5xk` — the A1/B/32 Stage 2 drain artefact); 0 other ERR lines on the new task except the pre-existing start-time `Error renewing ACME certificate: checkout.qooldata.com` (Stage E); `7442 OPEN 1883 OPEN 8883 OPEN` |
| 08:19–08:20 | (12) harness | `p33c-https https://app.thinx.cloud` → **`RESULT: PASS`** (register → status → OTT → firmware → MQTT over the new TLS options); `p33c-7442 http://rtm.thinx.cloud 7442 thinx.cloud 1883` → **`RESULT: PASS`** (keep-7442) |

**D-30 trigger evaluation: none fired** ((1) `29/0`, (5) TLS 1.2 + 1.3 handshakes succeed on rtm/app/console, (7) matrix ==
pre-row, (8) WS 101/401, (9) bare-IP 301/200, harness PASS ×2). The revert (`--args` with the 17 flags of
`traefik-p33-preC-20261009T081658Z.json` + `--config-rm tls-config-2 --config-add source=tls-config-1,target=/traefik/tls.toml,mode=0444`)
was staged and **not executed**. `tls-config-1` stays in the swarm, unreferenced, until Plan 03 removes it.

Version.Index post-Stage-C: 38379918

Repo state == live state after this task: thinx-swarm `94da01c` (origin + micro), mirror `b99210f8` MIRROR OK at 18
flags, live `traefik_traefik` 18 Args (sorted set == mirror) with `tls-config-2` mounted and loaded, 29 routers enabled
== `routers_post_A2:`. Stage D starts from here (18 → 19 flags).

### Stage D record (33-02 Task 2, 2026-10-09 08:24–08:30 UTC)

**Outcome: the live `traefik_traefik` runs the 19-flag static command with
`--entrypoints.https.http.middlewares=security-headers@swarm` (one restart, fire 08:26:21.7Z → new task `36ssa5zcgpv0`
Running 08:26:38.4Z, ≈17 s); `/api/entrypoints` reports the `https` entrypoint default middleware chain
`["security-headers@swarm"]` and the `http` entrypoint none; every one of the 17 D-27 HTTPS hosts returns exactly ONE
`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` header — HSTS matrix **3/17 before → 17/17
after** (registry's 400, the db/influx basic-auth 401s and micro's catch-all included), together with
`X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`; the cookie-less WebSocket upgrade still answers
`HTTP/1.1 101 Switching Protocols` with **0** STS lines (the 1xx bypass holds — the D-18 per-router fallback is NOT
needed), the cookie probe `401` + `X-Forwarded-Proto: https`; the HTTPS code matrix equals the pre-row; plain HTTP on the
bare IP carries 0 STS lines (the http entrypoint sends none, D-20). The two redundant per-router references were then
removed repo-first and label-only live (task ids unchanged) with HSTS still single on app/rtm. No D-30 trigger fired;
the staged 18-flag revert was NOT used.**

Precondition re-read (08:24Z): Stage C record present with `Version.Index post-Stage-C: 38379918` == live
(`args=18 upd=completed`), providers `["Swarm","File"]`, `https` entrypoint `http.middlewares` absent (null), micro HEAD
`94da01c` == thinx-swarm HEAD; HSTS baseline over the 17 hosts = **3/17** (rtm, app, console — the per-router refs),
`http://188.166.23.244/` 0 STS lines.

Repo first (P32 D-04): thinx-swarm `1578d2f` (`feat(edge): Phase 33 Stage D — …`: `traefik.yml` +
`--entrypoints.https.http.middlewares=security-headers@swarm` right after `--entrypoints.https.address=:443` with the
D-17..D-20 comment, 19 `- --` lines) → origin → micro `p33-stageD` ff-merge (dirty=0, 1 file 6+) → mirror regenerated
(`MIRROR-GENERATED ok source=thinx-swarm@1578d2f…`, `MIRROR OK files=1`, **19 flags**) and committed here
(`feat(33): Stage D — mirror regenerated at 19 flags`, `525a63fb`).

```
ssh micro "umask 077; B=/mnt/data/edge-rollback/traefik-p33-preD-\$(date -u +%Y%m%dT%H%M%SZ).json; docker service inspect traefik_traefik > \$B && chmod 600 \$B; \
  jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B"
# expect: 600 root; 18 — this file is the Stage D revert source, never leaves micro, never committed
ssh micro "jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--entrypoints.https.http.middlewares=security-headers@swarm\"] | .[]' \$B | sed -E 's/acme.email=.*/acme.email=<masked>/' | sort"
# expect: 19 lines == the mirror's 19 `- --` lines sorted (e-mail masked both sides) — sorted-set compare
ssh micro "ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args + [\"--entrypoints.https.http.middlewares=security-headers@swarm\"] | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: rc 0; ONE task restart; image unchanged; Version.Index advances; args=19; /api/entrypoints https.http.middlewares == ["security-headers@swarm"]
# post-D ref removal (label-only, after the gate is green; repo first in thinx.yml + docker-swarm.yml):
ssh micro "docker service update --detach --label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@swarm thinx_api"
ssh micro "docker service update --detach --label-rm traefik.http.routers.thinx-console-https.middlewares thinx_console"
# expect each: rc 0; task id pre == post; chains thinx-api-https ["security-headers@swarm","sslheaders@swarm"], thinx-console-https ["security-headers@swarm"]; STS count still 1 on app/rtm
```

| Time (UTC) | Step | Observed |
|---|---|---|
| 08:24:47 | pre-D HSTS baseline (laptop) | exact-directive STS count **1** on rtm/app/console, **0** on the other 14 hosts → **3/17**; `http://188.166.23.244/` 0 STS |
| 08:25 | repo first | thinx-swarm `1578d2f` on origin + micro (ff, dirty=0); mirror `525a63fb` MIRROR OK at 19 flags |
| 08:25:54 | pre-flight backup + pre-row | `/mnt/data/edge-rollback/traefik-p33-preD-20261009T082554Z.json` — `600 root`, 14621 B, Args length **18**; masked live set vs mirror **diff empty (19/19)**, thxp/mqtt/mqtts/mgmt 4/4; loopback `29/0`, names == post-C == `routers_post_A2:`; task `5agre1dyzrot`, `idx=38379918 args=18`; HTTPS matrix 17/17 == post-C row; WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301` + `200`; `7442 OPEN 1883 OPEN 8883 OPEN` |
| **08:26:21.7** | **D fire** | `docker service update --detach --args "<19 flags>" traefik_traefik` → **rc 0** |
| 08:26:21–08:26:38 | drain + start | old task `5agre1dyzrot` stopped; **new task `36ssa5zcgpv0`** `traefik:v3.7.14` micro **Running 08:26:38.4Z** (≈17 s); exactly **1** running task; `args=19 idx=38379931 upd=completed` |
| 08:27:0x | (1)–(2) loopback | status filter **`29/0`**; sorted names **== pre-row (diff empty)**; overview `[29,0,18,6,["Swarm","File"]]`; `/api/entrypoints` `https` → `http.middlewares` **`["security-headers@swarm"]`**, `http` → `null`; chains before the ref removal: thinx-api-https `["security-headers@swarm","sslheaders@swarm","security-headers@swarm"]`, thinx-console-https `["security-headers@swarm","security-headers@swarm"]`, thinx-api-ws `["security-headers@swarm","sslheaders@swarm"]` (doubled refs → still ONE header on the wire, idempotent as researched) |
| 08:27:19 | (3)–(4) HSTS matrix (laptop) | exact-directive STS count **1 on all 17 hosts — 17/17**, none 0, none 2 (no duplication); thinx.cloud header set: `strict-transport-security: max-age=31536000; includeSubDomains; preload`, `x-content-type-options: nosniff`, `x-frame-options: DENY`, `x-xss-protection: 1; mode=block`; registry's `400` carries STS + `X-Frame-Options: DENY` (outer modifier) |
| 08:27:19 | (5)–(7) laptop | HTTPS matrix 17/17 **== pre-row**; WS cookie-less → **`HTTP/1.1 101 Switching Protocols` with 0 `strict-transport-security` lines** (headers present: Connection, Sec-Websocket-Accept, Upgrade — D-18 proof, recorded not gated); cookie probe → `401` (+ STS, as any final response) + `X-Forwarded-Proto: https`; bare-IP `301 https://188.166.23.244/` + `200`; `curl -sI http://188.166.23.244/` → **0 STS lines** (D-20) |
| 08:27:0x | (8)–(9) micro | log scan `invalid CipherSuite\|invalid CurveID\|does not exist\|port is missing\|error while parsing` since the fire: **0 on the new task**; 0 non-ACME ERR lines on the new task; `7442 OPEN 1883 OPEN 8883 OPEN` |
| 08:28 | post-D ref removal — repo first | thinx-swarm `c03c529` (`chore(edge): Phase 33 post-D — …`: `thinx.yml` thinx-api-https middlewares → `sslheaders@swarm`, console router middlewares line removed, each with a D-17 comment that does not repeat the removed token) → origin → micro `p33-postD` ff (dirty=0, 1 file 3+/2−); this repo `4fccd9bc` (`docker-swarm.yml` identical edits — comment-stripped traefik-label parity diff **empty**; mirror regenerated, banner `c03c529`, still 19 flags, MIRROR OK) |
| 08:28:55 | post-D ref removal — live | `thinx_api --label-add …thinx-api-https.middlewares=sslheaders@swarm` → rc 0, task **`8v3ype7pftzh` → `8v3ype7pftzh`** (unchanged), label `sslheaders@swarm,security-headers@swarm` → `sslheaders@swarm`; `thinx_console --label-rm …thinx-console-https.middlewares` → rc 0, task **`irh0tnq5g0t2` → `irh0tnq5g0t2`** (unchanged), key gone; no `thinx-staging` push around it (P32 Pitfall 7) |
| 08:29:25 | post-removal gate (micro) | status filter **`29/0`**; chains **thinx-api-https `["security-headers@swarm","sslheaders@swarm"]`** (entrypoint default prepended), **thinx-console-https `["security-headers@swarm"]`**; `traefik_traefik` untouched (`idx=38379931 args=19`) |
| 08:29:45 | post-removal gate (laptop) | app / rtm / console STS count **exactly 1** each, codes 200; WS `101` (0 STS) / `401` + `X-Forwarded-Proto: https`; bare-IP `301` + `200`; HTTPS matrix 17/17 == pre-row |

**D-19:** the directive string is unchanged — `max-age=31536000; includeSubDomains; preload` (documented max-age: one
year), now sent by every HTTPS host instead of three; `thinx.cloud` is **NOT submitted to the HSTS preload list**
(header only — list submission is effectively irreversible for the whole domain and is a product decision).

**D-20 (recorded, not fixed — Phase 34):** `thinx-api-http` carries no `https-redirect` middleware (plain
`http://app.thinx.cloud/` answers the API directly) and the `registry-http` router has no middleware at all; the `http`
entrypoint has no headers middleware, so HSTS is never sent on `:80` (and `:7442` is not a Traefik entrypoint at all —
AGENTS.md keep-7442 holds by construction).

**D-30 trigger evaluation: none fired** ((1) `29/0`, (5) matrix == pre-row, (6) WS 101/401, (7) bare-IP 301/200; HSTS
present 17/17 so the stop-and-report branch did not apply). The revert (`--args` with the 18 flags of
`traefik-p33-preD-20261009T082554Z.json`) was staged and **not executed**; the ref-removal revert (re-add the two
`security-headers@swarm` refs) was not needed.

Version.Index post-Stage-D: 38379931

Repo state == live state after this task: thinx-swarm `c03c529` (origin + micro), mirror `4fccd9bc` MIRROR OK at 19
flags, `docker-swarm.yml` == `thinx.yml` traefik labels, live `traefik_traefik` 19 Args (sorted set == mirror), live
thinx_api / thinx_console labels == the committed files, 29 routers enabled == `routers_post_A2:`. Stage E starts from here.


### Stage E record (33-02 Task 3, 2026-10-09 08:54–09:02 UTC)

**Outcome: ACME proven end to end on the hardened edge. The three store files were snapshotted 600/700 root out of git
(`/mnt/data/edge-rollback/traefik-p33-acme-20261009T085846Z/`), the two stale April-2023 key files were deleted from the
live volume (D-23), the dead external entry `checkout.qooldata.com` (+ SANs `checkout.fotostim.com/.cz`) and the
`influx.thinx.cloud` entry were pruned with `jq` and the task was `--force`-restarted 0.6 s after the atomic `mv`
(fire 09:00:26.0Z → new task `k47479ipt1mb` Running ≈09:00:31Z, ≈5 s); Traefik re-obtained `influx.thinx.cloud` via
TLS-ALPN through the swarm ingress within ~11 s of the fire — served serial `05B91929242266AC45C0BD14E89A6C4F8247`
(notAfter 2026-12-28) → **`05806B4C8B028F41EC3ACCC00DF3C6A50B04`** (issuer Let's Encrypt YR1, notBefore 2026-10-09
08:02:05Z, notAfter **2027-01-07 08:02:04Z** = +90 d). Store count **24 -> 22 -> 23**; `acme.json` `600 root`;
`_acme.json` / `__acme.json` gone from the volume. The widened ACME log scan on the new task reads **0** and the
rtm / app serials are unchanged versus E.pre.yml — the forced restart re-challenged nothing else. No D-30 trigger fired;
the snapshot restore was NOT used. EDGE-TLS-03 closes here (D-21..D-25).**

Precondition re-read (08:54Z): Stage D record present with `Version.Index post-Stage-D: 38379931` == live
(`traefik:v3.7.14 args=19 idx=38379931 upd=completed`, task `36ssa5zcgpv0`); `/mnt/data/edge-rollback/` present
(`755 root`, the per-stage backups inside are 600); the volume held exactly `acme.json` (301121 B), `_acme.json`
(177391 B, 2023-04-25), `__acme.json` (202409 B, 2023-04-29), all `600 root`; `jq '.le.Certificates | length'` = **24**;
influx served `05B91929242266AC45C0BD14E89A6C4F8247`; `openssl x509 -checkend 2592000` → "will not expire" for
rtm / app / console / influx (nothing renews within 30 d, so no renewal save could race the edit — Pitfall 9).

**D-21 / D-25 evidence (values never written):** live Args — `acme.email=` flags **1**, `example.com` matches **0**
(ACME e-mail: real operator address), `acme.tlschallenge=true` **1** (challenge TLS-ALPN unchanged), `acme.storage=/certificates/acme.json` **1**
(storage unchanged); `args=19`. Store mode `600 root` before and after (Traefik enforces 0600 itself — RESEARCH §Q6).

D-22 renewal evidence: acme.json pre-edit mtime 2026-10-09 08:26:37.434917336 +0000; served notAfter rtm/app/console = Dec 28 2026 (renewal pass 2026-09-29)

(The pre-edit mtime is the Stage D start-time whole-store rewrite of 08:26:37Z — the store is rewritten whole at every
task start; the 2026-09-29 pass is cited from the served certificates: notAfter 2026-12-28 05:49–05:51 on rtm / app /
console = issued 2026-09-29 ~05:50Z, 90-day certificates. Traefik runs at `--log.level=ERROR`, so no renewal INFO line
exists to quote — the store mtime and the served notAfter are the log-equivalent evidence D-22 names.)

qooldata_router_refs: 0 (E.pre.yml) / 0 (live)

(`awk '/^external_stack_labels:/{f=1} f' traefik-edge.E.pre.yml | grep -c 'checkout\.'` → **0**; micro
`docker service inspect fotostim_landing-com fotostim_landing-cz --format '{{json .Spec.Labels}}' | grep -o 'checkout\.[a-z.]*' | sort -u | wc -l`
→ **0**. No fotostim router names the pruned host, so Traefik does not re-request it — the D-24 verdict for the Phase 32
deferred item is "pruned, will not re-request, owner to be notified".)

```
# 1. snapshot (umask 077; dir 700, files 600 root; never leaves micro, never committed)
ssh micro "umask 077; S=/mnt/data/edge-rollback/traefik-p33-acme-\$(date -u +%Y%m%dT%H%M%SZ); mkdir -p \$S; V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; \
  cp -p \$V/acme.json \$V/_acme.json \$V/__acme.json \$S/; chmod 700 \$S; chmod 600 \$S/*; stat -c '%s %a %U %n' \$S/*; echo SNAP=\$S"
# observed: 700 root; 301121 / 177391 / 202409 — all 600 root, cmp byte-identical to the live files
# 2. D-23: the two stale 2023 files leave the live volume (Traefik never reads them; services/traefik/update.sh reads acme.json only)
ssh micro "V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; rm -f \$V/_acme.json \$V/__acme.json; ls \$V"
# observed: acme.json
# 3. D-24 + D-22 in ONE remote command — prune into a temp copy, validate, chmod 600, atomic mv, --force within the second
ssh micro "umask 077; V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; \
  jq 'del(.le.Certificates[] | select(.domain.main == \"checkout.qooldata.com\" or .domain.main == \"influx.thinx.cloud\"))' \$V/acme.json > \$V/acme.json.new \
  && jq -e '.le.Certificates | length == 22' \$V/acme.json.new >/dev/null \
  && jq -r '.le.Certificates[].domain.main' \$V/acme.json.new | grep -c -E '^(checkout.qooldata.com|influx.thinx.cloud)\$' \
  && chmod 600 \$V/acme.json.new && mv \$V/acme.json.new \$V/acme.json && stat -c '%s %a %U' \$V/acme.json \
  && docker service update --detach --force traefik_traefik"
# observed: pruned_left=0; 278606 600 root (22 entries); rc 0 — Version.Index 38379931 -> 38379935 (updating) -> 38379946 (completed)
# 4. watch the reissue from the laptop
for i in $(seq 1 12); do echo | openssl s_client -connect influx.thinx.cloud:443 -servername influx.thinx.cloud 2>/dev/null | openssl x509 -noout -serial -issuer -enddate; sleep 10; done
# observed (first sample, 09:00:37Z): serial=05806B4C8B028F41EC3ACCC00DF3C6A50B04 issuer Let's Encrypt YR1 notAfter=Jan 7 08:02:04 2027 GMT
# rollback (staged, NOT executed): cp -p $SNAP/acme.json $V/acme.json && chmod 600 $V/acme.json && docker service update --detach --force traefik_traefik
```

| Time (UTC) | Step | Observed |
|---|---|---|
| 08:54:28 | precondition + D-21/D-25 evidence (micro) | `args=19 idx=38379931 upd=completed`, task `36ssa5zcgpv0`; e-mail flags 1 / `example.com` 0 / tlschallenge 1 / storage 1; volume = 3 files, acme.json `301121 600 root` mtime `08:26:37.43Z`; 24 entries, qooldata 1, influx 1; fotostim label `checkout.` refs **0** |
| 08:54–08:55 | D-22 / D-24 evidence (laptop) | rtm `0535CC…67B0`, app `051152…2809`, console `05F8CE…F905`, influx `05B919…8247` — all notAfter Dec 28 2026, all pass `-checkend 2592000`; E.pre.yml `external_stack_labels:` `checkout.` refs **0** |
| 08:58:46 | (1) snapshot | `/mnt/data/edge-rollback/traefik-p33-acme-20261009T085846Z` **700 root**; `acme.json` 301121 / `_acme.json` 177391 / `__acme.json` 202409, all **600 root**, `cmp` identical ×3 |
| 08:58–08:59 | pre-row (laptop) | HTTPS matrix 17/17 == post-D row (registry 400, db/influx 401, 14 × 200); WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301 https://188.166.23.244/` + `200` |
| 08:59:49 | (2) D-23 delete + loopback pre-row | volume → `acme.json` only (301121 600 root); status filter **`29/0`**; sorted names **== `routers_post_A2:` (diff empty)**; overview `[29,0,18,6,["Swarm","File"]]`; task `36ssa5zcgpv0`, `idx=38379931 args=19` |
| **09:00:25.5–09:00:26.1** | **(3) prune + E fire** | `jq del(…)` → `acme.json.new` 22 entries, `pruned_left=0`; `chmod 600` + `mv` → `278606 600 root` at 09:00:26.05Z; `docker service update --detach --force traefik_traefik` → **rc 0** at 09:00:26.1Z (edit→restart gap < 1 s) |
| 09:00:26–09:00:31 | drain + start | old task `36ssa5zcgpv0` stopped; **new task `k47479ipt1mb`** `traefik:v3.7.14` micro **Running ≈09:00:31Z** (≈5 s); `idx=38379935 upd=updating` → **`idx=38379946 upd=completed`** by 09:00:37; exactly **1** running task; `args=19`, image unchanged |
| 09:00:35.99 | store rewritten by the new task | `acme.json` mtime `09:00:35.99Z`, **291145 600 root**, **23 entries** (22 + the re-obtained influx) |
| **09:00:37** | **(4) influx reissue (laptop)** | serial **`05806B4C8B028F41EC3ACCC00DF3C6A50B04`** (≠ `05B91929242266AC45C0BD14E89A6C4F8247`), issuer `C=US, O=Let's Encrypt, CN=YR1`, notBefore `Oct 9 08:02:05 2026`, notAfter **`Jan 7 08:02:04 2027`** (+90 d); the default certificate was never observed — the TLS-ALPN obtain completed inside the ~11 s between fire and first sample |
| 09:01:11 | (5) verify (micro) | volume `acme.json` only; `600 root`; **23** entries, influx **1**, qooldata **0**; `args=19 idx=38379946 upd=completed`, 1 running task; status filter **`29/0`**; names **== pre-row (diff empty)**; overview `[29,0,18,6,["Swarm","File"]]`; `https` entrypoint default `["security-headers@swarm"]`; `7442 OPEN 1883 OPEN 8883 OPEN`; widened ACME scan `Error renewing ACME\|Unable to obtain ACME certificate\|Unable to generate a certificate` since 10m → **0**; provider error scan → **0**; 0 ERR/WRN lines on the new task |
| 09:01:2x | (5) gate (laptop) | HTTPS matrix 17/17 **== pre-row (diff empty)** — influx `401` served with the NEW certificate; WS `101` / `401` + `X-Forwarded-Proto: https`; bare-IP `301` + `200`; rtm serial `0535CC0C71E39D9378E72893F3A2141267B0` **== E.pre.yml**, app serial `051152D5A20BE36DEFA1B6FA83379CE42809` **== E.pre.yml**, console `05F8CEE45A7D64783AA80214569810CBF905` unchanged vs 08:54; influx `-checkend 6912000` → will not expire (fresh 90-day issuance), TLS 1.3 handshake OK, exactly 1 HSTS header |

**D-24 (recorded):** `qooldata_router_refs` 0/0 → the pruned `checkout.qooldata.com` entry is NOT re-requested (0
obtain-failure lines on the new task) and the start-time renewal pass no longer logs the `checkout.qooldata.com`
renewal error for the first time since the v3 cutover. The fotostim stack owner is to be notified that the
certificate for `checkout.qooldata.com` (+ `checkout.fotostim.com` / `checkout.fotostim.cz`) is no longer managed by
this edge (Phase 32 `deferred-items.md` updated). Retired thinx names (chronograf, replica, ssl, vvv, test, ctf24,
micro) stay in the store per D-24.

**Cost accepted (reversibility "costly"):** one of Let's Encrypt's 5-per-week duplicate issuances for
`influx.thinx.cloud` was spent; the 2023 key files survive only in the 700-root snapshot directory (no consumer is
known — `services/traefik/update.sh` reads `acme.json` only).

**D-30 trigger evaluation: none fired** ((1) `29/0`, (5) matrix == pre-row, (6) WS 101/401, (7) bare-IP 301/200, reissue
arrived, rtm/app serials unchanged). The snapshot restore (`cp -p $SNAP/acme.json` + `--force`) was staged and **not
executed**; `_acme.json` / `__acme.json` are not restored (no consumer).

Version.Index post-Stage-E: 38379946

Repo state == live state after this task: thinx-swarm `c03c529` (origin + micro, unchanged by Stage E — no static or
label change), mirror `4fccd9bc` MIRROR OK at 19 flags, live `traefik_traefik` 19 Args (sorted set == mirror), acme.json
23 entries `600 root`, 29 routers enabled == `routers_post_A2:`. Plan 03 captures `traefik-edge.E.post.yml`
(`acme_json:` 24 → 23, influx serial NEW, `re_challenges_in_phase: 1`), re-runs the scan and removes `tls-config-1`.

### Evidence bundle (33-03 Task 1, 2026-10-09 09:16–09:32 UTC)

**Outcome: the D-31 evidence bundle — fifteen read-only items gathered from micro and the laptop against the Phase 33
end state — is green on every item; the laptop scan prints `EDGE-SCAN OK` (0 `FAIL ` lines, exit 0) and is committed as
`## After (post-Stage-E, 2026-10-09T09:21:31Z)` in `swarm-configs/traefik-edge-scan.2026-10-08.md`; the redacted
end-state capture `swarm-configs/traefik-edge.E.post.yml` is committed; the unreferenced swarm config `tls-config-1`
was then removed (the plan's one permitted live mutation — rm 09:31:45Z, service untouched). No revert was staged or
needed. Task 2 turns the values below into the re-verify matrix.**

Precondition re-read (09:16Z): Stage E record present with `Version.Index post-Stage-E: 38379946` == live
(`traefik:v3.7.14 args=19 idx=38379946 upd=completed`, task `k47479ipt1mb` micro Running since 09:00:30Z); acme.json
`291145 600 root`, 23 entries; `docker config ls` lists `tls-config-1` and `tls-config-2`, the service mounts
`tls-config-2`; harness `/tmp/p31-device-flow/thinx-device-flow.mjs` present (3010 B); nmap 7.94, sslscan, OpenSSL,
jq, node, socat on the laptop PATH.

| # | Item | Observed (09:17–09:24Z unless noted) |
|---|---|---|
| 1 | static args | `traefik:v3.7.14 args=19 idx=38379946 upd=completed`; the four Phase 33 flags present (`mgmt.address=127.0.0.1:8080`, `exposedbydefault=false`, `file.filename=/traefik/tls.toml`, `https.http.middlewares=security-headers@swarm`); `api.insecure\|providers.docker` **0**; `example.com` **0**; `acme.email=` **1**; thxp/mqtt/mqtts flags verbatim |
| 2 | mgmt bind | in-task `ss -ltn` → exactly `LISTEN 0 4096 127.0.0.1:8080 0.0.0.0:*` (no wildcard); overlay probe from the `errorpage_errorpage` task netns `nc -z traefik 8080` → **CLOSED** (control `:80` OPEN); host `curl 127.0.0.1:8080` → **rc=7**; laptop `curl 188.166.23.244:8080` → **rc=7** |
| 3 | loopback API | status filter **`29/0`**; sorted names **== `routers_post_A2:`** (29, diff empty); overview **`[29,0,0,18,6,["Swarm","File"]]`**; middlewares exactly `couch-auth@swarm error-pages-middleware@swarm https-redirect@swarm influx-auth@swarm security-headers@swarm sslheaders@swarm` (six — no ipAllowList / rateLimit, D-05); `/api/entrypoints`: `mgmt` at `127.0.0.1:8080`, `https` default chain `["security-headers@swarm"]`, `http` none; `traefik-mgmt@swarm` `{enabled, [mgmt], api@internal, PathPrefix(\`/\`)}`; `/` → `302 Found` + `Location: /dashboard/`; `/dashboard/` → 200, `APIUrl` **1**; `ls /root/.p3*-traefik-admin` → `No such file` (D-03: no credential pre-staged) |
| 4 | labels on traefik_traefik | router keys exactly `traefik.http.routers.traefik-mgmt.{entrypoints,rule,service}`; service key `traefik.http.services.traefik-public.loadbalancer.server.port=8080` (LOAD-BEARING, kept); middleware definitions https-redirect ×2, security-headers ×7, error-pages-middleware ×3; **0** admin-auth / traefik-public-http / traefik-public-https keys |
| 5 | config | Configs `{"n":"tls-config-2","t":"/traefik/tls.toml","m":292}`; in-task `sha256sum /traefik/tls.toml` = decoded `Spec.Data` sha = committed `shasum -a 256 traefik/tls.toml` = **`bb0cba95ea22e9738f7e12b97d374129e15380db9ee428b7dc058933476c3ab6`** |
| 6 | TLS (rtm/app/console) | `-tls1_2` → `TLSv1.2` `ECDHE-RSA-AES128-GCM-SHA256` verify 0; `-tls1_3` → `TLSv1.3` `TLS_AES_128_GCM_SHA256` verify 0; `-tls1_1` → refused, 0 completed; `-tls1_2 -cipher ECDHE-RSA-AES128-SHA` → `handshake failure` ×3 (CBC refused); `-curves P-384` → `handshake failure` ×3; nmap (via the scan) TLS 1.2 set on all 17 hosts **exactly** the three ECDHE_RSA AEAD suites on `secp256r1`, `TLSv1.3:` present on `ecdh_x25519`, no SSLv3/TLSv1.0/TLSv1.1 sections, `least strength: A` |
| 7 | HSTS | exact-directive count **1 on all 17 hosts (17/17)**, none 0, none 2; `http://188.166.23.244/` → **0** STS lines (D-20) |
| 8 | HTTPS matrix (17 hosts) | rtm/app/console/thinx.cloud/www/swarmpit **200**, registry **400**, db **401**, influx **401**, fotostim ×4 / igraczech ×2 / syxra **200**, micro **200** — **== the post-A2 baseline** (Stage A record); `/api/overview` not Traefik JSON on all 17; `/dashboard/` `APIUrl` **0** on all 17; `/dashboard/` → 404 ×13, 400 registry, **302 micro** (≠ 401, D-06), 401 db/influx only (backend basic-auth, exempt) |
| 9 | WS pair | cookie-less upgrade → **`HTTP/1.1 101 Switching Protocols`** with **0** STS lines; `Cookie: foo=bar` `/p33probe` → **`HTTP/1.1 401 Unauthorized`** + `X-Forwarded-Proto: https` |
| 10 | bare-IP pair | `http://188.166.23.244/` → **`301 https://188.166.23.244/`**; `https://188.166.23.244/` (-k) → **`200`** |
| 11 | ports + publishers (micro) | **`7442 OPEN 1883 OPEN 8883 OPEN`**; `thinx_api 7442->7442`, `traefik_traefik 80->80 443->443`, `thinx_mosquitto 1883->1883 1884->1884 8883->8883` (read with `tr -s ' '`) |
| 12 | device-flow harness (09:19–09:21Z) | `p33-7442` over `http://rtm.thinx.cloud:7442` + `mqtt://thinx.cloud:1883` → **`RESULT: PASS`** (`/tmp/p33-harness-7442.log`); `p33-https` over `https://app.thinx.cloud` → **`RESULT: PASS`** (`/tmp/p33-harness-https.log`) — keep-7442 and the HTTPS device path both hold under the AEAD-only options + HSTS |
| 13 | ACME | `acme.json` **`291145 600 root`** (mtime 09:00:35.99Z), **23** entries, influx **1**, qooldata **0**, volume holds **1** file (`_acme.json`/`__acme.json` absent); served rtm `0535CC0C71E39D9378E72893F3A2141267B0` and app `051152D5A20BE36DEFA1B6FA83379CE42809` **== E.pre.yml**, console `05F8CEE45A7D64783AA80214569810CBF905` unchanged, influx **`05806B4C8B028F41EC3ACCC00DF3C6A50B04`** (YR1, notAfter Jan 7 2027) == the Stage E record; `-checkend 0` → will not expire ×4; ACME failure lines since the Stage E fire on task `k47479ipt1mb` → **0** (the one line in a 60-minute window is the OLD task `36ssa5zcgpv0`'s pre-prune start-time pass at 08:26:43Z — `checkout.qooldata.com`, gone for good after the prune, D-24); provider-error scan **0** |
| 14 | repo == deployed | thinx-swarm `c03c529` == micro `/mnt/gluster/deployment/swarm` HEAD (dirty 0) == `origin/master` == mirror banner; `check-traefik-mirror.js` → **`MIRROR OK files=1`**; **19** `- --` lines in the mirror; comment-stripped traefik-label parity diff `docker-swarm.yml` vs `thinx.yml` → **empty**; mirror working copy clean |
| 15 | external stacks (D-09) | `fotostim_landing-com` / `fotostim_landing-cz` / `igraczech-com_web` / `syxra-cz_web` label KEYS + router rule/entrypoints/middlewares values **identical to `external_stack_labels:` in E.pre.yml** — no label of theirs changed in Phase 33; they received TLS options + HSTS + the exposure flip edge-wide (HSTS 1 on all seven of their hosts, 3 AEAD suites, 200) |

**External scan (criterion 4, D-26..D-29):** `scripts/traefik-edge-scan.sh` 09:21:31Z → 09:23:28Z → **`EDGE-SCAN OK`**,
rc 0, **0** `FAIL ` lines (Before: `EDGE-SCAN FAIL 32`); port sweep `80 open, 443 open, 8080 closed, 8443 closed`,
`port 7442 rtm.thinx.cloud open`, no-SNI `CN=TRAEFIK DEFAULT CERT`. Appended to the capture as `## After` (verdict,
per-host matrix, full stdout) + `## Reported, not gating (after)` (D-20 redirects, D-16 no-SNI, X25519MLKEM768 no longer
offered — sslscan `Curve 25519 DHE 253`, groups `x25519`/`secp256r1` only —, CBC now refused, 8080/8443 closed before
and after, keep-7442). Hygiene on the capture and on `E.post.yml`: secret markers **0**, e-mail addresses **0**;
`E.post.yml` 19 `- --` lines, 0 admin-auth / traefik-public-http / traefik-public-https tokens; `D.post.yml` and
`E.pre.yml` unchanged (`git diff --quiet HEAD`). `swarm-configs/README.md` names step `E` and the scan capture.

```
# the only live mutation of Plan 33-03 (after every item above was green; 09:31:45Z):
ssh micro "docker config rm tls-config-1; docker config ls --filter name=tls-config-1 -q | wc -l; docker config ls --filter name=tls-config-2 -q | wc -l; docker service inspect traefik_traefik --format '{{range .Spec.TaskTemplate.ContainerSpec.Configs}}{{.ConfigName}}{{end}} {{.Version.Index}}'"
# observed: rc 0; 0 ; 1 ; tls-config-2 38379946 — same task k47479ipt1mb, args=19, loopback 29/0, in-task tls.toml sha unchanged (no restart: a config object removal does not touch the service)
# recreate path (only to re-mount the historical Phase 31/32 file, which NO revert step requires — dropping --providers.file.filename makes any mounted file inert):
ssh micro "git -C /mnt/gluster/deployment/swarm show 158f369:traefik/tls.toml | docker config create tls-config-1 -"
```

Version.Index post-Task-1: 38379946 (unchanged — no service update in this task)

Repo state == live state after this task: thinx-swarm `c03c529` (origin + micro), mirror MIRROR OK at 19 flags, live
`traefik_traefik` 19 Args (sorted set == mirror), `tls-config-2` the only tls-config in the swarm, 29 routers enabled ==
`routers_post_A2:`, acme.json 23 entries `600 root`. Task 2 writes the matrix, the hand-off and the Phase 34 record.

### Re-verify matrix (Phase 33, 2026-10-09 09:16–09:40 UTC) vs the Plan 01 baseline (E.pre.yml / Stage A record)

Every RESEARCH §Q8 signal, observed at the 19-flag end state by Plan 33-03 Task 1 (values above) and compared with the
pre-Stage-A1 baseline (`traefik-edge.E.pre.yml`, the Baseline section and the Stage A record). The HTTPS matrix compares
against the **post-A2 baseline** (micro at its catch-all code), not the pre-phase 401 — the one intentional code change
of the phase (D-06). No live mutation other than `docker config rm tls-config-1` (09:31:45Z).

| Signal | Baseline (before A1, 2026-10-08 22:39Z) | End state (after E, 2026-10-09 09:17–09:40Z) | Verdict |
|---|---|---|---|
| static args (count) | `traefik:v3.7.14 args=16 idx=38379738` | **`traefik:v3.7.14 args=19 idx=38379946 upd=completed`**, task `k47479ipt1mb` | +3 flags, designed end state |
| the four Phase 33 flags | 0 of `mgmt.address\|file.filename\|https.http.middlewares`; `exposedbydefault=true` | **`--entrypoints.mgmt.address=127.0.0.1:8080`, `--providers.file.filename=/traefik/tls.toml`, `--entrypoints.https.http.middlewares=security-headers@swarm` present; `--providers.swarm.exposedbydefault=false`** | A1 / C / D / B landed |
| `api.insecure` / `providers.docker` in Args | 0 / 0 | **0 / 0** | never set |
| `acme.email=` / `example.com` | 1 / 0 (real address, templated `${EMAIL}` in git) | **1 / 0** | D-21 holds |
| mgmt bind inside the task | no 8080 listener (`ss -ltn \| grep -c ':8080 '` → 0) | **exactly `LISTEN 127.0.0.1:8080`**, no wildcard | loopback only |
| reachability of :8080 | n/a (nothing listening); laptop `curl :8080` rc=7 | overlay (errorpage netns) `nc -z traefik 8080` **CLOSED** (control :80 OPEN); host `curl 127.0.0.1:8080` **rc=7**; laptop **rc=7**; nmap 8080/8443 **closed** | unreachable from overlay, host, internet (D-02) |
| router inventory (names) | 30 (`router_inventory_pre`: incl. the two public dashboard routers) | **29 == `routers_post_A2:`** (−2 public routers +`traefik-mgmt@swarm`; diff empty) | designed; identical since A2 |
| status filter | n/a before A2 (public API only) | **`29/0`** | nothing disabled |
| overview | 30 routers / 18 services / 7 middlewares / providers `["Swarm"]` | **`[29,0,0,18,6,["Swarm","File"]]`** | admin-auth gone; File provider added |
| middleware list | 7 incl. the basic-auth `admin-auth` | **six: couch-auth, error-pages-middleware, https-redirect, influx-auth, security-headers, sslheaders** (all `@swarm`); 0 ipAllowList / 0 rateLimit | D-01 + D-05 hold |
| public dashboard (`https://micro.thinx.cloud/dashboard/`) | **401** (basic-auth dashboard router) | **302** (catch-all path); `/api/overview` not JSON; `APIUrl` 0 on all 17 hosts; `/dashboard/` ≠ 401 on the 15 non-basic-auth hosts | no public route (D-06) |
| dashboard on the loopback | n/a | `/` → **302 `/dashboard/`**, `/dashboard/` → 200 **`APIUrl` 1** | kept, loopback only (D-03) |
| credential file on micro | `/root/.p32-traefik-admin` shredded in P32 | **none** (`ls /root/.p3*-traefik-admin` → No such file) | nothing pre-staged (D-03) |
| labels on `traefik_traefik` | admin-auth + 9 public-router keys + port label | **3 `traefik-mgmt` keys + the LOAD-BEARING port label; 0 admin-auth / traefik-public-http / traefik-public-https** | A2 end state |
| mounted config | `tls-config-1` (sha `7e43d8f9…`, never loaded) | **`tls-config-2` @ `/traefik/tls.toml` mode 292, sha `bb0cba95ea22e973…` == committed, LOADED**; `tls-config-1` **removed from the swarm** (09:31:45Z) | C end state |
| TLS 1.0 / 1.1 | refused | **refused** (`-tls1_1` 0 completed; nmap/sslscan no legacy sections ×17) | identical |
| TLS 1.2 suite set (nmap, ×17) | 5: 3 AEAD + `AES_128_CBC_SHA` + `AES_256_CBC_SHA` | **3: `ECDHE_RSA_WITH_AES_128_GCM_SHA256`, `AES_256_GCM_SHA384`, `CHACHA20_POLY1305_SHA256`** (D-14 as observable on RSA certs) | CBC gone |
| TLS 1.3 | offered (groups incl. X25519MLKEM768) | **offered**, `ecdh_x25519`; groups `x25519` / `secp256r1` only — **X25519MLKEM768 no longer offered** | offered both; curve policy change recorded (Phase 34) |
| CBC handshake `ECDHE-RSA-AES128-SHA` (rtm/app/console) | accepted (0 failures ×3, Stage C pre-row) | **`handshake failure` ×3** | refused |
| P-384 handshake | accepted | **`handshake failure` ×3** | curvePreferences applied |
| TLS 1.2 / 1.3 handshakes rtm/app/console | ok / ok | **ok (verify 0) / ok (verify 0)** | identical |
| HSTS (exact directive, 17 hosts) | 3/17 (rtm, app, console) | **17/17, exactly 1 each** | D edge-wide (D-17) |
| STS on `http://188.166.23.244/` | 0 | **0** | never on :80 (D-20) |
| HTTPS code matrix (17 hosts) | rtm/app/console/thinx.cloud/www/swarmpit 200, registry 400, db 401, influx 401, 7 externals 200, **micro 401** | identical on 16 hosts; **micro 200** (downtime catch-all) | == post-A2 baseline; one intentional change (D-06) |
| WS cookie-less upgrade | `HTTP/1.1 101` | **`HTTP/1.1 101 Switching Protocols`, 0 STS lines** | identical; D-18 fallback not needed |
| WS cookie probe `/p33probe` | `401` + `X-Forwarded-Proto: https` | **`401` + `X-Forwarded-Proto: https`** | identical |
| bare-IP pair | `301 https://188.166.23.244/` / `200` | **`301 https://188.166.23.244/` / `200`** | catch-alls alive |
| `:7442` / `:1883` / `:8883` (micro `/dev/tcp`) | OPEN ×3 | **OPEN ×3** | keep-7442 holds |
| publishers | `thinx_api 7442->7442`; `traefik_traefik 80->80 443->443`; `thinx_mosquitto 1883 1884 8883` | **identical** | direct-publish model untouched |
| device-flow harness | PASS ×2 (2026-10-08 15:13Z, P32) | **PASS ×2** (`p33-7442` plaintext + MQTT; `p33-https` over app) | re-verified at the end state |
| acme.json | `301121 600 root`, **24** entries, 3 files in the volume | **`291145 600 root`, 23 entries, 1 file** (stale 2023 files in the 700-root snapshot) | pruned + reissued (D-22..D-24) |
| influx serial | `05B91929242266AC45C0BD14E89A6C4F8247` (notAfter 2026-12-28) | **`05806B4C8B028F41EC3ACCC00DF3C6A50B04`** (YR1, notAfter 2027-01-07) | TLS-ALPN reissue proven (D-22) |
| rtm / app / console serials | `0535CC…67B0` / `051152…2809` / `05F8CE…F905` | **identical** | no collateral re-challenge |
| ACME failure lines (new task) | 1 per start (`checkout.qooldata.com`) | **0** since the Stage E fire | D-24 |
| stale `_acme.json` / `__acme.json` | present (April 2023, 600 root) | **absent** from the volume; preserved in `traefik-p33-acme-20261009T085846Z/` | D-23 |
| external stacks' labels (D-09) | `external_stack_labels:` dump | **identical** keys + rule/entrypoints/middlewares values | untouched; reached edge-wide |
| repo == deployed | thinx-swarm `158f369` == micro == mirror (16 flags) | **thinx-swarm `c03c529` == micro HEAD == origin/master == mirror banner; `MIRROR OK files=1` at 19; parity diff empty** | success criterion 3 |
| external scan | `EDGE-SCAN FAIL 32` | **`EDGE-SCAN OK`** (0 FAIL; re-run 09:37–09:39Z also OK) | criterion 4 |

Verdict: every row at its designed end-state value or identical to the baseline; nothing to revert.

### Live production state at hand-off (Phase 33, for the Task 3 human-verify gate)

`traefik_traefik`: `traefik:v3.7.14` (image id `5a93040e…`, unchanged since P31), **19 Args** (live order; `${EMAIL}` templated):

```
--providers.swarm
--providers.swarm.constraints=Label(`traefik.constraint-label`, `traefik-public`)
--providers.swarm.exposedbydefault=false
--entrypoints.http.address=:80
--entrypoints.https.address=:443
--entrypoints.vpn.address=:1194
--entrypoints.mqtt.address=:1883
--entrypoints.mqtts.address=:8883
--entrypoints.thxp.address=:7442
--certificatesresolvers.le.acme.email=${EMAIL}
--certificatesresolvers.le.acme.storage=/certificates/acme.json
--certificatesresolvers.le.acme.tlschallenge=true
--accesslog
--log
--log.level=ERROR
--api
--entrypoints.mgmt.address=127.0.0.1:8080
--providers.file.filename=/traefik/tls.toml
--entrypoints.https.http.middlewares=security-headers@swarm
```

Labels: `traefik.enable=true`, `traefik.swarm.network=traefik-public`, `traefik.constraint-label=traefik-public`, the
`https-redirect` (2), `security-headers` (7) and `error-pages-middleware` (3) definitions,
`traefik.http.routers.traefik-mgmt.{rule=PathPrefix(\`/\`),entrypoints=mgmt,service=api@internal}`,
`traefik.http.services.traefik-public.loadbalancer.server.port=8080` (LOAD-BEARING). Configs: `tls-config-2` @
`/traefik/tls.toml` 0444. Ports 80/443 only. **`Version.Index post-Stage-E: 38379946`**, running task **`k47479ipt1mb`**
on micro (since 09:00:30Z). `acme.json` `291145 600 root`, 23 entries. 29/29 routers enabled == `routers_post_A2:`.
`:7442` / `:1883` / `:8883` OPEN and direct-published by `thinx_api` / `thinx_mosquitto`; harness PASS ×2.

Repo state == live state: thinx-swarm `c03c529` + the Plan 03 README commit (origin/master == micro checkout == mirror
banner), mirror `MIRROR OK` at 19 flags, `docker-swarm.yml` == `thinx.yml` traefik labels. **`thinx-staging` is NOT
pushed** by Phase 33 (the operator pushes when ready; every push rolls `thinx_api` via Swarmpit, ~6 min; no `thinx_api`
label changed live in a way the committed file does not already carry, so the rollout is a no-op for the edge).

**Ordered revert, should the operator reject the gate.** No credential and no dashboard are needed — the behavioural
probes (gate quartet: loopback status filter via `docker exec … wget`, HTTPS matrix over the 17 hosts, WS 101/401 pair,
bare-IP pair, `7442/1883/8883 OPEN`) decide each step. Steps (a)–(h) are independent of each other **except that (g)
must precede (h)**: the `traefik-mgmt` router references the `mgmt` entrypoint, so the public router labels go back
before the entrypoint flag is removed (otherwise the mgmt router errors on a missing entrypoint). Revert only as far as
the failure requires; each step is one `docker service update` followed by the gate quartet. Backup files are
`600 root` on micro and never leave the host; Args are rebuilt with `jq map(@sh)` — never typed.

```
# (a) Stage E — ACME store back to 24 entries (only if the reissue/prune is the problem)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "S=/mnt/data/edge-rollback/traefik-p33-acme-20261009T085846Z; V=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data; cp -p \$S/acme.json \$V/acme.json && chmod 600 \$V/acme.json && docker service update --detach --force traefik_traefik"
# expect: rc 0; new task Running in ~5-15 s; jq '.le.Certificates | length' -> 24; influx serves 05B91929242266AC45C0BD14E89A6C4F8247 again until its own renewal (the 2023 key files are NOT restored — no consumer)
# (b) Stage D — 18 flags (HSTS entrypoint default off)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "B=/mnt/data/edge-rollback/traefik-p33-preD-20261009T082554Z.json; jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: 18 ; rc 0; one restart; /api/entrypoints https.http.middlewares -> null; HSTS back to the per-router hosts only
# (c) post-D labels — re-add the per-router security-headers refs (needed only together with (b), otherwise rtm/app/console lose HSTS entirely)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.http.routers.thinx-api-https.middlewares=sslheaders@swarm,security-headers@swarm thinx_api"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.http.routers.thinx-console-https.middlewares=security-headers@swarm thinx_console"
# expect each: rc 0; task id pre == post; STS exactly 1 on app/rtm/console
# (d) Stage C — 17 flags (file provider off; the mounted tls-config-2 becomes inert, Go-default TLS returns incl. the two CBC-SHA1 suites)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "B=/mnt/data/edge-rollback/traefik-p33-preC-20261009T081658Z.json; jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: 17 ; rc 0; one restart; providers ["Swarm"]; CBC handshake accepted again
# optional, only to re-mount the historical file (no step requires it): recreate tls-config-1 from git FIRST, then swap the mount
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "git -C /mnt/gluster/deployment/swarm show 158f369:traefik/tls.toml | docker config create tls-config-1 - && docker service update --detach --config-rm tls-config-2 --config-add source=tls-config-1,target=/traefik/tls.toml,mode=0444 traefik_traefik"
# (e) Stage B — exposedbydefault=true
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "B=/mnt/data/edge-rollback/traefik-p33-preB-20261008T231031Z.json; jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: 17 ; rc 0; one restart; inventory still 29 (every service opts in anyway)
# (f) D-08 labels — re-add from traefik-edge.E.pre.yml `d08_live_labels_pre` (label-only except the two container labels, which restart transformer/worker)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.enable=true --label-add traefik.swarm.network=traefik-public --label-add traefik.tcp.routers.mosquitto-secure.entrypoints=mqtts --label-add traefik.tcp.services.mosquitto.loadbalancer.server.port=8883 thinx_mosquitto"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-rm traefik.swarm.network --label-add traefik.docker.network=traefik-public downtime_downtime"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-rm traefik.swarm.network --label-add traefik.docker.network=traefik-public errorpage_errorpage"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.frontend.headers.STSPreload=true --label-add traefik.frontend.headers.STSSeconds=31536000 thinx_console"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-add traefik.frontend.headers.STSPreload=true --label-add traefik.frontend.headers.STSSeconds=31536000 thinx_vue"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --container-label-add traefik.backend.transformer.noexpose= thinx_transformer"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --container-label-add traefik.backend.worker.noexpose= thinx_worker"
# expect: rc 0 each; the network-key flips in ONE update each (never both keys at once); bare-IP pair still 301/200
# (g) Stage A2 — public dashboard routers + basic-auth back, mgmt router off (ONE update; values read by jq ON micro from the pre-A1 backup, never printed)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "B=/mnt/data/edge-rollback/traefik-p33-preA1-20261008T225429Z.json; A=\$(jq -r '.[0].Spec.Labels | to_entries[] | select(.key | test(\"admin-auth|traefik-public-http|traefik-public-https\")) | \"--label-add \" + (.key + \"=\" + .value | @sh)' \$B | tr '\n' ' '); eval docker service update --detach \$A --label-rm traefik.http.routers.traefik-mgmt.rule --label-rm traefik.http.routers.traefik-mgmt.entrypoints --label-rm traefik.http.routers.traefik-mgmt.service traefik_traefik"
# expect: rc 0; same task id; 10 keys back (readback: grep -c 'admin-auth\|traefik-public-' -> 10); https://micro.thinx.cloud/dashboard/ -> 401 again; inventory 30
# (h) Stage A1 — 16 flags (mgmt entrypoint off) — ONLY after (g)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "B=/mnt/data/edge-rollback/traefik-p33-preA1-20261008T225429Z.json; jq '.[0].Spec.TaskTemplate.ContainerSpec.Args | length' \$B; ARGS=\$(jq -r '.[0].Spec.TaskTemplate.ContainerSpec.Args | map(@sh) | join(\" \")' \$B); docker service update --detach --args \"\$ARGS\" traefik_traefik"
# expect: 16 ; rc 0; one restart; no 8080 listener in the task; == the Phase 32 end state (traefik-edge.D.post.yml)
# (i) repo reverts (both repos, newest first), mirror regenerated, origin push + micro ff — AFTER the live state matches
git -C ~/Repositories/thinx-swarm revert --no-edit c03c529 1578d2f 94da01c efee92c 6dc974b 93036a8 && git -C ~/Repositories/thinx-swarm push origin master
GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020" git -C ~/Repositories/thinx-swarm push ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/heads/p33-revert
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "cd /mnt/gluster/deployment/swarm && git merge --ff-only p33-revert && git branch -d p33-revert && git rev-parse HEAD"
git revert --no-edit 4fccd9bc 525a63fb b99210f8 1c5f5f53 a68a02ff 7fd5f2b4 && node scripts/generate-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm && node scripts/check-traefik-mirror.js --swarm-repo ~/Repositories/thinx-swarm && git add docker-compose.traefik.yml && git commit -m "revert(33): mirror back to 16 flags"
# expect: MIRROR OK files=1 at 16 flags; thinx-swarm HEAD == micro HEAD; the Plan 03 documentation commits may stay (records), the runbook then gains a "reverted" record
```

After (a)–(i) the edge is at the Phase 32 end state (`traefik-edge.D.post.yml`): public basic-auth dashboard, Go-default
TLS (CBC-SHA1 accepted), HSTS on three hosts, 24-entry store with the failing `checkout.qooldata.com` renewal.
EDGE-API-01/02 and EDGE-TLS-01/02/03 then stay open; nothing is re-labelled without the operator's explicit decision.
Partial reverts are fine: e.g. (b)+(c) alone restores the pre-HSTS header posture while keeping the lockdown and the
TLS options.

### Human gate result (33-03 Task 3, D-31)

Operator approval relayed 2026-10-09 ≈10:05 UTC: `https://rtm.thinx.cloud/` console OK over the hardened edge; Traefik dashboard via the laptop bridge OK after the trailing-slash correction (`http://127.0.0.1:8080/dashboard` → 404 from `api@internal`, `/dashboard/` → 200, `/` → 302 `/dashboard/`). No revert step executed; EDGE-API-01/02 and EDGE-TLS-01/02/03 close.

## Recorded for Phase 34

Items deliberately NOT done in Phase 33, carried with their evidence (CONTEXT `<deferred>`, Stage C/D/E records,
scan capture `## Reported, not gating (after)`):

- **D-05 real client IPs at the edge.** Swarm ingress NAT makes every client `10.0.0.2` for Traefik, the access log and
  `thinx_api`'s `X-Forwarded-For`. Fix candidates: host-mode port publishing on micro (every routed hostname, external
  stacks included, resolves only to `188.166.23.244` and the `Traefik` node label sits on micro) or PROXY protocol.
  **Prerequisite for any `ipAllowList` / `rateLimit` middleware — none was added in Phase 33** (both would key on
  `10.0.0.2`; the loopback middleware list stays at the six known names).
- **Operator-supplied allow-list candidates, recorded for the Phase 34 `ipAllowList` design (not applicable in Phase 33
  because of the ingress NAT):** `86.49.234.236`, `194.213.34.194`, `194.213.34.193`.
- **D-20 `:80` → `:443` redirect gaps.** `thinx-api-http` carries no `https-redirect` (plain `http://app.thinx.cloud/`
  answers the API directly — the plaintext API path legacy devices use, so any redirect must spare device
  user-agents / paths or stay off); the `registry-http` router has no middleware at all (400 on `http://`);
  `db.thinx.cloud` answers 401 on `http://` (couch-auth). HSTS is never sent on the `http` entrypoint. An
  entrypoint-level redirect is the Phase 34 candidate; `:7442` is not a Traefik entrypoint and stays untouched
  (AGENTS.md keep-7442).
- **D-16 `sniStrict=true`** once a scan window shows no no-SNI clients. Today a no-SNI client receives
  `CN=TRAEFIK DEFAULT CERT` and falls through to the catch-all pages (recorded in the scan capture, before and after).
  Flip = edit `traefik/tls.toml`, bump `CONFIG` to 3, `docker config create tls-config-3` from the micro checkout,
  `--config-rm tls-config-2 --config-add source=tls-config-3,…` (one restart).
- **Curve policy.** `curvePreferences = ["X25519", "CurveP256"]` dropped the Go-default post-quantum hybrid
  **X25519MLKEM768** on TLS 1.3 (sslscan: `Curve 25519 DHE 253`, groups `x25519`/`secp256r1` only; P-384 refused).
  Omitting the key restores the Go default (X25519MLKEM768 + X25519 + P-256 + P-384 + P-521) — same `CONFIG` bump
  mechanics as above. T-33-12 accepted for Phase 33.
- **Retired thinx ACME names still in the store** (D-24 keeps them): chronograf, replica, ssl, vvv, test, ctf24, micro
  (+ the `landing`/`www` SANs). Pruning = the Stage E procedure (snapshot → `jq del` → `chmod 600` → `mv` → `--force`
  in one remote command); none has a router, so nothing is re-requested.
- **fotostim stack owner notification:** `checkout.qooldata.com` (+ SANs `checkout.fotostim.com` / `checkout.fotostim.cz`)
  is no longer certificate-managed by this edge (pruned in Stage E; `qooldata_router_refs` 0/0, so Traefik will not
  re-request it). Carried from the Phase 32 deferred item. **Closed 2026-10-09:** the operator is the fotostim
  stack owner, so no separate notification is needed.
- **`tls-config-1` recreate path** (removed 2026-10-09 09:31:45Z; no revert step needs it):
  `git -C /mnt/gluster/deployment/swarm show 158f369:traefik/tls.toml | docker config create tls-config-1 -`.
- **Unchanged Phase 34 scope** (fix-forward rows #6/#7 + SLA): `--log.level=ERROR` → INFO/WARN (EDGE-OPS-01; note no
  renewal INFO line exists today, which is why D-22 cites store mtime + served notAfter), the raw
  `/var/run/docker.sock:ro` bind → read-only socket-proxy (EDGE-OPS-02), SLA close-out.
- **Not scheduled (product decisions):** HSTS preload-list submission for `thinx.cloud` (header carries `preload`, the
  list is NOT submitted — D-19); a management VPN on the swarm (`:1194` stays vestigial).
- **33-REVIEW deferrals (code review fix pass, 2026-10-09).** Each needs a coordinated live edge change (repo
  first in thinx-swarm, then ONE `docker service update`, gated by the loopback router inventory) or an operator
  action, so none was done in the review fix:
  - **WR-02 credential rotation (operator).** Rotate the `couch-auth` / `influx-auth` basic-auth credential pair:
    it has the same `USERNAME`/`HASHED_PASSWORD` lineage as the retired dashboard password, whose plaintext stays
    retrievable from thinx-swarm history at `158f369` (`traefik.sh`). New password → `openssl passwd -apr1` → `.env`
    on micro → `--label-add traefik.http.middlewares.couch-auth.basicauth.users=…` on `thinx_couchdb` (same for
    `influx-auth`), values over ssh stdin only, never printed or committed; then one line in `traefik.sh`/README
    "credential rotated on <date>; the historic literal in git history is dead". Optional: `git filter-repo
    --replace-text` on the private repo (origin + micro are the only remotes).
  - **WR-03 HSTS default middleware is a single point of failure.** `--entrypoints.https.http.middlewares=security-headers@swarm`
    makes every `:443` router depend on labels of `traefik_traefik`; losing them (a `--label-rm` typo, the
    LOAD-BEARING port label, an empty swarm config on provider restart) disables all 28 public routers (404
    everywhere). Fix: define `[http.middlewares.security-headers.headers]` (browserXssFilter, contentTypeNosniff,
    forceSTSHeader, frameDeny, stsIncludeSubdomains, stsPreload, stsSeconds = 31536000) in `traefik/tls.toml`
    (file provider, `tls-config-3` rotation per README §TLS options), switch the static flag to
    `security-headers@file` in the same `--args` update, then retire or keep the `@swarm` copy.
  - **WR-04 `couch-auth` challenges on plaintext `:80`.** `traefik.http.routers.thinx-db-http.middlewares=couch-auth,https-redirect`
    answers 401 Basic on `http://db.thinx.cloud/` before the redirect, so clients send the credential in
    cleartext. Change it to `https-redirect` only in BOTH `docker-swarm.yml` (thinx-device-api) and thinx-swarm
    `thinx.yml`, then apply live with `--label-add` on `thinx_couchdb` (label-only, no restart), gated by the
    router-inventory check; `couch-auth` stays on the https router. Overlaps the D-20 redirect-gap item above.
  - **WR-05 `vault.yml` leftovers.** The dormant stack file is deploy-safe since thinx-swarm `b04f066` (no
    host-published `:8200`, `vault-http` redirects). Still open: the `vault:1.5.5` image pin (2020, unmaintained —
    pin a maintained `hashicorp/vault` tag) and whether to delete `vault.yml` (+ `vault.conf`) outright; if it is
    ever deployed, add `vault.thinx.cloud` to `scripts/traefik-edge-scan.sh` `HOSTS` (not before — no live router
    exists, the scan would fail).
  - **WR-01 follow-up (operator).** The four tracked `traefik.yml.bak.*` copies with the cleartext Pilot token are
    gone from HEAD (thinx-swarm `d156e79`); an untracked copy in micro's deploy checkout,
    `traefik.yml.bak.20261007120354.pre-p30-pilot`, still carries one `--pilot.token=` line (count only, value not
    read) — move it under `/mnt/data/edge-rollback/` (600 root) or delete it. No other tracked `*.bak*` file
    carries a token, apr1/bcrypt or key marker.
    **Closed 2026-10-09:** the operator deleted it; micro's deploy checkout now holds 0 `traefik.yml.bak*` files and
    0 files with a `--pilot.token=` line.
