# Phase 10 Context: Cross-Project Dependency Coordination (services/console)

**Created:** 2026-06-03
**Milestone:** v1.9 — Backend Hygiene & Posture
**Requirements:** SEC-DEP-02

## Domain

Coordinate the parallel SEC-DEP-02 dependency-triage work in the `services/console` submodule (sibling GSD project, different repo: `git@github.com:thinx-cloud/console.git`). Classify the 2 high-severity Dependabot alerts on `thinx-cloud/console`; record the verdict roll-up in `.planning/dep-triage.md`; schedule (but do not execute) the parallel SEC-DEP-02 phase in `services/console/.planning/ROADMAP.md`; defer the submodule pointer bump until the console-side phase completes and merges.

In scope:
1. **Annex `.planning/dep-triage.md`** with a "Phase 10 / SEC-DEP-02 (services/console)" section containing the 2 high-severity alert classifications (data already fetched via `gh api repos/thinx-cloud/console/dependabot/alerts`).
2. **Schedule SEC-DEP-02 phase** in `services/console/.planning/ROADMAP.md` (touches the submodule). The actual phase plan/execution lives in that GSD workspace and is run by the operator in a separate session.
3. **Coordination runbook** documenting the cross-project workflow + how the submodule pointer bump lands after the console-side work merges.

Out of scope (deferred):
- Executing the dep-fix in `services/console` itself (lives in its own GSD workspace; operator opens that to plan + execute).
- Actually bumping the submodule pointer in this repo (depends on console-side work completing).
- CircleCI green-gate verification of the submodule bump (post-bump operator-side).

## Canonical Refs

- `.planning/ROADMAP.md` — Phase 10 (lines 100–106)
- `.planning/REQUIREMENTS.md` — SEC-DEP-02 (line 30)
- `.planning/dep-triage.md` — existing Phase 4 SEC-DEP-01 triage table (parent project alerts); Phase 10 adds annex
- `services/console/.planning/ROADMAP.md` — sibling GSD workspace; SEC-DEP-02 phase entry will be added
- `services/console/.planning/MILESTONES.md` — sibling milestones index
- `~/.claude/projects/-Users-igraczech-Repositories-thinx-device-api/memory/couchdb-access.md` — swarm-access reference (not directly used here)
- `AGENTS.md` — dep-triage convention, `chai-http` lock, deploy flow

## Code Context — The 2 high-severity console alerts (fetched 2026-06-03 via `gh api repos/thinx-cloud/console/dependabot/alerts?state=open&severity=high`)

### Alert 54 — `grunt < 1.5.3` (CVE-2022-1537, GHSA-rm36-94g8-835r)
- **Package:** `grunt`
- **Severity:** high (CVSS 7.0)
- **Vulnerability:** TOCTOU race condition in `file.copy` → arbitrary file write → local priv-esc IF a lower-privileged user has write access to both source and destination directories.
- **Manifest path:** `src/assets/global/plugins/jquery-validation-1.19.5/package.json`
- **Scope (per Dependabot):** `development`
- **Relationship:** `direct` (declared in the vendored jquery-validation plugin's bundled package.json)
- **Runtime/build classification:**
  - **NOT in production runtime path.** The vendored plugin's package.json describes grunt as a build tool for the plugin itself (which is consumed as pre-compiled static assets).
  - **NOT in the services/console build path.** The Vue console build (`npm run build:test` etc.) does NOT invoke grunt against the vendored plugin's package.json.
  - The vulnerable grunt is present in the lockfile graph only because `npm install` resolves the vendored plugin's package.json transitively. It is never executed.
  - **Effective exposure: ZERO.**

### Alert 52 — `grunt < 1.3.0` (CVE-2020-7729, GHSA-m5pj-vjjf-4m3h)
- **Package:** `grunt`
- **Severity:** high (CVSS 7.1)
- **Vulnerability:** Arbitrary code execution via default `load()` instead of `safeLoad()` in `grunt.file.readYAML`.
- **Manifest path:** `src/assets/global/plugins/jquery-validation-1.19.5/package.json` (SAME as Alert 54)
- **Scope (per Dependabot):** `development`
- **Relationship:** `direct`
- **Runtime/build classification:** Same as Alert 54 — vendored asset, not in build or runtime path. **Effective exposure: ZERO.**

### Classification verdict (both alerts)

**Verdict:** `deferred-vendored-asset` (NEW disposition introduced by Phase 10; mirrors `deferred-dev-only` + `deferred-stale` from Phase 4 SEC-DEP-01).

**Rationale:**
- Both alerts live in `src/assets/global/plugins/jquery-validation-1.19.5/package.json` — a vendored static-asset bundle. The plugin's source is shipped as pre-compiled JS+CSS; grunt is referenced only because it was the build tool used to author the plugin's original source.
- services/console does NOT invoke grunt against this vendored package.json during its own build. The vulnerable grunt versions exist in the dependency graph only as transitive metadata.
- No code path in the production runtime or in the services/console build pipeline reaches the vulnerable `grunt.file.copy` or `grunt.file.readYAML` functions.
- **Future trigger** for re-classification: if a future services/console build step starts invoking grunt against the vendored plugin's package.json, OR if the vendored plugin is replaced with a different bundle that runs grunt in-build.

**Recommended remediation (for the services/console SEC-DEP-02 phase to land):**
- **Preferred:** delete the vendored plugin's `package.json` (it's metadata only — the compiled JS/CSS in the same directory is what actually loads). Removes the alerts entirely.
- **Acceptable:** dismiss both alerts in Dependabot UI with rationale "vendored asset; grunt not in build path". The vulnerability still appears in lockfile but is marked dismissed.

## Decisions

### SEC-DEP-02 Disposition (THIS REPO scope)

**Decision:** Document-only in this repo, with concrete classification data.

- Annex `.planning/dep-triage.md` with a "Phase 10 / SEC-DEP-02 (services/console) roll-up" section containing the 2 high-severity alert table rows (Alert 54 + Alert 52) with their `deferred-vendored-asset` verdict and full rationale.
- Schedule SEC-DEP-02 as a phase entry in `services/console/.planning/ROADMAP.md` so the operator can plan + execute the actual remediation (delete vendored package.json or dismiss alerts) in the sibling GSD workspace.
- Defer the submodule pointer bump until the operator completes the console-side phase.

**Why not execute the remediation in Phase 10 itself:**
- The actual edit (deleting `src/assets/global/plugins/jquery-validation-1.19.5/package.json` OR dismissing Dependabot alerts) belongs in `services/console` — a separate Git repo with its own GSD workspace.
- Cross-repo execution in one session is brittle (submodule pointer + double-commit dance, two CI pipelines to verify).
- The classification work IS the substantive deliverable from this repo — without `dep-triage.md` annex, the verdict isn't recorded anywhere durable.

### Submodule pointer bump

**Decision:** DEFERRED to a follow-up operator action (NOT part of Phase 10 verification).
- Current submodule pointer: `27758ebda8a179a440aff1cd443f9ffe1fe84a6d` (services/console at `v1.999-3-g27758eb`).
- After the operator plans + executes the console-side SEC-DEP-02 phase, the pointer bumps to whatever the post-fix commit is. That bump is its own commit in this repo (`chore: bump services/console submodule to <sha>`) — out of Phase 10 scope.
- This matches Phase 10's ROADMAP success criterion #3 wording: "AFTER the console-side triage merges, the services/console submodule pointer in thinx-device-api is updated cleanly on thinx-staging". The submodule bump is conditional on the console-side merge.

### services/console-side phase scheduling

**Decision:** Add a new SEC-DEP-02 phase entry to `services/console/.planning/ROADMAP.md`.
- services/console is currently between milestones (v1.999 shipped 2026-05-27; v1.x backlog awaits `/gsd-new-milestone`). The cleanest landing is to add SEC-DEP-02 as the first phase of a new "v1.x Operational Hygiene" milestone OR as a standalone "post-v1.999 backport" entry. Either is acceptable; the planner can choose.
- The new phase entry includes: goal, dependencies (none), requirements (SEC-DEP-02), success criteria (4 items mirroring the parent project's structure), and a "Plans: TBD" placeholder.

## Coordination

- **Phase 10 IS independent** of Phases 5/6/7/8/9 in this repo. Can run anytime per ROADMAP line 102.
- **Phase 10 INTERACTS WITH** `services/console` submodule via: (1) editing its ROADMAP.md, (2) future submodule pointer bump.
- **Operator follow-up actions** after Phase 10 lands:
  1. Open `services/console` in its own GSD workspace (`cd services/console && /gsd:progress`).
  2. Plan + execute SEC-DEP-02 there (likely Plan: delete vendored `jquery-validation-1.19.5/package.json` + dismiss any auto-dismissed alerts).
  3. Push the console-side branch + verify the console-side CI green.
  4. Return to thinx-device-api root and run `git submodule update --remote services/console && git add services/console && git commit -m "chore: bump services/console submodule to <sha>"`.
  5. Push thinx-staging; verify thinx-device-api CI still green across the submodule bump.

## Deferred Ideas (captured, NOT in scope)

- **Automated cross-project triage runner** — a script that queries Dependabot APIs for all subprojects (worker, transformer, etc.) and produces unified triage tables. v1.10+ candidate.
- **Vendored-asset audit** — services/console may have other vendored plugin bundles with similar package.json metadata triggering false-positive alerts. Worth a sweep but out of v1.9 scope.
- **Dependabot dismissal-as-code** — programmatic dismissal of stale/vendored alerts via `gh api ... -X PATCH /repos/.../dependabot/alerts/<n>`. Operator-side scripted; not authored here.

## Open Questions for Researcher / Planner

- The dep-triage.md annex should be appended at the END of the file (preserving Phase 4 SEC-DEP-01 baseline) OR inserted as a new top-level section under a "Phase 10" header. Recommendation: new top-level section "## Phase 10 / SEC-DEP-02 (services/console) — Cross-Project Roll-up" to mirror the existing structure.
- The services/console ROADMAP.md edit format — confirm with the planner whether to land SEC-DEP-02 as a new milestone phase OR as a v1.x backlog entry that gets promoted later. CONTEXT recommends new milestone phase for clarity.
- Coordination runbook location — recommend `.planning/runbooks/cross-project-dependency-coordination.md` (new). Planner confirms.

## Constraints

- Phase 10 ships from this repo: dep-triage.md annex + runbook + a SEC-DEP-02 phase entry in services/console (submodule edit).
- The submodule edit requires a commit IN the submodule + a pointer update IN this repo. Phase 10 lands BOTH: the submodule edit (which becomes the new services/console HEAD) + the pointer bump (which captures the new SHA in this repo's submodule reference).
- The actual remediation (delete vendored package.json / dismiss alerts) is OUT OF SCOPE — operator does it in a separate session after Phase 10.
- All commits GPG-signed.
- Test-env ACCEPT pattern carries forward.
