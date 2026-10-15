# Legacy Console Build Kill Switch Runbook (CI-04 to CI-07)

> This file holds no secrets. The only credential it mentions is a CircleCI personal API token,
> which the operator types at a hidden prompt when pausing the legacy build for one pipeline
> (section 4); it is never written here, echoed, logged or placed on a command line. Every other
> command in this runbook uses unauthenticated reads of the public CircleCI project
> `gh/suculent/thinx-device-api`.

This runbook covers the v1.18 changes to the parent pipeline (`.circleci/config.yml`): the legacy
console image builds behind the `build_legacy_console` kill switch (paused by CI-05, restored by
CI-06), every Snyk monitor on `main` (CI-04), and the `test-vue-console` gate in front of both Vue
image jobs (CI-07).

Tools, both in this repository:

| Tool | What it does |
|---|---|
| `node scripts/check-ci-gates.js compile` | Sends the config to CircleCI's own compiler (`compile-config-with-defaults`, no auth) with `build_legacy_console` false and true. Checks validity, the compiled workflows and the job selection for thinx-staging and main. Ends `CI-GATES COMPILE OK` or `CI-GATES COMPILE FAIL <n> problems`. |
| `node scripts/check-ci-gates.js pipeline …` | Reads a real pipeline's job list through the public API and checks it with the same rules. `--revision <sha>` (push pipelines on `--branch`, default thinx-staging) or `--pipeline-id <uuid>`; `--expect legacy-on\|legacy-off` (default `legacy-on` since Phase 48); `--wait` for the required jobs to finish. Ends `CI-GATES PIPELINE OK <n>` or `CI-GATES PIPELINE FAIL <n> <m> problems`. Exit 2 on usage, network, timeout or access errors. |
| `node --test spec/node/CiPipelineGates.test.js` | Offline structure checks: the kill switch and its default, Snyk filters, Hub monitor wiring, the `test-vue-console` job and the `requires` on it, `requires` closure on every branch with the parameter false and true. |

---

## 1. The kill switch (`build_legacy_console`)

- Pipeline parameter **`build_legacy_console`** (boolean, top-level `parameters:`), **default
  `true` since Phase 48** (CI-06, D-08). The comment block above `parameters:` describes it.
- Workflow **`legacy-console`**, `when: << pipeline.parameters.build_legacy_console >>`. It holds
  exactly three jobs, which the switch controls together:
  - `console-classic-registry` (thinx-staging, pushes `registry.thinx.cloud:5000/thinx/console:swarm`)
  - `console-classic-hub` (main, pushes `thinxcloud/console:latest`)
  - `snyk-monitor-console-classic` (main, scans `thinxcloud/console:latest` after `console-classic-hub`)
- Why a separate workflow: CircleCI 2.1 has no per-job `when` inside a workflow, and `requires`
  cannot cross workflows, so the classic Snyk monitor has to live in the same switched workflow as
  the build it requires. With the parameter false CircleCI's compiler drops the whole workflow.
- With the switch on (the default) a normal push builds and publishes the legacy image again. With
  it off no legacy console image builds on any branch: production keeps serving whatever
  `thinx/console:swarm` was last pushed, and `thinxcloud/console:latest` on Docker Hub is not
  refreshed.
- The console submodule's own CircleCI (`services/console/.circleci/config.yml`) has its `legacy`
  job commented out, so this parent workflow is the only path that builds a legacy image.

## 2. What a normal thinx-staging pipeline runs now

A push to `thinx-staging` runs **`test`, `test-vue-console`, `api-registry`,
`vue-console-registry`** (which starts only after `test-vue-console` succeeds) and
**`console-classic-registry`**. No `snyk-*` job runs there. `console-classic-registry` pushes only
`thinx/console:swarm` and `vue-console-registry` only `thinx/console:vue`, so the two workflows run
on the same commit without colliding.

Check any push (waits for the required jobs and fails if one did not succeed):

```bash
node scripts/check-ci-gates.js pipeline --revision "$(git rev-parse HEAD)" --expect legacy-on --wait
```

Before pushing an edit to `.circleci/config.yml`:

```bash
node --test spec/node/CiPipelineGates.test.js
node scripts/check-ci-gates.js compile
```

## 3. The Vue suite gate (CI-07)

`test-vue-console` (workflow `main`; branches thinx-console, thinx-staging and main) runs in
`thinxcloud/console-build-env:vue`. It checks out the parent, fetches only the `services/console`
submodule and, in `services/console/vue`, runs:

```bash
export NODE_OPTIONS=--openssl-legacy-provider
yarn
LC_ALL=C yarn test:unit                         # Vue unit suites
LC_ALL=C node ../src/test/deploykey.cjs         # Legacy unit tests
LC_ALL=C node ../src/test/legacy-close-out.cjs
yarn build:perf
yarn test:ci                                    # same-origin dev server + Cypress, JUnit reporter
```

- Both `vue-console-registry` (thinx-console, thinx-staging) and `vue-console-hub` (main) list it in
  `requires`, so no Vue image is built in a pipeline whose suite is red or was cancelled. The gate
  needs no API token and no cross-repo status lookup.
- It has **no context**: `yarn` installs unpinned dependencies with lifecycle scripts, so no
  registry, Hub, Snyk, Slack or API credential may reach this job. The image is public and pulled
  anonymously.
- The console repo's own `test_vue` job still runs as early feedback, on its own executor with its
  own checkout and dev server; the two suites share no state and neither writes to the real API.
- JUnit results: `store_test_results` reads `services/console/vue/cypress/results` (written by
  `cy:test:ci`). They show on the job's **Tests** tab in CircleCI and through the public API (no
  token):

  ```bash
  curl -sS https://circleci.com/api/v2/project/gh/suculent/thinx-device-api/<job number>/tests
  ```

  Screenshots and videos of failed specs are stored as artifacts under `cypress-screenshots` and
  `cypress-videos`.

## 4. Pausing the legacy build

**Persistent pause (default flip).** Change `default: true` to `default: false` on
`build_legacy_console` in `.circleci/config.yml`, run the two pre-push checks from section 2, and
push. Every later push then builds no legacy image; check pushes with:

```bash
node scripts/check-ci-gates.js pipeline --revision "$(git rev-parse HEAD)" --expect legacy-off --wait
```

Flip it back to `true` to resume, and check the next push with `--expect legacy-on --wait`.

**One pipeline without the legacy build.** Trigger one thinx-staging pipeline with the switch off
through the CircleCI API. The default stays `true`, so the next push builds the legacy image again.

```bash
# Runs ONE thinx-staging pipeline with build_legacy_console false. Shell: bash.

# 0. Confirm the project slug (read-only; the project is public, so no token is needed).
curl -sS https://circleci.com/api/v2/project/gh/suculent/thinx-device-api \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.slug!=="gh/suculent/thinx-device-api"){console.error("unexpected slug:",j.slug||j.message);process.exit(1)}console.log("slug ok:",j.slug)})'

# 1. Read a CircleCI personal API token. Input is hidden and never enters shell history.
read -rs -p 'CircleCI personal API token: ' CIRCLECI_TOKEN; echo

# 2. Trigger the pipeline. The token reaches curl on stdin as a header, so it never appears
#    in argv (ps), in shell history or in the output. Only the pipeline number and id are printed.
printf 'Circle-Token: %s\n' "$CIRCLECI_TOKEN" \
  | curl -sS --fail-with-body -X POST \
      --header @- \
      --header 'Content-Type: application/json' \
      --data '{"branch":"thinx-staging","parameters":{"build_legacy_console":false}}' \
      https://circleci.com/api/v2/project/gh/suculent/thinx-device-api/pipeline \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch{console.error("trigger failed: non-JSON response");process.exit(1)}if(!j.id){console.error("trigger failed:",j.message||"no pipeline id");process.exit(1)}console.log("pipeline",j.number,j.id)})'

# 3. Drop the token from the shell.
unset CIRCLECI_TOKEN

# 4. Prove this pipeline built no legacy image (waits for the required jobs).
node scripts/check-ci-gates.js pipeline --pipeline-id <id printed in step 2> --expect legacy-off --wait
```

Notes:

- That pipeline still runs the normal `main` workflow on the commit: `test`, `test-vue-console`,
  `api-registry` and `vue-console-registry` rebuild and redeploy the same code.
- If the project ever stops being publicly readable the checker exits 2 with
  `CI-GATES ACCESS …`; the CircleCI MCP chain `list_runs` -> `list_run_workflows` ->
  `list_workflow_jobs` gives the same job list.

## 5. Snyk on main only (CI-04, unchanged)

| Monitor | Branch | Scans | Requires |
|---|---|---|---|
| `snyk-code-monitor` | main | repository (SAST) | — |
| `snyk-oss-monitor` | main | repository (SCA) | — |
| `snyk-monitor-api` | main | `thinxcloud/api:latest` | `api-hub` |
| `snyk-monitor-console-vue` | main | `thinxcloud/console:vue` (docker.io) | `vue-console-hub` |
| `snyk-monitor-console-classic` | main, only with the kill switch on (the default) | `thinxcloud/console:latest` (docker.io) | `console-classic-hub` |
| `snyk-monitor-base` | base | `thinxcloud/base:latest` | `build-base` |

thinx-staging and the thinx-console dev branch run no Snyk job, with the switch on or off. The two
console monitors use the `dockerhub` context only: it carries `SNYK_TOKEN` and the docker.io login,
and the private registry (`thinx-docker-repo`) and Hub push (`console`) credentials do not reach
the Snyk jobs.

Accepted gap (operator decision CI-04):

- Production runs the private-registry images that thinx-staging publishes. Those images are
  scanned only after `main` publishes their Docker Hub copies, so a thinx-staging deploy is not
  scanned until the next `main` run.
- The Snyk projects `thinx/console:vue` and `thinx/console:swarm` (private-registry names) no
  longer receive snapshots. `thinxcloud/console:vue` and `thinxcloud/console:latest` are the
  current projects.

## 6. History

- **Phase 42 (CI-05):** the legacy console builds were paused while v1.18 was open by moving the
  three jobs into the `legacy-console` workflow behind `build_legacy_console`, default `false`.
  CI-04 moved every Snyk monitor to `main` in the same phase.
- **Phase 43:** the plan was one API-triggered thinx-staging pipeline with the parameter `true`
  to ship NOTIF-01 through the legacy console. The operator skipped that one-off bypass, so
  `thinx/console:swarm` stayed the 2026-10-12 image and the Phase 43 Legacy changes rode along
  with CI-06.
- **Phase 48 (CI-06, CI-07):** the legacy builds were restored by flipping the default to `true`
  (D-08), not by deleting the parameter, which stays as the kill switch. The same pipeline added
  the `test-vue-console` gate in front of `vue-console-registry` and `vue-console-hub` (D-01).

## 7. Other workstreams editing `.circleci/config.yml`

v1.17 (`vault-transit`) and any other workstream that edits `.circleci/config.yml`: rebase onto the
CI-04 to CI-07 commits, then run

```bash
node --test spec/node/CiPipelineGates.test.js
node scripts/check-ci-gates.js compile
```

before pushing. Neither the spec nor the checker may be weakened to make an edit pass; an invalid
config errors every pipeline and stops all deploys.
