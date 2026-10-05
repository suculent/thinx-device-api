# Phase 22: CI & SAST Baseline - Pattern Map

**Mapped:** 2026-09-25 (HEAD `76cee894`)
**Files analyzed:** 7 modified/created, plus 5 read-only verification targets
**Analogs found:** 6 / 7

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `.github/workflows/codeql-analysis.yml` (rewrite) | config (CI) | event-driven | itself (only workflow in `.github/workflows/`) | exact (in-place) |
| `.circleci/config.yml` (delete line 767) | config (CI) | batch | `registry-login` command, same file lines 9-46 | exact |
| `docker-swarm.yml` (delete line 343) | config (deploy) | n/a | sibling env lines 336-342 | exact |
| gluster stack file on `micro` + `docker service update --env-rm` | ops step | n/a | `.planning/runbooks/swarm.md`, memory `swarm-stack-deploy-and-couchdb-dhi` | role-match |
| `services/console/vue/Dockerfile` | config (build) | verify only | n/a | verify only |
| `services/console/.circleci/config.yml` | config (CI, submodule) | verify only | parent `.circleci/config.yml:196` | exact twin |
| `22-CODEQL-BASELINE.md` (new) | evidence doc | batch | `.planning/milestones/v1.0-phases/04-dependency-triage/` (PRE/POST audit pair) | partial |

## Line-number drift check (against current HEAD)

| CONTEXT ref | Actual | Status |
|---|---|---|
| `.circleci/config.yml:9-46` registry-login | 9-46 | OK |
| `:174` required_vars `VUE_WEB_HOSTNAME` | 174 | OK |
| `:196` `--build-arg VUE_APP_CONSOLE_HOSTNAME=${VUE_WEB_HOSTNAME}` | 196 | OK |
| `:235`, `:309` docker.io stdin logins | 235, 309 | OK |
| `:767` raw private-registry login | 767 | OK |
| `:771` dhi.io stdin login | 771 | OK |
| submodule `services/console/.circleci/config.yml:138/:160` | 138 / 160 | OK |
| Vue Dockerfile ARG 23 / ENV 44 | 23 / 44 | OK |
| Vue Dockerfile "`npm run build`" | **DRIFT:** there is no `npm run build`. The build runs as `yarn build` inside a single `RUN bash -c '...'` at lines 65-77 (the `yarn build` is on line 76), followed by `yarn test:csp:dist`. The ARG/ENV lines still come first, so the ordering claim in D-10.2 holds. Plans should cite `yarn build` (line 76). |
| Layout.vue:12, Login.vue:91, PasswordReset.vue:96 | same | OK (all `:href="this.$hostnames.CONSOLE"`) |
| `docker-swarm.yml` classic console at 316, env at 343, Vue Host rule at 410 | `console:` key at **line 316** (`image: ${REGISTRY}/thinx/console:swarm` at 319); env 343; Host rules at 410/414 | OK |
| CodeQL workflow | 67 lines, ends on `analyze@v1` | as described |

## Pattern Assignments

### `.github/workflows/codeql-analysis.yml` (rewrite)

**Analog:** the current file. No other workflow exists (`ls .github/workflows` shows only `codeql-analysis.yml`), so there is no repo-local convention for action versions. Use STACK.md: `actions/checkout@v7` and `github/codeql-action/{init,analyze}@v4`, GitHub-owned actions only.

**Keep verbatim** (lines 12-26, the least-privilege block, D-04):
```yaml
# Least privilege: every job starts read-only, and the one job that needs to
# write gets exactly that scope below. Without this block GITHUB_TOKEN inherits
# the repository default, which can include write access to contents/packages.
permissions:
  contents: read

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest

    permissions:
      contents: read          # actions/checkout
      security-events: write  # upload the SARIF results to code scanning
      actions: read           # read workflow run metadata (needed on private repos)
```

**Replace/remove:**
- Lines 3-10 triggers: `master` becomes `push: [main, thinx-staging]` and `pull_request: [main]`. Keep the `schedule` cron (currently `'0 18 * * 5'`).
- Lines 28-35 matrix `['javascript']`: either collapse it to `languages: javascript-typescript`, or keep the matrix with that value (Claude's discretion).
- Lines 39-43: `checkout@v2` with `fetch-depth: 2` becomes `checkout@v7`, with no fetch-depth needed.
- Lines 45-48: the `git checkout HEAD^2` step. Delete it.
- Lines 56-64: the autobuild comments, emoji comments and `npm install`. Delete them.
- `init@v1`/`analyze@v1` become `@v4`. Add `build-mode: none`, `queries: security-extended`, and a `config:` block with `paths-ignore` (`node_modules`, `**/*.min.js`, vendored static assets, `spec/`).

### `.circleci/config.yml` (CI-02)

**Target** (lines 763-772, the test job's "Starting Support Services" step):
```yaml
          export ENVIRONMENT=test
          chmod -R 666 ./services/couchdb/*
          docker login --username $DOCKER_LOGIN --password $DOCKER_PASSWORD https://registry.thinx.cloud:5000   # line 767 -> delete
          # couchdb is dhi.io/couchdb:3, which rejects anonymous pulls. ...
          echo "$DOCKER_PUBLIC_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin dhi.io   # line 771 -> leave (D-02)
          docker compose up -d mosquitto transformer worker couchdb
```

**Fallback analog** (D-01), usage as at lines 205-206:
```yaml
            - registry-login:
                registry: registry.thinx.cloud:5000
```
The command definition (lines 9-46) does an env preflight, then 5 attempts with `echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_LOGIN" --password-stdin << parameters.registry >>` and a backoff of `attempt*10`s. If the fallback is used, the step must go **before** the `run:` step (it is a command, not a shell line).

**D-01 pre-check evidence gathered at HEAD (supports delete):**
- `docker-compose.yml` `image:` values are `thinxcloud/mosquitto` (10), `dhi.io/couchdb:3` (31), `thinxcloud/worker:latest` (111), `dhi.io/influxdb:2` (249) and `chronograf:alpine` (263). None come from the private registry.
- Compose `build:` contexts: `services/redis` (FROM `redis:8.6.6-alpine3.23`), `services/transformer` (FROM `node:22.23.2-trixie-slim`, distroless), `.` (root `Dockerfile`), `services/console/src` (FROM `thinxcloud/console-build-env`, `nginx:1.31.3-alpine`).
- `Dockerfile` and `Dockerfile.test`: `FROM golang:1.26.8-alpine3.24 AS docker-cli` (line 5), `FROM thinxcloud/base:latest` (line 31).
- `grep -rn registry.thinx spec lib builders` returns nothing. The executor should still re-run this grep, and check the builder images the specs pull (e.g. `thinxcloud/*-docker-build`) before deleting.

### `docker-swarm.yml` (CI-03 dead env)

Lines 336-343 inside the classic `console:` service (key at 316):
```yaml
      - "VUE_APP_GOOGLE_MAPS_APIKEY=${VUE_APP_GOOGLE_MAPS_APIKEY}"
      - "VUE_APP_CONSOLE_HOSTNAME=${VUE_APP_CONSOLE_HOSTNAME}"      # line 343 -> delete (note trailing whitespace)
    deploy:
```
Delete only line 343. The other `VUE_APP_*` lines are deferred.

Ops mirror (D-13): make the same deletion in the gluster copy under `/mnt/gluster/deployment/swarm` on `micro`, then run `docker service update --env-rm VUE_APP_CONSOLE_HOSTNAME <thinx_console?>`. Confirm the name with `docker service ls` or `inspect`, and remember placement floats. Never use `restart.sh` or `docker stack deploy`.

### Vue hostname chain (verify only, submodule `services/console`)

- `vue/src/mixins/hostnames.js:4`: `const consoleHostname = process.env.VUE_APP_CONSOLE_HOSTNAME || window.location.origin;`. Lines 16-18 `fixUrlProtocol` prepend `https://` when there is no `://`. So a bare `console.thinx.cloud` var value still yields `https://console.thinx.cloud`. An unset var silently falls back to the serving origin, which looks correct only if you test on console.thinx.cloud itself. Bundle grep (D-10.3) is therefore the stronger proof.
- Dockerfile: ARG 23 and ENV 44 come before the `yarn build` at line 76. Stage 2 (`FROM nginx:1.31.3-alpine`, line 85) only needs the built dist.
- Parent `.circleci/config.yml:196` and submodule `.circleci/config.yml:160` carry identical `extra_build_args`, including `--build-arg VUE_APP_CONSOLE_HOSTNAME=${VUE_WEB_HOSTNAME}`. `VUE_WEB_HOSTNAME` is in `required_vars` at 174 and 138 respectively.

### `22-CODEQL-BASELINE.md` (new evidence artifact)

**Partial analog:** `.planning/milestones/v1.0-phases/04-dependency-triage/`, a pre/post evidence pair (`04-AUDIT-PRE.json` / `04-AUDIT-POST.json`) consumed by a later plan as the "before" state. Also `.planning/milestones/v1.0-phases/03-swarm-auto-pull/03-BASELINE.txt`. There is no prior markdown baseline doc to copy. Suggested sections:
1. Header: analysis commit SHA, workflow run URL, date, and query suite (`security-extended`).
2. Totals by severity.
3. Table of counts by rule id.
4. Table of counts by file.
5. A dedicated section for the `lib/thinx/git.js` (`execSync`) and `lib/thinx/builder.js` (`readFileSync`/`lstatSync`) alerts, with alert numbers and line numbers (Phase 23 "before").
6. Optionally, the raw `gh api repos/:owner/:repo/code-scanning/alerts` JSON saved alongside, following the 04-* JSON precedent.

## Shared Patterns

- **Secrets on stdin only:** `echo "$X" | docker login -u "$Y" --password-stdin <registry>` (lines 33-34, 235, 309, 771). No argv passwords.
- **Push to `thinx-staging` only.** Reach `main` by PR (D-08). The submodule is pushed first, then the parent pointer.
- **One-service swarm edits use `docker service update`**, never a stack deploy.

## No Analog Found

| File | Reason |
|------|--------|
| `22-CODEQL-BASELINE.md` | No prior code-scanning baseline exists. Use the structure above; the closest precedent is the 04-dependency-triage PRE/POST JSON. |

## Metadata

**Search scope:** `.github/workflows`, `.circleci`, `services/console/{.circleci,vue}`, `docker-compose.yml`, `docker-swarm.yml`, root and service Dockerfiles, `spec`, `lib`, `builders`, `.planning/milestones`.
