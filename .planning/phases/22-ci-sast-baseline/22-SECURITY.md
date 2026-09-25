---
phase: "22"
slug: "ci-sast-baseline"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-25"
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| CircleCI job → remote Docker engine / registries | Registry credentials from CircleCI contexts are used for docker login | Registry credentials (secret) |
| GitHub Actions runner → code scanning API | GITHUB_TOKEN with `security-events: write` uploads SARIF | Workflow token, SARIF results |
| Operator workstation → GitHub remotes | Pushes to thinx-staging in two repos. thinx-staging is the production deploy path; main is PR-gated but bypassable. The gh token creates the PR and reads the protection settings | Source commits, gh token |
| CircleCI build → private registry → swarm | Build args carry the console, landing and API hosts; Swarmpit autoredeploys `thinx_vue` from the registry | Public hostnames, container images |
| Operator workstation → swarm manager (ssh) | Root shell on production. 22-02 ran one env-rm; 22-04 allowed only the rung-1 swarmpit_app restart (not used) | Root shell, service env |
| Public internet → rtm.thinx.cloud / console.thinx.cloud | Users follow the console footer links; the classic console restarted during the env-rm | Link targets |
| Repo (public) / PR page → anyone | Committed plans, summaries, tests, commit messages and the PR title/body are world-readable | Planning text (must hold no secrets) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-22-01 | Information disclosure | `.circleci/config.yml` test-job registry login | medium | mitigate | Raw argv-password login removed (89c5cf93); every private-registry login goes through stdin `registry-login`; gate `argv=0 direct=0` | closed |
| T-22-02 | Elevation of privilege | CodeQL workflow GITHUB_TOKEN | medium | mitigate | Top-level `contents: read`; job adds only `security-events: write`, `actions: read`; repo default token read-only | closed |
| T-22-SC | Tampering | GitHub Actions supply chain (`checkout@v7`, `codeql-action/*@v4`) | medium | mitigate | Only GitHub-owned actions, no `run:` steps; org policy `allowed_actions=selected`, GitHub-owned only | closed |
| T-22-03 | Information disclosure | Committed CodeQL baseline in a public repo | low | accept | See Accepted Risks Log AR-22-01 | closed |
| T-22-04 | Denial of service | Private registry during concurrent pushes | low | mitigate | Every push waited for the CircleCI queue to drain (timelines verified) | closed |
| T-22-05 | Denial of service | thinx_console rolling restart from `--env-rm` | low | mitigate | Pipeline drained first; single env-rm; update `completed`, rtm root 200 | closed |
| T-22-06 | Tampering | Gluster `thinx.yml` edit | medium | mitigate | Enclosing-service check, timestamped backup, `dead=0 removed=1 added=0`; verifier read-only `gluster_dead=0` | closed |
| T-22-07 | Elevation of privilege / Repudiation | Stack-wide redeploy resetting chronograf credentials | high | mitigate | Only `docker service update --env-rm … thinx_console`; no restart.sh / stack deploy (22-02-SUMMARY); UAT test 2 approved | closed |
| T-22-08 | Information disclosure | Env and secret exposure while inspecting live services | medium | mitigate | Key-names-only listings; 0 env values / tokens in phase artifacts and commit messages | closed |
| T-22-09 | Spoofing | Console links sending users to the wrong host | low | mitigate | Build-arg chain `VUE_WEB_HOSTNAME` → `VUE_APP_CONSOLE_HOSTNAME`; live public pages render the correct hrefs | closed |
| T-22-10 | Tampering / Elevation of privilege | Accidental merge or direct push to main | high | mitigate | origin/main unchanged at 033ea946, no force-push; PR #569 open, not merged, no auto-merge | closed |
| T-22-11 | Information disclosure | PR body contents | medium | mitigate | PR title/body scan: 0 IPs, ssh/key/port patterns, tokens or registry port references | closed |
| T-22-12 | Denial of service | CodeQL made a required check | low | mitigate | `protection=0 rulesets=0`, default setup `not-configured` | closed |
| T-22-13 | Elevation of privilege | `pull_request` workflow token | low | accept | See Accepted Risks Log AR-22-02 | closed |
| T-22-14 | Spoofing | Layout footer anchors (href target) | low | mitigate | Hrefs come only from build-time `VUE_APP_*` via the hostnames mixin + `fixUrlProtocol`; template unchanged (2/0 diff); unit test pins both hrefs | closed |
| T-22-15 | Tampering / Elevation of privilege | Pushes to main in either repo; PR #569 | medium | mitigate | Parent main 033ea946, submodule main a0e86707, no force-push; bump commit touches only the gitlink | closed |
| T-22-16 | Denial of service | A broken Vue bundle deployed to console.thinx.cloud | low | mitigate | Unit test green before push; Dockerfile `yarn build && yarn test:csp:dist` fails the image build on error; job 15424 green; live bundle 9bf5cf9 | closed |
| T-22-17 | Information disclosure | CircleCI output, service env, ssh details, commit and summary text | medium | mitigate | Credential-regex scan 0 hits across pushed and unpushed ranges, commit messages and submodule diff; no ssh used in 22-04 | closed |
| T-22-18 | Elevation of privilege / Repudiation | Stack-wide redeploy during rollout recovery | high | mitigate | No recovery needed (22-04-SUMMARY); rollout timing matches Swarmpit autoredeploy; UAT test 2 approved | closed |
| T-22-19 | Information disclosure | Pending `.planning` docs published by the parent push | low | accept | See Accepted Risks Log AR-22-03 | closed |
| T-22-20 | Tampering | Test harness evaluating source text with `new Function` | low | accept | See Accepted Risks Log AR-22-04 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Evidence provenance:** T-22-06, the negative claim in T-22-07 and the server-side half of T-22-05 concern swarm/gluster state that the auditor could not observe directly (no-ssh audit). They are closed on the executor's recorded verify output (22-02-SUMMARY), the verifier's read-only live checks (22-VERIFICATION) and the human UAT sign-off (22-UAT test 2), backed by public CircleCI timelines, rtm HTTP 200 and bundle rollout timing. Stronger proof, if wanted: an operator reads each thinx stack service's `UpdatedAt` and confirms only thinx_console changed at about 13:08Z.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-03 | The source is public, so anyone can reproduce the CodeQL results, and ROADMAP Phase 23 already names the sinks. The committed baseline holds only numbers, rule ids, severities, paths and lines (re-verified: 147 records, no message/html_url fields) | Plan 22-01 threat model; confirmed in UAT 2026-09-25 | 2026-09-25 |
| AR-22-02 | T-22-13 | The token has contents read at the top level; the job adds only `security-events: write` and `actions: read`. The PR comes from a same-repo branch, fork PRs get a read-only token without secrets, and the workflow has no `run:` steps | Plan 22-03 threat model; confirmed in UAT 2026-09-25 | 2026-09-25 |
| AR-22-03 | T-22-19 | Nothing new is disclosed: the same ssh line is already public in AGENTS.md on origin/main and origin/thinx-staging. The local 22-REVIEW.md no longer quotes it, but git history keeps it. Removing it is tracked as review finding WR-02. The token scan still guards against real credentials | Plan 22-04 threat model; confirmed in UAT 2026-09-25 | 2026-09-25 |
| AR-22-04 | T-22-20 | The harness is test-only and evaluates only the repo's own `src` files locally (no write, network or exec), following the `env-json.cjs` precedent. `tests/` is outside the webpack entry and the nginx runtime stage, so it never ships | Plan 22-04 threat model; confirmed in UAT 2026-09-25 | 2026-09-25 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-25 | 21 | 21 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

### Security Audit 2026-09-25

| Metric | Count |
|--------|-------|
| Threats found | 21 |
| Closed | 21 |
| Open | 0 |

Adjacent advisory review findings, not scored and not reopening any mitigation: WR-01 (test job still receives the private-registry credential via context, near T-22-01), IN-02 (checkout persists credentials, near T-22-02), IN-03 (actions pinned to mutable tags, near T-22-SC), IN-08 (footer links lack `rel="noopener noreferrer"`, near T-22-14), WR-03..WR-05 (footer guard runs in no CI and has blind spots, near T-22-16). See 22-REVIEW.md.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-25
