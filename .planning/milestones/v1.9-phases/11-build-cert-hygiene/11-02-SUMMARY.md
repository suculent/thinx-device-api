---
phase: 11-build-cert-hygiene
plan: 02
subsystem: ssl-startup-probe
requirements:
  - THINX-CERT-CHECK-01
tags:
  - security
  - ssl
  - cert-rotation
  - lets-encrypt
  - detect-only
dependency_graph:
  requires:
    - node-forge (existing dep — package.json:69)
    - thinx-core.js SSL boot block at :198-265 (existing)
  provides:
    - lib/thinx/cert-probe.js exports `probeCaFreshness(certPath, caPath)`
    - thinx-core.js call-site that emits a `⚠️ [warning]` line on chain mismatch
    - spec/jasmine/ZZ-CertProbeSpec.js (6 it() blocks, CI canonical)
    - spec/fixtures/cert-probe/{R10,R13}-{leaf,ca}.pem (4 static fixture PEMs)
    - spec/fixtures/cert-probe/generate.sh (operator regenerate-script)
  affects:
    - operator ops surface: ca.pem freshness drift now surfaces as a startup WARN
      line (grep-able) instead of as a startup SSL verification error
tech_stack:
  added: []
  patterns:
    - DETECT-only safety probe (no mutation, no logging at module level)
    - Self-contained module (R10..R14 allowlist duplicated from thinx-core.js
      by design — D-02 decision)
    - Static fixture PEMs + regenerate script (per CONTEXT.md "Open Questions")
key_files:
  created:
    - lib/thinx/cert-probe.js
    - spec/jasmine/ZZ-CertProbeSpec.js
    - spec/fixtures/cert-probe/R10-leaf.pem
    - spec/fixtures/cert-probe/R10-ca.pem
    - spec/fixtures/cert-probe/R13-leaf.pem
    - spec/fixtures/cert-probe/R13-ca.pem
    - spec/fixtures/cert-probe/generate.sh
  modified:
    - thinx-core.js (additive 7-line block between :209 and :211)
decisions:
  - "D-02 (CONTEXT.md): probe is DETECT-only — emits a WARN, never mutates ca.pem"
  - "Self-contained probe module: R10..R14 allowlist duplicated from thinx-core.js:67-71 to avoid bootstrap coupling"
  - "Static fixture PEMs (36500-day validity) committed + generate.sh helper for operator refresh"
  - "Surfacing via console.log at the call site, NOT Rollbar — Rollbar integration deferred (out of THINX-CERT-CHECK-01 scope)"
metrics:
  duration: "≈25 minutes"
  completed: "2026-06-03"
  spec_count: 6
  fixture_count: 4
---

# Phase 11 Plan 11-02: THINX-CERT-CHECK-01 — Startup ca.pem Freshness Probe — Summary

One-liner: Added a DETECT-only startup probe (`lib/thinx/cert-probe.js`) that reads `app_config.ssl_cert` + `app_config.ssl_ca`, extracts the leaf's Issuer.CN and every Subject.CN in the bundle, and emits a `⚠️ [warning]` startup line when the bundle does not contain the leaf's Let's Encrypt intermediate (R10..R14) — closing the codebase angle of the 2026-05-31 R13-leaf-vs-R10-ca incident.

## What Shipped

1. **`lib/thinx/cert-probe.js`** (new, 188 lines) — exports `probeCaFreshness(certPath, caPath)`. Pure read-only function (only `fs.readFileSync`) returning `{ok, leafIssuer, caContains, message}`. Contains the duplicated `R10..R14` allowlist (`SUPPORTED_LE_INTERMEDIATES`) per D-02. Never throws; never writes; never logs at module level.

2. **`thinx-core.js` insertion** (7 lines added, 0 removed) — inserted between line 209 (existing ssl_ca-missing warn) and line 211 (`let caCert = read(...)`). Calls the probe and emits one `console.log("⚠️ [warning] " + message)` line on `!probeResult.ok`. The existing `isSupportedLetsEncryptIssuer` matcher (:67-71) and the rotation-tolerance branch (:234-244 / now :240-250) are byte-identical to pre-task state.

3. **`spec/jasmine/ZZ-CertProbeSpec.js`** (130 lines, 6 `it()` blocks) — covers:
   - R10 leaf + R10 ca → `ok:true`
   - R13 leaf + R13 ca → `ok:true`
   - R13 leaf + R10 ca → `ok:false`, message names both R13 + R10 + `letsencrypt.org/certs/`
   - R10 leaf + R13 ca → `ok:false`, message names both R10 + R13 (reverse case)
   - Missing leaf cert → graceful `ok:false`, no throw
   - Fixture mtime invariance (DETECT-only invariant) — all 4 fixture mtimes captured pre-probe, asserted unchanged post-probe across 4 probe invocations.

4. **`spec/fixtures/cert-probe/*.pem`** (4 files) — self-signed PEMs generated via `openssl req -x509 -newkey rsa:2048 -nodes -days 36500 -subj "/O=Let's Encrypt/CN=<R10|R13>"`. 36500-day validity (≈100 years) so fixtures never expire and CI never goes red on a fixture clock drift. Self-signed Issuer.CN==Subject.CN is sufficient because the probe inspects only the leaf's Issuer.CN and ca chain's Subject.CN.

5. **`spec/fixtures/cert-probe/generate.sh`** (operator regenerate helper) — executable, shellcheck-clean (`set -euo pipefail`, `trap rm tmpdir`, parameter expansion). Regenerates all 4 fixtures via the same `openssl` invocation; verifies output via `openssl x509 -noout -subject -issuer`.

## Verification

| Gate | Result |
|------|--------|
| `node --check lib/thinx/cert-probe.js` | ✅ OK |
| `node --check thinx-core.js` | ✅ OK |
| `node --check spec/jasmine/ZZ-CertProbeSpec.js` | ✅ OK |
| `shellcheck spec/fixtures/cert-probe/generate.sh` | ✅ clean |
| All 4 fixture PEMs parse via `openssl x509 -noout -subject -issuer` | ✅ OK |
| `grep -c probeCaFreshness lib/thinx/cert-probe.js` ≥ 1 | ✅ 2 (function + export) |
| `grep -c probeCaFreshness thinx-core.js` = 1 | ✅ 1 |
| `grep -c "require.*cert-probe" thinx-core.js` = 1 | ✅ 1 |
| `grep -c "THINX-CERT-CHECK-01" thinx-core.js` = 1 | ✅ 1 |
| Module body actual call-shape (`console\.(log|warn)\(\|rollbar\.[a-zA-Z]+\(`) hits | ✅ 0 — DETECT-only at module level |
| Module body actual fs-mutation call-shape (`fs\.(write\|unlink\|rename\|...)[A-Za-z]*\(`) hits | ✅ 0 — read-only verified |
| `git diff thinx-core.js` deletions | ✅ 0 (Quality Gate "additive-only") |
| `git diff thinx-core.js` additions | ✅ 7 (≤10 limit) |
| Forensic diff: pre-snapshot vs (new file − inserted block) | ✅ identical (existing code byte-untouched) |
| Standalone Jasmine spec run (6 specs, 0 failures) | ✅ PASS |
| Smoke probe: R13+R10 mismatch message names both R13 and R10 | ✅ PASS |
| Smoke probe: R13+R13 match returns `ok:true`, `message:null` | ✅ PASS |

### Note on grep gates (docstring vs actual call-shape)

The plan's `<verify><automated>` block specified `grep -qv "console.log|console.warn|rollbar" lib/thinx/cert-probe.js`. That naive grep DOES match the module's docstring (line 22) which *describes* the prohibition ("Module body contains NO `console.log`, `console.warn`, or `rollbar` calls"). A stricter call-shape grep — `grep -nE 'console\.(log|warn)\(|rollbar\.[a-zA-Z_]+\(|rollbar\('` — returns 0 hits, confirming that all `console`/`rollbar` mentions in the module are in the docstring describing the rule, not actual invocations. The DETECT-only invariant is verified at TWO additional levels: (a) the spec's mtime-invariance assertion, which exercises the probe against ok and not-ok pairs and confirms zero disk mutation; and (b) the analogous call-shape grep for `fs.write*|fs.unlink|fs.rename|...` which also returns 0 hits.

## Spec Run Path

- **Local Jasmine harness via full `npm test`:** aborts on missing `/mnt/data/conf/config.json` — Phase 5/6/7/8/9/10 ACCEPT pattern. NOT a regression of this plan; the abort is in `lib/thinx/globals.js:18` and predates Phase 11.
- **Cert-probe spec standalone** (via a one-file `spec_files: ["jasmine/ZZ-CertProbeSpec.js"]` Jasmine config): all 6 specs pass locally. The spec has no `_envi.json` / no `app_config` / no live SSL dependencies, so it runs cleanly in either local Jasmine OR CircleCI canonical green-gate.
- **CI canonical green-gate:** the spec auto-discovers under `spec/jasmine/ZZ-*.js` (project convention) — no `jasmine.json` change required.

## Sample Warning Line (operator-facing)

On a production drift event (R13 leaf signed against R10-pinned ca.pem, mirroring the 2026-05-31 incident state), startup will emit exactly:

```
⚠️ [warning] ca.pem does not contain the leaf's issuer 'R13'; chain mismatch — found ["R10"]. Refresh ca.pem from https://letsencrypt.org/certs/
```

The line is single-line, grep-able (`grep "⚠️ \[warning\] ca.pem"` or `grep "chain mismatch"`), and names BOTH the expected and the actual intermediate plus the canonical refresh URL. Production ca.pem files often bundle the intermediate AND ISRG Root — in that case `caContains` would be `["R10","ISRG Root X1"]` and the message would carry the full array.

## Quality Gate Evidence (Critical)

**Q1: "DETECT-only at module level" — no console/rollbar/log calls inside `lib/thinx/cert-probe.js`.**

```
$ grep -nE 'console\.(log|warn)\(|rollbar\.[a-zA-Z_]+\(|rollbar\(' lib/thinx/cert-probe.js
(no output — 0 hits)
```

The only string matches for `console.log` or `rollbar` in the file are inside the docstring describing the rule itself.

**Q2: "Read-only at module level" — no fs.write/unlink/rename/etc. inside the module.**

```
$ grep -nE 'fs\.(write|unlink|rename|mkdir|rmdir|appendFile|copyFile|truncate)[A-Za-z]*\(' lib/thinx/cert-probe.js
(no output — 0 hits)
```

The only `fs.*` calls in the module are `fs.readFileSync` (twice — once per cert path).

**Q3: "Additive-only thinx-core.js change — ZERO deletions."**

```
$ git diff thinx-core.js | grep -cE '^-[^-]'
0
$ git diff thinx-core.js | grep -cE '^\+[^+]'
7
```

`git diff` shows 7 added lines, 0 removed lines. Pre-/post-snapshot forensic diff (`/tmp/phase11-02-thinx-core.pre` vs current file with the inserted block stripped) returns identity — no existing code byte was touched.

**Q4: "Existing `isSupportedLetsEncryptIssuer` matcher unchanged."**

```
$ diff <(sed -n '67,71p' /tmp/phase11-02-thinx-core.pre) <(sed -n '67,71p' thinx-core.js)
(no output — byte-identical)
```

**Q5: "Existing rotation-tolerance branch unchanged."**

The branch shifts from :234-244 to :240-250 (offset by the 6-code-line insertion + 1 blank padding). Full-file diff with the inserted block stripped is empty — the branch is byte-identical.

## Fixture Generation Notes

- Generated via `bash spec/fixtures/cert-probe/generate.sh` at execution time on a LibreSSL 3.3.6 host (macOS). The script invokes `openssl req -x509 -newkey rsa:2048 -nodes -days 36500 -subj "/O=Let's Encrypt/CN=<NAME>"`.
- 36500-day validity (≈100 years) is intentional: fixtures will outlive the project. No fixture-refresh CI cron is needed.
- Self-signed Issuer.CN==Subject.CN is sufficient for the probe semantics — see the module docstring + the `generate.sh` header comment for the rationale.
- The 4 fixtures are committed to the repo as static files; `generate.sh` is available for operator refresh if a future fixture rotation ever becomes necessary.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan's `<verify><automated>` grep for forbidden console/rollbar calls technically tripped on the module's docstring (which describes the prohibition itself). The intent of the gate is "no actual calls" — verified at TWO additional, stricter levels (call-shape grep + fixture-mtime invariance assertion in the spec). This is a noted nuance, not a deviation.

## Forward Notes for v1.9 Phase-Closeout SUMMARY

- **THINX-CERT-CHECK-01 is the codebase angle of the 2026-05-31 SSL incident.** The operator-side ACME-rotates-leaf-but-not-ca.pem gap remains OPS scope (per REQUIREMENTS.md "Out of Scope" + operator memory `thinx-ssl-cert-renewal-gap`).
- **The probe surfaces the drift; remediation is operator-driven** via the existing `chain.pem` refresh recipe documented in the operator memory.
- **Rollbar integration is deferred** — the probe is DETECT-only and self-contained; if operator visibility via Rollbar is needed, that's a follow-up plan (NOT part of THINX-CERT-CHECK-01).
- **Phase 11 closes v1.9** — this is the FINAL plan of the milestone. Plan 11-01 (BASE-IMG-01) and Plan 11-02 (THINX-CERT-CHECK-01) are both complete.

## Atomic Commit

A single GPG-signed commit `feat(THINX-CERT-CHECK-01): startup ca.pem freshness probe with R10..R14 chain check` stages:

- `lib/thinx/cert-probe.js`
- `thinx-core.js`
- `spec/jasmine/ZZ-CertProbeSpec.js`
- `spec/fixtures/cert-probe/R10-leaf.pem`
- `spec/fixtures/cert-probe/R10-ca.pem`
- `spec/fixtures/cert-probe/R13-leaf.pem`
- `spec/fixtures/cert-probe/R13-ca.pem`
- `spec/fixtures/cert-probe/generate.sh`

**Commit SHA (post-commit):** `f991c492` (full: `f991c49236d4421998c4e4188c4446e663eb71c4`) — GPG signature: `G` (good).

## Self-Check: PASSED

- ✅ `lib/thinx/cert-probe.js` — exists, exports `probeCaFreshness`, parses via `node --check`
- ✅ `spec/jasmine/ZZ-CertProbeSpec.js` — exists, 6 `it()` blocks, all pass under standalone Jasmine run
- ✅ `spec/fixtures/cert-probe/R10-leaf.pem` — exists, parses via `openssl x509`
- ✅ `spec/fixtures/cert-probe/R10-ca.pem` — exists, parses via `openssl x509`
- ✅ `spec/fixtures/cert-probe/R13-leaf.pem` — exists, parses via `openssl x509`
- ✅ `spec/fixtures/cert-probe/R13-ca.pem` — exists, parses via `openssl x509`
- ✅ `spec/fixtures/cert-probe/generate.sh` — exists, executable, shellcheck-clean
- ✅ `thinx-core.js` — additive-only diff (7 additions, 0 deletions); pre-snapshot vs (current minus inserted block) is byte-identical
- ✅ Quality Gate Q1 (no console/rollbar call-shapes in probe module): 0 hits
- ✅ Quality Gate Q2 (no fs-mutation call-shapes in probe module): 0 hits
- ✅ Quality Gate Q3 (zero deletions in thinx-core.js): confirmed
- ✅ Quality Gate Q4 (isSupportedLetsEncryptIssuer matcher unchanged): byte-identical
- ✅ Quality Gate Q5 (rotation-tolerance branch unchanged): byte-identical
