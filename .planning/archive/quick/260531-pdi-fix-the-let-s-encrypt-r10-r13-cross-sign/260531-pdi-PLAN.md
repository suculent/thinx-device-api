---
phase: 260531-pdi-quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - thinx-core.js
autonomous: true
requirements:
  - QUICK-260531-pdi
must_haves:
  truths:
    - "The rotation-tolerance branch in thinx-core.js accepts a leaf cert issued by Let's Encrypt R13 against a CA bundle still pinned to R10 (today's production state)."
    - "The allowlist also accepts R11 and R14 so the same code survives the next two LE intermediate rotations without another code change."
    - "The allowlist rejects an issuer with the right organization but an unknown CN (e.g. 'R99' or 'Fake')."
    - "The allowlist rejects an issuer with the right CN but the wrong organization (e.g. 'Fake CA' + 'R10')."
    - "The comment block at the rotation-tolerance branch reflects reality: lists the currently accepted intermediates, flags this as a workaround for stale CA-bundle pinning, and records the refresh date (2026-05-31)."
  artifacts:
    - path: "thinx-core.js"
      provides: "Updated LE intermediate allowlist + refreshed rationale comment"
      contains: "['R10', 'R11', 'R12', 'R13', 'R14']"
  key_links:
    - from: "thinx-core.js:67 (isSupportedLetsEncryptIssuer)"
      to: "thinx-core.js:227 (catch-block recovery in SSL verify)"
      via: "direct call site — predicate gates the sslvalid=true rescue"
      pattern: "isSupportedLetsEncryptIssuer\\(clientIssuer\\) && isSupportedLetsEncryptIssuer\\(caSubject\\)"
---

<objective>
Fix the Let's Encrypt R10/R13 cross-sign mismatch that causes "Certificate verification failed" log noise at thinx-core startup. The pinned CA bundle still references intermediate R10; today's production leaf cert is issued by R13. The rotation-tolerance whitelist in `thinx-core.js` only contains R10 and R12, so the catch-block recovery rejects R13 and `sslvalid` stays false.

Purpose: Restore the rotation-tolerance branch so the operator stops seeing a spurious "SSL certificate loading or verification FAILED" line at boot, and so that a REAL cert misconfig is not buried in known-noise. (HTTPS service itself is currently fronted by Traefik on a separate host port, so user traffic is unaffected — this is a hygiene fix, not an outage fix.)

Output: A single commit updating two adjacent regions of `thinx-core.js`: the allowlist constant and the rationale comment above the catch-block.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@thinx-core.js

<interfaces>
<!-- The two predicate helpers live in a nested scope inside thinx-core.js
     constructor (around line 55 onwards). They are NOT exported — they are
     closure-locals used only by the cert-verify catch block ~160 lines below.
     Do not attempt to import/test them in isolation; extraction would be
     >15 lines of churn for a string-array tweak (see scope §3 — SKIP test). -->

Current shape at thinx-core.js:62-71:

  getCertAttribute(name, attributes = []) -> string | undefined
    Looks up an attribute by either .name or .shortName on a node-forge
    attributes[] array (as returned by pki.certificateFromPem(...).issuer.attributes
    or .subject.attributes).

  isSupportedLetsEncryptIssuer(attributes = []) -> boolean
    True iff organization === "Let's Encrypt" AND commonName is in the
    pinned allowlist. THIS allowlist is what we are widening.

Call site at thinx-core.js:215-237:
  try { sslvalid = ca.verify(client); }
  catch (err) {
    ...
    if (isSupportedLetsEncryptIssuer(clientIssuer)
        && isSupportedLetsEncryptIssuer(caSubject)) {
      // log rotation note
      sslvalid = true;
    }
  }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Widen LE intermediate allowlist + refresh rationale comment</name>
  <files>thinx-core.js</files>
  <action>
Make TWO small, adjacent edits in `thinx-core.js`. No other files. No new exports, env vars, or config keys.

EDIT 1 — Allowlist at line 70 (inside `isSupportedLetsEncryptIssuer`):

  Replace the literal `['R10', 'R12']` in the return statement with
  `['R10', 'R11', 'R12', 'R13', 'R14']`.

  Rationale: Per scope §1 — Let's Encrypt's active RSA-signed issuing intermediates as of 2026-05-31 are R10–R14 (ISRG-signed). R13 is the leaf issuer in today's production cert; R10 is what the bundled chain.pem still pins; R11/R14 are forward-looking inclusions so the next two rotations don't trigger another code change. E1/E2 (ECDSA) remain intentionally out of scope — THiNX certs are RSA.

  Keep the predicate's structure identical (organization check + commonName .includes). Do NOT introduce a Set, regex, or extracted constant — YAGNI for a five-element string array used in one place.

EDIT 2 — Comment block at lines 224-226 (immediately above the
`if (isSupportedLetsEncryptIssuer(clientIssuer) && isSupportedLetsEncryptIssuer(caSubject))` guard):

  Replace the existing 3-line comment that begins with "Let's Encrypt rotates intermediates (for example R10 -> R12)." with a refreshed block that:

    1. Names the currently accepted intermediates explicitly: "R10, R11, R12, R13, R14".
    2. States this is a WORKAROUND for stale CA-bundle pinning, NOT a substitute for the operator updating /mnt/data/ssl/chain.pem to match the leaf chain.
    3. Records the refresh date: "Allowlist last refreshed: 2026-05-31 (R13 active leaf issuer in production)."
    4. References scope §2 implicitly by mentioning that proper fix is the chain.pem update.

  Keep the comment style consistent with the surrounding `//`-prefixed block comments in this file. Do not convert to JSDoc. Do not add a TODO that suggests a runtime-configurable allowlist — per constraints, that is a separate task if ever wanted.

NO OTHER CHANGES. Do not touch the `ca.verify(client)` call, the catch block body, the warning log line, the ssl_options object, or anything in `services/`, `builders/`, `base/`, or any `.gitmodules` submodule. Do not refactor the helpers out of their nested scope (extraction is explicitly out of scope per scope §3 + YAGNI).
  </action>
  <verify>
    <automated>
node -e '
const getCertAttribute = (name, attributes = []) => {
  const a = attributes.find(e => e.name === name || e.shortName === name);
  return a ? a.value : undefined;
};
// Replica of the predicate AFTER the edit. If this file/literal drifts, fix the predicate, not the test.
const ALLOW = ["R10", "R11", "R12", "R13", "R14"];
const isSupportedLetsEncryptIssuer = (attributes = []) => {
  const org = getCertAttribute("organizationName", attributes) || getCertAttribute("O", attributes);
  const cn  = getCertAttribute("commonName", attributes)      || getCertAttribute("CN", attributes);
  return org === "Let'\''s Encrypt" && ALLOW.includes(cn);
};
const mk = (org, cn) => [
  { name: "organizationName", value: org },
  { name: "commonName",       value: cn  },
];
const cases = [
  // accept all 5 LE intermediates
  ["R10 leaf",            mk("Let'\''s Encrypt", "R10"), true],
  ["R11 leaf",            mk("Let'\''s Encrypt", "R11"), true],
  ["R12 leaf",            mk("Let'\''s Encrypt", "R12"), true],
  ["R13 leaf (today)",    mk("Let'\''s Encrypt", "R13"), true],
  ["R14 leaf",            mk("Let'\''s Encrypt", "R14"), true],
  // reject bogus CN under correct org
  ["R99 unknown",         mk("Let'\''s Encrypt", "R99"), false],
  ["Fake CN",             mk("Let'\''s Encrypt", "Fake"), false],
  // reject correct CN under wrong org
  ["wrong org R10",       mk("Fake CA",           "R10"), false],
  // reject empty/missing attrs
  ["empty attrs",         [],                              false],
];
let fail = 0;
for (const [name, attrs, want] of cases) {
  const got = isSupportedLetsEncryptIssuer(attrs);
  if (got !== want) {
    console.error(`FAIL ${name}: want=${want} got=${got}`);
    fail++;
  } else {
    console.log(`ok   ${name}`);
  }
}
process.exit(fail ? 1 : 0);
'
# Then confirm the actual file matches the replica (no comments, no surrounding noise):
grep -v "^[[:space:]]*//" thinx-core.js | grep -c "\\['R10', 'R11', 'R12', 'R13', 'R14'\\]"
# Expected: 1 (exactly one occurrence of the widened allowlist in non-comment code)
    </automated>
  </verify>
  <done>
- `thinx-core.js:70` (or wherever the predicate now lives after the edit) returns `['R10', 'R11', 'R12', 'R13', 'R14'].includes(commonName)` with the org-name guard unchanged.
- The comment block above the catch-block guard names R10–R14, flags the workaround nature, and records the 2026-05-31 refresh date.
- The `node -e` predicate replica above exits 0 (all 9 cases pass).
- The grep returns exactly `1`.
- No other lines in `thinx-core.js` modified. No files under `services/`, `builders/`, `base/`, `spec/test_repositories/thinx-firmware-esp8266/` touched.
  </done>
</task>

</tasks>

<verification>
Run the inline `node -e` predicate replica from Task 1 — it covers all 5 LE intermediates plus 4 rejection cases. The `grep -c` gate confirms the source literal was actually updated (filters out comment lines so the rationale text mentioning R10–R14 cannot self-satisfy the check).

No runtime verification of the full thinx-core startup is required for this fix — the helpers are pure and the predicate replica is faithful to their structure. End-to-end behavior (no more "Certificate verification failed" log at boot) will be observed on the next production deploy and noted in the SUMMARY.
</verification>

<success_criteria>
- `thinx-core.js` diff is ~2 lines (allowlist) + ~3-5 lines (comment replacement). Nothing else.
- The `node -e` predicate replica exits 0.
- `grep -v "^[[:space:]]*//" thinx-core.js | grep -c "\\['R10', 'R11', 'R12', 'R13', 'R14'\\]"` returns `1`.
- No new files. No config changes. No new dependencies. No submodule pointer movement.
</success_criteria>

<output>
Create `.planning/quick/260531-pdi-fix-the-let-s-encrypt-r10-r13-cross-sign/260531-pdi-SUMMARY.md` when done, noting:
- The exact lines edited (line numbers post-edit).
- That R11/R14 were added prophylactically and have not yet been observed in production.
- That the real fix (refreshing `/mnt/data/ssl/chain.pem`) remains an operator action and is not addressed by this code change.
- That `services/console` uncommitted submodule pointer was NOT touched (it is unrelated, per constraints).
</output>
