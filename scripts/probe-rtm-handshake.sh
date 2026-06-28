#!/bin/bash
set -euo pipefail
#
# scripts/probe-rtm-handshake.sh — SEC-WS-01 / OPS-EXEC-01 edge-handshake probe
#
# Requirement: OPS-EXEC-01 (Phase 13, v1.10 milestone)
# Source-of-truth runbook: .planning/runbooks/websocket-handshake.md
#   (canonical 7-row reproduction table at lines ~27–37).
#
# Purpose: reusable evidence-capture probe that reproduces the runbook's
# 7-row reproduction table verbatim against rtm.thinx.cloud. Designed to be
# run twice across a SEC-WS-01 swarm-host edit — once BEFORE the edit
# (pre-fix baseline; expect 4/4 bare-nginx-404 on rows 4–7) and once AFTER
# the edit (post-fix; expect 0/4). Output is plain text designed for
# verbatim paste into the runbook's Execution Annex (per D-09).
#
# Dependencies: only `curl` and core POSIX shell. No package-manager
# installs, no runtime VMs, no extra parsers. Runs from any
# internet-connected workstation (operator laptop or a CI runner alike).
#
# Hardening: matches `base/update.sh` (Phase 11 BASE-IMG-01) pattern —
# `set -euo pipefail`, shellcheck-clean, no `eval`, no `xargs`, quoted
# variable expansions throughout. The script is DETECT-only per D-11: it
# captures state, it does not mutate. Exit code is always 0; failure modes
# surface in the output text, not the exit status.
#

# -----------------------------------------------------------------------------
# (1) Hardcoded target — single host, no flags (per D-Discretion). The
#     pre/post difference lives in the captured state, not the script.
# -----------------------------------------------------------------------------
TARGET="rtm.thinx.cloud"
TIMESTAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# -----------------------------------------------------------------------------
# (2) Header banner — pastes verbatim into the Execution Annex.
# -----------------------------------------------------------------------------
printf '=== probe-rtm-handshake.sh ===\n'
printf 'Target host : %s\n' "$TARGET"
printf 'Timestamp UTC: %s\n' "$TIMESTAMP_UTC"
printf 'Purpose     : SEC-WS-01 / OPS-EXEC-01 edge-handshake reproduction (7-row table).\n'
printf '\n'

# -----------------------------------------------------------------------------
# (3) probe() helper — variadic extra curl args after fixed (label, path).
#     Filters response headers to status + Server + CSP + CORS using a
#     non-fatal grep (the `|| true` is scoped to ONLY the filter so an
#     empty match never trips `set -e`). Captured curl output is held in
#     a local variable so the grep filter does not race the curl exit.
# -----------------------------------------------------------------------------
probe() {
  local label="$1"
  local path="$2"
  shift 2
  printf -- '--- %s ---\n' "$label"
  local captured
  captured="$(curl -sI "$@" "https://${TARGET}${path}" || true)"
  printf '%s\n' "$captured" \
    | grep -Ei '^(HTTP/|Server:|Content-Security-Policy:|Access-Control-Allow-Origin:)' \
    || true
  printf '\n'
}

# -----------------------------------------------------------------------------
# (4) WS upgrade-header set — reused for rows 2, 5, 6, 7. The
#     Sec-WebSocket-Key value is the canonical test nonce from RFC 6455
#     §1.3. The script does not validate the server's accept-key; it only
#     captures the response status + selected headers.
# -----------------------------------------------------------------------------
WS_HEADERS=(
  -H 'Connection: upgrade'
  -H 'Upgrade: websocket'
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=='
  -H 'Sec-WebSocket-Version: 13'
)

# -----------------------------------------------------------------------------
# (5) 7 probes — one per row of the runbook reproduction table.
# -----------------------------------------------------------------------------
probe 'Row 1: GET /'                                              '/'
probe 'Row 2: GET /api/v2/users + WS upgrade'                     '/api/v2/users' "${WS_HEADERS[@]}"
probe 'Row 3: GET /api/githook'                                   '/api/githook'
probe 'Row 4: GET /test'                                          '/test'
probe 'Row 5: GET /test + WS upgrade'                             '/test' "${WS_HEADERS[@]}"
probe 'Row 6: GET /test + WS upgrade + HTTP/1.1 forced'           '/test' --http1.1 "${WS_HEADERS[@]}"
probe 'Row 7: GET /suculent + WS upgrade + HTTP/1.1 + Cookie'     '/suculent' --http1.1 "${WS_HEADERS[@]}" -H 'Cookie: x-thx-core=test'

# -----------------------------------------------------------------------------
# (6) Footer summary — count rows 4–7 that returned bare nginx (Server:
#     nginx) WITHOUT any helmet Content-Security-Policy: header. This is
#     the runbook's "Key distinction" diagnostic (line ~37). Pre-fix
#     expected 4/4; post-fix expected 0/4. The count is recomputed by
#     re-running the 4 row-4..7 probes silently and inspecting the
#     captured output for each.
# -----------------------------------------------------------------------------
bare_count() {
  local path="$1"
  shift
  local out
  out="$(curl -sI "$@" "https://${TARGET}${path}" || true)"
  if printf '%s\n' "$out" | grep -qi '^Server: nginx' \
     && ! printf '%s\n' "$out" | grep -qi '^Content-Security-Policy:'; then
    printf '1'
  else
    printf '0'
  fi
}

ROW4="$(bare_count '/test')"
ROW5="$(bare_count '/test' "${WS_HEADERS[@]}")"
ROW6="$(bare_count '/test' --http1.1 "${WS_HEADERS[@]}")"
ROW7="$(bare_count '/suculent' --http1.1 "${WS_HEADERS[@]}" -H 'Cookie: x-thx-core=test')"
BARE_TOTAL=$((ROW4 + ROW5 + ROW6 + ROW7))

printf '=== Summary ===\n'
printf 'Bare-nginx-404 rows (4-7) detected: %d/4\n' "$BARE_TOTAL"
printf '  Pre-fix expected : 4/4 (edge nginx returns bare 404 — Express not reached)\n'
printf '  Post-fix expected: 0/4 (Express reached — helmet CSP + CORS visible on rows 4–7)\n'

# DETECT-only tool per D-11 — exit code stays 0 regardless of the diagnostic.
exit 0
