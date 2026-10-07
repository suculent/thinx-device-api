# Traefik edge — live rollback + restore cycle (Phase 30 / EDGE-MIG-04 + EDGE-MIG-01, D-06)

**Captured:** 2026-10-07 from `micro` (swarm manager), inside the P30 maintenance window.
**Scope:** a LIVE rollback+restore cycle demonstrated on the production `traefik_traefik` service —
roll the edge back to the Phase-29 out-of-git snapshot (pilot flag temporarily re-introduced),
verify the full edge on that OLD config, then re-apply the P30 (pilot-token-removed) end state and
re-verify.

**Redaction + non-executable (per `swarm-configs/README.md`).** This is an audit record, NOT a
script — do not execute it. Secrets are shown as `<redacted>`; `${VAR}` is kept templated. The
resolved `--pilot.token` UUID, the `admin-auth` basic-auth hash, the resolved ACME email and the raw
`acme.json` key material are **never** written here. They live only in the out-of-git 600 snapshot
on `micro` (named by path only — see the final section).

**Result:** the cycle completed and the edge is left in the intended **P30 end state** (running Args
carry no pilot flag; all six entrypoints incl. `:7442` present; exactly one running task; valid
served cert; `:7442` plaintext + plain MQTT intact). The Phase-29 snapshot remains the standing
rollback target afterwards.

> Documentation convention: live commands below use the `ssh micro "…"` form and the
> `# expect:` convention from `swarm.md`. On the executor host the `micro` alias is resolved to the
> operator's SSH endpoint from `~/.aliases`; the raw endpoint is not written into this repo.

---

## Mechanism (surgical single-flag delta)

The edge change in every stage of the cycle is a **single flag** on the running service's resolved
static command (`Spec.TaskTemplate.ContainerSpec.Args`): the inert `--pilot.token` is present at the
rollback stage and absent at the P30 end state. Nothing else changes — the pinned image digest
(`traefik:v2.11@sha256:d57faa4f…`), the published ports (`:80`/`:443`), the `admin-auth` label, the
`tls.toml` config and all six entrypoints are identical across the whole cycle. This mirrors the
30-01 cutover discipline (one flag, image digest pinned, hash reused).

The pilot flag was re-introduced by reading its value **from the snapshot on `micro`** into a shell
variable that is never printed, appended to the live Args via `printf '%q'` quoting, and applied with
`docker service update --args` (keeping the current pinned image). The quoting was proven to
round-trip on an isolated scaled-to-zero throwaway service first (with a FAKE token), so the
backtick-bearing `--providers.docker.constraints=Label(...)` arg could not be mangled on the live
service.

A belt-and-suspenders full-spec backup was taken before any mutation:
```
ssh micro "docker service inspect traefik_traefik > /mnt/data/edge-rollback/traefik-p30-prerolldemo-<UTC>.json; chmod 600 …"
# expect: 600 root, out-of-git on micro (never committed / never scp'd into a repo)
```

---

## Stage 1 — Pre-check (snapshot present, before touching the service)

```
ssh micro "stat -c '%a %U' /mnt/data/edge-rollback/traefik-2026-10-06/acme.json"
# expect: 600 root
ssh micro "ls -la /mnt/data/edge-rollback/traefik-2026-10-06/"
# expect: dir 700 root; acme.json (600 root), resolved-snapshot.yml (600 root)
```
**Observed:** `600 root` acme.json; dir `drwx------` root; `resolved-snapshot.yml` present. PASS.

Baseline (P30 end state, pre-cycle): running Args = 17 flags, **0** `pilot`, `:7442` entrypoint
present, exactly 1 running task, image digest `d57faa4f…`, Traefik publishes only `:80`/`:443`.
Live `acme.json` on the named volume = `600 root 301146` bytes — **identical in size to the snapshot
copy**, i.e. the same certificates (no ACME activity since the snapshot).

---

## Stage 2 — Roll back to the Phase-29 snapshot

```
ssh micro "cp -a /mnt/data/edge-rollback/traefik-2026-10-06/acme.json \
  /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"   # restore certs, 600 root
ssh micro "docker service update --args '<17 live P30 flags> --pilot.token=<redacted>' traefik_traefik"
# expect: service converges to a single running task; certs served from the restored acme.json (no ACME re-challenge)
```

The `acme.json` on the authoritative named volume
(`/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json`, confirmed by
`services/traefik/update.sh`) was restored from the snapshot first, so the restarted task reads the
restored cert store without triggering an ACME challenge.

### Rollback-stage running Args (pilot `<redacted>`)

```
--providers.docker
--providers.docker.constraints=Label(`traefik.constraint-label`, `traefik-public`)
--providers.docker.exposedbydefault=true
--providers.docker.swarmmode
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
--pilot.token=<redacted>
```
- Args element count: **18** (the 17 P30 flags + the re-introduced `--pilot.token`).
- `pilot` present: **1**. `--entrypoints.thxp.address=:7442` present: **1**.
- Running task count: **exactly 1** (new task Running, prior task Shutdown — single consistent state).
- Image digest unchanged: `traefik:v2.11@sha256:d57faa4f…`.

---

## Stage 3 — Verify the full edge on the OLD (rolled-back) config

```
ssh micro "curl -sS -o /dev/null -w '%{http_code}' https://<host>/"      # routes over :443
ssh micro "curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' http://<host>/"   # HTTP->HTTPS
ssh micro "echo | openssl s_client -connect app.thinx.cloud:443 -servername app.thinx.cloud | openssl x509 -noout -checkend 0"
ssh micro "timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/<port>'"        # :7442 / :1883 / :8883
```

| Check (OLD config) | Result |
|---|---|
| `https://app.thinx.cloud/` | **200** |
| `https://console.thinx.cloud/` | **200** |
| `https://rtm.thinx.cloud/` | **200** |
| `https://thinx.cloud/` (landing) | **200** |
| `http://console.thinx.cloud/` → HTTP→HTTPS redirect | **301** → `https://console.thinx.cloud/` |
| `http://rtm.thinx.cloud/` → redirect | **301** → `https://rtm.thinx.cloud/` |
| `http://thinx.cloud/` → redirect | **301** → `https://thinx.cloud/` |
| `http://app.thinx.cloud/` | **200** (API host; answers plaintext by design, HSTS header present — pre-existing baseline, not a redirect host) |
| TLS cert served (app.thinx.cloud:443, `checkend 0`) | **valid** — issuer Let's Encrypt `YR2`, notBefore 2026-09-29, notAfter 2026-12-28 (served from the restored snapshot `acme.json`; no ACME re-challenge) |
| `:7442` plaintext TCP accept | **OPEN** |
| `:1883` plain MQTT TCP accept | **OPEN** |
| `:8883` MQTTS TCP accept | **OPEN** |
| `thinx_api` publishes `:7442` | yes (`PublishedPort 7442`, unaffected by the cycle) |
| `thinx_mosquitto` publishes `:1883`/`:8883` | yes (`1883`,`1884`,`8883`, unaffected) |

OLD config fully healthy: every app/console/landing route serves over `:443`, the redirect hosts
redirect, the served cert is valid off the restored `acme.json`, and the legacy device/MQTT paths
accept connections.

---

## Stage 4 — Re-apply the P30 (pilot-token-removed) end state

```
ssh micro "docker service update --args '<17 flags, no pilot>' traefik_traefik"
# expect: pilot flag gone; converges to a single running task; nothing else changed
```

The P30 Args were rebuilt from the live rollback-stage Args **minus** the `--pilot.token` line — no
other flag added or removed (re-applied config is exactly the 30-01 end state, nothing more). The
pinned image digest and `acme.json` are untouched.

### Final (P30 end state) running Args

```
--providers.docker
--providers.docker.constraints=Label(`traefik.constraint-label`, `traefik-public`)
--providers.docker.exposedbydefault=true
--providers.docker.swarmmode
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
```
- Args element count: **17**. `pilot` present: **0**. `:7442` entrypoint present: **1**.
- Running task count: **exactly 1**. Image digest unchanged: `d57faa4f…`.
- This matches `traefik-edge.B.post.yml` exactly (the committed P30 end-state snapshot from 30-01).

---

## Stage 5 — Re-verify the P30 end state

| Gate (P30 end state) | Result |
|---|---|
| `pilot` count in final Args | **0** |
| `--entrypoints.thxp.address=:7442` present | **yes** |
| running traefik task count | **exactly 1** |
| `thinx_api` publishes `:7442` | **yes** |
| `thinx_mosquitto` publishes `:1883`/`:8883` | **yes** (used `--filter name=thinx_mosquitto`; see caveat) |
| app.thinx.cloud:443 cert `checkend 0` | **valid** |
| `https://{app,console,rtm,thinx.cloud}/` | **200 / 200 / 200 / 200** |
| `http://{console,rtm,thinx.cloud}/` redirect | **301 / 301 / 301** (app = 200, API host, by design) |
| `:7442` / `:1883` / `:8883` TCP accept | **OPEN / OPEN / OPEN** |
| `acme.json` on named volume | **600 root 301146** |

**Verify-command caveat (carried from 30-01):** `docker service ls --filter name=mosquitto -q`
returns empty because Docker's service-name filter is prefix-matched and the service is
`thinx_mosquitto`. Use `--filter name=thinx_mosquitto` (or `docker service inspect thinx_mosquitto`
directly) — done here; `:1883`/`:8883` confirmed published.

---

## Out-of-git snapshot discipline (T-30-06)

The Phase-29 rollback restore (`/mnt/data/edge-rollback/traefik-2026-10-06/` — `acme.json` at 600
root + `resolved-snapshot.yml` holding the resolved command/labels/env/tls.toml) and the
pre-roll-demo full-spec backup (`/mnt/data/edge-rollback/traefik-p30-prerolldemo-<UTC>.json`, 600
root) stay **out-of-git on `micro`**. They contain real resolved secrets (the pilot UUID, the
`admin-auth` hash, the ACME email, raw `acme.json` key material) and are **never** committed and
**never** scp'd into any repo — this record references them by path only. The restored `acme.json`
is the authoritative named-volume cert store; certificates are served from it instantly on rollback
with no ACME re-challenge.

**Backstop (confirmed at the human-verify gate, not by an automated command):** because the
Phase-29 snapshot and the pre-roll-demo spec backup both remain present on `micro` and the
maintenance window stays open, a mid-cycle failure (a redeploy not converging, a verify gate
failing) can be re-rolled immediately to the known-good edge — no interruption leaves production
without a working edge.
