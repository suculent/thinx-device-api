# Traefik edge external scan — 2026-10-09 (Phase 34)

Phase 34 (EDGE-OPS-01/02/03; D-01..D-20). Laptop-only run of `scripts/traefik-edge-scan.sh` (`nmap 7.94` with
`ssl-enum-ciphers` + a port sweep incl. 8080/8443, `sslscan`, `curl 8.7.1 -I`, `OpenSSL 3.6.3`); no third-party
scanner; **header names, port states, cipher-suite names, HTTP codes and certificate serials only** — no response
bodies, no certificate bodies, no credentials. Run from outside the swarm on purpose: `micro` sees every client as
`10.0.0.2` and sits inside the edge. Same script, same 17 hosts and same pass bar (D-28) as
`traefik-edge-scan.2026-10-08.md` (Phase 33), so the Phase 33 `## After` and this `## Before` diff cleanly.

- **Sections:** `## Before (pre-P34-A)` is taken BEFORE any Phase 34 change (Plan 34-01 Task 1, against the Phase 33
  end state); `## After` is appended by Plan 34-05 against the same script at the Phase 34 end state.

## Before (pre-P34-A, 2026-10-09T13:35:40Z)

Run 13:35:40Z → 13:37:33Z (2 min) against the Phase 33 end state (`traefik:v3.7.14 args=19`, task `k47479ipt1mb`,
`Version.Index 38379946`, Configs `tls-config-2`, raw Docker socket bind, the error-only log level, common-format
access log). **Verdict: `EDGE-SCAN OK`**, exit 0, **0 `FAIL ` lines** — byte-identical in every predicate to the
Phase 33 `## After (post-Stage-E)` run:

- TLS 1.2 set on all 17 hosts is exactly the three observable ECDHE_RSA AEAD suites (17/17); TLS 1.3 offered 17/17;
  no SSLv3 / TLS 1.0 / TLS 1.1 anywhere (17/17 `legacy … none`).
- HSTS `max-age=31536000; includeSubDomains; preload` exactly once on all 17 HTTPS hosts.
- **0** `dashboard-401`, **0** `dashboard-open`, **0** `api-exposed`; `APIUrl` signature 0 everywhere.
- Port sweep: `80 open`, `443 open`, `8080 closed`, `8443 closed`; `7442` open (keep-7442).
- No-SNI client receives `CN=TRAEFIK DEFAULT CERT` (D-16, reported).
- Serials: all 17 identical to the Phase 33 `## After` column (influx `05806B4C8B028F41EC3ACCC00DF3C6A50B04`).

### Per-host matrix (before)

| host | https code | HSTS | TLS1.0/1.1 | TLS1.2 suites | TLS1.3 | cert serial | `http://` redirect (D-20, reported) |
|---|---|---|---|---|---|---|---|
| rtm.thinx.cloud | 200 | yes (1) | refused | 3 AEAD only | offered | 0535CC0C71E39D9378E72893F3A2141267B0 | 301 https://rtm.thinx.cloud/ |
| app.thinx.cloud | 200 | yes (1) | refused | 3 AEAD only | offered | 051152D5A20BE36DEFA1B6FA83379CE42809 | 200 (plaintext API path for legacy devices — stays, D-17) |
| console.thinx.cloud | 200 | yes (1) | refused | 3 AEAD only | offered | 05F8CEE45A7D64783AA80214569810CBF905 | 301 https://console.thinx.cloud/ |
| thinx.cloud | 200 | yes (1) | refused | 3 AEAD only | offered | 05985238756DDB1D8FE88F15C2780670FB6D | 301 https://thinx.cloud/ |
| www.thinx.cloud | 200 | yes (1) | refused | 3 AEAD only | offered | 05985238756DDB1D8FE88F15C2780670FB6D | 301 https://www.thinx.cloud/ |
| swarmpit.thinx.cloud | 200 | yes (1) | refused | 3 AEAD only | offered | 05F241E17BADFEFAB79078069E218FB5D282 | 301 https://swarmpit.thinx.cloud/ |
| registry.thinx.cloud | 400 | yes (1) | refused | 3 AEAD only | offered | 05BDB7A8495E98A507BD392073F1D2306425 | 400 (registry http router has no redirect — Plan 34-03, D-17) |
| db.thinx.cloud | 401 | yes (1) | refused | 3 AEAD only | offered | 05ABDB813970665925BBF3986D858437F8C2 | 401 (couch-auth on the http router — WR-04, Plan 34-03, D-17) |
| influx.thinx.cloud | 401 | yes (1) | refused | 3 AEAD only | offered | 05806B4C8B028F41EC3ACCC00DF3C6A50B04 | 301 https://influx.thinx.cloud/ |
| www.fotostim.com | 200 | yes (1) | refused | 3 AEAD only | offered | 05CA722C72F15D90F21C62D2042992CAB37A | 301 https://www.fotostim.com/ |
| www.fotostim.cz | 200 | yes (1) | refused | 3 AEAD only | offered | 059B763F7AAA69FEBA932265DAB2215F3A92 | 301 https://www.fotostim.cz/ |
| fotostim.com | 200 | yes (1) | refused | 3 AEAD only | offered | 068859B1E2768CC50E6AA79CBBC559958C13 | 301 https://fotostim.com/ |
| fotostim.cz | 200 | yes (1) | refused | 3 AEAD only | offered | 058A2108047618D8AE8BAEE94DFD9656C275 | 301 https://fotostim.cz/ |
| igraczech.com | 200 | yes (1) | refused | 3 AEAD only | offered | 069BB404CE5F1F729812C79096FEB2F867A7 | 301 https://igraczech.com/ |
| www.igraczech.com | 200 | yes (1) | refused | 3 AEAD only | offered | 069BB404CE5F1F729812C79096FEB2F867A7 | 301 https://www.igraczech.com/ |
| www.syxra.cz | 200 | yes (1) | refused | 3 AEAD only | offered | 0584ABE5714F7F196979A72B1C74C87CB60F | 301 https://www.syxra.cz/ |
| micro.thinx.cloud | 200 (downtime catch-all) | yes (1) | refused | 3 AEAD only | offered | 055AA7B98C8710DE6D85012BE3C983F11294 | 301 https://micro.thinx.cloud/ |

Diff vs the Phase 33 `## After` matrix (`traefik-edge-scan.2026-10-08.md`): **none** — every column identical line for
line. `/dashboard/` answers 404 on 13 hosts, 400 on registry, 401 on db/influx (backend auth) and 302 on micro.

### Script stdout (before)

```
## Port sweep 188.166.23.244
80/tcp   open   http
443/tcp  open   https
8080/tcp closed http-proxy
8443/tcp closed https-alt
port 7442 rtm.thinx.cloud open
nosni-subject CN=TRAEFIK DEFAULT CERT
## rtm.thinx.cloud
https rtm.thinx.cloud 200
hsts rtm.thinx.cloud 1
tls12 rtm.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 rtm.thinx.cloud yes
legacy rtm.thinx.cloud none
dashboard rtm.thinx.cloud 404 sig=0
redirect rtm.thinx.cloud 301 https://rtm.thinx.cloud/
serial rtm.thinx.cloud 0535CC0C71E39D9378E72893F3A2141267B0
## app.thinx.cloud
https app.thinx.cloud 200
hsts app.thinx.cloud 1
tls12 app.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 app.thinx.cloud yes
legacy app.thinx.cloud none
dashboard app.thinx.cloud 404 sig=0
redirect app.thinx.cloud 200 
serial app.thinx.cloud 051152D5A20BE36DEFA1B6FA83379CE42809
## console.thinx.cloud
https console.thinx.cloud 200
hsts console.thinx.cloud 1
tls12 console.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 console.thinx.cloud yes
legacy console.thinx.cloud none
dashboard console.thinx.cloud 404 sig=0
redirect console.thinx.cloud 301 https://console.thinx.cloud/
serial console.thinx.cloud 05F8CEE45A7D64783AA80214569810CBF905
## thinx.cloud
https thinx.cloud 200
hsts thinx.cloud 1
tls12 thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 thinx.cloud yes
legacy thinx.cloud none
dashboard thinx.cloud 404 sig=0
redirect thinx.cloud 301 https://thinx.cloud/
serial thinx.cloud 05985238756DDB1D8FE88F15C2780670FB6D
## www.thinx.cloud
https www.thinx.cloud 200
hsts www.thinx.cloud 1
tls12 www.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.thinx.cloud yes
legacy www.thinx.cloud none
dashboard www.thinx.cloud 404 sig=0
redirect www.thinx.cloud 301 https://www.thinx.cloud/
serial www.thinx.cloud 05985238756DDB1D8FE88F15C2780670FB6D
## swarmpit.thinx.cloud
https swarmpit.thinx.cloud 200
hsts swarmpit.thinx.cloud 1
tls12 swarmpit.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 swarmpit.thinx.cloud yes
legacy swarmpit.thinx.cloud none
dashboard swarmpit.thinx.cloud 404 sig=0
redirect swarmpit.thinx.cloud 301 https://swarmpit.thinx.cloud/
serial swarmpit.thinx.cloud 05F241E17BADFEFAB79078069E218FB5D282
## registry.thinx.cloud
https registry.thinx.cloud 400
hsts registry.thinx.cloud 1
tls12 registry.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 registry.thinx.cloud yes
legacy registry.thinx.cloud none
dashboard registry.thinx.cloud 400 sig=0
redirect registry.thinx.cloud 400 
serial registry.thinx.cloud 05BDB7A8495E98A507BD392073F1D2306425
## db.thinx.cloud
https db.thinx.cloud 401
hsts db.thinx.cloud 1
tls12 db.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 db.thinx.cloud yes
legacy db.thinx.cloud none
dashboard db.thinx.cloud 401 sig=0
redirect db.thinx.cloud 401 
serial db.thinx.cloud 05ABDB813970665925BBF3986D858437F8C2
## influx.thinx.cloud
https influx.thinx.cloud 401
hsts influx.thinx.cloud 1
tls12 influx.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 influx.thinx.cloud yes
legacy influx.thinx.cloud none
dashboard influx.thinx.cloud 401 sig=0
redirect influx.thinx.cloud 301 https://influx.thinx.cloud/
serial influx.thinx.cloud 05806B4C8B028F41EC3ACCC00DF3C6A50B04
## www.fotostim.com
https www.fotostim.com 200
hsts www.fotostim.com 1
tls12 www.fotostim.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.com yes
legacy www.fotostim.com none
dashboard www.fotostim.com 404 sig=0
redirect www.fotostim.com 301 https://www.fotostim.com/
serial www.fotostim.com 05CA722C72F15D90F21C62D2042992CAB37A
## www.fotostim.cz
https www.fotostim.cz 200
hsts www.fotostim.cz 1
tls12 www.fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.cz yes
legacy www.fotostim.cz none
dashboard www.fotostim.cz 404 sig=0
redirect www.fotostim.cz 301 https://www.fotostim.cz/
serial www.fotostim.cz 059B763F7AAA69FEBA932265DAB2215F3A92
## fotostim.com
https fotostim.com 200
hsts fotostim.com 1
tls12 fotostim.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.com yes
legacy fotostim.com none
dashboard fotostim.com 404 sig=0
redirect fotostim.com 301 https://fotostim.com/
serial fotostim.com 068859B1E2768CC50E6AA79CBBC559958C13
## fotostim.cz
https fotostim.cz 200
hsts fotostim.cz 1
tls12 fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.cz yes
legacy fotostim.cz none
dashboard fotostim.cz 404 sig=0
redirect fotostim.cz 301 https://fotostim.cz/
serial fotostim.cz 058A2108047618D8AE8BAEE94DFD9656C275
## igraczech.com
https igraczech.com 200
hsts igraczech.com 1
tls12 igraczech.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 igraczech.com yes
legacy igraczech.com none
dashboard igraczech.com 404 sig=0
redirect igraczech.com 301 https://igraczech.com/
serial igraczech.com 069BB404CE5F1F729812C79096FEB2F867A7
## www.igraczech.com
https www.igraczech.com 200
hsts www.igraczech.com 1
tls12 www.igraczech.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.igraczech.com yes
legacy www.igraczech.com none
dashboard www.igraczech.com 404 sig=0
redirect www.igraczech.com 301 https://www.igraczech.com/
serial www.igraczech.com 069BB404CE5F1F729812C79096FEB2F867A7
## www.syxra.cz
https www.syxra.cz 200
hsts www.syxra.cz 1
tls12 www.syxra.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.syxra.cz yes
legacy www.syxra.cz none
dashboard www.syxra.cz 404 sig=0
redirect www.syxra.cz 301 https://www.syxra.cz/
serial www.syxra.cz 0584ABE5714F7F196979A72B1C74C87CB60F
## micro.thinx.cloud
https micro.thinx.cloud 200
hsts micro.thinx.cloud 1
tls12 micro.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 micro.thinx.cloud yes
legacy micro.thinx.cloud none
dashboard micro.thinx.cloud 302 sig=0
redirect micro.thinx.cloud 301 https://micro.thinx.cloud/
serial micro.thinx.cloud 055AA7B98C8710DE6D85012BE3C983F11294
EDGE-SCAN OK
```

## Reported, not gating (before)

- **D-20 / D-17 redirect gaps** (`http://<host>/`): `app.thinx.cloud` 200 (the `thinx-api-http` plaintext API path —
  stays plaintext on purpose for legacy `__DISABLE_HTTPS__` devices), `registry.thinx.cloud` 400 (no middleware on the
  registry http router), `db.thinx.cloud` 401 (couch-auth on the http router, WR-04). Plan 34-03 changes the latter
  two to redirect-only.
- **D-16 no-SNI:** `CN=TRAEFIK DEFAULT CERT` — `sniStrict` stays `false` in Phase 34 (D-15).
- **Curve policy:** `tls-config-2` still carries `curvePreferences = ["X25519", "CurveP256"]` (X25519MLKEM768 not
  offered) — Plan 34-03 (`tls-config-3`) removes the key to restore the Go default incl. the PQ hybrid.
- **keep-7442:** `port 7442 rtm.thinx.cloud open` — the plaintext device port is outside Traefik and stays (AGENTS.md).
- **Not observable from outside (recorded in `traefik-edge.F.pre.yml`):** the log level (error-only), the
  common-format access log that today records the full request line incl. the query string, and the raw read-only
  Docker socket bind — the EDGE-OPS-01/02 subjects of Plans 34-01/34-02.

## After (post-P34, 2026-10-09T16:37:23Z–17:05:24Z)

Plan 34-05 Task 2, against the Phase 34 end state: `traefik:v3.7.14 args=24` (WARN, JSON access log without
RequestPath / RequestLine / ClientUsername, `--providers.swarm.endpoint=tcp://socket-proxy:2375`, no Docker socket
mount), task `vtdqxehcuul8`, `Version.Index 38380188`, Configs `tls-config-3` (sha `45d010483d0e1d50…` == committed),
https default `security-headers@file`, acme store 16 entries. Same script, **16 hosts** (`micro.thinx.cloud` left
`HOSTS` in Plan 34-04 because its certificate was pruned on purpose: D-19 / A6).

**Verdict: every one of the 16 hosts passes every predicate (composite of run 1 and run 6 below). No single full run
printed the OK verdict line, because the laptop's own uplink dropped out near the end of each run.** Across six runs
there are **0** predicate failures on any host that answered. Every `FAIL ` line is a no-connection line (`curl rc=7`,
`tls12-set … got: none`, `no sslscan protocol table`, or `no-tls13` from the same lost connection). Evidence that the
loss is on the laptop side and not on micro or the edge:

- A parallel 1-s probe from the laptop during runs 4–6 lost **1.1.1.1:443 (Cloudflare) in the same seconds** as
  `188.166.23.244:443` and `:7442` (run 4: 14 s of all-three-down at 16:58:15–16:58:32Z; run 6: 7 s from 17:05:19Z).
  `:7442` is published by `thinx_api` directly, not by Traefik.
- Steady state is clean: 40/40 HTTPS requests at 1-s intervals (16:44Z), 128/128 probes during an 8-host
  nmap + sslscan burst (16:49–16:51Z), and 142/152 during run 6 with the misses only in the uplink window.
- On micro: `traefik_traefik` task `vtdqxehcuul8` and Version.Index 38380188 unchanged throughout; 0 non-JSON Traefik
  lines in the run-1 window; `docker events` shows nothing in the 16:39–16:40Z or 16:48–16:49Z gaps (the only events in
  the period are three Swarmpit autoredeploys of `errorpage_errorpage` at 16:31/16:41/16:43Z, which are the operator's
  thinx-swarm error-page CI work); no UFW BLOCK line for the laptop address except the scan's own `:8443` probe;
  `TcpExtSyncookiesSent` / `ListenOverflows` / `TCPReqQFullDrop` 0; conntrack 667 / 65536.

| Run | Order | UTC | `FAIL ` lines | Hosts with a FAIL (all no-connection) |
|---|---|---|---|---|
| 1 | forward (script as committed) | 16:37:23–16:40:32 | 24 | fotostim.cz, igraczech.com, www.igraczech.com, www.syxra.cz |
| 2 | forward | 16:41:29–16:43:41 | 44 | registry, db, influx, the four fotostim names, igraczech ×2 |
| 3 | forward (+ probe) | 16:46:19–16:48:29 | 50 | influx, the four fotostim names, igraczech ×2, syxra |
| 4 | forward (+ probe incl. 1.1.1.1) | 16:55:54–16:58:20 | 39 | the four fotostim names, igraczech ×2, syxra |
| 5 | reversed `HOSTS` (scratch copy, predicates unchanged) | 16:59:06–16:59:23 | 110 | all 16 — the uplink was already down at start (1.1.1.1 also down); discarded |
| 6 | reversed `HOSTS` (after 45 s of stable uplink) | 17:03:02–17:05:24 | 41 | rtm, app, console, thinx.cloud, www, swarmpit (the tail of the reversed order) |

Runs 5 and 6 used a copy of `scripts/traefik-edge-scan.sh` in the session scratch directory whose only difference is
the reversed `HOSTS` line (`diff` = that one line), so the hosts that the uplink loss hit at the end of the forward
order were scanned first. The committed script was not changed.

**Plan 34-05 Task 2 verify #2 (a fresh full run exits 0 with the OK verdict line) is NOT met from this laptop today.**
Re-run `scripts/traefik-edge-scan.sh` from a stable uplink and append the result here; nothing on the edge is expected
to change.

### Per-host matrix (after; composite — "run" names the run in which the host had 0 `FAIL ` lines)

| host | run | https code | HSTS | TLS1.0/1.1 | TLS1.2 suites | TLS1.3 | cert serial | `http://` redirect | `/dashboard/` |
|---|---|---|---|---|---|---|---|---|---|
| rtm.thinx.cloud | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 0535CC0C71E39D9378E72893F3A2141267B0 | 301 https://rtm.thinx.cloud/ | 404 sig=0 |
| app.thinx.cloud | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 051152D5A20BE36DEFA1B6FA83379CE42809 | 200 | 404 sig=0 |
| console.thinx.cloud | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 05F8CEE45A7D64783AA80214569810CBF905 | 301 https://console.thinx.cloud/ | 404 sig=0 |
| thinx.cloud | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 05985238756DDB1D8FE88F15C2780670FB6D | 301 https://thinx.cloud/ | 404 sig=0 |
| www.thinx.cloud | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 05985238756DDB1D8FE88F15C2780670FB6D | 301 https://www.thinx.cloud/ | 404 sig=0 |
| swarmpit.thinx.cloud | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 05F241E17BADFEFAB79078069E218FB5D282 | 301 https://swarmpit.thinx.cloud/ | 404 sig=0 |
| registry.thinx.cloud | 1 | 400 | yes (1) | refused | 3 AEAD only | offered | 05BDB7A8495E98A507BD392073F1D2306425 | 301 https://registry.thinx.cloud/ | 400 sig=0 |
| db.thinx.cloud | 1 | 401 | yes (1) | refused | 3 AEAD only | offered | 05ABDB813970665925BBF3986D858437F8C2 | 301 https://db.thinx.cloud/ | 401 sig=0 |
| influx.thinx.cloud | 1 | 401 | yes (1) | refused | 3 AEAD only | offered | 05806B4C8B028F41EC3ACCC00DF3C6A50B04 | 301 https://influx.thinx.cloud/ | 401 sig=0 |
| www.fotostim.com | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 05CA722C72F15D90F21C62D2042992CAB37A | 301 https://www.fotostim.com/ | 404 sig=0 |
| www.fotostim.cz | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 059B763F7AAA69FEBA932265DAB2215F3A92 | 301 https://www.fotostim.cz/ | 404 sig=0 |
| fotostim.com | 1 | 200 | yes (1) | refused | 3 AEAD only | offered | 068859B1E2768CC50E6AA79CBBC559958C13 | 301 https://fotostim.com/ | 404 sig=0 |
| fotostim.cz | 6 | 200 | yes (1) | refused | 3 AEAD only | offered | 058A2108047618D8AE8BAEE94DFD9656C275 | 301 https://fotostim.cz/ | 404 sig=0 |
| igraczech.com | 6 | 200 | yes (1) | refused | 3 AEAD only | offered | 069BB404CE5F1F729812C79096FEB2F867A7 | 301 https://igraczech.com/ | 404 sig=0 |
| www.igraczech.com | 6 | 200 | yes (1) | refused | 3 AEAD only | offered | 069BB404CE5F1F729812C79096FEB2F867A7 | 301 https://www.igraczech.com/ | 404 sig=0 |
| www.syxra.cz | 6 | 200 | yes (1) | refused | 3 AEAD only | offered | 0584ABE5714F7F196979A72B1C74C87CB60F | 301 https://www.syxra.cz/ | 404 sig=0 |

Diff vs `## Before` (pre-P34-A): HSTS exactly once, TLS 1.2 set, TLS 1.3, legacy refusal and every serial identical
on the 16 hosts (no collateral re-challenge from the Stage E prune). Intended changes only: `http://db.thinx.cloud/`
401 → **301** and `http://registry.thinx.cloud/` 400 → **301** (Stage D, WR-04 / D-17); `micro.thinx.cloud` no
longer scanned (default certificate since Stage E, D-19). `/dashboard/` answers 404 on 13 hosts, 400 on registry and
401 on db/influx (backend auth); `sig=0` (no `APIUrl`) everywhere.

### Script stdout (after, run 1 — forward, committed script)

```
## Port sweep 188.166.23.244
80/tcp   open     http
443/tcp  open     https
8080/tcp filtered http-proxy
8443/tcp filtered https-alt
port 7442 rtm.thinx.cloud open
nosni-subject CN=TRAEFIK DEFAULT CERT
## rtm.thinx.cloud
https rtm.thinx.cloud 200
hsts rtm.thinx.cloud 1
tls12 rtm.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 rtm.thinx.cloud yes
legacy rtm.thinx.cloud none
dashboard rtm.thinx.cloud 404 sig=0
redirect rtm.thinx.cloud 301 https://rtm.thinx.cloud/
serial rtm.thinx.cloud 0535CC0C71E39D9378E72893F3A2141267B0
## app.thinx.cloud
https app.thinx.cloud 200
hsts app.thinx.cloud 1
tls12 app.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 app.thinx.cloud yes
legacy app.thinx.cloud none
dashboard app.thinx.cloud 404 sig=0
redirect app.thinx.cloud 200 
serial app.thinx.cloud 051152D5A20BE36DEFA1B6FA83379CE42809
## console.thinx.cloud
https console.thinx.cloud 200
hsts console.thinx.cloud 1
tls12 console.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 console.thinx.cloud yes
legacy console.thinx.cloud none
dashboard console.thinx.cloud 404 sig=0
redirect console.thinx.cloud 301 https://console.thinx.cloud/
serial console.thinx.cloud 05F8CEE45A7D64783AA80214569810CBF905
## thinx.cloud
https thinx.cloud 200
hsts thinx.cloud 1
tls12 thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 thinx.cloud yes
legacy thinx.cloud none
dashboard thinx.cloud 404 sig=0
redirect thinx.cloud 301 https://thinx.cloud/
serial thinx.cloud 05985238756DDB1D8FE88F15C2780670FB6D
## www.thinx.cloud
https www.thinx.cloud 200
hsts www.thinx.cloud 1
tls12 www.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.thinx.cloud yes
legacy www.thinx.cloud none
dashboard www.thinx.cloud 404 sig=0
redirect www.thinx.cloud 301 https://www.thinx.cloud/
serial www.thinx.cloud 05985238756DDB1D8FE88F15C2780670FB6D
## swarmpit.thinx.cloud
https swarmpit.thinx.cloud 200
hsts swarmpit.thinx.cloud 1
tls12 swarmpit.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 swarmpit.thinx.cloud yes
legacy swarmpit.thinx.cloud none
dashboard swarmpit.thinx.cloud 404 sig=0
redirect swarmpit.thinx.cloud 301 https://swarmpit.thinx.cloud/
serial swarmpit.thinx.cloud 05F241E17BADFEFAB79078069E218FB5D282
## registry.thinx.cloud
https registry.thinx.cloud 400
hsts registry.thinx.cloud 1
tls12 registry.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 registry.thinx.cloud yes
legacy registry.thinx.cloud none
dashboard registry.thinx.cloud 400 sig=0
redirect registry.thinx.cloud 301 https://registry.thinx.cloud/
serial registry.thinx.cloud 05BDB7A8495E98A507BD392073F1D2306425
## db.thinx.cloud
https db.thinx.cloud 401
hsts db.thinx.cloud 1
tls12 db.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 db.thinx.cloud yes
legacy db.thinx.cloud none
dashboard db.thinx.cloud 401 sig=0
redirect db.thinx.cloud 301 https://db.thinx.cloud/
serial db.thinx.cloud 05ABDB813970665925BBF3986D858437F8C2
## influx.thinx.cloud
https influx.thinx.cloud 401
hsts influx.thinx.cloud 1
tls12 influx.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 influx.thinx.cloud yes
legacy influx.thinx.cloud none
dashboard influx.thinx.cloud 401 sig=0
redirect influx.thinx.cloud 301 https://influx.thinx.cloud/
serial influx.thinx.cloud 05806B4C8B028F41EC3ACCC00DF3C6A50B04
## www.fotostim.com
https www.fotostim.com 200
hsts www.fotostim.com 1
tls12 www.fotostim.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.com yes
legacy www.fotostim.com none
dashboard www.fotostim.com 404 sig=0
redirect www.fotostim.com 301 https://www.fotostim.com/
serial www.fotostim.com 05CA722C72F15D90F21C62D2042992CAB37A
## www.fotostim.cz
https www.fotostim.cz 200
hsts www.fotostim.cz 1
tls12 www.fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.cz yes
legacy www.fotostim.cz none
dashboard www.fotostim.cz 404 sig=0
redirect www.fotostim.cz 301 https://www.fotostim.cz/
serial www.fotostim.cz 059B763F7AAA69FEBA932265DAB2215F3A92
## fotostim.com
https fotostim.com 200
hsts fotostim.com 1
tls12 fotostim.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.com yes
legacy fotostim.com none
dashboard fotostim.com 404 sig=0
redirect fotostim.com 301 https://fotostim.com/
serial fotostim.com 068859B1E2768CC50E6AA79CBBC559958C13
## fotostim.cz
FAIL hsts fotostim.cz unchecked: curl rc=7
FAIL api-exposed fotostim.cz unchecked: curl rc=7
FAIL dashboard-401 fotostim.cz unchecked: curl rc=7
https fotostim.cz 000
hsts fotostim.cz 0
tls12 fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.cz yes
legacy fotostim.cz none
dashboard fotostim.cz 000 sig=0
redirect fotostim.cz 000 
serial fotostim.cz none
## igraczech.com
FAIL no-tls13 igraczech.com
FAIL tls12-set igraczech.com got: none
FAIL sslscan-legacy igraczech.com unchecked: no sslscan protocol table
FAIL hsts igraczech.com unchecked: curl rc=7
FAIL api-exposed igraczech.com unchecked: curl rc=7
FAIL dashboard-open igraczech.com unchecked: curl rc=7
FAIL dashboard-401 igraczech.com unchecked: curl rc=7
https igraczech.com 000
hsts igraczech.com 0
tls12 igraczech.com none
tls13 igraczech.com no
legacy igraczech.com none
dashboard igraczech.com 000 sig=0
redirect igraczech.com 000 
serial igraczech.com none
## www.igraczech.com
FAIL no-tls13 www.igraczech.com
FAIL tls12-set www.igraczech.com got: none
FAIL sslscan-legacy www.igraczech.com unchecked: no sslscan protocol table
FAIL hsts www.igraczech.com unchecked: curl rc=7
FAIL api-exposed www.igraczech.com unchecked: curl rc=7
FAIL dashboard-open www.igraczech.com unchecked: curl rc=7
FAIL dashboard-401 www.igraczech.com unchecked: curl rc=7
https www.igraczech.com 000
hsts www.igraczech.com 0
tls12 www.igraczech.com none
tls13 www.igraczech.com no
legacy www.igraczech.com none
dashboard www.igraczech.com 000 sig=0
redirect www.igraczech.com 000 
serial www.igraczech.com none
## www.syxra.cz
FAIL no-tls13 www.syxra.cz
FAIL tls12-set www.syxra.cz got: none
FAIL sslscan-legacy www.syxra.cz unchecked: no sslscan protocol table
FAIL hsts www.syxra.cz unchecked: curl rc=7
FAIL api-exposed www.syxra.cz unchecked: curl rc=7
FAIL dashboard-open www.syxra.cz unchecked: curl rc=7
FAIL dashboard-401 www.syxra.cz unchecked: curl rc=7
https www.syxra.cz 000
hsts www.syxra.cz 0
tls12 www.syxra.cz none
tls13 www.syxra.cz no
legacy www.syxra.cz none
dashboard www.syxra.cz 000 sig=0
redirect www.syxra.cz 000 
serial www.syxra.cz none
EDGE-SCAN FAIL 24
```

### Script stdout (after, run 6 — reversed HOSTS copy)

```
## Port sweep 188.166.23.244
80/tcp   open     http
443/tcp  open     https
8080/tcp filtered http-proxy
8443/tcp filtered https-alt
port 7442 rtm.thinx.cloud open
nosni-subject CN=TRAEFIK DEFAULT CERT
## www.syxra.cz
https www.syxra.cz 200
hsts www.syxra.cz 1
tls12 www.syxra.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.syxra.cz yes
legacy www.syxra.cz none
dashboard www.syxra.cz 404 sig=0
redirect www.syxra.cz 301 https://www.syxra.cz/
serial www.syxra.cz 0584ABE5714F7F196979A72B1C74C87CB60F
## www.igraczech.com
https www.igraczech.com 200
hsts www.igraczech.com 1
tls12 www.igraczech.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.igraczech.com yes
legacy www.igraczech.com none
dashboard www.igraczech.com 404 sig=0
redirect www.igraczech.com 301 https://www.igraczech.com/
serial www.igraczech.com 069BB404CE5F1F729812C79096FEB2F867A7
## igraczech.com
https igraczech.com 200
hsts igraczech.com 1
tls12 igraczech.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 igraczech.com yes
legacy igraczech.com none
dashboard igraczech.com 404 sig=0
redirect igraczech.com 301 https://igraczech.com/
serial igraczech.com 069BB404CE5F1F729812C79096FEB2F867A7
## fotostim.cz
https fotostim.cz 200
hsts fotostim.cz 1
tls12 fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.cz yes
legacy fotostim.cz none
dashboard fotostim.cz 404 sig=0
redirect fotostim.cz 301 https://fotostim.cz/
serial fotostim.cz 058A2108047618D8AE8BAEE94DFD9656C275
## fotostim.com
https fotostim.com 200
hsts fotostim.com 1
tls12 fotostim.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.com yes
legacy fotostim.com none
dashboard fotostim.com 404 sig=0
redirect fotostim.com 301 https://fotostim.com/
serial fotostim.com 068859B1E2768CC50E6AA79CBBC559958C13
## www.fotostim.cz
https www.fotostim.cz 200
hsts www.fotostim.cz 1
tls12 www.fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.cz yes
legacy www.fotostim.cz none
dashboard www.fotostim.cz 404 sig=0
redirect www.fotostim.cz 301 https://www.fotostim.cz/
serial www.fotostim.cz 059B763F7AAA69FEBA932265DAB2215F3A92
## www.fotostim.com
https www.fotostim.com 200
hsts www.fotostim.com 1
tls12 www.fotostim.com TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.com yes
legacy www.fotostim.com none
dashboard www.fotostim.com 404 sig=0
redirect www.fotostim.com 301 https://www.fotostim.com/
serial www.fotostim.com 05CA722C72F15D90F21C62D2042992CAB37A
## influx.thinx.cloud
https influx.thinx.cloud 401
hsts influx.thinx.cloud 1
tls12 influx.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 influx.thinx.cloud yes
legacy influx.thinx.cloud none
dashboard influx.thinx.cloud 401 sig=0
redirect influx.thinx.cloud 301 https://influx.thinx.cloud/
serial influx.thinx.cloud 05806B4C8B028F41EC3ACCC00DF3C6A50B04
## db.thinx.cloud
https db.thinx.cloud 401
hsts db.thinx.cloud 1
tls12 db.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 db.thinx.cloud yes
legacy db.thinx.cloud none
dashboard db.thinx.cloud 401 sig=0
redirect db.thinx.cloud 301 https://db.thinx.cloud/
serial db.thinx.cloud 05ABDB813970665925BBF3986D858437F8C2
## registry.thinx.cloud
https registry.thinx.cloud 400
hsts registry.thinx.cloud 1
tls12 registry.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 registry.thinx.cloud yes
legacy registry.thinx.cloud none
dashboard registry.thinx.cloud 400 sig=0
redirect registry.thinx.cloud 301 https://registry.thinx.cloud/
serial registry.thinx.cloud 05BDB7A8495E98A507BD392073F1D2306425
## swarmpit.thinx.cloud
FAIL tls12-set swarmpit.thinx.cloud got: none
FAIL sslscan-legacy swarmpit.thinx.cloud unchecked: no sslscan protocol table
FAIL hsts swarmpit.thinx.cloud unchecked: curl rc=7
FAIL api-exposed swarmpit.thinx.cloud unchecked: curl rc=7
FAIL dashboard-open swarmpit.thinx.cloud unchecked: curl rc=7
FAIL dashboard-401 swarmpit.thinx.cloud unchecked: curl rc=7
https swarmpit.thinx.cloud 000
hsts swarmpit.thinx.cloud 0
tls12 swarmpit.thinx.cloud none
tls13 swarmpit.thinx.cloud yes
legacy swarmpit.thinx.cloud none
dashboard swarmpit.thinx.cloud 000 sig=0
redirect swarmpit.thinx.cloud 000 
serial swarmpit.thinx.cloud 05F241E17BADFEFAB79078069E218FB5D282
## www.thinx.cloud
FAIL no-tls13 www.thinx.cloud
FAIL tls12-set www.thinx.cloud got: none
FAIL sslscan-legacy www.thinx.cloud unchecked: no sslscan protocol table
FAIL hsts www.thinx.cloud unchecked: curl rc=7
FAIL api-exposed www.thinx.cloud unchecked: curl rc=7
FAIL dashboard-open www.thinx.cloud unchecked: curl rc=7
FAIL dashboard-401 www.thinx.cloud unchecked: curl rc=7
https www.thinx.cloud 000
hsts www.thinx.cloud 0
tls12 www.thinx.cloud none
tls13 www.thinx.cloud no
legacy www.thinx.cloud none
dashboard www.thinx.cloud 000 sig=0
redirect www.thinx.cloud 301 https://www.thinx.cloud/
serial www.thinx.cloud 05985238756DDB1D8FE88F15C2780670FB6D
## thinx.cloud
FAIL no-tls13 thinx.cloud
FAIL tls12-set thinx.cloud got: none
FAIL sslscan-legacy thinx.cloud unchecked: no sslscan protocol table
FAIL hsts thinx.cloud unchecked: curl rc=7
FAIL api-exposed thinx.cloud unchecked: curl rc=7
FAIL dashboard-open thinx.cloud unchecked: curl rc=7
FAIL dashboard-401 thinx.cloud unchecked: curl rc=7
https thinx.cloud 000
hsts thinx.cloud 0
tls12 thinx.cloud none
tls13 thinx.cloud no
legacy thinx.cloud none
dashboard thinx.cloud 000 sig=0
redirect thinx.cloud 000 
serial thinx.cloud none
## console.thinx.cloud
FAIL no-tls13 console.thinx.cloud
FAIL tls12-set console.thinx.cloud got: none
FAIL sslscan-legacy console.thinx.cloud unchecked: no sslscan protocol table
FAIL hsts console.thinx.cloud unchecked: curl rc=7
FAIL api-exposed console.thinx.cloud unchecked: curl rc=7
FAIL dashboard-open console.thinx.cloud unchecked: curl rc=7
FAIL dashboard-401 console.thinx.cloud unchecked: curl rc=7
https console.thinx.cloud 000
hsts console.thinx.cloud 0
tls12 console.thinx.cloud none
tls13 console.thinx.cloud no
legacy console.thinx.cloud none
dashboard console.thinx.cloud 000 sig=0
redirect console.thinx.cloud 000 
serial console.thinx.cloud none
## app.thinx.cloud
FAIL no-tls13 app.thinx.cloud
FAIL tls12-set app.thinx.cloud got: none
FAIL sslscan-legacy app.thinx.cloud unchecked: no sslscan protocol table
FAIL hsts app.thinx.cloud unchecked: curl rc=7
FAIL api-exposed app.thinx.cloud unchecked: curl rc=7
FAIL dashboard-open app.thinx.cloud unchecked: curl rc=7
FAIL dashboard-401 app.thinx.cloud unchecked: curl rc=7
https app.thinx.cloud 000
hsts app.thinx.cloud 0
tls12 app.thinx.cloud none
tls13 app.thinx.cloud no
legacy app.thinx.cloud none
dashboard app.thinx.cloud 000 sig=0
redirect app.thinx.cloud 000 
serial app.thinx.cloud none
## rtm.thinx.cloud
FAIL no-tls13 rtm.thinx.cloud
FAIL tls12-set rtm.thinx.cloud got: none
FAIL sslscan-legacy rtm.thinx.cloud unchecked: no sslscan protocol table
FAIL hsts rtm.thinx.cloud unchecked: curl rc=7
FAIL api-exposed rtm.thinx.cloud unchecked: curl rc=7
FAIL dashboard-open rtm.thinx.cloud unchecked: curl rc=7
FAIL dashboard-401 rtm.thinx.cloud unchecked: curl rc=7
https rtm.thinx.cloud 000
hsts rtm.thinx.cloud 0
tls12 rtm.thinx.cloud none
tls13 rtm.thinx.cloud no
legacy rtm.thinx.cloud none
dashboard rtm.thinx.cloud 000 sig=0
redirect rtm.thinx.cloud 000 
serial rtm.thinx.cloud none
EDGE-SCAN FAIL 41
```

## Reported, not gating (after)

- **PQ hybrid back:** `-tls1_3 -groups X25519MLKEM768` negotiates `X25519MLKEM768` on rtm/app/console (OpenSSL
  3.6.3, 16:54Z); P-384 is accepted again (`Peer Temp Key: ECDH, secp384r1`), the Go default from `tls-config-3`.
- **CBC still refused** (`ECDHE-RSA-AES128-SHA` → handshake failure ×3), TLS 1.1 refused ×3, TLS 1.2 verify 0 ×3.
- **micro.thinx.cloud** serves `CN=TRAEFIK DEFAULT CERT` by design since Stage E (no router, certificate pruned,
  D-19); it is out of `HOSTS`. No-SNI clients also get the default certificate (`sniStrict` stays `false`, D-16).
- **`:80` rows:** `http://db.thinx.cloud/` and `http://registry.thinx.cloud/` → `301` with 0 `WWW-Authenticate`;
  `http://app.thinx.cloud/` → `200`, plaintext on purpose for legacy `__DISABLE_HTTPS__` devices (D-17).
- **keep-7442:** `port 7442 rtm.thinx.cloud open` in run 1 and run 6; micro `/dev/tcp` `7442 OPEN 1883 OPEN 8883 OPEN`.
- **8080 / 8443:** `filtered` from the laptop in this window (Before: `closed`). Both mean "not open". micro logs a
  UFW BLOCK for the laptop's `:8443` SYN, and the UFW rule files are unchanged since 2026-03-05. The path behaved
  differently today (the laptop uplink was also unstable), not the host.
