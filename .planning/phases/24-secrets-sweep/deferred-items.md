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
