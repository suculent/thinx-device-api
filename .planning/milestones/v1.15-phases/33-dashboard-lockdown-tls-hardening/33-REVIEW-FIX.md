---
phase: 33-dashboard-lockdown-tls-hardening
fixed_at: 2026-10-09T10:50:00Z
review_path: .planning/phases/33-dashboard-lockdown-tls-hardening/33-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 3
skipped: 3
status: partial
---

# Phase 33: Code Review Fix Report

**Fixed at:** 2026-10-09T10:50:00Z
**Source review:** .planning/phases/33-dashboard-lockdown-tls-hardening/33-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, WR-01..WR-05; fix_scope critical_warning, IN-01..IN-06 out of scope)
- Fixed: 3 (CR-01, WR-01, WR-05)
- Skipped: 3 (WR-02, WR-03, WR-04), each recorded under `## Recorded for Phase 34` in
  `.planning/runbooks/traefik-edge-hardening.md`

**Where verification ran:** the thinx-device-api edits and checks ran in the isolated review-fix worktree
(`.claude/worktrees/rf-33-30933-…`, branch `gsd-reviewfix/33-30933`, fast-forwarded into `thinx-staging`
afterwards). The scan script, the mirror generator and the mirror check need no `node_modules`, so the results are
the same in the main checkout. thinx-swarm edits were made directly on its `master` checkout. **No live edge
change:** nothing ran `docker service update`, `docker config`, label changes, `stack deploy` or `restart.sh`. The
only remote actions were read-only `docker service inspect`/`ls`, the git push of `master` to a temp branch on micro,
and the `--ff-only` merge of micro's deploy checkout. `:7442` and `:1883` were not touched.

## Commits

| Repo | SHA | Finding |
|---|---|---|
| thinx-device-api | `0d93e119` | CR-01 scan fails closed |
| thinx-swarm | `d156e79` | WR-01 remove four token-bearing backups, qualify README |
| thinx-swarm | `b04f066` | WR-05 deploy-safe `vault.yml` |
| thinx-device-api | `f3e5905d` | WR-01 (+WR-05) mirror regenerated at thinx-swarm `b04f066` |
| thinx-device-api | `33469869` | `docs(33): record deferred review findings for Phase 34` (WR-02/03/04, WR-05 leftovers, WR-01 follow-up) |

Propagation: `git push origin master` (`e29f19d..b04f066`); push to
`ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/heads/p33-fix` with
`GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020"` (the runbook's form); on micro `git merge --ff-only p33-fix && git
branch -d p33-fix` (fast-forward `e29f19d..b04f066`). Laptop HEAD == origin/master == micro HEAD ==
`b04f066dee01661e10a52153f16a7cc111855551`.

## Fixed Issues

### CR-01: Scan prints `EDGE-SCAN OK` with gating predicates silently skipped when `jq` or `nmap` is absent

**Status:** fixed
**Files modified:** `scripts/traefik-edge-scan.sh`
**Commit:** `0d93e119`
**Applied fix:**
- Preflight before any scan: `command -v` for `nmap sslscan curl jq nc openssl` plus the text tools the predicates
  pipe through (`grep sed awk sort tr paste head`; no `dig`/`host` is used). It also runs jq once on the api-exposed
  expression, so a broken jq counts as missing. A missing tool prints `FAIL tool-missing <tool>` (stdout) and
  `EDGE-SCAN PREFLIGHT FAIL: … no predicate was evaluated` (stderr), then **exit 2**, with no verdict line.
- Port sweep: the nmap rc is captured (`FAIL port-sweep-error` on non-zero), and each of 80/443/8080/8443 must have
  a state line before `port-open` is evaluated (`FAIL port-sweep-missing <port>`).
- `api-exposed`: the body and the curl rc are captured first. jq reads the body as a raw string
  (`-R -s`, `try fromjson`): rc 0 means exposed (`FAIL api-exposed <host>`), rc 1 means not exposed, and any other rc
  means a jq error (`FAIL api-exposed <host> unchecked: jq rc=N`). A curl error gives
  `FAIL api-exposed <host> unchecked: curl rc=N`.
- `dashboard-open` and `dashboard-401`: a curl error gives a FAIL for that predicate (`… unchecked: curl rc=N`).
  `db`/`influx` keep the dashboard-401 exemption.
- `sslscan-legacy`: output with no `TLSv1.2`/`TLSv1.3` protocol line counts as `FAIL sslscan-legacy <host>
  unchecked: no sslscan protocol table`.
- `hsts`: this predicate already failed closed. The line now names the curl rc when curl failed, still one FAIL per
  host.
- Preserved: every predicate string and verdict line, the `BASICAUTH_HOSTS="db.thinx.cloud influx.thinx.cloud"`
  literal, `EDGE_IP=188.166.23.244`, the 17-host `HOSTS=` line (byte-identical), the three `ECDHE_RSA` suites, `set
  -u` only (`set -e` count 0). The 33-01 Plan `<automated>` static verify block passes (run with `/usr/bin/grep`).

**Verification:**
- `bash -n scripts/traefik-edge-scan.sh` → `SYNTAX OK` (shellcheck not installed).
- Fail-closed proof (PATH = temp dir with every tool except jq):
  ```
  FAIL tool-missing jq
  EDGE-SCAN PREFLIGHT FAIL: required tool(s) missing or broken on PATH: jq — install them and rerun; no predicate was evaluated
  exit=2
  ```
- One real read-only run against the live edge, 2026-10-09 10:44:21Z–10:46:14Z, 0 `^FAIL ` lines:
  ```
  ## Port sweep 188.166.23.244
  80/tcp   open   http
  443/tcp  open   https
  8080/tcp closed http-proxy
  8443/tcp closed https-alt
  port 7442 rtm.thinx.cloud open
  nosni-subject CN=TRAEFIK DEFAULT CERT
  …
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
  exit=0
  ```

### WR-01: Four tracked `traefik.yml.bak.*` files still carry the cleartext `--pilot.token` UUID; README now claims none is committed

**Status:** fixed
**Files modified:** thinx-swarm `README.md`; removed `traefik.yml.bak.20260305155023`,
`traefik.yml.bak.20260305155055.quote-fix`, `traefik.yml.bak.20260314011814.csp-wss`,
`traefik.yml.bak.20260327213554.pre-rollback`; thinx-device-api `docker-compose.traefik.yml` (mirror banner)
**Commits:** thinx-swarm `d156e79`; thinx-device-api `f3e5905d` (mirror)
**Applied fix:**
- Pre-check (read-only, on micro): `traefik_traefik` mounts are `/var/run/docker.sock` (bind, ro) and the
  `traefik_traefik-public-certificates` volume. Its only config is `tls-config-2` → `/traefik/tls.toml`. No running
  service mount references `traefik.yml.bak` (count 0), so WR-01 was not aborted.
- Count of the token key `--pilot.token=` per file (values never printed): exactly 1 in each of the four files and 0
  in every other tracked file. All four were removed with `git rm`. After the commit, 0 tracked files carry the key.
- README §Bootstrap now says: `traefik.sh` carries no address/password/hash/domain literal, and no credential is
  committed at HEAD. It also says git **history** still holds the pre-Phase-33 dashboard `PASSWORD` (before
  `efee92c`) and the inert Pilot token, and that rotating the credential is a Phase 34 operator item. The old
  "anywhere in this repository" wording was also false for domain literals, which the stack files route by name.
- No blanket `*.bak*` ignore was added.
- Mirror regenerated (`node scripts/generate-traefik-mirror.js --swarm-repo …`). Only the banner changed, because
  the `traefik.yml` body is unchanged. `MIRROR OK files=1` in integrity mode and in `--swarm-repo` freshness mode.

**Other tracked `*.bak*` files, marker counts** (Pilot token key / apr1 hash / bcrypt hash / PEM armour header / private-key marker),
all 0/0/0/0/0:
`console/default.conf.bak-20260924`, `console/default.conf.bak.20260705214935.hsts`,
`registry.yml.bak.20260921131900.storage-path-and-limits`, `registry.yml.bak.20260921133008.http-secret`,
`swarmpit.yml.bak.20260321111207.influx-oom`, `swarmpit.yml.bak.20260611212323.pin-influx-micro`,
`swarmpit.yml.bak.20261005110213.p28-A-pre`, `swarmpit.yml.bak.20261005112754.p28-B-pre`, `thinx.yml.bak`,
`thinx.yml.bak-phase22-20260925T130834Z`, and the 11 `thinx.yml.bak.2026*` files. A wider sweep with a
`PASSWORD=<non-$>` pattern matched only `ALLOW_EMPTY_PASSWORD=no` in `thinx.yml` and its backups, which is benign.
None was removed.

**Operator follow-up (recorded under Phase 34):** micro's deploy checkout has an **untracked**
`traefik.yml.bak.20261007120354.pre-p30-pilot` with 1 `--pilot.token=` line (count only). It is not in git and was
not touched. The operator should move it to `/mnt/data/edge-rollback/` (600 root) or delete it. The ff-merge removed
the four tracked copies from micro's working tree as expected; git history keeps them.

### WR-05: `vault.yml` is dormant but, as committed, publishes Vault in cleartext on `:8200` and routes a hostname the scan does not cover

**Status:** fixed (deploy-safe subset; nothing live changes)
**Files modified:** thinx-swarm `vault.yml`
**Commit:** thinx-swarm `b04f066` (propagated together with WR-01; mirror banner commit `f3e5905d` covers both)
**Applied fix:** Confirmed again that the stack is not deployed (`docker service ls` shows 0 services matching
`vault`). Changes:
- Removed `ports: - 8200:8200`, so ingress is Traefik-only and TLS options and HSTS apply.
- Added `traefik.http.routers.vault-http.middlewares=https-redirect`.
- Added a header comment: "NOT DEPLOYED (verified 2026-10-08 / 2026-10-09)", listing what is still open before any
  `stack deploy`.

Not changed, per scope: the image pin, and adding `vault.thinx.cloud` to the scan `HOSTS` (no live router exists, so
the scan would fail). Both questions, plus "delete the stack file?", are recorded under Phase 34. No
thinx-device-api script mirrors or checks `vault.yml`. The YAML parses (`ports` absent, middleware label present).

## Skipped Issues

### WR-02: The former dashboard `PASSWORD` literal remains recoverable from thinx-swarm history; no rotation is recorded

**Status:** skipped
**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.sh:12-17` (history `158f369`)
**Reason:** credential rotation is an operator action. It also needs a live label change on
`thinx_couchdb`/`thinx_influxdb`, which is a coordinated live edge change. Deferred to Phase 34 (repo-first then
live). Recorded under Phase 34: "rotate the couch-auth / influx-auth basic-auth credential pair (same
USERNAME/HASHED_PASSWORD lineage as the retired dashboard password, plaintext retrievable from thinx-swarm history at
158f369)", with the rotation recipe. `.env` was not read, and no value, hash or address was printed or written.
**Original issue:** the plaintext password is one `git show 158f369:traefik.sh` away, and the same lineage feeds the
live `couch-auth`/`influx-auth` middlewares. No rotation is recorded.

### WR-03: Edge-wide HSTS depends on a dynamic-provider middleware — a single point of failure for every `https` router

**Status:** skipped
**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.yml:111` (mirror `docker-compose.traefik.yml:113`)
**Reason:** requires a coordinated live edge change; deferred to Phase 34 (repo-first then live). It changes a live
static flag (`--entrypoints.https.http.middlewares`) and needs a `tls-config-3` rotation. Recorded under Phase 34
with the reviewer's fix: define `security-headers` in the file provider (`traefik/tls.toml`) and reference
`security-headers@file`.
**Original issue:** every `:443` router depends on labels of `traefik_traefik`. If those labels are lost, all 28
public routers are disabled.

### WR-04: `couch-auth` challenges clients on plaintext `:80` before redirecting to HTTPS

**Status:** skipped
**File:** `/Users/sychram/Repositories/thinx-swarm/thinx.yml:135`, `docker-swarm.yml:187`
**Reason:** requires a coordinated live edge change; deferred to Phase 34 (repo-first then live). The label is live
on `thinx_couchdb`. Recorded under Phase 34: change it to `https-redirect` only in BOTH `docker-swarm.yml` and
thinx-swarm `thinx.yml`, apply live with `--label-add`, gated by the router-inventory check.
**Original issue:** `thinx-db-http.middlewares=couch-auth,https-redirect` answers 401 Basic on `http://` before the
redirect, so the Authorization header travels in cleartext over `:80`.

---

_Fixed: 2026-10-09T10:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
