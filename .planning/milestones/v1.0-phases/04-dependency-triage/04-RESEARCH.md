# Phase 4: Dependency Triage (SEC-DEP-01) — Research

**Researched:** 2026-05-26
**Domain:** Node.js dependency vulnerability triage on a Docker-Swarm-deployed Express 5 API
**Confidence:** HIGH (all factual claims verified against live `npm view`, live lockfile, live `gh dependabot`, live `npm audit`, official GHSA pages)

## Project context

`thinx-device-api` is a Node 22 / Express 5 IoT device API deployed as a Docker Swarm service on `188.166.23.244`. Phase 4 closes the final v1 GA backend requirement (SEC-DEP-01): classify every open GitHub Dependabot finding as v1-blocker or v1.x-deferred, ship blocker fixes via `package.json` direct bumps / `overrides` block edits / code mitigations, and document the post-fix `npm audit` baseline at `.planning/dep-triage.md`. The codebase carries a hard `chai-http` v4 lock (16 ZZ-* spec files with 216 `chai.request(thx.app)` call sites — verified by grep) that prevents bumping `chai-http` regardless of CVE pressure. The fix vector of record is the existing `overrides` block at `package.json` L97-L136 (38 pins, already used to suppress transitive CVEs).

## Source reconciliation — Dependabot vs Snyk vs npm audit

Three vulnerability scanners disagree on counts because they index different things. Reconciling them is the **first** research task because the planner must pick a primary source.

### Live counts as of 2026-05-26

| Source | Total | High | Medium | Low | Unique packages | Surface scanned |
|--------|-------|------|--------|-----|-----------------|-----------------|
| **GitHub Dependabot** (live `gh api`) | **29** | 11 | 17 | 1 | 9 | `package-lock.json` per-instance × per-CVE |
| **Snyk test** (`research-data/snyk-test.json`) | 20 paths | 13 | 7 | 0 | 4 packages / 6 CVE IDs | resolved dependency paths |
| **Snyk test --prod** (`research-data/snyk-test-prod.json`) | 20 paths | 13 | 7 | 0 | 4 packages / 6 CVE IDs | same as full (see "scope misclassification" below) |
| **npm audit --json** | 34 nodes | 23 | 11 | 0 | 34 advisories across nested chains | full dependency tree |
| **npm audit --omit=dev** | 15 nodes | 9 | 6 | 0 | 15 advisories in runtime tree | runtime tree only |

`[VERIFIED: gh api repos/suculent/thinx-device-api/dependabot/alerts?state=open&per_page=100]`
`[VERIFIED: research-data/snyk-test.json $.uniqueCount=6, $.vulnerabilities|length=20]`
`[VERIFIED: npm audit --json $.metadata.vulnerabilities at this commit]`

### Per-package reconciliation (live data)

| Package | Dependabot alerts | Snyk paths | npm audit nodes | Scope | Notes |
|---------|-------------------|-----------|-----------------|-------|-------|
| `axios` | 15 (4H + 10M + 1L) | 0 | 0 in audit-tree | runtime | Snyk and `npm audit` agree axios@1.16.1 is patched. **All 15 Dependabot alerts are STALE** — vuln_ranges are `<1.15.x`; live install is `1.16.1`. Created 2026-04-16 to 2026-05-08 against an earlier lockfile state. |
| `fast-uri` | 2 high | 0 | 0 (fast-uri@3.1.2 installed) | development | Scope: development (dev-only dep). Installed `3.1.2` ≥ patched `3.1.2` (one CVE) and `3.1.1` (other). **Both alerts STALE.** |
| `follow-redirects` | 1 medium | 5 high | 1 moderate node | runtime | Active. Override pins `1.15.6`; needs ≥`1.16.0`. **Severity disagreement:** Dependabot rates this medium (CVSS-based), Snyk rates high — both reference GHSA-r4q5-vmmm-2653 (auth header leak). |
| `ip-address` | 1 medium | 0 | 0 (ip-address@10.2.0 installed) | runtime | Live install `10.2.0` ≥ patched `10.1.1`. **STALE.** |
| `lodash` | 2 (1H + 1M) | 8 paths | 1 high node | runtime | Active. Override pins `4.17.23`; needs ≥`4.18.0` per GHSA-r5fr-rjxr-66jc (vuln `>=4.0.0, <=4.17.23`). **All 4 Snyk paths and 1 audit node go through `jshint`/`fs-finder`/`rollbar`/`winston`.** |
| `minimatch` | 3 high | 4 paths | 1 high node | runtime | Active. Override pins `5.1.0`; safe target on same major is `5.1.8` (covers all 3 GHSAs: GHSA-7r86-cg39-jmmj `<5.1.8`, GHSA-23c5-xmqv-rm74 `<5.1.8`, GHSA-3ppc-4f35-3m26 `<5.1.7`). All paths via `jshint`. |
| `serialize-javascript` | 2 (1H + 1M) | 0 (snyk didn't surface) | 1 high node (in mocha chain) | development | Active. Installed `6.0.2` is in vuln range. Patched `7.0.5`. Dev-only (via `mocha` test runner). Snyk omitted; npm audit agrees. |
| `uuid` | 2 medium (1 dev + 1 runtime) | 0 | 1 moderate node (× 2 instances) | dev (alert 1) / runtime (alert 2) | **Runtime alert (`>=13.0.0, <13.0.1`) is STALE** — live install is `14.0.0` (> 13.0.1, past patched). **Dev alert (`<11.1.1`) is ACTIVE** — `istanbul-lib-processinfo@*` and `jest-junit@9.0.0-16.0.0` pin uuid `8.3.2`. |
| `ws` | 1 medium | 3 paths | 1 moderate node (3 instances) | runtime | Active. Top-level `ws@8.20.1` is safe, but `socket.io@4.8.1 → engine.io@6.6.4 → ws@8.17.1` and `socket.io-client@4.8.1 → engine.io-client@6.6.3 → ws@8.17.1` pull `~8.17.1` (tilde-locked). **Override required**, direct bump alone doesn't propagate. |

### Why Snyk's `--prod` flag returns the same set as full scan

**Misclassified dependencies.** Two packages live in `"dependencies":` (runtime) when they should be `"devDependencies":` — verified by `grep -n` against `package.json`:

| Package | Line | Should be | Snyk-surfaced via |
|---------|------|-----------|-------------------|
| `jshint: ^2.13.4` | L59 | devDependencies | All `lodash` + all `minimatch` Snyk paths (also `npm audit`'s `jshint > lodash`, `jshint > minimatch`) |
| `fs-finder: github:suculent/Node-FsFinder#master` | L55 | devDependencies (legacy build tool only) | `lodash` Snyk path via `fs-finder@1.8.5 > async@2.6.4 > lodash@4.17.23` |

This means `snyk test --prod` treats them as production and never strips their paths from the report. Operator may want to consider moving them — but only as a v1.x hygiene followup; do **not** restructure dependencies in this phase (out of scope, would invalidate `package-lock.json`).

### Reconciliation rule: which source wins for a given verdict

**Primary source: live `gh api` Dependabot alerts.** The roadmap explicitly says the deliverable is to drop the GitHub Security tab high-severity count to "zero unaddressed". The Dependabot UI is the metric that matters for the success criterion. Use the live API output (not the count quoted in the init context — that count was stale by 2 alerts).

**Cross-check sources:**
- **`npm audit --omit=dev`** for runtime confirmation — if it agrees with Dependabot that a path is vulnerable, that's a real fix target. If it disagrees, the Dependabot alert is likely stale.
- **Snyk** (`research-data/snyk-test.json`) for transitive-path enumeration — `from` arrays give the precise dependency chain (Snyk reports them more cleanly than `npm audit`).
- **`npm ls <pkg>`** for the final source of truth on an installed version's actual position in the tree.

**Stale-alert disposition rule:** Any Dependabot alert whose `vulnerable_version_range` excludes the version actually present in `package-lock.json` is **stale**. Free-fix pass: run `npm install` (regenerate lockfile against current package.json), push, and observe. Dependabot auto-dismisses stale alerts within ~24h of the next scheduled scan. Manual UI dismissal is an acceptable shortcut.

**Severity disagreement rule:** When Dependabot and Snyk disagree on severity for the same GHSA (e.g., follow-redirects: Dependabot=medium, Snyk=high), **use Dependabot's severity** for the dep-triage table — the GitHub Security tab is the deliverable's audience.

`[VERIFIED: live npm view, gh api, npm audit, package-lock.json — 2026-05-26]`

## Transitive path enumeration

Authoritative paths for each *active* alert, copied from live Snyk JSON + npm audit + lockfile inspection. **Stale alerts (axios, fast-uri, ip-address, uuid-runtime) omitted** — their paths don't exist in the current lockfile.

### Runtime paths (production exposure)

| Package | Resolved version | Chain | Code site | Override needed? |
|---------|-----------------|-------|-----------|------------------|
| `follow-redirects` | `1.15.6` (vulnerable) | `thinx@1.9.2866 > axios@1.16.1 > follow-redirects@1.15.6` | `lib/thinx/oauth-github.js` (axios), `lib/thinx/owner.js` (mailgun.js), `lib/thinx/database.js` (nano) | Yes — current override `1.15.6` is forcing the vulnerable version *over* axios's own safe `^1.16.0` declaration. **Removing the override entirely would resolve.** |
| `follow-redirects` | same | `thinx > @slack/web-api@7.15.0 > axios@1.16.1 > follow-redirects@1.15.6` | `lib/thinx/notifier.js`, `lib/thinx/messenger.js` (Slack disabled at runtime, but in tree) | Same fix — single override change resolves all 5 Snyk paths. |
| `follow-redirects` | same | `thinx > nano@10.1.4 > axios@1.16.1 > follow-redirects@1.15.6` | All CouchDB I/O | Same. |
| `follow-redirects` | same | `thinx > mailgun.js@12.1.1 > axios@1.16.1 > follow-redirects@1.15.6` | `lib/thinx/owner.js`, `lib/thinx/transfer.js` | Same. |
| `follow-redirects` | same | `thinx > @slack/rtm-api@7.0.4 > @slack/web-api@7.15.0 > axios@1.16.1 > follow-redirects@1.15.6` | Slack (disabled at runtime) | Same. |
| `lodash` | `4.17.23` (vulnerable) | `thinx > jshint@2.13.6 > lodash@4.17.23` | jshint = lint runtime dep (misclassified) | **Yes — override bump to `4.18.0+`.** No same-major safe target (4.17.x ends at 4.17.23 which IS vulnerable). Patched 4.18.0 is API-stable; 4.18.1 is latest. |
| `lodash` | same | `thinx > rollbar@2.26.5 > async@2.6.4 > lodash@4.17.23` | `lib/thinx/globals.js` Rollbar init (production error tracking) | Same fix — single override change. |
| `lodash` | same | `thinx > winston@3.19.0 > async@2.6.4 > lodash@4.17.23` | `lib/thinx/logger.js` (every log emission) | Same. |
| `lodash` | same | `thinx > fs-finder@1.8.5 > async@2.6.4 > lodash@4.17.23` | jenkins-era build helper (likely unused) | Same. |
| `minimatch` | `5.1.0` (vulnerable) | `thinx > jshint@2.13.6 > minimatch@5.1.0` | jshint runtime dep (misclassified) | **Yes — override bump to `5.1.8` (covers all 3 GHSAs).** Same-major; minimal API risk. |
| `minimatch` | same | `thinx > jshint@2.13.6 > cli@1.0.1 > glob@11.1.0 > minimatch@5.1.0` | jshint's CLI parser | Same single fix. |
| `ws` | `8.17.1` (vulnerable) at nested path | `thinx > socket.io@4.8.1 > engine.io@6.6.4 > ws@8.17.1` | `lib/thinx/queue.js:94` `socket.io` server (internal port 4000, builder ⇄ worker) | **Yes — override `ws: "8.20.1"` to force engine.io's `~8.17.1` tilde lock upward.** Direct dep `ws@^8.20.1` only controls top-level. |
| `ws` | same | `thinx > socket.io@4.8.1 > socket.io-adapter@2.5.5 > ws@8.17.1` | same socket.io server | Same single fix. |
| `ws` | same | `thinx > socket.io-client@4.8.1 > engine.io-client@6.6.3 > ws@8.17.1` | `lib/thinx/queue.js:8` outbound client | Same. |

`[VERIFIED: jq on package-lock.json + research-data/snyk-test.json; manual cross-check in lib/thinx/]`

### Development-only paths (test/build only — not in production image)

| Package | Resolved | Chain | Note |
|---------|----------|-------|------|
| `serialize-javascript` | `6.0.2` (vulnerable) | `mocha > serialize-javascript@6.0.2` | mocha is `devDependencies` (L154). Production Docker image is built with `npm install --omit=dev` (`Dockerfile:86`) — package is NOT in the deployed runtime. |
| `uuid` (dev alert) | `8.3.2` (vulnerable) | `nyc > istanbul-lib-processinfo > uuid@8.3.2` and `jest-junit > uuid@8.3.2` | Test/coverage tooling only. Not in production image. |
| `fast-uri` (alert is stale) | `3.1.2` (already patched) | dev-only via `ajv` chain | Already at fixed version. |

### Production image confirmation

`Dockerfile:86` — `RUN npm install -g npm@10.2.3 && npm install --omit=dev .`
`Dockerfile:1` — `FROM thinxcloud/base:alpine`

Anything in `devDependencies` is **excluded from the production image** and cannot be exploited at runtime. This is the foundation of every "dev-only → deferred" verdict below.

`[VERIFIED: Dockerfile lines 1, 86]`

## Override block hygiene

Three pins in the existing override block are **forcing the install to use a vulnerable version**. Each must be edited (or removed) for the blocker fixes to land.

### Current state (live `package.json` L97-L136 + lockfile cross-check)

| Existing override | Pinned to | Vulnerable? | Patched target | Verified safe target | Action |
|-------------------|-----------|-------------|----------------|----------------------|--------|
| `follow-redirects: "1.15.6"` (L115) | 1.15.6 | YES (GHSA-r4q5-vmmm-2653, `<=1.15.11`) | `>=1.16.0` | `1.16.0` (axios@1.16.1 declares `^1.16.0`) | **REMOVE the override** — let axios's own `^1.16.0` declaration resolve naturally. Simplest fix; zero risk. `[VERIFIED: npm view follow-redirects version → 1.16.0; npm view axios@1.16.1 dependencies → "follow-redirects": "^1.16.0"]` |
| `lodash: "4.17.23"` (L122) | 4.17.23 | YES (GHSA-r5fr-rjxr-66jc range `>=4.0.0, <=4.17.23`; also GHSA-f23m-r3pf-42rh `<=4.17.23`) | `>=4.18.0` | `4.18.1` (npm latest, npm view confirms) | **CHANGE to `"4.18.1"`** — closes both lodash CVEs. lodash 4.18 is a minor bump from 4.17, API-stable (no breaking changes per upstream changelog). `[VERIFIED: npm view lodash version → 4.18.1]` |
| `minimatch: "5.1.0"` (L124) | 5.1.0 | YES (GHSA-7r86-cg39-jmmj `<5.1.8`; GHSA-23c5-xmqv-rm74 `<5.1.8`; GHSA-3ppc-4f35-3m26 `<5.1.7`) | `>=5.1.8` covers all three | `5.1.9` (latest in 5.x line; Snyk's `fixedIn` array confirms 5.1.7 patches one) | **CHANGE to `"5.1.9"`** — same-major, addresses all 3 GHSAs without touching minimatch v6+ (which changed CLI behavior). `[VERIFIED: npm view 'minimatch@5' versions → 5.1.7, 5.1.8, 5.1.9 all exist]` |
| `axios: "1.15.2"` (none — not in overrides) | n/a | n/a | n/a | Top-level `^1.16.0` resolves to `1.16.1` — safe | **No override needed.** Top-level direct bump already covers all 15 stale Dependabot alerts. |

### New override needed (not currently in the block)

| New override | Pin to | Rationale | Side-effect risk |
|--------------|--------|-----------|------------------|
| `ws: "8.20.1"` | 8.20.1 | engine.io@6.6.4 and engine.io-client@6.6.3 tilde-lock `~8.17.1` (can only reach 8.17.x naturally). Top-level `ws@^8.20.1` controls our direct `ws` import (`thinx-core.js:252` WebSocket server) but not socket.io's nested `engine.io > ws`. Override propagates 8.20.1 to all three nested paths. | Low. socket.io @4.8.1 has been published since 2024; widely deployed against `ws@^8.x`. ws 8.17→8.20 is a patch series within the same major — protocol-compatible. **Verify by running the 17 ZZ-* specs after install.** Note: socket.io was also in the `engine.io-client@6.6.3 > ws@~8.17.1` chain; same fix covers both. `[VERIFIED: npm view engine.io@6.6.4 dependencies.ws → ~8.17.1; npm view ws version → 8.21.0]` |

### Override-block items not touched by this triage

The other 34 entries in the override block are not flagged by any current scan. They are legacy pins from prior triage passes. The Phase 4 close-out should **NOT** prune them — that's a v1.x hygiene exercise. Surgical edits only.

### Critical insight: removing vs. editing

For `follow-redirects` specifically, the simplest fix is **removing the override line entirely** (not editing it to `1.16.0`). Reasoning:
- `axios@1.16.1` already declares `follow-redirects: ^1.16.0` in its own package.json.
- The current override is *forcing* a downgrade from what axios would natively pull.
- Removing it lets npm resolve to `1.16.0` (or newer minor) without lock-in.
- Future axios bumps will automatically receive any further follow-redirects security patches.

For `lodash` and `minimatch`, the override **must remain** because the chains are `jshint > lodash@4.17.23` and `jshint > minimatch@5.1.0` — jshint's own deps declare older `lodash@^4.17.x` and `minimatch@^3 || ^5.0.0`-style ranges that don't naturally float upward.

## Blocker vs deferred decision rule

A clean, defensible rule the operator can apply per finding without re-deriving it for each row.

### Decision input variables

For each Dependabot alert, gather:

1. **Severity** — Dependabot's classification (high / medium / low)
2. **Scope** — `runtime` or `development` per Dependabot's own `dependency.scope` field
3. **Stale?** — does the alert's `vulnerable_version_range` exclude the version present in the current `package-lock.json`?
4. **Reachable?** — does any code in `lib/` or `thinx-core.js` exercise the vulnerable code path? (Often "yes by transitive" is enough; explicit unreachability requires evidence.)
5. **Lock collision?** — does fixing this require bumping `chai-http`, `chai`, or any other AGENTS.md-documented locked package?
6. **Fix cost** — single override line edit (LOW) vs. transitive chain rewrite (MEDIUM) vs. code mitigation requiring `lib/` changes (HIGH)

### Decision table

| Conditions | Verdict |
|------------|---------|
| Stale (live install is past patched version) | **v1.x-deferred** as "stale — pending Dependabot rescan after lockfile regeneration"; operator may manually dismiss on GitHub UI |
| High severity AND scope=runtime AND not stale AND not lock-collision AND fix cost ≤ MEDIUM | **v1-blocker** (must fix this phase) |
| High severity AND scope=development AND production image excludes dev deps (per `npm install --omit=dev`) | **v1.x-deferred** with rationale "dev-only scope; production image excludes" |
| Medium severity AND scope=runtime AND not stale AND fix cost = LOW (single override line) | **v1-blocker** (cheap to fix; aligns with "drop unaddressed count to zero" goal) |
| Medium severity AND scope=runtime AND fix cost ≥ HIGH | **v1.x-deferred** with rationale "fix cost > severity weight; deferred to v1.x" + trigger condition |
| Low severity AND scope=runtime AND fix cost = LOW | **v1-blocker** (free win) |
| Low severity AND any other condition | **v1.x-deferred** (severity too low to justify churn) |
| Lock collision (would force chai-http v5 / chai v5 / other locked package upgrade) | **v1.x-deferred** with rationale "locked per AGENTS.md" + trigger "if a downstream Snyk/Dependabot CVE in `superagent` v3 forces the migration" |
| Code-level mitigation possible AND cheaper than dep upgrade | **v1-blocker** via code mitigation (e.g., input sanitization) — but only if mitigation is clearly correct and testable |

### Pre-classification of the 29 current alerts using this rule

| Package | # alerts | Stale? | Scope | Verdict | Reason |
|---------|----------|--------|-------|---------|--------|
| axios (15) | 15 | YES (all `<1.15.x`; live=1.16.1) | runtime | **deferred-stale** | Live install already past patched. `npm install` regeneration + UI dismissal closes. |
| fast-uri (2) | 2 | YES (live=3.1.2 ≥ patched) | development | **deferred-stale** | Live install already past patched. |
| follow-redirects (1) | 1 | NO | runtime | **blocker** | Active CVE in production code path. Fix = REMOVE override line (zero-risk). |
| ip-address (1) | 1 | YES (live=10.2.0 ≥ patched 10.1.1) | runtime | **deferred-stale** | Live install already past patched. |
| lodash (2) | 2 | NO | runtime | **blocker** | Active in production (rollbar, winston). Fix = bump override to 4.18.1. |
| minimatch (3) | 3 | NO | runtime (via misclassified jshint) | **blocker** | Active per `npm audit` AND prod image (jshint is in deps not devDeps; image build keeps it). Fix = bump override to 5.1.9. |
| serialize-javascript (2) | 2 | NO | development | **deferred-dev-only** | mocha is devDeps; `npm install --omit=dev` strips from prod image. Rationale class: "dev-only scope, no production exploit surface". |
| uuid (2: 1 dev + 1 runtime) | 1 dev + 1 runtime | runtime IS stale (live=14.0.0 ≥ patched 13.0.1); dev NOT stale (live=8.3.2 from nyc) | dev / runtime mixed | runtime alert = **deferred-stale**; dev alert = **deferred-dev-only** | One alert each. |
| ws (1) | 1 | NO | runtime | **blocker** | Active in production (socket.io builder ⇄ worker chain). Fix = ADD override `ws: 8.20.1`. |

### Summary

| Verdict class | Count | Action by Phase 4 |
|---------------|-------|-------------------|
| **v1-blocker (fix this phase)** | 7 (3 high lodash+minimatch+follow-redirects; 1 medium ws; 1 medium follow-redirects already counted; treat as 4 unique fixes) | Override edits → CI green → deploy via Swarmpit autoredeploy |
| **deferred-stale** (auto-resolves after `npm install`) | 19 (15 axios + 2 fast-uri + 1 ip-address + 1 uuid-runtime) | Regenerate lockfile, push, wait for Dependabot rescan, manually dismiss any stragglers on UI |
| **deferred-dev-only** (production image excludes) | 3 (2 serialize-javascript + 1 uuid-dev) | Document rationale + trigger "if mocha or nyc moves into runtime path" |
| **TOTAL** | 29 | — |

**No alerts collide with the chai-http v4 lock** in this triage (verified — none of the affected packages appear in the chai-http → superagent v3 chain). The lock remains relevant as a *trigger* for v1.x-deferred items but does not constrain this phase.

The 4 unique override-block edits resolve **all 7 of the active v1-blocker alerts** in a single coordinated change.

## Override side-effects (per blocker)

Risk analysis for each of the 4 override changes. Run order matters because the lockfile resolves them together.

### Edit 1: REMOVE `"follow-redirects": "1.15.6"` (line 115)

| Aspect | Detail |
|--------|--------|
| What changes in lockfile | `follow-redirects` resolves from `1.15.6` → `1.16.0` (or newer minor on `^1.16.0`) |
| Code paths exercised | axios calls in `lib/thinx/oauth-github.js` (GitHub OAuth callback), `lib/thinx/owner.js` (Mailgun email send via mailgun.js), all CouchDB I/O via `nano` |
| API risk | LOW. 1.15→1.16 is a minor bump on a focused redirect library. Changelog (1.16.0 release) only adds the security fix — no API surface changes. |
| Runtime risk | LOW. Production code uses axios's high-level API; doesn't directly touch follow-redirects. |
| Test risk | LOW. ZZ-* specs don't exercise live HTTP redirects (they call `chai.request(thx.app)` which routes locally). |
| Verification | Confirm `node_modules/follow-redirects/package.json` shows `1.16.0+` after `npm install`. Run `npm ls follow-redirects` — should show single resolved version, multiple parents. |

### Edit 2: CHANGE `"lodash": "4.17.23"` → `"lodash": "4.18.1"` (line 122)

| Aspect | Detail |
|--------|--------|
| What changes | All 4 lodash instances in lockfile move from `4.17.23` → `4.18.1` |
| Code paths exercised | rollbar (production error tracking, called from `lib/thinx/globals.js:127-134`), winston (every log emission via `lib/thinx/logger.js`), async (control flow in rollbar/winston/fs-finder), jshint (lint runtime) |
| API risk | LOW-MEDIUM. lodash 4.18.0 release notes (cross-checked at the GHSA page): two changes — (1) validates `_.template` import key names, (2) replaces `assignInWith` with `assignWith` in prototype protection. **`_.template` and `_.unset` are the affected functions.** Codebase usage check: `grep -r '_.template\|_.unset' lib/ thinx-core.js` returns no hits — the project doesn't call the vulnerable APIs directly. Transitive consumers (rollbar, winston) use lodash for `_.merge`, `_.get`, `_.cloneDeep` style helpers — unaffected by these changes. |
| Runtime risk | LOW. rollbar 2.26.5 is API-stable against lodash 4.x; winston 3.x same. |
| Test risk | LOW-MEDIUM. Run `npm test` (jasmine suite) post-bump. If any test indirectly exercises `_.template`, it would fail — but no usage found. |
| Verification | `npm ls lodash` should show all instances at 4.18.1. CI green. |

### Edit 3: CHANGE `"minimatch": "5.1.0"` → `"minimatch": "5.1.9"` (line 124)

| Aspect | Detail |
|--------|--------|
| What changes | minimatch in jshint chain bumps `5.1.0` → `5.1.9` (latest 5.x) |
| Code paths exercised | jshint's CLI glob matching only. **No `lib/` or `thinx-core.js` code uses minimatch directly.** Glob (11.1.0, also pinned) uses minimatch for path expansion at jshint load time. |
| API risk | NONE. 5.1.0 → 5.1.9 is patch-series within same minor. No API surface changes. |
| Runtime risk | NONE. jshint runs at lint time only, not at API request time. |
| Test risk | NONE. Tests don't invoke jshint. |
| Verification | `npm ls minimatch` should show 5.1.9 in the jshint chain. No CI signal expected to change. |

### Edit 4: ADD new override `"ws": "8.20.1"`

| Aspect | Detail |
|--------|--------|
| What changes | `engine.io@6.6.4 > ws@8.17.1` and `engine.io-client@6.6.3 > ws@8.17.1` and `socket.io-adapter@2.5.5 > ws@8.17.1` all move to `8.20.1`. Top-level `ws@8.20.1` is unchanged. |
| Code paths exercised | `lib/thinx/queue.js:8` socket.io-client (builder outbound), `lib/thinx/queue.js:94` socket.io server (port 4000 builder ⇄ worker channel). Also `thinx-core.js:252, 436-487` direct ws WebSocket upgrade handler. |
| API risk | LOW. ws 8.17→8.20 is patch+feature series. engine.io documented to work against `ws@>=8.0.0` (the `~8.17.1` is conservative tilde, not a hard upper bound on the protocol). |
| Runtime risk | LOW-MEDIUM. socket.io's builder ⇄ worker channel is the production-exercised path. **Test by deploying to staging and confirming a build job can submit + run via the socket.io channel.** This is the highest-risk override in this set because it overrides a peer-locked transitive. |
| Test risk | LOW. Existing ZZ-* specs don't exercise socket.io's worker path (worker integration tests are out-of-band). |
| Verification | `npm ls ws` should show all instances at 8.20.1. Production smoke test: trigger a CircleCI build (no-op commit) and confirm the build worker (services/worker) successfully picks it up via the socket.io channel. |

### Combined-edit risk

All 4 edits together regenerate the lockfile. The risk surface is small because:
1. Three of the four edits (`follow-redirects`, `lodash`, `minimatch`) involve packages that are either not directly used by `lib/` or are touched only by transitives that themselves are API-stable.
2. The fourth edit (`ws`) is the only one that touches a runtime hot-path (socket.io). It has the highest verification cost.

Recommended verification order:
1. Local: `npm install` regenerates lockfile. Confirm by reading lockfile entries for all 4 packages.
2. Local: `npm test` (jasmine suite, 17 ZZ-* + non-ZZ specs).
3. Local: `npm audit --json` baseline capture.
4. Push to thinx-staging → CircleCI green → swarmpit_app autoredeploys (Phase 3 fix is live).
5. Production smoke: `curl -X POST https://rtm.thinx.cloud/api/v2/password/reset` 200 (Phase 1 contract), `curl -i https://rtm.thinx.cloud/api/v2/health` if it exists, manual socket.io build test if worker is reachable.

## dep-triage.md proposed schema

The roadmap (`ROADMAP.md` line 78) specifies the columns: `package, severity, direct/transitive, verdict, rationale, future trigger`. Expand this into a two-section document.

### Section 1: Triage table (one row per Dependabot alert)

| Column | Type | Source |
|--------|------|--------|
| `Alert URL` | URL | `gh api ... .html_url` (e.g., `.../security/dependabot/176`) |
| `Package` | string | `dependency.package.name` |
| `GHSA ID` | string | `security_advisory.ghsa_id` |
| `Severity` | enum {high, medium, low} | `security_advisory.severity` |
| `Scope` | enum {runtime, development} | `dependency.scope` |
| `Direct/Transitive` | string | "direct" if package appears in `package.json` `dependencies`/`devDependencies`; otherwise the immediate parent (e.g., `via jshint`, `via socket.io`) |
| `Vuln range / installed` | string | e.g., `<1.15.1 / installed: 1.16.1` |
| `Verdict` | enum {blocker, deferred-stale, deferred-dev-only, deferred-locked, deferred-cost, deferred-low-sev} | this research |
| `Rationale` | freeform short | mapped to a fixed taxonomy (see below) |
| `Future trigger` | freeform | when (if ever) to revisit; required for all `deferred-*` rows |

### Section 2: Fix log (chronological)

A separate table capturing what was actually changed. Schema:

| Column | Detail |
|--------|--------|
| `Commit SHA` | git short SHA of the change |
| `Files changed` | `package.json`, `package-lock.json`, etc. |
| `Override delta` | e.g., `-follow-redirects: 1.15.6`, `+lodash: 4.18.1`, `+ws: 8.20.1` |
| `Alerts closed` | list of GHSA IDs that the change resolves |
| `Verification` | brief — "CI green on $shortSha; rtm `Bearer null` 200" etc. |

### Section 3: Post-fix baseline

Capture the `npm audit` and Dependabot state after Phase 4 closes — so future Dependabot waves have a known diff target.

| Field | Value |
|-------|-------|
| `Baseline taken at` | datetime + commit SHA |
| `npm audit --json` totals | high/moderate/low counts |
| `npm audit --omit=dev totals` | same for runtime tree |
| `Dependabot open count` | from `gh api`, also broken by severity |
| `Deferred alerts (open by design)` | list of GHSA IDs that remain open with rationale class |

Include the full `npm audit --json` output as a fenced code block (or as an attached artifact `04-AUDIT-BASELINE.json` referenced from the table — the markdown becomes unwieldy with full JSON inline).

### Rationale taxonomy (closed set)

Every `deferred-*` row's `Rationale` field maps to one of these classes:

| Class | Definition | Example |
|-------|------------|---------|
| `dev-only-scope` | Package is in `devDependencies` AND production Docker image is built with `npm install --omit=dev`. No production exploit surface. | serialize-javascript via mocha |
| `stale-alert` | Live `package-lock.json` resolves to a version beyond the alert's `vulnerable_version_range`. Alert will auto-dismiss after next Dependabot scan; may be manually dismissed via UI. | All 15 axios alerts |
| `chai-http-lock` | Fix would require bumping chai-http to v5 (ESM-only); blocked per AGENTS.md L82-92. **Not triggered by any alert in 2026-05-26 triage**, but reserved for future. | TEST-CHAI-01 trigger |
| `transitive-uncontrollable` | Vulnerable transitive cannot be overridden without breaking the parent (e.g., parent has hard peer dep on vulnerable range). Rare. | (none in current set) |
| `low-severity-high-cost` | Low or medium severity AND fix cost would be HIGH (lib/ changes or major-version bumps). | (none in current set) |
| `mitigated-by-config` | Vulnerable surface is gated by configuration not enabled in production (e.g., a feature flag is off). Requires explicit documented config check. | (none in current set) |

Every `deferred-*` row MUST list one of these classes in its Rationale field. No freeform rationale.

### Future trigger column

Required for every deferred row. Examples:
- `stale-alert` → "Dependabot rescan after `npm install` regeneration; manual UI dismissal if not auto-cleared within 7 days"
- `dev-only-scope` → "If mocha or nyc usage moves into a runtime code path (e.g., embedded test runner)"
- `chai-http-lock` → "When a Snyk/Dependabot CVE lands in `superagent` v3, forcing the migration described in AGENTS.md L82-92"

## Verification baseline specification

The post-fix baseline is the deliverable's metric of success. Capture three artifacts:

### 1. `npm audit --json` (full tree)

```bash
npm audit --json > .planning/phases/04-dependency-triage/04-AUDIT-BASELINE.json
```

Truncated summary inline in `dep-triage.md` (just `.metadata.vulnerabilities` totals); full JSON as an attached artifact.

### 2. `npm audit --omit=dev --json` (runtime tree)

```bash
npm audit --omit=dev --json > .planning/phases/04-dependency-triage/04-AUDIT-BASELINE-PROD.json
```

This is the **primary** baseline metric. Runtime tree = production exposure. The success criterion is "zero unaddressed high-severity in runtime tree", measured here.

### 3. Live Dependabot snapshot

```bash
gh api 'repos/suculent/thinx-device-api/dependabot/alerts?state=open&per_page=100' > .planning/phases/04-dependency-triage/04-DEPENDABOT-OPEN.json
```

Taken **after** push + Dependabot rescan (allow 24h, or check via UI). This is the GitHub Security tab's count — the user-visible deliverable.

### 4. `snyk test --json` (optional — already captured)

`research-data/snyk-test.json` is the pre-fix Snyk baseline. Capture a post-fix one for archival:

```bash
snyk test --json > .planning/phases/04-dependency-triage/04-SNYK-POST.json
```

Helpful for diff against pre-fix; not strictly required by roadmap.

### What goes inline in `dep-triage.md`

| Content | Format |
|---------|--------|
| Triage table (all 29 alerts) | Markdown table, inline |
| Fix log (commits + delta) | Markdown table, inline |
| Baseline summary (audit totals + dependabot count) | Markdown table, inline; JSON files referenced as artifacts |
| Rationale taxonomy reference | Markdown definition list, inline |

### Container scanning: out-of-scope for this phase

`snyk container test thinxcloud/base:alpine` would scan the OS layer (Alpine APK packages). Recommendation: **defer**. Reasons:
1. The base image is owned by `thinxcloud/base` (a separate repo). OS-layer CVEs belong to that repo's triage, not this one.
2. SEC-DEP-01 is explicitly about "GitHub Dependabot findings against `suculent/thinx-device-api`" — the deliverable is scoped to npm advisories on this repo.
3. Adding container scanning expands scope; introduces new artifact maintenance.

File container scanning as a **v1.x candidate** (new ID like `SEC-DEP-02`) with rationale "OS-layer CVE coverage for the deployed Alpine base image". Trigger to act: a CISA KEV listing for an Alpine APK package present in `thinxcloud/base`.

## `npm install` regeneration — free-fix pass

A critical insight: running `npm install` on the current package.json (with package-lock.json removed or updated) will resolve some currently-stale Dependabot alerts naturally — because:

1. `package.json` already declares `axios: ^1.16.0` (resolves to 1.16.1, past all axios advisories).
2. `package.json` already declares `uuid: ^14.0.0` (past the runtime uuid advisory).
3. The lockfile reflects this — `node_modules/axios: 1.16.1` is what's actually installed.
4. But the live Dependabot alerts on GitHub still reference the lockfile state at the time the alert was created (April-May 2026). Many of these were never closed because GitHub's Dependabot scanner sees the lockfile content and doesn't always reconcile against current package.json declarations until a new lockfile is committed.

**Operationally:** the act of committing a regenerated `package-lock.json` (even without touching `package.json`) likely auto-dismisses some stale alerts on Dependabot's next scan. The override edits address the *active* alerts; the lockfile regeneration addresses the *stale* alerts.

Don't run `npm install` blindly mid-phase — it could change unrelated transitive versions and complicate the diff. Recommended order:
1. Make the 4 override edits in `package.json`.
2. Run `npm install` ONCE to regenerate `package-lock.json` against the new overrides.
3. Commit `package.json` + `package-lock.json` together.
4. Don't `npm install` again until the phase is closing — let the single regeneration do all the work.

This is the "single coordinated lockfile change" that the planner should structure the phase around.

## MVP-mode vertical slice fit

The init context proposes a 3-slice decomposition. **Revised recommendation:**

| Slice | Goal | Outputs | Verifiability |
|-------|------|---------|---------------|
| **1. Baseline + triage table** | Establish pre-fix state; classify all 29 alerts | `04-AUDIT-PRE.json` (full + omit-dev); `dep-triage.md` triage table populated; `04-DEPENDABOT-PRE.json` snapshot. **No code or package.json changes.** | Operator reviews verdict column; signs off before Slice 2 |
| **2. Blocker fixes (4 override edits)** | Single coordinated `package.json` + `package-lock.json` change | git commit: `chore(deps): SEC-DEP-01 - resolve 7 active alerts via overrides` with delta `-follow-redirects, +lodash@4.18.1, +minimatch@5.1.9, +ws: 8.20.1` | `npm audit --omit=dev` runtime high count drops to 0; CI green on push; rtm 200 post-deploy on Phase 1 contract |
| **3. Baseline post-fix + close-out** | Capture post-fix metrics; document deferred rationale; STATE/ROADMAP/REQUIREMENTS bookkeeping | `04-AUDIT-POST.json`; `04-DEPENDABOT-POST.json` (after Dependabot rescan, may take up to 24h); `dep-triage.md` fix log + post-fix baseline; `04-SUMMARY.md` close-out | Roadmap Success Criteria 1-4 all PASS; Dependabot Security tab high-severity count = 0 unaddressed |

**Refinements over the init-proposed split:**

1. The init says "Slice 1 = baseline + dep-triage table + npm install free-fix pass". I recommend **skipping the standalone `npm install` pass in Slice 1** — instead bundle the lockfile regeneration with the override edits in Slice 2. This avoids two separate lockfile commits and keeps the diff readable.

2. Slice 2 is **one atomic commit** (not multiple). All 4 override changes ship together because they all reduce to a single `npm install` outcome.

3. Slice 3 has a temporal dependency: Dependabot's GitHub UI count may take up to 24h to rescan after a push. Plan for an asynchronous verification window — the operator may need to manually dismiss stale axios alerts via the GitHub UI to bring the count to 0 visually within the phase window.

**Why no Slice 4:** Container scanning, dev-dep classification cleanup (jshint, fs-finder), and v1.x hygiene items are explicitly out-of-scope. Filing them as v1.x backlog (new IDs in REQUIREMENTS.md) is a single bullet, not a slice.

## CI risk signals to monitor

When the Slice 2 commit lands on `thinx-staging`, watch for:

| Signal | Where | Healthy | Red flag | Mitigation |
|--------|-------|---------|----------|------------|
| **CircleCI build status** | CircleCI UI for `thinx-device-api` | green within ~15 min | red on test step | Inspect failing spec; revert override edit; isolate the breaking package |
| **Jasmine specs total** | CircleCI test log | All ZZ-* + non-ZZ pass | Any ZZ-* fail | If `ZZ-AppSessionUserSpec.js` or `ZZ-RouterPasswordResetSpec.js` fail → Phase 1/2 contract regression → immediate revert |
| **`socket.io`-touching specs** | CircleCI test log | unchanged behavior | New failures around builder/worker integration | ws override broke socket.io compat — pin ws to a tighter version (e.g., 8.18.x) and retry |
| **CircleCI image build** | docker hub `thinxcloud/api` digest | new digest within ~5 min of CI green | image build fails (rare — `npm install --omit=dev` should succeed) | Check `Dockerfile` line 86 output in CircleCI log |
| **Swarmpit autoredeploy** | `https://swarmpit.thinx.cloud/#/tasks` | thinx_api task rolls within ~60-120s of new digest | autoredeploy doesn't fire | Phase 3's Rung 1 recovery: `ssh ... "docker service update --force swarmpit_app"` |
| **rtm.thinx.cloud health** | `curl -i https://rtm.thinx.cloud/api/v2/spec` | 200 + new image SHA in response header | 502 or boot loop | Rollback: `docker service rollback thinx_api`; revert commit on `thinx-staging` |
| **Phase 1 contract** | `curl -X POST https://rtm.thinx.cloud/api/v2/password/reset -d '{"email":"x@y"}' -H 'Authorization: Bearer null'` | 200 with standard success body | 403 or different body shape | Override edit broke an axios redirect path used in OAuth — investigate follow-redirects bump |
| **Phase 2 contract** | rtm container logs | No raw emails / reset_keys / tokens | redactor output regressed | Unlikely — Phase 4 doesn't touch `lib/thinx/owner.js`. If it happens, it's a transitive winston/rollbar bump side-effect |
| **Dependabot rescan** | `gh api repos/suculent/thinx-device-api/dependabot/alerts?state=open` | Count drops within 24h | No change | Manual UI dismissal of stale alerts (axios, fast-uri, ip-address, uuid-runtime) — Dependabot allows "Dismiss" with reason "fixed in newer version" |

The Phase 3 fix (swarm auto-pull restored 2026-05-26) is now load-bearing for Phase 4 verification. If swarmpit_app degrades again mid-phase, the `./restart.sh` escape hatch remains operational.

## Anti-patterns to avoid

| Anti-pattern | Why it's wrong | What to do instead |
|--------------|----------------|--------------------|
| `npm audit fix --force` | Will auto-bump majors, likely break the chai-http v4 lock, and rewrite half the lockfile. **Forbidden.** | Surgical override edits in `package.json` + a single `npm install`. |
| Blanket-override `superagent` to v9 | Would break chai-http v4 (it depends on superagent v3's API). Chain reaction → migrate 16 ZZ-* spec files (out of scope per AGENTS.md). | Leave superagent untouched. No 2026-05-26 alert references superagent directly. |
| Bumping `chai-http` to v5 | ESM-only; removes `chai.request(app)`; requires 216 call-site renames + spec file ESM migration. **Explicit AGENTS.md lock.** | Defer. Trigger: a Snyk/Dependabot CVE in `superagent` v3 (not currently present). |
| Running `snyk wizard` | Interactive tool. Will suggest mass edits not aligned with the override-block strategy. Not suitable for an automated phase. | `snyk test --json` only (read-only verification). |
| Pruning unrelated entries from the `overrides` block | The 38 existing pins are legacy from prior triage waves. Pruning them = re-resolving unrelated transitives = unknown blast radius. | Touch only the 4 relevant lines (1 remove + 2 edits + 1 add). Defer block hygiene to a v1.x exercise. |
| Restructuring `jshint`/`fs-finder` from dependencies to devDependencies in this phase | Would change which packages survive the `npm install --omit=dev` step in Dockerfile L86, changing production image contents. Out of scope and risky. | File as v1.x backlog item with rationale "misclassified runtime deps — should be devDeps; deferred to avoid prod-image surface change in v1 GA closing phase". |
| Touching `services/console/` for any reason | Sibling GSD project with its own dependency tree. Not part of this repo's Dependabot alerts. | Untouched. If a console-side Dependabot finding exists, it lives in `services/console/.planning/`. |
| Running `npm install` ad-hoc mid-phase to check things | Could change unrelated transitives mid-flight, complicating the final commit's diff. | Run `npm install` exactly twice: once after override edits (Slice 2), once during close-out baseline capture (Slice 3) if needed. |
| Bumping the `axios` direct dep further (e.g., to ^1.16.1) | Unnecessary churn — `^1.16.0` already resolves to 1.16.1, satisfies all 15 axios alerts. | Leave `axios: ^1.16.0` alone. The fix for axios alerts is *not editing axios* — it's regenerating the lockfile so Dependabot sees the already-safe install. |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-DEP-01 | Classify all open Dependabot findings as v1-blocker or v1.x-deferred; ship blocker fixes; capture post-fix `npm audit` baseline in `.planning/dep-triage.md` | This research provides: (a) the live alert enumeration with stale-vs-active classification, (b) the 4 surgical override edits that resolve 7 active alerts, (c) the dep-triage.md schema, (d) the post-fix baseline command set, (e) the deferred-rationale taxonomy |

## Project Constraints (from AGENTS.md and CONCERNS.md)

`AGENTS.md` is gitignored (per Phase 3 close-out) but documents project-wide constraints:

- **chai-http v4 lock** (AGENTS.md L82-92, STACK.md L73): hold at `^4.3.0`. No transitive in this triage is in the chai-http chain. Lock is informational here, not action-blocking.
- **chai pinned at 4.5.0** (STACK.md L154): same lock context as chai-http.
- **Deployment flow**: push `services/console` first, then parent submodule pointer. **Phase 4 doesn't touch `services/console`** — only the parent push is needed.
- **Swarm autoredeploy is operational** (Phase 3 close-out 2026-05-26). Phase 4 verifies on rtm without manual `./restart.sh`.
- **38 existing overrides** (CONCERNS.md "Suspicious overrides block"): treat as quarterly review; this phase touches only the 4 directly relevant entries.

From CONCERNS.md "Dependency Risks":
- `chai-http`, `chai`, `moment-timezone` 0.6.0, `path 0.12.7`, `querystring`, `mkdirp 1.0.3`, the 38-pin overrides block — all flagged as v1.x deferred / ongoing. **None of these are in the active Dependabot alert set for 2026-05-26**, so Phase 4 doesn't engage with them.

## Open questions for the planner

1. **Dependabot rescan window.** GitHub's documentation says Dependabot rescans on push, but the actual latency varies. Should Slice 3 close-out *block* on the Dependabot UI count reaching 0, or accept "all blocker fixes landed + audit baseline captured" as success even if stale UI count is non-zero? Recommendation: latter — operator may manually dismiss stragglers via UI as a 30-second close-out task.

2. **Manual dismissal versus auto-resolution.** For the 19 stale alerts (15 axios + 2 fast-uri + 1 ip-address + 1 uuid-runtime), Dependabot may not auto-dismiss in all cases (it depends on the per-CVE manifest-path heuristic). Should the planner include a checkpoint task for the operator to walk the Security tab and manually dismiss with reason "fixed in newer version"? Recommendation: yes — a `checkpoint:human-verify` task is appropriate.

3. **Should the dev-dep misclassification (jshint, fs-finder) be filed as a new v1.x ID?** A clean record would be useful. Recommended ID: `REFACTOR-05`. Rationale: misclassified runtime deps; production image carries jshint+fs-finder unnecessarily; cleanup is a deps-tree rework, not v1 GA-scope.

4. **Snyk's omission of `serialize-javascript`.** Snyk doesn't surface it but `npm audit` does. Likely Snyk treats it as dev-only via mocha and elides. The planner can rely on `npm audit` for dev-tree completeness.

5. **`ws@8.20.1` vs `ws@8.21.0`.** Latest is 8.21.0; init context pins to 8.20.1. Either is safe (both > 8.20.0 patched line). Use `8.20.1` to match the existing `package.json` direct dep declaration — keeps top-level + override identical for clarity.

6. **Auto-redeploy of the worker.** Phase 3 SUMMARY notes `thinx_worker` has a malformed image tag (OPS-03) — its autoredeploy is broken. If the `ws` override changes worker behavior, the worker would need a *manual* re-deploy. Recommendation: post-deploy verification should explicitly check `services/worker` build path still works. If worker is reachable but autoredeploy is broken, defer worker bump to whenever OPS-03 is fixed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `lodash@4.18.0+` is API-stable for codebase consumers (rollbar, winston, async) | Override side-effects | LOW — codebase doesn't use `_.template` or `_.unset` directly per `grep -r`. Wrong = CI fails on a winston/rollbar transitive call; revert override edit. |
| A2 | `ws@8.20.1` is wire-protocol-compatible with engine.io@6.6.4's `~8.17.1` declaration | Override side-effects | LOW-MEDIUM — ws 8.x patch series is intentionally backward-compatible. Wrong = socket.io builder ⇄ worker channel breaks; revert override; pin to ws 8.18.x or 8.19.x. |
| A3 | Dependabot will auto-dismiss stale axios alerts within ~24h of lockfile push | Free-fix pass | LOW — manual UI dismissal is a 30-second fallback. Wrong = phase closes with non-zero Dependabot UI count; operator dismisses manually; success criterion is met. |
| A4 | The chai-http v4 → superagent v3 chain has no active Dependabot alerts as of 2026-05-26 | Decision rule preclassification | VERIFIED via `gh api` enumeration — no `superagent` or `chai-http` in the alert list. Re-verify before phase opens. |
| A5 | `npm install --omit=dev` (Dockerfile:86) strips `serialize-javascript` (via mocha) and dev `uuid@8.3.2` (via nyc) from the production image | Dev-only scope verdict | LOW — `mocha` and `nyc` are in `devDependencies` per package.json L153-154. Verify by inspecting the deployed image: `docker exec ... find /opt/thinx/thinx-device-api/node_modules/serialize-javascript`. |
| A6 | `jshint@2.13.6` and `fs-finder` (in `dependencies` block) ship in the production image | Lodash/minimatch blocker classification | HIGH for verdict, LOW operationally — confirmed by lockfile + Dockerfile semantics. The override fixes ship to production regardless. Wrong = the blocker verdict was over-strong; both packages could have been deferred-dev-only. Doesn't change the fix path. |
| A7 | The init-context-quoted 27 alerts ("11 high + 15 medium + 1 low") is stale; live count is 29 ("11 high + 17 medium + 1 low") | Source reconciliation | VERIFIED — `gh api` returned 29 today (2026-05-26). Plan should use 29. |
| A8 | Removing the `follow-redirects: "1.15.6"` override line (versus editing to `1.16.0`) is the cleaner fix | Override hygiene | LOW — both achieve the same outcome on next install. Removing is preferred because it lets future axios updates pull whatever follow-redirects axios declares (no future maintenance). |

## Sources

### Primary (HIGH confidence)
- **Live Dependabot enumeration** — `gh api repos/suculent/thinx-device-api/dependabot/alerts?state=open&per_page=100` (29 alerts; per-package severity + scope + vuln_range + html_url breakdown captured)
- **Live npm registry** — `npm view <pkg> version` and `npm view <pkg> versions` for axios, lodash, minimatch, follow-redirects, ws, uuid, fast-uri, ip-address, serialize-javascript (all confirmed)
- **Live npm registry, deep** — `npm view axios@1.16.1 dependencies` → `follow-redirects: ^1.16.0`; `npm view engine.io@6.6.4 dependencies` → `ws: ~8.17.1`; `npm view engine.io-client@6.6.3 dependencies` → `ws: ~8.17.1` (proves the override mechanism is required)
- **Live `npm audit --json`** (full and `--omit=dev`) at the current `thinx-staging` HEAD — totals 34 (23H+11M) full tree, 15 (9H+6M) runtime-only tree
- **Live `package-lock.json`** — installed versions confirmed: axios 1.16.1, follow-redirects 1.15.6, lodash 4.17.23, minimatch 5.1.0, ws 8.20.1 (top) / 8.17.1 (nested), uuid 14.0.0 (top) / 8.3.2 (nested in nyc), serialize-javascript 6.0.2, fast-uri 3.1.2, ip-address 10.2.0
- **GitHub Advisory Database** — direct fetches of GHSA-5c6j-r48x-rmvq (serialize-javascript), GHSA-r4q5-vmmm-2653 (follow-redirects), GHSA-r5fr-rjxr-66jc (lodash), GHSA-pf86-5x62-jrwf (axios) — vuln ranges and patched versions verified

### Secondary (MEDIUM confidence)
- **Snyk test JSON** (`research-data/snyk-test.json` and `snyk-test-prod.json`) — captured 2026-05-26; cross-checked against npm audit
- **AGENTS.md** (gitignored, local-only — but documented in Phase 3 SUMMARY) — chai-http v4 lock, deployment flow
- **`.planning/codebase/STACK.md` / CONCERNS.md** — dependency lock list, override-block context

### Tertiary (LOW confidence)
- None. All claims in this research are tagged with a primary source.

## Metadata

**Confidence breakdown:**
- Live Dependabot enumeration: HIGH — direct `gh api` output
- npm registry version data: HIGH — `npm view` is the registry source of truth
- GHSA vulnerability ranges: HIGH — direct fetches
- Stale-vs-active classification: HIGH — derived from lockfile + GHSA ranges
- Override-edit risk assessment: MEDIUM — based on changelog summaries and transitive consumer review; verified at the API-surface level but not exhaustively tested against this codebase yet (planner's Slice 2 verification will resolve)
- MVP-mode slice decomposition: MEDIUM — judgment call based on Phase 1-3 patterns in this project

**Research date:** 2026-05-26
**Valid until:** 2026-06-26 (30 days for dependency landscape; Dependabot alerts may grow as new CVEs are published. Re-run `gh api` enumeration if delayed past mid-June)

## RESEARCH COMPLETE
