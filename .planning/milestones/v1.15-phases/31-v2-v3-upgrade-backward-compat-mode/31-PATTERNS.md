# Phase 31: v2→v3 Upgrade (backward-compat mode) - Pattern Map

**Mapped:** 2026-10-07
**Files analyzed:** 8 (all config / runbook / generated-mirror — no app-code files)
**Analogs found:** 8 / 8 (all map to Phase 29/30 precedent; none has a code-level analog beyond those precedents)

> **Nature of this phase (read first).** This is an infrastructure / config-migration phase, not an
> app-code phase. Every file below is YAML/TOML edge config, a generated mirror, a `swarm-configs/*`
> snapshot pair, or a runbook. There is **no controller/service/component/model** to copy from. The
> "analogs" are therefore the Phase 29/30 edge-reconciliation and syntax-migration artifacts that
> established the exact conventions P31 must follow: the dated `swarm-configs/*.pre/*.post` snapshot
> pattern, the out-of-git-600 rollback-snapshot discipline on `micro`, the `generate → check` mirror
> anti-drift spine, and the `ssh micro "docker service inspect …"` + `# expect:` verify-command style.
> Where a file genuinely has no analog beyond that precedent, this is stated plainly rather than
> inventing one.

**Tracked-source gate (#3645):** every analog path named below was verified `git ls-files`-tracked on
branch `thinx-staging`. The external edge source of truth (`~/Repositories/thinx-swarm/traefik.yml`,
`traefik/tls.toml`, `thinx.yml`, sibling stacks) lives in a **separate repo** — edits land there and
flow into this repo only through the generated, banner-stamped mirror. `docker-compose.traefik.yml`
is that generated mirror and must **never** be hand-edited (regenerate via
`scripts/generate-traefik-mirror.js`; CI gate `scripts/check-traefik-mirror.js` must print `MIRROR OK`).

## File Classification

| New/Modified File | Repo | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `~/Repositories/thinx-swarm/traefik.yml` (MODIFY — static command: swarm-provider delta + BC switch + own `traefik.swarm.network` label) | thinx-swarm (external) | config | transform | the v2 static command captured in `.planning/runbooks/swarm-configs/traefik-edge.B.post.yml` + rollback-demo Args blocks | role+flow match (version-delta of the same file) |
| `~/Repositories/thinx-swarm/traefik/tls.toml` (CARRY byte-identical — no forced v3 change) | thinx-swarm (external) | config | transform | itself at v2.11 (per RESEARCH §TLS options — no change to boot v3) | zero-diff carry (no analog needed) |
| `~/Repositories/thinx-swarm/thinx.yml` + siblings `landing.yml`/`errorpage.yml`/`downtime.yml`/`swarmpit.yml` (MODIFY — `@docker`→`@swarm` middleware refs, `traefik.docker.network`→`traefik.swarm.network` labels) | thinx-swarm (external) | config | transform | the `@docker` reference + `traefik.docker.network` inventory in `.planning/runbooks/swarm-configs/traefik-edge.A.pre.yml:117-130` (live capture) | role+flow match |
| `docker-swarm.yml` (this repo — MODIFY same `@docker`→`@swarm` + network-label renames IF confirmed live thinx-stack source) | thinx-device-api | config | transform | its own current `sslheaders@docker,security-headers@docker` label block at lines 349, 371-379, 430 | exact (same file, label-namespace delta) |
| `docker-compose.traefik.yml` (this repo — REGENERATE, never hand-edit) | thinx-device-api | config (generated mirror) | transform | `scripts/generate-traefik-mirror.js` output + `scripts/check-traefik-mirror.js` gate (banner + `mirror-sha256`) | exact (the generator is the only writer) |
| `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml` + `.C.post.yml` (NEW committed snapshot pair for the v3 cutover) | thinx-device-api | config snapshot (audit) | request-response (live capture) | `traefik-edge.B.pre.yml` / `.B.post.yml` (P30 cutover pair) | exact |
| `.planning/runbooks/<v3-cutover + boot-and-discover + rollback>.md` (NEW runbook) | thinx-device-api | runbook (audit, non-executable) | request-response (verify commands) | `.planning/runbooks/swarm-configs/traefik-edge.B.rollback-demo.md` (P30 live rollback demo) | exact (same cutover+rollback discipline) |
| fresh out-of-git 600 snapshot `/mnt/data/edge-rollback/traefik-<date>/` on `micro` (NOT committed — resolved config + `acme.json`) | micro host (off-repo) | rollback snapshot | file-I/O | the P30 `/mnt/data/edge-rollback/traefik-2026-10-06/` snapshot (rollback-demo §Out-of-git snapshot discipline) | exact |

## Pattern Assignments

### `~/Repositories/thinx-swarm/traefik.yml` (config, transform) — the forced static delta

**Analog:** the resolved v2 static command preserved in
`.planning/runbooks/swarm-configs/traefik-edge.B.post.yml` and reproduced verbatim in the
rollback-demo "Final (P30 end state) running Args" block
(`traefik-edge.B.rollback-demo.md:155-173`). That 17-flag block is the exact pre-image to transform.

**Pattern to copy — the v2 command block being edited** (from `traefik-edge.B.rollback-demo.md:156-172`):
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

**Forced transform** (RESEARCH §Forced Static-Config Delta, rows 1-6 — apply ONLY these; D-04
"minimum-to-boot"):
- Remove `--providers.docker` and `--providers.docker.swarmmode` (v3 rejects `swarmmode` and fails to start).
- Add `--providers.swarm` (enables the swarm provider).
- Rename `--providers.docker.constraints=Label(...)` → `--providers.swarm.constraints=Label(...)` (keep the backtick-bearing `Label(\`traefik.constraint-label\`, \`traefik-public\`)` value byte-identical).
- Rename `--providers.docker.exposedbydefault=true` → `--providers.swarm.exposedbydefault=true` (value STAYS `true` — P33 defers the tightening; match the repo's lowercase style).
- Add `--core.defaultRuleSyntax=v2` (the BC switch, CLI form to match the `command:` block style).
- Do **NOT** add a `--providers.swarm.endpoint=tcp://…:2377` (RESEARCH Pitfall 2 — breaks socket-mounted routing; the default `unix:///var/run/docker.sock` matches the existing `docker.sock:ro` mount).

**Unchanged / carry byte-identical** (RESEARCH rows 7-10): all six `--entrypoints.*.address` lines
(incl. `--entrypoints.thxp.address=:7442` and the vestigial `vpn`/`mqtt`/`mqtts` with their P30 D-03
annotation comments), all three `--certificatesresolvers.le.acme.*` lines, `--accesslog`/`--log`/
`--log.level=ERROR`, and `--api`.

**Service's own network label** (RESEARCH line 183-185): `traefik.docker.network=traefik-public`
(thinx-swarm/traefik.yml:27) → `traefik.swarm.network=traefik-public`.

**Secret hygiene (P29 D-12):** `${EMAIL}`, `${USERNAME}`, `${HASHED_PASSWORD}`, `${DOMAIN}`,
`${CONFIG}` stay templated — no resolved values in the committed file.

---

### App-stack files — `@docker`→`@swarm` blast radius (config, transform)

**Analog:** the live `@docker` reference inventory captured in
`.planning/runbooks/swarm-configs/traefik-edge.A.pre.yml:117-130` (authoritative live capture), and in
this repo the concrete label block in `docker-swarm.yml`.

**Pattern to copy — the label block to rename** (this repo `docker-swarm.yml:349` + :430, per RESEARCH
lines 238-239):
```
# thinx_api router middleware labels (line ~349):
sslheaders@docker,security-headers@docker   →   sslheaders@swarm,security-headers@swarm
# thinx_console / thinx_vue (line ~430):
security-headers@docker                      →   security-headers@swarm
# every traefik-enabled service deploy label:
traefik.docker.network=traefik-public        →   traefik.swarm.network=traefik-public
```

**Live reference set to rename** (RESEARCH §Edge-Wide Label Blast Radius, verified from
`traefik-edge.A.pre.yml:117-130`):

| Live service | Routers | `@docker` → `@swarm` |
|--------------|---------|----------------------|
| `thinx_api` | `thinx-api-http/https/ws` | `sslheaders@docker`, `security-headers@docker` |
| `thinx_console` | `thinx-console-http/https` | `security-headers@docker` |
| `thinx_vue` | `thinx-vue-console-http/https` | `security-headers@docker` |

`traefik.docker.network` → `traefik.swarm.network` lines to rename (RESEARCH lines 213-223):
`thinx.yml` (44,100,229,296,345,413,457), `landing.yml:36`, `errorpage.yml:20`, `downtime.yml:20`,
`swarmpit.yml:28`, `traefik.yml:27`; `vault.yml:35` not deployed (carry harmlessly or skip).

**CRITICAL open question the planner must resolve first** (RESEARCH §CRITICAL open question + Open
Question 1): `restart.sh`/`thinx.sh` deploy `thinx-swarm/thinx.yml`, but that file is **stale** vs
production (only `sslheaders@docker` at :254, no `thinx-api-ws` router, no `security-headers@docker`);
the live-matching definitions are this repo's `docker-swarm.yml`. Resolve via
`ssh micro "docker service inspect thinx_api thinx_console thinx_vue"` and rename the complete
`@docker` set in whatever file is confirmed authoritative — otherwise a subset of routers breaks at
cutover (RESEARCH Pitfall 5).

**Why forced, not deferrable:** a router referencing a now-dangling `@docker` middleware goes to
error state and stops serving (outage for app/console/vue). `sslheaders@docker` injects
`X-Forwarded-Proto=https` (SEC-PROXY-01 comment, `docker-swarm.yml:363-366`) which gates `Secure`
session cookies + the WebSocket upgrade — losing it is a functional regression.

---

### `docker-compose.traefik.yml` (config, generated mirror) — REGENERATE, never hand-edit

**Analog:** `scripts/generate-traefik-mirror.js` (the only writer) + `scripts/check-traefik-mirror.js`
(the CI anti-drift gate). This is an exact, enforced pattern — not discipline.

**Pattern (the gate contract, from `check-traefik-mirror.js:12-14, 47-51`):** the mirror's canonical
two-line banner is:
```
# GENERATED — do not edit. source: thinx-swarm@<40-hex-sha> generated:<ISO-UTC> by scripts/generate-traefik-mirror.js
# mirror-sha256:<sha256 of the body below the header>
```

**Sequencing (RESEARCH Pitfall 4; CONTEXT D-04 discretion #3):** edit `thinx-swarm/traefik.yml` only →
run `node scripts/generate-traefik-mirror.js` → run `node scripts/check-traefik-mirror.js --swarm-repo
~/Repositories/thinx-swarm` and confirm it prints `MIRROR OK files=1` (exit 0). Hand-editing the
mirror yields `MIRROR-EDITED`; editing thinx-swarm without regenerating yields `MIRROR-STALE`. The P29
precedent (`traefik-edge-diff.2026-10-06.md:79-80`) is the pattern to mirror: "Mirror regenerated from
the reconciled thinx-swarm SHA …; check-traefik-mirror.js → MIRROR OK (exit 0)."

---

### `swarm-configs/traefik-edge.C.pre.yml` + `.C.post.yml` (config snapshot, audit)

**Analog:** `traefik-edge.B.pre.yml` / `traefik-edge.B.post.yml` (the committed P30 cutover pair) and
the `swarm-configs/README.md` naming + redaction rules.

**Pattern to copy** (`swarm-configs/README.md:16-18, 39`): per-step `<name>.<step>.{pre,post}.yml`
pairs captured from `docker service inspect` before/after the edit; **every secret value replaced by
literal `<redacted>`**, `${VAR}` kept templated, otherwise bit-exact so `diff` parity holds. P31 is the
next step letter (`.C`) in the `traefik-edge.*` series. The `.A`/`.B` files are byte-for-byte resolved
captures of the live static command + labels + mounts + tls.toml body — copy that structure.

---

### v3-cutover / boot-and-discover / rollback runbook (runbook, audit — non-executable)

**Analog:** `.planning/runbooks/swarm-configs/traefik-edge.B.rollback-demo.md` — the P30 live
rollback+restore record. It is the exact template for P31's runbook: same `ssh micro "…"` +
`# expect:` convention, same out-of-git-snapshot discipline, same "non-executable audit record, not a
script" header, same per-stage verify tables.

**Verify-command patterns to reuse** (all from the rollback-demo):

1. **Snapshot pre-check** (`:52-57`):
```
ssh micro "stat -c '%a %U' /mnt/data/edge-rollback/traefik-<date>/acme.json"   # expect: 600 root
ssh micro "ls -la /mnt/data/edge-rollback/traefik-<date>/"                      # expect: dir 700 root; acme.json 600 root, resolved-snapshot.yml 600 root
```

2. **Full-spec backup before mutation** (`:43-46`):
```
ssh micro "docker service inspect traefik_traefik > /mnt/data/edge-rollback/traefik-p31-precutover-<UTC>.json; chmod 600 …"
# expect: 600 root, out-of-git on micro (never committed / never scp'd into a repo)
```

3. **Edge HTTP/TLS/device verify matrix** (`:112-134`, reuse verbatim for D-05 re-verification):
```
ssh micro "curl -sS -o /dev/null -w '%{http_code}' https://<host>/"                        # expect 200 (app/console/rtm/landing)
ssh micro "curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' http://<host>/"         # expect 301 → https (console/rtm/thinx.cloud); app = 200 by design
ssh micro "echo | openssl s_client -connect app.thinx.cloud:443 -servername app.thinx.cloud | openssl x509 -noout -checkend 0"  # expect valid
ssh micro "timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/<port>'"                          # :7442 / :1883 / :8883 expect OPEN
```

4. **Entrypoint + device-publish + single-task assertions** (`:104, 174, 187-198`):
```
# expect: --entrypoints.thxp.address=:7442 present; running traefik task count = exactly 1
# thinx_api publishes :7442 ; thinx_mosquitto publishes :1883/:8883
# CAVEAT (carried from 30-01): use --filter name=thinx_mosquitto (prefix-match), not name=mosquitto
```

5. **D-01 boot-and-discover assertion** (NEW to P31, no P30 analog — from RESEARCH §Phase 1 lines
   308-327; this is the one genuinely new verify pattern, built on the same `docker exec` discipline):
```
docker exec <test-task> wget -qO- http://localhost:8080/api/http/routers \
  | jq -r '.[] | select(.status!="enabled") | .name + "  " + .status'
# MUST print nothing. Any line = a router v3 could not enable (likely an @docker dangling ref) -> fix before cutover.
```
   Compare the discovered router set against the expected list in `traefik-edge.A.pre.yml:117-157`
   (RESEARCH line 316-321): `thinx-api-http/https/ws`, `thinx-console-http/https`,
   `thinx-vue-console-http/https`, `landing-page-http/https`, `error-router`, `swarmpit-http/https`,
   `downtime-http/https`, `traefik-public-http/https`, `fotostim_landing-com/-cz`, `igraczech-com_web`,
   `syxra-cz_web`, TCP `mosquitto-secure`.

6. **Rollback mechanics** (`:67-73, 142-151` — the `--args` revert + `acme.json` restore pattern):
```
ssh micro "cp -a /mnt/data/edge-rollback/traefik-<date>/acme.json \
  /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"   # restore certs 600 root first
ssh micro "docker service update --image traefik:v2.11.0 --args '<17 v2 flags, no --providers.swarm>' traefik_traefik"
# plus revert the app-stack @swarm labels → @docker in the same rollback (RESEARCH :359-362)
```

---

### Fresh out-of-git 600 rollback snapshot on `micro` (rollback snapshot, off-repo — NOT committed)

**Analog:** the P30 `/mnt/data/edge-rollback/traefik-2026-10-06/` snapshot, documented in
`traefik-edge.B.rollback-demo.md:202-217` (§Out-of-git snapshot discipline).

**Pattern:** capture a fresh pre-cutover snapshot next to the P30 one — a 600-root copy of `acme.json`
+ `resolved-snapshot.yml` (resolved static command/labels/env/tls.toml), dir 700 root. It holds real
resolved secrets (ACME email, `admin-auth` hash, raw `acme.json` key material) and is **never**
committed and **never** scp'd into any repo — the committed runbook references it by path only. This is
the D-02 staged-ready rollback target; `acme.json` round-trips v2↔v3 (RESEARCH §Rollback Safety), and
restoring from the snapshot beats trusting v3's in-place writes (prevents the Let's Encrypt
duplicate-cert rate limit on rollback — RESEARCH Pitfall 3).

## Shared Patterns

### Anti-drift mirror spine
**Source:** `scripts/generate-traefik-mirror.js` + `scripts/check-traefik-mirror.js`
**Apply to:** any edit to `thinx-swarm/traefik.yml`. Edit source → regenerate → `MIRROR OK`. Never
hand-edit `docker-compose.traefik.yml`. Enforced by the CircleCI staleness gate.

### Out-of-git 600 snapshot discipline
**Source:** `traefik-edge.B.rollback-demo.md:202-217`; `swarm-configs/README.md:39`
**Apply to:** the D-02 rollback snapshot. Real secrets live only in 600-root files on `micro`, never
committed. Committed `swarm-configs/*.yml` snapshots carry `<redacted>` for every secret, `${VAR}`
templated, otherwise bit-exact.

### `ssh micro "…"` + `# expect:` verify convention
**Source:** `.planning/runbooks/swarm.md` §Traefik Edge; `traefik-edge.B.rollback-demo.md` throughout
**Apply to:** the P31 cutover runbook and the human-verify gate (D-05 device-path re-verification).
Call the `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020` form literally on the executor (micro-ssh
memory); Traefik placement floats — query the node, don't trust `docker service ls` under load.

### Secret hygiene (P29 D-12)
**Source:** `traefik-edge-diff.2026-10-06.md:23,28` (templated `${EMAIL}`, redacted hash)
**Apply to:** every committed P31 artifact (traefik.yml edit, mirror, `.C` snapshots, runbook). No
cleartext creds / hashes / key material.

## No Analog Found

No file in this phase lacks a precedent — but two items have **no app-code or pre-v3 config analog**
and rest solely on RESEARCH + official v3 docs:

| Item | Role | Why no analog |
|------|------|---------------|
| `--providers.swarm` provider block + `--core.defaultRuleSyntax=v2` | config | First v3 config in the repo; no existing swarm-provider or BC-switch usage to copy. Follow RESEARCH §Forced Static-Config Delta + the swarm-provider option table (defaults verified against doc.traefik.io v3.4 reference). |
| D-01 boot-and-discover `/api/http/routers` status-gate | runbook verify | No prior throwaway-no-host-port discovery test in the P29/P30 record; the `docker exec … wget … | jq` status filter is new to P31 (RESEARCH lines 308-327), though it reuses the P30 `docker exec` + `# expect:` discipline. |

## Metadata

**Analog search scope:** `.planning/runbooks/`, `.planning/runbooks/swarm-configs/`, `scripts/`,
`docker-swarm.yml`, `docker-compose.traefik.yml`, `services/traefik/`, Phase 29/30 CONTEXT.
**Files scanned:** ~12 (all git-tracked on `thinx-staging`; external thinx-swarm source referenced by
RESEARCH line citations).
**Pattern extraction date:** 2026-10-07

## PATTERN MAPPING COMPLETE
</content>
</invoke>
