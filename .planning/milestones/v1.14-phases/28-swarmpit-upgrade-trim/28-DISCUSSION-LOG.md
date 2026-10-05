# Phase 28: Swarmpit Upgrade & Trim - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-04
**Phase:** 28-swarmpit-upgrade-trim
**Areas discussed:** Upgrade order & target, Redeploy test & SLA clock, Agent removal & leftovers, Window & who runs it

---

## Upgrade order & target

| Option | Description | Selected |
|--------|-------------|----------|
| Trim on 1.9, then upgrade | Known base first; the reverse of the roadmap's listed order | |
| Upgrade first, then trim | Roadmap order | |
| You decide | Pick based on the engine check | ✓ |

**User's choice:** You decide (Claude chose trim first, then upgrade; see CONTEXT D-01)

| Option (engine 29.0–29.2 found) | Selected |
|--------|----------|
| Upgrade to 1.10 first | ✓ |
| Set SWARMPIT_DOCKER_API on 1.9 | |
| Stop and ask | |

| Option (image reference) | Selected |
|--------|----------|
| Version tag swarmpit/swarmpit:1.10 | ✓ |
| Tag plus @sha256 digest | |
| Latest 1.10.x patch tag | |

| Option (replace Swarmpit if 1.10 misbehaves) | Selected |
|--------|----------|
| No, roll back to 1.9 | ✓ |
| Yes, as a contingency | |

| Option (1.10 needs a swarmpit_db schema change) | Selected |
|--------|----------|
| swarmpit_db untouched wins | |
| Allow an additive migration | ✓ |
| Stop and ask | |

| Option (swarmpit_db data backup) | Selected |
|--------|----------|
| Yes, dump before step 1 | ✓ |
| Stack snapshot only | |

**Notes:** "Untouched" is read as same image/version, same volume and same credentials; an additive migration is allowed after the dump.

---

## Redeploy test & SLA clock

| Option | Description | Selected |
|--------|-------------|----------|
| Real thinx-staging push | Exercises the exact production path | ✓ |
| Canary service | Retagged busybox to the registry | |
| Canary for steps, real push at the end | Mixed | |

| Option (SLA clock start) | Selected |
|--------|----------|
| Registry push to new running task | ✓ |
| git push to new running task | |

| Option (evidence) | Selected |
|--------|----------|
| Task + digest + health | ✓ |
| New task only | |

| Option (gate misses 5 min) | Selected |
|--------|----------|
| Rung-1 once, then roll back | ✓ |
| Roll back immediately | |
| Stop and ask | |

| Option (gate commits) | Selected |
|--------|----------|
| Phase evidence commits | ✓ |
| Empty commits | |

**Notes:** Research must confirm that a `.planning`-only commit still builds and pushes the api image.

---

## Agent removal & leftovers

| Option (UI loss without the agent) | Selected |
|--------|----------|
| OK, task list is enough | |
| OK, and stop relying on the UI | |
| Keep the agent | ✓ |

| Option (OPS-SWARM-03 recording) | Selected |
|--------|----------|
| Descope to future requirements | ✓ |
| Keep it, marked won't-do | |

| Option (agent image on the 1.10 upgrade) | Selected |
|--------|----------|
| Upgrade app and agent together | ✓ |
| Leave the agent image as is | |

| Option (swarmpit/influxdb.conf) | Selected |
|--------|----------|
| Delete it with swarmpit_influxdb | ✓ |
| Leave it in place | |

| Option (swarmpit_influxdb volume) | Selected |
|--------|----------|
| Delete after the final gate | ✓ |
| Keep it | |
| Delete immediately | |

| Option (log noise without the agent) | Selected |
|--------|----------|
| Tolerable if redeploy works | ✓ (moot: agent kept) |
| Must be quiet | |

---

## Window & who runs it

| Option (executor) | Selected |
|--------|----------|
| Claude, gated per step | |
| Claude, no gates | ✓ |
| Operator from a runbook | |

| Option (window) | Selected |
|--------|----------|
| Evening UTC, ~20:00–23:00 | |
| Whenever execute-phase runs | ✓ |
| I'll name it at execution | |

| Option (isolation from other pushes) | Selected |
|--------|----------|
| No, prior rollouts must be verified first | |
| Same day is fine | ✓ |

| Option (mechanism) | Selected |
|--------|----------|
| Edit stack file + stack deploy | ✓ |
| service update / rm | |
| You decide | |

---

## Claude's Discretion

- Step order on a healthy engine (trim first, then upgrade).
- Form of the swarmpit_db dump and snapshot redaction.
- How the registry-push timestamp is measured.

## Deferred Ideas

- Removing swarmpit_agent (OPS-SWARM-03), descoped.
- Replacing Swarmpit with a registry webhook or Shepherd.
