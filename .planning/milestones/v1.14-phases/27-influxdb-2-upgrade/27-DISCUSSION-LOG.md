# Phase 27: InfluxDB 2 Upgrade - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-02
**Phase:** 27-influxdb-2-upgrade
**Areas discussed:** Retention vs. history, Migration & downtime, Client & auth, Dependents & exposure

---

## Retention vs. history

**What should happen to stats history older than 90 days?**

| Option | Selected |
|--------|----------|
| Trim to 90 days | ✓ |
| Archive bucket |  |
| Downsample old data |  |

**User's choice:** Trim to 90 days

**How long to keep the verified 1.8 backup?**

| Option | Selected |
|--------|----------|
| Keep indefinitely |  |
| Keep 90 days, then delete |  |
| Until Phase 27 verifies | ✓ |

**User's choice:** Until Phase 27 verifies

**Where is the 90-day retention defined?**

| Option | Selected |
|--------|----------|
| In code at boot | ✓ |
| Ops-time only |  |
| Both |  |

**User's choice:** In code at boot

**Which token does the API hold?**

| Option | Selected |
|--------|----------|
| Scoped + boot verify only |  |
| Org-admin token, boot repairs | ✓ |
| Two tokens |  |

**User's choice:** Org-admin token, boot repairs

---

## Migration & downtime

**How does 1.8 data get into v2?**

| Option | Selected |
|--------|----------|
| Official in-place upgrade | ✓ |
| Export/import |  |
| Fresh start |  |

**User's choice:** Official in-place upgrade (influxd upgrade against a copy; 1.8 dir untouched)

**Acceptable stats write loss during switch?**

| Option | Selected |
|--------|----------|
| Short gap | ✓ |
| Buffer in API |  |
| Dual-write |  |

**User's choice:** A short gap is fine (quiet hour, outside 01-05 and 09:25-10:15 UTC)

**When is the 1.8 data dir removed?**

| Option | Selected |
|--------|----------|
| With backup after verify | ✓ |
| Keep longer |  |
| Remove right after cutover |  |

**User's choice:** With the backup, after Phase 27 verification, at an operator checkpoint

**Which v2 image?**

| Option | Selected |
|--------|----------|
| dhi.io/influxdb:2 | ✓ |
| Official influxdb:2 |  |
| You decide |  |

**User's choice:** dhi.io/influxdb:2 (research confirms CLI/upgrade availability; else one-shot official image for those steps)

---

## Client & auth

**Which client?**

| Option | Selected |
|--------|----------|
| v2 client + Flux | ✓ |
| v1 client via v1-compat |  |
| You decide |  |

**User's choice:** v2 client (@influxdata/influxdb-client + -apis) with Flux

**Which token in the API secret?**

| Option | Selected |
|--------|----------|
| Dedicated org all-access | ✓ |
| Operator token |  |
| You decide |  |

**User's choice:** Dedicated org all-access token as swarm secret INFLUXDB_TOKEN via readSecret; operator token stays with operator

**Where do operator token and admin password live?**

| Option | Selected |
|--------|----------|
| Swarm secret, not mounted | ✓ |
| Password manager only |  |
| Both |  |

**User's choice:** Swarm secrets not mounted by any service

**Tag schema?**

| Option | Selected |
|--------|----------|
| Same schema, stop storing rejected keys | ✓ |
| Exactly as-is |  |
| Also scrub migrated history |  |

**User's choice:** Same schema, but APIKEY_INVALID/LOGIN_INVALID stop storing raw rejected key/login data (hash or nothing); migrated points age out

---

## Dependents & exposure

**Chronograf 1.9?**

| Option | Selected |
|--------|----------|
| Retire | ✓ |
| Keep pointed at v2 |  |
| Leave untouched |  |

**User's choice:** Retire it; keep its gluster volume until verification

**Public INFLUX_HOSTNAME route?**

| Option | Selected |
|--------|----------|
| Remove, internal only |  |
| Keep behind auth middleware | ✓ |
| Keep as-is |  |

**User's choice:** Keep, behind auth middleware

**Which protection?**

| Option | Selected |
|--------|----------|
| Basic auth + HTTPS only | ✓ |
| Basic auth + IP allowlist |  |
| IP allowlist only |  |

**User's choice:** Existing influx-auth basic auth + HTTPS only (fix HTTP router to redirect only)

**db0 and swarmpit DBs?**

| Option | Selected |
|--------|----------|
| Drop after confirming unused | ✓ |
| Migrate and keep all |  |
| Keep swarmpit, drop db0 |  |

**User's choice:** Drop after confirming unused; only stats remains

**v2 config home?**

| Option | Selected |
|--------|----------|
| Env vars only | ✓ |
| thinx-owned config file |  |
| You decide |  |

**User's choice:** Env vars only (INFLUXD_*), mount only the data dir

---

## Correction during discussion

Claude first said Chronograf was not publicly routed. The repo `docker-swarm.yml` shows its HTTPS router is live behind `chrono-auth`, and the InfluxDB route already has `influx-auth` basic auth. The InfluxDB HTTP router's middlewares label also overrides `https-redirect`. The route question was asked again with those facts.

## Claude's Discretion

- The rejected-key tag: hash it or drop it.
- Org and bucket naming.
- The CI InfluxDB 2 setup.
- A configurable InfluxDB URL.

## Deferred Ideas

- Downsampling or rollups.
- Scrubbing migrated `APIKEY_INVALID` tags.
