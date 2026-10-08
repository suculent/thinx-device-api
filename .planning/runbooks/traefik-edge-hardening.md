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

