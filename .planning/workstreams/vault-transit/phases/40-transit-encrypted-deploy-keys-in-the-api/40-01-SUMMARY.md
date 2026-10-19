---
phase: 40-transit-encrypted-deploy-keys-in-the-api
plan: 01
subsystem: api
tags: [openbao, transit, approle, https, ca-pinning, slack-notify, node-forge, docker-compose, circleci, jasmine]

requires:
  - phase: 39-internal-openbao-on-the-swarm
    provides: "OpenBao 2.7.1, the thinx-deploy-keys Transit key, the thinx-api AppRole (20m/1h, no renew), BAO_ADDR/BAO_CACERT and the BAO_ROLE_ID/BAO_SECRET_ID secrets on thinx_api"
provides:
  - "lib/thinx/transit.js: Transit class with TransitError, REASONS, encryptKey, decryptKey, probe, shared(), probeSoon(), unavailableSentence()"
  - "OpenBao 2.7.1 dev server (openbao + openbao-setup) in docker-compose.test.yml with the production thinx-api policy and role"
  - "CircleCI test job step Starting OpenBao"
  - "scripts/openbao-dev.sh up/down/run laptop wrapper"
  - "spec/fixtures/mock-openbao.js scriptable https mock with a runtime CA"
  - "TransitSpec, TransitIntegrationSpec and the OpenBao Transit describe in SecretsSweepSpec"
  - "Boot probe hook in thinx-core.js"
affects: [40-02, 40-03, 40-04, 40-05, 41]

actuals:
  tokens: 14045
  tasks: 2
  commits: 3
plan_head_before: b208f02faef5a9f836021e5243375359c142647f
plan_head_after: 9526d7be344e16862e75ae48e0aa2961a67728bd

tech-stack:
  added: []
  patterns:
    - "Pinned-CA https.request with agent:false, AbortSignal.timeout and a 64 KiB body cap; outcomes mapped to a fixed reason-class vocabulary"
    - "Single-flight AppRole login plus a one-retry wrapper that forces a fresh login"
    - "Per-process incident tracker posting one FAILING and one RECOVERED Slack text, slack-notify injected like redis-health.js"
    - "Runtime node-forge CA and leaf for https mocks, no committed key material"

key-files:
  created:
    - lib/thinx/transit.js
    - scripts/openbao-dev.sh
    - spec/fixtures/mock-openbao.js
    - spec/jasmine/TransitSpec.js
    - spec/jasmine/TransitIntegrationSpec.js
  modified:
    - docker-compose.test.yml
    - .circleci/config.yml
    - thinx-core.js
    - spec/jasmine/SecretsSweepSpec.js

key-decisions:
  - "A denied login (HTTP 400/403 on auth/approle/login) is not retried: the same role_id/secret_id would be refused again. Login failures of the other retryable classes are retried once, so a key still costs at most four requests."
  - "SNI servername is set only for DNS names; for an IP literal (127.0.0.1 in the mock and the laptop wrapper) it is omitted per RFC 6066, and hostname verification still checks the IP SAN."
  - "Slack alerts use username transit, icon :rotating_light: and channel #thinx (redis-health.js shape); an undeliverable alert is dropped silently because the failure is already in the log line."
  - "Invalid caller input (non-Buffer or empty plaintext, a string without the vault:vN: prefix) is rejected and logged but opens no incident."
  - "The webhook is read lazily on the first alert, so an http: or unconfigured client never calls readSecret at all."

patterns-established:
  - "Transit log vocabulary: [transit] <op> failed: <reason> status=<n> with op login, encrypt, decrypt or probe; [transit] probe ok"
  - "CI throwaway OpenBao values: role_id thinx-ci-bao-role, secret_id thinx-ci-bao-secret, root thinx-ci-bao-root"

requirements-completed: [KEYENC-04, KEYENC-05]

coverage:
  - id: D1
    description: "Transit client: AppRole login through readSecret, encrypt/decrypt on thinx-deploy-keys, https-only with the BAO_CACERT pin, reason classes"
    requirement: KEYENC-04
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js (contract, no retry, server_error groups)"
        status: pass
      - kind: integration
        ref: "bash scripts/openbao-dev.sh run -- npx jasmine --config=/dev/null --random=false spec/jasmine/TransitIntegrationSpec.js (7 specs, 0 failures)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Token lifecycle: single-flight login, re-login 120 s before expiry, no auth/token endpoint"
    requirement: KEYENC-04
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js#token lifecycle (L1-L4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-02 one retry after a fresh login, bounded timeouts (hung server rejects within 4 x timeout + 500 ms)"
    requirement: KEYENC-04
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js#D-02 retry (R1-R4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-05 one FAILING and one RECOVERED Slack text per incident, bad_ciphertext excluded, no post without a webhook"
    requirement: KEYENC-04
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js#D-05 incident alerts (A1-A4)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Boot probe: probeSoon skipped under test or without BAO_ADDR, unref'd timer, one login, failures logged not thrown; called once in thinx-core.js"
    requirement: KEYENC-04
    verification:
      - kind: unit
        ref: "spec/jasmine/TransitSpec.js#boot probe (P1-P3)"
        status: pass
      - kind: other
        ref: "grep -c probeSoon thinx-core.js == 1"
        status: pass
    human_judgment: false
  - id: D6
    description: "Leak sweep: no role_id, secret_id, token, ciphertext or plaintext in console lines, Slack texts or TransitError fields on success, retry, sealed, denied, timeout and oversize paths (file and env credentials)"
    requirement: KEYENC-04
    verification:
      - kind: unit
        ref: "spec/jasmine/SecretsSweepSpec.js#Secrets sweep: OpenBao Transit client"
        status: pass
    human_judgment: false
  - id: D7
    description: "OpenBao 2.7.1 dev server in docker-compose.test.yml, Starting OpenBao CI step and laptop wrapper"
    requirement: KEYENC-05
    verification:
      - kind: other
        ref: "docker compose -f docker-compose.test.yml config --quiet; node --test spec/node/CiPipelineGates.test.js (30/30); bash scripts/openbao-dev.sh run -- true"
        status: pass
    human_judgment: true
    rationale: "The CircleCI half (pinned docker compose v2.4.1 accepting the named volume, hostname and $$ escaping, RESEARCH A2) is only proven by the first thinx-unit run in Plan 40-05."

duration: 9min
completed: 2026-10-19
status: complete
---

# Phase 40 Plan 01: OpenBao Transit Client and Dev Server Summary

**A dependency-free OpenBao Transit/AppRole client on Node https, with the BAO_CACERT pin, single-flight re-login, one bounded retry and one Slack alert per incident, tested against a runtime-CA mock and a real OpenBao 2.7.1 dev server that CI and the laptop both run.**

## Performance

- **Duration:** about 9 min of execution (after context loading)
- **Started:** 2026-10-19T00:34:53Z
- **Completed:** 2026-10-19T00:44:00Z
- **Tasks:** 2
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments
- `lib/thinx/transit.js` implements the phase-wide interface: `TransitError` (message `transit_<reason>`), the seven `REASONS`, `encryptKey`/`decryptKey`/`probe`, `shared()`, `probeSoon()` and `unavailableSentence()`. It accepts only an https: `BAO_ADDR`, uses the CA from `BAO_CACERT` as its only trust anchor (`rejectUnauthorized: true`, no system store), bounds each request with `AbortSignal.timeout` (3000 ms) and caps bodies at 64 KiB. It never calls `auth/token/*` and sends no AAD.
- Lifecycle: concurrent callers share one login. The client logs in again when less than 120 s of the 1200 s token remain, or after a retryable failure. A key costs at most four requests.
- D-05: one FAILING and one RECOVERED Slack text per incident, carrying only the host, the ISO timestamp and the upper-case reason. bad_ciphertext opens no incident, and a rejecting send never becomes an unhandled rejection.
- An OpenBao 2.7.1 `-dev-tls` server plus an `openbao-setup` one-shot in `docker-compose.test.yml`. The one-shot applies the production policy text and the production role parameters, and pins the CI throwaway ids. The api service gets the four `BAO_` env entries and the read-only CA volume. The CircleCI test job has a `Starting OpenBao` step that never prints the dev server log.
- `scripts/openbao-dev.sh up|down|run` brings up the same server on the laptop. It prints only `OPENBAO-DEV-UP addr=...` and leaves no container or volume behind.
- Boot probe: `Transit.probeSoon()` is called once in `thinx-core.js`. It runs on an unref'd 5 s timer, and is skipped when `ENVIRONMENT=test` or `BAO_ADDR` is unset.

## Task Commits

1. **Task 1: End-to-end Transit round trip (tracer)** - `20db9af7` (feat)
2. **Task 2: Token lifecycle, D-02 retry, D-05 alerts, boot probe, leak sweep (TDD)**
   - RED: `6a01c5ea` (test)
   - GREEN: `9526d7be` (feat)

No REFACTOR commit was needed.

## TDD Gate Compliance (Task 2)

- **RED** (`6a01c5ea`): `npx jasmine --config=/dev/null --random=false spec/jasmine/TransitSpec.js` against the Task 1 module exited 3 with `27 specs, 9 failures`. The failing targets were exactly the planned behaviours:
  - (L3) single-flight: `expected 5 to equal 1` logins;
  - (R1) a 403 with no retry rejected `transit_denied`;
  - (R2, R3, R4): `expected 1 to equal 2` encrypt attempts;
  - (A1): `expected +0 to equal 1` Slack texts;
  - (P1, P2, P3): `Transit.probeSoon is not a function`, because that API did not exist yet.
  The other 18 cases (contract, no-retry, server_error, A2-A4) passed, which shows the fixture worked. Semantic assessment: valid RED. Every failure was an assertion on, or the absence of, a planned behaviour. None came from a fixture, load or syntax fault. The machine classifier (`check tdd-red-evidence`) was not run: jasmine's console reporter is not one of its supported formats, and `workflow.tdd_mode` is not enabled for this workstream.
- **GREEN** (`9526d7be`): 27 of 27 TransitSpec cases pass. The combined run of TransitSpec, SecretsSweepSpec and RedisHealthSpec gives 75 specs, 0 failures.

## Verification Results

| Command | Result |
|---|---|
| `node -e "...T.shared && T.unavailableSentence && T.REASONS.length===7..."` | exit 0 |
| `bash -n scripts/openbao-dev.sh && docker compose -f docker-compose.test.yml config --quiet && node -e "require('yaml').parse(...)" && node --test spec/node/CiPipelineGates.test.js` | pass, 30/30 tests |
| `bash scripts/openbao-dev.sh run -- true` then `docker ps -aq --filter label=com.docker.compose.project=thinx-openbao-dev` | exit 0, prints nothing |
| `ENVIRONMENT=development ... bash scripts/openbao-dev.sh run -- npx jasmine ... TransitIntegrationSpec.js` (Task 1 verify 2, rerun after Task 2) | `7 specs, 0 failures`, no pending, no secret_id or `vault:vN:` in output, no leftover container |
| `ENVIRONMENT=development ... npx jasmine ... TransitSpec.js SecretsSweepSpec.js RedisHealthSpec.js` | `75 specs, 0 failures` |
| `grep -c probeSoon thinx-core.js` | 1 |
| forbidden-pattern grep on `transit.js` (comment lines excluded) | no match |
| `git diff --quiet HEAD -- package.json package-lock.json lib/thinx/rsakey.js lib/thinx/git.js` | exit 0 |
| `grep -c "name: Starting OpenBao" .circleci/config.yml`; `grep "logs openbao"` | 1; none |

## Files Created/Modified
- `lib/thinx/transit.js`: the OpenBao Transit/AppRole client.
- `spec/fixtures/mock-openbao.js`: an https mock of login, encrypt and decrypt with a runtime node-forge CA, a second unrelated CA, a request log of method, path, op and whether a token was present, a connection counter, `script(fn)` and `close()`.
- `spec/jasmine/TransitSpec.js`: 27 unit cases (contract, lifecycle, retry, no-retry, server_error, alerts, probe).
- `spec/jasmine/TransitIntegrationSpec.js`: 7 cases against the dev server. They are pending without `BAO_ADDR`, and fail with `openbao dev server not wired` under `CIRCLECI=true`.
- `spec/jasmine/SecretsSweepSpec.js`: new `FAKE` entries plus a `Secrets sweep: OpenBao Transit client` describe with 12 cases (file and env variants × 6 paths). The GIT_KEY_PASSPHRASE describe is untouched.
- `docker-compose.test.yml`: the openbao and openbao-setup services, the api `BAO_` env, the depends_on entry, the read-only volume, and a top-level `volumes: openbao-devtls`. The file now ends with a newline.
- `.circleci/config.yml`: the `Starting OpenBao` step after Starting Redis, before the tests.
- `scripts/openbao-dev.sh`: the laptop wrapper (executable).
- `thinx-core.js`: the `Transit` require and one `Transit.probeSoon()` call next to `RedisHealth.attach`.

## Decisions Made
See key-decisions in the frontmatter. The two that matter most downstream:
- A denied login is not retried.
- Invalid caller input opens no incident.

Plans 40-02 to 40-04 can rely on `decryptKey` rejecting a malformed string as bad_ciphertext with no request sent.

## Deviations from Plan

None that change behaviour. Two clarifications:
1. **Login retry scope.** The plan's behavior list says "a login 400 gives denied" with no retry. The D-02 truth lists denied among the retryable classes for encrypt and decrypt. Both are honoured: a denied login is final, a denied operation (an expired or revoked token) gets one fresh login and one retry.
2. **SNI for IP literals.** The plan says "servername set to the hostname". For an IP literal the servername is omitted, because Node refuses IP SNI (RFC 6066, DEP0123). Certificate and hostname verification are unchanged, and the IP SAN is still checked.

**Total deviations:** 0 auto-fixed. **Impact:** none.

## Issues Encountered
- Laptop-only: `ports: '8200'` publishes the dev server on a random host port on every interface while `scripts/openbao-dev.sh` runs. It is ephemeral and carries only throwaway credentials, and CI is unaffected (remote Docker).

## Threat Flags
None beyond the plan's threat model. The new surface is the client-to-OpenBao path (T-40-01, T-40-02, T-40-03) and the CI throwaway values (T-40-04), all already registered.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- Ready for 40-02 (rsakey.js/git.js consume `encryptKey`, `decryptKey`, `TransitError.reason` and `unavailableSentence`).
- Open until 40-05: the first `thinx-unit` CircleCI run proves that docker compose v2.4.1 accepts the named volume, `hostname:` and `$$` escaping (RESEARCH A2). Nothing was pushed.

---
*Phase: 40-transit-encrypted-deploy-keys-in-the-api*
*Completed: 2026-10-19*

## Self-Check: PASSED
