# Phase 8 Discussion Log

**Date:** 2026-06-03
**Mode:** auto (goal: complete all phases)
**Phase:** 8 — Auth & Account Lifecycle Closures

## Areas Discussed

Both requirements have explicit binary choices in the requirement text. Asked user to pick.

### Area 1: AUTH-REACTIVATE-01 path

**Options:** (a) admin endpoint vs (b) self-serve email-link vs (c) both.
**User selected:** (a) Admin endpoint `POST /api/v2/admin/user/:id/reactivate`.
**Rationale:** Smaller blast radius, no email infra/token expiry needed, lower attack surface.

### Area 2: AUTH-RESET-LINK-CONSOLE path

**Options:** (a) new `app_config.console_url` config field vs (b) API GET handler redirects to Vue console after reset_key validation.
**User selected:** (b) API redirect.
**Rationale:** No config change needed; Vue console + API share host on rtm.thinx.cloud (nginx path-routed); minimal blast radius.

**Key code-scout finding:** Vue console `/password-reset` route ALREADY exists at `services/console/vue/src/Routes.js:39-41` and `PasswordReset.vue` already reads `reset_key` from `$route.query.reset_key`. The only change needed is the redirect URL at `owner.js:506` from `/password.html?...` to `/password-reset?...`. **No services/console submodule change required.**

## Deferred Ideas Captured

- Self-serve email-link reactivation flow (v2 candidate)
- `app_config.console_url` config field (only if API + console get split to different hosts)
- Admin UI for reactivation in Vue console (v1.10+)
- Unify the API→Vue redirect chain into single Vue-first flow (v2)
