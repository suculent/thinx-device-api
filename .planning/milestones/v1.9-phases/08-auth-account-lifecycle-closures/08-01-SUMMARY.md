---
phase: 08-auth-account-lifecycle-closures
plan: 1
subsystem: auth / admin / account-lifecycle
tags: [auth, admin, account-lifecycle, soft-delete, reactivation]
requires:
  - lib/middleware/requireAdmin.js (admin role gate)
  - lib/thinx/sanitka.js (owner ID sanitization)
  - lib/thinx/util.js (Util.responder, Util.failureResponse)
  - lib/thinx/audit.js (audit log)
provides:
  - "POST /api/v2/admin/user/:id/reactivate (admin-only soft-delete reversal endpoint)"
  - "ZZ-RouterAdminReactivateSpec.js (6-scenario regression spec — auth gate + happy path + idempotency + soft-delete-gate intact)"
affects:
  - "lib/router.admin.js (one new handler `reactivateUser` + one new route registration)"
  - "spec/jasmine/ZZ-RouterAdminReactivateSpec.js (new file)"
not-touched:
  - "lib/router.auth.js (soft-delete login gate at lines 187-193 is unmodified — verified by git diff --stat)"
  - "lib/thinx/owner.js (no Owner.reactivate method added — single-caller one-liner avoided premature abstraction)"
  - "spec/helpers/bootstrap.js (no shared admin fixture — promotion is bracketed inside the new spec's beforeAll/afterAll)"
tech-stack:
  added: []
  patterns:
    - "Mirrors Owner.delete's userlib.atomic('users', 'edit', owner, changes) write pattern; the inverse delta { deleted: false }"
    - "Matches the impersonate handler's sanitka.owner + missing_owner failureResponse pattern (router.admin.js:49,51)"
    - "Callback-style userlib.atomic — matches listUsers/revokeSession callback style in the same file (the file's existing convention)"
key-files:
  created:
    - spec/jasmine/ZZ-RouterAdminReactivateSpec.js
  modified:
    - lib/router.admin.js
decisions:
  - "Callback-style userlib.atomic (not async/await) — chosen to match the existing convention in router.admin.js (listUsers, revokeSession, impersonate all use callbacks). owner.js uses async/await but owner.js was a Phase 7 sweep target; router.admin.js was not."
  - "No Owner.reactivate method added to lib/thinx/owner.js — the write is one line and there is a single caller; an Owner method would be premature abstraction (per plan task 1 action note). If a self-serve flow ships later, it can refactor at that time."
  - "Admin fixture handled by promoting the existing `dynamic` user inside the spec's beforeAll and reverting in afterAll, rather than modifying spec/helpers/bootstrap.js. This honours the execution rule that only lib/router.admin.js and the new spec may be staged."
metrics:
  duration: ~8 minutes
  completed: 2026-06-03
  tasks-completed: 2/2
  files-changed: 2 (1 modified, 1 created)
  lines-added: 279
  lines-deleted: 0
commits:
  - hash: ee42b32f
    message: "feat(AUTH-REACTIVATE-01): admin endpoint POST /api/v2/admin/user/:id/reactivate"
    files: ["lib/router.admin.js", "spec/jasmine/ZZ-RouterAdminReactivateSpec.js"]
    gpg-signed: true
---

# Phase 8 Plan 1: AUTH-REACTIVATE-01 — Admin reactivation endpoint Summary

Admin-only `POST /api/v2/admin/user/:id/reactivate` endpoint plus 6-scenario regression spec that closes the v1.0 UAT gap where soft-deleted users could only be reactivated by direct CouchDB mutation.

## What Shipped

### Final route signature

```
POST /api/v2/admin/user/:id/reactivate
  Middleware: requireAdmin (lib/middleware/requireAdmin.js)
  Handler:    reactivateUser (lib/router.admin.js)
  Behavior:   sanitka.owner(req.params.id) → 400 missing_owner if invalid
              userlib.atomic("users", "edit", :id, { deleted: false }, cb)
              On error: 500 user_update_failed + audit log
              On success: 200 { success: true, response: "reactivated" } + audit log
  Auth gate:  Unauth → 401, non-admin → 403 (via requireAdmin middleware)
```

The handler is **idempotent** by design: writing `{ deleted: false }` on an already-active user still returns `200 reactivated`. No explicit "already active" branch — userlib.atomic absorbs the no-op gracefully.

### Spec coverage matrix

| `it(...)` | Scenario                                                | Must-have(s) bound                           | Threat(s) mitigated |
| --------- | ------------------------------------------------------- | -------------------------------------------- | ------------------- |
| 1         | Unauthenticated POST → 401                              | #2 (non-admin/unauth rejected)               | T-08.1-01           |
| 2         | Non-admin JWT POST → 403                                | #2 (non-admin/unauth rejected)               | T-08.1-01           |
| 3         | Admin POST against soft-deleted user → 200, flag flipped | #1 (admin can reactivate), #6 (envelope)     | T-08.1-01, T-08.1-03 |
| 4         | Admin POST with garbage `:id` → 400 missing_owner       | #6 (no other public signature changes)       | T-08.1-02, T-08.1-05 |
| 5         | Idempotent — admin POST against already-active → 200    | #1 (admin can reactivate)                    | n/a                  |
| 6         | Soft-delete login gate intact + post-reactivation login | #4 (gate at router.auth.js:187-193 intact), #5 (post-reactivation login proceeds) | T-08.1-07           |

All 6 `it(...)` blocks run in the CI canonical Jasmine green-gate.

### Confirmation — files NOT touched

- `lib/router.auth.js`: `git diff --stat lib/router.auth.js` (HEAD~1..HEAD) is empty. The soft-delete login gate at lines 187-193 is verbatim what it was before this plan.
- `lib/thinx/owner.js`: `git diff --stat lib/thinx/owner.js` (HEAD~1..HEAD) is empty. No `Owner.reactivate` method added; the asymmetry with `Owner.delete` (which lives at lines 693-712 in owner.js) is intentional and called out in the handler's inline comment.

## Deviations from Plan

### None — plan executed as written.

The plan-checker WARNING (Task 2: admin fixture handling) was followed via the **first-fallback path**: promote the existing `dynamic` user to `admin: true` inside the spec's own `beforeAll` via `userlib.atomic`, strictly revert in `afterAll`. This avoids modifying `spec/helpers/bootstrap.js` (which would have been outside the execution-rules staging allowlist of `lib/router.admin.js` and the new spec only) and avoids silent `pending()` skips of scenarios 3, 4, 5, 6. All 6 scenarios run actively in CI.

Defensive pending() guards remain in scenarios 3-6 (`if (!admin_was_promoted || !adminJwt) return pending(...)`) so that if the promotion atomic ever fails at runtime, the auth-gate scenarios (1 and 2) still bind must_have #2 and the spec doesn't silently pass — the pending() reasons appear in the Jasmine output.

## Pending-Test Gaps

None. All 6 scenarios actively bind their respective must_haves in the CI green-gate. The defensive `pending()` guards in scenarios 3-6 are runtime fallbacks (only triggered if the admin-fixture promotion fails), not silent skips.

## Self-Check

- ✅ `lib/router.admin.js` exists and contains exactly one `app.post(... reactivate ..., requireAdmin, ...)` registration (line 86) and exactly one `userlib.atomic("users", "edit", target_owner, { deleted: false }, ...)` call (line 73).
- ✅ `spec/jasmine/ZZ-RouterAdminReactivateSpec.js` exists, 258 lines, 6 `it(...)` blocks, 12 references to `/api/v2/admin/user/...reactivate`, parses with `node --check`.
- ✅ Commit `ee42b32f` exists in `git log` on `thinx-staging`.
- ✅ Commit is GPG-signed (verified with `git log --show-signature -1`).
- ✅ Commit contains exactly the two expected files; no deletions (verified with `git diff --diff-filter=D --name-only HEAD~1 HEAD` — empty).
- ✅ `lib/router.auth.js` and `lib/thinx/owner.js` are NOT in the commit (`git diff --stat HEAD~1 HEAD` shows only the two intended files).

## Self-Check: PASSED

## Threat Flags

No new threat surface introduced beyond the scope documented in PLAN.md's `<threat_model>`. All STRIDE entries from the plan are mitigated as designed:
- T-08.1-01 (Elevation of Privilege) → requireAdmin middleware, asserted by spec scenarios 1 and 2.
- T-08.1-02 (Tampering on `:id`) → sanitka.owner sanitization, asserted by spec scenario 4.
- T-08.1-03 (Repudiation) → audit log on both success and failure paths in the handler.
- T-08.1-05 (Information Disclosure) → whitelisted response strings (`missing_owner`, `user_update_failed`, `reactivated`); the raw `err` from userlib.atomic is NOT serialized.
- T-08.1-07 (Tampering on the soft-delete login gate) → router.auth.js unmodified, asserted by spec scenario 6 round-trip.
- T-08-SC (Supply-chain) → no new npm dependencies; the handler reuses imports already present in router.admin.js.

## Follow-ups (out of scope for this plan, intentionally deferred)

- **Self-serve email-link reactivation flow.** Phase 8 D-01 explicitly defers this to a future v1.x phase if product demand emerges. Today's admin-only endpoint satisfies the UAT gap.
- **Admin UI for reactivation in the Vue console.** The endpoint exists, but no Vue console page calls it yet. Operator workflow is curl/Postman for now. v1.10+ candidate.
- **Refactor to Owner.reactivate method.** Currently the write is a one-liner directly in the route handler. If a second caller appears (self-serve flow, batch tool), extract into `Owner.reactivate(owner)` mirroring `Owner.delete`. Until then, the asymmetry stays.
