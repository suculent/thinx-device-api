# Legacy Console Build Gate Runbook (Phase 42: CI-04, CI-05)

> This file holds no secrets. The only credential it mentions is a CircleCI personal API token,
> which the operator types at a hidden prompt during the Phase 43 bypass (section 4); it is never
> written here, echoed, logged or placed on a command line. Every other command in this runbook
> uses unauthenticated reads of the public CircleCI project `gh/suculent/thinx-device-api`.

This runbook covers the two v1.18 changes to the parent pipeline (`.circleci/config.yml`):
legacy console image builds paused behind a pipeline parameter (CI-05), and every Snyk monitor
moved to `main` (CI-04). It also carries the copy-ready one-pipeline bypass that Phase 43 uses to
ship NOTIF-01 through the legacy console, and the Phase 48 (CI-06) restore step.

Tools, both in this repository:

| Tool | What it does |
|---|---|
| `node scripts/check-ci-gates.js compile` | Sends the config to CircleCI's own compiler (`compile-config-with-defaults`, no auth) with `build_legacy_console` false and true. Checks validity, the compiled workflows and the job selection for thinx-staging and main. Ends `CI-GATES COMPILE OK` or `CI-GATES COMPILE FAIL <n> problems`. |
| `node scripts/check-ci-gates.js pipeline …` | Reads a real pipeline's job list through the public API and checks it with the same rules. `--revision <sha>` (push pipelines on `--branch`, default thinx-staging) or `--pipeline-id <uuid>`; `--expect legacy-off\|legacy-on`; `--wait` for the required jobs to finish. Ends `CI-GATES PIPELINE OK <n>` or `CI-GATES PIPELINE FAIL <n> <m> problems`. Exit 2 on usage, network, timeout or access errors. |
| `node --test spec/node/CiPipelineGates.test.js` | Offline structure checks: the gate, Snyk filters, Hub monitor wiring, `requires` closure on every branch with the parameter false and true. |

---

## 1. The gate (CI-05)

- Pipeline parameter **`build_legacy_console`** (boolean, top-level `parameters:`), **default
  `false` while v1.18 is open**. Marked with a `# v1.18 CI-05` comment block.
- Workflow **`legacy-console`**, `when: << pipeline.parameters.build_legacy_console >>`, also
  marked `# v1.18 CI-05`. It holds exactly three jobs:
  - `console-classic-registry` (thinx-staging, pushes `registry.thinx.cloud:5000/thinx/console:swarm`)
  - `console-classic-hub` (main, pushes `thinxcloud/console:latest`)
  - `snyk-monitor-console-classic` (main, scans `thinxcloud/console:latest` after `console-classic-hub`)
- Why a separate workflow: CircleCI 2.1 has no per-job `when` inside a workflow, and `requires`
  cannot cross workflows, so the classic Snyk monitor has to live in the same gated workflow as
  the build it requires. With the parameter false CircleCI's compiler drops the whole workflow.
- Effect while closed (D-03): no legacy console image builds on any branch. Production keeps
  serving the existing `thinx/console:swarm` image, and `thinxcloud/console:latest` on Docker Hub
  is not refreshed either.
- The console submodule's own CircleCI (`services/console/.circleci/config.yml`) has its `legacy`
  job commented out, so this parent gate is the only path that builds a legacy image.

## 2. What a normal thinx-staging pipeline runs now

A push to `thinx-staging` runs exactly **`test`, `api-registry`, `vue-console-registry`**: no
`snyk-*` job and no `console-classic-*` job. The production deploy path is unchanged.

Check any push (waits for the required jobs and fails if one did not succeed):

```bash
node scripts/check-ci-gates.js pipeline --revision "$(git rev-parse HEAD)" --expect legacy-off --wait
```

Before pushing an edit to `.circleci/config.yml`:

```bash
node --test spec/node/CiPipelineGates.test.js
node scripts/check-ci-gates.js compile
```

## 3. Snyk on main only (CI-04)

| Monitor | Branch | Scans | Requires |
|---|---|---|---|
| `snyk-code-monitor` | main | repository (SAST) | — |
| `snyk-oss-monitor` | main | repository (SCA) | — |
| `snyk-monitor-api` | main | `thinxcloud/api:latest` | `api-hub` |
| `snyk-monitor-console-vue` | main | `thinxcloud/console:vue` (docker.io) | `vue-console-hub` |
| `snyk-monitor-console-classic` | main, only with the gate open | `thinxcloud/console:latest` (docker.io) | `console-classic-hub` |
| `snyk-monitor-base` | base | `thinxcloud/base:latest` | `build-base` |

thinx-staging and the thinx-console dev branch run no Snyk job. The two console monitors use the
`dockerhub` context only: it carries `SNYK_TOKEN` and the docker.io login, and the private
registry (`thinx-docker-repo`) and Hub push (`console`) credentials no longer reach the Snyk jobs.

Accepted gap (operator decision CI-04):

- Production runs the private-registry images that thinx-staging publishes. Those images are now
  scanned only after `main` publishes their Docker Hub copies, so a thinx-staging deploy is not
  scanned until the next `main` run.
- The Snyk projects `thinx/console:vue` and `thinx/console:swarm` (private-registry names) stop
  receiving snapshots and go stale. New projects `thinxcloud/console:vue` and
  `thinxcloud/console:latest` appear at the next `main` run (the classic one only once the gate is
  open on main).

## 4. One-pipeline bypass for Phase 43 (D-04)

Phase 43 (NOTIF-01) runs this **once**. Phase 42 does not run it. It triggers one thinx-staging
pipeline with the gate open, through the CircleCI API.

```bash
# Phase 43 only (NOTIF-01). Runs ONE thinx-staging pipeline with the CI-05 gate open. Shell: bash.

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
      --data '{"branch":"thinx-staging","parameters":{"build_legacy_console":true}}' \
      https://circleci.com/api/v2/project/gh/suculent/thinx-device-api/pipeline \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch{console.error("trigger failed: non-JSON response");process.exit(1)}if(!j.id){console.error("trigger failed:",j.message||"no pipeline id");process.exit(1)}console.log("pipeline",j.number,j.id)})'

# 3. Drop the token from the shell.
unset CIRCLECI_TOKEN

# 4. Prove this pipeline built the legacy image and ran no Snyk monitor (waits for the jobs).
node scripts/check-ci-gates.js pipeline --pipeline-id <id printed in step 2> --expect legacy-on --wait

# 5. After the next normal push: the gate is back in effect.
node scripts/check-ci-gates.js pipeline --revision "$(git rev-parse HEAD)" --expect legacy-off
```

Notes:

- The bypass pipeline also runs the normal `main` workflow on that commit: `test`, `api-registry`
  and `vue-console-registry` rebuild and redeploy the same code alongside `console-classic-registry`.
- It does not change the default. The next push to thinx-staging is gated again; step 5 of the
  snippet checks that.
- Step 4 prints `CI-GATES PIPELINE OK <number>` when `console-classic-registry` ran and succeeded
  and no Snyk monitor ran. If the project ever stops being publicly readable the checker exits 2
  with `CI-GATES ACCESS …`; the CircleCI MCP chain `list_runs` -> `list_run_workflows` ->
  `list_workflow_jobs` gives the same job list.

## 5. Restoring the legacy builds (CI-06, Phase 48)

Change `default: false` to `default: true` on `build_legacy_console` in `.circleci/config.yml`.
That is the whole restore, one line (D-02). After it:

- thinx-staging also runs `console-classic-registry`;
- main also runs `console-classic-hub` and `snyk-monitor-console-classic`.

The parameter and the `legacy-console` workflow stay as a switch for future pauses. The spec does
not assert the default's value, so the flip needs no test edit. After the flip, check the next
thinx-staging push with `--expect legacy-on --wait`.

## 6. Other workstreams editing `.circleci/config.yml`

v1.17 (`vault-transit`) and any other workstream that edits `.circleci/config.yml`: rebase onto the
CI-04 / CI-05 commits, then run

```bash
node --test spec/node/CiPipelineGates.test.js
node scripts/check-ci-gates.js compile
```

before pushing. Neither the spec nor the checker may be weakened to make an edit pass; an invalid
config errors every pipeline and stops all deploys.
