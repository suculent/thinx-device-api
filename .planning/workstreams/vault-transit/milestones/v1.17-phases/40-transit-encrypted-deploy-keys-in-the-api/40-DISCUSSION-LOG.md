# Phase 40 Discussion Log

**Date:** 2026-10-18
**Areas selected:** Builds during an outage, What users see on failure, Rollout and rollback, Outage alerting (all four)

| Area | Question | Options presented | Selected |
|---|---|---|---|
| Builds during an outage | An owner has a new OpenBao key and an old passphrase key, and OpenBao is down | Skip it, try old keys (rec.) / Fail the build at once | Skip it, try old keys |
| Builds during an outage | Retry OpenBao before giving up on a key? | One quick retry (rec.) / No retry / You decide | One quick retry |
| What users see on failure | Key generation while OpenBao is unavailable | Specific message (rec.) / Generic failure | Specific message |
| What users see on failure | Keyed build where every key failed | Explicit log line (rec.) / New build status | Explicit log line |
| Outage alerting | Who is told when the API can't reach OpenBao | Slack, one per incident (rec.) / Log only / New Relic condition | Slack, one per incident |
| Rollout and rollback | Path to production | thinx-unit CI, then staging / Same plus a kill switch (rec.) | Same plus a kill switch |

**Claude's discretion:** the client implementation, the in-memory key format and agent lifecycle, the timeout and retry values, the error-code and env-flag names, file-format detection.

**Todos:** 14 keyword matches were reviewed. None relate to deploy keys, so none were folded in.

**Operator note (same session):** the main merge and the v1.18 GitHub release are held until all of v1.17 is done.
