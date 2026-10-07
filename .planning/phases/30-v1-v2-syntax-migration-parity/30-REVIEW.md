---
phase: 30-v1-v2-syntax-migration-parity
reviewed: 2026-10-07T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - docker-compose.traefik.yml
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-10-07
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `docker-compose.traefik.yml`, a GENERATED, read-only mirror of
`thinx-swarm/traefik.yml` produced by `scripts/generate-traefik-mirror.js` and enforced
against drift by `scripts/check-traefik-mirror.js` in CI.

**The Phase 30 change itself is clean.** The inert cleartext `--pilot.token` flag was
removed and replaced with the D-04 explanatory comment block (lines 137-139). There is no
residual token value, no orphaned flag fragment, and secret-redaction/templating is intact:
`${USERNAME}`, `${HASHED_PASSWORD}`, `${EMAIL}`, `${DOMAIN}`, `${CONFIG}` all remain
templated (never resolved), and no RFC4122 UUID or htpasswd hash survives in the body. The
two-line anti-drift banner (source SHA + body `mirror-sha256`) is present and well-formed.
No new defect is introduced by this phase.

**Important scoping constraint for every finding below:** this file is machine-generated and
read-only. Editing it directly would both be overwritten by the next `generate` run and fail
the CI integrity check (`MIRROR-EDITED`). Therefore *no finding here is fixable in this
repository.* Every fix must land in the upstream source of truth,
`thinx-swarm/traefik.yml`, after which the mirror is regenerated. All findings below are
**pre-existing upstream warts, not regressions from Phase 30.** Per the review brief, the
documented deferrals (`exposedbydefault=true`, `--api`, `--log.level=ERROR`,
`/var/run/docker.sock:ro`) and the required plaintext `:7442` / plain-MQTT entrypoints are
explicitly out of scope and are NOT flagged.

## Warnings

### WR-01: Duplicate `traefik-public-https.middlewares` label silently overrides the auth chain

**File:** `docker-compose.traefik.yml:76` and `docker-compose.traefik.yml:82`
**Issue:** The deploy label `traefik.http.routers.traefik-public-https.middlewares` is set
twice:
- line 76 — `...middlewares=admin-auth`
- line 82 — `...middlewares=admin-auth,error-pages-middleware`

Docker deploy labels resolve to a map, so a repeated key is last-one-wins: line 76 is dead
and line 82 is the effective value. The intended chain (basic-auth plus the custom error
page) happens to survive only because the fuller entry is listed last. This is fragile —
anyone reordering or editing these labels can silently drop `admin-auth` from the dashboard
router (an authentication control) without any parser error. Line 76 is also pure dead
config. Pre-existing upstream; not a Phase 30 change.
**Fix:** In `thinx-swarm/traefik.yml`, delete the line-76 entry and keep a single
`...middlewares=admin-auth,error-pages-middleware`, then regenerate the mirror. Do not edit
the mirror directly.

## Info

### IN-01: Inline comment contradicts `exposedbydefault=true` (comment hygiene only)

**File:** `docker-compose.traefik.yml:100-101`
**Issue:** The comment reads "Do not expose all Docker services, only the ones explicitly
exposed (CHANGED)" while the flag beneath it is `--providers.docker.exposedbydefault=true`,
which does the opposite (every eligible service is exposed by default). The *value* is an
accepted deferral (P33/P34) and is explicitly out of scope, so this is raised strictly as
comment hygiene: the annotation actively misrepresents the edge's exposure posture and could
mislead an operator reading the mirror during an incident.
**Fix:** Correct the comment (or the value) in `thinx-swarm/traefik.yml` so the two agree;
regenerate.

### IN-02: Misplaced certresolver comment above the `mqtt` entrypoint

**File:** `docker-compose.traefik.yml:118-119`
**Issue:** The comment "Create the certificate resolver 'le' for Let's Encrypt, uses the
environment variable EMAIL" sits immediately above `--entrypoints.mqtt.address=:1883`, not
above the actual certresolver flag (line 125). The comment is stranded one block too high,
making the mqtt entrypoint look like certresolver config. Pre-existing upstream; cosmetic.
**Fix:** Move the comment to directly precede the
`--certificatesresolvers.le.acme.email=...` line in the upstream source; regenerate.

### IN-03: `vpn` entrypoint comment says `1194/udp` but the address binds TCP

**File:** `docker-compose.traefik.yml:116-117`
**Issue:** The comment claims the entrypoint listens on "port 1194/udp", but
`--entrypoints.vpn.address=:1194` with no `/udp` suffix binds TCP in Traefik v2. The
mismatch is harmless today because the vpn entrypoint is vestigial (D-03: no router, not
host-published), but the comment is inaccurate and would mislead anyone who later tried to
make this entrypoint live. Pre-existing upstream.
**Fix:** Either append `/udp` to the address or correct the comment in the upstream source;
regenerate. No change needed while the entrypoint stays vestigial.

### IN-04: `net` overlay network declared but never referenced

**File:** `docker-compose.traefik.yml:157-159`
**Issue:** The `net` overlay network is declared (`driver: overlay`, `attachable: true`) but
no service in this file references it; the `traefik` service attaches only to
`traefik-public` (line 144). Within this file it is a dead declaration. (It may be consumed
by other stacks sharing the swarm, but nothing in the mirror uses it.) Pre-existing upstream;
cosmetic.
**Fix:** If no co-deployed stack depends on it, remove the `net` block from
`thinx-swarm/traefik.yml`; otherwise leave it and optionally annotate why it exists.
Regenerate after any change.

---

_Reviewed: 2026-10-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
