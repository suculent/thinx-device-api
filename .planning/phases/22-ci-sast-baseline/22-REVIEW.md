---
phase: 22-ci-sast-baseline
reviewed: 2026-09-25T14:37:20Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - .circleci/config.yml
  - .github/workflows/codeql-analysis.yml
  - docker-swarm.yml
  - services/console/vue/src/components/Layout/Layout.vue
  - services/console/vue/tests/unit/footer-hostnames.cjs
  - services/console/vue/package.json
findings:
  critical: 0
  warning: 5
  info: 8
  total: 13
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-09-25 (plans 22-01..22-03); 2026-09-25T14:37:20Z (incremental, plan 22-04)
**Depth:** standard
**Files Reviewed:** 6 (3 in the original review, 3 in the 22-04 increment)
**Status:** issues_found

## Summary

This file holds two reviews. The frontmatter counts and `status` cover everything still open across both.

- **Plan 22-04 (incremental, new):** the three console-submodule files changed in `git -C services/console diff a0e86707 a5b02467`. The findings are in *Plan 22-04 Review* below (WR-03..WR-05, IN-07..IN-08).
- **Plans 22-01..22-03 (carried forward):** the earlier review of `.circleci/config.yml`, `.github/workflows/codeql-analysis.yml` and `docker-swarm.yml`, kept below in *Prior Review*. After that review, 22-04 changed none of those files and neither did any later commit, so WR-01, WR-02 and IN-01..IN-06 are all still open. Its finding IDs are unchanged. The only edit is that WR-02 no longer quotes the ssh user, address, port or key file name. It describes them instead.

Combined open state: 0 critical, 5 warnings, 8 info.

## Narrative Findings (AI reviewer)

---

## Plan 22-04 Review (incremental: Layout footer hostnames mixin)

**Scope:** `git -C services/console diff a0e86707 a5b02467`. That is `vue/src/components/Layout/Layout.vue` (+2/-0), the new `vue/tests/unit/footer-hostnames.cjs` (+176), and `vue/package.json` (+1/-1, `test:unit` chain). For context only, I read `src/mixins/hostnames.js`, `src/mixins/layout.js`, `src/main.js`, the other four `$hostnames` readers, `tests/unit/env-json.cjs`, `vue/Dockerfile` and the submodule's `.circleci/config.yml`.

**The fix is correct.** `Layout.vue:23,32` adds the import and `mixins: [hostnameMixin]`, and the template is byte-identical. The mixin's `data()` and `created()` run before Layout's empty `created()` and before the first render, so `this.$hostnames` is an own property by the time `:href` at `:12` is evaluated. Nothing collides:
- The global `layoutMixin` has only `appConfig` and `decodeHtml`.
- Layout has no `data` of its own.
- No other code reads `hostnames` or `fixUrlProtocol` on Layout.

The fix adds no hardcoded host and does not touch the build arg (D-09/D-11).

**Verification I ran:**
- `npm run test:unit` exits 0. I saw all 6 footer lines, the fallback line and 5 mixin-declared lines.
- ESLint (the repo's `.eslintrc`) is clean on the three files.
- On a scratch copy of `src` with the pre-fix `Layout.vue` from `a0e86707`, the test goes RED as planned: both Layout footer checks, the fallback check and Layout's mixin-declared check fail, with rc=1.

**The defects are in the regression guard, not in the fix.** Mutation probes on scratch copies showed that the test passes (rc=0) when:
- the hostnames mixin is commented out in `Visits.vue`
- Layout's own `created()` wipes `$hostnames`
- a new `.ts` file reads `$hostnames` without the mixin

The test also runs in no pipeline, so the claim that "`test:unit` fails if a future component forgets it" only holds when someone runs it by hand.

### Warnings

#### WR-03: The new regression guard runs in no CI or image build

**File:** `services/console/vue/package.json:17`; `services/console/vue/Dockerfile:74-78`; `services/console/.circleci/config.yml:96-104`
**Issue:** `test:unit` is referenced only in `package.json`:
- The Vue image build that produces `thinx/console:vue`, the deploy path for `thinx_vue`, runs `yarn build && yarn test:csp:dist` (`Dockerfile:77-78`).
- The submodule's CircleCI `test_vue` job runs `yarn build:perf` and `yarn test`, which is cypress (`config.yml:103-104`).
- The husky hook runs only commitlint.

So the defect this plan fixes, a `$hostnames` reader without the mixin, would ship again unless a developer happens to run `npm run test:unit` before pushing. That is how it shipped the first time. The plan calls it a "local pre-deploy guard", but its success criterion says the defect class is "closed and guarded: … `test:unit` fails if a future component forgets it". Nothing enforces that.
**Fix:** Run it in the image build, which gates every deploy, before `yarn build`. `vue-template-compiler` and `vuex` are already installed there, since the build needs them:
```dockerfile
    yarn && \
    yarn test:unit && \
    yarn build && \
    yarn test:csp:dist'
```
You can also, or instead, add `yarn test:unit` before `yarn build:perf` in the submodule `test_vue` job. Either one turns the guard into a gate.

#### WR-04: The `$hostnames` sweep matches source text, so a commented-out mixin or a non-`.js`/`.vue` reader passes

**File:** `services/console/vue/tests/unit/footer-hostnames.cjs:156-173`
**Issue:** The defect-class check (`:170-173`) passes a file when two regexes match anywhere in its raw text. Neither checks that the match is live code, and the walk (`:161`) only visits `.vue` and `.js` files. I reproduced two false passes on scratch copies:
- Change `Visits.vue:114` to `// mixins: [hostnameMixin],`. The test prints `ok   hostnames mixin declared: src/pages/Visits/Visits.vue` and exits 0.
- Add a file under `src/utils` with a `.ts` extension that reads `vm.$hostnames.API`. Again rc=0, because the walk skips it. `.jsx`, `.mjs` and `.ts` are all skipped. ESLint in this repo lints all of them (`package.json:20`).

`OAuthReturn.vue` and `Visits.vue` are covered only by this sweep, because the footer render covers just Layout, Login and PasswordReset. A regression in either would reach production unnoticed. Without the mixin, `this.$hostnames.API` is `undefined`: Visits would fetch the relative URL `undefined/build/artifacts` (`Visits.vue:258`), and OAuthReturn's `/gdpr` and `/login` CSRF calls would go to the console origin instead of the API.
**Fix:** Check the loaded options instead of the text. The loader can already do that:
```js
readers.forEach((file) => {
  let mixins = [];
  try {
    const src = file.endsWith('.vue')
      ? compiler.parseComponent(fs.readFileSync(file, 'utf8')).script.content
      : fs.readFileSync(file, 'utf8');
    mixins = (loadModule(src).default || {}).mixins || [];
  } catch (e) { /* reported below as a failure */ }
  check('hostnames mixin declared: ' + path.relative(VUE_ROOT, file),
    mixins.some((m) => m && m.created && /\$hostnames/.test(String(m.created))));
});
```
Also widen the walk to `/\.(vue|js|jsx|mjs|cjs|ts|tsx)$/`, so a new file type fails loudly instead of being skipped.

#### WR-05: The footer "render" drops the component's own hooks, computed and methods, so it can pass while the real component renders no href

**File:** `services/console/vue/tests/unit/footer-hostnames.cjs:97-120` (esp. `:105-111`)
**Issue:** The header comment (`:9-10`) says the test "renders the real `<footer>` of each SFC with the component's own mixins". The `new Vue` it builds takes only `mixins`, plus `data` if one exists. It leaves out the component's own `created`, `beforeCreate`, `computed`, `methods`, `props`, `extends`, and the global `layoutMixin` from `main.js`. So the test proves the mixin is wired in, but not what the component renders. I reproduced a false pass on a scratch copy: change Layout's empty `created()` at `Layout.vue:43-45` to `created() { this.$hostnames = {}; }`. All three Layout lines still print `ok … -> https://console.thinx.cloud` and rc=0, while the real Layout would render both links with no href again. Vue runs component hooks after mixin hooks, so a component's own `created()` always wins. This is the most likely way the footer breaks again, and the test cannot see it.
**Fix:** Build the VM from the whole component definition and swap in only the footer render:
```js
const vmOptions = Object.assign({}, options, {
  components: {},                  // children are stubbed anyway
  render: compiled.render,
  staticRenderFns: compiled.staticRenderFns,
});
delete vmOptions.template;
delete vmOptions.mounted;          // $refs / DOM listeners need a real mount
```
Either stub `this.$store` (vuex `mapState` computed are lazy, so an unrendered computed is harmless) or give it a minimal `new vuex.Store({ modules: { layout: { namespaced: true, state: {} } } })`. Then add `Vue.mixin` of the real `src/mixins/layout.js` to mirror `main.js`. If a full-options render is too heavy, at least include `options.created`, and say in the header that this is a mixin-wiring check, not a component render.

### Info

#### IN-07: An SFC the loader can't parse crashes the whole script without naming the file

**File:** `services/console/vue/tests/unit/footer-hostnames.cjs:69-86`, `:98-103`
**Issue:** The ESM rewrite handles only `import { … } from`, `import * as X from`, `import X from`, side-effect imports and `export default`. `import X, { y } from 'z'`, `export const …`, `export { … }` and a missing `<template>`/`<script>` block all throw, and the throw happens in `renderFooter` before its `try` block (`:98-103`). On a scratch copy, I changed Layout's first import to `import Vuex, { mapState, mapActions } from 'vuex';`. That is valid in the app, but the test died with a bare `SyntaxError: Cannot use import statement outside a module` and a `new Function` stack. There was no `FAIL` line, no file name, and every later check, the sweep included, was skipped. The exit is non-zero, so it fails safe. It just makes a harmless refactor look like a broken test.
**Fix:** Move the `parseComponent` / `loadModule` / `compileToFunctions` calls inside the existing `try`, and return `{ error: relPath + ': ' + e.message }`. Also add the default-plus-named form to the rewrite: `/^\s*import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/gm`.

#### IN-08: The footer links, now live in Layout, use `target="_blank"` without `rel="noopener noreferrer"`

**File:** `services/console/vue/src/components/Layout/Layout.vue:12` (the same pattern is at `Login.vue:91-92` and `PasswordReset.vue:96-97`)
**Issue:** Before 22-04, the Layout anchors had no href, so they did nothing. They now open build-time first-party hosts in a new tab. Current browsers treat `target="_blank"` as `noopener`, and both targets are hosts you control, so the tabnabbing risk is small. The template predates this phase and 22-04 deliberately kept it byte-identical. But `noreferrer` is not implied, so a click now sends the full authenticated console URL, including the `#/app/...` route, as `Referer` to the landing site. Browsers strip the fragment, which limits what leaks.
**Fix:** In a follow-up that is allowed to touch templates, add `rel="noopener noreferrer"` to all six footer anchors. Then extend `collectAnchors` to assert `vnode.data.attrs.rel`, so the test pins the fix.

---

## Prior Review (plans 22-01..22-03, carried forward, all still open)

Originally reviewed 2026-09-25 at standard depth over `git diff 76cee894..HEAD` for `.circleci/config.yml`, `.github/workflows/codeql-analysis.yml` and `docker-swarm.yml`. I re-checked it at 2026-09-25T14:37:20Z: no commit after the review (`eac32801`) touches any of those files or `AGENTS.md`, so every finding below is still open. The text is unchanged, except that WR-02 no longer quotes the ssh line.

### Prior summary

- `.github/workflows/codeql-analysis.yml`: rewritten for CodeQL advanced setup (codeql-action v4, checkout v7, `javascript-typescript`, `build-mode: none`, `security-extended`). It triggers on push to `main` and `thinx-staging` and on PRs to `main`. The workflow grants `contents: read`, and only the job adds `security-events: write`. The phase intent is met. I found no functional defects. The `paths-ignore` entries all resolve to real paths (`builders/lua-inspect/`, `scripts/test-*.js`, `test_cert_probe_runner.js`, `verify_path_traversal_fix.js`).
- `.circleci/config.yml`: the argv-password `docker login ... registry.thinx.cloud:5000` line is gone from the test job's "Starting Support Services" step. I checked that nothing in the test job still pulls from the private registry. `docker-compose.test.yml`, `Dockerfile.test` and `services/broker/Dockerfile.test` only pull from `thinxcloud/*`, `dhi.io`, `golang` and `influxdb`, so removing the login does not break anything. However, the credential it used still reaches the test job's environment (WR-01).
- `docker-swarm.yml`: the dead `VUE_APP_CONSOLE_HOSTNAME` entry is gone from the classic `console` service. Nothing in `services/console/src` reads it. The Vue console gets it at build time through the `--build-arg` at `.circleci/config.yml:196`, so dropping the runtime env has no effect.

The diff adds no secret or host leakage. One host-leakage issue already sits in a tracked file outside these three files, on the public `origin/main` (WR-02). I report it because the review asked for any secret or host leakage.

### Warnings

#### WR-01: The test job still gets the private-registry push credential after the login was removed

**File:** `.circleci/config.yml:842-857` (test job contexts), `:762-771` (edited step)
**Issue:** CI-02 removed the only use of `DOCKER_LOGIN`/`DOCKER_PASSWORD` in the `test` job. The job still declares the `thinx-docker-repo` context, which exports those names with the `registry.thinx.cloud:5000` account. The comment at `:767-769` says so, and so does `22-01-PLAN.md:204`. That account can push `thinx/console:swarm` and `thinx/console:vue`. The swarm pulls both, and both have `swarmpit.service.deployment.autoredeploy=true` (`docker-swarm.yml:319,368,376,418`). A push with this credential therefore deploys to production.

The test job runs on five branches (`base`, `thinx-unit`, `thinx-class`, `thinx-staging`, `main`) and runs repo-controlled scripts in the job shell, for example `spec/test_repositories/get-tests.sh` and `_generate-ca-root-csr-and-sign-cert.sh`. The argv exposure is fixed. The secret's reach is unchanged, so the least-privilege half of CI-02 is not done. The context can't simply be dropped: the comment at `:620` says the same context supplies `DOCKER_USERNAME`/`DOCKER_PUBLIC_PASSWORD` for the `thinxcloud/base:latest` primary image and the `dhi.io` login at `:770`.
**Fix:** Keep the Hub pair and the private-registry pair in separate contexts, then drop the registry one from `test`:
```yaml
      - test:
          context:
              - dockerhub
              - thinx-docker-hub-pull   # new: DOCKER_USERNAME / DOCKER_PUBLIC_PASSWORD only
              - thinx-test
              - sonarcloud
```
Keep `thinx-docker-repo`, which then holds only `DOCKER_LOGIN`/`DOCKER_PASSWORD`, on the jobs that push or pull the private registry: `console-classic-*`, `vue-console-*`, `api-registry` and the two `snyk-monitor-console-*` jobs. If `dockerhub` already carries `DOCKER_USERNAME`/`DOCKER_PUBLIC_PASSWORD`, just delete `thinx-docker-repo` from the list. Check that first, since the comment at `:620` suggests otherwise.

#### WR-02: The public repo publishes the root SSH endpoint for the swarm manager (outside the reviewed files)

**File:** `AGENTS.md:13` (tracked; present on `origin/main` and `origin/thinx-staging`)
**Issue:** The repo is public. `AGENTS.md` is committed, and its "User-provided server access" bullet holds a complete `ssh` command line: the root user, the manager's IP address, a non-standard sshd port and the operator's private-key file name. It also gives the swarm deployment path. The details are left out of this report on purpose. The address alone is not secret, because the public `rtm`, `registry` and `swarmpit` hostnames resolve to the same host. The line does add three things an attacker can't get from DNS: root login is allowed, the sshd port is non-standard, and the key file's name. That points brute-force and credential-stuffing attempts straight at the one host that runs the registry, Swarmpit and the manager node. This is not part of the phase 22 diff. I report it because the review asked for any host leakage.
**Fix:** Take the host line out of the tracked file and keep it in untracked or private notes, e.g. `~/.aliases`, which the global CLAUDE.md already names as the place for machine aliases:
```markdown
- User-provided server access: see the `micro` alias in `~/.aliases` (not committed).
```
Also think about setting `PermitRootLogin prohibit-password` or `no` on `micro`, if it isn't already. The line stays in git history, so treat the port and user as permanently disclosed.

### Info

#### IN-01: `actions: read` is only needed on private repos, and this repo is public

**File:** `.github/workflows/codeql-analysis.yml:28`
**Issue:** The inline comment says this scope is "needed on private repos". The repo is public, so the permission does nothing and only widens the token. It is read-only and harmless, but it goes against the phase's least-privilege goal and its own comment.
**Fix:** Drop `actions: read`, or change the comment to give the real reason it is kept (e.g. "kept so the job still works if the repo goes private").

#### IN-02: checkout leaves the job token in `.git/config`

**File:** `.github/workflows/codeql-analysis.yml:31-32`
**Issue:** `actions/checkout` defaults to `persist-credentials: true`. That writes the job's `GITHUB_TOKEN`, which here has `security-events: write`, into `.git/config` for the rest of the job. Neither CodeQL step needs git credentials. With `build-mode: none`, no repo code runs, so the exposure is small. Linters such as zizmor ("artipacked") still flag it.
**Fix:**
```yaml
    - name: Checkout repository
      uses: actions/checkout@v7
      with:
        persist-credentials: false
```

#### IN-03: Actions are pinned to mutable major tags

**File:** `.github/workflows/codeql-analysis.yml:32,35,51`
**Issue:** `actions/checkout@v7`, `github/codeql-action/init@v4` and `analyze@v4` are tags that can move. The repo's `allowed_actions: selected` / GitHub-owned-only policy (`22-01-PLAN.md:102`) limits the supply-chain risk. The config still isn't reproducible.
**Fix:** Pin by commit SHA with a version comment (`uses: actions/checkout@<sha> # v7.0.1`) and let Dependabot `github-actions` bump them. You can also leave it as is, given the org policy.

#### IN-04: The workflow doesn't say that CodeQL skips every submodule

**File:** `.github/workflows/codeql-analysis.yml:3-5,31-32`
**Issue:** D-06 relies on checkout's default `submodules: false` to keep submodule code out of the scan. That excludes more than `services/console`: it also leaves out `base`, `services/broker`, `services/worker`, `services/transformer`, `services/redis` and `services/couchdb` (`.gitmodules`). The 147-alert baseline covers only the parent repo (`lib/`, root modules). This is written down only in `.planning/`. The workflow header says nothing about it. A later edit that adds `submodules: true` would quietly pull those trees into the scan (possibly failing on the `git@` URLs). Readers of the Security tab may also assume the console is covered. (It stays true after 22-04: the new console test and the Layout fix sit outside the CodeQL scan.)
**Fix:** Add a line to the header comment, for example: `# Submodules are intentionally not checked out (D-06): only the parent repo (lib/, root modules) is analysed.`

#### IN-05: The edited step runs under `/bin/sh --login` without `-e`, so a failed login does not stop it

**File:** `.circleci/config.yml:630`, `:762-771`
**Issue:** The test job replaces CircleCI's default `/bin/bash -eo pipefail` with `shell: /bin/sh --login`, which does not set `-e`. In "Starting Support Services", a failed `docker login dhi.io` (`:770`) lets the step continue. The step then fails later and less clearly, on the `couchdb` pull in `docker compose up`, or passes if the image is already cached. The same applies to the `chmod` at `:766`. This predates the phase, but it lives in the step this phase edited.
**Fix:** Set `set -e` at the top of multi-command steps, or change the job shell to `/bin/sh -e --login`. Check first that the `if ! grep -q ...` test at `:784` still behaves the same (it does, because `if` conditions are exempt from `-e`).

#### IN-06: The `docker-swarm.yml` reconciliation date is stale

**File:** `docker-swarm.yml:3-6`
**Issue:** The header says the file was "Reconciled against the live stack on 2026-09-18". Since then the file has changed, and D-13 changed the live `thinx.yml` and service to match (2026-09-25, backup `thinx.yml.bak-phase22-20260925T130834Z`). With the old date, a reader can't tell whether this removal went out to the live stack.
**Fix:** Change it to `Reconciled ... on 2026-09-25 (phase 22 removed VUE_APP_CONSOLE_HOSTNAME from console; mirrored to gluster thinx.yml and live).`

---

_Reviewed: 2026-09-25 (22-01..22-03); 2026-09-25T14:37:20Z (22-04 increment)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
