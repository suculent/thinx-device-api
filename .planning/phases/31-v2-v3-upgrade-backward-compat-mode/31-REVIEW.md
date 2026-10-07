---
phase: 31-v2-v3-upgrade-backward-compat-mode
reviewed: 2026-10-07T22:31:19Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - docker-compose.traefik.yml
  - docker-swarm.yml
  - .planning/runbooks/traefik-v3-cutover.md
  - .planning/runbooks/swarm-configs/traefik-edge.C.pre.yml
  - .planning/runbooks/swarm-configs/traefik-edge.C.post.yml
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-10-07T22:31:19Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 31 v2.11 -> v3.7.14 edge migration: the generated Traefik mirror, the authoritative thinx stack file, the operational runbook and the two redacted live captures (diff base `247c9236`).

What checks out:

- **v3 static flags.** `docker-compose.traefik.yml` carries exactly 17 `- --` flags (`grep -c '^ *- --'` = 17): `--providers.swarm`, `--providers.swarm.constraints=Label(...)` (backticks intact), `--providers.swarm.exposedbydefault=true` (kept `true` per D-04/D-05), `--core.defaultRuleSyntax=v2`, all six entrypoints including `thxp=:7442`, `mqtt=:1883`, `mqtts=:8883`, three ACME flags, `--accesslog`, `--log`, `--log.level=ERROR`, `--api`. No `--providers.docker*`, no `--providers.swarm.endpoint`, no `--pilot.token`. `node scripts/check-traefik-mirror.js` prints `MIRROR OK files=1`; the body sha256 recomputes to `660e859b...` and matches the banner; `thinx-swarm` HEAD is `5e19c00`, the banner's source SHA.
- **Label consistency.** All 6 `traefik.docker.network` labels in `docker-swarm.yml` became `traefik.swarm.network` (mosquitto, couchdb, api, console, vue, influxdb); all 3 `@docker` refs became `@swarm` (`thinx-api-https`, `thinx-api-ws`, `thinx-console-https`). Every referenced middleware resolves: `https-redirect`, `security-headers`, `error-pages-middleware`, `admin-auth` are defined on the traefik service in the mirror; `sslheaders`, `couch-auth`, `influx-auth` are defined locally in `docker-swarm.yml`. `grep -E 'providers\.docker|traefik\.docker\.network|@docker'` over both stack files, non-comment lines: 0 hits. `C.post.yml` command block is index-identical to the mirror.
- **Secret hygiene (P29 D-12).** Fixed-string scan for `$apr1$`, `$2y$`/`$2a$`/`$2b$`, `PRIVATE KEY`, `BEGIN CERTIFICATE` over all five files: 0 hits. Only email literal is `rollback-dryrun@example.invalid` (allowed placeholder); every `${EMAIL}` / `${USERNAME}` / `${HASHED_PASSWORD}` / `${DOMAIN}` stays templated; basic-auth values are the literal `<redacted>`. Long hex blobs present are image digests, git SHAs and the mirror sha256 only. The `188.166.23.244` IP (runbook:607) is already published in `AGENTS.md`; `10.0.x.x` overlay addresses are non-routable.
- **Runbook command quoting.** The Step 2 `--args "$(jq -r '... | map(@sh) | join(" ")' <backup>)"` rebuild is quoted correctly for the `ssh micro "..."` wrapper (inner `\"` and `\$` reach the remote shell as `"` and `$`; `map(@sh)` single-quotes each element so the backtick-bearing constraint survives docker's shlex split), and the dry-verify record shows it round-tripping 17/17 against the live Args.

What does not check out is confined to the rollback section of the runbook (two stale statements that contradict the live Stage-A/C correction, and an ordering gap in the re-add of `traefik.docker.network`) plus a handful of factual/comment defects in the captures and the generated mirror's source. No BLOCKER-class finding: the committed stack files are correct for the running v3.7.14 edge.

## Warnings

### WR-01: Rollback Step 3's mandatory Stage-C re-add is prose-only, un-dry-verified, and leaves a v2.11 network mis-pick window on the five multi-network services

**File:** `.planning/runbooks/traefik-v3-cutover.md:497-537`
**Issue:** Since Stage C ran live (22:06:39Z), the five multi-network services (`thinx_api`, `thinx_mosquitto`, `thinx_couchdb`, `thinx_influxdb`, `swarmpit_app`) carry only `traefik.swarm.network`. Step 2 recreates the v2.11 task first; Step 3's bullet at :531-536 then re-adds `traefik.docker.network` to those five. Between Step 2 converging and that re-add, the v2.11 docker provider has no network label on services sitting on `thinx_internal`+`traefik-public` (or `swarmpit_net`+`traefik-public`) and picks a network heuristically; a `thinx_internal` pick yields 502 on `rtm`/`db`/`influx`/`swarmpit` until the re-add lands. The runbook does not acknowledge this window. The re-add also cannot simply be hoisted before Step 2 as written, because adding `traefik.docker.network` beside `traefik.swarm.network` while v3 is still running triggers the exact `both Docker and Swarm labels are defined` skip that caused the 2-minute outage. Finally, unlike Steps 0-4, the re-add is not a copy-paste command block with `# expect:` lines, and the dry-verify table (:561-580) never exercised it (Run A/B only covered `traefik_traefik` and the B2 label revert on `gsd_rbdry_app`).
**Fix:** Promote the re-add to its own numbered step and make it the **first** mutation, executed while v3 is still running, as a single combined update per service so no dual-label state ever exists:
```
# Step 1b (BEFORE the retag; v3 still running). Safe under v3: the probe + live post-cutover
# state proved the swarm provider auto-selects traefik-public for all five without the label.
for s in thinx_api thinx_mosquitto thinx_couchdb thinx_influxdb swarmpit_app; do
  ssh micro "docker service update --detach --label-rm traefik.swarm.network \
    --label-add traefik.docker.network=traefik-public $s"
done
# expect: 5x rc 0, no task restarts (label-only); https rtm/app/console still 200 under v3
```
If the operator prefers to keep `traefik.swarm.network` in place under v3 until the retag, then at minimum (a) state the window explicitly, (b) place the five updates as a command block immediately after Step 2 with `# expect:` lines, and (c) add them to the dry-verify matrix.

### WR-02: Two rollback statements still assert the dual-label bridge is harmless, contradicting the live correction, and the rollback end state is the exact configuration that broke v3

**File:** `.planning/runbooks/traefik-v3-cutover.md:138-140` and `:514-516`
**Issue:** Lines 138-140 ("Stage A/C labels are harmless in either direction, so the rollback never has to touch them") and lines 514-516 ("`traefik.swarm.network` is left in place ... zero-length window -- same bridge as Stage A, mirrored. Optional later: `--label-rm traefik.swarm.network`") were written before the 31-03 discovery that the v3 swarm provider skips any service carrying both `traefik.docker.*` and `traefik.swarm.*` labels. The Stage A and Stage C table rows (:132, :136) received **CORRECTION** markers; these two passages did not, and :138-140 is now directly false (Step 3 at :531 says the Stage-C re-add "is now mandatory"). Following Step 2 + Step 3 as written leaves `traefik_traefik` plus the five multi-network services carrying BOTH key families. That is harmless under v2.11 (proven live 21:53-22:04Z) but it is precisely the state that produced the 404 outage after B1, so any later re-attempt of the hop from the rolled-back state would regress again unless the operator remembers to fold `--label-rm traefik.docker.network` on all 16 services into B1 (and :138-140 tells them the opposite).
**Fix:** (1) Add a **CORRECTION (31-03 live)** marker to :138-140 pointing at Step 3's mandatory clause. (2) In Step 2 (:514-516) drop the "same bridge as Stage A" framing and change "Optional later" to a mandatory `--label-rm traefik.swarm.network` on `traefik_traefik` in the same `docker service update` (v2.11 does not read it, so there is no downside). (3) Add a one-line "Re-hop precondition" note under Regression triggers: "after a rollback, services carry `traefik.docker.network`; a second B1 must run Stage C (`--label-rm traefik.docker.network` on all 16) in the same breath, never as a separate later step."

## Info

### IN-01: `C.pre.yml` predicts "4 provider flags -> 5"; the actual and `C.post`-recorded count is 4

**File:** `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml:126-127`
**Issue:** The trailer says the post snapshot "will differ in ... the 4 provider flags -> 5 (providers.swarm x3 + core.defaultRuleSyntax=v2)". 3 + 1 = 4, and `C.post.yml:8-9` records "4 provider flags -> 4 ... count unchanged at 17" while claiming "exactly as predicted there", which is self-contradictory. Same off-by-one the runbook already corrected at :162-163.
**Fix:** Change `-> 5` to `-> 4 (count unchanged at 17)` in `C.pre.yml:126`, or annotate it `# miscount, see C.post` so the pair still `diff`s cleanly.

### IN-02: Mirror comments contradict the flags they annotate (fix in `thinx-swarm/traefik.yml`, then regenerate)

**File:** `docker-compose.traefik.yml:109-111` and `:129-130`
**Issue:** Line 109 "Do not expose all Docker services, only the ones explicitly exposed (CHANGED)" sits directly above `--providers.swarm.exposedbydefault=true`, which does the opposite; line 110 then has to walk it back. Line 129 "Create the certificate resolver "le" for Let's Encrypt, uses the environment variable EMAIL" sits above `--entrypoints.mqtt.address=:1883`, and the mqtt entrypoint has no comment of its own. Both are byte-faithful copies of the source, so the mirror cannot be hand-edited.
**Fix:** In `~/Repositories/thinx-swarm/traefik.yml` replace :109 with `# Expose every constraint-matching service by default (P30 D-05: audit deferred to Phase 33)` and move the ACME comment down to precede `--certificatesresolvers.le.acme.email`; add `# Create an entrypoint "mqtt" listening on port 1883` above the mqtt flag. Then `node scripts/generate-traefik-mirror.js` and confirm `MIRROR OK`.

### IN-03: Duplicate label key `traefik-public-https.middlewares` relies on last-wins conversion

**File:** `docker-compose.traefik.yml:80` and `:86`
**Issue:** `traefik.http.routers.traefik-public-https.middlewares` is set to `admin-auth` at :80 and `admin-auth,error-pages-middleware` at :86. Compose collapses the list into a map, last-wins, so :86 is effective (the live capture confirms). Acknowledged in the runbook (:180-182) as pre-existing; recorded here because a reader of :80 alone concludes the dashboard has no error-page middleware, and any tool that rejects duplicate keys will fail on this file.
**Fix:** Delete :79-80 in the source `thinx-swarm/traefik.yml` (keep :86 and its comment), regenerate the mirror.

### IN-04: `${DOMAIN}` is templated but its resolved value is written in the adjacent comment

**File:** `.planning/runbooks/swarm-configs/traefik-edge.C.pre.yml:74`, `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml:79`
**Issue:** `Host(\`${DOMAIN}\`)   # live DOMAIN=micro.thinx.cloud` defeats the templating of the dashboard hostname that the redaction convention keeps out of the capture. Not a D-12 secret class (it is a public DNS name behind basic auth and appears in the runbook's verification matrix), so this is a consistency note only. Carried over from `A.pre`/`B.post`.
**Fix:** Either drop the comment or accept the disclosure explicitly in `swarm-configs/README.md` so future captures are consistent.

### IN-05: Dead Traefik v1 labels survive in `docker-swarm.yml` and misdescribe the console/vue security posture

**File:** `docker-swarm.yml:438-439`, `:488-489`, `:243`, `:507`
**Issue:** `traefik.frontend.headers.STSPreload` / `STSSeconds` (console, vue) and `traefik.backend.*.noexpose` (transformer, worker) are Traefik v1 syntax, ignored by v2 and v3. The vue labels suggest HSTS is configured, but `thinx-vue-console-https` has no `middlewares` label at all (no `security-headers`), which the runbook's rename inventory confirms (:57). Pre-existing, not introduced by this phase, but the phase performed a complete label audit and left them.
**Fix:** Remove the four v1 labels (label-only `docker service update --label-rm`, no task restart) and track the missing vue `security-headers@swarm` as a Phase 32/33 item rather than letting the dead label imply it is present.

### IN-06: `HeadersRegexp` matcher depends entirely on the deprecated `core.defaultRuleSyntax=v2` switch

**File:** `docker-swarm.yml:376`; `docker-compose.traefik.yml:114`
**Issue:** `thinx-api-ws.rule=Host(...) && HeadersRegexp(\`Upgrade\`, \`(?i)websocket\`)` is v2-only syntax; v3 renamed it `HeaderRegexp`. It parses today only because of `--core.defaultRuleSyntax=v2`, which upstream has marked deprecated for removal in the next major. No defect in this phase (the BC switch is the explicit D-04 design), but it is the one rule in the stack that will hard-fail, not merely warn, when Phase 32 drops the switch, and the WS router carries the `priority=200` that keeps WebSocket upgrades off the console router.
**Fix:** In Phase 32, rename to `HeaderRegexp` and, to avoid a flag day, set `traefik.http.routers.thinx-api-ws.ruleSyntax=v3` on that router first (per-router override) before removing the global switch.

---

_Reviewed: 2026-10-07T22:31:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
