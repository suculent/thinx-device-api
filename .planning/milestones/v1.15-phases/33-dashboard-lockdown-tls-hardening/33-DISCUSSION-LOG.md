# Phase 33: Dashboard Lockdown & TLS Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-08
**Phase:** 33-dashboard-lockdown-tls-hardening
**Areas discussed:** Dashboard fate & credential, Exposure audit & label cleanup, External scan & evidence, TLS options & ciphers, HSTS scope, ACME renewal proof & volume hygiene, ssh-only API mechanics, WS router + headers fallback, Stage order & gates, micro.thinx.cloud & bookkeeping

---

## Dashboard fate & credential

| Option | Description | Selected |
|--------|-------------|----------|
| Keep behind auth | Status quo: api@internal on micro.thinx.cloud behind admin-auth (401 today) | ✓ (later superseded) |
| API only, no UI | `--api.dashboard=false`, JSON API stays | |
| Disable --api entirely | Remove flag, router, middleware; lose router-inventory gate | |

| Option | Description | Selected |
|--------|-------------|----------|
| Basic-auth only | One strong factor | |
| Basic-auth + IP allowlist | ipAllowList on fixed egress IPs | ✓ (later superseded) |
| Basic-auth + rate limit | rateLimit on the dashboard router | |

Mid-discussion the user asked whether the swarm's OpenVPN could add management access. Live check: no VPN service/container runs (the `:1194` entrypoint is vestigial), and Traefik's ingress-mode publishing makes every client appear as `10.0.0.2`, so IP-keyed middlewares cannot work. Re-asked:

| Option | Description | Selected |
|--------|-------------|----------|
| ssh tunnel only | Remove public router + admin-auth; API via ssh to micro | ✓ |
| Public + allowlist, fix real IPs | Host-mode publishing first, then ipAllowList | |
| Public + basic-auth only | Keep public router behind rotated credential | |
| Both: public auth + tunnel documented | Keep basic-auth, document tunnel, allowlist later | |

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 34 | Real-IP fix as ops-phase item | ✓ |
| Fix in this phase | Host-mode / PROXY protocol now | |
| Not a goal | Leave ingress NAT | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rotate now + scrub script | New random password, bcrypt, secret file, scrub traefik.sh | |
| Rotate only if it matches | Compare committed password with live apr1 hash; rotate on MATCH; scrub regardless | ✓ |
| Scrub script, keep password | Remove literal only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Docker secret usersFile | basicauth.usersfile from a swarm secret | ✓ (moot after router removal) |
| Label with ${HASHED_PASSWORD} | Status quo | |

**User's choice:** ssh-only API; credential compare-and-record; admin-auth removed with the router.
**Notes:** VPN recorded as a deferred new capability. DNS check showed every routed hostname resolves only to micro, so host-mode publishing is feasible later.

---

## Exposure audit & label cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Flip now | exposedbydefault=false; all 16 services already enable=true | ✓ |
| Defer to Phase 34 | | |
| Keep true permanently | Constraint label as sole gate | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dead v1 STS labels + 8080 port label | IN-03, noexpose labels, vestigial traefik-public port | ✓ |
| Mosquitto dead TCP router + enable labels | IN-06 | ✓ |
| vault.yml traefik.docker.network | IN-02 | ✓ |
| WS rule ${THINX_HOSTNAME} | IN-05 | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| One stage per concern | Separate --args updates with own gates/rollbacks | ✓ |
| Single combined update | One restart, one rollback | |

| Option | Description | Selected |
|--------|-------------|----------|
| Observe only | Never touch external-stack labels | |
| Fix their labels too | Update fotostim/igraczech/syxra via docker service update, recorded in runbook | ✓ |

**User's choice:** Flip now, full label bundle, staged restarts, external stacks included.

---

## External scan & evidence

| Option | Description | Selected |
|--------|-------------|----------|
| nmap + sslscan + curl | Local, scripted, reproducible | ✓ |
| SSL Labs | Public grade, cached/listed | |
| testssl.sh | Thorough, needs install | |

| Option | Description | Selected |
|--------|-------------|----------|
| All hosts with a router | thinx-owned + external; retired names noted | ✓ |
| thinx-owned only | | |
| Primary three | rtm, app, console | |

| Option | Description | Selected |
|--------|-------------|----------|
| Strict modern | No CBC/SHA-1, redirect everywhere, etc. | |
| Requirements literal | TLS>=1.2 modern set, HSTS, 8080 closed, email real | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Runbook capture + VERIFICATION | Dated redacted report under swarm-configs + rerun script | ✓ |
| VERIFICATION.md only | | |

**User's choice:** Local scan of every routed host, literal pass bar, runbook capture.

---

## TLS options & ciphers

| Option | Description | Selected |
|--------|-------------|----------|
| Load via file provider | `--providers.file.filename=/traefik/tls.toml`, `default` TLS option | ✓ |
| Drop the dead mount, keep Go defaults | | |

| Option | Description | Selected |
|--------|-------------|----------|
| ECDHE AEAD only | AES-GCM 128/256 + CHACHA20, all CBC dropped | ✓ |
| Current file as-is | 11 suites incl. CBC_SHA256 | |
| Go defaults (no list) | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Off | Keep today's no-SNI behaviour | ✓ |
| On | Refuse no-SNI handshakes | |

| Option | Description | Selected |
|--------|-------------|----------|
| TLS 1.2 | ESP8266/ESP32 compatibility | ✓ |
| TLS 1.3 only | | |

**User's choice:** File provider, AEAD-only suites, sniStrict off, min TLS 1.2.

---

## HSTS scope

| Option | Description | Selected |
|--------|-------------|----------|
| Entrypoint default middleware | `--entrypoints.https.http.middlewares=security-headers@swarm` | ✓ |
| Per-router append | Add to each HTTPS router lacking it | |
| Split: HSTS-only edge-wide | STS-only default + rich headers per router | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep all three | max-age 1y; includeSubDomains; preload | ✓ |
| Drop preload | | |
| Drop preload and includeSubDomains | | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, header only | Do not submit to hstspreload.org | ✓ |
| Yes, submit | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep per-router, fill gaps | Audit http routers, add https-redirect | |
| Entrypoint-level redirect | Redirect all of :80 | |
| Leave as is | Record gaps only | ✓ |

**User's choice:** Edge-wide HSTS via entrypoint default, current directives, no preload submission, redirect gaps recorded only.

---

## ACME renewal proof & volume hygiene

| Option | Description | Selected |
|--------|-------------|----------|
| Log evidence + forced renewal of one low-value host | Snapshot, delete one entry, watch reissue | ✓ |
| Log evidence only | | |
| Staging dry-run on throwaway | Infeasible with TLS-ALPN | |

| Option | Description | Selected |
|--------|-------------|----------|
| Move into snapshot dir, then delete | 2023 `_acme.json`/`__acme.json` archived 600-root out of git, removed from volume | ✓ |
| Delete outright | | |
| Leave | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Prune no-router entries, snapshot first | Remove all retired names | |
| Prune only the failing external entry | `checkout.qooldata.com` only | ✓ |
| Leave all | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep address, scrub script | EMAIL from env; literals out of traefik.sh | ✓ |
| Switch to a role mailbox | | |

**User's choice:** Forced reissue of one routed low-value host, archive-then-delete stale key files, prune only the failing external entry, keep the e-mail.
**Notes:** The forced-reissue host must still have a live router (test/vvv have none).

---

## ssh-only API mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Loopback entrypoint | `127.0.0.1:8080` inside the task, file-provider router to api@internal, no auth, ssh + docker exec | ✓ |
| Unpublished overlay entrypoint | Reachable by every service on traefik-public | |
| No API at all | Drop --api | |

| Option | Description | Selected |
|--------|-------------|----------|
| JSON API only | `--api.dashboard=false` | |
| Dashboard UI too | Keep UI, document ssh -L port-forward | ✓ |

---

## WS router + headers fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Per-router append | Drop entrypoint flag; security-headers on every HTTPS router except thinx-api-ws | ✓ |
| HSTS-only edge-wide | STS-only default middleware | |
| Accept if harmless | Keep edge-wide if the handshake works | |

---

## Stage order & gates

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard, exposure, TLS, HSTS | Lowest-risk first | ✓ |
| TLS first | | |
| Planner decides | | |

| Option | Description | Selected |
|--------|-------------|----------|
| P32 D-10 triggers per stage | Router status, HTTPS matrix vs baseline, WS probe, TLS handshake | ✓ |
| Human decides each revert | | |

| Option | Description | Selected |
|--------|-------------|----------|
| One gate at the end | P31/P32 precedent | ✓ |
| After each static stage | | |

---

## micro.thinx.cloud & bookkeeping

| Option | Description | Selected |
|--------|-------------|----------|
| Remove them everywhere | DOMAIN/USERNAME/HASHED_PASSWORD out of traefik.yml and traefik.sh; EMAIL stays from env | ✓ |
| Keep templated, unused | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Runbook section + AGENTS.md pointer | | |
| Runbook only | | |
| Other: "Runbook, Agents.md and Readme.md" | Runbook + AGENTS.md + README.md (deploy repo thinx-swarm) | ✓ |

---

## Claude's Discretion

- Loopback entrypoint name/port, in-task HTTP client mechanics, `ssh -L` recipe.
- Whether the file-provider flag rides in Stage A; `curvePreferences`/`alpnProtocols`.
- Removal vs retention of redundant per-router `security-headers@swarm` refs (no duplicate headers).
- Choice of the low-value routed host for the forced reissue; capture naming; label clean-up ordering.

## Deferred Ideas

- Management VPN on the swarm (none runs today) — new capability.
- Real client IPs at the edge (host-mode publishing / PROXY protocol) — Phase 34; prerequisite for any IP allowlist.
- `:80`→`:443` redirect gaps; `sniStrict=true`; pruning retired thinx ACME entries; HSTS preload submission.
- Reviewed, not folded: the six "api"-keyword todos (API-key hashing, MQTT writes gate, notifications, transfers, OTA, transfer leftovers).
