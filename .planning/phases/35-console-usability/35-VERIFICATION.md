---
phase: 35-console-usability
verified: 2026-10-12T10:47:31Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/35-console-usability/35-01-PLAN.md
  - .planning/phases/35-console-usability/35-01-SUMMARY.md
  - .planning/phases/35-console-usability/35-02-PLAN.md
  - .planning/phases/35-console-usability/35-02-SUMMARY.md
  - services/console/vue/cypress/integration/profile.spec.js
  - services/console/vue/src/components/Header/Header.vue
  - services/console/vue/src/components/Sidebar/Sidebar.vue
  - services/console/vue/src/pages/Devices/DeviceDetail.vue
  - services/console/vue/src/pages/Profile/Profile.vue
  - services/console/vue/tests/unit/milestone-v116.cjs
covered_digest: "v3:sha256:f6de62bf8822e19a7e8cce9950981d72e5657127f8dbbb80a4ce7388264a1a7f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: "untyped (2026-10-09 prose report: implementation locally verified, live acceptance pending)"
  previous_score: "n/a"
  gaps_closed:
    - "G-35-4: Linked Repository Git URL renders as a new-tab link (target=_blank, rel=noopener noreferrer) for http(s) URLs only; other schemes stay plain text"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "UAT test 4 re-test on rtm.thinx.cloud after the operator pushes console thinx-staging (4552901) and parent thinx-staging (fadfab0e+), CircleCI builds, and Swarmpit rolls out. Open a device linked to a repository whose URL is https://..., click the URL; then open a device linked to a git@host:org/repo.git repository."
    expected: "The https URL is a link that opens the repository in a new tab, and the console tab is not navigated. In DevTools the anchor has target=\"_blank\" and rel=\"noopener noreferrer\". The git@ URL shows as plain text with no link. The alias line above it is unchanged."
    why_human: "The fix is local-only (not pushed or deployed). The render test exercises the real template in the Vue runtime, but the gap was raised by the operator in live UAT and closes only with the operator's re-test in the deployed console (35-02 coverage D3, human_judgment: true)."
  - test: "Prohibition (judgment tier, flagged): 'MUST NOT push either repository' during gap closure"
    expected: "Confirm that no push happened before the operator's own deploy step."
    why_human: "Judgment-tier prohibition. LLM-judge verdict (non-authoritative): HELD. origin/thinx-staging:services/console is still 956a7a2, the console's origin/thinx-staging is still c03dac8, and the parent is 10 commits ahead of origin/thinx-staging. Human review recommended."
  - test: "Prohibition (judgment tier, flagged): 'MUST NOT create an unsigned commit or bypass hooks'"
    expected: "Confirm that all gap-closure commits are signed and that no hook was bypassed."
    why_human: "Judgment-tier prohibition. LLM-judge verdict (non-authoritative): HELD for signing. Console b7b5b29, 8815aa7 and 4552901 and parent fadfab0e all have %G? = G. Hook bypass (--no-verify) leaves no trace in git, so that half rests on the executor's narration only. Human review recommended."
  - test: "Prohibition (judgment tier, flagged): 'MUST NOT change any console file other than DeviceDetail.vue and milestone-v116.cjs, and MUST NOT run npm run eslint'"
    expected: "Confirm the file scope, and that the whole-tree --fix lint was not run."
    why_human: "Judgment-tier prohibition. LLM-judge verdict (non-authoritative): HELD for scope. `git diff --name-only c03dac8 HEAD` lists exactly those two files, and the worktree is clean, so no stray --fix edits remain. Whether the command was run is not observable after the fact. Human review recommended."
---

# Phase 35: Console Usability Verification Report

**Phase Goal:** Console Usability. Deliver UI-01, UI-02, UI-03 and UI-04, including gap closure G-35-4 (35-UAT.md test 4): the device detail Linked Repository Git URL renders as a safe new-tab link for http(s) URLs only.
**Verified:** 2026-10-12T10:47:31Z
**Status:** human_needed
**Re-verification:** Yes. This replaces the 2026-10-09 prose report, written before the UAT and the G-35-4 gap closure. That report had no `gaps:` frontmatter, so every truth was re-verified in full.

Scope: the phase-35 console diff is `git -C services/console diff d5c09e7 HEAD`. It is one bundled v1.16 commit, 956a7a2, which also carries the phase 36–38 work, plus the three G-35-4 commits. Only the UI-01..04 and G-35-4 parts are verified here.

## Goal Achievement

### Observable Truths

ROADMAP Phase 35 has no success-criteria list, so the contract is the four requirement IDs plus the five must_haves truths of 35-02-PLAN. 35-01-PLAN has no must_haves block.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **UI-01**: The template alert, the duplicate logout and Inbox are removed, and "My Account" is renamed "My Profile" | ✓ VERIFIED | `Header.vue`: the `b-alert` "Light Blue Settings" block and `showNavbarAlert` are gone, as are the Inbox dropdown item with its badge "9" and the standalone `flaticon-power-1` logout nav-item. A single `Log Out` remains (`Header.vue:50-51`). The item reads `My Profile` (`Header.vue:48`). A grep over `vue/src` finds no "Inbox", "My Account" (except Profile's unrelated "Delete My Account") or header-alert. UAT test 1 passed live. |
| 2 | **UI-02**: The device action buttons, with icons, sit at the top, including environment editing, and the sections stack in a single column | ✓ VERIFIED | `DeviceDetail.vue:14-19`: the Actions card is the first card after the alerts. Build, Revoke, Transfer and Environment each have a `fa-*` icon, and Environment calls `editEnvironment`. Both columns changed from `md="6"` to `cols="12"` (lines 23 and 47). UAT tests 2 and 3 passed live. See WR-03 under the anti-patterns. |
| 3 | **UI-03**: The linked repository resolves to its name and Git URL | ✓ VERIFIED | `linkedRepository` computed (`DeviceDetail.vue:235-237`) matches `repositories/getItems` on `repo.id === device.source`. Data flow: `GET /api/v2/source` → `sources.list` → `doc.repos` (keyed by source id) → `saveItems` flattens it to `{id, alias, url,…}`. The alias line shows `linkedRepository.alias` and the URL line shows `linkedRepository.url`. The render test asserts that the alias and URL text are present. UAT test 4 passed on name and URL, with the link request raised as G-35-4. |
| 4 | **UI-04**: "All" excludes Important and Informational, including on hydration and save | ✓ VERIFIED | `Profile.vue`: each checkbox's `@change` calls `notificationChanged`, which clears the other two when All is selected and clears All otherwise. Hydration in `loadProfile` clears important and info when `all` is stored. `saveNotifications` writes the exclusive `notifForm`. Unit test: `milestone-v116.cjs:53-59` runs the real method. UAT test 5 (select, save, reload) passed live. |
| 5 | G-35-4: an http(s) URL renders as one `<a>` whose href is the parsed `URL.href`, with `target="_blank"` and `rel="noopener noreferrer"`, and the stored URL as its text | ✓ VERIFIED | `DeviceDetail.vue:70` and computed lines 240-249 return `new URL(url).href` only for `http:` and `https:`. Render test `milestone-v116.cjs:90-95` covers the real card extracted from the SFC, the real computed and the Vue runtime: exactly one anchor with the correct href, target and rel. It ran here with exit 0. Live re-test pending; see Human Verification. |
| 6 | Unparseable values and non-http(s) schemes render as plain text, with no href in the card | ✓ VERIFIED | Render cases for `javascript:`, `git@` and `ssh://`: no anchor, no href, text visible. The 13-row matrix (`:104-119`) covers case and leading-space `javascript:`, `data:`, `file:`, bare host/path, empty, undefined and null, plus the `linkedRepository: null` case. |
| 7 | The alias line is unchanged, and an unmatched source shows "Repository unavailable" with no URL line or anchor | ✓ VERIFIED | `git diff c03dac8 HEAD -- DeviceDetail.vue` touches only the URL `<p>` and adds the computed; the alias `<p class="mb-1">` is unchanged. Render case `:121-123` checks the unmatched source: "Repository unavailable", 0 anchors and 0 hrefs. |
| 8 | `milestone-v116.cjs` exits 0, and removing the anchor or the scheme check makes it exit non-zero | ✓ VERIFIED | Ran here with exit 0. Independent mutation run on a scratchpad copy (repo untouched): removing the protocol check gives rc=1, removing the anchor rc=1, removing rel rc=1 and removing target rc=1. One mutant survives; see IN-A below. |
| 9 | Console changes are limited to DeviceDetail.vue and milestone-v116.cjs, in signed thinx-staging commits. The parent gitlink bump is one signed commit that touches only `services/console`. Nothing is pushed | ✓ VERIFIED | The console is on branch `thinx-staging` with a clean worktree. `diff --name-only c03dac8 HEAD` lists exactly the two files. b7b5b29, 8815aa7 and 4552901 are signed (G) and are ancestors of HEAD. The parent `HEAD:services/console` is 4552901 and equals console HEAD. fadfab0e is signed (G) and touches only `services/console`. Both origin refs are unchanged: the console at c03dac8 and the parent gitlink at 956a7a2. |

**Score:** 9/9 truths verified (0 present but behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/console/vue/src/pages/Devices/DeviceDetail.vue` | `linkedRepositoryHref` computed plus the anchor or span fallback | ✓ VERIFIED | Exists, substantive, wired. `:href="linkedRepositoryHref"` is the only `:href` in the file, and nothing binds `linkedRepository.url` to an href. |
| `services/console/vue/tests/unit/milestone-v116.cjs` | Render test of the real card plus the scheme matrix | ✓ VERIFIED | Wired: it extracts `title="Linked Repository"` from the real SFC and uses `device.computed.*` |
| `services/console` (gitlink) | Bumped to the console commit with the fix | ✓ VERIFIED | `gsd verify.artifacts` reports "Not a file: path is a directory", which is a limitation of the tool for gitlinks. Checked by hand: the gitlink equals console HEAD 4552901. |
| `vue/src/components/Header/Header.vue` (UI-01) | Header cleanup | ✓ VERIFIED | Diff reviewed |
| `vue/src/pages/Profile/Profile.vue` (UI-04) | Exclusive notification logic | ✓ VERIFIED | Diff reviewed; the method is exercised by the unit test |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `linkedRepositoryHref` computed | template `<a :href>` | the href is bound only to the computed | ✓ WIRED | The tool reported "Source file not found" because `from:` is prose, not a path. A manual grep finds `:href="linkedRepositoryHref"` at line 70 and 0 occurrences of `linkedRepository.url"`. |
| `milestone-v116.cjs` | DeviceDetail.vue Linked Repository card | compileToFunctions over the extracted card plus the real computed | ✓ WIRED | Tool: "Pattern found in source" |
| `linkedRepository` | `repositories/getItems` store → `GET /api/v2/source` | mapGetters plus `fetchRepositories` in `loadDevice` | ✓ WIRED | `loadDevice` calls `fetchRepositories()` inside `Promise.allSettled` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Linked Repository card | `linkedRepository.{alias,url}` | `GET /api/v2/source` → `lib/thinx/sources.js list()` → CouchDB `doc.repos` | Yes, from the user document | ✓ FLOWING |
| Profile notification checkboxes | `notifForm.*` | `profile/fetchProfile` → `info.notifications` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| v1.16 and G-35-4 checks | `node services/console/vue/tests/unit/milestone-v116.cjs` | exit 0, "…linked repository links, and all changed Vue templates." | ✓ PASS |
| Other Vue unit files | `node …/{env-json,apikey-created-dialog,footer-hostnames,table-row-contrast}.cjs` | all exit 0 | ✓ PASS |
| log-paging-store | `node …/log-paging-store.cjs` | the only FAIL is "History filter hint singular and plural" (`many:false`) | ℹ️ PRE-EXISTING. It fails identically at d5c09e7 (`git archive` into the scratchpad, rc=1). It depends on the locale: this host is cs-CZ, where `(1200).toLocaleString()` is `1 200`. It is not a phase-35 regression. |
| Href-guard mutation | scratchpad copy, 5 mutants | 4 killed, 1 survived (IN-A) | ✓ PASS |
| ESLint on the phase-35 UI files | `eslint --ext .vue,.cjs` DeviceDetail, Header, Profile, Sidebar, milestone-v116 | exit 0 | ✓ PASS |
| Whitespace | `git -C services/console diff --check d5c09e7 HEAD` | exit 0 | ✓ PASS |
| Vue production build | `vue-cli-service build` | not re-run here, so as not to write build output. Orchestrator reported success this run. Every changed template compiles inside `milestone-v116.cjs`. | ? orchestrator evidence |

Orchestrator evidence for this run, not re-run here because phase 35 changes no parent code: parent `npm run test:node` 43/43, `npm run test:deploykeys` 6/6, and the legacy `src/test/deploykey.cjs` passes.

Prior evidence (2026-10-09 report, still accurate): Vue and Legacy source CSP checks passed; Legacy XSRF, digest and scope checks passed; Legacy `build:test` passed. Browser and E2E tests have not run locally (no Chromium, and Playwright downloads failed). The live UAT on rtm.thinx.cloud (35-UAT.md, 2026-10-12) has since covered tests 1, 2, 3 and 5.

### Probe Execution

None declared. The phase is console UI with no probe scripts. Step 7c is not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UI-01 | 35-01 | Remove the template alert, duplicate logout and Inbox; rename My Account to My Profile | ✓ SATISFIED | Truth 1; UAT 1 pass |
| UI-02 | 35-01 | Action buttons with icons at the top, including environment editing, in a single column | ✓ SATISFIED | Truth 2; UAT 2 and 3 pass |
| UI-03 | 35-01, 35-02 | Resolve the linked repository to its name and Git URL (G-35-4: safe http(s) new-tab link) | ✓ SATISFIED (live re-test pending) | Truths 3 and 5-9 |
| UI-04 | 35-01 | All excludes Important and Informational, including hydration and save | ✓ SATISFIED | Truth 4; UAT 5 pass |

No orphans: REQUIREMENTS.md maps exactly UI-01..UI-04 to Phase 35, and all four are claimed by 35-01-PLAN. 35-02-PLAN also claims UI-03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase-35 console files) | n/a | No TBD, FIXME, XXX, TODO, HACK or placeholder on any added line of `d5c09e7..HEAD` | n/a | none |
| `vue/cypress/integration/profile.spec.js` | 110-115 | Stale spec (review WR-07): the PROF-06 test still clicks `'My Account'`, which UI-01 renamed to `My Profile` | ⚠️ Warning | The spec would fail if run. Cypress is commented out in the console `.circleci/config.yml` (`# npm run cy:run`), and CI runs only `npm run build`, so neither the Cypress spec nor `test:unit` gives any CI signal. This does not defeat UI-01. |
| `vue/src/pages/Devices/DeviceDetail.vue` | 18, 317-344 | Review WR-03: the new top Environment button is only disabled while `envLoading`. A second click while the editor is open re-fetches and overwrites `envDraft`, losing the edits. It also does not scroll or focus the editor further down the page | ⚠️ Warning | Defect on a UI-02 artifact. The requirement (an environment-edit action at the top, which opens the editor) holds, and UAT 2 passed. Draft loss happens only on a repeat click. |
| `vue/tests/unit/milestone-v116.cjs` | 90-95 | IN-A (new, this verification): a mutant that binds `:href="linkedRepository.url"` but keeps `v-if="linkedRepositoryHref"` passes the suite, because the https fixture is already in normalised form | ℹ️ Info | Not a security hole: the `v-if` gate still blocks every non-http(s) scheme, and the browser strips surrounding whitespace from href. The "parsed href, not raw string" decision is guarded only by grep and code review. A render case with `HTTPS://GitHub.com/...` asserting the anchor href is `https://github.com/...` would kill this mutant. |

**Review findings outside phase-35 requirements.** 35-REVIEW.md covers the whole bundled v1.16 diff. These findings were weighed and do not defeat UI-01..04:
- **CR-01** (critical): after a failed load, the TransformerEditor Save blanks a transformer. This is TRANS-01, owned by **Phase 37 Transformer Parity**.
- **WR-02** (Create & Assign also saves the unsaved selection) and **WR-04** (whole-`info` writes can overwrite `info.transformers`, including Profile's `saveNotifications` path) are TRANS-01/02, Phase 37. WR-04 does not affect UI-04: the notification exclusivity and its persistence are correct, and the data-loss risk is to the transformer list.
- **WR-01** (History row keyboard handling) is BUILD-01, **Phase 36**.
- **WR-05** and **WR-06** (deploy-key list error, delete without confirmation) are KEY-01..03, **Phase 38**.

These must be weighed in the phase 36, 37 and 38 verifications. Phase 37 in particular cannot pass with CR-01 open. All 16 findings are still `open` in 35-REVIEW-DISPOSITION.md.

### Human Verification Required

#### 1. UAT test 4 re-test after deploy (G-35-4 closure)

**Test:** Push console `thinx-staging` (fast-forward c03dac8 → 4552901), then parent `thinx-staging`. Wait for CircleCI and the Swarmpit rollout. In the console at `https://rtm.thinx.cloud/`, open a device linked to an https repository and click the URL. Then open a device linked to a `git@host:org/repo.git` repository.
**Expected:** The https URL opens the repository in a new tab, and the console tab stays where it was. The anchor has `target="_blank"` and `rel="noopener noreferrer"`. The git@ URL is plain text. The alias line is unchanged.
**Why human:** The fix is local-only. The gap was raised in live UAT, so it closes on the operator's live re-test (`/gsd-verify-work 35`).

#### 2-4. Judgment-tier prohibitions from 35-02-PLAN (flagged, human review recommended)

| Prohibition | LLM-judge verdict (non-authoritative) | Evidence |
|-------------|----------------------------------------|----------|
| MUST NOT push either repo | HELD | origin console ref c03dac8, origin parent gitlink 956a7a2, parent 10 commits ahead |
| MUST NOT create an unsigned commit or bypass hooks | HELD (signing); hook bypass not observable | all four commits `%G?` = G |
| MUST NOT change other console files or run `npm run eslint` | HELD (scope); running the command not observable | outgoing diff is exactly 2 files, worktree clean |

The push prohibition applied only during gap closure. The operator's own push (item 1) is the intended next step.

### Gaps Summary

There are no blocking gaps. All four requirements and all five G-35-4 must-haves are present in code, wired to real data, and exercised: by unit and render tests here, and by the operator's live UAT (tests 1, 2, 3 and 5) for the deployed 35-01 work. G-35-4 is closed in code. Its http(s)-only guard holds against 4 of 5 independent mutants, and the surviving mutant cannot produce a non-http(s) link.

The phase stays at `human_needed` for two reasons. The G-35-4 fix is not yet pushed or deployed, so the operator's live re-test of UAT test 4 is outstanding. The three judgment-tier prohibitions also carry flagged, non-authoritative verdicts.

Non-blocking warnings on phase-35 artifacts:
- **WR-03:** the Environment button can drop an open draft.
- **WR-07:** a stale Cypress spec, and no CI unit-test signal.

The critical review finding, CR-01, belongs to Phase 37 (TRANS-01) and must be resolved there.

---

_Verified: 2026-10-12T10:47:31Z_
_Verifier: Claude (gsd-verifier)_
