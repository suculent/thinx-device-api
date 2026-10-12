# Phase 29: Edge Reconciliation & Source of Truth - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 6 (new/modified, in `thinx-device-api` only)
**Analogs found:** 6 / 6

> Scope note: this phase is capture / diff / document / snapshot — **no behavior changes** to the
> running edge. Several authoritative artifacts live in the separate `thinx-swarm` repo (the new
> committed source of truth); those are out of scope for pattern mapping. This map covers only the
> files touched **in this repo** (`thinx-device-api`), and all analogs below are **git-tracked**
> (verified with `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `docker-compose.traefik.yml` (REPLACE → generated read-only mirror) | config | transform (generated) | `.planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml` (redacted YAML snapshot) + banner convention (new) | role-match |
| `scripts/check-traefik-mirror.js` (NEW — staleness check vs recorded `thinx-swarm` SHA) | utility / CI check | transform / validation | `scripts/check-console-headers.js` | exact |
| `.circleci/config.yml` (MODIFY — add mirror-staleness run step) | config | request-response (CI step) | `.circleci/config.yml` lines 674-676 (Console header parity step) | exact |
| `package.json` (MODIFY — add `check:traefik-mirror` script) | config | — | `package.json` lines 23-24 (`privacy-check`, `check:headers`) | exact |
| `.planning/runbooks/swarm.md` (MODIFY — add source-of-truth section) | doc | — | `.planning/runbooks/swarm.md` (existing section structure) | exact |
| `.planning/runbooks/swarm-configs/traefik-edge.*.{pre,post}.yml` + cert inventory (NEW dated snapshots) | config / data | file-I/O (snapshot archive) | `.planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml` + `README.md` conventions | exact |

## Pattern Assignments

### `docker-compose.traefik.yml` → generated read-only mirror (config, transform)

**Analogs:** redacted-YAML-snapshot precedent `.planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml`
(bit-exact YAML with every secret replaced by `<redacted>`), plus the existing dead file being
replaced, `docker-compose.traefik.yml` (read it to confirm the v1-flags / `v2.6.1` / no-`:7442`
deadness the mirror supersedes).

**Banner pattern (NEW — no in-repo precedent yet; D-03):** the mirror must carry a
`GENERATED — do not edit, source: thinx-swarm@<sha>` header. `git grep` found **no existing
generated-file banner** in the repo, so this is a new convention the generator establishes. Model
its tone on the explanatory header comments the repo already favours (see the multi-line "why"
docblock at the top of `scripts/check-console-headers.js` lines 2-47).

**Secret-redaction rule to copy** (from `swarm-configs/README.md` lines 37-39 and D-12):
every inline secret is replaced by a literal placeholder and the file is otherwise structurally
faithful, so `diff` against live still works; env-var interpolation stays **templated**
(`${DOMAIN}`, `${EMAIL}`, `${USERNAME}`, `${HASHED_PASSWORD}`, `${CONFIG}`) — never resolved in git.
The cleartext `--pilot.token=095c70c4-…` and any other inline secret are masked in the mirror.

**Templated env-var convention** visible in the dead file being replaced
(`docker-compose.traefik.yml` lines 34, 50): `${APP_HOSTNAME}`, `${LANDING_HOSTNAME}`,
`${DEV_HOSTNAME}`, `${CONSOLE_HOSTNAME}` — same `${VAR}` style the mirror keeps.

---

### `scripts/check-traefik-mirror.js` (utility / CI check, transform + validation)

**Analog:** `scripts/check-console-headers.js` — a dependency-free Node check (only `fs`/`path`),
exactly the shape the mirror-staleness check should take.

**Copy these structural patterns:**

- **Header docblock** (lines 1-47): title + requirement ID + CANONICAL-input declaration + inputs
  + rules + usage + output-token legend. The mirror check's canonical input is the recorded
  `thinx-swarm@<sha>` (and/or the committed mirror); do the same "canonical vs compared" framing.
- **Repo-root resolution + declared inputs** (lines 49-61):
  ```javascript
  "use strict";
  const fs = require("fs");
  const path = require("path");
  const REPO_ROOT = path.resolve(__dirname, "..");
  const DEFAULT_INPUTS = [ ".planning/runbooks/..." ].map((r) => path.join(REPO_ROOT, r));
  ```
- **`load()` → MISSING/UNPARSEABLE problem collection** (lines 387-400): read file, push a
  typed problem string on failure rather than throwing.
- **`checkFiles()` returning `{ ok, files, problems, warnings }`** (lines 406-428): pure function,
  no process exit inside.
- **CLI arg parsing + `main()` exit-code contract** (lines 434-483): `0` = OK with a
  `… OK files=N` line, `1` = FAIL with a `… FAIL files=N problems=M` line, `2` = usage error;
  `module.exports` of the pure functions **and** `if (require.main === module) process.exitCode = main(...)`.
  For the mirror check the pass/fail token is "is the committed mirror current with the recorded
  `thinx-swarm` SHA" — emit an analogous `MIRROR-STALE`/`MIRROR OK` line.

---

### `.circleci/config.yml` (MODIFY — add staleness run step)

**Analog:** the Console header parity step already in the same file (lines 674-676):
```yaml
    - run:
        name: Console header parity (SEC-CSP-04)
        command: node scripts/check-console-headers.js && node --test spec/node/ConsoleHeaderParity.test.js
```
Add a sibling `- run:` step (named with the phase requirement, e.g. `Traefik mirror staleness
(EDGE-RECON-01)`) invoking `node scripts/check-traefik-mirror.js`. It belongs in the same job,
after `- checkout`, as a plain fail-the-build command — matching the precedent exactly.

---

### `package.json` (MODIFY — add npm script)

**Analog:** scripts block lines 23-24:
```json
    "privacy-check": "node scripts/privacy-policy-check.js",
    "check:headers": "node scripts/check-console-headers.js",
```
Add `"check:traefik-mirror": "node scripts/check-traefik-mirror.js"` in the same block, same
`node scripts/<name>.js` form.

---

### `.planning/runbooks/swarm.md` (MODIFY — add source-of-truth section)

**Analog:** the file's own existing section structure (e.g. the "Swarm Auto-Pull Recovery (Phase 3
/ OPS-01 — landed 2026-05-26)" header at line 14, and the dated close-out footer at line 122).

**Copy these conventions:**
- `## <Topic> (Phase N / REQ-ID — <date>)` section headers.
- Fenced `ssh micro "…"` command blocks with `# expect:` annotations (lines 33-41).
- The existing SSH-alias framing at the top (lines 5-10): `ssh micro`, deploy path
  `/mnt/gluster/deployment/swarm/`, host/key/port deliberately kept in `~/.aliases`, not the repo.
- The new section documents the **one-way chain** live (`micro` `thx` folder) → `thinx-swarm` →
  generated mirror (D-04 / criterion #3), and names the staleness check as the enforcement.

---

### `.planning/runbooks/swarm-configs/traefik-edge.*.{pre,post}.yml` + cert inventory (NEW dated snapshots)

**Analogs:** `.planning/runbooks/swarm-configs/swarmpit-stack.A.pre.yml` (the redacted YAML
snapshot) and `swarm-configs/README.md` (the convention doc).

**Copy these conventions from `README.md`:**
- **Naming** (lines 16-18): `<subject>-stack.<step>.{pre,post}.yml`. For Phase 29 follow the same
  dated/stepped pre/post form for the edge snapshot and the pre-P30 rollback artifact.
- **Redaction exception for YAML** (lines 37-39): every secret value replaced by literal
  `<redacted>`, otherwise bit-exact so `diff` vs live and rollback-restore still work; restore
  real values from the live manager backup, never from git. Files with an admin hash are never
  committed in any form.
- **Not executable / no reformatting** (lines 37, 41): checked in as-is.
- **Capture recipe shape** (lines 24-33): run a capture command on the host as root over `ssh`,
  redirect to the `.pre`/`.post` filename, `scp` back, commit unchanged. For Phase 29 the
  authoritative capture is `docker service inspect` / `docker inspect` of the running traefik task
  (D-08), plus the on-disk `thx` deploy files and the `tls.toml` docker config.

**Cert-inventory source** (`services/traefik/update.sh`, git-tracked): proves the **live ACME
path is the named volume**, not the app-repo's `/traefik/acme.json`:
```bash
ACME=/var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json
COUNT=$(jq '.le.Certificates | length' $ACME)
DOMAIN=$(jq -r .le.Certificates[${COUNTER}].domain.main $ACME)
```
Reuse this `jq` traversal to build the committed cert **inventory** (domains, resolver `le`,
issuer, expiry — **no private keys / no cert/key bodies**, D-10). The named-volume-vs-`/traefik`
path mismatch is itself a concrete drift signal to record.

## Shared Patterns

### Dependency-free Node check scripts
**Source:** `scripts/check-console-headers.js` (+ wired at `.circleci/config.yml:674-676`,
`package.json:24`)
**Apply to:** the new `scripts/check-traefik-mirror.js` and its CI + npm wiring.
Only `fs`/`path`; pure `checkFiles()` → `{ ok, problems }`; `main()` owns the exit code;
`module.exports` + `require.main === module` guard; CI runs it as a plain fail-the-build `- run`.

### Dated pre/post snapshot archive
**Source:** `.planning/runbooks/swarm-configs/README.md` + `swarmpit-stack.A.pre.yml`
**Apply to:** the Phase 29 edge snapshot and the pre-P30 rollback artifact.
`<subject>.<step>.{pre,post}.yml`, `<redacted>` secret masking, bit-exact otherwise, not
executable, committed unchanged.

### Templated-not-resolved secrets
**Source:** `swarm-configs/README.md` lines 37-39; dead `docker-compose.traefik.yml` lines 34/50
**Apply to:** the generated mirror and every committed config. Keep `${VAR}` interpolation
templated in git; resolved values live only in the out-of-git `600` rollback snapshot on `micro`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docker-compose.traefik.yml` (GENERATED banner specifically) | config | transform | No `GENERATED — do not edit` banner exists anywhere in the repo (`git grep` returned only this phase's CONTEXT.md). The banner is a new convention; model its tone on the explanatory docblock in `scripts/check-console-headers.js`. |
| The generator itself (thinx-swarm → mirror) | utility | transform | Lives logically against the `thinx-swarm` source repo, which is out of this repo's scope; no in-repo generator precedent. The staleness *check* has an exact analog (above); the generator does not. |

## Metadata

**Analog search scope:** `scripts/`, `.planning/runbooks/`, `.planning/runbooks/swarm-configs/`,
`services/traefik/`, `.circleci/`, repo root (`docker-compose.traefik.yml`, `package.json`).
**Git-tracked verification:** `git ls-files` confirmed `services/traefik/update.sh`,
`docker-compose.traefik.yml`, `.planning/runbooks/swarm.md` are tracked; swarm-configs snapshots
and `scripts/check-console-headers.js` are tracked. No gitignored-mirror paths emitted.
**Pattern extraction date:** 2026-10-06
