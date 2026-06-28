# Phase 11 Context: Build & Cert Hygiene (FINAL v1.9 phase)

**Created:** 2026-06-03
**Milestone:** v1.9 — Backend Hygiene & Posture
**Requirements:** BASE-IMG-01, THINX-CERT-CHECK-01

## Domain

Final v1.9 phase. Harden the base-image rebuild script so it stops needing out-of-band manual `git commit` steps (BASE-IMG-01), and add a code-side startup probe that flags `ca.pem` freshness drift before it turns into a 2026-05-31-style SSL incident (THINX-CERT-CHECK-01). Both are bounded in-repo changes.

In scope:
1. **BASE-IMG-01:** Rewrite `base/update.sh` (currently 18 lines, no error handling) to include `set -euo pipefail`, optional `--tag <tag>` argument, automatic patch-level version bump, and pre/post image digest logging. The script ends with exactly one `chore: base version bump` commit on success (or surfaces a documented failure).
2. **THINX-CERT-CHECK-01:** Add a startup probe (new file `lib/thinx/cert-probe.js` or equivalent) that reads `ca.pem`, compares its chain to the leaf certificate's issuer (already-imported `isSupportedLetsEncryptIssuer` logic at `thinx-core.js:67-71` covers R10-R14), and emits a clear startup WARN when `ca.pem` is older than the leaf or doesn't contain the matching intermediate. Unit test covers the matcher logic against fixture PEM bundles.

Out of scope (deferred):
- ACME / Let's Encrypt cert-rotation automation (lives on swarm host, not this repo per REQUIREMENTS.md SEC-PII-01 area + "Out of Scope" in REQUIREMENTS.md).
- Auto-rotating `ca.pem` from inside the app (THINX-CERT-CHECK-01 is DETECT-only — does NOT mutate certs).
- Replacing `base/update.sh` with a CI-driven pipeline (out of v1.9 scope).

## Canonical Refs

- `.planning/ROADMAP.md` — Phase 11 (lines 108–115)
- `.planning/REQUIREMENTS.md` — BASE-IMG-01 (line 42), THINX-CERT-CHECK-01 (line 32)
- `.planning/PROJECT.md` — SSL incident reference (2026-05-31 → 2026-06-02 R10→R13 cross-sign incident, mitigated by quick task `260531-pdi`)
- `~/.claude/projects/-Users-igraczech-Repositories-thinx-device-api/memory/thinx-ssl-cert-renewal-gap.md` — operator memory: ACME automation refreshes leaf+key but NOT ca.pem; manual refresh needed on LE intermediate rotation
- `base/update.sh` (TARGET — 18 lines, will be rewritten)
- `base/Dockerfile`, `base/package.json` (referenced — not edited)
- `package.json:27` — `"version": "npm run npm-auto-version"` (existing version-bump script the project already uses)
- `package.json:71` — `"npm-auto-version": "^1.0.0"` (already a dev dep)
- `thinx-core.js:67-71` — `isSupportedLetsEncryptIssuer` (reuse this matcher logic in the probe)
- `thinx-core.js:198-220` — existing SSL context where the probe will hook in (`app_config.ssl_ca`, `app_config.ssl_cert`, `pki.certificateFromPem` import already there)
- `lib/thinx/globals.js` — `app_config` access pattern
- Recent commits `cd2c9a2b chore: subproject sync` + `304b09d1 chore: base version bump` (convention reference for BASE-IMG-01 commit message)

## Code Context

### Current base/update.sh (18 lines, BASE-IMG-01 target)

```bash
#!/bin/bash
# expected usage: ./update.sh --owner suculent
export TAG="alpine"
export OWNER="thinxcloud"
echo "Will update image with tag ${TAG}"
rm -rf ./node_modules/
rm -rf ./package-lock.json
npm install . --omit=dev && npm audit fix
docker buildx build --platform=linux/amd64 -t $OWNER/base:alpine .
docker push $OWNER/base:alpine
```

Gaps (per BASE-IMG-01):
- No `set -euo pipefail` — `&&`-chained `npm install . --omit=dev && npm audit fix` is the only error-stopper
- No `--tag <tag>` argument — `TAG="alpine"` is hardcoded
- No auto-version bump — operator must `git commit` the version change separately (this is why `304b09d1` exists as a standalone commit)
- No pre/post image digest logging — operator has no audit trail of what shipped
- `--owner` arg referenced in usage comment but never parsed
- `node_modules/` and `package-lock.json` deletion happen unconditionally — destructive if the script is invoked accidentally

### Existing SSL context (THINX-CERT-CHECK-01 anchor)

`thinx-core.js:67-71`:
```js
const isSupportedLetsEncryptIssuer = (attributes = []) => {
  const organization = getCertAttribute('organizationName', attributes) || getCertAttribute('O', attributes);
  const commonName = getCertAttribute('commonName', attributes) || getCertAttribute('CN', attributes);
  return organization === "Let's Encrypt" && ['R10', 'R11', 'R12', 'R13', 'R14'].includes(commonName);
};
```

`thinx-core.js:198-215` (SSL load path — where probe hooks):
```js
var ssl_options = null;
if ((fs.existsSync(app_config.ssl_key)) && (fs.existsSync(app_config.ssl_cert))) {
  let sslvalid = false;
  if (!fs.existsSync(app_config.ssl_ca)) {
    const message = "⚠️ [warning] Did not find app_config.ssl_ca file, websocket logging will fail...";
    // ...
  }
  let caCert = read(app_config.ssl_ca, 'utf8');
  let client = pki.certificateFromPem(read(app_config.ssl_cert, 'utf8'));
  // ...
```

The probe reads `app_config.ssl_ca` + `app_config.ssl_cert`, extracts the leaf cert's issuer (already-imported `pki.certificateFromPem` via `node-forge`), compares to the issuer name in `ca.pem`'s chain. If mismatch (e.g., leaf signed by R13 but `ca.pem` still pins R10), emit WARN.

### Recent SSL incident context (per user memory + state)

- 2026-05-31: R13-issued leaf vs R10-pinned `ca.pem` caused startup SSL verification error.
- Quick task `260531-pdi` refreshed LE intermediate allowlist (R10..R14) in `thinx-core.js` cert-tolerance branch.
- ACME automation refreshes leaf+key but NOT `ca.pem` — manual refresh required on LE intermediate rotation (operator memory `thinx-ssl-cert-renewal-gap`).
- THINX-CERT-CHECK-01 is the codebase angle: DETECT this gap before it becomes an outage.

## Decisions

### BASE-IMG-01 — `base/update.sh` hardening

**Decision:** Rewrite `base/update.sh` to a hardened, single-commit-producing script with these explicit features:

1. **`set -euo pipefail`** as the first executable line (after shebang). Any non-zero exit kills the script with a clear error.
2. **`--tag <tag>` argument** (optional). Default: `alpine`. Parses with a simple positional/`getopts` block. The pinned tag flows through to the `docker buildx build -t $OWNER/base:$TAG .` command.
3. **`--owner <owner>` argument** (already referenced in the usage comment but unparsed today). Default: `thinxcloud`.
4. **Auto-bump the `package.json` patch version** before `docker buildx build`. Use `npm version patch --no-git-tag-version` (no commit yet — the script controls the commit). This matches the existing `1.9.X` rolling pattern.
5. **Pre/post image digest logging.** Capture `docker inspect <image> --format='{{.RootFS.Digest}}'` or equivalent before and after the build; log both to stdout.
6. **Single `chore: base version bump` commit** at the end (GPG-signed if `--sign` is the default). The commit stages ONLY `package.json` + `package-lock.json` (the version-bump files), NOT the deleted `node_modules/` (that's gitignored).
7. **Failure surfacing.** If any step fails, the script exits non-zero with a clear stderr message identifying the failed step. No silent failures.
8. **`shellcheck` clean.** `shellcheck base/update.sh` exits 0.

**Validation:**
- `shellcheck base/update.sh` exits 0.
- Running `bash base/update.sh --tag alpine --dry-run` (dry-run mode optional but recommended) doesn't mutate anything.
- Full run on clean clone: produces image, single `chore: base version bump` commit, no other side effects.

### THINX-CERT-CHECK-01 — Startup `ca.pem` freshness probe

**Decision:** Add a new file `lib/thinx/cert-probe.js` exporting `probeCaFreshness(certPath, caPath)` that:

1. Reads `ca.pem` and the leaf cert (`app_config.ssl_cert`).
2. Extracts the leaf's `Issuer.CN` (`R10`/`R11`/`R12`/`R13`/`R14` per Let's Encrypt's intermediate naming).
3. Parses `ca.pem` (which contains the intermediate chain) and extracts the Subject CN of each cert in the chain.
4. Returns one of:
   - `{ ok: true, leafIssuer: "R13", caContains: ["R13"], message: null }` — no warning
   - `{ ok: false, leafIssuer: "R13", caContains: ["R10"], message: "ca.pem does not contain the leaf's issuer 'R13'; chain mismatch — refresh ca.pem from https://letsencrypt.org/certs/" }` — emit WARN
5. The probe is CALLED from `thinx-core.js` near line 211 (after `read(app_config.ssl_ca, 'utf8')` already loads ca.pem). If the return is `ok: false`, `console.log` the message with the `⚠️` prefix matching project style. **Probe does NOT mutate certs.**

**Unit test:** `spec/jasmine/ZZ-CertProbeSpec.js` covers:
- R10 leaf + R10 ca → `ok: true`
- R13 leaf + R13 ca → `ok: true`
- R13 leaf + R10 ca → `ok: false`, message mentions R13 + R10
- R10 leaf + R13 ca → `ok: false`, message mentions R10 + R13 (reverse case)

**Fixture PEM bundles:** New `spec/fixtures/cert-probe/` directory with 4 fixture PEM files (R10-leaf, R10-ca, R13-leaf, R13-ca). Use `openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/O=Let's Encrypt/CN=R10"` etc. to generate at plan-execute time (committed to repo).

**Validation:**
- Unit test passes locally and in CI.
- Startup with R13 leaf + R10-era ca.pem emits the WARN line (verifiable by spec mocking `app_config.ssl_*` paths + grepping captured stdout).
- Startup with matching intermediate emits NO warning.

## Coordination

- Phase 11 is INDEPENDENT — parallel-safe with all v1.9 phases.
- Phase 11 lands as the FINAL phase of v1.9 — closes out the milestone.

## Deferred Ideas

- **Auto-rotate ca.pem on intermediate mismatch** — once the probe detects a gap, automatically pull the new intermediate from `https://letsencrypt.org/certs/`. Out of scope (DETECT-only per requirement).
- **Replace `base/update.sh` with a CI pipeline** — GitHub Actions / CircleCI driven base-image build. Out of v1.9 scope.
- **Probe metric/log to Prometheus or Influx** — surface the gap signal to monitoring. Out of v1.9 scope.

## Open Questions for Researcher / Planner

- `npm version patch --no-git-tag-version` vs invoking `npm run npm-auto-version` directly — both produce a patch bump but the former is more explicit. Recommendation: `npm version patch --no-git-tag-version`. Planner confirms.
- Fixture PEM generation: write a `spec/fixtures/cert-probe/generate.sh` helper that operators can re-run if fixtures expire, OR commit the PEMs as static 365-day-validity files? Recommendation: static files with a regenerate-script for refresh.
- Probe error semantics: log WARN and continue (current default for SSL issues per existing code), OR also report to Rollbar via `Globals.rollbar()`? Recommendation: WARN + Rollbar for production visibility. Planner decides.

## Constraints

- BASE-IMG-01: `base/update.sh` runs on the developer's local machine (operator-side build before pushing the base image). NOT a CI step. Script must be POSIX-compatible or explicitly Bash-required.
- THINX-CERT-CHECK-01: DETECT-only — must NOT modify any cert file. Probe is read-only.
- All commits GPG-signed.
- Test-env ACCEPT pattern carries: local `npm test` aborts on missing config; CI is canonical for the cert-probe spec.
