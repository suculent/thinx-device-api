/*
 * THINX-CERT-CHECK-01 — Startup ca.pem freshness probe (DETECT-only).
 *
 * Purpose
 * -------
 * ACME automation refreshes the leaf cert + private key but does NOT refresh
 * ca.pem (the pinned Let's Encrypt intermediate bundle). When LE rotates RSA
 * intermediates (R3 → R10 → R11/R12 → R13/R14, ISRG-signed) the renewed leaf
 * arrives signed by a NEWER intermediate while ca.pem still pins the older
 * one. The 2026-05-31 production incident was exactly this (R13 leaf vs
 * R10-pinned ca.pem) and surfaced only as a startup SSL verification error.
 *
 * This module exposes a PURE, READ-ONLY, NO-LOG probe that the caller (today
 * `thinx-core.js` near the SSL block) invokes once at startup. The probe
 * returns a plain result object; the caller decides whether to emit a
 * warning, raise a Rollbar event, or simply ignore the signal. Surfacing
 * is intentionally NOT done here — that keeps the module trivially testable
 * and prevents accidental log spam during unit tests.
 *
 * Hard guarantees (verified at module-grep level + at spec level)
 * ---------------------------------------------------------------
 *   1. Module body contains NO `console.log`, `console.warn`, or `rollbar`
 *      calls. Verifiable by grep.
 *   2. Module uses ONLY `fs.readFileSync` — never `fs.writeFile*`,
 *      `fs.unlink`, `fs.rename`, etc. Verifiable by grep + by the
 *      fixture-mtime invariance assertion in ZZ-CertProbeSpec.js.
 *   3. `probeCaFreshness` NEVER throws — all error paths return a
 *      well-formed result object with `ok:false` + a descriptive message.
 *
 * Allowlist duplication note
 * --------------------------
 * SUPPORTED_LE_INTERMEDIATES (R10..R14) duplicates the allowlist at
 * thinx-core.js:67-71. This is intentional per Phase 11 D-02: keep the
 * probe self-contained so it has no dependency on thinx-core.js's bootstrap
 * state. The list is a single line; the cost of duplication is lower than
 * the cost of reshaping thinx-core.js (which would violate the "additive
 * only" Quality Gate on the call site).
 */

const fs = require('fs');
const pki = require('node-forge').pki;

const SUPPORTED_LE_INTERMEDIATES = ['R10', 'R11', 'R12', 'R13', 'R14'];

// Mirrors thinx-core.js:62-65 helper. Duplicated for module independence.
function getCertAttribute(name, attributes = []) {
  const attribute = attributes.find((entry) => entry.name === name || entry.shortName === name);
  return attribute ? attribute.value : undefined;
}

// Extract the Common Name from a node-forge attributes array, falling back
// between the short ('CN') and long ('commonName') forms (node-forge can
// produce either depending on PEM origin).
function extractCN(attributes) {
  return getCertAttribute('CN', attributes) || getCertAttribute('commonName', attributes);
}

// Split a PEM bundle into individual certificate blocks and parse each.
// Real Let's Encrypt ca.pem files frequently bundle the intermediate
// alongside the ISRG Root cert; we parse all and return the array.
function parsePemChain(pemString) {
  const certs = [];
  // Match each "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
  // block. Greedy across newlines but anchored on the BEGIN/END markers.
  const pattern = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  const blocks = pemString.match(pattern) || [];
  for (const block of blocks) {
    try {
      certs.push(pki.certificateFromPem(block));
    } catch (_e) {
      // Skip unparseable blocks — main function decides whether the
      // overall result is ok:false based on whether ANY usable cert was
      // recovered. Silently skipping individual blocks matches OpenSSL's
      // own permissive bundle behavior.
    }
  }
  return certs;
}

/**
 * probeCaFreshness(certPath, caPath)
 *
 * DETECT-only probe. Reads the leaf cert and the ca.pem bundle, extracts
 * the leaf's Issuer.CN and every Subject.CN in the bundle, and reports
 * whether the bundle contains a cert matching the leaf's issuer.
 *
 * @param {string} certPath  Absolute path to the leaf cert PEM
 *                           (typically app_config.ssl_cert).
 * @param {string} caPath    Absolute path to the ca.pem PEM bundle
 *                           (typically app_config.ssl_ca).
 * @returns {{
 *   ok: boolean,
 *   leafIssuer: (string|null),
 *   caContains: string[],
 *   message: (string|null)
 * }}
 *
 * Return semantics
 * ----------------
 *   ok:true,  message:null         — chain matches OR leaf is non-LE
 *                                    (probe skipped — see edge case below)
 *   ok:false, message:<descriptive> — anything else (read error, parse
 *                                     error, or chain mismatch)
 *
 * Edge cases (all return without throwing)
 *   - leaf or ca file missing or unreadable → ok:false, leafIssuer:null
 *   - leaf or ca PEM is malformed           → ok:false, leafIssuer may be set
 *   - leaf Issuer.CN is not R10..R14         → ok:true with message
 *     'non-LE leaf — probe skipped' (this matches existing thinx-core.js
 *     behavior where non-LE certs are exempt from the rotation-tolerance
 *     branch)
 */
function probeCaFreshness(certPath, caPath) {
  let leafPem;
  try {
    leafPem = fs.readFileSync(certPath, 'utf8');
  } catch (e) {
    return {
      ok: false,
      leafIssuer: null,
      caContains: [],
      message: `could not read leaf cert at ${certPath}: ${e.code || e.message}`,
    };
  }

  let caPem;
  try {
    caPem = fs.readFileSync(caPath, 'utf8');
  } catch (e) {
    return {
      ok: false,
      leafIssuer: null,
      caContains: [],
      message: `could not read ca.pem at ${caPath}: ${e.code || e.message}`,
    };
  }

  let leaf;
  try {
    leaf = pki.certificateFromPem(leafPem);
  } catch (e) {
    return {
      ok: false,
      leafIssuer: null,
      caContains: [],
      message: `leaf cert at ${certPath} is not valid PEM: ${e.message || e}`,
    };
  }

  const leafIssuer = extractCN(leaf.issuer && leaf.issuer.attributes) || null;

  const caCerts = parsePemChain(caPem);
  const caContains = caCerts
    .map((c) => extractCN(c.subject && c.subject.attributes))
    .filter((cn) => typeof cn === 'string' && cn.length > 0);

  if (caCerts.length === 0) {
    return {
      ok: false,
      leafIssuer,
      caContains,
      message: `ca.pem at ${caPath} contained no parseable certificates`,
    };
  }

  // Non-LE leaves (e.g., self-signed dev certs, internal CAs) are exempt:
  // the probe only knows how to reason about the R10..R14 rotation cycle,
  // and emitting a warning for non-LE certs would be noise.
  if (!SUPPORTED_LE_INTERMEDIATES.includes(leafIssuer)) {
    return {
      ok: true,
      leafIssuer,
      caContains,
      message: 'non-LE leaf — probe skipped',
    };
  }

  if (caContains.includes(leafIssuer)) {
    return {
      ok: true,
      leafIssuer,
      caContains,
      message: null,
    };
  }

  return {
    ok: false,
    leafIssuer,
    caContains,
    message: `ca.pem does not contain the leaf's issuer '${leafIssuer}'; chain mismatch — found ${JSON.stringify(caContains)}. Refresh ca.pem from https://letsencrypt.org/certs/`,
  };
}

module.exports = { probeCaFreshness };
