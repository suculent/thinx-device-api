# Phase 34: Ops Surface Reduction & SLA Close-out - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 34-ops-surface-reduction-sla-close-out
**Areas discussed:** Log level & access log, Socket-proxy design, SLA measurement, P33 carry-over items

---

## Log level & access log

| Question | Options | Selected |
|---|---|---|
| Log level (live is ERROR) | WARN / INFO / keep ERROR + deviation | WARN |
| Access log (query strings carry OTT/OAuth/reset keys) | keep JSON, drop RequestPath / errors-only / disable | keep JSON, drop RequestPath |
| Rollout | own stage first / merge into proxy stage | own stage first |
| Proof | canary + grep / config inspection | canary + grep |

## Socket-proxy design

| Question | Options | Selected |
|---|---|---|
| Image | researcher picks DHI-first / tecnativa / wollomatic | researcher picks, DHI-first |
| Placement | micro + own internal overlay / any manager | micro + own internal overlay |
| Deploy path | repo-first + docker service create / separate stack file | repo-first + service create |
| Allow-list | GET-only provider minimum / all GETs | GET-only provider minimum |
| Raw socket | remove in same update / follow-up update | same update |
| Revert gate | standard + provider-error check / standard only | standard + provider-error check |

## SLA measurement

| Question | Options | Selected |
|---|---|---|
| Edge change | thinx_api push routed through edge / plus timed thinx-swarm change | thinx_api push through edge |
| Clock start | git push → served / push_end → served / both, gate on push_end | git push → served via edge |
| Timing | last / before and after proxy | last |
| Runbook scope (multi) | swarm.md SLA gate, proxy ops section, AGENTS.md notes, close P33 list | all four |

## P33 carry-over items

| Question | Options | Selected |
|---|---|---|
| Fold (multi) | tls-config-3 bundle / WR-04 + :80 gaps / real IPs + ipAllowList / operator cleanup | tls-config-3, WR-04 + :80, operator cleanup |
| @swarm HSTS copy | retire / keep both | retire |
| sniStrict | keep false / flip true | keep false |
| vault.yml | delete / re-pin maintained tag | re-pin |
| WR-02 history | rotate only / rotate + filter-repo | rotate only |

## Claude's Discretion

- Stage order among folded items (constraints: logs first, proxy before SLA, SLA last).
- Batching of label-only passes; proxy names, limits, healthcheck; the served-build marker for the SLA stop.

## Deferred Ideas

- Real client IPs (host-mode publishing / PROXY protocol) + ipAllowList with operator IPs.
- sniStrict=true; entrypoint-level :80 redirect; Swarmpit's own docker.sock; HSTS preload submission; VPN; git history rewrite.
