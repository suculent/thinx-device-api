# Milestones: vue-console workstream

Workstream-scoped ledger. The project-wide ledger is `.planning/MILESTONES.md`.

## v1.18 Console Improvements (Shipped: 2026-10-18)

**Delivered:** The Vue console reached Legacy-console parity on the pages operators use every day (device list,
deploy keys, transformers and environment globals, build logs), deep links survive a reload, a Cypress suite
gates every Vue image build, and the three gaps the milestone audit found were closed in an inserted phase.

**Phases completed:** 42–48 and 48.1 (8 phases, 37 plans, 82 tasks)

**Key accomplishments:**
- CI trimmed for the milestone (Snyk on `main` only, legacy console build behind a pipeline parameter) and later
  re-enabled; a context-free `test-vue-console` job now gates both Vue image jobs on unit tests, the build and
  Cypress with JUnit stored (CI-05, CI-06, CI-07).
- Notification delivery fixed end to end: several Legacy tabs per owner, one terminal build-status frame per build,
  the escaped actionable toast live (NOTIF-01..03).
- Device list, deploy keys, transformers and environment globals brought to parity: platform bullets and icon
  actions, deploy-key rename and confirmed delete, typed-`confirm` bulk delete, atomic environment-variable edit,
  unsaved-change guards on Device Detail.
- Build-log search with highlight, count and stepping; one `hasBuildLog` predicate and one status-colour scheme on
  every build list; a View button that meets WCAG 2.5.3.
- Vue deep links survive a reload (including `/#/app/admin/users` for admins); four stores now surface a network
  failure as one error instead of stale or empty data; five new stub-backed Cypress specs cover the Phase 44–47 pages.
- Review loop on 48.1 closed a stale-profile class: the profile store is reset on sign-out, before the sign-in read
  and on both ends of admin impersonation, and the Header binds to the store.

**Stats:**
- 8 phases, 37 plans, 82 tasks; 33/33 requirements complete
- Console `services/console` branch `thinx-staging`: 60a0de4 → ec63c74 (163 signed commits since 2026-10-12)
- Parent `thinx-staging`: 9183c69c (2026-10-12) → 95ea22f6 (2026-10-18), plus the close-out commits
- 7 days from first phase commit to ship

**Git range:** parent `9183c69c` → `95ea22f6`; console `60a0de4` → `ec63c74`

**Closeout:** `override_closeout`. Known verification overrides: 10 newly acknowledged at this close (1 debug
session, 5 infra todos, 48.1 UAT and VERIFICATION, 2 deferred items), 10 carried forward from a prior close (see
STATE.md Deferred Items). Phases 42 and 44–48 have stale verification digests because later phases changed files
they cover; Phase 48.1 is `human_needed` with 5 operator checks recorded in its UAT (CircleCI run for `95ea22f`,
served-console reload and offline checks, impersonation spot-check, build-log scroll decision, judgment-tier
prohibitions). Milestone audit status `tech_debt`; its three real gaps (W1–W3) are closed by Phase 48.1.

**Known tech debt carried forward:**
- Build-log search stepping does not scroll the modal log box (`BuildLogDialog.vue` timing; candidate one-file fix
  in `milestones/v1.18-phases/48.1-*/deferred-items.md`, WINDOWS entry 21)
- 48.1 review Info items IN-01..IN-06 (duplicated `refreshAfter`, stale stub comment, double `stubThinxApi`, dead
  harness code, `create()` double reload, `saveNotifications` ignoring `refreshed: false`)
- `auth/setUser` is not updated for the impersonated identity; no Cypress spec covers impersonation (admin.spec.js
  pending by design)
- Tech-debt items listed per phase in `milestones/v1.18-MILESTONE-AUDIT.md`

**What's next:** a new console milestone via `/gsd-new-milestone --ws vue-console`, or close the workstream.

---
