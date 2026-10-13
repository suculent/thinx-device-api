---
phase: quick-261013-kvm
plan: 01
quick_id: 261013-kvm
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/thinx/newrelic.js
  - spec/jasmine/NewRelicLoaderSpec.js
  - thinx.js
  - package.json
  - package-lock.json
  - docker-swarm.yml
autonomous: true
# No REQUIREMENTS.md ID covers APM. Synthetic quick ID, following the repo's quick-task precedent
# (VEP-BUILDER-APIKEY, VD4-FIRMWARE-OWNER). Operator-approved design 2026-10-13, relayed by the
# orchestrator; its points are numbered D-01..D-10 in <objective> for traceability.
requirements: [KVM-NEWRELIC-APM]

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low   # estimate-calibration: factor 1, sample_count 0

must_haves:
  truths:
    - "D-01/D-04: when the API starts via thinx.js with a NEW_RELIC_LICENSE_KEY secret or env var, the New Relic agent is required before thinx-core.js loads, and the seven NEW_RELIC_* settings are already set when it is required"
    - "D-03: without a key the API logs exactly one line, 'ℹ️ [info] [newrelic] NEW_RELIC_LICENSE_KEY not set, New Relic disabled', and never requires newrelic"
    - "D-02: with ENVIRONMENT=test, CI or CIRCLECI set, the loader does not read the key, does not require the agent, sets no NEW_RELIC_* variable and logs nothing"
    - "D-05: if requiring the agent throws, the API keeps starting and the loader logs one line that never contains the key"
    - "D-04/D-05: the key appears in no loader log line. Cookie, Authorization, Proxy-Authorization and Set-Cookie headers and request parameters are excluded from New Relic attributes, exception messages are stripped and application log forwarding is off. These settings are written unconditionally, overwriting any value set beforehand"
    - "D-07: package.json pins newrelic at exactly 14.5.1. package-lock.json either resolves newrelic 14.5.1 with no existing package version changed, or is unchanged and SUMMARY records why"
    - "D-09: docker-swarm.yml declares NEW_RELIC_LICENSE_KEY as an external secret mounted on the api service only, with no environment passthrough"
    - "D-10: nothing is pushed, no prod ssh, no docker service update, no full npm install"
  artifacts:
    - path: lib/thinx/newrelic.js
      provides: "Optional New Relic loader: exported start({env, readSecret, requireAgent, log}) with test/CI skip, readSecret key lookup, hardened NEW_RELIC_* env and a guarded require of the agent"
      contains: "NEW_RELIC_LICENSE_KEY not set, New Relic disabled"
    - path: spec/jasmine/NewRelicLoaderSpec.js
      provides: "Jasmine unit spec with injected fakes covering skip, disabled, started, overwrite and failure paths, and that the key never appears in a log line"
      contains: "request.parameters.*"
    - path: thinx.js
      provides: "Production entry point whose line 1 starts the loader before thinx-core.js"
      contains: 'require("./lib/thinx/newrelic.js").start();'
    - path: package.json
      provides: "Exact newrelic pin in dependencies"
      contains: '"newrelic": "14.5.1"'
    - path: docker-swarm.yml
      provides: "External secret NEW_RELIC_LICENSE_KEY declared and attached to the api service"
      contains: "NEW_RELIC_LICENSE_KEY"
  key_links:
    - from: thinx.js
      to: lib/thinx/newrelic.js
      via: "Line 1 require + start(), ahead of require('./thinx-core.js'), so the agent hooks express/http/redis before they load"
      pattern: '^require\("\./lib/thinx/newrelic\.js"\)\.start\(\);'
    - from: lib/thinx/newrelic.js
      to: lib/thinx/secrets.js
      via: "readSecret('NEW_RELIC_LICENSE_KEY'): /run/secrets file first, then env"
      pattern: 'readSecret\("NEW_RELIC_LICENSE_KEY"\)'
    - from: lib/thinx/newrelic.js
      to: newrelic (npm)
      via: "Default requireAgent, called inside try/catch after the env settings are written"
      pattern: 'require\("newrelic"\)'
    - from: docker-swarm.yml
      to: lib/thinx/secrets.js
      via: "services.api.secrets short syntax mounts /run/secrets/NEW_RELIC_LICENSE_KEY, which readSecret reads first"
      pattern: "- NEW_RELIC_LICENSE_KEY"
---

<objective>
Add optional New Relic APM to the THiNX API (thinx_api only), following the operator-approved design of 2026-10-13. The design points are numbered here so each task can cite them:

- D-01: A new loader `lib/thinx/newrelic.js` is required on the very first line of `thinx.js`, before `thinx-core.js`.
- D-02: If `ENVIRONMENT === "test"`, or `CI` or `CIRCLECI` is set, the loader returns without requiring newrelic.
- D-03: The key is `readSecret("NEW_RELIC_LICENSE_KEY")` from `lib/thinx/secrets.js` (/run/secrets first, then env). With no key, the loader logs exactly `ℹ️ [info] [newrelic] NEW_RELIC_LICENSE_KEY not set, New Relic disabled` (influx.js:187 and globals.js:169 style) and returns.
- D-04: With a key it sets these before loading the agent: NEW_RELIC_LICENSE_KEY=key, NEW_RELIC_APP_NAME (default "THiNX" unless already set), NEW_RELIC_NO_CONFIG_FILE=true, NEW_RELIC_LOG=stdout, NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED=false, NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED=true, and NEW_RELIC_ATTRIBUTES_EXCLUDE with request.headers.cookie, request.headers.authorization, request.headers.proxyAuthorization, request.headers.setCookie*, response.headers.setCookie* and request.parameters.*. The planner checked every name and the list syntax against newrelic@14.5.1 source (see context).
- D-05: `require("newrelic")` runs inside try/catch. A failure logs one line without the key and the API keeps starting. The key is never logged.
- D-06: The module exports a testable `start({env, readSecret, requireAgent, log})` so specs can inject fakes. Required from thinx.js, it runs with the real dependencies.
- D-07: package.json gets `"newrelic": "14.5.1"` (exact; the newest release at least two weeks old). A lock-only install attempt updates package-lock.json. If that is denied or fails, the lock stays as it is and SUMMARY records why.
- D-08: The Jasmine spec `spec/jasmine/NewRelicLoaderSpec.js` runs in the normal suite.
- D-09: `docker-swarm.yml` declares an external secret NEW_RELIC_LICENSE_KEY and attaches it to the api service, following the existing secrets pattern.
- D-10: Out of scope: pushing, prod ssh and `docker service update`. The orchestrator ships the change and attaches the secret.

Planner choices (discretion, all within the design):
- How D-01/D-06 run: thinx.js line 1 is `require("./lib/thinx/newrelic.js").start();`. Requiring and starting happen on that one first line, but the module itself runs nothing at require time. A spec or tool that requires the module therefore cannot load the real agent by accident, even on a laptop that has a key in its shell. Production behaviour is the same as a module that starts itself on import. If the operator wants a literal import-time start, the only change is to move the call into the module, and that brings this risk back.
- start() returns a status string, "skipped", "disabled", "started" or "failed", so the spec can assert the path taken.
- The skip check (D-02) runs before readSecret, so test and CI runs never read the key. That path logs nothing.
- The three hardening settings (attributes exclude, exception-message stripping, log forwarding off) and NEW_RELIC_LOG / NEW_RELIC_NO_CONFIG_FILE overwrite any value already set, so a stray env var cannot weaken them. Only NEW_RELIC_APP_NAME keeps an operator-set value.
- The key is trimmed, and an empty or whitespace-only value counts as not set. On success the loader logs one info line, `ℹ️ [info] [newrelic] agent loaded, app name <name>` (never the key), so the orchestrator can confirm the rollout from the logs.

Purpose: the operator gets APM for the API, switched on and off only by whether the swarm secret is attached. It is off in tests and CI, and the key and request secrets (cookies, auth headers, OTT/OAuth/reset query parameters) stay out of logs and out of New Relic.
Output: `lib/thinx/newrelic.js`, `spec/jasmine/NewRelicLoaderSpec.js`, a one-line change to `thinx.js`, the newrelic pin in `package.json` (and in `package-lock.json` when the lock-only install works), and the secret in `docker-swarm.yml`.

Executor rules (hard, every task):
- Never read `.env` or any `.env*` file. Never run env-dumping commands: bare `env`, `export`, `printenv`, `set`, `declare -x`. `env -i VAR=value node ...` with a command, as used in the verify blocks, is allowed.
- No `npm install`, `npm ci` or `npm update` except the single lock-only command in Task 2. Never require or install the real newrelic package in a test.
- Stage explicit paths only (`git add <path>`, never `-A` or `.`). Commits are signed (repo `commit.gpgsign=true`), use the conventional format `feat(261013-kvm-01): ...` / `chore(261013-kvm-01): ...`, and end with the trailer line `Claude-Session: https://claude.ai/code/session_014ZVXKS2uhAMrLdLzKmNufX`.
- Do not push. No ssh to micro or any host. No `docker service update`, `docker secret create` or `docker stack deploy`.
- Do not touch plaintext port 7442, MQTT/mosquitto or any other service definition (AGENTS.md "Legacy plaintext device port — keep 7442").
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/vue-console/STATE.md
@AGENTS.md

Code sites (read only these):
- thinx.js (14 lines): line 1 today is `const THiNX = require("./thinx-core.js");`. Production starts it with `node --trace-warnings thinx.js` (docker-entrypoint.sh:115). With ENVIRONMENT=test the entrypoint runs `npm run test` instead (lines 88-110), and Jasmine boots `thinx-core.js` through spec/helpers/bootstrap.js. thinx.js never runs in CI.
- lib/thinx/secrets.js (52 lines): `readSecret(name, defaultValue)` returns null when there is no /run/secrets file and no env var. It caches per name and depends only on fs/path, so it is safe to load before the agent. Tab indent and a header comment block: copy this style for the new module.
- lib/thinx/influx.js:184-190 and lib/thinx/globals.js:167-170 are the "<NAME> not set, <feature> disabled" info-line style. The repo's error prefix is `☣️ [error] [<module>]`.
- spec/jasmine/SecretsSpec.js (style model): header comment, `const expect = require('chai').expect;`, synthetic names only, and it never writes real credential names to process.env.
- spec/support/jasmine.json: `spec_files` is `jasmine/*[sS]pec.js`, so `NewRelicLoaderSpec.js` runs in the normal suite (non-ZZ, CI node 0). Its helpers boot the full app, so local runs use `--config=/dev/null`, which skips the helpers and randomises the order.
- scripts/logging-quality-audit.js scans every `console.*(`/`logger.*(` call in lib/** and thinx.js. Its spec (spec/jasmine/LoggingQualityAuditSpec.js) gates high-risk findings at 0. Do not use a variable named `token` or `cookies` inside a log call.
- docker-swarm.yml: the comment block is at lines 21-65 (the INFLUXDB_TOKEN paragraph is 34-41, followed by "Every secret below is declared `external: true`..."), the top-level `secrets:` is at 66-92 (last entry `INFLUXDB_TOKEN`), and the api `secrets:` list is at 276-290 (last entry `- INFLUXDB_TOKEN`), followed by `environment:`.
- Dockerfile:113-114 copies only package.json and runs `npm install --omit=dev .`, so the image does not use the lock. The CircleCI API build job deletes package-lock.json first (.circleci/config.yml "Clean package-lock"). Snyk monitor (main only) reads the root lock.
- package.json `overrides` force-pin, among others, protobufjs 7.1.1, async 2.6.4 and cookie 1.0.2 across the whole tree. newrelic's OpenTelemetry/gRPC dependencies may sit under them. Leave `overrides` alone and only report it (Task 2).

New Relic agent facts the planner verified in the newrelic@14.5.1 source (unpkg lib/config/default.js, lib/config/index.js, lib/config/formatters.js, lib/header-attributes.js, lib/transaction/index.js):
- Env names are `NEW_RELIC_` + the config path in upper case, joined by `_` (index.js `deriveEnvVar`). That gives NEW_RELIC_LICENSE_KEY, NEW_RELIC_APP_NAME (split on `,` or `;`), NEW_RELIC_ATTRIBUTES_EXCLUDE, NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED and NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED. Two names are explicit: NEW_RELIC_LOG (logging.filepath; "stdout" is a special case) and NEW_RELIC_NO_CONFIG_FILE (index.js, truthy means no newrelic.js lookup).
- `attributes.exclude` uses the `array` formatter: it splits on "," and trims, `*` works as a wildcard only at the end, and header names must be camelCase. The header map gives cookie→`cookie`, authorization→`authorization`, proxy-authorization→`proxyAuthorization`, set-cookie→`setCookie`.
- Defaults: `allow_all_headers` is false, and the only request headers captured are accept, content-length, content-type, referer (query stripped), user-agent and host. THiNX's custom device `Authentication` header is not among them. Query parameters become `request.parameters.*` attributes only when included, and route parameters are `request.parameters.route.*`.
- The agent keeps a `redacted_license_key` and logs env values only at trace level, redacted. `distributed_tracing.exclude_newrelic_header` exists but is not set (accepted, T-kvm-10).

Package Legitimacy Audit (planner, 2026-10-13, npm registry, read-only):

| Package | Version | Status | Evidence |
|---------|---------|--------|----------|
| newrelic | 14.5.1 | [VERIFIED] | Official New Relic Node agent: repository github.com/newrelic/node-newrelic, Apache-2.0, sole maintainer `newrelic <nodejs@newrelic.com>`. Published 2026-09-24T18:01Z by a GitHub Actions trusted publisher (OIDC) with a provenance attestation. It is the newest release at least 14 days old: 14.6.0 (2026-10-06) and 14.7.0 (2026-10-07) are newer than that. engines node >=22 (base image is dhi.io/node:26-alpine3.24-dev), no peerDependencies. Integrity sha512-HOb0dOvVCCgUkMAER9HmhmpGPditNOInrUwMWIQAESCwKgNnXSk9SqK5tau3Xfs7dByFpeW/OsmA+RDufA3zEg== |

The operator chose this exact version. The lock-only install runs with `--ignore-scripts` and executes no package code, so no human-verify checkpoint is needed.

Baseline (planner, 2026-10-13 at b89c9edd):
- `ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/SecretsSpec.js` passes: 9 specs, 0 failures.
- `npx eslint thinx.js lib/thinx/secrets.js spec/jasmine/SecretsSpec.js` reports no errors.
- docker-swarm.yml parses with the repo's `yaml` package and has 13 top-level secrets and 13 on api.
- The root dependencies of package-lock.json match package.json (0 mismatches).
- node_modules/newrelic does not exist.
- Local npm 10.8.1, lockfileVersion 3.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end optional agent load: thinx.js line 1 -> loader -> readSecret -> hardened env -> guarded require("newrelic")</name>
  <files>lib/thinx/newrelic.js, spec/jasmine/NewRelicLoaderSpec.js, thinx.js</files>
  <read_first>thinx.js (whole, 14 lines), lib/thinx/secrets.js (whole), lib/thinx/influx.js (lines 184-190), spec/jasmine/SecretsSpec.js (lines 1-40)</read_first>
  <behavior>
    - D-02: env {ENVIRONMENT:"test"}, env {ENVIRONMENT:"production", CI:"true"} and env {ENVIRONMENT:"production", CIRCLECI:"true"}, each with readSecret returning the fake key: start returns "skipped". readSecret, requireAgent and log are never called, and env deep-equals its input.
    - D-03: env {ENVIRONMENT:"production"} with readSecret returning null, then "", then "   ": start returns "disabled". readSecret is called exactly once, with "NEW_RELIC_LICENSE_KEY". requireAgent is never called. The log lines deep-equal ["ℹ️ [info] [newrelic] NEW_RELIC_LICENSE_KEY not set, New Relic disabled"]. env gains no key starting with NEW_RELIC_.
    - D-04: with the fake key, start returns "started" and requireAgent is called exactly once. The env snapshot taken inside requireAgent, filtered to NEW_RELIC_* keys, deep-equals {NEW_RELIC_LICENSE_KEY: FAKE_KEY, NEW_RELIC_APP_NAME: "THiNX", NEW_RELIC_NO_CONFIG_FILE: "true", NEW_RELIC_LOG: "stdout", NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED: "false", NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED: "true", NEW_RELIC_ATTRIBUTES_EXCLUDE: "request.headers.cookie,request.headers.authorization,request.headers.proxyAuthorization,request.headers.setCookie*,response.headers.setCookie*,request.parameters.*"}. There is exactly one log line; it contains "[newrelic]" and "THiNX".
    - D-04: readSecret returning the fake key with two spaces on each side results in env.NEW_RELIC_LICENSE_KEY === FAKE_KEY.
    - D-04: with NEW_RELIC_APP_NAME "THiNX-staging" set beforehand, that name is kept. Values set beforehand for NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED ("false"), NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED ("true") and NEW_RELIC_ATTRIBUTES_EXCLUDE ("") are overwritten with the hardened values above.
    - D-05: requireAgent throws an Error whose message is "bad license " + FAKE_KEY + "\nsecond line", with code "E_FAKE". start does not throw and returns "failed". There is exactly one log line; it contains "[newrelic]" and "E_FAKE", and no newline.
    - D-05: requireAgent throws the plain string "boom " + FAKE_KEY, and then throws undefined. Each time start does not throw, returns "failed" and logs exactly one line.
    - D-05: across every case above, no captured log line contains FAKE_KEY.
    - D-06: re-requiring the module fresh (after deleting it from require.cache) exports a `start` function and adds no NEW_RELIC_* key to process.env.
  </behavior>
  <action>
Implements D-01 to D-06 and D-08. Write the spec first (RED: it fails because lib/thinx/newrelic.js does not exist yet), then the module (GREEN), then the thinx.js line.

1. spec/jasmine/NewRelicLoaderSpec.js (new). Follow the SecretsSpec.js style: a header comment naming quick 261013-kvm and saying the key is a synthetic marker, not a real key; `const expect = require('chai').expect;`; require the module as `../../lib/thinx/newrelic`. Define `const FAKE_KEY = "kvm-fake-license-key-0123456789abcdef";` and hardcode the expected NEW_RELIC_* object and the disabled line in the spec. Do not import them from the module: the spec is the independent oracle. Write a small `harness(envInit, secretValue, agentImpl)` helper that returns:
   - `env`: a plain-object copy of envInit. Never process.env.
   - `readSecret`: a fake that records each name it is called with and returns secretValue.
   - `requireAgent`: a fake that counts calls, stores a shallow copy of env taken at call time, then runs agentImpl (the default returns an empty object).
   - `log`: a fake that pushes its arguments, joined with a space, into a `lines` array.
   - the recorders above.
   Each `it` builds its own harness (Jasmine runs in random order under --config=/dev/null) and calls `NewRelic.start({ env, readSecret, requireAgent, log })`. Cover every bullet in `<behavior>`. Also keep a suite-level array of every line from every harness and check in an `afterAll` that none of them contains FAKE_KEY. For the fresh-require case, collect the NEW_RELIC_* keys of process.env, delete the module's `require.resolve` entry from `require.cache`, require it again, and assert the key list is unchanged and `typeof start === "function"`. Never assign to process.env in this spec.

2. lib/thinx/newrelic.js (new, CommonJS, tab indent, a header comment like secrets.js). The comment explains that thinx.js line 1 calls start(), why the module must load before everything else, and that the key is never logged. The only top-level require is `require("./secrets")`. Do not require globals.js, any logger, or any other module, and do not write any other `require(` text in comments. Use double quotes in require calls. Define constants for the exact disabled line, APP_NAME_DEFAULT "THiNX" and ATTRIBUTES_EXCLUDE: the six patterns joined by "," with no spaces, in this order: request.headers.cookie, request.headers.authorization, request.headers.proxyAuthorization, request.headers.setCookie*, response.headers.setCookie*, request.parameters.*.
   `function start(deps)` defaults deps to an empty object and creates these locals: `env` (deps.env, otherwise process.env), `readSecret` (deps.readSecret, otherwise the one from ./secrets), `requireAgent` (deps.requireAgent, otherwise an arrow function that returns `require("newrelic")`) and `log` (deps.log, otherwise an arrow function that calls console.log with the line).
   a) D-02 skip: if env.ENVIRONMENT is exactly "test", or env.CI or env.CIRCLECI is a non-empty string, return "skipped" straight away. Do not call readSecret and do not log.
   b) D-03 key: call `readSecret("NEW_RELIC_LICENSE_KEY")` exactly once, with that literal name. If the result is a string, trim it; anything else counts as "". If it is empty, log the disabled line once and return "disabled" without touching env.
   c) D-04 settings: all values are strings, and all are written before the agent is required. Set NEW_RELIC_LICENSE_KEY to the trimmed key. Set NEW_RELIC_APP_NAME to APP_NAME_DEFAULT only when it is unset or empty. Set these unconditionally, overwriting anything there: NEW_RELIC_NO_CONFIG_FILE "true", NEW_RELIC_LOG "stdout", NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED "false", NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED "true", NEW_RELIC_ATTRIBUTES_EXCLUDE ATTRIBUTES_EXCLUDE. Set no other NEW_RELIC_* variable (no log level, no allow_all_headers, no distributed-tracing knobs).
   d) D-05 load: call requireAgent() inside try/catch. On success, log `ℹ️ [info] [newrelic] agent loaded, app name ` followed by env.NEW_RELIC_APP_NAME, and return "started". In the catch, never rethrow:
      - Derive a code: err.code, else err.name, else "Error". Guard against a thrown null, undefined or non-object.
      - Derive a message: the first line of err.message when err is an object with a string message, otherwise of String(err).
      - Replace every occurrence of the key in both the code and the message with "[redacted]" using split/join. Do not build a RegExp from the key.
      - Cap the message at 200 characters.
      - Log one line, `☣️ [error] [newrelic] agent failed to load, New Relic disabled: ` + code + ": " + message, and return "failed".
      The key variable is never passed to log in any branch.
   e) `module.exports = { start };`. Nothing runs at require time (planner choice; see objective).

3. thinx.js: insert a new line 1, `require("./lib/thinx/newrelic.js").start(); // New Relic APM: must load before thinx-core.js (quick 261013-kvm)`. Every existing line stays unchanged below it.

Run the spec (GREEN), then the full verify chain. Its `env -i` smoke steps exercise the real default dependencies: /run/secrets is absent on macOS, so readSecret falls back to the env of that child process. Because node_modules/newrelic is absent, the fake-key smoke covers the real MODULE_NOT_FOUND failure path. If node_modules/newrelic exists, the chain skips the fake-key smoke so that a fake key is never sent to New Relic; record the skip in SUMMARY. Commit lib/thinx/newrelic.js, spec/jasmine/NewRelicLoaderSpec.js and thinx.js by explicit path as `feat(261013-kvm-01): ...` with the Claude-Session trailer.
  </action>
  <verify>
    <automated>ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/NewRelicLoaderSpec.js spec/jasmine/SecretsSpec.js spec/jasmine/LoggingQualityAuditSpec.js && npx eslint thinx.js lib/thinx/newrelic.js spec/jasmine/NewRelicLoaderSpec.js && node --check thinx.js && head -n 1 thinx.js | grep -q '^require("\./lib/thinx/newrelic\.js")\.start();' && sed -n 2p thinx.js | grep -qF 'const THiNX = require("./thinx-core.js");' && test "$(grep -vE '^[[:space:]]*(//|\*|/\*)' lib/thinx/newrelic.js | grep -oE 'require\("[^"]+"\)' | LC_ALL=C sort -u | tr '\n' ' ')" = 'require("./secrets") require("newrelic") ' && OUT="$(env -i PATH="$PATH" ENVIRONMENT=production node -e 'require("./lib/thinx/newrelic.js").start()' 2>&1)" && test "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" = 1 && printf '%s' "$OUT" | grep -qF '[info] [newrelic] NEW_RELIC_LICENSE_KEY not set, New Relic disabled' && test -z "$(env -i PATH="$PATH" ENVIRONMENT=test NEW_RELIC_LICENSE_KEY=kvm-smoke-fake-key-0000 node -e 'require("./lib/thinx/newrelic.js").start()' 2>&1)" && test -z "$(env -i PATH="$PATH" ENVIRONMENT=production CI=true NEW_RELIC_LICENSE_KEY=kvm-smoke-fake-key-0000 node -e 'require("./lib/thinx/newrelic.js").start()' 2>&1)" && test -z "$(env -i PATH="$PATH" ENVIRONMENT=production CIRCLECI=true NEW_RELIC_LICENSE_KEY=kvm-smoke-fake-key-0000 node -e 'require("./lib/thinx/newrelic.js").start()' 2>&1)" && if [ -e node_modules/newrelic ]; then echo "SKIP fake-key smoke: node_modules/newrelic present"; else OUT="$(env -i PATH="$PATH" ENVIRONMENT=production NEW_RELIC_LICENSE_KEY=kvm-smoke-fake-key-0000 node -e 'require("./lib/thinx/newrelic.js").start(); console.log("API_BOOT_CONTINUES")' 2>&1)" && test "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" = 2 && printf '%s' "$OUT" | grep -qF '[error] [newrelic] agent failed to load, New Relic disabled: MODULE_NOT_FOUND' && printf '%s' "$OUT" | grep -qx 'API_BOOT_CONTINUES' && ! printf '%s' "$OUT" | grep -qF 'kvm-smoke-fake-key'; fi</automated>
    <fails_when>The chain fails in any of these cases:
- A NewRelicLoaderSpec case fails: wrong status, readSecret or requireAgent called on the skip path, an env setting missing or with the wrong value when the agent is required, a hardened setting not overwritten, a throw escaping start(), or the fake key in a log line.
- SecretsSpec or the logging-quality audit spec regresses.
- ESLint reports an error in a touched file, or thinx.js has a syntax error.
- thinx.js line 1 is not the loader call, or line 2 is not the original thinx-core require.
- The loader requires anything other than ./secrets and newrelic.
- The real-dependency smoke without a key prints anything other than the single disabled line.
- The test/CI/CIRCLECI smokes print anything.
- With a fake key and no installed agent, the output is not exactly one MODULE_NOT_FOUND error line followed by the boot-continues marker, or it contains the fake key.</fails_when>
  </verify>
  <done>thinx.js line 1 starts the loader before thinx-core.js. lib/thinx/newrelic.js skips silently in test and CI, logs the exact disabled line when there is no key, writes the seven NEW_RELIC_* settings (hardened ones overwritten) before requiring the agent, and survives an agent load failure with one line that never contains the key. NewRelicLoaderSpec passes with --config=/dev/null and is picked up by the normal jasmine glob. SecretsSpec and LoggingQualityAuditSpec still pass. Committed by explicit path.</done>
</task>

<task type="auto">
  <name>Task 2: Pin newrelic 14.5.1 in package.json and update package-lock.json lock-only</name>
  <files>package.json, package-lock.json</files>
  <read_first>package.json (lines 40-90: dependencies and overrides)</read_first>
  <action>
Implements D-07. This task makes no other npm call and does not touch `overrides`.

1. From the repo root run exactly `npm install --package-lock-only --ignore-scripts --save-exact --no-audit --no-fund newrelic@14.5.1`. This is the operator's command plus three flags: `--save-exact` makes npm write "14.5.1" rather than "^14.5.1"; `--no-audit --no-fund` skip extra registry calls. `--package-lock-only` with `--ignore-scripts` writes nothing to node_modules and runs no package script on the laptop. Do not retry with `--legacy-peer-deps` or `--force`.

2. package-lock.json is about 10k lines, so do not print its full diff. Inspect it with `git diff --numstat`, a count of the removed `"version"` lines in a zero-context diff (as the verify block does) and `node -e` queries.

3. Outcome A, the command succeeded:
   - package.json numstat is 1/0: one added line, `"newrelic": "14.5.1",`, alphabetically after "nano". npm sorts dependencies itself. If npm reformatted anything else, restore with `git checkout -- package.json` and add that single line by Edit.
   - In the lock, `packages[""].dependencies.newrelic` and `packages["node_modules/newrelic"].version` are both "14.5.1".
   - No existing `"version"` line is removed.
   - `npm ls newrelic --package-lock-only` exits 0.
   Then run `npm ls protobufjs async cookie --package-lock-only` and copy into SUMMARY the lines under newrelic's subtree. The repo `overrides` force protobufjs 7.1.1, async 2.6.4 and cookie 1.0.2, and newrelic's OpenTelemetry/gRPC dependencies may expect newer versions. A load-time break is contained by the Task 1 try/catch, and the orchestrator watches the first production boot for "agent loaded" versus "agent failed to load".

4. Outcome B: the sandbox denies the command, the network fails, it reports ERESOLVE, or the lock diff removes or changes an existing package version.
   - Run `git checkout -- package.json package-lock.json`.
   - Add the single line `"newrelic": "14.5.1",` to `dependencies` after "nano" by Edit, and leave package-lock.json unchanged.
   - In SUMMARY record the exact command, the first error line (no env output) and these consequences: the image still gets newrelic, because the Dockerfile installs from package.json without the lock and the CI build job deletes the lock; but the lock is now behind package.json, which the orchestrator should regenerate before the next Snyk monitor run on main.
   - If the error was ERESOLVE, say so prominently. The Docker build resolves the same tree without the lock and would likely fail the same way, so the orchestrator must not push until that is resolved.

Commit package.json, plus package-lock.json if it changed, by explicit path as `chore(261013-kvm-01): pin newrelic 14.5.1 ...` with the Claude-Session trailer.
  </action>
  <verify>
    <automated>node -e 'const p=require("./package.json"); if (p.dependencies.newrelic !== "14.5.1" || (p.devDependencies || {}).newrelic) process.exit(1)' && NS="$(git diff --numstat b89c9edd -- package.json)" && test "$(printf '%s\n' "$NS" | awk '{print $1"/"$2}')" = "1/0" && if git diff --quiet b89c9edd -- package-lock.json; then echo "LOCK UNCHANGED: reason must be in SUMMARY (Outcome B)"; else node -e 'const l=require("./package-lock.json"); const r=l.packages[""].dependencies.newrelic; const v=(l.packages["node_modules/newrelic"] || {}).version; if (r !== "14.5.1" || v !== "14.5.1") process.exit(1)' && LD="$(git diff -U0 b89c9edd -- package-lock.json)" && test "$(printf '%s\n' "$LD" | grep -cE '^-[[:space:]]+"version":')" = 0 && npm ls newrelic --package-lock-only >/dev/null; fi</automated>
    <fails_when>The check compares the working tree with the planning baseline b89c9edd, so it gives the same result before or after the Task 2 commit. If an unrelated commit has touched package.json or package-lock.json since b89c9edd, use that commit as the base instead. It fails in any of these cases:
- package.json lacks the exact "14.5.1" pin in dependencies, or lists newrelic under devDependencies.
- package.json changed by anything other than one added line.
- The lock changed but does not resolve newrelic 14.5.1 at both the root and node_modules/newrelic.
- The lock changed and removed or changed an existing package version line.
- `npm ls newrelic --package-lock-only` reports the lock tree invalid.</fails_when>
  </verify>
  <done>package.json carries `"newrelic": "14.5.1"` (exact) in dependencies and nothing else changed in it. Either package-lock.json resolves newrelic 14.5.1 with every existing package version unchanged and `npm ls` is clean, or the lock is unchanged and SUMMARY records why and what the orchestrator must do. Committed by explicit path, no node_modules change.</done>
</task>

<task type="auto">
  <name>Task 3: Declare the NEW_RELIC_LICENSE_KEY external secret and attach it to the api service in docker-swarm.yml</name>
  <files>docker-swarm.yml</files>
  <read_first>docker-swarm.yml (lines 19-95 and 263-300)</read_first>
  <action>
Implements D-09. This is an additions-only edit to docker-swarm.yml: no existing line is removed or changed.

1. Top-level `secrets:` block: after the `INFLUXDB_TOKEN:` entry, add `NEW_RELIC_LICENSE_KEY:` with `external: true`, using the same indentation as its neighbours.

2. `services.api.secrets`: after `- INFLUXDB_TOKEN`, add `- NEW_RELIC_LICENSE_KEY` in the same short syntax as the other entries. It is mounted at /run/secrets/NEW_RELIC_LICENSE_KEY, which readSecret reads before env.

3. Header comment block: after the INFLUXDB_TOKEN paragraph (which ends with the INFLUXDB_OPERATOR_TOKEN / D-11 sentence) and before "Every secret below is declared `external: true`", add a short `#` paragraph covering these points:
   - NEW_RELIC_LICENSE_KEY (quick 261013-kvm) is the New Relic ingest license key for optional APM, on the api service only.
   - lib/thinx/newrelic.js loads the agent only when this secret (or the env var) is present. Detaching it is the kill switch: on the next start the API logs "NEW_RELIC_LICENSE_KEY not set, New Relic disabled".
   - It is created by piping the key on stdin into `docker secret create NEW_RELIC_LICENSE_KEY -`, and is never printed or stored elsewhere. Like every secret here it is external, so it must exist before any `docker stack deploy` of this file.
   - There is deliberately no environment entry for it. A service env var is readable by anything that can read the service spec (`docker service inspect`, and the Traefik socket-proxy's GET /services).
   - It is not mounted on worker or transformer.

Leave the "Live state as of ..." name list as it is: the orchestrator updates it after attaching the secret. Do not add or change any `environment:` entry. Do not touch ports (7442/7443), mosquitto/MQTT or any other service.

Commit docker-swarm.yml by explicit path as `chore(261013-kvm-01): declare NEW_RELIC_LICENSE_KEY swarm secret for api` with the Claude-Session trailer.
  </action>
  <verify>
    <automated>node -e 'const y=require("yaml"),fs=require("fs"); const d=y.parse(fs.readFileSync("docker-swarm.yml","utf8")); const N="NEW_RELIC_LICENSE_KEY"; if(!d.secrets[N] || d.secrets[N].external !== true) process.exit(1); if(Object.keys(d.secrets).length !== 14) process.exit(2); const api=d.services.api.secrets; if(api.length !== 14 || api.filter(s => (s.source || s) === N).length !== 1) process.exit(3); for (const [name, svc] of Object.entries(d.services)) { if (name !== "api" && (svc.secrets || []).some(s => (s.source || s) === N)) process.exit(4); } if ((d.services.api.environment || []).some(e => String(e).split("=")[0] === N)) process.exit(5);' && NS="$(git diff --numstat b89c9edd -- docker-swarm.yml)" && test "$(printf '%s\n' "$NS" | awk '{print $2}')" = 0 && test "$(printf '%s\n' "$NS" | awk '{print $1}')" -gt 0</automated>
    <fails_when>The check compares the working tree with the planning baseline b89c9edd (the same result before or after the commit; if an unrelated commit has touched docker-swarm.yml since then, use it as the base). It fails in any of these cases:
- docker-swarm.yml no longer parses.
- NEW_RELIC_LICENSE_KEY is not a top-level `external: true` secret.
- The top-level secret count is not 14.
- The api service does not mount it exactly once, or api's secret count is not 14.
- Any other service mounts it.
- api's environment gains a NEW_RELIC_LICENSE_KEY entry.
- Any existing line was deleted or changed.</fails_when>
  </verify>
  <done>docker-swarm.yml declares NEW_RELIC_LICENSE_KEY as an external secret and mounts it on api only, with an explanatory comment and no env passthrough. The edit is additions only, and ports, MQTT and the other services are untouched. Committed by explicit path.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API process -> New Relic collector (HTTPS, egress) | Transaction, error and attribute data leave the swarm for a third party. Request data from untrusted API and device clients (headers, query strings carrying OTT / OAuth code+state / activation / reset keys) must not cross |
| Swarm secret store -> API process | The license key is mounted at /run/secrets and copied into process.env at runtime |
| API process -> stdout / docker logs | Loader lines and agent logs (NEW_RELIC_LOG=stdout) are readable by anyone with node or Docker API access |
| npm registry -> image build / laptop | A new third-party dependency tree enters the image |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-kvm-01 | Information Disclosure | lib/thinx/newrelic.js log lines | high | mitigate | The key is never passed to log. The failure line keeps only the first line of the error message, replaces the key with "[redacted]" by split/join and is capped at 200 characters. NewRelicLoaderSpec checks every captured line, including one where the thrown message contains the key, and the Task 1 smoke greps the real output for the fake key |
| T-kvm-02 | Information Disclosure | Agent attributes (request headers and parameters) | high | mitigate | NEW_RELIC_ATTRIBUTES_EXCLUDE covers cookie, authorization, proxyAuthorization, request/response setCookie* and request.parameters.* (query and route parameters, so OTTs, OAuth code/state, activation and reset keys). It is written unconditionally before the agent loads, and the spec pins both the exact string and the overwrite. Agent defaults verified in the 14.5.1 source: allow_all_headers is false, the device `Authentication` header is outside the captured set, and the referer query is stripped |
| T-kvm-03 | Information Disclosure | Agent error capture | medium | mitigate | NEW_RELIC_STRIP_EXCEPTION_MESSAGES_ENABLED=true, unconditional and pinned by the spec. Stack traces (code paths only) are still sent; accepted |
| T-kvm-04 | Information Disclosure | Agent application-log forwarding | medium | mitigate | NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED=false, unconditional and pinned by the spec, so console/winston lines (owner IDs, device data) are never shipped |
| T-kvm-05 | Information Disclosure / Repudiation | CI and test runs reporting to New Relic | medium | mitigate | The ENVIRONMENT=test / CI / CIRCLECI check returns before readSecret, so the key is not even read. The spec asserts readSecret, requireAgent and log are not called. Jasmine boots thinx-core.js, never thinx.js. The Task 1 smokes run the real dependencies with a key under each skip condition and expect no output |
| T-kvm-06 | Information Disclosure | docker-swarm.yml key delivery | medium | mitigate | The key is delivered only as an external swarm secret file, never as a service env var, which would be visible through `docker service inspect` and the socket-proxy's /services. It is mounted on api only. The Task 3 YAML gate fails on an env entry or a mount on another service |
| T-kvm-07 | Information Disclosure | process.env copy of the key, inherited by API child processes | low | accept | The API already holds COUCHDB_PASS, REDIS_PASSWORD and the Rollbar token in env. Its child processes are trusted binaries (git, ssh, hostname), and firmware builds run in separate worker containers with their own env. A runtime process.env assignment does not appear in /proc/1/environ or in `docker inspect` |
| T-kvm-08 | Denial of Service | Agent load and instrumentation inside the API | medium | mitigate | require("newrelic") runs in try/catch and the API keeps booting (spec, plus the real MODULE_NOT_FOUND smoke). The kill switch is to detach the secret: the loader then logs the disabled line and never loads the agent, with no image rebuild. Residual risks are Node 26 being outside New Relic's tested matrix (engines >=22) and package.json overrides (protobufjs 7.1.1 and others) reaching the agent's tree. Task 2 records them, and the orchestrator watches the first boot line |
| T-kvm-09 | Information Disclosure | Agent's own stdout log | low | accept | Verified in the 14.5.1 source: the agent keeps a redacted_license_key and logs env values only at trace level, redacted. The loader leaves the level at the default (info) and never sets NEW_RELIC_LOG_LEVEL |
| T-kvm-10 | Information Disclosure | Distributed-tracing headers on outbound calls (GitHub, Slack, Mailgun, Google) | low | accept | `newrelic`/`traceparent` headers reveal New Relic account and app IDs to third parties. These are identifiers, not credentials. The knob NEW_RELIC_DISTRIBUTED_TRACING_EXCLUDE_NEWRELIC_HEADER exists (verified) if the operator wants it; it is not part of the approved design |
| T-kvm-SC | Tampering | npm install of newrelic@14.5.1 | high | mitigate | Exact pin. Legitimacy [VERIFIED] (official package, GitHub Actions trusted publishing with provenance, 19 days old, integrity recorded). The lock-only install uses --ignore-scripts, so no package code runs on the laptop, and there is no full npm install. Residual, accepted (same as every existing dependency): the Dockerfile installs from package.json without the lock, so newrelic's caret-ranged transitive dependencies float at image build and optional native modules run their install scripts in the build container. Snyk monitor on main covers the tree |
</threat_model>

<verification>
- `ENVIRONMENT=development COUCHDB_USER=p43dummy COUCHDB_PASS=p43dummy npx jasmine --config=/dev/null spec/jasmine/NewRelicLoaderSpec.js spec/jasmine/SecretsSpec.js spec/jasmine/LoggingQualityAuditSpec.js` reports 0 failures.
- `npx eslint thinx.js lib/thinx/newrelic.js spec/jasmine/NewRelicLoaderSpec.js` exits 0, and `node --check thinx.js` passes.
- `head -n 1 thinx.js` is the loader call, and line 2 is the original thinx-core require.
- The Task 1 `env -i` smokes pass: one disabled line without a key; silence under test, CI and CIRCLECI; with a fake key and no installed agent, one MODULE_NOT_FOUND error line that does not contain the key, followed by the boot-continues marker.
- package.json has `"newrelic": "14.5.1"`. The lock either resolves it with no existing version changed, or is unchanged and SUMMARY says why.
- The docker-swarm.yml YAML gate passes: 14 secrets, api 14, no env passthrough, no other service mounts the key, additions only.
- `git status --short` shows no leftovers from these tasks. `git log origin/thinx-staging..HEAD` lists the new local commits, unpushed.
</verification>

<success_criteria>
- With the secret attached and the new image deployed, the API loads New Relic before any other module, with request secrets excluded, exception messages stripped and log forwarding off. Without the secret, the API logs one disabled line and runs exactly as before.
- Tests and CI never read the key and never load the agent.
- An agent load failure never stops the API from starting, and the key never appears in a loader log line.
- newrelic is pinned exactly at 14.5.1. The lock state is either correct or explicitly reported for the orchestrator.
- docker-swarm.yml carries the secret for api only, in the existing pattern. Nothing is pushed or deployed.
</success_criteria>

<output>
Create `.planning/workstreams/vue-console/quick/261013-kvm-add-optional-new-relic-apm/261013-kvm-SUMMARY.md` when done. Include:
- The lock outcome (A or B, with the reason for B).
- The `npm ls protobufjs async cookie --package-lock-only` lines under newrelic (Outcome A).
- Whether the fake-key smoke ran or was skipped.
- The commit hashes.
- An orchestrator hand-off note: create the secret from stdin, attach it with `docker service update --secret-add NEW_RELIC_LICENSE_KEY thinx_api` once the image containing newrelic is deployed (either order is safe: an old image ignores the secret, and a new image without the secret logs the disabled line), then confirm the "agent loaded, app name THiNX" line in the thinx_api task log, and update the docker-swarm.yml "Live state" list after attaching.

No key or environment output may appear in SUMMARY.
</output>
