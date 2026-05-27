---
phase: 04-dependency-triage
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/04-dependency-triage/04-AUDIT-PRE.json
  - .planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json
  - .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json
  - .planning/dep-triage.md
autonomous: true
requirements: [SEC-DEP-01]

must_haves:
  truths:
    - "Every one of the 29 open Dependabot alerts has a documented verdict (blocker / deferred-stale / deferred-dev-only / deferred-locked / deferred-cost / deferred-low-sev)."
    - "Pre-fix npm audit baseline (full tree + runtime tree) is captured as a JSON artifact in the phase directory."
    - "Pre-fix Dependabot snapshot from gh api is captured as a JSON artifact in the phase directory."
    - "Every deferred row in the triage table cites exactly one rationale class from the closed taxonomy: dev-only-scope | stale-alert | chai-http-lock | transitive-uncontrollable | low-severity-high-cost | mitigated-by-config."
    - "No source code, package.json, or package-lock.json is modified in this slice."
  artifacts:
    - path: ".planning/dep-triage.md"
      provides: "Section 1 (Triage table — one row per Dependabot alert) populated; Sections 2 (Fix log) and 3 (Post-fix baseline) stubbed as empty tables ready for Slice 3 to append."
      contains: "| Alert URL | Package | GHSA ID | Severity | Scope | Direct/Transitive | Vuln range / installed | Verdict | Rationale | Future trigger |"
    - path: ".planning/phases/04-dependency-triage/04-AUDIT-PRE.json"
      provides: "Full-tree npm audit baseline snapshot (npm audit --json) at this commit"
    - path: ".planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json"
      provides: "Runtime-tree npm audit baseline snapshot (npm audit --omit=dev --json) — the primary measurement surface"
    - path: ".planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json"
      provides: "Live Dependabot enumeration via gh api at slice-open time"
  key_links:
    - from: ".planning/dep-triage.md"
      to: "research verdicts in 04-RESEARCH.md Section 'Decision rule preclassification' (L173-L196)"
      via: "Verdict column values must match the preclassified verdict for each of the 8 affected packages"
      pattern: "blocker|deferred-stale|deferred-dev-only|deferred-locked|deferred-cost|deferred-low-sev"
    - from: ".planning/dep-triage.md triage table row count"
      to: ".planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json"
      via: "Each Dependabot alert object in the JSON array maps to exactly one table row; counts must match (29 expected)"
      pattern: "29 rows in section 1; 1 row per alert"

must_not:
  - "Do NOT run `npm audit fix --force` (rewrites majors; violates chai-http v4 lock)."
  - "Do NOT run `npm install` or modify package.json / package-lock.json in this slice — lockfile regeneration belongs to Slice 2."
  - "Do NOT prune any of the 38 entries in package.json overrides block — only Slice 2 touches the 4 directly-relevant lines."
  - "Do NOT touch services/console/ — sibling GSD project, not part of this triage."
  - "Do NOT add freeform rationale strings; every deferred row must cite exactly one class from the closed taxonomy in 04-RESEARCH.md Section 'Rationale taxonomy' (L306-L319)."
  - "Do NOT manually dismiss any Dependabot alert via UI in this slice — Slice 3 owns the dismissal walk."
---

<objective>
Establish the pre-fix state of Phase 4: enumerate every open Dependabot alert against `suculent/thinx-device-api`, capture three baseline JSON artifacts (full-tree + runtime-tree npm audit + Dependabot snapshot), and populate Section 1 of `.planning/dep-triage.md` with one classified row per alert.

Purpose: Slice 2 needs ground-truth verdicts to know which override edits are blocker fixes (must ship) and which alerts are deferred (must NOT motivate code changes). Slice 3 needs the pre-fix baseline JSONs to compute the post-fix delta.

Output: A populated triage table (Section 1 of `.planning/dep-triage.md`) + three baseline JSON artifacts in `.planning/phases/04-dependency-triage/`. Zero code or dependency changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/04-dependency-triage/04-RESEARCH.md
@.planning/codebase/CONCERNS.md
@.planning/codebase/STACK.md
@AGENTS.md
@package.json

<interfaces>
<!-- Live data sources the executor will query. No code interfaces to extract — this slice is a data-capture + classification task. -->

Dependabot REST API endpoint:
  GET https://api.github.com/repos/suculent/thinx-device-api/dependabot/alerts?state=open&per_page=100
  Via: `gh api 'repos/suculent/thinx-device-api/dependabot/alerts?state=open&per_page=100'`
  Returns: JSON array; each element has fields:
    - .number, .html_url, .state
    - .dependency.package.name, .dependency.scope (runtime|development), .dependency.manifest_path
    - .security_advisory.ghsa_id, .security_advisory.severity (high|medium|low), .security_advisory.summary
    - .security_vulnerability.vulnerable_version_range, .security_vulnerability.first_patched_version.identifier

npm audit JSON shape (relevant fields):
  .metadata.vulnerabilities = { info, low, moderate, high, critical, total }
  .vulnerabilities = { <package>: { severity, via: [...], range, fixAvailable } }

Rationale taxonomy (CLOSED SET — defined in 04-RESEARCH.md L306-L319):
  - dev-only-scope:        Package is devDeps AND Dockerfile L86 (`npm install --omit=dev`) excludes it from production image.
  - stale-alert:           Live package-lock.json resolves past the vulnerable_version_range; alert will auto-dismiss on next Dependabot scan.
  - chai-http-lock:        Fix would require bumping chai-http to v5; blocked per AGENTS.md L82-92. (No 2026-05-26 alert triggers this — reserved for future.)
  - transitive-uncontrollable: Vulnerable transitive cannot be overridden without breaking the parent. (None in current set.)
  - low-severity-high-cost: Low/medium severity + HIGH fix cost. (None in current set.)
  - mitigated-by-config:   Vulnerable surface is gated by config not enabled in production. (None in current set.)

Verdict enum (CLOSED SET):
  - blocker
  - deferred-stale
  - deferred-dev-only
  - deferred-locked
  - deferred-cost
  - deferred-low-sev

Preclassified verdicts from research (04-RESEARCH.md L173-L196):
  - axios (15 alerts):          deferred-stale (live=1.16.1 > all patched-version ranges)
  - fast-uri (2 alerts):        deferred-stale (live=3.1.2 >= patched)
  - follow-redirects (1 alert): blocker (active CVE in production code path; fix = REMOVE override line)
  - ip-address (1 alert):       deferred-stale (live=10.2.0 >= patched 10.1.1)
  - lodash (2 alerts):          blocker (active in production via rollbar+winston; fix = bump override to 4.18.1)
  - minimatch (3 alerts):       blocker (active via jshint; fix = bump override to 5.1.9)
  - serialize-javascript (2):   deferred-dev-only (via mocha; Dockerfile L86 strips devDeps)
  - uuid (2 alerts):            1 deferred-stale (runtime: live=14.0.0) + 1 deferred-dev-only (dev: 8.3.2 via nyc)
  - ws (1 alert):               blocker (active via socket.io builder ⇄ worker chain; fix = ADD override `ws: 8.20.1`)

Total: 29 alerts → 7 blocker + 19 deferred-stale + 3 deferred-dev-only.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Capture pre-fix baseline JSON artifacts (npm audit full, npm audit runtime, gh dependabot snapshot)</name>
  <files>.planning/phases/04-dependency-triage/04-AUDIT-PRE.json, .planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json, .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json</files>
  <read_first>
    - .planning/phases/04-dependency-triage/04-RESEARCH.md (Section "Verification baseline specification" L328-L364; Section "Source reconciliation — Dependabot vs Snyk vs npm audit" L11-L67 for expected counts)
    - package.json (L97-L136 overrides block — these are the pre-fix pins the baselines snapshot)
    - Dockerfile L86 (npm install --omit=dev — explains why we need both full and runtime trees)
  </read_first>
  <action>
    Run three commands from the repo root and redirect each to its own JSON artifact under `.planning/phases/04-dependency-triage/`:

    1. `npm audit --json > .planning/phases/04-dependency-triage/04-AUDIT-PRE.json` (full-tree baseline; expected `.metadata.vulnerabilities.high` ≈ 23, `.metadata.vulnerabilities.moderate` ≈ 11 per 04-RESEARCH.md L22)
    2. `npm audit --omit=dev --json > .planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json` (runtime-tree baseline; expected `.metadata.vulnerabilities.high` ≈ 9, `.metadata.vulnerabilities.moderate` ≈ 6 per 04-RESEARCH.md L23 — this is the primary measurement surface)
    3. `gh api 'repos/suculent/thinx-device-api/dependabot/alerts?state=open&per_page=100' > .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (live alert enumeration; expected 29 elements per 04-RESEARCH.md L19)

    Both `npm audit` commands exit non-zero when vulnerabilities are present — this is expected and not a failure. Use `npm audit --json > FILE; true` if needed to suppress non-zero exit from chaining.

    Do NOT run `npm install` before these commands. The point is to capture the CURRENT lockfile's audit state, pre-fix. If `node_modules/` is missing or stale, the audit will still succeed against `package-lock.json`.

    Do NOT redact or transform the JSON output. Raw output goes to disk verbatim so Slice 3 can diff against a structurally-identical post-fix artifact.
  </action>
  <verify>
    <automated>test -s .planning/phases/04-dependency-triage/04-AUDIT-PRE.json &amp;&amp; test -s .planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json &amp;&amp; test -s .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json &amp;&amp; jq -e '.metadata.vulnerabilities' .planning/phases/04-dependency-triage/04-AUDIT-PRE.json &amp;&amp; jq -e '.metadata.vulnerabilities' .planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json &amp;&amp; jq -e 'type == "array" and length &gt; 0' .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/04-dependency-triage/04-AUDIT-PRE.json` exists, non-empty, parses as JSON, has `.metadata.vulnerabilities` object with keys `high`, `moderate`, `low`, `total`.
    - File `.planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json` exists, non-empty, parses as JSON, has `.metadata.vulnerabilities` object. Its `high` count is strictly less than or equal to the full-tree file's `high` count (runtime tree is a subset).
    - File `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` exists, non-empty, parses as JSON array of length >= 25 (research observed 29; allow ±4 churn since research date).
    - `jq '. | length' 04-DEPENDABOT-PRE.json` returns the alert count that will become the row count in `dep-triage.md` Section 1.
    - Zero changes to `package.json`, `package-lock.json`, or any source file (verify with `git status` — only the three new files under `.planning/phases/04-dependency-triage/` should appear as untracked).
  </acceptance_criteria>
  <done>
    Three pre-fix baseline JSON artifacts exist on disk. Each is parseable JSON with the expected schema. `git status` shows only the three new files as untracked; no tracked source/config files are modified. The Dependabot JSON's array length is captured (mentally or noted) — Task 3's row count must match it.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create `.planning/dep-triage.md` skeleton with section structure and rationale-taxonomy reference</name>
  <files>.planning/dep-triage.md</files>
  <read_first>
    - .planning/phases/04-dependency-triage/04-RESEARCH.md (Section "dep-triage.md proposed schema" L261-L327 — defines the three-section structure, column lists, and rationale taxonomy)
    - .planning/ROADMAP.md L77-L80 (Phase 4 Success Criteria — criterion 1 says `.planning/dep-triage.md` must exist with columns "package, severity, direct/transitive, verdict, rationale, future trigger")
  </read_first>
  <action>
    Create `.planning/dep-triage.md` at the repo root's `.planning/` directory (NOT inside the phase directory — per ROADMAP.md L77 the deliverable lives at `.planning/dep-triage.md`).

    Structure required (mirror 04-RESEARCH.md L261-L327 verbatim):

    Header block:
      - Title: "# Dependency Triage — Phase 4 (SEC-DEP-01)"
      - "Baseline captured: 2026-05-26 (commit SHA inserted at slice close)"
      - "Scope: All open Dependabot alerts against `suculent/thinx-device-api` as of slice-open time."

    Section 1: "## Triage table"
      - Markdown table with header row matching 04-RESEARCH.md L267-L278 column list exactly:
        `| Alert URL | Package | GHSA ID | Severity | Scope | Direct/Transitive | Vuln range / installed | Verdict | Rationale | Future trigger |`
      - Body rows: LEAVE EMPTY in this task. Task 3 populates rows from the JSON artifact.

    Section 2: "## Fix log"
      - Markdown table with header row matching 04-RESEARCH.md L284-L290 column list:
        `| Commit SHA | Files changed | Override delta | Alerts closed (GHSA IDs) | Verification |`
      - Body rows: EMPTY (stubbed for Slice 2 to append).

    Section 3: "## Post-fix baseline"
      - Subsection "### Captured at": placeholder string "_(filled in by Slice 3)_"
      - Subsection "### Metric snapshot": empty 2-column table `| Metric | Value |` with header row only (stubbed for Slice 3).
      - Subsection "### Deferred alerts (open by design)": placeholder "_(filled in by Slice 3 — list of GHSA IDs that remain open with rationale class)_"
      - Subsection "### Artifact references": bulleted list pointing to the four JSON files:
        - `.planning/phases/04-dependency-triage/04-AUDIT-PRE.json` (pre-fix full tree)
        - `.planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json` (pre-fix runtime tree)
        - `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (pre-fix Dependabot enumeration)
        - `.planning/phases/04-dependency-triage/04-AUDIT-POST.json` (placeholder — filled by Slice 3)
        - `.planning/phases/04-dependency-triage/04-AUDIT-POST-PROD.json` (placeholder)
        - `.planning/phases/04-dependency-triage/04-DEPENDABOT-POST.json` (placeholder)

    Section 4: "## Rationale taxonomy (closed set)"
      - Markdown definition list copying the six classes from 04-RESEARCH.md L306-L319:
        `dev-only-scope`, `stale-alert`, `chai-http-lock`, `transitive-uncontrollable`, `low-severity-high-cost`, `mitigated-by-config`
      - One sentence per class explaining when it applies. Use the definitions in research verbatim.

    Footer: "## Verdict enum (closed set)"
      - List: `blocker`, `deferred-stale`, `deferred-dev-only`, `deferred-locked`, `deferred-cost`, `deferred-low-sev`
      - Note: "Every row in Section 1 MUST have its Verdict column drawn from this set, and every `deferred-*` row MUST cite exactly one class from Section 4 in its Rationale column."
  </action>
  <verify>
    <automated>test -s .planning/dep-triage.md &amp;&amp; grep -q '^## Triage table' .planning/dep-triage.md &amp;&amp; grep -q '^## Fix log' .planning/dep-triage.md &amp;&amp; grep -q '^## Post-fix baseline' .planning/dep-triage.md &amp;&amp; grep -q '^## Rationale taxonomy' .planning/dep-triage.md &amp;&amp; grep -q 'Alert URL.*Package.*GHSA ID.*Severity.*Scope.*Direct/Transitive.*Vuln range / installed.*Verdict.*Rationale.*Future trigger' .planning/dep-triage.md &amp;&amp; grep -cE '^- (dev-only-scope|stale-alert|chai-http-lock|transitive-uncontrollable|low-severity-high-cost|mitigated-by-config)|^`(dev-only-scope|stale-alert|chai-http-lock|transitive-uncontrollable|low-severity-high-cost|mitigated-by-config)`' .planning/dep-triage.md | grep -q '^6$'</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/dep-triage.md` exists at the `.planning/` root (NOT under the phase directory).
    - All four sections present as level-2 headings in order: `## Triage table`, `## Fix log`, `## Post-fix baseline`, `## Rationale taxonomy (closed set)`, plus `## Verdict enum (closed set)`.
    - Section 1 table header row matches the 10-column list exactly: `Alert URL | Package | GHSA ID | Severity | Scope | Direct/Transitive | Vuln range / installed | Verdict | Rationale | Future trigger`.
    - Section 2 table header row matches the 5-column fix-log list.
    - Section 4 lists all six rationale classes verbatim.
    - Footer lists all six verdict-enum values verbatim.
    - Sections 1 and 2 contain empty data bodies (header rows only, no data rows yet — Task 3 populates Section 1).
    - File parses as valid GFM markdown (no syntax errors that would break a renderer — verify by visual scan or `grep -c '^|'` returning at least 4 separator lines, one per table header+separator pair).
  </acceptance_criteria>
  <done>
    `.planning/dep-triage.md` exists with all five sections present, header rows correct, Section 1 + 2 bodies empty (ready for Task 3 and Slice 2 respectively), Section 3 + 4 + footer populated. The file is the contract Slice 2 and Slice 3 will append to.
  </done>
</task>

<task type="auto">
  <name>Task 3: Populate Section 1 triage table — one row per Dependabot alert from `04-DEPENDABOT-PRE.json`</name>
  <files>.planning/dep-triage.md</files>
  <read_first>
    - .planning/dep-triage.md (current state — must preserve all sections from Task 2; only Section 1 body changes)
    - .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json (source of truth — every alert object becomes one row)
    - .planning/phases/04-dependency-triage/04-RESEARCH.md (Section "Decision rule preclassification" L173-L196 — verdict + rationale ground truth per package)
    - .planning/phases/04-dependency-triage/04-RESEARCH.md (Section "Per-package reconciliation" L29-L42 — vuln_range vs installed-version column data)
    - package-lock.json (only when a row needs `installed` value confirmation; use `jq` or `npm ls <pkg>` to read — do NOT modify)
  </read_first>
  <action>
    Read `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (array of N alert objects, N≈29). For each alert object, append one row to `.planning/dep-triage.md` Section 1's table body.

    For each alert, derive the 10 columns:

    | Column | Source |
    |--------|--------|
    | Alert URL | `.html_url` |
    | Package | `.dependency.package.name` |
    | GHSA ID | `.security_advisory.ghsa_id` |
    | Severity | `.security_advisory.severity` (high / medium / low — preserve casing as Dependabot reports it; lowercase preferred) |
    | Scope | `.dependency.scope` (runtime / development) |
    | Direct/Transitive | "direct" if the package name appears as a key in package.json `dependencies` or `devDependencies`; otherwise the immediate parent in the dep tree — derive from 04-RESEARCH.md L75-L99 "Transitive path enumeration" tables (e.g. lodash → "via jshint" or "via rollbar > async"; ws → "via socket.io > engine.io"; serialize-javascript → "via mocha"; uuid (dev) → "via nyc > istanbul-lib-processinfo") |
    | Vuln range / installed | `.security_vulnerability.vulnerable_version_range` + " / installed: " + the version present in `package-lock.json` for that package (use `npm ls <pkg> 2>/dev/null` to confirm or read package-lock.json directly via `jq`) |
    | Verdict | Apply the preclassification from 04-RESEARCH.md L173-L196: axios=deferred-stale, fast-uri=deferred-stale, follow-redirects=blocker, ip-address=deferred-stale, lodash=blocker, minimatch=blocker, serialize-javascript=deferred-dev-only, uuid (runtime alert)=deferred-stale, uuid (dev alert)=deferred-dev-only, ws=blocker |
    | Rationale | One class from the closed taxonomy (Section 4). For `blocker` rows, use a one-liner factual rationale (e.g. "Active CVE; fix = remove override line", "Active via jshint; fix = override 4.18.1", "Active via socket.io engine.io tilde-lock; fix = add override 8.20.1"). For `deferred-*` rows, the Rationale field MUST be exactly the taxonomy class (e.g. `stale-alert`, `dev-only-scope`). Slice 3 expects this format for the post-fix baseline aggregation. |
    | Future trigger | For deferred rows, fill from 04-RESEARCH.md L322-L326: stale-alert → "Auto-dismissal on Dependabot rescan after lockfile regeneration; manual UI dismissal if not auto-cleared within 7 days". dev-only-scope → "If mocha or nyc usage moves into a runtime code path". For blocker rows, write "—" (em dash; not applicable — blockers are fixed in Slice 2, not deferred). |

    Identification rule for the dev vs runtime uuid alerts: the alert object's `.security_vulnerability.vulnerable_version_range` distinguishes them — `<11.1.1` is the dev (8.3.2 via nyc/jest-junit) alert; `>=13.0.0, <13.0.1` is the runtime alert.

    Sort the rows for readability: primary by Verdict (blockers first), then by Severity (high → medium → low), then by Package alphabetically. This makes the table scannable for a reviewer and makes Slice 2's "what alerts does my commit close" lookup trivial.

    After populating, append a one-line counter under the table: `**Total rows:** N (M blocker / K deferred-stale / L deferred-dev-only)` where N, M, K, L are the actual counts. Expected per research: 29 (7 / 19 / 3) — if observed numbers diverge by more than ±3, flag in the close-out for Slice 3 to reconcile (a new alert may have landed since research date 2026-05-26).

    Do NOT include any deferred-locked / deferred-cost / deferred-low-sev / transitive-uncontrollable / mitigated-by-config rows — research confirmed none of the 2026-05-26 alerts trigger these classes. If the live Dependabot snapshot contains a NEW alert (added since research) that doesn't fit the 8 known packages, flag it inline with `**UNCLASSIFIED — new alert since research date**` in the Verdict column and continue. Slice 3 will reconcile.
  </action>
  <verify>
    <automated>EXPECTED=$(jq 'length' .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json); ACTUAL=$(awk '/^## Triage table/,/^## Fix log/' .planning/dep-triage.md | grep -cE '^\| https://github.com'); [ "$EXPECTED" = "$ACTUAL" ] &amp;&amp; grep -qE '\*\*Total rows:\*\* [0-9]+ \([0-9]+ blocker / [0-9]+ deferred-stale / [0-9]+ deferred-dev-only\)' .planning/dep-triage.md &amp;&amp; ! grep -qE '\| (blocker|deferred-stale|deferred-dev-only|deferred-locked|deferred-cost|deferred-low-sev|UNCLASSIFIED) \|' .planning/dep-triage.md | head -1 || true; awk '/^## Triage table/,/^## Fix log/' .planning/dep-triage.md | grep -cE '\| (blocker|deferred-stale|deferred-dev-only) \|' | xargs -I{} test {} -ge 25</automated>
  </verify>
  <acceptance_criteria>
    - Row count in Section 1 table equals the array length of `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (expected ≈29; ±4 churn allowed).
    - Every row's Verdict column is one of: `blocker`, `deferred-stale`, `deferred-dev-only`, OR `UNCLASSIFIED — new alert since research date` (the latter only if a genuinely new alert appeared since 2026-05-26).
    - Every row whose Verdict is `deferred-*` has a Rationale column value drawn from the closed taxonomy (Section 4); for the current alert set, every deferred row's Rationale will be either `stale-alert` or `dev-only-scope`.
    - Every row whose Verdict is `blocker` has Rationale that mentions the fix action ("remove override line", "override 4.18.1", "override 5.1.9", or "add override 8.20.1") and Future trigger = `—`.
    - Counter line `**Total rows:** N (M blocker / K deferred-stale / L deferred-dev-only)` is present and N = M + K + L = the table row count.
    - Expected verdict distribution per research: M=7 blocker rows (1 follow-redirects + 2 lodash + 3 minimatch + 1 ws), K=19 deferred-stale (15 axios + 2 fast-uri + 1 ip-address + 1 uuid-runtime), L=3 deferred-dev-only (2 serialize-javascript + 1 uuid-dev). If counts diverge, the divergence is documented inline.
    - All Sections 2, 3, 4 from Task 2 still present and unmodified (this task only appends to Section 1 body and the counter line).
    - `git diff .planning/dep-triage.md` shows additions to Section 1 only; no removals from Tasks 2's structure.
  </acceptance_criteria>
  <done>
    Section 1 of `.planning/dep-triage.md` has one row per live Dependabot alert with all 10 columns populated. The verdict distribution matches the research preclassification (7 blocker + 19 deferred-stale + 3 deferred-dev-only) or any divergence is flagged as `UNCLASSIFIED — new alert since research date`. The triage table is the ground truth Slice 2 will use to identify which 4 override edits to make and which GHSAs each commit closes.
  </done>
</task>

<task type="auto">
  <name>Task 4: Commit baseline artifacts and triage table to thinx-staging</name>
  <files>.planning/dep-triage.md, .planning/phases/04-dependency-triage/04-AUDIT-PRE.json, .planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json, .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json</files>
  <read_first>
    - .planning/dep-triage.md (the populated file from Task 3 — confirm it's the version being committed)
    - .git/HEAD (confirm on branch `thinx-staging` — do NOT branch-switch per init context)
  </read_first>
  <action>
    Stage the four new files and commit on the current branch (`thinx-staging`):
      1. `git add .planning/dep-triage.md .planning/phases/04-dependency-triage/04-AUDIT-PRE.json .planning/phases/04-dependency-triage/04-AUDIT-PRE-PROD.json .planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json`
      2. Verify with `git status` that ONLY these four files are staged. If `package.json`, `package-lock.json`, or anything under `services/` appears in the staged set, ABORT — Slice 1 has a strict no-source-changes contract. Unstage with `git reset HEAD <file>`, investigate, and re-stage only the four allowed paths.
      3. Commit with message:
         `docs(deps): SEC-DEP-01 - pre-fix baseline + triage table (Slice 1)`
         Body (passed via heredoc to preserve formatting):
           "Phase 4 Slice 1 — Dependency Triage baseline.

            Captures pre-fix state before Slice 2 ships override edits.

            Artifacts:
            - .planning/dep-triage.md (Sections 1+4 populated; 2+3 stubbed)
            - 04-AUDIT-PRE.json (full-tree npm audit baseline)
            - 04-AUDIT-PRE-PROD.json (runtime-tree npm audit baseline — primary metric)
            - 04-DEPENDABOT-PRE.json (live Dependabot enumeration via gh api)

            Row counts: <FILL FROM TASK 3 COUNTER LINE>.

            No source code changes. Slice 2 ships the 4 override edits."
      4. Do NOT push yet. Slice 2 will push together with the override-edit commit so CI runs against the full fix set.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -qE '^docs\(deps\): SEC-DEP-01.*Slice 1' &amp;&amp; git log -1 --stat | grep -qE '\.planning/dep-triage\.md' &amp;&amp; git log -1 --stat | grep -qE '04-AUDIT-PRE\.json' &amp;&amp; git log -1 --stat | grep -qE '04-AUDIT-PRE-PROD\.json' &amp;&amp; git log -1 --stat | grep -qE '04-DEPENDABOT-PRE\.json' &amp;&amp; ! git log -1 --stat | grep -qE '(package\.json|package-lock\.json|services/|lib/|thinx-core\.js|thinx\.js)'</automated>
  </verify>
  <acceptance_criteria>
    - Latest commit on `thinx-staging` has subject matching `^docs\(deps\): SEC-DEP-01.*Slice 1`.
    - Commit touches exactly the four files: `.planning/dep-triage.md`, `04-AUDIT-PRE.json`, `04-AUDIT-PRE-PROD.json`, `04-DEPENDABOT-PRE.json`.
    - Commit does NOT touch `package.json`, `package-lock.json`, `services/*`, `lib/*`, `thinx-core.js`, or `thinx.js` (verify via `git log -1 --stat`).
    - Working tree clean post-commit (`git status` shows "nothing to commit, working tree clean", modulo any pre-existing dirty state in `services/console` which is out-of-scope and tolerated per init context).
    - No push performed yet — `git status -sb` shows ahead of origin by 1 commit. Slice 2 will push together with the override-edit commit.
  </acceptance_criteria>
  <done>
    Pre-fix baseline + classified triage table committed locally on `thinx-staging`. No source code or dependency changes shipped. Slice 2 can now consume the triage table as ground truth for which 4 override edits to make.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

This slice introduces NO new trust boundaries. It only captures read-only data (npm audit, gh api Dependabot) and writes documentation/JSON artifacts under `.planning/`.

| Boundary | Description |
|----------|-------------|
| Developer machine ↔ GitHub API | gh api call for Dependabot data; uses pre-existing gh auth (no new credentials). Read-only. |
| Developer machine ↔ npm registry | npm audit reads package-lock.json locally; no network beyond advisory metadata fetch. Read-only. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04.1-01 | Information Disclosure | `.planning/phases/04-dependency-triage/04-DEPENDABOT-PRE.json` (committed to public repo) | accept | The Dependabot data is already public on the GitHub Security tab (`https://github.com/suculent/thinx-device-api/security/dependabot`). Committing it adds no new disclosure surface. |
| T-04.1-02 | Tampering | `.planning/dep-triage.md` verdict column accuracy | mitigate | Task 3 acceptance criteria pin verdicts to the closed taxonomy + research preclassification; row count cross-check against the JSON array length catches missing/extra rows. |
| T-04.1-03 | Spoofing | `gh api` source authenticity | accept | `gh` CLI handles GitHub authentication; no new auth surface introduced by this slice. |

**Note:** Slice 1 ships zero code changes — the only "deployed" artifact is the triage classification, which goes through Slice 2's commit-and-CI path (Slice 2 will own the deeper threat model since that's where override edits land). The package-legitimacy gate (npm install + ASSUMED package audit) is not triggered here — no package installs occur.

**Slopcheck note:** This slice does not invoke any package-manager install. The `npm audit` commands read the existing lockfile only and do not download or install packages. No `[ASSUMED]`/`[SUS]` package gate applies.
</threat_model>

<verification>
- All three baseline JSON artifacts exist, parse as JSON, contain `.metadata.vulnerabilities` (audit files) or non-empty array (Dependabot file).
- `.planning/dep-triage.md` has 5 sections + footer matching the schema in 04-RESEARCH.md L261-L327.
- Section 1 row count equals Dependabot JSON array length (expected ≈29).
- Every Section 1 row's Verdict is from the closed enum; every `deferred-*` row's Rationale is from the closed taxonomy.
- Verdict distribution matches research preclassification: 7 blocker + 19 deferred-stale + 3 deferred-dev-only (±4 churn allowed for new alerts since 2026-05-26).
- Commit on `thinx-staging` touches ONLY the four documentation/JSON paths; no source / package.json / lockfile changes.
- Working tree clean post-commit.
</verification>

<success_criteria>
- **ROADMAP Success Criterion 1 (partial):** `.planning/dep-triage.md` exists with all 28+ findings classified in Section 1's table. ✓ Tasks 2+3.
- **ROADMAP Success Criterion 4 (pre-fix half):** Pre-fix `npm audit` output captured as artifact (`04-AUDIT-PRE.json` + `04-AUDIT-PRE-PROD.json`). The "new baseline" half is Slice 3's responsibility. ✓ Task 1.
- **Phase 4 invariant:** No `chai-http` v4 lock violation (no override touching chai-http or superagent; no package.json changes at all). ✓ by construction — Slice 1 makes zero package changes.
- **Slice 1 ↔ Slice 2 handoff:** The triage table's 7 `blocker` rows uniquely identify the 4 override edits Slice 2 will make and the 7 GHSA IDs Slice 2's commit body will reference in its "Alerts closed" field.
</success_criteria>

<output>
After completing all four tasks and committing on `thinx-staging`, create `.planning/phases/04-dependency-triage/04-01-SUMMARY.md` documenting:
  - Final row count + verdict distribution (M blocker / K deferred-stale / L deferred-dev-only).
  - The 7 GHSA IDs from blocker rows (Slice 2's "Alerts closed" target list).
  - Any divergence from research preclassification (new alerts since 2026-05-26, or any UNCLASSIFIED rows).
  - Pointer to the commit SHA so Slice 2 can reference "post-Slice-1 baseline" in its commit body.
</output>
