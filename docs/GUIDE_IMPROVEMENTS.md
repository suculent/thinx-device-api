# Guide & Documentation Improvements

_Audit produced by the Nightshift **Guide/Skill Improver** task._

This repository has no custom `.claude/skills/`, so the "guides and skills" in
scope are the developer- and operator-facing documents: `README.md`,
`AGENTS.md`, `CONTRIBUTING.md`, and the files under `docs/` (including
`docs/superpowers/`). Each guide below was checked against five criteria:

1. **Accuracy** — does it match the current code and deployment topology?
2. **Broken references** — do the files, scripts, and links it names still exist?
3. **Staleness** — does it describe work that has since changed or shipped?
4. **Onboarding completeness** — can a new contributor build, test, and run from it?
5. **Navigability & drift** — is it findable, cross-linked, and free of duplication?

Findings are split into **Safe to apply now** (already applied in this PR, or
mechanical/low-risk) and **Needs maintainer decision** (subjective rewrites,
topology calls, or content the maintainer owns). Applied changes are kept
intentionally small so this PR stays easy to review.

---

## Applied in this PR (safe, high-confidence)

| # | File | Change | Rationale |
|:--|:-----|:-------|:----------|
| A1 | `README.md` | Fixed the `micropython-docker-build` CI-badge **link target** from `suculent/nodemcu-docker-build` to `suculent/micropython-docker-build`. | Broken reference: the badge image already pointed at `micropython-docker-build.svg`, but the surrounding link sent readers to the NodeMCU repo. The correct repo is confirmed by the "Dockerized Firmware Builders" section, which links `Micropython → suculent/micropython-docker-build`. |
| A2 | `README.md` | Removed a stray trailing `1. ` line at end of file. | Leftover Markdown list artifact after the License badge; renders as an empty numbered-list item. Pure cleanup, no content change. |

---

## Needs maintainer decision (suggestions only)

### README.md

- **Endpoints section points to a missing script.** Line ~234 reads
  _"See 03-test.sh."_ but no `03-test.sh` exists anywhere in the repo (the only
  shell scripts in root are `codeclimate.sh`, `copy-envs.sh`,
  `docker-entrypoint.sh`). Meanwhile `docs/APIs.md` now catalogs the API
  endpoints. **Suggestion:** replace the reference with a link to
  `docs/APIs.md`, and drop the "no point of maintaining documentation … user
  base zero" sentence, which is stale.
- **No table of contents.** The README is ~300 lines spanning purpose,
  features, install (Compose + Swarm), port mapping, and "Platforms State of
  Union". **Suggestion:** add a short TOC after the badges for navigability.
- **"Platforms State of Union" may be stale.** The NodeMCU entry says the
  toolset "has not been updated for almost 3 years" and "will probably
  deprecate". If still true, state it as a decision; if not, refresh. Subjective
  — left to the maintainer.
- **Coveralls badge tracks `thinx-staging`, CircleCI table tracks `master`.**
  Not wrong, but worth a one-line note so contributors know which branch each
  badge reflects.

### AGENTS.md

- **Stale planning paths.** The "Swarm Auto-Pull Recovery" section references
  `.planning/phases/03-swarm-auto-pull/03-PLAN.md` and `03-SUMMARY.md`. Phase 3
  has been archived; those files now live under
  `.planning/milestones/v1.0-phases/03-swarm-auto-pull/`. **Suggestion:** update
  the two paths so the runbook links resolve.
- **Operational secrets in a tracked file.** AGENTS.md embeds a production SSH
  target (host IP, key path, custom port) and internal URLs. This is convenient
  but couples credentials-adjacent detail to version control. **Suggestion:**
  consider moving host/SSH specifics into a private runbook or `.planning/`
  (git-ignored) and cross-linking. Maintainer call.
- **Duplication with `.planning/runbooks/`.** The swarm-recovery steps overlap
  with `.planning/runbooks/`. **Suggestion:** keep one canonical copy and link
  to it from the other to prevent drift.

### CONTRIBUTING.md

- **Two documents in one file.** The top is a genuinely useful Conventional
  Commits + `commitlint` guide; the rest is a Code of Conduct. **Suggestion:**
  split the CoC into `CODE_OF_CONDUCT.md` (GitHub surfaces it specially) and
  keep `CONTRIBUTING.md` focused on how to contribute — including a short
  "how to run tests" pointer (`npm test`) and the build flow.
- **Tone.** A few CoC lines read informally ("No shit.", "stupid questions",
  "socially useless"). Harmless but off-key for a public CoC. Subjective —
  left to the maintainer.

### docs/APIs.md

- **Reads as a raw code comment, not a document.** The whole file is wrapped in
  `/* … */` and mixes endpoint lists with `describe(...)` spec scaffolding.
  **Suggestion:** convert to a proper Markdown endpoint reference (grouped by
  area, one table), then link it from the README "Endpoints" section (ties to
  the README finding above). Accuracy against `lib/router.*.js` should be
  spot-checked during that conversion.

### docs/Directory Structure Map.md

- **Malformed tree + duplication.** The ASCII tree lists `data/` twice and mixes
  the repo layout with the `/mnt/data` runtime layout, which is confusing.
  **Suggestion:** separate "repository layout" from "runtime data layout"
  (`/mnt/data`) into two small trees, and format as a fenced code block so
  indentation renders.

### docs/Statistics Roadmap.md

- **InfluxDB 1.8 examples only.** Still useful, but should cross-link the
  structured-logging work (see below), since stats now flow through the logger
  rather than log-parsing. **Suggestion:** add a "Status" line noting what has
  shipped vs. what is still roadmap.

### docs/THiNX Migration Tasklist.md

- Well-structured and current-looking; the container/migration tables are the
  strongest docs in the repo. No changes needed. **Minor:** it is effectively a
  living tracker — consider linking it from the README so it is discoverable.

### docs/superpowers/ (plans & specs)

- **Plan/spec describe work that has since shipped.** The
  `2026-04-01-structured-logger` plan and spec are marked _Approved_ and use
  unchecked `- [ ]` task boxes, but the implementation now exists:
  `lib/thinx/logger.js` is present and `winston` is a dependency in
  `package.json`. **Suggestion:** mark the plan **Implemented** (or move it to an
  archived/`done` folder) and check off completed tasks, so the doc does not
  read as pending work. This is the clearest staleness item in the repo.

---

## Summary of priorities

1. **High / mechanical (done here):** README micropython badge link; stray
   trailing line. _(Applied.)_
2. **High / quick maintainer wins:** README `03-test.sh` → `docs/APIs.md`;
   AGENTS.md stale `.planning/phases/03-*` paths; mark the structured-logger
   plan/spec as implemented.
3. **Medium / structural:** split `CONTRIBUTING.md` vs `CODE_OF_CONDUCT.md`;
   convert `docs/APIs.md` to real Markdown; add a README TOC.
4. **Low / hygiene:** de-duplicate the swarm runbook between `AGENTS.md` and
   `.planning/runbooks/`; reconcile badge branch labels; tidy the directory map.
