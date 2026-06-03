# Cross-Project Dependency Coordination Runbook

Operator-facing runbook for coordinating Dependabot-alert triage between `thinx-device-api` (the parent monorepo) and a sibling submodule project (e.g., `services/console`; future candidates `services/worker`, `services/transformer`).

**Audience:** the GSD-driving operator (the developer running `/gsd:plan-phase` and `/gsd:execute-phase` against this repo or a sibling GSD workspace).

**When to use:** any time Dependabot surfaces an alert on a sibling project whose remediation requires either a planning-doc edit in that submodule's GSD workspace OR a coordinated pointer bump in this parent repo (`thinx-device-api`).

**First codified by:** Phase 10 of v1.9 (SEC-DEP-02) — see `.planning/ROADMAP.md` Phase 10 entry and `.planning/phases/10-cross-project-dependency-coordination-services-console/`. The Phase 10 worked example (2 high-severity grunt alerts on `thinx-cloud/console`, both vendored-asset-only) runs through this runbook end-to-end and is referenced throughout each section.

---

## 1. When to use this pattern

Triggers — invoke this runbook when any of the following apply:

- A Dependabot alert lands on a sibling submodule project (e.g., `services/console`, `services/worker`, `services/transformer`) AND the operator wants to record the classification verdict in the parent's `.planning/dep-triage.md` (the canonical durable triage home for the parent project's planning workspace).
- The remediation work for the alert lives in the sibling project's GSD workspace (each submodule has its own `.planning/` tree) but the SCHEDULING + verdict ROLL-UP belongs in the parent so cross-project posture is visible from one place.
- A submodule pointer bump in `thinx-device-api` would otherwise be needed to "capture" the sibling project's resolution commit — and the operator wants that pointer bump to land atomically with a clear paper trail.
- The operator wants the verdict for sibling-project alerts visible from a single canonical location (parent `dep-triage.md`) so audit / compliance review does not have to chase across multiple GSD workspaces.

Anti-patterns — when NOT to use this runbook:

- **The sibling project is unmanaged (no `.planning/` tree).** Do the triage entirely in `.planning/dep-triage.md` of the parent; no cross-repo coordination is needed because there is no sibling GSD workspace to coordinate with. Use the Phase 4 SEC-DEP-01 pattern as the template.
- **The vulnerability lives in this parent repo's own dependency tree (not the sibling's).** Use the Phase 4 SEC-DEP-01 pattern in `.planning/dep-triage.md` directly — no submodule edit / pointer bump is involved.
- **The alert is a duplicate of a Phase 4 row already triaged in the parent.** Reference the existing row; do NOT re-classify the sibling-project alert under a fresh verdict if the parent already has the canonical classification.

---

## 2. `gh api` recipe for Dependabot inventory

Concrete bash recipes (copy-paste ready):

```bash
# Substitute <owner>/<repo> for the sibling project's slug.
# Example used by Phase 10 / SEC-DEP-02 (2026-06-03):
gh api 'repos/thinx-cloud/console/dependabot/alerts?state=open&severity=high' \
  --jq '.[] | {number, package: .security_vulnerability.package.name, severity: .security_vulnerability.severity, ghsa: .security_advisory.ghsa_id, manifest: .dependency.manifest_path, scope: .dependency.scope, relationship: .dependency.relationship, vuln_range: .security_vulnerability.vulnerable_version_range}'

# To enumerate ALL open alerts (all severities), drop the severity filter:
gh api 'repos/<owner>/<repo>/dependabot/alerts?state=open' \
  --jq '.[] | {number, package: .security_vulnerability.package.name, severity: .security_vulnerability.severity, ghsa: .security_advisory.ghsa_id, manifest: .dependency.manifest_path, scope: .dependency.scope}'

# To list dismissed alerts (context on past decisions):
gh api 'repos/<owner>/<repo>/dependabot/alerts?state=dismissed' \
  --jq '.[] | {number, dismissed_reason, dismissed_comment, package: .security_vulnerability.package.name}'

# Higher page size — Dependabot paginates by default at 30; the API maxes at 100 per page:
gh api 'repos/<owner>/<repo>/dependabot/alerts?state=open&severity=high&per_page=100'
```

**Authentication prerequisites:**
- `gh auth status` must report active login.
- Token scopes required: `repo` + `security_events`.
- For sibling repos the operator does NOT own, the token additionally needs org membership or explicit collaborator access on the sibling repo (e.g., `thinx-cloud` org membership for `thinx-cloud/console`).
- Failure mode for missing scope: `HTTP 401 Bad credentials` or `HTTP 403 Resource not accessible by integration`. No privilege elevation — just a failed enumeration. Run `gh auth refresh -s security_events` to add the scope.

**Worked example output** (from 2026-06-03 Phase 10 run against `thinx-cloud/console`):

```
{"number": 54, "package": "grunt", "severity": "high", "ghsa": "GHSA-rm36-94g8-835r", "manifest": "src/assets/global/plugins/jquery-validation-1.19.5/package.json", "scope": "development", "relationship": "direct", "vuln_range": "< 1.5.3"}
{"number": 52, "package": "grunt", "severity": "high", "ghsa": "GHSA-m5pj-vjjf-4m3h", "manifest": "src/assets/global/plugins/jquery-validation-1.19.5/package.json", "scope": "development", "relationship": "direct", "vuln_range": "< 1.3.0"}
```

Two alerts returned — both `grunt`, both at the SAME vendored manifest path (`src/assets/global/plugins/jquery-validation-1.19.5/package.json`), both `development` scope, both `direct` relationship. The shared manifest path is the key fingerprint for the `deferred-vendored-asset` classification (see Section 3).

---

## 3. Classification verdict glossary

This runbook is self-contained — the full closed sets below are reproduced from `.planning/dep-triage.md` § "Rationale taxonomy" + § "Verdict enum" so the operator does not need to context-switch when classifying a new alert.

### Rationale taxonomy (closed set)

- **`dev-only-scope`** — Package is in `devDependencies` AND production Docker image is built with `npm install --omit=dev` (e.g., parent project Dockerfile L86). No production exploit surface. **Future trigger to re-classify:** if mocha/nyc/jest-junit/etc. usage moves into a runtime code path in the production build.
- **`stale-alert`** — Live `package-lock.json` resolves to a version BEYOND the alert's `vulnerable_version_range`. Alert will auto-dismiss on next Dependabot scan; may be manually dismissed via the UI with reason "Fixed in newer version". **Future trigger to re-classify:** if Dependabot fails to auto-dismiss within ~7 days (operator manually dismisses via UI).
- **`chai-http-lock`** — Fix would require bumping `chai-http` to v5 (ESM-only); blocked per parent `AGENTS.md` L82-92. Reserved class for future use. **Future trigger to re-classify:** if/when the parent project migrates the test suite to ESM, the lock is lifted and the class is no longer applicable.
- **`transitive-uncontrollable`** — Vulnerable transitive cannot be overridden without breaking the parent (e.g., parent has hard peer dep on vulnerable range). Rare. **Future trigger to re-classify:** if the parent package publishes a non-vulnerable peer-dep range OR is itself replaced by an alternative.
- **`low-severity-high-cost`** — Low or medium severity AND fix cost would be HIGH (lib/ changes or major-version bumps). **Future trigger to re-classify:** if severity is later upgraded (CVSS re-scoring) OR if the cost falls because an upstream patch lands.
- **`mitigated-by-config`** — Vulnerable surface is gated by configuration not enabled in production (e.g., a feature flag is off). Requires explicit documented config check. **Future trigger to re-classify:** if the gating config is ever enabled in production OR if a future deploy changes the default.
- **`deferred-vendored-asset`** *(NEW for Phase 10)* — Package vulnerability lives in a vendored static-asset bundle's `package.json` metadata. The vulnerable package is referenced only because the vendored plugin's original authoring used it as a build tool; the consuming project does **NOT** invoke the vulnerable package against the vendored manifest during its own build, and the vulnerable code paths are never reached in production runtime. Effective exposure is ZERO. **First applied to** Alert 54 (GHSA-rm36-94g8-835r) and Alert 52 (GHSA-m5pj-vjjf-4m3h) on `thinx-cloud/console` — both at the vendored `jquery-validation-1.19.5/package.json` bundle. See `.planning/dep-triage.md` § "Phase 10 / SEC-DEP-02 (services/console) — Cross-Project Roll-up" for the full row entries. **Future trigger to re-classify:** if a future build step starts invoking the vulnerable tool against the vendored manifest, OR if the vendored bundle is replaced with one that runs the tool in-build.

### Verdict enum (closed set)

Every row in `.planning/dep-triage.md` MUST have its Verdict column drawn from this set, and every `deferred-*` row MUST cite exactly one class from the Rationale taxonomy above.

- **`blocker`** — Active CVE in production code path; remediate now. (Phase 4 baseline use.)
- **`deferred-stale`** — Stale-alert; auto-dismissal expected after Dependabot rescan. Maps to `stale-alert` rationale.
- **`deferred-dev-only`** — Dev-only scope; stripped by `npm install --omit=dev` in Dockerfile. Maps to `dev-only-scope` rationale.
- **`deferred-locked`** — Fix locked by a project-level decision (e.g., chai-http v5 ESM lock). Maps to `chai-http-lock` or similar locked-class rationale.
- **`deferred-cost`** — Fix cost is HIGH relative to severity. Maps to `low-severity-high-cost` rationale.
- **`deferred-low-sev`** — Low severity AND not on the production code path. Maps to `low-severity-high-cost` rationale.
- **`deferred-vendored-asset`** *(NEW for Phase 10)* — Alert exists in a vendored static-asset bundle's `package.json`; vulnerable code NOT in build/runtime path; effective exposure ZERO. Maps to `deferred-vendored-asset` rationale class (one-to-one mapping, mirroring how Phase 4 paired `deferred-stale` with `stale-alert` and `deferred-dev-only` with `dev-only-scope`).

**Naming convention:** Phase 10 introduced the new verdict alongside the rationale class as a one-to-one mapping. Future new classes SHOULD follow the same pattern (e.g., if a new "alert lives in archived/abandoned subdir" rationale ever emerges, the paired verdict would be `deferred-archived` or similar) — keeps the verdict ↔ rationale mapping unambiguous.

---

## 4. Submodule edit + pointer bump workflow

This is the 9-step canonical sequence used by Plan 10-02 of Phase 10, generalized for any sibling submodule. Each step is a single discrete operator action; do not skip or combine.

```
1. Confirm parent repo working tree is clean:
     cd /path/to/thinx-device-api && git status --short   # must be empty

2. Check the submodule's current branch state:
     cd services/<submodule>
     git status --short                                   # must be empty
     git rev-parse --abbrev-ref HEAD                      # note the branch (may be detached)
     git rev-parse HEAD                                   # note the current SHA

3. If the submodule is in detached HEAD state, check out its working branch:
     git checkout thinx-staging                           # or whatever the submodule's working branch is
     # If the working branch does not exist locally:
     #   git fetch origin && git checkout -t origin/thinx-staging

4. Make the planning-doc edit inside the submodule (typically .planning/ROADMAP.md
   or .planning/dep-triage.md — but any planning artifact is fair game):
     # Use your editor — the runbook's Section 5 verification gates apply post-edit.
     # Example for Phase 10 / Plan 10-02: append a new phase entry to
     # services/console/.planning/ROADMAP.md scheduling SEC-DEP-02.

5. Commit IN the submodule (GPG-signed by submodule's own git config):
     cd services/<submodule>
     git add .planning/...                                # stage ONLY the edited file(s)
     git commit -m "docs(<REQ-ID>): <scheduling subject>"
     # Example (Phase 10 / Plan 10-02):
     #   docs(SEC-DEP-02): schedule SEC-DEP-02 phase coordinated from thinx-device-api v1.9

6. Capture the new submodule HEAD SHA:
     NEW_SHA=$(git rev-parse HEAD)
     echo "submodule new HEAD: ${NEW_SHA}"
     # Save this value — it is cited in the parent commit body for auditability.

7. Return to parent repo root and stage the pointer update:
     cd ../..                                             # or absolute path to thinx-device-api root
     pwd                                                  # verify you are at the parent root
     git add services/<submodule>                         # captures the new pointer SHA

8. Verify ONLY the pointer changed in the parent stage:
     git diff --cached --stat
     # Expected output (exactly):
     #   services/<submodule> | 2 +-
     # If any OTHER file appears in the stage, STOP — reset and re-investigate.

9. Commit the pointer bump in the parent (GPG-signed):
     git commit -m "chore: bump services/<submodule> submodule to capture <REQ-ID> <description>"
     # Example (Phase 10 / Plan 10-02):
     #   chore: bump services/console submodule to capture SEC-DEP-02 schedule
     # Best practice: include the submodule's NEW HEAD SHA (full 40-char hex)
     # in the commit body so the bump is auditable even if force-push later
     # orphans the SHA in the submodule's remote.

POST-VERIFY (immediately after step 9):
- git submodule status services/<submodule>      # MUST start with a SPACE (clean; no drift)
                                                  #   ' '  = clean
                                                  #   '+'  = pointer ahead of recorded SHA
                                                  #   '-'  = submodule uninitialized
                                                  #   'U'  = merge conflict in the submodule
- git status --short                              # MUST be empty
- Neither commit is pushed in-session — operator push handles CircleCI green-gate
  per the Test-env ACCEPT pattern (parent project convention).
```

**Important callouts:**

- **Submodule commits use the SUBMODULE's git config for signing** (GPG key may differ from parent's; verify with `cd services/<submodule> && git config --get commit.gpgsign` before committing if uncertain). The two repos may have different signing keys configured.
- **The pointer-bump commit message MUST cite the submodule's new HEAD SHA in the body** (full 40-char hex) so the bump is auditable even if force-push later orphans the SHA in the submodule's remote. This is the only durable record once the submodule branch state moves on.
- **Push ordering matters.** If the submodule's working branch is rebased / force-pushed AFTER the pointer bump but BEFORE the parent's `thinx-staging` is pushed, the parent's pointer-bump commit becomes a "dangling pointer" — a downstream `git submodule update` will fetch the SHA but it will only resolve if the remote still has the commit reachable from a branch tip. **Operator SHOULD push the submodule's branch FIRST, then push the parent's pointer-bump commit second.** This runbook records the policy; Plan 10-02 defers push entirely to the operator (no in-session push).
- **Concrete Phase 10 example.** Plan 10-02 left the submodule pointer at the post-scheduling SHA (parent commit `chore: bump services/console submodule to capture SEC-DEP-02 schedule`). The LATER bump (after the console-side remediation merges) will be a SEPARATE coordination cycle re-running this 9-step workflow.

---

## 5. Post-merge verification checklist

After the submodule's working branch lands on its remote AND the parent's pointer-bump commit lands on `thinx-staging`, walk through every box below. Each unchecked box is a blocker for declaring the coordination complete.

- [ ] `gh api 'repos/<owner>/<repo>/dependabot/alerts?state=open'` (sibling repo) shows the relevant alert(s) **closed** (auto-closed after the remediation commit lands) OR **dismissed in UI** with rationale matching the verdict recorded in `.planning/dep-triage.md`.
- [ ] `.planning/dep-triage.md` annex section row(s) for the alert(s) match the verdict in the closing commit / dismissal. If the verdict was `deferred-*` at scheduling time and is now `resolved` or `dismissed`, **update the annex row to reflect the post-resolution state** (this keeps the triage table current; the historical verdict is preserved in git history).
- [ ] Parent project CircleCI green on the pointer-bump commit (`thinx-staging` branch). Run via `gh run list --branch thinx-staging --limit 5` or check the CircleCI dashboard.
- [ ] Sibling project CI green on its own resolution commit. The CI gate runs INDEPENDENTLY in the sibling's pipeline (different repo, different CI config) — confirm both go green.
- [ ] `git submodule status services/<submodule>` from the parent repo reports a **leading SPACE** (clean, no drift markers `+` / `-` / `U`) on every operator machine after `git submodule update --init --recursive`. Drift indicates either an uncommitted local change in the submodule or a missing pointer-bump commit in the parent.
- [ ] `.planning/runbooks/cross-project-dependency-coordination.md` (this file) cross-references remain valid — if the parent project renames `.planning/dep-triage.md` sections or the `.planning/ROADMAP.md` phase entry, run `grep -r 'Phase 10 / SEC-DEP-02' .planning/` to surface this runbook for an update pass.
- [ ] **Phase 10 worked example specific:** SEC-DEP-02 closes when the parent ROADMAP.md Phase 10 Success Criteria #1-4 are all true (parallel phase entry exists in `services/console/.planning/ROADMAP.md` ✓; submodule pointer up-to-date with the post-remediation SHA ✓; `.planning/dep-triage.md` annex captures the verdict roll-up ✓; CircleCI green across the bump ✓). Phase 10 of v1.9 codifies success criteria #1, #2, and the foundation for #3 (the scheduling-commit pointer bump); the LATER pointer bump after console-side remediation merges + the final CircleCI green-gate are operator-side and run via THIS RUNBOOK in a separate session.

---

## Closing — Cross-references

- `.planning/dep-triage.md` — canonical triage table for parent project + Phase 10 annex (`Phase 10 / SEC-DEP-02 (services/console) — Cross-Project Roll-up`).
- `.planning/ROADMAP.md` — Phase 10 of v1.9 (the phase that codified this workflow).
- `.planning/REQUIREMENTS.md` — SEC-DEP-02 (requirement spec).
- `.planning/phases/10-cross-project-dependency-coordination-services-console/10-CONTEXT.md` — full context for the Phase 10 worked example (Alert 54 + Alert 52 on `thinx-cloud/console`, both vendored-asset-only).
- `.planning/phases/10-cross-project-dependency-coordination-services-console/10-01-SUMMARY.md` — `.planning/dep-triage.md` annex creation (Plan 10-01).
- `.planning/phases/10-cross-project-dependency-coordination-services-console/10-02-SUMMARY.md` — sibling-project ROADMAP.md schedule + parent pointer bump (Plan 10-02).
- `.planning/runbooks/swarm.md` — sibling runbook (swarm host autoredeploy recovery; format precedent).
- `.planning/runbooks/websocket-handshake.md` — sibling runbook (rtm WS handshake; operator-tone precedent).
- `.planning/runbooks/managed-logs-redaction.md` — sibling runbook (CouchDB PII redaction; operator-procedure precedent).
- `AGENTS.md` (parent root) — dependency lock rationale (e.g., chai-http v5 lock) — consult before any v1.x phase touches `package.json` in either repo.

---

*Runbook initialized: 2026-06-03 (Phase 10 / SEC-DEP-02 close-out — codifies the cross-project dependency-triage coordination workflow first used to triage 2 high-severity grunt alerts on `thinx-cloud/console`, both classified `deferred-vendored-asset`).*
