---
phase: 35-console-usability
plan: 02
subsystem: ui
tags: [vue, console, xss, gap-closure, G-35-4]

requires:
  - phase: 35-console-usability
    provides: "35-01 Linked Repository card (linkedRepository computed) in DeviceDetail.vue"
provides:
  - "linkedRepositoryHref computed: WHATWG URL parse, http:/https: only, returns the parsed href"
  - "Linked Repository URL rendered as <a target=_blank rel=noopener noreferrer> for http(s), plain <span> otherwise"
  - "Render test of the real card plus a scheme matrix in vue/tests/unit/milestone-v116.cjs"
  - "Parent gitlink bumped to console 4552901 (unpushed)"
affects: [35-UAT test 4, console deploy via thinx-staging]

actuals:
  tokens: 2148
  tasks: 2
  commits: 1
plan_head_before: 3029b75cf9dd4c781b5e4f1f6e9a18f7bd52d3ee
plan_head_after: fadfab0e56c9744a135cee03fa55a7f3c286107f

tech-stack:
  added: []
  patterns:
    - "Render an extracted SFC template fragment with vue.runtime.common.js and the component's own computed functions (ignoredElements /^b-/)"
    - "Bind user-entered URLs to href only through an http(s) allow-list computed that returns the parsed href"

key-files:
  created: []
  modified:
    - services/console/vue/src/pages/Devices/DeviceDetail.vue
    - services/console/vue/tests/unit/milestone-v116.cjs
    - services/console (gitlink)

key-decisions:
  - "linkedRepositoryHref returns new URL(url).href rather than the raw string, so the browser navigates to exactly the value that passed the protocol check (normalised case and trimmed whitespace)"
  - "Allow-list is the exact parsed protocol 'http:' or 'https:'; parse failure (git@ remotes, bare host/path, empty) or any other scheme stays plain text"

patterns-established:
  - "renderLinkedRepository(repos, source) helper in milestone-v116.cjs: extract card by title, compileToFunctions, _render, walk vnodes for anchors/hrefs/text"

requirements-completed: [UI-03]

coverage:
  - id: D1
    description: "https repository URL on the device page is a link that opens a new tab with rel=noopener noreferrer"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "node services/console/vue/tests/unit/milestone-v116.cjs (https render case)"
        status: pass
    human_judgment: false
  - id: D2
    description: "javascript:, data:, ssh:, file:, git@ and unparseable repository URLs render as plain text with no href"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "node services/console/vue/tests/unit/milestone-v116.cjs (render cases + scheme matrix)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live re-test of UAT test 4 on rtm.thinx.cloud after deploy"
    requirement: UI-03
    verification: []
    human_judgment: true
    rationale: "Requires the operator's thinx-staging push, CircleCI build and Swarmpit rollout, then a click in the deployed console"

duration: 4min
completed: 2026-10-12
status: complete
---

# Phase 35 Plan 02: Linked Repository URL Link (G-35-4) Summary

**The Linked Repository card now renders http(s) Git URLs as a new-tab link (`target="_blank" rel="noopener noreferrer"`), bound only through a WHATWG-URL allow-list computed. SSH remotes, `javascript:`, `data:` and other schemes stay plain text. A render test of the real card and a scheme matrix guard it.**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-10-12T10:27:18Z
- **Completed:** 2026-10-12T10:31Z
- **Tasks:** 2/2
- **Files modified:** 2 console files plus 1 parent gitlink

## Accomplishments

- Added the `linkedRepositoryHref` computed in `DeviceDetail.vue`. It returns `new URL(url).href` only when the protocol is exactly `http:` or `https:`, and null otherwise or when the parse throws. There is no new import.
- The URL line of the Linked Repository card is now `<a v-if="linkedRepositoryHref" :href="linkedRepositoryHref" target="_blank" rel="noopener noreferrer" data-cy="linked-repository-url">`, with a `<span v-else>` plain-text fallback. The alias line and the `b-card` line are unchanged.
- `milestone-v116.cjs` renders the real card extracted from the SFC with the component's own computed. It asserts:
  - https: one link with the right href, target and rel;
  - `javascript:`: no `a` and no href;
  - `git@`: plain text;
  - unmatched source: "Repository unavailable", no link;
  - `ssh://`: plain text.
  It also runs a 13-row scheme matrix directly over the computed, plus a `linkedRepository: null` case.

## Task Commits

Console (`services/console`, branch `thinx-staging`, all signature status G, **not pushed**):

1. **Task 1 (tracer) RED:** `b7b5b29` test(vue): add failing linked repository link checks (G-35-4)
2. **Task 1 (tracer) GREEN:** `8815aa7` fix(vue): link http(s) repository urls in a new tab (G-35-4)
3. **Task 2 matrix:** `4552901` test(vue): cover non-http repository url schemes (G-35-4)

Parent (`thinx-device-api`, branch `thinx-staging`, signed G, **not pushed**):

4. **Task 2 gitlink bump:** `fadfab0e` chore(35): bump console to the repository url link fix (G-35-4). It stages only `services/console`.

Before Task 1, the console fast-forwarded from 956a7a2 to c03dac8 (`merge --ff-only origin/thinx-staging`, local ref, no file change).

## TDD / Verification Evidence

- **RED (Task 1, before the computed and the anchor existed):** `node services/console/vue/tests/unit/milestone-v116.cjs` exited 1 with:
  `AssertionError [ERR_ASSERTION]: https repository URL renders exactly one link` / `0 !== 1` (milestone-v116.cjs:91).
- **GREEN:** exit 0; prints `v1.16 regression checks passed: ... linked repository links, ...`. REPO-LINK-GREEN and CONSOLE-LINK-COMMITTED were printed.
- **Matrix mutation checks (Task 2):**
  - Mutant 1: the computed returned the raw `url` for every parsed URL (`return parsed && url;`). The file exited 1 with `AssertionError: javascript: repository URL renders no link` / `1 !== 0`.
  - Mutant 2: it kept the scheme check but returned the raw `url` instead of `parsed.href`. It exited 1 in the matrix itself with `AssertionError: linkedRepositoryHref("HTTPS://GitHub.com/org/repo.git")`.
  - Both were restored with `git checkout -- vue/src/pages/Devices/DeviceDetail.vue`. The diff was then empty and the file exited 0.
- **UNIT-FILES-GREEN:** milestone-v116 exits 0. env-json, apikey-created-dialog, footer-hostnames and table-row-contrast exit 0. log-paging-store prints only the pre-existing FAIL.
- **LINT-CLEAN:** `ESLINT_USE_FLAT_CONFIG=false ./node_modules/.bin/eslint --ext .vue,.cjs` on the two files exits 0, and `git diff --check origin/thinx-staging..HEAD` is clean.
- **GITLINK-BUMPED-UNPUSHED:**
  - The parent gitlink equals console HEAD `4552901eb50fe8e559b3cc7142657b791ef9c727`.
  - The bump commit touches only `services/console` and is signed G.
  - `origin/thinx-staging:services/console` is still 956a7a2, and the console's `origin/thinx-staging` is still c03dac8.

## Files Created/Modified

- `services/console/vue/src/pages/Devices/DeviceDetail.vue`: the `linkedRepositoryHref` computed, and the anchor or span on the card's URL line.
- `services/console/vue/tests/unit/milestone-v116.cjs`: the Vue runtime setup, the `renderLinkedRepository` helper, the render cases, the scheme matrix, and a coverage line.
- `services/console` (parent gitlink): 956a7a2 to 4552901.

## Decisions Made

- **The href is the parsed URL, not the raw string.** The browser navigates to exactly the value the protocol check accepted. For example, `HTTPS://GitHub.com/...` becomes `https://github.com/...` and surrounding whitespace is trimmed. The visible link text stays the stored URL (T-35-05 accepted).
- **The allow-list is the exact protocol (`http:` / `https:`) from the WHATWG parser.** Case and leading-space variants of `javascript:` parse to `javascript:` and are rejected. `git@host:org/repo.git` and bare `host/path` throw, so they become plain text.

## Deviations from Plan

None. The plan executed as written.

One note: commitlint rejected the first attempt at the Task 2 matrix commit because a body line was over 100 characters (`body-max-line-length`). The body was re-wrapped and committed signed. No hook was bypassed.

## Issues Encountered

- **Out of scope, pre-existing:** `tests/unit/log-paging-store.cjs` fails with `History filter hint singular and plural` (`"many":false`). The failure is already present at console 956a7a2 and is unrelated to DeviceDetail. Because `npm run test:unit` chains its files with `&&`, it stops there, so the unit files were run one by one. log-paging-store.cjs, History.vue and package.json were not changed.

## Known Stubs

None.

## Threat Model Coverage

- **T-35-01 (XSS through the href), mitigated:** the href is bound only through `linkedRepositoryHref`, and the render cases and matrix fail if the check is bypassed (both mutation checks above).
- **T-35-02 and T-35-03 (tabnabbing, Referer), mitigated:** `rel="noopener noreferrer"` and `target="_blank"` are asserted exactly by the render test.
- **T-35-06 (unsigned commits), mitigated:** all four commits are signature status G, and no hook was bypassed.

No new security surface beyond the threat model.

## User Setup Required

None.

## Next Steps (operator)

Local HEADs: console `thinx-staging` = `4552901eb50fe8e559b3cc7142657b791ef9c727`, parent `thinx-staging` = `fadfab0e56c9744a135cee03fa55a7f3c286107f`, plus the docs commit for this SUMMARY.

1. Push console `thinx-staging`. It fast-forwards from c03dac8.
2. Push parent `thinx-staging`.
3. Wait for CircleCI and the Swarmpit rollout.
4. Re-run UAT test 4 with `/gsd-verify-work 35`.

## Self-Check: PASSED

- FOUND: services/console/vue/src/pages/Devices/DeviceDetail.vue (contains linkedRepositoryHref)
- FOUND: services/console/vue/tests/unit/milestone-v116.cjs (contains Linked Repository)
- FOUND console commits: b7b5b29, 8815aa7, 4552901 (ancestors of console HEAD)
- FOUND parent commit: fadfab0e (HEAD)
