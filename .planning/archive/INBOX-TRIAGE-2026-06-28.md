===================================================================
  GSD INBOX TRIAGE — suculent/thinx-device-api — 2026-06-28
===================================================================

SCOPE NOTE
----------
This repo does NOT carry the GSD contribution scaffolding:
  - No .github/ISSUE_TEMPLATE/*.yml
  - No .github/PULL_REQUEST_TEMPLATE/*.md
  - CONTRIBUTING.md covers Conventional Commits, not the issue-first
    approval gate.
Strict template compliance scoring therefore does not apply. Items are
triaged for actionability (is there enough detail to act?) instead.

SUMMARY
-------
Open issues: 4        Open PRs: 0
  Features:     1        Feature PRs:      0
  Enhancements: 1        Fix PRs:          0
  Bugs:         2        Enhancement PRs:  0
  Chores:       0        Wrong template:   0
  Unclassified: 0        No linked issue:  0

GATE VIOLATIONS (action required)
---------------------------------
None — no open PRs.

ISSUES NEEDING ATTENTION (lowest actionability first)
-----------------------------------------------------
#541 [bug] Device Transfer e-mail formatting fix
    Actionability: LOW — symptom only, no repro/version/severity
    Missing: steps to reproduce, affected endpoint/template, when introduced,
             expected vs actual rendering, environment
    Labels: [bug] → Suggested: + needs-triage
    Age: 25d  Idle: 25d
    Note: Likely a Content-Type / template wrapping bug in the device-transfer
          mail. Small, well-scoped — good candidate for a quick fix once the
          mail template file is identified.

#418 [enhancement] Support Docker Secrets in Swarm mode
    Actionability: MEDIUM — clear intent, design sketch present
    Missing: list of env vars to migrate, acceptance criteria, rollout/back-compat
    Labels: [enhancement] → Suggested: + needs-review
    Age: 1252d  Idle: 25d
    Note: Maintainer-authored design note. Proposes a static helper that prefers
          /run/secrets/<name> over process.env.<name>. Relevant to current swarm
          deployment work.

#392 [feature] Per-user GITHUB_ACCESS_TOKEN
    Actionability: MEDIUM — behavior described, no acceptance criteria
    Missing: user stories, acceptance criteria, scope (files/screens), security
             considerations for token storage
    Labels: [feature] → Suggested: + needs-review
    Age: 1504d  Idle: 1224d
    Note: STALE (>30d idle, 3+ years). Decide: keep, backlog, or close.

#353 [bug, priority] GDPR: only user document is attempted to be purged
    Actionability: MEDIUM-HIGH — concrete deletion checklist present
    Missing: acceptance criteria / verification method, current-vs-target behavior
    Labels: [bug, priority] → adequate
    Age: 1542d  Idle: 25d
    Note: Carries `priority`. Compliance-relevant (incomplete purge across
          deploy/repo paths, deploy keys, CouchDB, Redis). Recommend scoping
          into a concrete task — highest-value item in the inbox.

READY TO MERGE
--------------
None — no open PRs.

STALE ITEMS (>30 days idle)
---------------------------
#392 — 1224 days idle. Triage decision needed (keep / backlog / close).

===================================================================
