---
phase: 32-v3-native-syntax-bc-removal
reviewed: 2026-10-08T15:30:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - docker-compose.traefik.yml
  - docker-swarm.yml
  - /Users/sychram/Repositories/thinx-swarm/downtime.yml
  - /Users/sychram/Repositories/thinx-swarm/errorpage.yml
  - /Users/sychram/Repositories/thinx-swarm/thinx.yml
  - /Users/sychram/Repositories/thinx-swarm/traefik.yml
findings:
  critical: 0
  warning: 0
  info: 9
  total: 9
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-10-08T15:30:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found (Info only — nothing in the Phase 32 diff is Critical or Warning)

## Summary

Scope: `git diff 1212a30f..HEAD -- docker-compose.traefik.yml docker-swarm.yml` in this repo and
`git -C thinx-swarm diff 677e3a9..HEAD -- traefik.yml thinx.yml downtime.yml errorpage.yml`
(commits 17401bb, 6c01b26, 158f369). The diff is small and mechanical: four router rules rewritten
to native Traefik v3 syntax, the `--core.defaultRuleSyntax=v2` flag removed, the generated mirror
regenerated. Every file was read in full; the mirror and the cross-stack blast radius of the BC
removal were verified with the commands listed below.

What was verified and holds:

- **v3 rule syntax.** `HeaderRegexp(`Upgrade`, `(?i)websocket`)` is the correct v3 matcher name
  (v2 `HeadersRegexp` is gone in v3); Go `regexp.MatchString` is unanchored and honours `(?i)`, so
  the match set is unchanged from v2. `PathPrefix(`/`)` is a valid v3 catch-all. Explicit priorities
  1 (error-router) and 2 (downtime-http/https) sit below every rule-length-derived default priority
  in the fleet (the shortest real rule, `Host(`db.thinx.cloud`)`, is 22), so no production router
  can be shadowed by the catch-alls.
- **Static command.** `traefik.yml` / mirror carry exactly 16 `--` flags; `core.defaultRuleSyntax`
  is gone; entrypoints `thxp :7442`, `mqtt :1883`, `mqtts :8883` are still declared (AGENTS.md
  keep-7442 honoured); `--pilot.token` absent.
- **Mirror integrity.** `tail -n +3 docker-compose.traefik.yml | shasum -a 256` equals the
  `mirror-sha256` header and equals `shasum -a 256 thinx-swarm/traefik.yml`; `diff` of the body
  against `traefik.yml` is empty; header `source: thinx-swarm@158f369` equals thinx-swarm HEAD.
- **No leftovers.** `grep -E 'ruleSyntax|HeadersRegexp|HostRegexp\(`\{|defaultRuleSyntax|traefik\.docker\.|@docker'`
  across all six files returns only comments. No two-label `traefik.docker.*`/`traefik.swarm.*`
  bridges. No secrets, password hashes or e-mail addresses — every credential is a `${VAR?...}`
  reference.
- **Blast radius of the BC-switch removal.** The removal affects every router this Traefik
  discovers, not only the four converted ones. All other stacks on the constraint label
  (`landing.yml`, `swarmpit.yml`, `registry.yml`, `vault.yml`) use plain `Host()` / `||` rules,
  which are valid under native v3, so none of them is stranded.
- **`thinx-api-ws` consistency.** The 14-line router block is byte-identical between
  `docker-swarm.yml:372-385` and `thinx.yml:300-313`; in fact the complete set of `traefik.*`
  labels in both files is identical (diff of the extracted label lists is empty).

Out-of-diff drift noted but not raised as a finding (not Traefik-related): `docker-swarm.yml` declares
13 secrets on `api` (incl. `COUCHDB_USER`, `COUCHDB_PASS`, `REDIS_PASSWORD`) while `thinx.yml`
mounts 10, matching live per its own header comment.

## Info

### IN-01: `tls.toml` is mounted but has never been loaded (no `--providers.file`)

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.yml:15-18,94-141` (mirror: `docker-compose.traefik.yml:17-20,96-143`)
**Issue:** The `tls-config` config is mounted at `/traefik/tls.toml` and the file sets
`minVersion = "VersionTLS12"`, `sniStrict = true` and an explicit cipher list, but the 16-flag static
command contains no `--providers.file.filename=/traefik/tls.toml`. `git log -S'providers.file' -- traefik.yml`
is empty and none of the `traefik.yml.bak.*` snapshots carry it, so the TLS options have never been
applied under v2 or v3; Traefik runs on its built-in defaults (TLS 1.2 minimum, Go default suites,
`sniStrict=false`). Pre-existing, not introduced by Phase 32. Practical impact is small: the defaults
already enforce TLS 1.2, and the file's `*_CBC_SHA256` suites are weaker than the Go defaults, so
loading it as-is would be a regression on cipher strength while gaining only `sniStrict`.
**Fix:** Decide explicitly in Phase 33: either drop the `configs:` block and the `tls-config` top-level
entry (dead mount), or load it with `--providers.file.filename=/traefik/tls.toml` after removing the
two CBC suites — and update the "16-flag" invariant recorded in the Phase 32 artefacts to 17.

### IN-02: `vault.yml` still carries the v2 `traefik.docker.network` label

**File:** `/Users/sychram/Repositories/thinx-swarm/vault.yml:35` (outside the six-file scope; surfaced by the blast-radius grep)
**Issue:** The only remaining v2 provider label in the swarm. The v3 swarm provider ignores it; the
vault service sits on a single network so discovery still works, but it is the last place where a
reader could believe the two-label bridge is still in use.
**Fix:** Rename to `traefik.swarm.network=traefik-public` in the next vault stack touch.

### IN-03: Dead Traefik v1 `traefik.frontend.headers.*` labels on console and vue

**File:** `docker-swarm.yml:441-442,491-492`; `/Users/sychram/Repositories/thinx-swarm/thinx.yml:369-370,419-420`
**Issue:** `traefik.frontend.headers.STSPreload` / `STSSeconds` are Traefik v1 labels; v2 and v3 ignore
them. They give the false impression that HSTS is configured on `vue`, whose https router has no
headers middleware at all (see IN-04). Pre-existing; deferred to Phase 33/34 per plan.
**Fix:** Delete the four lines; HSTS comes from `security-headers@swarm`.

### IN-04: `thinx-vue-console-https`, `thinx-db-https`, `thinx-influx-https` have no `security-headers@swarm`

**File:** `docker-swarm.yml:484-487,191-195,558-566`; `/Users/sychram/Repositories/thinx-swarm/thinx.yml:412-415,139-143,486-494`
**Issue:** Only `thinx-api-https` and `thinx-console-https` reference `security-headers@swarm`; the vue
console, CouchDB and InfluxDB routers ship without HSTS / nosniff / frame-deny. Pre-existing (the
`traefik.yml:46-47` comment already records "thinx-vue carries no ref live"); deferred to Phase 33/34.
**Fix:** Append `security-headers@swarm` to each router's `middlewares` list (e.g.
`couch-auth,error-pages-middleware,security-headers@swarm`).

### IN-05: `thinx-api-ws` hardcodes `rtm.thinx.cloud` while sibling routers use `${THINX_HOSTNAME}`

**File:** `docker-swarm.yml:379`; `/Users/sychram/Repositories/thinx-swarm/thinx.yml:307`
**Issue:** Phase 32 only renamed the matcher, but the rule's `Host(`rtm.thinx.cloud`)` literal was
carried over. If `THINX_HOSTNAME` is ever pointed elsewhere (staging, rename), the HTTPS router follows
the env and the WS router silently does not, so WebSocket upgrades fall through to `thinx-api-https`
with `security-headers` applied to a 101 handshake. Pre-existing.
**Fix:** `Host(`${THINX_HOSTNAME}`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)` — and regenerate
the mirror if `thinx.yml` is the source of truth.

### IN-06: `mosquitto-secure` TCP router has no `rule`

**File:** `/Users/sychram/Repositories/thinx-swarm/thinx.yml:76-77`; `docker-swarm.yml:121-122`
**Issue:** The router declares only `entrypoints=mqtts` and a service port; a TCP router without a
`rule` is rejected at config build and shows as an errored router on the v3 dashboard. The
`traefik.yml:116-117` comment already calls it dead (D-03: mosquitto is host-published directly on
:8883). Also note mosquitto carries no `traefik.constraint-label`, so the swarm constraint excludes the
service anyway. Pre-existing.
**Fix:** Delete both TCP labels (and `traefik.enable=true` / `traefik.swarm.network` on mosquitto) in
the Phase 33 exposed-by-default audit; keep `ports: 8883:8883`.

### IN-07: Duplicated comment and trailing whitespace in `downtime.yml`

**File:** `/Users/sychram/Repositories/thinx-swarm/downtime.yml:23,29` (comment), `:25,31` (trailing space)
**Issue:** The identical Phase 32 comment line appears twice six lines apart; `priority=2 ` carries a
trailing space on both routers. YAML trims trailing whitespace from plain scalars, so Traefik sees
`2`, but a future quoted edit (`"...priority=2 "`) would ship `"2 "` and fail integer parsing.
**Fix:** Keep one comment above the first router; strip the trailing spaces.

### IN-08: Unused `net` overlay network declared in the Traefik stack

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.yml:162-164`; mirror `docker-compose.traefik.yml:164-166`
**Issue:** `networks.net` is declared with `driver: overlay`, `attachable: true` but no service attaches
to it; `docker stack deploy` creates an empty `traefik_net` overlay every time. Dead config.
**Fix:** Remove the block (and regenerate the mirror).

### IN-09: `error-pages-middleware` is defined twice with identical bodies

**File:** `/Users/sychram/Repositories/thinx-swarm/traefik.yml:84-86` and `/Users/sychram/Repositories/thinx-swarm/errorpage.yml:29-31`
**Issue:** The same middleware name is declared on two different swarm services. Traefik's provider
merge tolerates this only while the two definitions are `DeepEqual`; the moment they diverge (someone
edits the status range in one stack) the merger drops the middleware entirely ("defined multiple times
with different configurations"), which breaks `traefik-public-https`, `thinx-db-https`,
`thinx-influx-https` and `error-router` at once. Pre-existing and currently harmless.
**Fix:** Keep a single definition (the `errorpage.yml` one, next to the `errorpage` service it points
at) and delete `traefik.yml:83-86`; regenerate the mirror.

---

_Reviewed: 2026-10-08T15:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
