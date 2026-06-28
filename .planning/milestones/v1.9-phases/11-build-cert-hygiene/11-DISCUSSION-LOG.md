# Phase 11 Discussion Log

**Date:** 2026-06-03
**Mode:** auto (final v1.9 phase)
**Phase:** 11 — Build & Cert Hygiene

## Areas NOT Discussed (requirement text is prescriptive)

Both BASE-IMG-01 and THINX-CERT-CHECK-01 have detailed validation criteria in REQUIREMENTS.md. The technical approach is clear from the requirement text + existing code context:
- `npm-auto-version` is already a dep — version-bump pattern is locked in to existing project conventions
- `isSupportedLetsEncryptIssuer` already exists in thinx-core.js — probe reuses this matcher
- Recent 2026-05-31 SSL incident + `260531-pdi` quick task provide concrete context

No user input needed. Proceeded directly to CONTEXT.md.

## Decisions (auto-derived from requirements + code)

1. **BASE-IMG-01:** Rewrite `base/update.sh` with `set -euo pipefail`, `--tag`/`--owner` args, `npm version patch --no-git-tag-version`, pre/post digest logging, single `chore: base version bump` commit. shellcheck clean.

2. **THINX-CERT-CHECK-01:** New `lib/thinx/cert-probe.js` exporting `probeCaFreshness(certPath, caPath)`. Called from thinx-core.js near line 211. Returns `{ ok, leafIssuer, caContains, message }`. WARN logged on mismatch. Unit test against 4 PEM fixtures (R10/R13 leaf × R10/R13 ca).

## Deferred Ideas Captured

- Auto-rotate ca.pem (out of scope; DETECT-only per requirement)
- Replace base/update.sh with CI pipeline (v2 candidate)
- Probe → Prometheus/Influx metrics (v1.10 candidate)
