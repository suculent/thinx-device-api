# Phase 24 deferred items

## Deferred Items

- Worker README and Dockerfile comments name only ROLLBAR_ACCESS_TOKEN
  status: open
  **Found during:** 24-02 Task 2
  **What:** `services/worker/README.md` (env table and the `docker run -e` example) and the comment block in `services/worker/Dockerfile` still document `ROLLBAR_ACCESS_TOKEN` as the only Rollbar name and `-e` as the only way to pass `WORKER_SECRET`. The code now reads `ROLLBAR_SERVER_TOKEN` first and a `/run/secrets` file before env. Neither file was in 24-02's scope. The fallback keeps the documented setup working, so this is a documentation gap only. Fix it with the ROLLBAR_ACCESS_TOKEN removal (todo `2026-09-28-split-rollbar-server-and-client-tokens`).

- Transformer trans.js still reads WORKER_SECRET from env
  status: open
  **Found during:** 24-02 Task 3
  **What:** `services/transformer/trans.js` (the v2 socket transformer, required only by `app.js`, not the image CMD) reads `process.env.WORKER_SECRET` in its `connect_error` handler. It is not on the live path and was outside 24-02's scope, which covered only the Rollbar block in that file. If the v2 socket path is ever revived, route it through `readSecret("WORKER_SECRET")` as in the worker.

- API build-queue cron loop does not dispatch waiting builds in production
  status: open
  **Found during:** 24-05 Task 1 (read-only queue inspection, 2026-09-29)
  **What:** The production build queue holds `waiting` entries that the 5-minute `queue.cron()` loop never dispatches: 0 `Scheduling waiting build action` lines while `queue_keys=4 running=0 waiting=3`. The likely cause, not yet proven, is that `app.redis_client` is the `.legacy()` callback client (`thinx-core.js`, `app.redis_client = app.redis_store_client.legacy()`), so `await this.redis.keys(...)` in `findNext()` never yields an array. Console Build presses are unaffected: `router.build.js` dispatches directly to `nextAvailableWorker()` and uses the queue only when no worker is registered. Out of scope for phase 24 (a pre-existing defect, not caused by the secrets sweep). Fix it with the worker lifecycle todo (`2026-09-28-fix-worker-builder-service-polling-completion-detection`), with a spec that runs `findNext()` against the legacy client.

- Stale entries in the production build queue
  status: open
  **Found during:** 24-05 Task 1 (read-only queue inspection, 2026-09-29)
  **What:** Three `waiting` entries from 2026-09-18 (devices with udid prefixes 36ca3f80, 04ed1650, c7b5bcc0) and one `error` entry from 2022-04-30 sit in the `queue:*` keys. Phase 24 did not touch Redis. Once the cron dispatch above is fixed, these would dispatch as builds, so decide before that fix ships whether to drop them or let them run (a build can offer new firmware to those devices).
