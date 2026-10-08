# Traefik edge external scan — 2026-10-08

Phase 33 (EDGE-API-01/02, EDGE-TLS-01/02/03; D-26..D-29). Laptop-only run of `scripts/traefik-edge-scan.sh`
(`nmap 7.94` with `ssl-enum-ciphers` + a port sweep incl. 8080/8443, `sslscan 2.2.2`, `curl 8.7.1 -I`,
`OpenSSL 3.6.3`); no third-party scanner; **header names, port states, cipher-suite names, HTTP codes and
certificate serials only** — no response bodies, no certificate bodies, no credentials. Run from outside the
swarm on purpose: `micro` sees every client as `10.0.0.2` and sits inside the edge.

- **Target:** `188.166.23.244` (every D-27 hostname resolves only to it) and the 17 routed hostnames:
  rtm, app, console, thinx.cloud, www.thinx.cloud, swarmpit, registry, db, influx (`*.thinx.cloud`),
  www.fotostim.com, www.fotostim.cz, fotostim.com, fotostim.cz, igraczech.com, www.igraczech.com,
  www.syxra.cz, micro.thinx.cloud.
- **Pass bar (D-28, requirements-literal):** TLS < 1.2 refused and 1.3 offered on every host; the observable
  D-14 set and nothing else on TLS 1.2 (`TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`,
  `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`, `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256` — RSA-4096
  certificates make the ECDSA entries unobservable, RESEARCH Pitfall 6); exactly one
  `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` on every HTTPS host; 8080 and
  8443 not open from outside; no public Traefik API (`/api/overview` never JSON) and no public dashboard
  (`/dashboard/` never carries the `APIUrl` signature, never answers a basic-auth 401 — db/influx exempt from
  the 401 predicate only, their whole router sits behind couch-auth / influx-auth); `:7442` open (keep-7442).
- **Reported, not gating:** `:80` redirect posture per host (D-20), the no-SNI certificate subject (D-16).
- **Sections:** `## Before (pre-Stage-A1)` is taken BEFORE any Phase 33 change (this file, Plan 33-01 Task 1);
  `## After (post-Stage-E)` is appended by Plan 33-03 against the same script so the two matrices diff cleanly.

## Before (pre-Stage-A1, 2026-10-08T22:44:51Z)

Run 22:44:51Z → 22:46:51Z (2 min). **Verdict: `EDGE-SCAN FAIL 32`** — the un-hardened Phase 32 end state,
exactly the expected failure set:

- `FAIL tls12-set` on all 17 hosts: Go's default TLS 1.2 list adds the two CBC-SHA1 suites
  (`TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA`, `TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA`) next to the three AEAD suites —
  the mounted `tls.toml` has never been loaded (32-REVIEW IN-01; Plan 02 Stage C).
- `FAIL hsts` on 14 hosts — every host except rtm/app/console (only `thinx-console-https` and
  `thinx-api-https` carry `security-headers@swarm`; Plan 02 Stage D makes it the `:443` entrypoint default).
- `FAIL dashboard-401 micro.thinx.cloud` — the public `admin-auth` dashboard router still answers 401
  (Stage A2 of this plan removes it). **No** `dashboard-401` line for db/influx (exempt by design, their 401
  is the backend's basic-auth), **0** `dashboard-open`, **0** `api-exposed` lines on any host.
- Port sweep: `80 open`, `443 open`, **`8080 closed`**, **`8443 closed`**; `7442` open. No `legacy-tls`,
  `no-tls13` or `sslscan-legacy` failure anywhere (TLS 1.0/1.1 already refused, 1.3 offered everywhere).
- No-SNI client receives `CN=TRAEFIK DEFAULT CERT` (D-16, recorded).

### Per-host matrix (before)

| host | https code | HSTS | TLS1.0/1.1 | TLS1.2 suites | TLS1.3 | cert serial | `http://` redirect (D-20, reported) |
|---|---|---|---|---|---|---|---|
| rtm.thinx.cloud | 200 | yes | refused | 3 AEAD + 2 CBC-SHA1 | offered | 0535CC0C71E39D9378E72893F3A2141267B0 | 301 https://rtm.thinx.cloud/ |
| app.thinx.cloud | 200 | yes | refused | 3 AEAD + 2 CBC-SHA1 | offered | 051152D5A20BE36DEFA1B6FA83379CE42809 | 200 (known gap: `thinx-api-http` has no redirect) |
| console.thinx.cloud | 200 | yes | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05F8CEE45A7D64783AA80214569810CBF905 | 301 https://console.thinx.cloud/ |
| thinx.cloud | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05985238756DDB1D8FE88F15C2780670FB6D | 301 https://thinx.cloud/ |
| www.thinx.cloud | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05985238756DDB1D8FE88F15C2780670FB6D | 301 https://www.thinx.cloud/ |
| swarmpit.thinx.cloud | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05F241E17BADFEFAB79078069E218FB5D282 | 301 https://swarmpit.thinx.cloud/ |
| registry.thinx.cloud | 400 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05BDB7A8495E98A507BD392073F1D2306425 | 400 (known gap: registry http router has no redirect) |
| db.thinx.cloud | 401 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05ABDB813970665925BBF3986D858437F8C2 | 401 (couch-auth on the http router too) |
| influx.thinx.cloud | 401 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05B91929242266AC45C0BD14E89A6C4F8247 | 301 https://influx.thinx.cloud/ |
| www.fotostim.com | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 05CA722C72F15D90F21C62D2042992CAB37A | 301 https://www.fotostim.com/ |
| www.fotostim.cz | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 059B763F7AAA69FEBA932265DAB2215F3A92 | 301 https://www.fotostim.cz/ |
| fotostim.com | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 068859B1E2768CC50E6AA79CBBC559958C13 | 301 https://fotostim.com/ |
| fotostim.cz | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 058A2108047618D8AE8BAEE94DFD9656C275 | 301 https://fotostim.cz/ |
| igraczech.com | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 069BB404CE5F1F729812C79096FEB2F867A7 | 301 https://igraczech.com/ |
| www.igraczech.com | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 069BB404CE5F1F729812C79096FEB2F867A7 | 301 https://www.igraczech.com/ |
| www.syxra.cz | 200 | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 0584ABE5714F7F196979A72B1C74C87CB60F | 301 https://www.syxra.cz/ |
| micro.thinx.cloud | 401 (public dashboard basic-auth) | no | refused | 3 AEAD + 2 CBC-SHA1 | offered | 055AA7B98C8710DE6D85012BE3C983F11294 | 301 https://micro.thinx.cloud/ |

TLS 1.2 set observed on every host (identical ×17): `TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA
TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256` (want: the three `GCM`/`CHACHA20` entries only). `/dashboard/`
answers 404 (catch-all) on 13 hosts, 400 on registry, 401 on db/influx (backend auth) and 401 on micro (the
Traefik dashboard router — the one Stage A2 removes); `APIUrl` signature count 0 everywhere.

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
FAIL tls12-set rtm.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
https rtm.thinx.cloud 200
hsts rtm.thinx.cloud 1
tls12 rtm.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 rtm.thinx.cloud yes
legacy rtm.thinx.cloud none
dashboard rtm.thinx.cloud 404 sig=0
redirect rtm.thinx.cloud 301 https://rtm.thinx.cloud/
serial rtm.thinx.cloud 0535CC0C71E39D9378E72893F3A2141267B0
## app.thinx.cloud
FAIL tls12-set app.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
https app.thinx.cloud 200
hsts app.thinx.cloud 1
tls12 app.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 app.thinx.cloud yes
legacy app.thinx.cloud none
dashboard app.thinx.cloud 404 sig=0
redirect app.thinx.cloud 200 
serial app.thinx.cloud 051152D5A20BE36DEFA1B6FA83379CE42809
## console.thinx.cloud
FAIL tls12-set console.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
https console.thinx.cloud 200
hsts console.thinx.cloud 1
tls12 console.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 console.thinx.cloud yes
legacy console.thinx.cloud none
dashboard console.thinx.cloud 404 sig=0
redirect console.thinx.cloud 301 https://console.thinx.cloud/
serial console.thinx.cloud 05F8CEE45A7D64783AA80214569810CBF905
## thinx.cloud
FAIL tls12-set thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts thinx.cloud
https thinx.cloud 200
hsts thinx.cloud 0
tls12 thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 thinx.cloud yes
legacy thinx.cloud none
dashboard thinx.cloud 404 sig=0
redirect thinx.cloud 301 https://thinx.cloud/
serial thinx.cloud 05985238756DDB1D8FE88F15C2780670FB6D
## www.thinx.cloud
FAIL tls12-set www.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts www.thinx.cloud
https www.thinx.cloud 200
hsts www.thinx.cloud 0
tls12 www.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.thinx.cloud yes
legacy www.thinx.cloud none
dashboard www.thinx.cloud 404 sig=0
redirect www.thinx.cloud 301 https://www.thinx.cloud/
serial www.thinx.cloud 05985238756DDB1D8FE88F15C2780670FB6D
## swarmpit.thinx.cloud
FAIL tls12-set swarmpit.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts swarmpit.thinx.cloud
https swarmpit.thinx.cloud 200
hsts swarmpit.thinx.cloud 0
tls12 swarmpit.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 swarmpit.thinx.cloud yes
legacy swarmpit.thinx.cloud none
dashboard swarmpit.thinx.cloud 404 sig=0
redirect swarmpit.thinx.cloud 301 https://swarmpit.thinx.cloud/
serial swarmpit.thinx.cloud 05F241E17BADFEFAB79078069E218FB5D282
## registry.thinx.cloud
FAIL tls12-set registry.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts registry.thinx.cloud
https registry.thinx.cloud 400
hsts registry.thinx.cloud 0
tls12 registry.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 registry.thinx.cloud yes
legacy registry.thinx.cloud none
dashboard registry.thinx.cloud 400 sig=0
redirect registry.thinx.cloud 400 
serial registry.thinx.cloud 05BDB7A8495E98A507BD392073F1D2306425
## db.thinx.cloud
FAIL tls12-set db.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts db.thinx.cloud
https db.thinx.cloud 401
hsts db.thinx.cloud 0
tls12 db.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 db.thinx.cloud yes
legacy db.thinx.cloud none
dashboard db.thinx.cloud 401 sig=0
redirect db.thinx.cloud 401 
serial db.thinx.cloud 05ABDB813970665925BBF3986D858437F8C2
## influx.thinx.cloud
FAIL tls12-set influx.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts influx.thinx.cloud
https influx.thinx.cloud 401
hsts influx.thinx.cloud 0
tls12 influx.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 influx.thinx.cloud yes
legacy influx.thinx.cloud none
dashboard influx.thinx.cloud 401 sig=0
redirect influx.thinx.cloud 301 https://influx.thinx.cloud/
serial influx.thinx.cloud 05B91929242266AC45C0BD14E89A6C4F8247
## www.fotostim.com
FAIL tls12-set www.fotostim.com got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts www.fotostim.com
https www.fotostim.com 200
hsts www.fotostim.com 0
tls12 www.fotostim.com TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.com yes
legacy www.fotostim.com none
dashboard www.fotostim.com 404 sig=0
redirect www.fotostim.com 301 https://www.fotostim.com/
serial www.fotostim.com 05CA722C72F15D90F21C62D2042992CAB37A
## www.fotostim.cz
FAIL tls12-set www.fotostim.cz got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts www.fotostim.cz
https www.fotostim.cz 200
hsts www.fotostim.cz 0
tls12 www.fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.fotostim.cz yes
legacy www.fotostim.cz none
dashboard www.fotostim.cz 404 sig=0
redirect www.fotostim.cz 301 https://www.fotostim.cz/
serial www.fotostim.cz 059B763F7AAA69FEBA932265DAB2215F3A92
## fotostim.com
FAIL tls12-set fotostim.com got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts fotostim.com
https fotostim.com 200
hsts fotostim.com 0
tls12 fotostim.com TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.com yes
legacy fotostim.com none
dashboard fotostim.com 404 sig=0
redirect fotostim.com 301 https://fotostim.com/
serial fotostim.com 068859B1E2768CC50E6AA79CBBC559958C13
## fotostim.cz
FAIL tls12-set fotostim.cz got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts fotostim.cz
https fotostim.cz 200
hsts fotostim.cz 0
tls12 fotostim.cz TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 fotostim.cz yes
legacy fotostim.cz none
dashboard fotostim.cz 404 sig=0
redirect fotostim.cz 301 https://fotostim.cz/
serial fotostim.cz 058A2108047618D8AE8BAEE94DFD9656C275
## igraczech.com
FAIL tls12-set igraczech.com got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts igraczech.com
https igraczech.com 200
hsts igraczech.com 0
tls12 igraczech.com TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 igraczech.com yes
legacy igraczech.com none
dashboard igraczech.com 404 sig=0
redirect igraczech.com 301 https://igraczech.com/
serial igraczech.com 069BB404CE5F1F729812C79096FEB2F867A7
## www.igraczech.com
FAIL tls12-set www.igraczech.com got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts www.igraczech.com
https www.igraczech.com 200
hsts www.igraczech.com 0
tls12 www.igraczech.com TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.igraczech.com yes
legacy www.igraczech.com none
dashboard www.igraczech.com 404 sig=0
redirect www.igraczech.com 301 https://www.igraczech.com/
serial www.igraczech.com 069BB404CE5F1F729812C79096FEB2F867A7
## www.syxra.cz
FAIL tls12-set www.syxra.cz got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts www.syxra.cz
https www.syxra.cz 200
hsts www.syxra.cz 0
tls12 www.syxra.cz TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 www.syxra.cz yes
legacy www.syxra.cz none
dashboard www.syxra.cz 404 sig=0
redirect www.syxra.cz 301 https://www.syxra.cz/
serial www.syxra.cz 0584ABE5714F7F196979A72B1C74C87CB60F
## micro.thinx.cloud
FAIL tls12-set micro.thinx.cloud got: TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
FAIL hsts micro.thinx.cloud
FAIL dashboard-401 micro.thinx.cloud
https micro.thinx.cloud 401
hsts micro.thinx.cloud 0
tls12 micro.thinx.cloud TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256
tls13 micro.thinx.cloud yes
legacy micro.thinx.cloud none
dashboard micro.thinx.cloud 401 sig=0
redirect micro.thinx.cloud 301 https://micro.thinx.cloud/
serial micro.thinx.cloud 055AA7B98C8710DE6D85012BE3C983F11294
EDGE-SCAN FAIL 32
```

## Reported, not gating (before)

- **D-20 redirect gaps** (`http://<host>/`): `app.thinx.cloud` answers 200 (the `thinx-api-http` router has
  `https-redirect` commented out — the plaintext API path legacy devices use), `registry.thinx.cloud` answers
  400 (no middleware on the registry http router), `db.thinx.cloud` answers 401 (couch-auth); every other host
  301 → `https://<host>/`. Recorded for Phase 34, not fixed here.
- **D-16 no-SNI:** `openssl s_client -connect 188.166.23.244:443 -noservername` receives
  `CN=TRAEFIK DEFAULT CERT` (falls through to the catch-all pages). Unchanged by this phase (`sniStrict=false`).
- **keep-7442:** `nc -z rtm.thinx.cloud 7442` open — the plaintext device port is outside Traefik and stays.
