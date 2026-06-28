#!/bin/bash
# THINX-CERT-CHECK-01 — fixture PEM regenerator.
#
# Generates 4 self-signed test PEMs used by spec/jasmine/ZZ-CertProbeSpec.js
# to exercise lib/thinx/cert-probe.js's chain-mismatch detection:
#
#   R10-leaf.pem   Subject.CN=R10  Issuer.CN=R10   (self-signed → Issuer==Subject)
#   R10-ca.pem     Subject.CN=R10  Issuer.CN=R10
#   R13-leaf.pem   Subject.CN=R13  Issuer.CN=R13
#   R13-ca.pem     Subject.CN=R13  Issuer.CN=R13
#
# Self-signed Issuer.CN==Subject.CN is sufficient because the probe only
# inspects the leaf's Issuer.CN and the ca chain's Subject.CN — the fixtures
# do not need to form a cryptographically valid chain. Real production
# leaves are signed BY R10/R13 (their Issuer.CN is R10/R13; their Subject.CN
# is the domain), which the probe handles identically.
#
# Validity: 36500 days (≈100 years) so the fixtures never expire and CI
# never goes red on a fixture clock drift.
#
# Operator usage (from repo root):
#   bash spec/fixtures/cert-probe/generate.sh
#
# Re-running overwrites existing fixtures; commit the new .pem files when
# you're satisfied with the output.
#
# Requirements: openssl on PATH. Tested against OpenSSL/LibreSSL.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

generate_pem() {
    local name="$1"
    local out="${SCRIPT_DIR}/${name}.pem"
    local key="${TMP_DIR}/${name}.key"
    local cn

    case "${name}" in
        R10-*) cn="R10" ;;
        R13-*) cn="R13" ;;
        *)
            echo "❌ unknown fixture name: ${name}" >&2
            exit 1
            ;;
    esac

    echo "→ generating ${out} (Subject.CN=${cn}, Issuer.CN=${cn})"
    openssl req -x509 -newkey rsa:2048 -nodes -days 36500 \
        -subj "/O=Let's Encrypt/CN=${cn}" \
        -keyout "${key}" \
        -out "${out}" \
        2>/dev/null
}

generate_pem "R10-leaf"
generate_pem "R10-ca"
generate_pem "R13-leaf"
generate_pem "R13-ca"

echo ""
echo "✅ generated 4 fixture PEMs at ${SCRIPT_DIR}/"
echo ""
echo "verification:"
for f in "${SCRIPT_DIR}"/*.pem; do
    subj="$(openssl x509 -in "${f}" -noout -subject 2>/dev/null)"
    iss="$(openssl x509 -in "${f}" -noout -issuer 2>/dev/null)"
    echo "  $(basename "${f}")"
    echo "    ${subj}"
    echo "    ${iss}"
done
