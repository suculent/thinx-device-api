---
phase: quick-261013-kvm
plan: 01
quick_id: 261013-kvm
subsystem: api-observability, swarm-secrets
tags: [newrelic, apm, docker-secrets, observability]
status: complete
requires: []
provides:
  - "lib/thinx/newrelic.js start({env, readSecret, requireAgent, log}) -> skipped | disabled | started | failed"
  - "thinx.js line 1 starts the loader before thinx-core.js"
  - "newrelic 14.5.1 pinned exactly (package.json + package-lock.json)"
  - "docker-swarm.yml: external secret NEW_RELIC_LICENSE_KEY on api only"
affects:
  - thinx.js (production entry point)
  - docker-swarm.yml services.api.secrets
tech-stack:
  added: ["newrelic 14.5.1"]
  patterns: ["dependency-injected start() with status return", "hardening env written unconditionally before agent require", "split/join key redaction in failure line"]
key-files:
  created:
    - lib/thinx/newrelic.js
    - spec/jasmine/NewRelicLoaderSpec.js
  modified:
    - thinx.js
    - package.json
    - package-lock.json
    - docker-swarm.yml
decisions:
  - "Loader runs nothing at require time; thinx.js line 1 calls start(), so requiring the module from a spec or tool can never load the real agent"
  - "Lock-only install succeeded (Outcome A); package.json overrides left untouched although they force protobufjs 7.1.1 under newrelic > @grpc/proto-loader@0.8.1 (wants ^7.5.5)"
metrics:
  duration: "~4 min"
  completed: 2026-10-13
actuals:
  tokens: 18647
  tasks: 3
  commits: 3
plan_head_before: 8260549b67c3c43b2c74d3eda7cca7a5593a4f8a
plan_head_after: 33cb0ed1161941a2668ab352087f50b37639abdf
---

# Quick 261013-kvm: Optional New Relic APM for the API Summary

The API now loads the New Relic agent on thinx.js line 1, but only when the `NEW_RELIC_LICENSE_KEY` swarm secret (or env var) is present. Request secrets stay out of New Relic through attribute excludes, exception-message stripping and disabled log forwarding. The loader does nothing in test or CI, and if the agent fails to load the API keeps booting. newrelic is pinned at exactly 14.5.1 with a clean lock, and the secret is declared external on the api service only.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Loader + spec + thinx.js line 1 (tracer, TDD) | 3603f0ae | lib/thinx/newrelic.js, spec/jasmine/NewRelicLoaderSpec.js, thinx.js |
| 2 | Pin newrelic 14.5.1, lock-only install | d4a9dd7b | package.json, package-lock.json |
| 3 | NEW_RELIC_LICENSE_KEY external secret on api | 33cb0ed1 | docker-swarm.yml |

## Verification

- TDD RED: before the module existed, NewRelicLoaderSpec failed with MODULE_NOT_FOUND on `../../lib/thinx/newrelic`.
- GREEN: `npx jasmine --config=/dev/null` on NewRelicLoaderSpec + SecretsSpec + LoggingQualityAuditSpec gave 32 specs, 0 failures (NewRelicLoaderSpec alone: 13 specs, 0 failures).
- ESLint is clean on thinx.js, lib/thinx/newrelic.js and the spec. `node --check thinx.js` passes. Line 1 is the loader call and line 2 is the original thinx-core require. The loader requires only `./secrets` and `newrelic`.
- `env -i` smokes with the real dependencies:
  - With no key: exactly one line, the disabled line.
  - With ENVIRONMENT=test, CI=true or CIRCLECI=true plus a fake key: no output.
- **The fake-key smoke RAN** (node_modules/newrelic is absent). Output was exactly two lines: `☣️ [error] [newrelic] agent failed to load, New Relic disabled: MODULE_NOT_FOUND: Cannot find module 'newrelic'` and `API_BOOT_CONTINUES`. The fake key does not appear.
- Task 2 gate passes (package.json 1/0, lock resolves 14.5.1 at both places, no version line removed, `npm ls newrelic --package-lock-only` exit 0).
- Task 3 YAML gate passes: 14 top-level secrets and 14 on api, mounted on no other service, no env passthrough, additions only (numstat 15/0).
- Nothing pushed. No ssh, no docker commands.

## Lock outcome: A (lock-only install succeeded)

Command: `npm install --package-lock-only --ignore-scripts --save-exact --no-audit --no-fund newrelic@14.5.1`. Exit 0, "up to date in 6s". node_modules was not touched (node_modules/newrelic still absent).

- package.json: one added line, `"newrelic": "14.5.1",` after "nano".
- package-lock.json: +1104/-16. 91 packages added, 0 removed, 0 existing versions changed. The newrelic integrity matches the planner's audit (`sha512-HOb0dOvV…3Eg==`).
- The 16 removed lines are all `"dev": true` flags. These packages were dev-only and are now also in the production tree via newrelic: @types/estree, color-convert, color-name, date-format, esquery, estraverse, flatted, lodash.camelcase, log4js, path-key, require-directory, source-map, streamroller (+ its fs-extra), wrap-ansi (+ its ansi-styles). Versions are unchanged.

### Override conflict under newrelic (reported, `overrides` left untouched)

`npm ls protobufjs async cookie --package-lock-only` (exit 0), newrelic subtree:

```
├─┬ newrelic@14.5.1
│ └─┬ @grpc/proto-loader@0.8.1
│   └── protobufjs@7.1.1 overridden
```

`@grpc/proto-loader@0.8.1` declares `protobufjs ^7.5.5`, and the root override forces **7.1.1**. async and cookie do not appear under newrelic. Risk: the agent's gRPC/OTLP path may break at load or at first export against the older protobufjs. A load-time throw is contained by the loader's try/catch (the API logs "agent failed to load" and keeps booting). A failure after load, inside the agent, is not contained by the loader. The orchestrator should watch the first production boot for "agent loaded" versus "agent failed to load", and check that data actually reaches New Relic. If it does not, the fix is to relax the protobufjs override (a separate decision, not taken here).

## Deviations from Plan

**1. [Rule 1 - Lint] Removed two unused `eslint-disable-line no-throw-literal` directives from the spec**
- **Found during:** Task 1 verify (ESLint reported 2 warnings, 0 errors: the rule is not enabled in this repo's config)
- **Fix:** removed the directives before the commit. The `throw` statements are unchanged.
- **Commit:** 3603f0ae

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. The new egress to New Relic and the env copy of the key are T-kvm-01..10.

## Orchestrator hand-off

1. The secret `NEW_RELIC_LICENSE_KEY` already exists on the swarm (orchestrator, from stdin). Do not recreate it.
2. Push thinx-staging so CircleCI builds the API image with newrelic. Then attach the secret with `docker service update --secret-add NEW_RELIC_LICENSE_KEY thinx_api`. The order does not matter: an old image ignores the secret, and a new image without it logs the disabled line.
3. Confirm `ℹ️ [info] [newrelic] agent loaded, app name THiNX` in the thinx_api task log. If you see `☣️ [error] [newrelic] agent failed to load` instead, check the protobufjs override first (above).
4. After attaching, update the "Live state as of …" name list in docker-swarm.yml (left unchanged here on purpose).
5. The kill switch is `docker service update --secret-rm NEW_RELIC_LICENSE_KEY thinx_api`.

## Self-Check: PASSED

- FOUND: lib/thinx/newrelic.js, spec/jasmine/NewRelicLoaderSpec.js, thinx.js, package.json, package-lock.json, docker-swarm.yml
- FOUND commits: 3603f0ae, d4a9dd7b, 33cb0ed1 (ancestors of HEAD; measured 3 commits from 8260549b)

## Rollout (orchestrator, 2026-10-13)

- `97ea9f78` raised the `protobufjs` override 7.1.1 → 7.6.6 (CVE-2023-36665; newrelic's proto-loader needs ^7.5.5).
- Pipeline 5664 (`97ea9f7`): `CI-GATES PIPELINE OK`, legacy-off. New api task logged
  `NEW_RELIC_LICENSE_KEY not set, New Relic disabled` before the attach (graceful disable confirmed live).
- Secret `NEW_RELIC_LICENSE_KEY` was created on the swarm from the operator's staged `/root/.newrelic_key`, which was
  then shredded (`shred -u`); the value was never printed. `/root` is not in the daily gluster backup.
- `docker service update --secret-add source=NEW_RELIC_LICENSE_KEY,target=NEW_RELIC_LICENSE_KEY,mode=0400 thinx_api`
  (10 → 11 secrets). The new task logged `agent loaded, app name THiNX`, the agent connected to
  `collector.eu01.nr-data.net:443` and reached `started`. Key prefix appears 0 times in the task log.
- After: `/api/user/profile` 401 (API up), `:7442` 200, `WS-MULTITAB OK 2/2`. Kill switch: `--secret-rm NEW_RELIC_LICENSE_KEY`.
- thinx-swarm `2121066` mounts the secret in `thinx.yml` (pushed to origin and fast-forwarded on micro); mirror regenerated.
- Noise: the agent logs one "Failed to get information about vendor azure" utilization probe error at start (harmless).
