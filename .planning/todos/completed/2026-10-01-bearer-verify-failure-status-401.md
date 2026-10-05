---
created: 2026-10-01T12:30:00.000Z
title: Answer a failed Bearer verification with 401, not 403
area: api
severity: minor
files:
  - lib/router.js:127 (Bearer verify failure answers 403)
---

## Problem

`lib/router.js` answers a JWT that fails `app.login.verify` with `403` and no body. The FIXME on that
line (from commit 622aa014, 2026-05-26) asks for `401 Unauthorized`. A bad or expired token is an
authentication failure, and 403 also collides with the CSRF layer's 403 `csrf_token_invalid`, which
the consoles treat as "re-prime and retry".

The Phase 25 verifier flagged the marker under the debt-marker gate, because Phase 25 edited the
surrounding Bearer callback (25-REVIEW CR-02). Phase 25 did not change this status code.

## Fix

Change the status to 401, and update the specs that assert 403 for a bad Bearer token (the FIXME's
"in tests as well"). Check that the Vue console's token-refresh path handles 401 (it should log out
or refresh, not retry as for a CSRF rejection).
