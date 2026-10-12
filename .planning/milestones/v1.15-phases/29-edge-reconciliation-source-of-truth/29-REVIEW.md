---
phase: 29-edge-reconciliation-source-of-truth
reviewed: 2026-10-06T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - .circleci/config.yml
  - docker-compose.traefik.yml
  - package.json
  - scripts/check-traefik-mirror.js
  - scripts/generate-traefik-mirror.js
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 29: Code Review Report

**Reviewed:** 2026-10-06
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Scope is the Traefik edge-config mirror system: a dependency-free generator
(`scripts/generate-traefik-mirror.js`) that copies `thinx-swarm/traefik.yml` into a
redacted, banner-stamped `docker-compose.traefik.yml`, and a checker
(`scripts/check-traefik-mirror.js`) that enforces integrity + freshness, wired into CI
via `package.json` and `.circleci/config.yml`.

The happy path is sound: the committed mirror passes `check-traefik-mirror.js` (integrity
OK), the banner contract strings are byte-identical across both scripts, and the pilot
token — the one real secret in the current source — is masked twice (token-flag regex +
UUID catch-all). Failure modes (missing file, non-git swarm repo, missing banner lines)
are handled and mapped to the documented problem tokens.

The defects are in the redaction layer and the integrity model, not the current output.
The redaction is a three-pattern allowlist whose stated guarantee ("a committed cleartext
credential must never reach this less-private repo") is broader than what the code
delivers: I confirmed two concrete inputs that leak secrets unredacted (WR-01, WR-02).
The source-of-truth binding between the banner SHA and the mirrored body is also weaker
than advertised (WR-03). None leak given today's `traefik.yml`, so these are latent rather
than live — classified as WARNING — but each is a real correctness/security gap in a tool
whose entire purpose is to prevent exactly those leaks.

`docker-compose.traefik.yml` is a generated, read-only mirror; its preserved upstream warts
(`exposedbydefault=true`, redacted pilot token, `--log.level=ERROR`) are out of scope per
the phase's zero-cleanup decision and are not reported as defects.

## Warnings

### WR-01: basicauth redaction leaks a resolved htpasswd hash when the username uses the `${VAR?default}` form

**File:** `scripts/generate-traefik-mirror.js:72`
**Issue:** The basicauth rule
`out.replace(/(basicauth\.users=[^\s:]*:)(?!\$\{)(\$?[^\s]+)/g, ...)` anchors on a run of
non-space, non-colon characters (`[^\s:]*`) before the `:` separating user from hash.
Traefik's default-value syntax `${HASHED_PASSWORD?Variable not set}` / `${USERNAME?Variable
not set}` contains a **space**, so `[^\s:]*` stops at the space and the regex can never
reach the `:` before the hash. If a future `traefik.yml` templates the username with that
`?Variable not set` form but ships a **resolved** password hash (the mixed case the docstring
explicitly claims to handle: "a resolved basicauth htpasswd value → `<redacted>`, UNLESS
templated"), the hash is emitted in cleartext. Confirmed:

```
input : ...basicauth.users=${USERNAME?Variable not set}:$apr1$abcd$REALHASHLEAK
output: ...basicauth.users=${USERNAME?Variable not set}:$apr1$abcd$REALHASHLEAK   # NOT redacted
```

A bcrypt/apr1 hash is not an RFC4122 UUID, so the UUID catch-all does not save it — this
one fragile regex is the only guard for htpasswd hashes.
**Fix:** Match the separator structurally instead of consuming the username. Redact the
hash half whenever it is not itself a `${...}` template, regardless of what the user half
looks like, e.g.:

```js
// mask the hash after the LAST colon on a basicauth.users value unless it is a ${...} template
out = out.replace(/(basicauth\.users=\S*?:)(?!\$\{)(\S+)/g, "$1" + REDACTED);
```

and/or add a test fixture covering templated-user + resolved-hash.

### WR-02: redaction is a three-pattern allowlist — generic secret-bearing flags are not masked

**File:** `scripts/generate-traefik-mirror.js:67-76`
**Issue:** `redactSecrets` only masks (a) RFC4122 UUIDs, (b) `--*token=` values, and
(c) basicauth hashes. The module docstring and `check`'s docstring both assert the stronger
invariant that "a committed cleartext credential must never reach this less-private repo."
Any secret that is not one of those three shapes passes through verbatim. Confirmed:

```
input : - --dnschallenge.provider.apikey=SUPERSECRETKEY123   => unchanged
input : - --some.password=hunter2plaintext                   => unchanged
```

Traefik DNS-challenge resolvers routinely take inline provider API keys/secrets
(`--certificatesresolvers.le.acme.dnschallenge...`), so this is a realistic future addition
to `traefik.yml` that would silently publish a live credential into this less-private repo.
Because the generator is the sole gate, the failure is silent — nothing in the pipeline
flags an unredacted secret.
**Fix:** Either narrow the documented guarantee to the explicit allowlist, or add a
generic secret-flag rule plus a fail-closed heuristic. For example, mask values of flags
whose key matches `(token|password|passwd|secret|apikey|api[-_.]?key|credential)` (unless
`${...}`), and consider having the generator refuse to write (exit non-zero) if the redacted
body still contains a high-entropy token on such a flag, so a new secret type fails the
build instead of leaking.

### WR-03: banner SHA is taken from `git HEAD` while the body is read from the working tree

**File:** `scripts/generate-traefik-mirror.js:106-109`
**Issue:** `generate()` reads the body with `fs.readFileSync(swarmRepo/traefik.yml)` (working
tree) but stamps the banner with `resolveSourceSha()` = `git -C swarmRepo rev-parse HEAD`.
If the swarm checkout has uncommitted edits to `traefik.yml`, the mirror body reflects those
edits while the banner attributes them to a commit that does not contain them. Both checks
then pass: integrity passes (the body hash is self-consistent) and freshness passes (banner
SHA == the same HEAD). The "source of truth is `thinx-swarm@<sha>`" guarantee is therefore
not actually enforced — a mirror can claim provenance it does not have, which is precisely
the drift Phase 29 exists to kill.
**Fix:** Read the source at the stamped commit rather than the working tree
(`git -C swarmRepo show HEAD:traefik.yml`), or verify the tree is clean for that path
(`git -C swarmRepo status --porcelain -- traefik.yml` must be empty) before writing, failing
with a clear message otherwise.

### WR-04: the banner contract is defined independently in both scripts with no shared source or guard

**File:** `scripts/check-traefik-mirror.js:47-51` (and `scripts/generate-traefik-mirror.js:50-51`)
**Issue:** `BANNER_PREFIX`, `SHA256_PREFIX`, `BANNER_RE`, and `SHA256_RE` are redeclared in
the checker independently of the generator, and the prefix contains a literal em dash
(`—`, U+2014): `"# GENERATED — do not edit. source: thinx-swarm@"`. The generator writes
that prefix; the checker's `BANNER_RE` must match it byte-for-byte or **every** mirror fails
the check (and CI fails hard). They are consistent today, but there is no shared constant and
no test asserting generator-output ⇄ checker-regex agreement, so an innocuous edit (an editor
normalizing the em dash to a hyphen, trimming the trailing space, etc.) in one file silently
breaks the other with a confusing `MISSING` rather than a clear diagnostic.
**Fix:** Extract the banner/sha256 contract (prefixes + the generator↔checker round-trip)
into one shared module that both scripts import, and add a test that feeds
`buildMirror(...)` output straight into `checkFiles(...)` and asserts `ok === true`, locking
the two sides together.

## Info

### IN-01: duplicated helpers across the two scripts

**File:** `scripts/check-traefik-mirror.js:53-55`, `scripts/generate-traefik-mirror.js:78-80`
**Issue:** `sha256()`, `parseArgs()` (near-identical `--swarm-repo` handling), and the
`REPO_ROOT`/`MIRROR_PATH` constants are duplicated in both files. Beyond maintenance cost,
divergence here is a correctness risk (see WR-04).
**Fix:** Share these via a small common module (or re-export from the generator, which the
checker already partially mirrors).

### IN-02: mirror check is sensitive to line endings with no `.gitattributes` guard

**File:** `scripts/check-traefik-mirror.js:61-67,99-106`
**Issue:** The body hash is computed over the exact bytes after the second `\n`. A checkout
that converts the committed `\n` to `\r\n` (git `autocrlf` on Windows, or a misconfigured
`.gitattributes`) makes the recorded hash mismatch and/or breaks `SHA256_RE`'s `$` anchor.
Confirmed: feeding a CRLF copy of a valid mirror to `checkFiles` reports a spurious `MISSING`.
CI runs on Linux so this is not currently live.
**Fix:** Add a `.gitattributes` entry pinning `docker-compose.traefik.yml` (and the scripts)
to LF, or normalize `\r\n`→`\n` before hashing.

### IN-03: `resolveSwarmHead` does not validate the HEAD it compares against

**File:** `scripts/check-traefik-mirror.js:69-72,117-119`
**Issue:** The generator validates its source SHA is 40-hex, but the checker's
`resolveSwarmHead` returns whatever `git rev-parse HEAD` prints, trimmed, and compares it
raw to the banner SHA. Non-standard git output would surface as a `MIRROR-STALE` with an
odd detail rather than a clear error.
**Fix:** Apply the same `/^[0-9a-f]{40}$/` guard before the freshness comparison.

---

_Reviewed: 2026-10-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
