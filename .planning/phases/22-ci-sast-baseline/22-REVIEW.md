---
phase: 22-ci-sast-baseline
reviewed: 2026-09-25T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .circleci/config.yml
  - .github/workflows/codeql-analysis.yml
  - docker-swarm.yml
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-09-25
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Scope: `git diff 76cee894..HEAD` over the three files. The rest of each file was read for context only.

- `.github/workflows/codeql-analysis.yml`: rewritten for CodeQL advanced setup (codeql-action v4, checkout v7, `javascript-typescript`, `build-mode: none`, `security-extended`). It triggers on push to `main` and `thinx-staging` and on PRs to `main`. The workflow grants `contents: read`, and only the job adds `security-events: write`. The phase intent is met. I found no functional defects. The `paths-ignore` entries all resolve to real paths (`builders/lua-inspect/`, `scripts/test-*.js`, `test_cert_probe_runner.js`, `verify_path_traversal_fix.js`).
- `.circleci/config.yml`: the argv-password `docker login ... registry.thinx.cloud:5000` line is gone from the test job's "Starting Support Services" step. I checked that nothing in the test job still pulls from the private registry. `docker-compose.test.yml`, `Dockerfile.test` and `services/broker/Dockerfile.test` only pull from `thinxcloud/*`, `dhi.io`, `golang` and `influxdb`, so removing the login does not break anything. However, the credential it used still reaches the test job's environment (WR-01).
- `docker-swarm.yml`: the dead `VUE_APP_CONSOLE_HOSTNAME` entry is gone from the classic `console` service. Nothing in `services/console/src` reads it. The Vue console gets it at build time through the `--build-arg` at `.circleci/config.yml:196`, so dropping the runtime env has no effect.

The diff adds no secret or host leakage. One host-leakage issue already sits in a tracked file outside these three files, on the public `origin/main` (WR-02). I report it because the review asked for any secret or host leakage.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The test job still gets the private-registry push credential after the login was removed

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

### WR-02: The public repo publishes the root SSH endpoint for the swarm manager (outside the reviewed files)

**File:** `AGENTS.md:13` (tracked; present on `origin/main` and `origin/thinx-staging`)
**Issue:** The repo is public. `AGENTS.md` is committed and contains `` `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020` `` and the swarm path `/mnt/gluster/deployment/swarm`. The IP alone is not secret: `rtm`, `registry` and `swarmpit.thinx.cloud` all resolve to `188.166.23.244` (`micro.thinx.cloud`). The line does add three things an attacker can't get from DNS: root login is allowed, sshd listens on the non-standard port 2020, and the operator's key file is called `DOKey2`. That points brute-force and credential-stuffing attempts straight at the one host that runs the registry, Swarmpit and the manager node. This is not part of the phase 22 diff. I report it because the review asked for any host leakage.
**Fix:** Take the host line out of the tracked file and keep it in untracked or private notes, e.g. `~/.aliases`, which the global CLAUDE.md already names as the place for machine aliases:
```markdown
- User-provided server access: see the `micro` alias in `~/.aliases` (not committed).
```
Also think about setting `PermitRootLogin prohibit-password` or `no` on `micro`, if it isn't already. The line stays in git history, so treat the port and user as permanently disclosed.

## Info

### IN-01: `actions: read` is only needed on private repos, and this repo is public

**File:** `.github/workflows/codeql-analysis.yml:28`
**Issue:** The inline comment says this scope is "needed on private repos". The repo is public, so the permission does nothing and only widens the token. It is read-only and harmless, but it goes against the phase's least-privilege goal and its own comment.
**Fix:** Drop `actions: read`, or change the comment to give the real reason it is kept (e.g. "kept so the job still works if the repo goes private").

### IN-02: checkout leaves the job token in `.git/config`

**File:** `.github/workflows/codeql-analysis.yml:31-32`
**Issue:** `actions/checkout` defaults to `persist-credentials: true`. That writes the job's `GITHUB_TOKEN`, which here has `security-events: write`, into `.git/config` for the rest of the job. Neither CodeQL step needs git credentials. With `build-mode: none`, no repo code runs, so the exposure is small. Linters such as zizmor ("artipacked") still flag it.
**Fix:**
```yaml
    - name: Checkout repository
      uses: actions/checkout@v7
      with:
        persist-credentials: false
```

### IN-03: Actions are pinned to mutable major tags

**File:** `.github/workflows/codeql-analysis.yml:32,35,51`
**Issue:** `actions/checkout@v7`, `github/codeql-action/init@v4` and `analyze@v4` are tags that can move. The repo's `allowed_actions: selected` / GitHub-owned-only policy (`22-01-PLAN.md:102`) limits the supply-chain risk. The config still isn't reproducible.
**Fix:** Pin by commit SHA with a version comment (`uses: actions/checkout@<sha> # v7.0.1`) and let Dependabot `github-actions` bump them. You can also leave it as is, given the org policy.

### IN-04: The workflow doesn't say that CodeQL skips every submodule

**File:** `.github/workflows/codeql-analysis.yml:3-5,31-32`
**Issue:** D-06 relies on checkout's default `submodules: false` to keep submodule code out of the scan. That excludes more than `services/console`: it also leaves out `base`, `services/broker`, `services/worker`, `services/transformer`, `services/redis` and `services/couchdb` (`.gitmodules`). The 147-alert baseline covers only the parent repo (`lib/`, root modules). This is written down only in `.planning/`. The workflow header says nothing about it. A later edit that adds `submodules: true` would quietly pull those trees into the scan (possibly failing on the `git@` URLs). Readers of the Security tab may also assume the console is covered.
**Fix:** Add a line to the header comment, for example: `# Submodules are intentionally not checked out (D-06): only the parent repo (lib/, root modules) is analysed.`

### IN-05: The edited step runs under `/bin/sh --login` without `-e`, so a failed login does not stop it

**File:** `.circleci/config.yml:630`, `:762-771`
**Issue:** The test job replaces CircleCI's default `/bin/bash -eo pipefail` with `shell: /bin/sh --login`, which does not set `-e`. In "Starting Support Services", a failed `docker login dhi.io` (`:770`) lets the step continue. The step then fails later and less clearly, on the `couchdb` pull in `docker compose up`, or passes if the image is already cached. The same applies to the `chmod` at `:766`. This predates the phase, but it lives in the step this phase edited.
**Fix:** Set `set -e` at the top of multi-command steps, or change the job shell to `/bin/sh -e --login`. Check first that the `if ! grep -q ...` test at `:784` still behaves the same (it does, because `if` conditions are exempt from `-e`).

### IN-06: The `docker-swarm.yml` reconciliation date is stale

**File:** `docker-swarm.yml:3-6`
**Issue:** The header says the file was "Reconciled against the live stack on 2026-09-18". Since then the file has changed, and D-13 changed the live `thinx.yml` and service to match (2026-09-25, backup `thinx.yml.bak-phase22-20260925T130834Z`). With the old date, a reader can't tell whether this removal went out to the live stack.
**Fix:** Change it to `Reconciled ... on 2026-09-25 (phase 22 removed VUE_APP_CONSOLE_HOSTNAME from console; mirrored to gluster thinx.yml and live).`

---

_Reviewed: 2026-09-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
