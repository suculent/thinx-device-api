#!/usr/bin/env bash
#
# console-live-headers.sh — Phase 25 live edge-header check for both console hosts (read-only).
#
# For rtm.thinx.cloud and console.thinx.cloud and the paths /, /index.html, /app/,
# /p25-header-404 and /api/p25-header-probe, prints one line:
#
#   {host}{path} status={code} csp={CSP header count} xpcdp={X-Permitted-Cross-Domain-Policies values}
#     referrer={1|0} permissions={1|0}
#
# then `LIVE-HEADERS OK` when every line has csp=1, xpcdp=none, referrer=1 (strict-origin-when-cross-origin)
# and permissions=1 (the exact D-14 value), and / and /index.html answered 200; otherwise
# `LIVE-HEADERS FAIL {n}` and exit 1. Only header names and those fixed values are printed.

set -u

HOSTS="rtm.thinx.cloud console.thinx.cloud"
PATHS="/ /index.html /app/ /p25-header-404 /api/p25-header-probe"
PERMISSIONS="camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"

fail=0
for host in $HOSTS; do
  for path in $PATHS; do
    headers=$(curl -sS -m 20 -A thinx-p25-probe -o /dev/null -D - "https://${host}${path}" | tr -d '\r')
    status=$(printf '%s\n' "$headers" | awk 'NR==1{print $2}')
    csp=$(printf '%s\n' "$headers" | grep -ci '^content-security-policy:')
    xpcdp=$(printf '%s\n' "$headers" | grep -i '^x-permitted-cross-domain-policies:' | sed 's/^[^:]*:[[:space:]]*//' | sort -u | paste -sd, -)
    referrer=$(printf '%s\n' "$headers" | grep -ciE '^referrer-policy:[[:space:]]*strict-origin-when-cross-origin$')
    permissions=$(printf '%s\n' "$headers" | grep -i '^permissions-policy:' | sed 's/^[^:]*:[[:space:]]*//' | grep -cxF "$PERMISSIONS")
    [ "$referrer" -gt 1 ] && referrer=1
    [ "$permissions" -gt 1 ] && permissions=1
    echo "${host}${path} status=${status:-none} csp=${csp} xpcdp=${xpcdp:-none-sent} referrer=${referrer} permissions=${permissions}"

    ok=1
    [ "$csp" = "1" ] || ok=0
    [ "$xpcdp" = "none" ] || ok=0
    [ "$referrer" = "1" ] || ok=0
    [ "$permissions" = "1" ] || ok=0
    case "$path" in
      /|/index.html) [ "${status:-}" = "200" ] || ok=0 ;;
    esac
    [ "$ok" = "1" ] || fail=$((fail + 1))
  done
done

if [ "$fail" = "0" ]; then
  echo "LIVE-HEADERS OK"
else
  echo "LIVE-HEADERS FAIL ${fail}"
  exit 1
fi
