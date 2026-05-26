# Phase 2: PII Logging Scrub — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Source:** Synthesized from `.planning/codebase/CONCERNS.md` (Privacy / Logging Exposure section) + REQUIREMENTS SEC-PII-01 + direct grep of `lib/thinx/owner.js`

<domain>
## Phase Boundary

**In scope:** Scrub raw PII and credential material from logs emitted by `lib/thinx/owner.js`. The single file contains all known leak sites; no other module changes are required for the core scope. Both `console.log` (stdout) and `alog.log` (CouchDB audit doc) emissions are in scope — the audit log writes to a queryable database and is a higher-impact leak than transient stdout.

**Out of scope for this phase** (deferrable to v1.x or other phases):
- Other modules under `lib/` that may have similar patterns (`lib/router.user.js postPasswordSet`, `lib/router.auth.js login error paths`, etc.) — touch ONLY if a clear extension of the same patch is trivially safe and same-day; otherwise defer
- Structured logging library introduction (e.g., pino, winston) — too large for v1 GA
- Log-level config tightening (silencing `debug` in prod) — different problem class
- Mailgun error-handling redesign — only redact the existing log lines
- `services/console/*` frontend logging — owned by the console submodule
- The `console.log("[test] sending reset key directly", user.reset_key)` at L166 — test-env only by guard, NOT a production leak, but include in the sweep for hygiene (Plan should treat as "fix opportunistically")

</domain>

<decisions>
## Implementation Decisions

### Redaction patterns (locked)

- **Email:** Replace with first-char + `***` + `@` + domain length, e.g., `m***@10c.cz` for `matej.sychra@tmcoy.cz`. Reasoning: enough signal to disambiguate which user in incident triage; insufficient to enumerate. Implementation: a small `Util.redactEmail(email)` helper if `lib/thinx/util.js` doesn't already have one; otherwise inline.
- **Reset key / activation token / Mailgun API key:** Replace with first-6-chars + ellipsis, e.g., `a1b2c3…` for a 64-char hex. Six chars is non-reversible against any realistic search space but lets ops correlate logs to a session if needed. Implementation: a `Util.redactToken(t, prefix=6)` helper. The current full-length values are 64-char sha256 hex.
- **Mailgun API error (`mailgun 24 err ${err}`):** Replace with `err.message` + `err.statusCode` only — NEVER the full `err` object, which (per the inline comment at L95 `// receives instance of accesstoken(!?)`) carries the API key. Implementation: inline error formatting.
- **Localhost activation link (L223):** The log line is gated behind `app_config.public_url.indexOf("localhost") !== -1` so it only fires in dev/local. Still — the link contains a raw activation token in the URL. Apply token redaction to the printed URL even though the path runs only locally; the redacted form is still usable as a click-through if the operator copies the URL from the log AND has the raw token elsewhere (which they do, on disk). Effectively a hygiene fix, not a security fix.

### Audit log (CouchDB) redaction (locked)

`alog.log(owner, "Attempt to reset password with: " + reset_key, "warning")` at L451 and the parallel call at L583 write to the `managed_logs` CouchDB database. These persist indefinitely (unlike stdout, which rotates) and are queryable. Redacting them is HIGHER priority than the stdout calls. Pattern: same `redactToken` helper. The audit-log row keeps its event-class signal (e.g., `"Attempt to reset password with: a1b2c3…"`), just no raw key.

### What NOT to do (locked)

- Do NOT remove the log lines entirely — ops correlation needs SOMETHING in the log on auth events.
- Do NOT hash with sha256 — that's reversible against a small input space (e.g., all emails in the user DB). Use simple truncation + character-swap that's clearly irreversible.
- Do NOT introduce a new structured-logging dependency. Per AGENTS.md and CONTEXT decision D-04 (Phase 1) — no new npm packages this milestone.
- Do NOT touch `lib/thinx/owner.js` outside the scope of redaction (no cosmetic refactors, no `== → ===` cleanup — that's v1.x REFACTOR-02).
- Do NOT change function signatures of `Owner.password_reset_init` / `set_password_reset` / `sendResetEmail` / etc. — the redaction is purely inside log statements.

### Verification (locked)

- **Static gate:** `grep -nE '(reset_key|activation_token|mailgun_token)' lib/thinx/owner.js | grep -E 'console.log|alog.log' | grep -v 'redactToken\|redactEmail'` must return zero matches (all PII-emitting log lines have been routed through a redactor). Similarly for emails: `grep -nE 'console.log.*\\\${.*email' lib/thinx/owner.js`.
- **Spec coverage:** At least one new spec in `spec/jasmine/ZZ-*` (or extension of an existing one) exercises a path that hits a redacted log line and asserts the log substring matches `^.*[a-f0-9]{6}…$` (token prefix + ellipsis) rather than the raw token. Use console.log spy (sinon? or test-helper double from spec/helpers). chai-http v4 only; no v5 migration (per AGENTS.md lock).

### Claude's discretion

- Whether to put `redactEmail` / `redactToken` in `lib/thinx/util.js` or as private helpers at the top of `owner.js`. Marginal preference for `util.js` since they're useful elsewhere too.
- Exact ellipsis character (`…` U+2026 unicode vs `...` ASCII). Marginal preference for `…` — clearer in logs that it's a truncation marker, not a literal trailing period.
- Whether to write a single spec that exercises all redaction paths, or extend each existing spec that already hits one of the paths. Marginal preference for one new spec — simpler to audit, less merge churn against future changes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (planner, executor) MUST read these before producing artifacts.**

### Requirement
- `.planning/REQUIREMENTS.md` (SEC-PII-01) — validation criteria embedded (static grep gate + spec)

### Codebase intel
- `.planning/codebase/CONCERNS.md` (Privacy / Logging Exposure section) — original site list + replacement pattern suggestions
- `.planning/codebase/ARCHITECTURE.md` — module roles (`lib/thinx/owner.js` is the user-domain class, called from `lib/router.user.js`)
- `.planning/codebase/CONVENTIONS.md` — emoji-prefixed log style; existing `Util.responder` pattern as a template for new util functions

### Phase 1 lessons (apply here)
- `.planning/phases/01-auth-api-password-reset/01-SUMMARY.md` — Wave 2 tightening commit `c67d9af` had to be added mid-execution because the initial fix normalized status but not body. **For Phase 2: probe BOTH the happy and error paths after deploy, not just the happy path.** A redaction that handles only the success path while leaving the error path leaking would repeat that mistake.

### Source under modification
- `lib/thinx/owner.js` — 7+ sites identified by grep. Phase 1 already touched this file's caller pattern (`lib/router.user.js postPasswordReset` calls `Owner.password_reset_init`); the redaction is purely inside `owner.js` log statements, no caller changes needed.
- `lib/thinx/util.js` — likely home for `redactEmail` / `redactToken` helpers (verify whether they already exist).

### Test scaffolding
- `spec/jasmine/ZZ-*` — chai-http v4 patterns; bootstrap.thx pattern from `spec/helpers/bootstrap.js`
- `.planning/codebase/TESTING.md` — Jasmine + nyc setup conventions
- AGENTS.md L82-92 — chai-http v4 lock; do NOT migrate to v5

### Deploy path (lessons from Phase 1)
- `AGENTS.md` L12-19 says `./scripts/stack-deploy`, but the actual script on the swarm host is `./restart.sh`. See parent memory `swarm-deploy-script-name`.
- Post-fix verification: SSH + `restart.sh` + check that the new image rolled in (`docker service ps thinx_api`) BEFORE doing log-tail verification.

</canonical_refs>

<specifics>
## Specific Site List (verified via grep against lib/thinx/owner.js 2026-05-26)

**Primary set (CONCERNS.md):**

| Line | Function | What leaks | Suggested redaction |
|------|----------|------------|---------------------|
| L95 | `sendMail` error callback | Mailgun `err` object (contains API key per inline comment "receives instance of accesstoken(!?)") | `console.log(`☣️ [error] mailgun ${type} err msg=${err.message} status=${err.statusCode}`);` — never the full err |
| L228 | `sendActivationEmail` | User email + raw `new_activation_token` | `console.log(`ℹ️ [info] Sending activation e-mail to ${redactEmail(...)} with token ${redactToken(...)}`);` |
| L451 | `password_reset` (audit) | Raw `reset_key` in CouchDB audit log | `alog.log(owner, "Attempt to reset password with: " + redactToken(reset_key), "warning")` |
| L474 | `password_reset` (debug) | Raw `reset_key` | `console.log(`ℹ️ [info] Attempting to reset password with key ${redactToken(reset_key)}`);` |
| L499 | `password_reset_init` not-found | Raw email | `console.log("☣️ [error] [password_reset_init] email " + redactEmail(email) + " not found in", {body})` — note: still leaks via `{body}` if `body` carries the email; verify and redact `body` too |
| L583 | `set_password_reset` (audit) | Raw `reset_key` in CouchDB audit log | `alog.log(userdoc._id, "Attempt to set password with: " + redactToken(rbody.reset_key), "warning")` |
| L647 | `set_password_reset` finalize (debug) | Raw `reset_key` | `console.log("ℹ️ [info] Resetting password " + redactToken(rbody.reset_key) + "using set_password_reset...")` |

**Additional sites surfaced by grep (not in CONCERNS.md — planner should decide whether to sweep them in this phase):**

| Line | Function | What leaks | Note |
|------|----------|------------|------|
| L166 | `sendResetEmail` test-env branch | Raw `user.reset_key` | Test-env guarded; not a production leak but worth scrubbing for hygiene |
| L186 | `resetUserWithKey` success | Raw `user.reset_key` | Prod debug log — should be redacted |
| L223 | `sendActivationEmail` localhost branch | Activation URL with raw token | Localhost-only; low priority |
| L528 | `activate` (debug) | Raw `ac_owner` + `ac_key` | Prod debug — should be redacted (ac_key is an activation token) |
| L539 | `activate` error | `err` object — depends on contents | Verify whether the error obj carries token material; if yes, redact |
| L653 | `set_password` activation branch | Raw `rbody.activation` | Prod debug — should be redacted |

**Planner recommendation:** Sweep ALL 12 sites in one PR. The mechanical pattern is the same and the marginal cost is low. Splitting into "primary 6" + "additional 6" creates double-review overhead for a trivial extension.

</specifics>

<deferred>
## Deferred Ideas

- **Structured logging library** (pino, winston, bunyan) — out of scope per AGENTS.md "no new npm packages" lock. v1.x candidate.
- **Log-level config** (silencing `debug` in prod) — different problem class; v1.x.
- **Audit-log retention policy** — currently no TTL on `managed_logs`; even with redaction, the audit trail grows unbounded. GDPR-adjacent. v1.x.
- **Mailgun error-object pruning at the library level** — the `mg.messages.create()` library returns the access token in its error object. We're working around it via redaction; fixing the library is upstream and out of scope.
- **Similar log lines outside `lib/thinx/owner.js`** (`lib/router.user.js postPasswordSet`, `lib/router.auth.js` login error paths) — opportunistic sweep IF the planner finds them trivially same-pattern, otherwise file as `SEC-PII-02` v1.x.

</deferred>

---

*Phase: 02-pii-logging-scrub*
*Context gathered: 2026-05-26 — no /gsd-discuss-phase pass needed (CONCERNS.md + grep gave a complete picture)*
