---
phase: 04-dependency-triage
plan: 04
type: execute
wave: 4
depends_on: [04-01, 04-02, 04-03]
files_modified:
  - .planning/phases/04-dependency-triage/04-SUMMARY.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
autonomous: false
requirements: [SEC-DEP-01]

must_haves:
  truths:
    - "PR `thinx-staging -> master` opened on parent suculent/thinx-device-api with the override fixes + Phase 4 docs."
    - "PR `thinx-staging -> main` opened on parent suculent/thinx-device-api (same fix surface; cloud scanners may target either branch as default)."
    - "If services/console has a non-empty `main..thinx-staging` diff: PR `thinx-staging -> main` opened on services/console (sibling project; merges accumulated phase-11 work; does NOT touch THIS phase's SEC-DEP-01 scope)."
    - "Each PR title follows the format: `chore(deps): SEC-DEP-01 - merge dependency fixes to {target}` (or, for services/console, the appropriate sibling-project commit-message style)."
    - "Each PR body links to `.planning/dep-triage.md`, lists the post-fix Dependabot count, lists the verification checklist, lists what's NOT in this PR."
    - "Operator has approved + merged the PRs in the GitHub UI; this slice does NOT auto-merge."
    - "After PRs merge: STATE.md, ROADMAP.md, REQUIREMENTS.md, and 04-SUMMARY.md are updated to reflect SEC-DEP-01 Verified."
    - "Other submodules (services/worker, services/transformer, services/redis, services/couchdb, services/broker, base, builders/*) confirmed as Dependabot-disabled (`gh api` returns 403) — no PR action; documented as no-action in 04-SUMMARY.md."
  artifacts:
    - path: ".planning/phases/04-dependency-triage/04-SUMMARY.md"
      provides: "Updated phase close-out: status flips from `code-shipped` to `complete`; verified: true; PR URLs + merge timestamps recorded."
      contains: "PR.*master.*merged|PR.*main.*merged"
    - path: ".planning/STATE.md"
      provides: "Phase 4 row marked Verified; Performance Metrics updated; Session Continuity reflects v1 GA closure."
      contains: "Phase 4.*Verified|SEC-DEP-01.*Verified"
    - path: ".planning/REQUIREMENTS.md"
      provides: "SEC-DEP-01 status flipped to Verified; Traceability table reflects 4/4 v1 requirements Verified."
      contains: "SEC-DEP-01.*Verified"
    - path: ".planning/ROADMAP.md"
      provides: "Phase 4 row marked Verified; v1 GA backend closures complete."
      contains: "Phase 4.*Verified|4/4.*Verified"
  key_links:
    - from: "thinx-staging HEAD (parent)"
      to: "master + main branches on suculent/thinx-device-api"
      via: "Two PRs opened via `gh pr create --base master --head thinx-staging` and `--base main --head thinx-staging`"
      pattern: "gh pr create.*--base (master|main)"
    - from: "PR body verification checklist"
      to: "Phase 4 evidence — `.planning/dep-triage.md`, 04-AUDIT-POST-PROD.json, 04-DEPENDABOT-POST.json"
      via: "Body includes inline-rendered Markdown links + bullet-point evidence list"
      pattern: "dep-triage.md|AUDIT-POST-PROD|DEPENDABOT-POST"
    - from: "services/console default branch (main)"
      to: "PR thinx-staging -> main only if `git -C services/console log main..thinx-staging --oneline` is non-empty"
      via: "Gated check; submodule PR is conditional, not mandatory"
      pattern: "main..thinx-staging.*[0-9]+ commits"

must_not:
  - "Do NOT auto-merge the parent PRs — operator MUST approve and merge in the GitHub UI."
  - "Do NOT open empty PRs on submodules that have no diff between main and thinx-staging."
  - "Do NOT open PRs against services/worker, services/transformer, services/redis, services/couchdb, services/broker, base, or builders/* — Dependabot is disabled on these (verified by init context); no fix-merge target exists."
  - "Do NOT switch branches during this slice — gh CLI's `--base` and `--head` flags do not require a local checkout of the target branch."
  - "Do NOT touch services/console source/code — the only services/console action is the gated PR-creation (and only if the diff is non-empty AND contains user-blessed phase-11 work)."
  - "Do NOT mix SEC-DEP-01 fixes and SEC-DEP-02 console-triage work in the services/console PR — the services/console PR's purpose is to merge accumulated phase-11 work (which is unrelated to dependency triage); SEC-DEP-02 is a v1.x backlog item, not a Slice 4 task."
  - "Do NOT close the phase Verified before BOTH parent PRs (master + main) are merged. If operator merges only one, the phase remains code-shipped."
  - "Do NOT push --force to master or main — these are protected branches; gh CLI's PR-merge flow is the only landing path."
---

<objective>
Land Phase 4's dependency fixes on the default branches that cloud scanners (GitHub Security tab, Snyk Cloud, Dependabot's authoritative target) actually watch. Open PRs `thinx-staging -> master` and `thinx-staging -> main` on parent `suculent/thinx-device-api`. If the services/console submodule has accumulated work that should ship, ALSO open `thinx-staging -> main` on services/console (gated by non-empty diff check). Wait for operator approval + merge via the GitHub UI. After both parent PRs merge, flip SEC-DEP-01 + Phase 4 status to Verified across STATE.md, REQUIREMENTS.md, ROADMAP.md, and 04-SUMMARY.md.

Purpose: Cloud vulnerability scanners — GitHub Security tab, Snyk Cloud, Dependabot's primary target — only re-evaluate the DEFAULT branch. The fix being on `thinx-staging` does not register against the default-branch security posture until it lands on `master` (and/or `main`). Per user mandate 2026-05-26, the merge-up is part of Phase 4's scope; without it, SEC-DEP-01 is only half-closed.

Output: 2 parent PRs (one to master, one to main) merged via operator; optionally 1 services/console PR (gated) merged via operator; STATE/ROADMAP/REQUIREMENTS bookkeeping flipped to Verified; 04-SUMMARY.md status updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/dep-triage.md
@.planning/phases/04-dependency-triage/04-RESEARCH.md
@.planning/phases/04-dependency-triage/04-SUMMARY.md
@.planning/phases/04-dependency-triage/04-DEPENDABOT-POST.json
@.gitmodules

<interfaces>
<!-- This slice operates through the `gh pr create` API + the GitHub UI (for merges). No local code modifications. -->

Parent repo PRs (mandatory — both must open):

  PR A: thinx-staging -> master on suculent/thinx-device-api
    Command shape:
      gh pr create --base master --head thinx-staging \
        --title "chore(deps): SEC-DEP-01 - merge dependency fixes to master" \
        --body "$(cat <<'EOF'
        <body content — see Task 1 action>
        EOF
        )"
    Expected output: URL of the form https://github.com/suculent/thinx-device-api/pull/<N>
    Branch-protection: master is a protected branch; PR cannot be merged via gh CLI alone — operator must approve + merge via the UI.

  PR B: thinx-staging -> main on suculent/thinx-device-api
    Same command shape with `--base main`.
    Identical body content (modulo the `target` token in the title).
    Note: user explicit request 2026-05-26 — both PRs open even though only one branch may be the "official" default. Some cloud scanners track main even when master is default; opening both ensures coverage regardless of which scanner tracks which branch.

PR body template (use this verbatim for both parent PRs, substituting `{target}` with `master` or `main`):

  ## Summary

  Phase 4 of the v1 GA backend closures: dependency triage. Classifies all 29 open Dependabot
  findings against suculent/thinx-device-api as v1-blocker or v1.x-deferred and ships the
  blocker fixes via 4 surgical edits to package.json's overrides block.

  Closes: SEC-DEP-01 (project ID; tracked in .planning/REQUIREMENTS.md)

  ## What changed

  4 override-block edits in `package.json` (L97-L136):
  - REMOVE `follow-redirects: 1.15.6` — was forcing axios's safe `^1.16.0` declaration to downgrade
  - CHANGE `lodash: 4.17.23 -> 4.18.1` — closes GHSA-r5fr-rjxr-66jc + GHSA-f23m-r3pf-42rh
  - CHANGE `minimatch: 5.1.0 -> 5.1.9` — closes 3 GHSAs (`<5.1.8` for two, `<5.1.7` for one)
  - ADD `ws: 8.20.1` — forces engine.io's `~8.17.1` nested tilde-lock upward (closes ws GHSA)

  Plus dep-triage paper trail:
  - `.planning/dep-triage.md` — Section 1 (29 alerts classified), Section 2 (fix log), Section 3 (post-fix baseline)
  - `.planning/phases/04-dependency-triage/04-RESEARCH.md` — 532 lines of triage research
  - `.planning/phases/04-dependency-triage/04-{01,02,03,04}-*-PLAN.md` — 4 slice plans
  - `.planning/phases/04-dependency-triage/04-SUMMARY.md` — phase close-out
  - 6 audit/Dependabot JSON artifacts (pre + post)

  ## Verification (already performed on thinx-staging)

  - [x] CI green on Slice 2 commit on thinx-staging
  - [x] `npm test` exits 0 (17 ZZ-* + non-ZZ jasmine specs) — local pre-push + CI confirms
  - [x] `npm audit --omit=dev` runtime-tree high count: 9 (pre-fix) -> 0 (post-fix)
  - [x] Swarmpit autoredeploy fired on rtm.thinx.cloud within ~120s of CI green
  - [x] Phase 1 contract preserved: `POST /api/v2/password/reset` with `Bearer null` returns 200
  - [x] Dependabot post-fix open count: <X> (down from 29 pre-fix; <Y> remaining are deferred-stale/deferred-dev-only per dep-triage.md Section 1)

  ## What's NOT in this PR

  - **REFACTOR-05** (jshint + fs-finder misclassification): filed as v1.x backlog in REQUIREMENTS.md; restructuring would change production image contents and is out of scope for v1 GA.
  - **SEC-DEP-02** (services/console dependency triage): the console submodule has 15 open Dependabot alerts of its own (2 high + 13 medium); SEC-DEP-01 was scoped to suculent/thinx-device-api ONLY. Console triage tracked as v1.x backlog; coordinate via services/console/.planning/.
  - **Other override-block entries**: the overrides block has 38 pins total; this PR touches only 4. Block hygiene (pruning unused pins) is a v1.x exercise.
  - **chai-http v5 migration**: explicit AGENTS.md lock at L82-92; no current Dependabot alert in the chai-http/superagent v3 chain forces this. Tracked as TEST-CHAI-01.

  ## Test plan

  - [ ] CI green on the merge commit (`gh pr checks <PR-N>`)
  - [ ] After merge: confirm GitHub Security tab high-severity count = 0 unaddressed (allow up to 24h for default-branch rescan)
  - [ ] After merge: confirm Snyk Cloud (if attached) re-scans and reports 0 unaddressed runtime high
  - [ ] Phase 4 verification artifacts remain reachable post-merge: `.planning/dep-triage.md`, `04-AUDIT-POST-PROD.json`, `04-DEPENDABOT-POST.json`

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

services/console gated PR (conditional — only if diff is non-empty):

  Check command: `git -C services/console log main..thinx-staging --oneline | head -1`
  Decision:
  - Empty output: SKIP — no work to merge. Document in 04-SUMMARY.md as "services/console: no diff between main and thinx-staging; no PR opened".
  - Non-empty output: review the commit list:
    - If commits are user-blessed Phase 11 work (G8/G9 references; commit subjects match "fix(09-...)", "feat(10-...)", "docs(phase-1...)", "plan(11)", etc. — see git log output captured by planner: 3e3fae4 docs(state) Phase 11 Wave 1 Verified, 1a467f1 G9 revoke selection-prune, 4be39f3 fix(11-02/G9), 25658d5 plan(11), 98e5911-7939853 Phase 10 work): OPEN the PR.
    - If commits are unidentified / unrelated to v1 GA: HALT and surface for operator review.

  PR command shape:
    gh pr create --repo suculent/thinx-vue-console --base main --head thinx-staging \
      --title "chore: merge accumulated thinx-staging work to main" \
      --body "$(cat <<'EOF'
      Merges accumulated thinx-staging work (Phase 11 v1 GA gap-closures) to services/console
      default branch. Tracked as part of parent project Phase 4 Slice 4 merge-up.

      NOTE: This PR does NOT contain SEC-DEP-01 dependency fixes — those are scoped to the
      parent project (suculent/thinx-device-api). The console's own 15 open Dependabot alerts
      are tracked as v1.x backlog item SEC-DEP-02; that triage will be a separate phase
      coordinated via services/console/.planning/ROADMAP.md.

      ## Commits being merged
      <git log output here>

      ## Test plan
      - [ ] Console CI green on merge commit
      - [ ] Vue console functional smoke (login + dashboard render) on the post-merge build

      Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
      EOF
      )"

  Note: the actual repo URL for services/console may be `suculent/thinx-vue-console` or similar — confirm with `git -C services/console remote -v` before running the command.

Submodule Dependabot status (per init context):
  - services/worker, services/transformer, services/redis, services/couchdb, services/broker, base, builders/* — Dependabot DISABLED (`gh api` returns 403 on these repos' alerts endpoint).
  - No PR action for these submodules in this slice; document as no-action in 04-SUMMARY.md.

STATE.md edits for Verified (Task 5):
  - Phase Progress table: Phase 4 row status -> "Verified (2026-05-26)" (or whatever date the PRs merge)
  - Current Position: Active phase -> "(v1 GA backend closures complete)"; Active plan -> "(none — v1 GA shipped)"
  - Phase status -> "verified"
  - Progress bar -> "[████████████████████] 100% (4/4 phases)"
  - v1 requirement coverage line -> "4 of 4 mapped ✓ | Verified: 4 (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01)"
  - Performance Metrics: increment "Phases completed" to 4; record this phase's commit count and duration
  - Decisions section: append the Slice 4 merge-up outcome decision
  - Session Continuity: update "Stopped at" + "Next action" — Phase 4 SEC-DEP-01 verified end-to-end; next is the v1 GA release tag

REQUIREMENTS.md edits for Verified (Task 5):
  - Find the SEC-DEP-01 bullet in "## v1 Requirements" -> "### Security & Compliance"
  - Replace `- [ ] **SEC-DEP-01**: All 11 high-severity...` with `- [x] **SEC-DEP-01** ✓ Verified <date> (Phase 4 — see `phases/04-dependency-triage/04-SUMMARY.md`): ...` followed by the same description + the validation evidence (a) `.planning/dep-triage.md` table of all findings with verdicts ✓ (b) blocker count on Security tab dropped to documented deferred-with-rationale baseline ✓ — Phase 4 closed 7 GHSAs via 4 override edits; 19 deferred-stale alerts dismissed via manual UI walk; 3 deferred-dev-only excluded from production image per Dockerfile L86.
  - Traceability table at file bottom: SEC-DEP-01 row status -> "Verified (<date>)"
  - "Coverage" summary: "Verified: 4 (AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01)"; "Pending: 0"

ROADMAP.md edits for Verified (Task 5):
  - "## Phases" list: `- [x] **Phase 4: Dependency Triage** — ✓ Verified <date> (parent PRs <master-pr-url> + <main-pr-url> merged; 7 GHSAs closed; SEC-DEP-01 closed)`
  - "### Phase 4: Dependency Triage" -> Plans line: flip `[ ] 04-04-merge-up-...` to `[x] 04-04-...PLAN.md — PRs <master-url> + <main-url> merged <date>`
  - Phase Summary table: Phase 4 row -> status "Verified"
  - "## Progress" table: Phase 4 row -> "4/4 | Verified | <date>"
  - Phase Summary table at bottom — Phase 4 row status -> Verified

04-SUMMARY.md edits for Verified (Task 5):
  - Frontmatter: `status: complete`, `verified: true`, `verified-date: <date>`
  - Verification section: append PR URLs + merge timestamps
  - "What changed" section: append the PR-creation entry
  - "Next steps" section: replace "Slice 4 outstanding" with "v1 GA backend closures complete (4/4 v1 requirements Verified); next milestone = v1.0 release tag"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Open PR `thinx-staging -> master` on parent suculent/thinx-device-api</name>
  <files></files>
  <read_first>
    - .planning/phases/04-dependency-triage/04-RESEARCH.md (Section "Reviewer-friendly commit / PR format" — defines title + body conventions)
    - .planning/phases/04-dependency-triage/04-SUMMARY.md (the close-out doc — its content informs the PR body)
    - .planning/dep-triage.md (PR body's "What changed" + "Verification" link target)
    - .planning/phases/04-dependency-triage/04-DEPENDABOT-POST.json (for the post-fix Dependabot count value to insert in the PR body)
  </read_first>
  <action>
    Confirm pre-conditions:
    1. `git branch --show-current` returns `thinx-staging` (do NOT switch branches).
    2. `git status -sb` shows working tree clean and up-to-date with origin/thinx-staging (Slice 3 pushed; nothing in flight).
    3. `gh repo view suculent/thinx-device-api --json defaultBranchRef --jq .defaultBranchRef.name` confirms the parent's default branch (likely `master`). If the default is NOT master, note it but still open both PRs (user mandate is explicit: BOTH master and main get the fix).

    Open the PR:
    4. Build the PR body via heredoc, using the template from this plan's `<interfaces>` block. Substitute:
       - `<X>` (post-fix Dependabot open count) with `jq 'length' .planning/phases/04-dependency-triage/04-DEPENDABOT-POST.json` from Slice 3 Task 2.
       - `<Y>` (remaining deferred count) with `<X>` minus 0 (since post-fix high should be 0; the remaining are all deferred-by-design).
       - Replace `{target}` token in the title with `master`.
    5. Run: `gh pr create --base master --head thinx-staging --title "chore(deps): SEC-DEP-01 - merge dependency fixes to master" --body "$(cat <<'EOF' ... EOF)"`.
    6. Capture the PR URL from gh's stdout. Confirm via `gh pr view <PR-number> --json url,state,headRefName,baseRefName --jq .` that:
       - state = "OPEN"
       - headRefName = "thinx-staging"
       - baseRefName = "master"

    Do NOT merge the PR. Do NOT approve via `gh pr review --approve` (operator does this in the UI).
    Do NOT add labels, milestones, or reviewers automatically — defer to the operator if they're managed manually on this repo.
  </action>
  <verify>
    <automated>git branch --show-current | grep -qE '^thinx-staging$' &amp;&amp; PR_URL=$(gh pr list --base master --head thinx-staging --state open --json url --jq '.[0].url') &amp;&amp; [ -n "$PR_URL" ] &amp;&amp; gh pr view "$PR_URL" --json state,baseRefName,headRefName,title --jq 'select(.state == "OPEN" and .baseRefName == "master" and .headRefName == "thinx-staging" and (.title | test("SEC-DEP-01.*master")))'</automated>
  </verify>
  <acceptance_criteria>
    - On branch `thinx-staging` (no branch switch occurred).
    - A new PR exists on `suculent/thinx-device-api` with `state == OPEN`, `baseRefName == master`, `headRefName == thinx-staging`.
    - PR title matches `^chore\(deps\): SEC-DEP-01 - merge dependency fixes to master$`.
    - PR body contains: link or path reference to `.planning/dep-triage.md`; the 4 override-edit summary; the post-fix Dependabot count; the "What's NOT in this PR" section; the verification checklist.
    - PR URL captured for Task 5 bookkeeping.
    - PR is NOT merged and NOT approved — operator owns those actions.
  </acceptance_criteria>
  <done>
    `thinx-staging -> master` PR is OPEN on parent repo with the full Phase 4 paper trail in its body. Operator can review and merge in the UI.
  </done>
</task>

<task type="auto">
  <name>Task 2: Open PR `thinx-staging -> main` on parent suculent/thinx-device-api</name>
  <files></files>
  <read_first>
    - Same as Task 1
  </read_first>
  <action>
    Repeat Task 1's flow with `--base main` instead of `--base master`. Use identical PR body content (substitute `{target}` with `main` in the title only).

    1. `gh pr create --base main --head thinx-staging --title "chore(deps): SEC-DEP-01 - merge dependency fixes to main" --body "..."`. Body is byte-identical to Task 1's body except for the title token.
    2. Capture the PR URL.
    3. `gh pr view <PR-number>` confirms state=OPEN, baseRefName=main, headRefName=thinx-staging.

    If `gh pr create` reports "no commits between main and thinx-staging" or similar — meaning main is already up-to-date with thinx-staging (uncommon but possible if main was recently force-merged from staging):
    - Verify via `git -C . log main..thinx-staging --oneline` — if empty, then yes, main is ahead. Skip this task; document in 04-SUMMARY.md.
    - If non-empty, debug why gh refused; the PR should be openable.

    If the parent repo doesn't have a `main` branch at all (some repos only have `master`):
    - Verify via `gh api repos/suculent/thinx-device-api/branches/main --jq .name` returns "main" (non-error). If it returns a 404, document in 04-SUMMARY.md that main doesn't exist and only Task 1's master PR is openable.

    Do NOT merge. Operator owns the UI merge.
  </action>
  <verify>
    <automated>PR_URL_MAIN=$(gh pr list --base main --head thinx-staging --state open --json url --jq '.[0].url'); MAIN_EXISTS=$(gh api repos/suculent/thinx-device-api/branches/main --jq .name 2&gt;/dev/null); if [ "$MAIN_EXISTS" = "main" ]; then [ -n "$PR_URL_MAIN" ] &amp;&amp; gh pr view "$PR_URL_MAIN" --json state,baseRefName,headRefName,title --jq 'select(.state == "OPEN" and .baseRefName == "main" and .headRefName == "thinx-staging" and (.title | test("SEC-DEP-01.*main")))'; else echo "main branch absent — task gracefully skipped; documented in 04-SUMMARY.md"; true; fi</automated>
  </verify>
  <acceptance_criteria>
    - EITHER: A PR exists on `suculent/thinx-device-api` with `state == OPEN`, `baseRefName == main`, `headRefName == thinx-staging`, title matches `^chore\(deps\): SEC-DEP-01 - merge dependency fixes to main$`.
    - OR (gracefully): The `main` branch does not exist on the parent repo OR main is already ahead of thinx-staging, AND this fact is documented for Task 5's 04-SUMMARY.md update.
    - PR URL captured for Task 5 bookkeeping (if PR was openable).
    - PR is NOT merged and NOT approved.
  </acceptance_criteria>
  <done>
    `thinx-staging -> main` PR is OPEN on parent repo (OR documented as not-applicable). Operator can review in the UI alongside Task 1's PR.
  </done>
</task>

<task type="auto">
  <name>Task 3: Gated services/console PR — open `thinx-staging -> main` only if non-empty diff + user-blessed work</name>
  <files></files>
  <read_first>
    - .planning/phases/04-dependency-triage/04-SUMMARY.md (cross-project context — services/console is a sibling project; this is a coordination PR, not a SEC-DEP-01 PR)
    - Planner's captured git log for services/console (init context: 3e3fae4, 1a467f1, 4be39f3, 25658d5, 98e5911, ba13b45, 20e5eeb, 0ac0811, 350a7eb, 1a7b0be, 9dc9d84, e6dab88, 9cf5a48, 91a37c3, cdc0bc4, 358bd95, dea8390, 7939853, 733d73f, dd19a68 — Phase 11 + Phase 10 + Phase 9 work, all user-blessed)
  </read_first>
  <action>
    Gated decision tree:

    1. Run `git -C services/console log main..thinx-staging --oneline`. Capture the output.
    2. If output is EMPTY: skip this task. Document in 04-SUMMARY.md "services/console: main already ahead of thinx-staging, no PR opened".
    3. If output is NON-EMPTY: review the commit subjects:
       - Acceptable: subjects matching `fix(`, `feat(`, `docs(`, `chore(`, `test(`, `plan(` with phase numbers in the 9-11 range (Phase 9 = G7 / G8 / G9 frontend work; Phase 10 = admin features; Phase 11 = v1 GA gap closures). The planner's captured log shows these are all user-blessed.
       - Unacceptable: subjects containing `WIP`, `tmp`, `debug`, `revert`, or non-conventional formats that suggest unfinished or experimental work.
    4. If commits are all acceptable:
       - Confirm services/console remote repo URL: `git -C services/console remote -v | head -1`. Expected: `git@github.com:suculent/thinx-vue-console.git` or similar — note the exact `<org>/<repo>` slug.
       - Determine services/console's default branch: `gh repo view <slug> --json defaultBranchRef --jq .defaultBranchRef.name`. Confirm it's `main`.
       - Open PR: `gh pr create --repo <slug> --base main --head thinx-staging --title "chore: merge accumulated thinx-staging work to main" --body "..."` with body from `<interfaces>` block above.
       - Capture PR URL.
    5. If any commit looks unacceptable: HALT this task. Surface for operator review via a manual decision. Do NOT auto-open the PR. Document in 04-SUMMARY.md.

    Do NOT merge. Do NOT touch THIS phase's SEC-DEP-01 work in the services/console PR — that PR is purely coordination for the console submodule's accumulated phase-11 work.
  </action>
  <verify>
    <automated>DIFF=$(git -C services/console log main..thinx-staging --oneline 2&gt;/dev/null) ; if [ -z "$DIFF" ]; then echo "services/console: no diff; PR not applicable"; true; else CONSOLE_REPO=$(git -C services/console remote get-url origin 2&gt;/dev/null | sed -E 's#.*github.com[:/]([^/]+/[^/.]+)(\.git)?#\1#') ; PR_URL=$(gh pr list --repo "$CONSOLE_REPO" --base main --head thinx-staging --state open --json url --jq '.[0].url' 2&gt;/dev/null) ; if [ -n "$PR_URL" ]; then gh pr view "$PR_URL" --repo "$CONSOLE_REPO" --json state --jq 'select(.state == "OPEN")'; else echo "PR not opened — operator decided to halt per Task 3 gating rules"; true; fi; fi</automated>
  </verify>
  <acceptance_criteria>
    - EITHER: services/console has no diff between main and thinx-staging — task gracefully skipped; documented in 04-SUMMARY.md.
    - OR: services/console has diff AND all commits are user-blessed AND a PR was opened with state=OPEN; PR URL captured.
    - OR: services/console has diff but commits looked questionable AND task halted for operator decision; documented in 04-SUMMARY.md.
    - Under no condition does this task open an empty PR or a PR containing WIP/experimental commits.
    - Under no condition does this task include SEC-DEP-01 dependency fixes in the services/console PR — that's parent-project scope.
  </acceptance_criteria>
  <done>
    services/console PR decision made: either opened (and URL captured), gracefully skipped (no diff), or halted (commits unclear). The 04-SUMMARY.md will document the outcome.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4 (checkpoint): Operator approves + merges parent PRs (and optional services/console PR) via GitHub UI</name>
  <files>(none — operator-only UI merge; no local file changes in this task)</files>
  <read_first>
    - Task 1's captured PR URL (master PR on parent)
    - Task 2's captured PR URL (main PR on parent — if applicable)
    - Task 3's captured PR URL (services/console PR — if applicable)
  </read_first>
  <what-built>
    Tasks 1-3 opened up to 3 PRs:
    - PR A: thinx-staging -> master on suculent/thinx-device-api (mandatory)
    - PR B: thinx-staging -> main on suculent/thinx-device-api (mandatory unless main absent)
    - PR C: thinx-staging -> main on services/console (conditional)

    These PRs are sitting OPEN in GitHub. They need operator approval + UI merge to land on the default branches that cloud scanners actually evaluate. The plan does NOT auto-merge — branch-protection rules typically block this, and the operator's UI review is the intended quality gate per user mandate 2026-05-26.
  </what-built>
  <action>
    Operator-driven PR-approval + merge in the GitHub UI for each PR opened in Tasks 1-3. See `<how-to-verify>` for the step-by-step procedure. Resume-signal options enumerated in `<resume-signal>`. This task is a checkpoint — Claude does NOT execute it; the operator approves + merges via the GitHub UI and types one of the resume-signal patterns back.
  </action>
  <how-to-verify>
    For each PR opened in Tasks 1-3:

    1. Open the PR URL in a browser.
    2. Review the PR body — confirm the override-edit summary + verification checklist + "what's NOT in this PR" sections are present and read correctly.
    3. Inspect the file diff — for parent PRs, expect: `package.json` + `package-lock.json` + `.planning/dep-triage.md` + the 6 audit/dependabot JSONs + STATE.md + ROADMAP.md + REQUIREMENTS.md + 04-RESEARCH.md + 4 PLAN.md files + 04-SUMMARY.md (basically everything in `.planning/phases/04-dependency-triage/` plus the project-level docs updates).
    4. Check that CI on the PR is green (`gh pr checks <PR-URL>` — or via the UI's "Checks" tab). If CI red, halt the merge and diagnose.
    5. Approve the PR via the UI's "Files changed" -> "Review changes" -> "Approve" flow (if branch protection requires review).
    6. Merge the PR via "Merge pull request" -> select "Create a merge commit" (preserves the thinx-staging commit history) -> "Confirm merge".
    7. After merge, capture the merge commit SHA from the post-merge UI.

    Repeat for each PR.

    After all PRs merged:

    8. Confirm via `gh pr view <PR-URL> --json state,mergedAt,mergeCommit` that each PR shows `state=MERGED` with a `mergedAt` timestamp and a `mergeCommit.oid`.
    9. Optionally trigger a Dependabot rescan: GitHub auto-rescans on merge to default branch; allow up to 24h for the Security tab to refresh. Operator may also click "Refresh" on the Security tab to force a re-eval if available.
    10. Spot-check Security tab — after the rescan, the high-severity open count should drop to the documented deferred-by-design baseline (ideally 0).

    Report back via resume-signal.
  </how-to-verify>
  <verify>
    <human-check>Operator confirms via resume-signal one of five documented patterns. `gh pr view <URL> --json state` should return "MERGED" for each PR before Task 5 proceeds.</human-check>
  </verify>
  <acceptance_criteria>
    - For each PR opened in Tasks 1-3: `gh pr view <URL> --json state --jq .state` returns "MERGED".
    - Each merged PR has a captured mergeCommit.oid (operator records this in the resume-signal note for Task 5's bookkeeping).
    - No PR was force-merged or merged with red CI — operator confirmed CI green before clicking merge.
    - Operator's resume-signal matches one of the five documented patterns.
  </acceptance_criteria>
  <done>
    Operator has confirmed each opened PR is in MERGED state on GitHub. Slice 4 ready to proceed to Task 5 (flip Verified status + bookkeeping).
  </done>
  <resume-signal>
    Type one of:
    - "merged-all" — All opened PRs are merged. Master and main both have the override fixes. Phase 4 ready for Verified status flip in Task 5.
    - "merged-parent-only" — Both parent PRs merged; services/console PR was not opened or not merged. Phase 4 parent-side ready for Verified; document services/console state in 04-SUMMARY.md.
    - "merged-master-only — main PR not openable due to branch absence" — Only master PR merged because parent repo has no main branch. Phase 4 ready for Verified (master is the default branch; the user-mandated "both" was best-effort and gracefully degraded).
    - "halt — CI red on PR <URL>" — A PR has failing CI. Diagnose before merge; if a transitive regression surfaced post-merge to default branch (e.g., a CI step that doesn't run on thinx-staging), surface as gap-closure phase.
    - "halt — operator declines to merge <PR-URL>: <reason>" — Operator has a substantive concern. Halt the slice; do NOT flip to Verified.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 5: Flip Phase 4 + SEC-DEP-01 to Verified across STATE.md, REQUIREMENTS.md, ROADMAP.md, 04-SUMMARY.md; commit + push</name>
  <files>.planning/STATE.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/phases/04-dependency-triage/04-SUMMARY.md</files>
  <read_first>
    - .planning/STATE.md (current state — Slice 3 marked Phase 4 as "code-shipped — pending Slice 4 merge-up"; this task flips to Verified)
    - .planning/REQUIREMENTS.md (current state — SEC-DEP-01 is "Pending"; flip to Verified)
    - .planning/ROADMAP.md (current state — Phase 4 row has 3/4 plans complete; flip to 4/4 + Verified)
    - .planning/phases/04-dependency-triage/04-SUMMARY.md (current state — status: code-shipped; flip to complete + verified: true)
    - The PR URLs and merge commit SHAs captured in Tasks 1-4 (from operator's resume-signal)
  </read_first>
  <action>
    Apply the Verified-state edits documented in this plan's `<interfaces>` block. Concrete edits:

    STATE.md:
    1. "## Current Position": Active phase -> "(v1 GA backend closures complete)"; Active plan -> "(none — v1 GA shipped)"; Phase status -> "verified"; Progress -> 100% (4/4 phases); v1 requirement coverage line -> "4 of 4 mapped ✓ | Verified: 4".
    2. "## Phase Progress" table: Phase 4 row status -> "Verified (<merge-date>)".
    3. "## Performance Metrics": increment "Phases completed: 4"; record Phase 4's commit count + duration + slice count; add line about the merge-up PRs landing.
    4. "## Accumulated Context" -> "### Decisions": append dated bullets:
       - "<date> — Phase 4 Slice 4 merge-up complete. PR <master-URL> merged at <ts>; PR <main-URL> merged at <ts>. SEC-DEP-01 closed on default branches. Cloud scanners (GitHub Security tab, Snyk Cloud) will reflect the fix on next rescan (allow 24h)."
       - If services/console PR opened + merged: also add a bullet documenting that.
    5. "## Accumulated Context" -> "### Todos": replace with `- v1 GA backend closures complete (4/4 v1 requirements Verified). Next: v1.0 release tag coordination across parent + console.`
    6. "## Session Continuity": "Stopped at" -> brief Phase 4 closure summary; "Next action" -> "v1.0 GA release tag (cross-project coordination via .planning/PROJECT.md and services/console/.planning/)"; "Resume hint" -> v1 GA closeout context.

    REQUIREMENTS.md:
    7. Find the SEC-DEP-01 bullet in "## v1 Requirements" -> "### Security & Compliance". Currently reads `- [ ] **SEC-DEP-01**: All 11 high-severity...`. Replace with the Verified-format pattern used by AUTH-API-01, SEC-PII-01, OPS-01 (which all start with `- [x] **<ID>** ✓ Verified <date> (Phase N — see ...): ...`). Embed:
       - Validated by (a) `.planning/dep-triage.md` table of all 29 findings with verdicts ✓
       - Validated by (b) blocker count on Security tab dropped to documented deferred-with-rationale baseline ✓ — 7 GHSAs closed via 4 override edits (commit <slice-2-sha>); 19 deferred-stale alerts dismissed via manual UI walk; 3 deferred-dev-only excluded from production image per Dockerfile L86.
       - Validated by (c) `chai-http` v4 lock + AGENTS.md other locks respected — no override touched chai-http, superagent, chai, or any locked package.
       - Validated by (d) `npm audit` post-fix output captured: runtime-tree high count 9 -> 0; full-tree counts in 04-AUDIT-POST.json.
       - Fixes: override edits in <slice-2-sha>. Documentation in <slice-1-sha>, <slice-2-task-6-sha>, <slice-3-sha>. Merge-up PRs <master-PR-URL> + <main-PR-URL> merged at <ts>.
    8. "## Traceability" table at file bottom: SEC-DEP-01 row status -> "Verified (<date>)".
    9. "Coverage" summary: bump Verified count from 3 to 4; bump Pending count from 1 to 0.
    10. Add a "Last updated" footer line documenting the SEC-DEP-01 closure.

    ROADMAP.md:
    11. "## Phases" list: Phase 4 row -> `- [x] **Phase 4: Dependency Triage** — ✓ Verified <date> (parent PRs <master-PR-URL> + <main-PR-URL> merged; 7 GHSAs closed via 4 override edits; runtime high count 9 -> 0; SEC-DEP-01 closed)`.
    12. "### Phase 4: Dependency Triage" Plans list: flip 04-04 from `[ ]` to `[x]` with merge details.
    13. "## Progress" table at file bottom: Phase 4 row -> `4/4 | Verified | <date>`.
    14. Phase Summary table at bottom: Phase 4 row status -> Verified.
    15. Add "Last updated" footer line documenting the Phase 4 closure + 4/4 v1 requirements coverage.

    04-SUMMARY.md:
    16. Frontmatter: `status: complete`, `verified: true`, `verified-date: <merge-date>`.
    17. "## Verification" section: append PR URLs + merge timestamps + merge commit SHAs.
    18. "## What changed" section: append the Slice 4 outcome (PRs opened + merged) under a new "### Slice 4 — Merge-up" subsection.
    19. "## Cross-project notes": update with services/console PR outcome (merged / skipped / halted per operator resume-signal); update submodule Dependabot status (other submodules confirmed disabled, no action).
    20. "## Next steps" section: replace with `- v1.0 GA release tag coordination (parent + console land together)`; `- SEC-DEP-02 (services/console triage) scheduled in v1.x backlog; coordinate via services/console/.planning/`; `- REFACTOR-05 (jshint + fs-finder misclassification) scheduled in v1.x backlog`.

    Commit on thinx-staging:
    21. `git add .planning/STATE.md .planning/REQUIREMENTS.md .planning/ROADMAP.md .planning/phases/04-dependency-triage/04-SUMMARY.md`
    22. `git status` — verify only these 4 files staged.
    23. Commit subject: `docs(phase-04): SEC-DEP-01 Verified — Slice 4 merge-up landed on master + main`
    24. Body (heredoc): brief — "Phase 4 closeout. PR <master-URL> merged at <ts>. PR <main-URL> merged at <ts>. 7 GHSAs closed; runtime high count 9 -> 0; v1 GA backend closures complete (4/4 v1 requirements Verified). Next: v1.0 release tag."
    25. `git push origin thinx-staging`.

    Note: this final commit on thinx-staging does NOT itself need to be merged up via another PR cycle — it's bookkeeping that documents the Verified state. The actual fix-bearing commit (Slice 2's) is already on master + main via the PRs.
  </action>
  <verify>
    <automated>grep -qE 'SEC-DEP-01.*Verified' .planning/REQUIREMENTS.md &amp;&amp; grep -qE 'Phase 4.*Verified' .planning/ROADMAP.md &amp;&amp; grep -qE 'Phase 4.*Verified' .planning/STATE.md &amp;&amp; grep -qE 'verified: true' .planning/phases/04-dependency-triage/04-SUMMARY.md &amp;&amp; grep -qE 'Verified: 4 \(AUTH-API-01, SEC-PII-01, OPS-01, SEC-DEP-01\)' .planning/STATE.md &amp;&amp; grep -qE '4 of 4.*Verified.*4' .planning/REQUIREMENTS.md &amp;&amp; git log -1 --pretty=%s | grep -qE '^docs\(phase-04\): SEC-DEP-01 Verified' &amp;&amp; ! git log -1 --stat | grep -qE '(package\.json|package-lock\.json|lib/|thinx-core\.js|services/console/)'</automated>
  </verify>
  <acceptance_criteria>
    - REQUIREMENTS.md: SEC-DEP-01 row has the `[x] **SEC-DEP-01** ✓ Verified <date>` pattern matching the other 3 Verified requirements; Traceability table reflects Verified.
    - Coverage summary in REQUIREMENTS.md: `Verified: 4`; `Pending: 0`.
    - ROADMAP.md: Phase 4 row in Phases list is `[x] ✓ Verified <date>`; Progress table shows `4/4 | Verified`.
    - STATE.md: Phase Progress table shows Phase 4 = Verified; Current Position reflects v1 GA closeout; Performance Metrics incremented; Decisions section has new dated bullet for Slice 4 outcome.
    - 04-SUMMARY.md: frontmatter `status: complete` + `verified: true`; body has Slice 4 outcome in "What changed" + PR URLs in "Verification".
    - Latest commit subject matches `^docs\(phase-04\): SEC-DEP-01 Verified`.
    - Commit touches only the 4 documentation files (STATE, REQUIREMENTS, ROADMAP, SUMMARY).
    - Commit pushed to thinx-staging.
  </acceptance_criteria>
  <done>
    Phase 4 / SEC-DEP-01 fully Verified across all bookkeeping artifacts. v1 GA backend closures (4/4 v1 requirements) complete. Project state reflects readiness for v1.0 release tag.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

This slice operates entirely through the GitHub API (`gh pr create`, `gh pr view`) and the GitHub UI (operator approval + merge). No local code modifications; the fix code itself has already landed on thinx-staging in Slice 2.

The novel threat surface is "fix arrives on default branch but introduces a regression that escapes thinx-staging-only CI" — i.e., a difference between what CI runs on thinx-staging vs. what runs on master/main post-merge.

| Boundary | Description |
|----------|-------------|
| thinx-staging branch ↔ master branch (parent) | PR merge crosses this boundary; CI on the merge commit re-runs but on the master target. If CI has different gates on master (e.g., production-deploy steps), they exercise here for the first time. |
| thinx-staging branch ↔ main branch (parent) | Same as above. |
| services/console submodule ↔ console default branch | If Task 3 opens a PR, same threat applies in the console's own CI surface. |
| Operator's GitHub UI session ↔ default branch protected status | Operator's PR-merge action commits to a protected branch. Trust = the operator's GitHub credentials. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04.4-01 | Tampering | Fix arrives on master/main but breaks a default-branch-only CI step that wasn't exercised on thinx-staging | mitigate | Task 4's `how-to-verify` step 4 requires CI green on the PR's merge commit before operator confirms merge. If CI red post-merge to default branch (race condition where CI runs after merge), the smoke checklist in PR body provides the manual diagnostic path. Rollback: `git revert <merge-commit-sha>` on the default branch + new PR to fix. |
| T-04.4-02 | Tampering | services/console PR includes unblessed commits | mitigate | Task 3's gating decision tree explicitly inspects commit subjects and HALTS if any subject is WIP/tmp/debug/unconventional. Operator review during Task 4 is the second gate. |
| T-04.4-03 | Information Disclosure | PR body references private artifact paths | accept | All paths referenced (`.planning/dep-triage.md`, the JSONs) are in the public repo (or will be after the PR merges). No private credentials, secrets, or internal-only URLs in the PR body. |
| T-04.4-04 | Repudiation | Phase 4 marked Verified but PRs didn't actually merge | mitigate | Task 5's `read_first` requires the PR URLs + merge commit SHAs from Task 4's resume-signal. Acceptance criteria gate the file edits on the SEC-DEP-01 Verified pattern matching the format used by previously Verified requirements. Operator's resume-signal IS the audit trail. |
| T-04.4-05 | Denial of Service | A new high-severity Dependabot alert lands during Slice 4 execution and contaminates the post-merge measurement | accept | Outside Phase 4 scope (per Slice 3 Task 2 and Task 4 step 3d patterns — new alerts post-2026-05-26 are filed as future work, not Phase-4-blocking). The PR's `What's NOT in this PR` section explicitly states "this PR addresses the 29 alerts open as of 2026-05-26". |
| T-04.4-06 | Elevation of Privilege | Operator's UI session compromised; malicious merge | accept | Pre-existing GitHub auth model; no new credentials introduced by this slice. Branch-protection rules (the reason this slice can't auto-merge) are the operator's own defense. |
| T-04.4-07 | Tampering | services/console PR accidentally includes SEC-DEP-01 fix content (parent project bleed-over) | mitigate | Task 3's `<action>` explicitly forbids touching SEC-DEP-01 work in the console PR. The console PR is purely the submodule's accumulated phase-11 work; its `--head thinx-staging` is the SUBMODULE's thinx-staging, not the parent's. Verify in PR diff before merge in Task 4. |
| T-04.4-SC | Tampering | npm install / package legitimacy | accept | Slice 4 invokes ZERO package installs. No new dependencies. The fix code is already on thinx-staging from Slice 2 (which had its own Package Legitimacy review). Package Legitimacy Gate does not trigger. |

**HIGH-severity gate:** T-04.4-01 (CI gates differ between branches) is the only LOW-MEDIUM-rated threat in this set. Mitigation is the PR's own CI re-run + operator review (Task 4 step 4) + the smoke checklist baked into the PR body (Task 1 PR body template). Acceptable disposition per default config. No HIGH-severity threats block this slice.

**Slopcheck note:** Slice 4 ships zero packages. No `npm install`. No `[ASSUMED]`/`[SUS]`/`[SLOP]` gate applies.
</threat_model>

<verification>
- Task 1: parent PR `thinx-staging -> master` is OPEN, title matches expected pattern, body contains override summary + dep-triage link + verification checklist.
- Task 2: parent PR `thinx-staging -> main` is OPEN (or main absent — gracefully skipped + documented).
- Task 3: services/console PR opened IFF non-empty diff + user-blessed commits, OR gracefully skipped IFF empty diff, OR halted IFF questionable commits.
- Task 4: operator confirms via resume-signal that all opened PRs are MERGED on the GitHub UI.
- Task 5: STATE.md + REQUIREMENTS.md + ROADMAP.md + 04-SUMMARY.md all reflect SEC-DEP-01 Verified; coverage table shows 4 Verified / 0 Pending; commit pushed to thinx-staging.
- Phase invariant: thinx-staging branch remained the working branch throughout all tasks; no branch switching occurred locally.
- Phase invariant: no source code (package.json, package-lock.json, lib/, thinx-core.js, spec/) modified in this slice.
</verification>

<success_criteria>
- **ROADMAP Success Criterion 2 (full — default-branch confirmation):** Blocker count on GitHub Security tab default-branch surface drops to the documented "deferred-with-rationale" baseline. Slice 2 confirmed this on thinx-staging; Slice 4 confirms it on master + main via the merged PRs. ✓ Task 4 + Dependabot rescan within 24h.
- **User mandate 2026-05-26:** Both master and main get the fix (cloud scanners target either). ✓ Tasks 1 + 2.
- **User mandate 2026-05-26:** services/console gets its accumulated phase-11 work merged-up IFF the diff warrants it. ✓ Task 3.
- **v1 GA backend closures complete:** AUTH-API-01 + SEC-PII-01 + OPS-01 + SEC-DEP-01 all Verified. 4/4 v1 requirements closed. ✓ Task 5.
- **Slice 4 ↔ v1.0 release handoff:** STATE.md + ROADMAP.md "Next steps" point at v1.0 GA release tag coordination — backend is ready; console submodule's v1.0 frontend is already shipped per init context. ✓ Task 5.
</success_criteria>

<output>
Slice 4's outputs are: (a) the up-to-3 GitHub PRs (already created by Tasks 1-3), (b) the operator-merged state on default branches (confirmed by Task 4), and (c) the Verified-state bookkeeping in STATE/REQUIREMENTS/ROADMAP/SUMMARY (Task 5). The phase-level 04-SUMMARY.md (from Slice 3 Task 7) is the canonical phase document; Slice 4's Task 5 edits update it in place. No separate `04-04-SUMMARY.md` is produced — the phase summary is consolidated in 04-SUMMARY.md.

When this slice closes, Phase 4 is fully closed: SEC-DEP-01 ✓ Verified, v1 GA backend closures 4/4 ✓, project state ready for v1.0 GA release tag coordination.
</output>
</content>
</invoke>