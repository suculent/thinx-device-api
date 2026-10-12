# Traefik ACME certificate inventory — 2026-10-06

Phase 29 (EDGE-RECON-01, D-10). Metadata only — **no private keys, no certificate bodies**
(no PEM-encoded certificate or key material anywhere in this file).

- **Authoritative ACME storage (live):** the named Docker volume
  `/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json` on `micro`
  (confirmed by `services/traefik/update.sh`). The dead app-repo file's `/traefik/acme.json` path
  is a separate drift signal, recorded in `traefik-edge-diff.2026-10-06.md` (R2 row 4), not here.
- **Resolver:** `le` (Let's Encrypt, TLS-ALPN challenge).
- **Certificates issued:** 24. Issuer for all: Let's Encrypt. Metadata read via
  `jq .le.Certificates[].domain` + `openssl x509 -noout -issuer -enddate` on the decoded leaf
  (decoded in memory on `micro`; only issuer/expiry extracted — bodies never written out).

| # | Main domain | SANs | Resolver | Issuer | Expiry (notAfter, UTC) |
|---|---|---|---|---|---|
| 1 | rtm.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:49:53 |
| 2 | swarmpit.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:50:03 |
| 3 | www.fotostim.com | — | le | Let's Encrypt | 2026-12-28 05:50:06 |
| 4 | console.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:50:14 |
| 5 | influx.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:50:23 |
| 6 | app.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:50:33 |
| 7 | www.syxra.cz | — | le | Let's Encrypt | 2026-12-28 05:50:42 |
| 8 | replica.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:50:48 |
| 9 | micro.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:50:59 |
| 10 | www.fotostim.cz | — | le | Let's Encrypt | 2026-12-28 05:51:02 |
| 11 | chronograf.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:51:10 |
| 12 | db.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:51:21 |
| 13 | thinx.cloud | www.thinx.cloud | le | Let's Encrypt | 2026-12-28 05:51:41 |
| 14 | registry.thinx.cloud | — | le | Let's Encrypt | 2026-12-28 05:51:49 |
| 15 | checkout.qooldata.com | checkout.fotostim.com, checkout.fotostim.cz | le | Let's Encrypt | **2025-07-06 05:51:51 — EXPIRED** |
| 16 | ssl.thinx.cloud | — | le | Let's Encrypt | 2026-12-27 05:49:59 |
| 17 | ctf24.teacloud.net | — | le | Let's Encrypt | 2026-12-27 05:50:08 |
| 18 | fotostim.cz | — | le | Let's Encrypt | 2026-12-15 05:50:17 |
| 19 | fotostim.com | — | le | Let's Encrypt | 2026-12-15 05:50:54 |
| 20 | vvv.thinx.cloud | — | le | Let's Encrypt | 2026-11-22 05:49:32 |
| 21 | test.thinx.cloud | — | le | Let's Encrypt | 2026-12-02 05:49:26 |
| 22 | igraczech.com | — | le | Let's Encrypt | 2026-12-01 05:49:29 |
| 23 | www.igraczech.com | — | le | Let's Encrypt | 2026-12-01 05:49:37 |
| 24 | igraczech.unitednewschannel.net | — | le | Let's Encrypt | 2027-01-01 15:43:16 |

**Note (not actioned this phase, D-05/D-06):** certificate #15 (`checkout.qooldata.com` +
fotostim checkout SANs) expired 2025-07-06 and has not renewed — a stale ACME entry. Recorded as a
finding for the migration/hardening phases (ACME renewal review, P33 EDGE-TLS-03); no change here.

**Zero-cert case (EDGE-02 empty edge):** not applicable — `jq '.le.Certificates | length'` = 24.
Had it been 0 or the file/resolver absent, this inventory would instead carry a single explicit
`0 certificates issued (resolver le, acme.json present)` line, not an error.
