---
status: testing
phase: 26-vue-console-log-paging
source: [26-VERIFICATION.md]
started: 2026-10-02T12:55:00Z
updated: 2026-10-02T12:55:00Z
---

## Current Test

number: 1
name: History stays responsive with 1,000+ rows loaded
expected: |
  On the Vue History page (opened from the sidebar), press "Load more" on the audit table
  until about 1,000 or more entries are shown. Scrolling, filtering and pressing "Load more"
  again stay responsive, with no long freeze.
awaiting: user response

## Tests

### 1. History stays responsive with 1,000+ rows loaded
expected: Load the audit table past about 1,000 entries; scrolling, filtering and "Load more" stay responsive.
result: [pending]

### 2. The paging footer wraps cleanly at 360px
expected: At a 360px-wide viewport (device toolbar or phone), the "Load more" button and the filter hint under each History table wrap without overflow or overlapping text.
result: [pending]

### 3. The first scheduled retention run succeeds
expected: After 2026-10-03 09:40 UTC, `/var/log/thinx-log-retention.log` on micro has a new run that ends with `LOG-RETENTION APPLY OK`, and the run's expired and orphan counts are 0 or small (one day's worth).
result: [pending]

### 4. Sign-off on the 11 process prohibitions
expected: |
  The operator agrees with the verifier's "held" verdict for each process rule in
  26-VERIFICATION.md:
  - no restart.sh or stack deploy;
  - pushes to thinx-staging only;
  - one-way writes only after the operator's recorded answers;
  - no identifiers in the annex or summaries;
  - the old job retired, not deleted;
  - no technical terms in the UI;
  - and the remaining rules listed there.
result: [pending]

### 0. (done) "Load more" pages each History table (26-07 browser check)
expected: Opened from the sidebar, "Load more" appends the next page on each table, and the two tables page independently.
result: passed (operator, 2026-10-02)

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
