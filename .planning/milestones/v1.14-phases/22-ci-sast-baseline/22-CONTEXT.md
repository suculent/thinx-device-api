# Phase 22: CI & SAST Baseline - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning

<domain>
## Phase Boundary

CI gives trustworthy signals before any v1.14 code change lands. Three requirements, no runtime code changes:

- **CI-01**: CodeQL (`github/codeql-action@v4`, `actions/checkout@v7`, `javascript-typescript`, `build-mode: none`) runs on push to `main` and `thinx-staging` and on PRs to `main`. The check is non-required, and GitHub default setup stays off.
- **CI-02**: No direct `docker login registry.thinx.cloud:5000` remains in `.circleci/config.yml`, and no login passes a password on argv.
- **CI-03**: The Vue console "THiNX Console" links point at the Vue console host in the live bundle, and the dead runtime `VUE_APP_CONSOLE_HOSTNAME` env is removed.

**Verify-first.** State found at discussion time (HEAD `2896a6c2`):
- CI-01 is untouched. `.github/workflows/codeql-analysis.yml` still targets the deleted `master` branch with `codeql-action/*@v1`, `checkout@v2`, the `git checkout HEAD^2` PR step, and `npm install`. The GitHub API reports default setup `not-configured`.
- CI-02 is mostly done (`be376db9`). The `registry-login` command (5 attempts, 10–40 s backoff, `--password-stdin`) exists. The only raw private-registry login left is `config.yml:767` in the test job, and it uses `--password $DOCKER_PASSWORD` on argv.
- CI-03 is wired (`3f2f6da4`) but not verified. `config.yml:196` passes `--build-arg VUE_APP_CONSOLE_HOSTNAME=${VUE_WEB_HOSTNAME}`, and `VUE_WEB_HOSTNAME` is in `required_vars` (`config.yml:174`). The same line exists in `services/console/.circleci/config.yml:160`. The dead env is at `docker-swarm.yml:343`.

</domain>

<decisions>
## Implementation Decisions

### Test-job registry login (CI-02)
- **D-01:** First verify that nothing in the CircleCI test job pulls from `registry.thinx.cloud:5000`, then **delete** the raw login at `config.yml:767`. The check covers `docker-compose.yml` images, `Dockerfile.test` / `Dockerfile` `FROM` lines, compose-built services, and any builder images the specs pull through the docker socket. At discussion time a grep found `registry.thinx.cloud` only in the two CircleCI configs, and compose pulls only `thinxcloud/*`, `dhi.io/*` and `chronograf`. **Fallback:** if anything does pull from the private registry, replace the line with `- registry-login: registry: registry.thinx.cloud:5000` instead. The test job's CircleCI run must stay green either way.
- **D-02:** Leave the docker.io mirror logins (`config.yml:235`, `:309`) and the dhi.io login (`:771`) as they are. They already use `--password-stdin` and are out of CI-02's scope. Do not parametrise `registry-login` for alternate credentials.
- **D-03:** Add no `docker push` retry and no CircleCI `serial-group` in this phase (see Deferred).

### CodeQL workflow shape (CI-01)
- **D-04:** Rewrite `.github/workflows/codeql-analysis.yml` in place. Triggers: `push` on `[main, thinx-staging]`, `pull_request` on `[main]`, plus the **weekly cron (kept)**. Remove the `HEAD^2` step, `npm install`, and the stale comments. Keep the existing least-privilege `permissions` block (`contents: read`, and `security-events: write` + `actions: read` on the job).
- **D-05:** Query suite: **`security-extended`**, which gives Phase 23 before/after evidence on the git/builder exec and path sinks.
- **D-06:** `paths-ignore` covers vendored/minified assets **and tests**: `node_modules`, `**/*.min.js`, vendored static assets, `spec/`. The goal is alerts that reflect production code (`lib/`, root modules). The `services/console` submodule is not checked out, so it needs no rule.
- **D-07:** Alert handling is **baseline only**. After the first successful analysis, record the alert list (counts by rule and by file, plus the `lib/thinx/git.js` / `builder.js` hits) as an artifact in the phase dir, e.g. `22-CODEQL-BASELINE.md`. Do not dismiss or fix alerts in this phase. Phase 23 consumes this list as its "before" evidence.
- **D-08:** Proof of triggers: land on `thinx-staging` (push run visible in code scanning), then **open a PR `thinx-staging` → `main`**, whose PR run is the evidence. The merge, and with it the main-push run, happens at the user's normal release cadence. Verification accepts the staging push run, the PR run, and the `main` push trigger present in the YAML, and records the main-push run whenever the merge happens. Do not merge the PR inside the phase. Do not make the check required. Recheck that default setup is still `not-configured` before the first push.

### Vue hostname verification (CI-03)
- **D-09:** Expected target for the three "THiNX Console" links: **`https://console.thinx.cloud`**.
- **D-10:** Proof is **the whole chain + the bundle + the links**:
  1. The CircleCI `VUE_WEB_HOSTNAME` variable exists (check the name via API or UI; don't print the value into logs unless needed), plus whichever pipeline (parent `.circleci/config.yml` and/or `services/console/.circleci/config.yml`) actually produces the deployed Vue image.
  2. The build arg reaches `services/console/vue/Dockerfile`: `ARG VUE_APP_CONSOLE_HOSTNAME` (line 23) and `ENV` (line 44) are **before** `npm run build`.
  3. The served JS bundle on the live Vue console contains `console.thinx.cloud`.
  4. In a browser on the deployed Vue console, the `href` of all three links (`Layout.vue:12`, `Login.vue:91`, `PasswordReset.vue:96`) resolves to `https://console.thinx.cloud`.
- **D-11:** If the chain is broken (var missing or wrong, arg not baked in), **fix the var or the chain** and keep an explicit build-time host. The user sets CircleCI project vars; the planner flags that as a human step. Do not fall back to dropping the build arg. Never change the shared `WEB_HOSTNAME`, because the classic build needs `rtm`.

### Dead env removal reach (CI-03)
- **D-12:** Correction found during discussion: `VUE_APP_CONSOLE_HOSTNAME` at `docker-swarm.yml:343` sits on the **classic `console` service** (block starting line 316), not the Vue service. It is dead there because the classic AngularJS console never reads `VUE_APP_*`.
- **D-13:** The removal reaches **repo + gluster + live**:
  - Remove the line from repo `docker-swarm.yml`.
  - Remove it from the gluster stack file under `/mnt/gluster/deployment/swarm` on `micro`.
  - Run `docker service update --env-rm VUE_APP_CONSOLE_HOSTNAME <classic console service>` for that one service only.

  **Never** use `restart.sh` or `docker stack deploy`, because they reset the chronograf password. Confirm the actual service name and node placement live (placement floats). The env-rm causes a rolling restart of the classic console, so check afterwards that `rtm.thinx.cloud` still serves and logs in. — **Reversibility:** reversible — `--env-add` restores it.

### Claude's Discretion
- Exact `paths-ignore` glob list within the D-06 intent.
- Whether the CodeQL matrix stays a matrix or becomes a single `languages: javascript-typescript` job.
- Exact cron time.
- The format of the baseline artifact in D-07.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & research
- `.planning/ROADMAP.md` § Phase 22 — goal, success criteria, verify-first note
- `.planning/REQUIREMENTS.md` — CI-01, CI-02, CI-03 text
- `.planning/research/SUMMARY.md` § Phase 22 and Gaps (CircleCI `VUE_WEB_HOSTNAME`, CodeQL default setup recheck)
- `.planning/research/PITFALLS.md` — Pitfall 17 (CodeQL), 18 (registry retry), 19 (Vue hostname var)
- `.planning/research/STACK.md` — CodeQL v4 / checkout v7, GitHub-owned-actions-only policy

### CI files
- `.github/workflows/codeql-analysis.yml` — the workflow to rewrite
- `.circleci/config.yml` — `registry-login` command (lines 9–46), test job login (`:767`), Vue build args (`:174`, `:196`)
- `services/console/.circleci/config.yml` — the submodule's Vue build (`:138`, `:160`)

### Vue hostname chain
- `services/console/vue/Dockerfile` — `ARG`/`ENV VUE_APP_CONSOLE_HOSTNAME` (lines 23, 44)
- `services/console/vue/src/mixins/hostnames.js` — `CONSOLE` hostname, `fixUrlProtocol` adds `https://` when missing, falls back to `window.location.origin`
- `services/console/vue/src/components/Layout/Layout.vue:12`, `services/console/vue/src/pages/Login/Login.vue:91`, `services/console/vue/src/pages/PasswordReset/PasswordReset.vue:96` — the three links

### Swarm ops
- `docker-swarm.yml` — classic `console` service (line 316), dead env at `:343`; Vue service Traefik host `${VUE_HOSTNAME}` (`:410`)
- `.planning/runbooks/swarm.md` — swarm operations
- `AGENTS.md` — deployment flow, server access, swarm path `/mnt/gluster/deployment/swarm`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `registry-login` CircleCI command (`.circleci/config.yml:9`): parametrised by `registry`, env preflight for `DOCKER_LOGIN`/`DOCKER_PASSWORD`, `--password-stdin`. This is the fallback for D-01.
- The existing CodeQL `permissions` block is already least-privilege; keep it.

### Established Patterns
- Production deploys go through `thinx-staging` → CircleCI → private registry → Swarmpit autoredeploy. Pushes go to `thinx-staging` only; `main` is reached by PR.
- One-service swarm changes use `docker service update`, never stack deploy.
- Vue env is baked in at build time (`VUE_APP_*` via `ARG`/`ENV` before `npm run build`). Runtime env on a service has no effect on the bundle.

### Integration Points
- GitHub code scanning (SARIF upload from the advanced workflow). This conflicts with default setup if that is ever enabled.
- CircleCI project/context variables (`VUE_WEB_HOSTNAME`), which the user manages.
- The live classic console service on the swarm (env-rm target).

</code_context>

<specifics>
## Specific Ideas

- Target Vue console host: `https://console.thinx.cloud`.
- The CodeQL baseline artifact is Phase 23's "before" evidence for the `git.js` `execSync` and builder `readFileSync`/`lstatSync` sinks.

</specifics>

<deferred>
## Deferred Ideas

- Bounded retry around `docker push registry.thinx.cloud:5000/...` and/or a CircleCI `serial-group` for the publish jobs. Push contention is the real flake cause (Pitfall 18). Revisit if push timeouts show up.
- Parametrising `registry-login` for the docker.io/dhi.io credential pairs.
- Dismissing CodeQL false positives and fixing trivial alerts belongs in Phase 23 and later.
- The other dead `VUE_APP_*` runtime envs on the classic `console` service (`VUE_APP_CRISP_WEBSITE_ID`, `VUE_APP_API_HOSTNAME`, `VUE_APP_ROLLBAR_ACCESS_TOKEN`, `VUE_APP_LANDING_HOSTNAME`, `VUE_APP_GOOGLE_ANALYTICS_ID`, `VUE_APP_GOOGLE_MAPS_APIKEY`) are equally dead but outside CI-03's wording. Good candidates for a future swarm-env cleanup.

</deferred>

---

*Phase: 22-ci-sast-baseline*
*Context gathered: 2026-09-25*
