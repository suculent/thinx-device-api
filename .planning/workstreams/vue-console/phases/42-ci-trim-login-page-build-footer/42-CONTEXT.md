# Phase 42: CI Trim, Login Page & Build Footer - Context

**Gathered:** 2026-10-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Three deliverables, two repos:

1. **Parent `.circleci/config.yml`:** Snyk monitors run on `main` only (CI-04). The legacy console image build is paused behind a gate for the rest of v1.18 (CI-05), with a one-pipeline bypass that Phase 43 uses for NOTIF-01.
2. **`services/console` Vue login page:** a THiNX logo above a darkened auth panel titled "Welcome to THiNX Management Console.", a green Login button, and the Google/GitHub buttons directly under it (LOGIN-01..03).
3. **Vue footers (login, password reset, authenticated layout):** © year from the build date plus the short commit id. No hard-coded 2026 (UI-05).

Out of this phase: the Phase 43 one-off legacy build itself (this phase only provides the mechanism), CI-06 re-enable (Phase 48), and any Legacy console change.

</domain>

<decisions>
## Implementation Decisions

### CI-05: Legacy console build gate
- **D-01:** Add a CircleCI pipeline parameter `build_legacy_console` (boolean, **default `false`** during v1.18). Guard `console-classic-registry`, `console-classic-hub` and `snyk-monitor-console-classic` with it. Implementation detail is up to the planner, for example a separate gated workflow, or `when:` on the workflow; CircleCI 2.1 cannot put `when` on an individual job in a workflow, so the gated jobs likely need their own workflow. Mark the gated block with a clear `# v1.18 CI-05` comment.
- **D-02:** The parameter is **permanent**. Phase 48 (CI-06) flips the default to `true` instead of removing the gate, so the switch can be used for future pauses. This meets "a single revert restores it": restoring is a one-line default change. Make the CI-05 edit its own commit anyway.
- **D-03:** The gate covers **both** the private-registry build (staging) and the Docker Hub mirror (`console-classic-hub` on main). While v1.18 is open no legacy image builds anywhere. `thinx/console:swarm` and `thinxcloud/console:latest` stay at their current images.
- **D-04:** Phase 43 triggers the bypass through the **CircleCI API, `thinx-staging` only**: `POST /api/v2/project/gh/suculent/thinx-device-api/pipeline` with `{"branch":"thinx-staging","parameters":{"build_legacy_console":true}}` (verify the project slug). The plan must include this as a copy-ready runbook snippet (token via env var, never echoed) so Phase 43 can reuse it.

### CI-04: Snyk monitors on main
- **D-05:** Every Snyk monitor job (`snyk-code-monitor`, `snyk-oss-monitor`, all `snyk-container-monitor` instances except `snyk-monitor-base`, which stays `base`-only) uses `branches: only: [main]`. That takes them off `thinx-staging` and also off the `thinx-console` dev branch.
- **D-06:** `snyk-monitor-console-vue` scans **`thinxcloud/console:vue` on docker.io** and requires `vue-console-hub`, in the same shape as `snyk-monitor-api` with `api-hub`. Drop the private-registry setting and the `thinx-docker-repo` context if the Hub pull no longer needs them (keep `dockerhub` for `SNYK_TOKEN`).
- **D-07:** `snyk-monitor-console-classic` moves to main and Hub too: image `thinxcloud/console:latest`, requires `console-classic-hub`, filter `main`, **inside the D-01 gate**. It is off for the rest of v1.18 and runs automatically on main once CI-06 flips the default.
- **D-08:** Validation: run `circleci config validate` locally if the CLI is present, and always use the CircleCI MCP `validate_config`. After the push, check the `thinx-staging` pipeline's job list: no `snyk-*` jobs and no `console-classic-*` jobs, while `test`, `api-registry` and `vue-console-registry` still run.

### UI-05: Build footer
- **D-09:** Footer text on all three pages, as **one line**: `© 2018 – {year} THiNX Console by THiNX Cloud · {hash}`. The links stay as they are. The hash goes in a muted span after a middle dot. The current block-level `build-id` span on Login is replaced by this shared format. Footers: `src/components/Layout/Layout.vue:12`, `src/pages/Login/Login.vue:91`, `src/pages/PasswordReset/PasswordReset.vue:96`. Extracting a small shared footer component is the planner's call.
- **D-10:** The commit id is **7 characters**. Change `vue.config.js` from `.slice(0, 8)` to `.slice(0, 7)`. This also shortens Rollbar's `code_version`, which is accepted.
- **D-11:** With no commit id (no CI, no git), **hide the hash and the `·` separator entirely**. No `dev`, no empty or `undefined` text. Rollbar can keep an internal `dev` fallback, but the footer must not display it. Separate the display value from the Rollbar value in `vue.config.js`, or have the footer treat `dev`/empty as absent.
- **D-12:** The year is the **build time**: `vue.config.js` sets `VUE_APP_BUILD_YEAR` from `new Date().getUTCFullYear()` unless it is already set in the env. No CI or Dockerfile change.

### LOGIN-01..03: Login page
- **D-13:** The logo sits **above the widget, centred, outside the auth panel**. Copy `services/console/src/assets/thinx/img/logo_white_200.png` (Legacy) to `services/console/vue/public/assets/thinx/img/logo_white_200.png`, so the literal URL `/assets/thinx/img/logo_white_200.png` resolves in the Vue image. Give it meaningful alt text, for example "THiNX".
- **D-14:** The auth panel gets a **semi-opaque dark overlay**, scoped to the login page widget (for example `.widget-auth` background around `rgba(0,0,0,0.55)`, in `src/styles/_auth.scss`). Other widgets stay unchanged. Text must keep WCAG AA contrast. PasswordReset may reuse the class, which is optional.
- **D-15:** The widget title changes from "THiNX Login" to **"Welcome to THiNX Management Console."** No "THiNX Login" text remains.
- **D-16:** The Login button changes to `variant="success"` (green).
- **D-17:** New order inside the form: Username, Password, "Forgot password?", **Login**, then **social buttons side by side** (the existing `.social-buttons` row, stacking full-width below about 400px), then "Don't have an account? Sign up now!", then "Create an Account".
- **D-18:** Keep the subtitle "Use your username to sign in." and the "Create an Account" link. The OAuth `href`s (`oauthReturnQuery`) and the CSRF login flow stay untouched. Production password, Google and GitHub logins must still complete (success criterion 4).

### Claude's Discretion
- How the D-01 gate is structured in CircleCI 2.1: a separate gated workflow versus a `when`/`unless` on the existing workflow.
- Whether to extract a shared `AppFooter` component or edit the three footers inline.
- The exact overlay alpha and spacing, as long as contrast meets AA.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/workstreams/vue-console/ROADMAP.md` § Phase 42 and § Milestone Notes: CI-05 bypass, CI-04 image source, v1.17 `.circleci/config.yml` rebase rule
- `.planning/workstreams/vue-console/REQUIREMENTS.md`: CI-04, CI-05, CI-06, UI-05, LOGIN-01..03
- `AGENTS.md` § Deployment: console submodule then parent pointer bump, push `thinx-staging` only

### CI
- `.circleci/config.yml` lines ~853–1085: `workflows.main`; `build-console-classic` (~247) and `build-vue-console` (~144) jobs incl. the Hub mirror tags `thinxcloud/console:latest` / `thinxcloud/console:vue`; `snyk-container-monitor` (~557)

### Vue console
- `services/console/vue/vue.config.js`: `VUE_APP_BUILD_HASH` derivation (slice 8 → 7), place for `VUE_APP_BUILD_YEAR`
- `services/console/vue/src/main.js:63`: Rollbar `code_version` reads `VUE_APP_BUILD_HASH`
- `services/console/vue/src/pages/Login/Login.vue`, `src/pages/PasswordReset/PasswordReset.vue`, `src/components/Layout/Layout.vue`
- `services/console/vue/src/styles/_auth.scss`: auth page / widget styles
- `services/console/src/assets/thinx/img/logo_white_200.png`: logo source (Legacy tree)
- `.claude/skills/console-retest/SKILL.md`: post-deploy verification on rtm.thinx.cloud

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.social-buttons` / `.social-button--google|--github` in Login.vue: move them as they are, no rebuild.
- The `vue.config.js` env-injection pattern (`process.env.VUE_APP_*` set before vue-cli inlines it) works for the build year as well.
- `snyk-monitor-api` (requires `api-hub`, image `thinxcloud/api:latest`, filter main) is the template for the moved console monitors.

### Established Patterns
- CI: one registry per branch. `thinx-staging` → `registry.thinx.cloud:5000`, `main` → Docker Hub. Each container monitor mirrors the filters of the job that builds its image.
- The config has no pipeline `parameters:` today. D-01 introduces the first one.
- Console `test:unit` is not run in CI. Run it locally before the push.

### Integration Points
- The Vue image serves only `vue/public/` and the built bundle. Legacy `/assets/thinx/...` is not reachable from Vue unless copied (D-13).
- CI already passes `VUE_APP_BUILD_HASH=$(echo $CIRCLE_SHA1 | cut -c -7)` as a build-arg, so no CI change is needed for UI-05.
- Deploy order: console commit on `services/console` `thinx-staging`, then the parent pointer bump together with the CI edit, pushed to parent `thinx-staging`.

</code_context>

<specifics>
## Specific Ideas

- Target login layout:
  ```
          [THiNX logo 200px]
  ┌─ Welcome to THiNX Management Console. ─┐
  │  Use your username to sign in.         │
  │  Username / Password                   │
  │  Forgot password?                      │
  │  [ Login (green) ]                     │
  │  [G Login with Google][GH Login with GitHub]
  │  Don't have an account? Sign up now!   │
  │  Create an Account                     │
  └────────────────────────────────────────┘
  © 2018 – 2026 THiNX Console by THiNX Cloud · a1b2c3d
  ```

</specifics>

<deferred>
## Deferred Ideas

- The "Create an Account" link in `Login.vue` points to `to="login"`, which is the login page itself. It looks broken, but fixing signup routing is outside LOGIN-01..03. Note it for the backlog.

### Reviewed Todos (not folded)
- `2026-10-03-console-notification-delivery-gaps`: belongs to Phase 43.
- `2026-09-28-split-rollbar-server-and-client-tokens`, `2026-10-03-apikey-hash-credential-and-storage`, `2026-10-03-mqtt-device-writes-gated`, `2026-10-03-transfer-accept-not-bound-to-recipient`, `2026-10-04-multi-file-ota-update-multiple-broken`, `2026-09-28-fix-worker-builder-service-polling-completion-detection`, `2026-10-03-transfer-continuity-leftovers`, `2026-10-04-builder-cmd-sh-evals-repository-thinx-yml`: keyword matches only, not in Phase 42 scope.

</deferred>

---

*Phase: 42-ci-trim-login-page-build-footer*
*Context gathered: 2026-10-12*
