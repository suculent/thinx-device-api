# Phase 32: v3 Native Syntax & BC Removal - Pattern Map

**Mapped:** 2026-10-08
**Files analyzed:** 13 (4 thinx-swarm stack files, 2 this-repo stack/mirror files, 2 new captures, 2 runbook docs, 3 plan artifacts; plus 2 scripts invoked-not-edited)
**Analogs found:** 13 / 13 (every file has a Phase 31 or swarm-configs analog; nothing in this phase is application code)

All analog paths below are git-tracked (`git ls-files` verified in both repos; no `.gsd/` mirrors involved). Paths under `~/Repositories/thinx-swarm` are tracked in that sibling repo (master `677e3a9`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `~/Repositories/thinx-swarm/thinx.yml` (line 306 WS rule; Stage 1 adds a `ruleSyntax=v3` line; Stage 3 removes it) | config (swarm stack deploy labels) | transform (label edit) | itself, `thinx.yml:299-312` — and this repo's `docker-swarm.yml:371-384` which must stay identical | exact |
| `docker-swarm.yml` (this repo, line 378 WS rule; same two-step edit) | config (swarm stack deploy labels) | transform | `~/Repositories/thinx-swarm/thinx.yml:306-312` (byte-identical block) | exact |
| `~/Repositories/thinx-swarm/downtime.yml` (lines 23, 28 catch-all rules; `ruleSyntax` add/remove) | config | transform | `~/Repositories/thinx-swarm/errorpage.yml:23-26` (same catch-all label shape, unquoted list items) | exact |
| `~/Repositories/thinx-swarm/errorpage.yml` (line 23 catch-all rule; `ruleSyntax` add/remove) | config | transform | `~/Repositories/thinx-swarm/downtime.yml:23-32` | exact |
| `~/Repositories/thinx-swarm/traefik.yml` (lines 106-108: delete the switch + rewrite its comment) | config (static command) | transform | itself `traefik.yml:100-110`; Phase 31 forced-delta record in runbook §"Converted config" (`traefik-v3-cutover.md:162-221`) | exact |
| `docker-compose.traefik.yml` (regenerated, never hand-edited) | config (generated mirror) | transform (generated) | `scripts/generate-traefik-mirror.js` output; `docker-compose.traefik.yml:1-2` banner | exact |
| `.planning/runbooks/swarm-configs/traefik-edge.D.pre.yml` (new) | doc (redacted live capture) | file-I/O (ssh inspect → sed redact → commit) | `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml` (128 lines) | exact |
| `.planning/runbooks/swarm-configs/traefik-edge.D.post.yml` (new) | doc (redacted live capture) | file-I/O | `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml` (164 lines) | exact |
| `.planning/runbooks/swarm-configs/README.md` (append the `D` step to the naming list) | doc | — | itself `README.md:14-22` (per-step pattern bullets) | exact |
| `.planning/runbooks/traefik-v3-cutover.md` (append §Phase 32 probe record, Stage 1/2/3 record, re-verify matrix) | doc (runbook) | — | itself §Boot-and-discover (`:225-374`), §Live cutover record (`:659-770`) | exact |
| `32-01..NN-PLAN.md` (plan files the planner writes) | plan | — | `31-01-PLAN.md` (probe + repo edits), `31-03-PLAN.md` (live mutation + gates + `<precondition>`) | exact |
| `scripts/generate-traefik-mirror.js`, `scripts/check-traefik-mirror.js` | utility (invoked, NOT edited) | file-I/O | — (used as-is, `package.json:25-26`) | n/a |
| Live swarm services `thinx_api`, `downtime_downtime`, `errorpage_errorpage`, `traefik_traefik` (not files; mutated by `docker service update`) | runtime config | request-response (ssh) | runbook §Cutover mechanism table (`traefik-v3-cutover.md:126-135`) and 31-03 timeline (`:676-704`) | exact |

## Pattern Assignments

### `~/Repositories/thinx-swarm/thinx.yml` + `docker-swarm.yml` (config, label edit — the `thinx-api-ws` router)

**Analog:** the block itself. Both files carry the identical 7-line router block; `docker-swarm.yml` is the authoritative copy (CONTEXT canonical refs) and the only permitted diff between the two files is the 3 SEC-CFG-04 secret attachments.

**Current block** (`docker-swarm.yml:375-384`; `thinx.yml:303-312` is byte-identical):
```yaml
        # Direct WSS router: rtm.thinx.cloud WebSocket upgrades go straight to the API (bypasses nginx).
        # priority 200 beats the console router so WS upgrades reach the API; sslheaders (no Upgrade strip) preserves the handshake.
        # Reproduces the live thinx-api-ws router so a `docker stack deploy` does not silently drop it.
        - "traefik.http.routers.thinx-api-ws.rule=Host(`rtm.thinx.cloud`) && HeadersRegexp(`Upgrade`, `(?i)websocket`)"
        - "traefik.http.routers.thinx-api-ws.entrypoints=https"
        - "traefik.http.routers.thinx-api-ws.priority=200"
        - "traefik.http.routers.thinx-api-ws.service=thinx-api"
        - "traefik.http.routers.thinx-api-ws.middlewares=sslheaders@swarm"
        - "traefik.http.routers.thinx-api-ws.tls=true"
        - "traefik.http.routers.thinx-api-ws.tls.certresolver=le"
```

**Edit pattern (Stage 1):** change ONE token on line 378/306 (`HeadersRegexp` → `HeaderRegexp`), keep the backticks and `(?i)websocket` byte-exact, and insert the override line directly after the rule line, in the same double-quoted list-item style this file uses:
```yaml
        - "traefik.http.routers.thinx-api-ws.rule=Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)"
        - "traefik.http.routers.thinx-api-ws.ruleSyntax=v3"
```
**Edit pattern (Stage 3):** delete only the `ruleSyntax` line. **Comment pattern:** extend the 3-line comment above the block with a Phase 32 sentence, following the Phase 31 precedent already in this file (`docker-swarm.yml:368-371`, "Phase 31 (EDGE-MIG-02): the suffix is @swarm because …") — i.e. `# Phase 32 (EDGE-MIG-03): HeaderRegexp is the v3 name of v2's HeadersRegexp (rename only; unanchored, (?i) kept for legacy `Upgrade: WebSocket` clients).`

**Parity check idiom** (31-03-SUMMARY D8, re-usable verbatim): `diff <(sed -n '371,384p' docker-swarm.yml) <(sed -n '299,312p' ~/Repositories/thinx-swarm/thinx.yml)` → empty; plus `grep -c HeadersRegexp docker-swarm.yml ~/Repositories/thinx-swarm/thinx.yml` → `0` after Stage 1.

---

### `~/Repositories/thinx-swarm/downtime.yml` + `errorpage.yml` (config, label edit — the three catch-alls)

**Analog:** each other. Both use the UNquoted list-item style (no double quotes), unlike `thinx.yml`. Preserve each file's own style.

**Current `downtime.yml:23-32`** (note the trailing space after `priority=2 ` on lines 24 and 29 — YAML strips it, live value is `2`; leave those lines untouched so the diff stays minimal):
```yaml
        - traefik.http.routers.downtime-http.rule=HostRegexp(`{host:.+}`)
        - traefik.http.routers.downtime-http.priority=2 
        - traefik.http.routers.downtime-http.entrypoints=http
        
        - traefik.http.routers.downtime-http.middlewares=https-redirect
        - traefik.http.routers.downtime-https.rule=HostRegexp(`{host:.+}`)
        - traefik.http.routers.downtime-https.priority=2 
        - traefik.http.routers.downtime-https.entrypoints=https
        - traefik.http.routers.downtime-https.tls=true
        - traefik.http.routers.downtime-https.tls.certresolver=le
```

**Current `errorpage.yml:23-26`:**
```yaml
        - traefik.http.routers.error-router.rule=HostRegexp(`{host:.+}`)
        - traefik.http.routers.error-router.priority=1
        - traefik.http.routers.error-router.entrypoints=http
        - traefik.http.routers.error-router.middlewares=error-pages-middleware
```

**Edit pattern (Stage 1), per router — rule line replaced, override line inserted right below it:**
```yaml
        - traefik.http.routers.error-router.rule=PathPrefix(`/`)
        - traefik.http.routers.error-router.ruleSyntax=v3
```
Same for `downtime-http` (line 23) and `downtime-https` (line 28). Priorities stay `1` / `2` (RESEARCH §Q1 D-07: explicit priority labels are used verbatim in v3; rule length is irrelevant). **Stage 3:** delete the three `ruleSyntax` lines only. Add a one-line comment above each rule (`# Phase 32 (EDGE-MIG-03): v3 catch-all; PathPrefix(`/`) replaces the v2-only HostRegexp(`{host:.+}`) — also answers hostless/bare-IP requests (D-06).`), mirroring the comment-above-label convention at `downtime.yml:17`.

---

### `~/Repositories/thinx-swarm/traefik.yml` (config, static command — remove the BC switch)

**Analog:** the Phase 31 forced-delta edit of the same lines, recorded in `traefik-v3-cutover.md:162-221` ("Converted config + mirror regeneration"), and the live-order annotated copy in `traefik-edge.C.post.yml:24-41`.

**Current `traefik.yml:100-110` (line 108 is the flag):**
```yaml
      - --providers.swarm
      # Add a constraint to only use services with the label "traefik.constraint-label=traefik-public"
      - --providers.swarm.constraints=Label(`traefik.constraint-label`, `traefik-public`)
      # Expose every constraint-matching service by default (P30 D-05: audit deferred to Phase 33)
      - --providers.swarm.exposedbydefault=true
      # Backward-compat switch (official three-phase rollout, phase 3 deferred): router rules keep
      # the v2 matcher syntax until Phase 32 (EDGE-MIG-03) converts them natively.
      - --core.defaultRuleSyntax=v2
      # Create an entrypoint "http" listening on port 80
      - --entrypoints.http.address=:80
```

**Edit pattern (Stage 2):** delete line 108 and REWRITE (not delete) the two comment lines 106-107 so the next reader sees why the flag is gone — the file's convention is "comment records the phase + requirement that changed the line" (see `traefik.yml:95-100` Phase 31 block). Avoid leaving the literal token `core.defaultRuleSyntax` in the comment, or the `grep -c core.defaultRuleSyntax docker-compose.traefik.yml` gate must be written as `grep -c '^ *- --core.defaultRuleSyntax'` (RESEARCH Pitfall 8). Suggested replacement:
```yaml
      # Phase 32 (EDGE-MIG-03): the v2 rule-syntax backward-compat switch was removed here after the
      # four v2-only router rules (thinx-api-ws, downtime-http/https, error-router) were converted to v3.
```
Flag count drops 17 → 16; nothing else in the command moves (the `${EMAIL}` flag shifts from index 10 to 9 — all tooling reads args by content, RESEARCH A5).

**Live mirror of this edit:** `docker service update --detach --args "<16 flags>" traefik_traefik`, args rebuilt on micro via the `jq 'map(@sh)'` idiom (31-03 timeline `traefik-v3-cutover.md:685`, "args rebuilt on micro from the 600-root backup, indexes 0-3 rewritten"), dry-printed and diffed index-exact against the 16 `- --` lines of the regenerated mirror BEFORE firing (`:684` "dry-printed rebuilt args index-exact 17/17 vs docker-compose.traefik.yml (email masked)").

---

### `docker-compose.traefik.yml` (generated mirror)

**Analog:** its own banner and the Phase 31 regeneration record (`traefik-v3-cutover.md:203-215`).

**Banner (lines 1-2, written by the generator — never typed by hand):**
```yaml
# GENERATED — do not edit. source: thinx-swarm@677e3a9350e68c1bac203c1ae472c1fd7f99cfd1 generated:2026-10-08T11:26:00Z by scripts/generate-traefik-mirror.js
# mirror-sha256:14fefbc49887505ab8b23aedc325f4c5ed8a61a45ca960bd220bd2f5d857af57
```

**Regeneration idiom (run after EVERY thinx-swarm commit — a `thinx.yml`-only commit also makes it `MIRROR-STALE`, `scripts/check-traefik-mirror.js:22-23` "Freshness mode … must equal the banner's source SHA"):**
```bash
node scripts/generate-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm" && node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"
# expect: MIRROR-GENERATED ok source=thinx-swarm@<new 40-hex sha> -> docker-compose.traefik.yml ; MIRROR OK files=1
grep -c '^ *- --' docker-compose.traefik.yml      # expect: 17 after Stage-1 commits, 16 after the Stage-2 commit
```
Package aliases: `npm run generate:traefik-mirror` / `npm run check:traefik-mirror` (`package.json:25-26`); CI gate `Traefik mirror staleness (EDGE-RECON-01)` runs integrity-only (`.circleci/config.yml:680`). Commit the mirror together with `docker-swarm.yml` in this repo per stage (31-01 precedent: one commit per stage carrying converted source + mirror).

---

### `.planning/runbooks/swarm-configs/traefik-edge.D.pre.yml` / `D.post.yml` (redacted live captures)

**Analog:** `traefik-edge.C.pre.yml` (128 lines) and `traefik-edge.C.post.yml` (164 lines) — copy the structure verbatim and change only the values/annotations. `C.post.yml` is immutable (Phase 31 record); `D.pre.yml` should body-diff empty against `C.post.yml` except header timestamps/index lines.

**Header pattern** (`C.post.yml:1-13`) — phase/decision tag, capture timestamp, "read-only", redaction statement, the delta list vs the paired twin, the out-of-git rollback pair by path only:
```yaml
# Phase 31 (EDGE-MIG-02 / D-03, D-04) — live Traefik edge snapshot captured 2026-10-07 22:09:51 UTC from micro
# (swarm manager), read-only. AUTHORITATIVE SOURCE = running task state (P30 D-08).
# Redacted + NOT executable per swarm-configs/README (secrets -> literal <redacted>, ${VAR} kept
# templated, otherwise bit-faithful so a `diff` against the paired traefik-edge.C.pre.yml works).
# Redaction was applied ON micro (sed over the inspect output) before anything was read off the host.
# Live traefik image: traefik:v3.7.14 (exact tag, D-03; resolved digest recorded below as a comment only).
# STEP C POST v2.11 -> v3.7.14 cutover (Plan 31-03 Task 2, B1 22:04:47Z -> B2 22:04:57Z -> C 22:06:39Z UTC).
# Delta vs traefik-edge.C.pre.yml, exactly as predicted there: image, the 4 provider flags -> 4 (providers.swarm x3 +
# core.defaultRuleSyntax=v2; count unchanged at 17), and the network label KEY (traefik.swarm.network, the
# traefik.docker.network key removed by B1). ...
#   micro:/mnt/data/edge-rollback/traefik-2026-10-07/{acme.json,resolved-snapshot.yml}  (dir 700 root)
#   micro:/mnt/data/edge-rollback/traefik-p31-precutover-20261007T203816Z.json          (full docker service inspect)
```
For `D.post.yml` the delta line becomes: "one flag removed (`--core.defaultRuleSyntax=v2`; 17 → 16), four router rules converted on thinx_api / downtime_downtime / errorpage_errorpage, zero `ruleSyntax` labels at end state".

**Command block pattern** (`C.post.yml:24-41`) — live order, one flag per line, per-flag annotation comment, `${EMAIL}` templated:
```yaml
  command:
    - --providers.swarm                                   # was --providers.docker (v3 split provider)
    - --providers.swarm.constraints=Label(`traefik.constraint-label`, `traefik-public`)   # value byte-identical, backticks intact
    - --providers.swarm.exposedbydefault=true             # WART -> fix-forward P33 (value stays true, namespace moved)
    - --core.defaultRuleSyntax=v2                         # BC switch (D-04): v2 rule syntax until P32 converts natively
    - --entrypoints.http.address=:80
    ...
    - --certificatesresolvers.le.acme.email=${EMAIL}      # live resolves to a real operator address; kept templated in git (D-10)
```
In `D.post.yml` the `--core.defaultRuleSyntax=v2` line is absent (do not leave a placeholder; the annotated absence goes in the header delta).

**Labels pattern** (`C.post.yml:62-66`) — hash redacted, `${DOMAIN}`/`${USERNAME}` templated:
```yaml
  labels:
    traefik.enable: "true"
    traefik.swarm.network: traefik-public                # v3 swarm-provider key (Stage A added it; B1 removed traefik.docker.network)
    traefik.constraint-label: traefik-public
    traefik.http.middlewares.admin-auth.basicauth.users: ${USERNAME}:<redacted>   # apr1 hash redacted (D-10); unchanged by the hop
    ...
    traefik.http.routers.traefik-public-http.rule: Host(`${DOMAIN}`)
```

**App-stack section pattern** (`C.post.yml:95-110`) — this is where the four converted router rules belong in `D.post.yml`:
```yaml
app_stack_labels_post_cutover:
  thinx_api:
    traefik.http.routers.thinx-api-https.middlewares: sslheaders@swarm,security-headers@swarm   # was …@docker
    traefik.http.routers.thinx-api-ws.middlewares: sslheaders@swarm                              # was sslheaders@docker
    traefik.swarm.network: traefik-public                                                        # traefik.docker.network removed (Stage C)
  ...
  all_16_traefik_enabled_services:
    traefik.swarm.network: traefik-public     # 16/16 present
    traefik.docker.network: ABSENT            # 0/16 — see the Stage A correction in traefik-v3-cutover.md
```
`D.post.yml` equivalent: `thinx_api: traefik.http.routers.thinx-api-ws.rule: Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)   # was HeadersRegexp`, `downtime_downtime` two rules `PathPrefix(`/`)   # was HostRegexp(`{host:.+}`)`, `errorpage_errorpage` one, and `ruleSyntax labels: ABSENT  # 0/4 after Stage 3`.

**Continuity + discovery footer pattern** (`C.post.yml:133-141`, `:158-164`) — `acme_json` stat pre/post + blob counts; discovered-state comment with router/service/middleware counts and "Every router status==enabled". `D.post.yml` adds the two new behavioural results next to it: bare-IP `301`/`200` and the `--http1.1` WS probe `401` + `X-Forwarded-Proto: https` (RESEARCH §Q3).

**Secret-marker gate before commit** (`31-03-PLAN.md:173`, reuse verbatim with the new filename):
```bash
test -f .planning/runbooks/swarm-configs/traefik-edge.D.post.yml && test "$(grep -Ec '\$apr1\$|\$2[aby]\$|BEGIN |PRIVATE KEY' .planning/runbooks/swarm-configs/traefik-edge.D.post.yml)" -eq 0
```
plus the e-mail regex → 0 (31-03-SUMMARY D7).

---

### `.planning/runbooks/swarm-configs/README.md` (append the D step)

**Analog:** its own per-step bullets at `README.md:14-22` and the Phase 31 persistence paragraph at `:38`.
```markdown
Swarm stack files and the config files they bind-mount use a per-step pattern:

- `swarmpit-stack.<step>.{pre,post}.yml` — the Swarmpit stack file (...) captured before and after each Phase 28 step. Steps: `0` (...), `A` (stats trim), `B` (1.10 upgrade).
```
Add one bullet naming `traefik-edge.<step>.{pre,post}.yml` steps `A`/`B` (Phase 30), `C` (Phase 31 v3 hop), `D` (Phase 32 native-v3 rules + switch removal). The `${VAR}` rule at `:38` already covers Traefik captures — no change there.

---

### `.planning/runbooks/traefik-v3-cutover.md` (append the Phase 32 sections)

**Analog:** the runbook's own section skeleton. Each live-mutation phase appended: a probe section, a mechanism/stage table, a timeline table, a re-verify matrix, and a hand-off state.

**Section heading pattern** (`traefik-v3-cutover.md:225,267,343,659,676,707,761`):
```markdown
## Boot-and-discover (31-01 Task 3, D-01 tracer, 2026-10-07 ~20:20 UTC)
### Probe invocation (throwaway, no host ports, ACME neutralized — D-01a / T-31-02)
### Discovery — the gate
### Teardown + no-side-effect checks
## Live cutover record (31-03 Task 2, 2026-10-07 21:53 - 22:11 UTC)
### Timeline (UTC, 2026-10-07)
### Re-verify matrix (22:07:57Z, live v3.7.14) vs v2.11 baseline (21:52Z)
### Live production state at hand-off (for the Task 3 human-verify gate)
```
Phase 32 appends `## Native v3 rules + BC-switch removal (Phase 32 / EDGE-MIG-03, <date>)` with the same four sub-sections, ONE timeline covering Stage 1 (3 updates) / Stage 2 / Stage 3, and a re-verify matrix whose rows are the RESEARCH §Q3 signal table.

**`# expect:` command convention** (22 occurrences in the runbook; `:243-245`, `:269-273`, `:345-349`, `:516-522`):
```
ssh micro "T=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_v3probe | head -1); \
  docker exec \$T wget -qO- http://localhost:8080/api/http/routers \
  | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status'"
# expect (post-cutover labels): nothing
```
```
ssh micro "docker service rm traefik_v3probe"
ssh micro "docker service ls --filter name=traefik_v3probe --format '{{.Replicas}}'"   # expect: empty
ssh micro "stat -c '%s %Y %a %U' /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"
# expect: 301146 1791377596 600 root (unchanged)
```
Rules of the convention: the command is written in the literal form that is executed (the runbook abbreviates to `ssh micro "…"`; PLAN `<verify>` blocks and the executor use the AGENTS.md literal `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "…"`); the `# expect:` line immediately follows and states the exact stdout (or "nothing"/"empty"); continuation expectations are indented `#         …`; multi-command blocks may put `# expect:` inline after a short command. Observed values are then recorded in a two-column `| Check | Observed |` table directly under the block (`:247-255`, `:351-357`).

**Label-inspect idiom** (`:521`, reused in RESEARCH §Q3 "Per-router label readback"):
```
ssh micro "docker service inspect <svc> --format '{{range \$k,\$v := .Spec.Labels}}{{\$k}}={{\$v}}{{\"\n\"}}{{end}}' | grep '\.network='"
# expect, for each of the five: exactly one line, traefik.docker.network=traefik-public (no traefik.swarm.network line)
```
Phase 32 form: `… | grep -E 'routers\.(thinx-api-ws|downtime-http|downtime-https|error-router)\.(rule|priority|ruleSyntax)'`.

**Mechanism table pattern** (`:126-135`) — `| Stage | Command shape | Risk under the version running at that moment |`; Phase 32 rows: Stage 1 (3 label-only updates, rule + `ruleSyntax=v3` in ONE update each), Stage 2 (`--args` 17→16, one task restart), Stage 3 (`--label-rm ruleSyntax`, label-only). Carry the two CORRECTION lessons as a one-line "Rules that still apply" note (no dual-label family, no stack deploy / restart.sh — `:116-123`).

---

### Plan files `32-NN-PLAN.md` (planner output)

**Analog:** `31-01-PLAN.md` (repo edits + probe, autonomous) and `31-03-PLAN.md` (live mutation with `checkpoint:decision` + `auto` + `checkpoint:human-verify`). Phase 32 differs from 31 in that CONTEXT D-11 wants ONE blocking-human gate at the end, not a pre-cutover decision gate; the credential precondition replaces the decision gate.

**Frontmatter pattern** (`31-03-PLAN.md:1-45`): `files_modified` lists ONLY this-repo paths (the sibling-repo edits and live mutations are described in `artifacts`, e.g. `"live traefik_traefik service on traefik:v3.7.14 (swarm manager, micro)"`); `must_haves.prohibitions` carries the standing constraints verbatim:
```yaml
  prohibitions:
    - "No change may close, redirect, or TLS-enforce :7442 or plain MQTT (AGENTS.md operator decision 2026-10-04; EDGE-MIG-04)."
    - "No dashboard/API lockdown, ACME email/perms/renewal change, TLS min/HSTS change (P33); no log-level or socket-proxy change (P34)."
```
Plus `<!-- planner-discipline-allow: … -->` comments before `<tasks>` for any forbidden-looking token the plan must mention (`31-03-PLAN.md:72`; Phase 32 will need one for `HeadersRegexp` / `HostRegexp(`{host:.+}`)` if the discipline checker flags v2 matcher names, and for `--api.insecure` which appears only on the probe).

**`<precondition>` pattern** (`31-02-PLAN.md:79`; D-12 requires one for the credential file):
```xml
  <precondition>The live traefik_traefik service is still running v2.11 (the Plan 03 cutover has not happened) and the micro dir /mnt/data/edge-rollback/ (P30 snapshot parent) exists root-owned.</precondition>
```
Phase 32 form: `/root/.p32-traefik-admin` is 600 root on micro, `HASH=MATCH`, `/api/overview` → 200 (RESEARCH §Q6 command block), and `traefik_traefik` reads `traefik:v3.7.14 args=17 idx=38379311`.

**`<verify>` pattern** (`31-03-PLAN.md:154-175`) — one `<automated>` ssh/curl command per truth with `&amp;&amp;` chaining and a negated form (`! … | grep -q …`) for "must be absent" checks, each paired with a `<fails_when>` that names the regression:
```xml
    <automated>! ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "T=$(docker service ls --filter name=traefik -q | head -1); docker service inspect $T --format '{{json .Spec.TaskTemplate.ContainerSpec.Args}}'" | grep -q -- '--providers.docker'</automated>
    <fails_when>the pipeline matches '--providers.docker' in the live Args, so the negated command exits non-zero — a v2 docker-provider flag survived on the live v3 service.</fails_when>
```
Phase 32 equivalents: `! … | grep -q -- '--core.defaultRuleSyntax'` (end state), `grep -c HeadersRegexp docker-swarm.yml` → 0, `grep -Ec 'ruleSyntax' docker-swarm.yml ~/Repositories/thinx-swarm/{thinx,downtime,errorpage}.yml` → 0 at end state, the `:7442/:1883/:8883` `/dev/tcp` triple (`:165`), the HTTPS matrix negated-grep (`:162`), the secret-marker grep (`:173`).

**Human-verify pattern** (`31-03-PLAN.md:180-210`): `<what-built>` summarises what automation already proved; `<how-to-verify>` is a numbered browser/device checklist; `<resume-signal>` names the exact approval phrase and the failure path ("describe the failure to trigger …"). Phase 32 reuses it with the console Devices page + WS live updates and names the Stage 2 revert (`--args` with the 17-flag set) as the failure path.

---

### Live `docker service update` commands (runtime config, not files)

**Analog:** 31-03 timeline (`traefik-v3-cutover.md:685-693`) and the rollback Step 2 form (`:512-518`).

**Label-only single-step update** (`:513-516` — the only sanctioned shape; both halves of a label change in ONE update):
```
for s in thinx_api thinx_mosquitto thinx_couchdb thinx_influxdb swarmpit_app; do
  ssh micro "docker service update --detach --label-rm traefik.swarm.network \
    --label-add traefik.docker.network=traefik-public $s"
done
# expect: 5x rc 0; no task restarts (label-only — .Spec.Labels is outside TaskTemplate, task ids unchanged);
```
Phase 32 Stage 1 (RESEARCH §Q4 exact forms): `--label-add '…rule=PathPrefix(\`/\`)' --label-add …ruleSyntax=v3 <svc>`; per-router rollback: `--label-add '<v2 rule>' --label-rm …ruleSyntax <svc>` in one update; Stage 3: `--label-rm …ruleSyntax <svc>`. `--label-add` on an existing key overwrites (`:134`).

**`--args` update with task restart** (`:685`):
```
docker service update --detach --image traefik:v3.7.14 --args "$(jq … map(@sh) …)" --label-rm traefik.docker.network traefik_traefik
```
Phase 32 Stage 2 drops `--image` and `--label-rm`: `docker service update --detach --args "<16 flags via jq map(@sh) from the 600-root backup, index 3 deleted>" traefik_traefik`; revert = same with the 17-flag set. Record `Version.Index` before/after and the task restart time, as `:688-690` does.

**Task-id invariance check** (31-03-SUMMARY "all 15 Stage-C task ids pre == post"; RESEARCH §Q3 row "Label-only = no task restart"): `docker service ps <svc> --filter desired-state=running --format '{{.ID}} {{.Name}} {{.CurrentState}}'` before and after every label-only update.

## Shared Patterns

### Repo-first ordering with the thinx-swarm → micro fast-forward
**Source:** memory `thinx-swarm-deploy-checkout.md`; RESEARCH §Q5 "micro checkout update"; 31-01 Task 2 record (`traefik-v3-cutover.md:162-221`)
**Apply to:** every stage (1, 2, 3): edit thinx-swarm files → commit → `git push origin master` → push to micro as a temp ref → `git merge --ff-only` on micro → regenerate + commit mirror + `docker-swarm.yml` here → THEN the matching `docker service update`.
```bash
cd ~/Repositories/thinx-swarm && git push origin master
GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020" git push ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/heads/p32-stage1
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "cd /mnt/gluster/deployment/swarm && git status --short | grep -v '^??' ; git merge --ff-only p32-stage1 && git branch -d p32-stage1 && git rev-parse --short HEAD"
# expect: no tracked modifications listed; 'Fast-forward'; the new short SHA == workstation HEAD
```
Never edit files in place on micro (blocks later fast-forwards).

### Micro ssh literal form
**Source:** `AGENTS.md` ("User-provided server access"), memory `micro-ssh-direct-form.md`; every `<automated>` in `31-03-PLAN.md:154-175`
**Apply to:** every PLAN `<verify>` and every executor command. Write `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "…"` literally (the runbook prose may abbreviate to `ssh micro`, plans must not). Inside the quoted remote command, escape `$` as `\$` and backticks as `` \` `` (see the probe recipe `traefik-v3-cutover.md:228-244`).

### Dashboard credential handling (D-12)
**Source:** 31-03-SUMMARY "Secret hygiene" + "Dashboard credential gap"; RESEARCH §Q6 command block (the executable form)
**Apply to:** the plan `<precondition>`, every router-filter readback, the final shred step.
Pattern: operator pre-stages `/root/.p32-traefik-admin` (600 root) → executor runs the apr1 check entirely on micro (`openssl passwd -apr1 -salt "$SALT" -stdin`, compare to the live label hash, print only `HASH=MATCH`/`MISMATCH` and `overview=200`) → `P` lives only in a host-side shell variable (`unset P` at the end of each remote command) → `shred -u` at phase end. Never `--api.insecure` on the live service, never `set -x`, never paste `$U`/`$HASH` into a commit.

### Router status filter + behavioural probe (gate pair)
**Source:** runbook `:269-273` (status filter), RESEARCH §Q3 rows "Catch-all behavioural probe" and "WebSocket upgrade probe"
**Apply to:** after each Stage-1 service update, after Stage 2, after Stage 3.
```bash
# status filter (live API, admin-auth): prints nothing
curl -sS -u "${U%%:*}:$P" "https://$D/api/http/routers" | jq -r '.[] | select(.status!="enabled") | .name + "  " + .status + "  " + (.error|tostring)'
# catch-all liveness (silent-failure guard, RESEARCH §Q1): 301 https://188.166.23.244/ and 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -m 15 http://188.166.23.244/; curl -sk -o /dev/null -w '%{http_code}\n' -m 15 https://188.166.23.244/
# WS router liveness: HTTP/1.1 401 Unauthorized + X-Forwarded-Proto: https (NOT 200, NOT server: nginx)
K=dGhlIHNhbXBsZSBub25jZQ==; curl -s --http1.1 -D - -o /dev/null -m 10 -H "Connection: upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $K" -H "Sec-WebSocket-Version: 13" -H "Cookie: foo=bar" https://rtm.thinx.cloud/p32probe | head -3
```
The status filter alone is blind to a dead `{host:.+}` catch-all under native v3 — always pair it with the bare-IP probe.

### Boot-and-discover probe (constraint-isolated throwaway)
**Source:** runbook `:227-245` (invocation), `:269-273` (gate), `:345-349` (teardown); RESEARCH §Q2 (Phase 32 variant: `--providers.swarm.constraints=Label(`traefik.constraint-label`, `p32-probe`)`, no `--core.defaultRuleSyntax=v2`, 1-replica `alpine:3.20` `p32-rules` service with the four rules + `loadbalancer.server.port=80`)
**Apply to:** D-02 (before any live router is touched). Invariants copied from Phase 31: no host ports (`Endpoint.Ports == null`), `docker.sock:ro` only mount, ACME storage at `/tmp/acme-test.json` + LE staging CA, `${EMAIL}` read from the live Args into a shell var and never printed, teardown followed by `acme.json` stat + live `traefik_traefik` `Version.Index`/arg-count unchanged check.

### Device-flow harness (EDGE-MIG-04 re-verify)
**Source:** 31-03-SUMMARY D5; RESEARCH §Q3 row "Device-flow harness"
**Apply to:** baseline before the probe, and after Stage 2 (full suite).
```bash
cd ~/Repositories/thinx-mcp-device && THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs p32-7442 http://rtm.thinx.cloud 7442 thinx.cloud 1883
cd ~/Repositories/thinx-mcp-device && THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs p32-https https://app.thinx.cloud
# expect: PASS each (register -> status -> OTT 200 -> firmware md5Match -> MQTT connect + ACL -> publish -> recent -> disconnect)
```
Port triple (`31-03-PLAN.md:165`): three `timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/<port>'` on micro for 7442/1883/8883.

### Secret hygiene in committed artifacts (P29 D-12)
**Source:** `swarm-configs/README.md:34-38`; `31-03-PLAN.md:173`; 31-03-SUMMARY D7
**Apply to:** `D.pre.yml`, `D.post.yml`, runbook appendix, every SUMMARY. Redact on micro with `sed` BEFORE reading output; `<redacted>` for secret values; `${DOMAIN}`/`${EMAIL}`/`${USERNAME}`/`${HASHED_PASSWORD}` stay templated with no resolved value in comments; grep gates (apr1/bcrypt/PEM, e-mail regex) → 0 before commit.

## No Analog Found

None. Every artifact in this phase is a second iteration of a Phase 31 artifact or an edit to an existing config line.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | — |

Note for the planner: RESEARCH §Q5 says the `error-router` comment lines in `traefik.yml` are at `:46-50`; that range is actually the `security-headers` middleware comment, and `traefik.yml` carries no `error-router` router at all (only the `error-pages-middleware` labels at `:83-86`). The catch-all router comments to update live in `errorpage.yml`/`downtime.yml`, not in `traefik.yml`.

## Metadata

**Analog search scope:** `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/` (PLAN 01/02/03, SUMMARY 03), `.planning/runbooks/traefik-v3-cutover.md`, `.planning/runbooks/swarm-configs/{README.md,traefik-edge.C.pre.yml,traefik-edge.C.post.yml}`, `docker-swarm.yml`, `docker-compose.traefik.yml`, `scripts/{generate,check}-traefik-mirror.js`, `package.json`, `.circleci/config.yml`, `~/Repositories/thinx-swarm/{traefik,thinx,downtime,errorpage}.yml`
**Files scanned:** 17
**Pattern extraction date:** 2026-10-08
