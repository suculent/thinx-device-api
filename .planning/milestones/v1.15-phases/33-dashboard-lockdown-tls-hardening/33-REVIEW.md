---
phase: 33-dashboard-lockdown-tls-hardening
reviewed: 2026-10-09T10:32:47Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - AGENTS.md
  - docker-compose.traefik.yml
  - docker-swarm.yml
  - scripts/traefik-edge-scan.sh
  - /Users/sychram/Repositories/thinx-swarm/README.md
  - /Users/sychram/Repositories/thinx-swarm/thinx.yml
  - /Users/sychram/Repositories/thinx-swarm/traefik.sh
  - /Users/sychram/Repositories/thinx-swarm/traefik.yml
  - /Users/sychram/Repositories/thinx-swarm/traefik/tls.toml
  - /Users/sychram/Repositories/thinx-swarm/vault.yml
findings:
  critical: 1
  warning: 5
  info: 6
  total: 12
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-10-09T10:32:47Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the Phase 33 edge-hardening change set across both repositories: the four `thinx-device-api` files
(diff `b135151..HEAD`) and the six `thinx-swarm` files (diff `158f369..HEAD`, 8 commits `93036a8..e29f19d`).
Read-only local analysis only: `bash -n`, `node scripts/check-traefik-mirror.js` (plain and `--swarm-repo`
freshness mode), per-service label parsing over every `thinx-swarm/*.yml`, comment-stripped label-set diff
`docker-swarm.yml` vs `thinx.yml`, `git ls-files` + masked secret greps over the sibling repo, and the committed
scan capture `traefik-edge-scan.2026-10-08.md` as evidence for what the predicates actually see on the wire.
Nothing was run against the live edge.

What checks out (no finding):

- **Mirror generation:** `docker-compose.traefik.yml` body is byte-identical to `thinx-swarm/traefik.yml`
  (`diff <(tail -n +3 mirror) traefik.yml` empty), banner SHA `e29f19d1…` == thinx-swarm HEAD, `MIRROR OK files=1`
  in both integrity and freshness mode. 19 static `- --` flags in source and mirror.
- **Label/flag consistency:** zero `admin-auth` / `traefik-public-http(s)` / `traefik.docker.network` /
  `traefik.frontend.*` / `traefik.backend.*` occurrences remain outside comments in any stack file. Every
  service that declares a `traefik.http.routers.*` label in `downtime/errorpage/landing/registry/swarmpit/thinx/
  traefik/vault.yml` also carries `traefik.enable=true` and `traefik.swarm.network`, so `exposedbydefault=false`
  drops nothing. Mosquitto's opt-in labels were removed together with its rule-less TCP router (direct-published,
  keep-7442/keep-1883 intact — `ports: 7442:7442` on api, `1883/1884/8883` on mosquitto unchanged). The
  comment-stripped traefik-label sets of `docker-swarm.yml` and `thinx.yml` are identical.
- **`tls.toml` for Traefik v3:** `minVersion = "VersionTLS12"`, `sniStrict`, `curvePreferences` (`X25519`,
  `CurveP256`) and the six cipher-suite constants are all valid Go/Traefik spellings (ChaCha without `_SHA256`
  is the Go name); `alpnProtocols` is not set, so `acme-tls/1` stays in the default list for TLS-ALPN renewals;
  no `maxVersion`, so TLS 1.3 stays offered.
- **Secret hygiene at HEAD of the reviewed files:** `traefik.sh` now has `: "${EMAIL:?…}"` and no
  DOMAIN/USERNAME/PASSWORD/HASHED_PASSWORD; no e-mail, hash, password or token literal in any of the ten files.
- **Docs:** AGENTS.md and README agree with each other and with the capture (`/dashboard` → 404 from
  `api@internal`, `/dashboard/` or `/` → 302; `tls-config-2`; `--api` never `--api.insecure`; 8080 never
  published; `wget`/`nc` in the image).
- **ugrep compatibility:** `grep` on this laptop resolves to ugrep 7.8.4. Every pattern in the scan uses
  `-E`/ERE-safe syntax (`-ci`, `-oE`, `-q`, `-v`, `-c`), no BRE-only constructs (`\+`, `\|`, `\{`), and `-c` on
  empty input prints `0` under both implementations, so the script behaves identically with GNU grep, BSD grep
  and ugrep. No finding.

Key concerns: the committed external scan can print `EDGE-SCAN OK` with two gating predicates never evaluated
when a tool is missing (CR-01); the sibling repo still tracks four backup copies of the old `traefik.yml` with
the cleartext `--pilot.token` UUID while its new README asserts no literal is committed (WR-01); the old
dashboard password remains recoverable from thinx-swarm history (WR-02); the edge-wide HSTS default middleware
is sourced from a dynamic provider and is a single point of failure for every `https` router (WR-03); the
couch-auth challenge is still issued over plaintext `:80` before the redirect (WR-04); and `vault.yml`, if it is
ever deployed as committed, publishes Vault in cleartext on `:8200` and routes a hostname the scan does not know
about (WR-05).

## Critical Issues

### CR-01: Scan prints `EDGE-SCAN OK` with gating predicates silently skipped when `jq` or `nmap` is absent

**File:** `scripts/traefik-edge-scan.sh:46-53`, `scripts/traefik-edge-scan.sh:107-110`
**Issue:** The script has no dependency preflight, and every tool invocation discards stderr (`2>/dev/null`),
so `command not found` is invisible. Two D-28 predicates then degrade to a silent pass instead of a FAIL:

- Line 107: `curl … | jq -e .http` — if `jq` is missing (or not on `PATH` when the script is run from a
  cron/CI shell), the pipeline exits non-zero (127), the `if` body never runs, and `api-exposed` can never fail
  on any of the 17 hosts. A publicly exposed `api@internal` would be reported as `EDGE-SCAN OK`.
- Lines 46-53: if `nmap` is missing, `sweep` is empty, both `grep -E "^${port}/tcp"` loops find nothing, and
  `port-open 8080/8443` can never fail. (The per-host `nmap` failure IS caught indirectly via `FAIL no-tls13`,
  but the port sweep has no such backstop.)

`sslscan` missing likewise silently passes `sslscan-legacy` (redundant with the nmap legacy check, so lower
impact). The script's own header says a closed port or refused handshake "is a RESULT, not a crash" — correct for
network outcomes, but a missing tool is a crash that is currently reported as a pass. The capture
`traefik-edge-scan.2026-10-08.md` proves the predicates fire on this laptop today; the defect is latent, but
this is the committed gate for EDGE-API-01/02 and is meant to be rerun from any laptop.
**Fix:**
```bash
set -u
for tool in nmap sslscan curl jq nc openssl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FAIL tool-missing $tool"; exit 2; }
done
…
sweep=$(nmap -Pn -p 80,443,8080,8443 "$EDGE_IP" 2>/dev/null | grep -E '^[0-9]+/tcp')
if [ -z "$sweep" ]; then echo "FAIL port-sweep-empty $EDGE_IP"; fail=$((fail + 1)); fi
…
api_json=$(curl -s -m 15 "https://$H/api/overview" 2>/dev/null)
if printf '%s' "$api_json" | jq -e .http >/dev/null 2>&1; then
  echo "FAIL api-exposed $H"; fail=$((fail + 1))
fi
```
(Exit 2 for a tooling error keeps it distinguishable from exit 1 = predicate failure.)

## Warnings

### WR-01: Four tracked `traefik.yml.bak.*` files still carry the cleartext `--pilot.token` UUID; README now claims none is committed

**File:** `/Users/sychram/Repositories/thinx-swarm/README.md:92-93`; tracked files
`traefik.yml.bak.20260305155023:129`, `traefik.yml.bak.20260305155055.quote-fix:130`,
`traefik.yml.bak.20260314011814.csp-wss:130`, `traefik.yml.bak.20260327213554.pre-rollback:130`
**Issue:** `git ls-files` in thinx-swarm lists four `traefik.yml.bak.*` files (tracked since `b19d55d`,
2026-10-06). Each contains `- --pilot.token=<RFC4122 UUID>` in cleartext — the very value
`scripts/generate-traefik-mirror.js` was written to redact ("a committed cleartext credential must never reach
this less-private repo"). Phase 30 D-04 removed the flag from `traefik.yml`; the backups were never removed. The
Phase 33 README (line 92-93) now states "no address, password, hash or domain literal is committed anywhere in
this repository, and none may be added (secret hygiene)" — a token literal is committed in four places, so the
hygiene claim the reviewer/operator is told to rely on is false. The token is inert (Traefik Pilot is shut down),
which is why this is not Critical, but a tracked cleartext credential contradicting a committed hygiene
assertion is exactly the drift the mirror check exists to prevent. The same four files also carry the old
`admin-auth` / `traefik-public-http(s)` router labels (templated, no literal) and will mislead a `grep` audit for
"no stale admin-auth labels".
**Fix:** `git rm traefik.yml.bak.20260305155023 traefik.yml.bak.20260305155055.quote-fix
traefik.yml.bak.20260314011814.csp-wss traefik.yml.bak.20260327213554.pre-rollback` (the redacted live captures
under `thinx-device-api/.planning/runbooks/swarm-configs/` supersede them), add `*.bak*` to `.gitignore`, and
either qualify the README sentence ("…in any live stack file; `git log -S` still holds the historic Pilot token
and the pre-Phase-33 `PASSWORD` — see WR-02") or purge history. Regenerate the mirror afterwards (README-only
or `.gitignore`-only commits also move HEAD).

### WR-02: The former dashboard `PASSWORD` literal remains recoverable from thinx-swarm history; no rotation is recorded

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.sh:12-17` (and `git show 158f369:traefik.sh:18`)
**Issue:** Commit `efee92c` scrubbed `PASSWORD=…`, `USERNAME=…`, `DOMAIN=…` and `EMAIL=…` from `traefik.sh`,
but `git log -S` shows the plaintext password has been in the repo since commit `2d713f3` and is one
`git show 158f369:traefik.sh` away. The same `USERNAME`/`HASHED_PASSWORD` pair is still consumed by the live
`couch-auth` and `influx-auth` middlewares (`thinx.yml:144`, `:490`) from `.env`. If `.env`'s
`HASHED_PASSWORD` was ever produced from that literal (the old script did exactly `openssl passwd -apr1
$PASSWORD`), the leaked value still opens `db.thinx.cloud` and `influx.thinx.cloud` today. Neither
`traefik.sh`, the README nor AGENTS.md records that the basic-auth credential was rotated when the literal was
removed. (The reviewer did not read `.env` — the secret-read guard is correct — so this is a rotation-evidence
gap, not a proven live match.)
**Fix:** Verify on micro that the `couch-auth`/`influx-auth` hash does not validate the historic password
(`htpasswd -vb` against the `.env` value, or simply rotate: new password → `openssl passwd -apr1` → update `.env`
→ `docker service update --label-add traefik.http.middlewares.couch-auth.basicauth.users=… thinx_couchdb`, same
for influx), and add one line to `traefik.sh`/README: "credential rotated on <date>; the historic literal in
git history is dead." Optionally rewrite history (`git filter-repo --replace-text`) since the repo is private
and `micro` is the only other remote.

### WR-03: Edge-wide HSTS depends on a dynamic-provider middleware — a single point of failure for every `https` router

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.yml:111` (mirror `docker-compose.traefik.yml:113`)
**Issue:** `--entrypoints.https.http.middlewares=security-headers@swarm` prepends `security-headers@swarm` to the
chain of every router on `:443`. In Traefik v2/v3 a router whose chain references a middleware that does not
exist is not built (`middleware "security-headers@swarm" does not exist` → router status `disabled`, request
404). `security-headers` is defined only by labels on the `traefik_traefik` service, delivered by the swarm
provider. The file already documents one way to lose them (lines 60-64: drop the LOAD-BEARING
`loadbalancer.server.port` label and the provider skips the whole service). Any other path to the same outcome
— `--label-rm` typo during an edge change, a provider restart that briefly yields an empty swarm configuration,
a future "clean-up" of the unused `traefik-public` service — takes **all 28 public routers** down at once,
including `thinx-api-https` and the WebSocket router, whereas before Phase 33 it only removed the headers from
the three routers that referenced it. The fragility is now edge-wide and the failure mode (404 on every host)
looks like an outage, not a missing header.
**Fix:** Define the headers middleware in the file provider, which is already loaded for `tls.toml` and cannot
disappear with a label change:
```toml
# traefik/tls.toml (tls-config-3)
[http.middlewares.security-headers.headers]
  browserXssFilter = true
  contentTypeNosniff = true
  forceSTSHeader = true
  frameDeny = true
  stsIncludeSubdomains = true
  stsPreload = true
  stsSeconds = 31536000
```
then `--entrypoints.https.http.middlewares=security-headers@file`, and either keep the `@swarm` copy for the
three explicit references or move them too. This costs one `tls-config-3` rotation (README §TLS options) and
one `--args` update; record it as Phase 34 if not done now.

### WR-04: `couch-auth` challenges clients on plaintext `:80` before redirecting to HTTPS (pre-existing, untouched by the TLS hardening)

**File:** `/Users/sychram/Repositories/thinx-swarm/thinx.yml:135`, `docker-swarm.yml:187`
**Issue:** `traefik.http.routers.thinx-db-http.middlewares=couch-auth,https-redirect` — middleware order is
chain order, so a request to `http://db.thinx.cloud/` is answered `401 WWW-Authenticate: Basic` by `couch-auth`
*before* `https-redirect` runs. A browser or `curl -u` then sends the `Authorization: Basic` header in cleartext
over `:80`, only to receive the 301 afterwards. The committed capture confirms the behaviour (`## Reported, not
gating: db.thinx.cloud answers 401` on `http://`). The phase's TLS/HSTS work does not cover this because HSTS is
only learned after a first HTTPS visit. `thinx-influx-http` already has the correct shape (`https-redirect`
only). This is pre-existing and not introduced by Phase 33, but it is a plaintext-credential path on a stack
file this phase edited, and D-20 "redirect gaps" lists only app/registry, not this one.
**Fix:** `traefik.http.routers.thinx-db-http.middlewares=https-redirect` in both files (same label on
`thinx_couchdb` via `docker service update --label-add`); keep `couch-auth` on the https router only.

### WR-05: `vault.yml` is dormant but, as committed, publishes Vault in cleartext on `:8200` and routes a hostname the scan does not cover

**File:** `/Users/sychram/Repositories/thinx-swarm/vault.yml:15-16`, `:37-38`, `:14`
**Issue:** The phase edited this file (network label key) and 33-RESEARCH:419 verified no `vault` service runs
today, so nothing is live. But the file is a `docker stack deploy` away from: (a) `ports: 8200:8200` — the Vault
API host-published in plaintext on every interface, bypassing Traefik, TLS options and HSTS entirely; (b)
`vault-http` router on `:80` with **no** `https-redirect` middleware, so `http://vault.thinx.cloud/` serves the
Vault UI/API in cleartext through Traefik; (c) `image: vault:1.5.5` (October 2020, multiple published CVEs). It
also adds `vault.thinx.cloud` as an 18th routed hostname, while `scripts/traefik-edge-scan.sh:25` hard-codes the
17 D-27 hosts and the port sweep (`-p 80,443,8080,8443`) would not notice `:8200`. The research note that the
service is absent is not in the file itself, so an operator following README ("sibling stack files
(`downtime.yml`, `vault.yml`, …)" as part of the edge source of truth) has no warning.
**Fix:** Either delete `vault.yml` (and `vault.conf`) if Vault is not coming back, or make it safe to deploy:
remove `ports:` (Traefik-only ingress), add
`- traefik.http.routers.vault-http.middlewares=https-redirect`, pin a maintained image, and add
`vault.thinx.cloud` + `8200` to the scan (`HOSTS`, `-p 80,443,8080,8443,8200`) so a future deployment is gated.
At minimum add a header comment: "NOT DEPLOYED (verified 2026-10-08); do not `stack deploy` without fixing
8200/redirect".

## Info

### IN-01: `port-open` predicate matches the word `open` anywhere on the nmap line

**File:** `scripts/traefik-edge-scan.sh:49`
**Issue:** `grep -E "^${port}/tcp" | grep -q 'open'` tests the whole line, including the SERVICE column
(`8443/tcp closed https-alt`). Today no nmap service name for 8080/8443 contains "open", so it is a false-FAIL
risk rather than a false pass, but the predicate is accidental.
**Fix:** `printf '%s\n' "$sweep" | awk -v p="${port}/tcp" '$1==p && $2=="open"{f=1} END{exit !f}'`.

### IN-02: Hosts are not asserted to resolve to `EDGE_IP`

**File:** `scripts/traefik-edge-scan.sh:24-25`, `:65`
**Issue:** The 17 hostnames are scanned by name. A hostname re-pointed elsewhere (the external
fotostim/igraczech/syxra zones are not under THiNX control) would be scanned against a foreign server, and if
that server meets the predicates the run reports it as "our edge" passing. 33-RESEARCH:497 verified the
resolution by hand on 2026-10-08; the script does not.
**Fix:** In the loop: `ip=$(dig +short "$H" A | tail -1); [ "$ip" = "$EDGE_IP" ] || { echo "FAIL resolves-elsewhere
$H ${ip:-none}"; fail=$((fail + 1)); continue; }` (or report-only if external zones are expected to move).

### IN-03: Explicit `curvePreferences` disables the X25519MLKEM768 post-quantum hybrid that was live before

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik/tls.toml:13`
**Issue:** Setting `curvePreferences` explicitly removes Go 1.24+'s default hybrid group; the pre-Phase-33 edge
offered `X25519MLKEM768` on TLS 1.3 (33-RESEARCH:223, 336-337). The decision is recorded and deliberate
("trades the PQ hybrid for an explicit, scannable policy"), so this is not a defect — but `tls.toml` itself
does not say so, and 33-RESEARCH:336 verified Traefik v3.7 accepts `"X25519MLKEM768"` in the list.
**Fix:** Either add the comment line to `tls.toml` ("X25519MLKEM768 intentionally dropped — D-14; re-add as
first entry to restore PQ hybrid KEX") or, on the next `tls-config-3` rotation, use
`curvePreferences = ["X25519MLKEM768", "X25519", "CurveP256"]`.

### IN-04: `traefik.sh` has no error handling and is not idempotent

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.sh:5-10`
**Issue:** No `set -euo pipefail`; `docker network create` fails (and is ignored) when the networks exist;
`$NODE_ID` is unquoted on line 10 and `export NODE_ID=$(…)` masks the `docker info` exit status. Bootstrap-only
per its own comment, so low impact.
**Fix:** `set -euo pipefail`; `docker network inspect traefik-public >/dev/null 2>&1 || docker network create
--driver=overlay traefik-public`; `NODE_ID=$(docker info -f '{{.Swarm.NodeID}}')`; `"$NODE_ID"`.

### IN-05: Unused `net` overlay network declared in `traefik.yml`

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.yml:172-174` (mirror `docker-compose.traefik.yml:174-176`)
**Issue:** `networks.net` (overlay, attachable) is declared but no service joins it; `docker stack deploy`
would create an orphan `traefik_net` network. Dead configuration that survived every reconciliation pass.
**Fix:** Remove the `net:` block (then regenerate the mirror).

### IN-06: Dashboard/API one-liners assume the Traefik task is on `micro`

**File:** `AGENTS.md:33`, `AGENTS.md:36`; `/Users/sychram/Repositories/thinx-swarm/README.md:51-52`, `:58`
**Issue:** `docker ps -q -f label=com.docker.swarm.service.name=traefik_traefik` is node-local. The task is
pinned by `node.labels.Traefik == true`, which today is micro, but if the label is ever added to `core` (or
micro drains) `C` is empty and `docker exec "" …` fails with an unhelpful "No such container". The commands
are the documented *only* access path to `api@internal`, so a clearer failure mode is worth two words.
**Fix:** `C=$(docker ps -q -f label=… | head -1); [ -n "$C" ] || { echo "traefik task not on this node — check
docker service ps traefik_traefik"; exit 1; }` in both documents, or resolve the node first with
`docker service ps traefik_traefik --filter desired-state=running --format '{{.Node}}'`.

---

_Reviewed: 2026-10-09T10:32:47Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
