# Privacy Policy Consistency

This document is the human-readable companion to
[`scripts/privacy-policy-check.js`](../scripts/privacy-policy-check.js): a
dependency-free checker that mechanically verifies the concrete, machine-checkable
claims in the THiNX privacy policy against the code that implements them.

## Why

The privacy policy makes specific, testable promises — "API keys are deleted with
devices", "personal data removed within 24 hours", "data provided in standard JSON
format". Those promises are backed by real endpoints and modules. When that code is
refactored or removed, the policy silently becomes a lie. This checker turns the
claim → code relationship into a contract that CI enforces, and surfaces drift that
is real but tolerated (documented WARNs).

## Source-of-truth documents

| File | Role |
| --- | --- |
| `services/console/src/public/privacy.html` | Canonical policy (last updated 2021-11-11) |
| `static/gdpr.html` | Second copy / GDPR consent page (last updated 2018-03-21, currently a stub) |

## How it works

The checker is driven by a **data manifest** (`CLAIMS` in the script). Each entry pairs
a policy sentence with the implementation *signal* that must exist for the promise to
hold, plus a **severity**:

- **FAIL** — a hard contract. The backing code (a file, an Express route, a keyword)
  must exist. If it disappears, the checker exits non-zero and CI breaks.
- **WARN** — documented drift we tolerate. Surfaced in the report but does not fail CI.
- **PASS** — the expected signal was found.

Signal kinds: `file` (file exists), `route` (an `app.<method>("<path>"` registration
in a specific router), `keyword` (a string / RegExp present in a specific file), and
`absence` (a signal whose *presence* would contradict the policy, e.g. data-sale code).

Two cross-cutting checks run in addition to the manifest:

1. **OAuth provider parity** — provider names advertised in the policy text vs providers
   actually implemented. Implemented providers are discovered from `lib/thinx/oauth-*.js`
   and from `lib/router.<provider>.js` files that are mounted in `thinx-core.js`, so the
   check stays correct as providers are added or removed.
2. **Cross-document drift** — compares `privacy.html` against `static/gdpr.html` for
   material claims (contact email, 24-hour retention window, named OAuth providers) and
   warns when they diverge.

## Traceability matrix

| Claim (id) | Policy statement | Implementing file / endpoint | Status |
| --- | --- | --- | --- |
| `personal-data-24h-deletion` | Personal data marked deleted and removed within 24 hours of request | `lib/thinx/gdpr.js` (scheduled sweep) + `lib/thinx/owner_purge.js` | PASS |
| `apikeys-deleted-with-devices` | API keys deleted with devices on GDPR Data Deletion | `lib/thinx/owner_purge.js` (Redis `ak:` bucket + device revoke), `DELETE /api/v2/gdpr` | PASS |
| `retained-queues-invalidated` | Retained-message queues invalidated on account revocation | `lib/thinx/owner_purge.js` `_revokeDevices` → `lib/thinx/devices.js` `revoke` | PASS |
| `data-transfer-json-export` | Personal/device/environment data exportable as JSON | `lib/router.gdpr.js` `transferGDPR`, `POST /api/v2/gdpr` | PASS |
| `gdpr-consent-endpoint` | Consent capture / withdrawal | `lib/router.gdpr.js` `setGDPR`, `PUT /api/v2/gdpr` | PASS |
| `ip-logging-malicious-requests` | IP addresses of malicious/invalid requests logged | `lib/thinx/logger.js` (shared Winston logger) | **WARN** |
| `cookies-usage` | Site may use cookies | cookie handling in `lib/router.js` | PASS |
| `no-selling-pii` | PII is not sold/traded/rented | verified by absence in `lib/thinx/transfer.js` | PASS |
| `oauth-provider-parity` | Data requested from OAuth provider (Google, Twitter) | `lib/router.github.js` + `lib/thinx/oauth-github.js` (GitHub), `lib/router.google.js` (Google) | **WARN** |
| `cross-document-consistency` | Both policy copies should agree on material claims | `privacy.html` vs `static/gdpr.html` | **WARN** |

## Current findings

Running the checker today yields **7 PASS, 3 WARN, 0 FAIL** (exit code 0).

### WARN — OAuth provider mismatch (headline finding)

The policy tells users their data "will be requested from respective OAuth provider
(**Google, Twitter**)". The codebase implements **GitHub** (`lib/router.github.js`,
`lib/thinx/oauth-github.js`) and **Google** (`lib/router.google.js`, mounted in
`thinx-core.js`). **Twitter OAuth is advertised but not implemented anywhere.**

> Note: the original assumption was "GitHub only", but `lib/router.google.js` is a
> real, mounted Google OAuth2 flow — so the accurate discrepancy is Twitter alone.

Remediation options: either implement Twitter OAuth, or amend `privacy.html` to list
the providers that actually exist (GitHub, Google).

### WARN — IP logging of malicious requests

The policy says IP addresses of malicious/invalid requests are logged. The shared
Winston logger (`lib/thinx/logger.js`) exists and persists `warn+` lines, but there is
no dedicated "log the client IP of a malicious request" path, so the specific promise is
only partially backed. Surfaced, not enforced.

### WARN — cross-document drift

`static/gdpr.html` has diverged from `privacy.html`:

- **Contact email** — `privacy.html` lists `privacy@thinx.cloud`; `gdpr.html` has none.
- **Retention window** — the 24-hour deletion window is only in `privacy.html`.
- **Providers** — the named-provider set differs between the two copies.

`gdpr.html` is effectively a stub ("Consent body.", last updated 2018) while `privacy.html`
is the full, current policy. They should be reconciled or the stub removed.

> The provider comparison in the cross-document check is a keyword heuristic; a "google"
> match in `gdpr.html` comes from its Google Tag Manager snippet, not an OAuth mention.
> The drift signal (documents disagree) is nonetheless real.

## Running it

```bash
# Standalone report + exit code (non-zero on any FAIL):
node scripts/privacy-policy-check.js
# or
npm run privacy-check

# As part of the jasmine suite (enforces zero FAILs; WARNs allowed):
npx jasmine spec/jasmine/PrivacyPolicyConsistencySpec.js
```

The checker only reads repository files — no Redis, CouchDB, MQTT, or network access is
required, so it runs anywhere the source tree is checked out.

## Maintaining the manifest

When a policy claim is added or an implementing module moves, update `CLAIMS` in
`scripts/privacy-policy-check.js` and this matrix together. Use `FAIL` severity only for
promises whose backing code must never silently disappear; use `WARN` for known,
documented drift so the signal stays visible without blocking CI.
