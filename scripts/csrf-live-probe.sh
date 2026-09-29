#!/usr/bin/env bash
#
# csrf-live-probe.sh — Phase 25 production CSRF probe (read-only).
#
# Prints key=value lines only. It never prints a cookie value or a token: every
# value is a count, a shape name, a TTL in seconds or "{http_code}:{response}",
# and a response field that looks like a long hex value is replaced by
# "<redacted>". Every probe body is empty ({}) or names a non-existent owner
# (64 zeros), so no handler changes data; the handlers refuse before any write.
#
# Usage:
#   scripts/csrf-live-probe.sh            # base probe
#   scripts/csrf-live-probe.sh --guards   # base probe + route-guard probes
#   PROBE_API=https://app.thinx.cloud/api scripts/csrf-live-probe.sh
#
# Requires bash, curl, awk, openssl. User-Agent: thinx-p25-probe.
# Exit 0 when every request completed (whatever the status), 2 when any curl
# transport call failed.
#
# Keys (in order):
#   anon_set_cookie    Set-Cookie x-thx-core= plus XSRF-TOKEN= on a cookieless GET
#                      $PROBE_API/p25-anon-probe
#   prime_token_shape  XSRF-TOKEN from GET $PROBE_API/csrf-token (jar A):
#                      signed | legacy (48 hex) | none | other
#   pre_session_ttl_s  jar A x-thx-core expiry minus now (0 when none was set)
#   valid              POST $PROBE_API/user/create {} with jar A's pair
#   planted            jar A's x-thx-core + jar B's token (B primed separately)
#   stale              jar A's x-thx-core + `openssl rand -hex 24` as the pair
#   header_less        no cookies, no header
# With --guards (fresh jar C):
#   v2user_unprimed, v2user_primed, cookie_only_delete_v2user,
#   cookie_only_user_delete, cookie_only_gdpr_revoke, cookie_only_profile,
#   paired_profile
#
# Expected values per CSRF_MODE (production runs with CSRF_ENFORCE=true):
#   legacy   anon_set_cookie=1  prime_token_shape=legacy  pre_session_ttl_s=0
#            valid, planted and stale = {code}:email_required
#            header_less=403:csrf_token_invalid
#   observe  anon_set_cookie=0  prime_token_shape=signed  pre_session_ttl_s ~900 (0 < t <= 900)
#            valid, planted and stale = {code}:email_required (the binding failures
#            are only logged and counted: binding_mismatch, stale)
#            header_less=403:csrf_token_invalid
#   signed   anon_set_cookie=0  prime_token_shape=signed  pre_session_ttl_s ~900
#            valid={code}:email_required
#            planted=403:csrf_token_invalid  stale=403:csrf_token_invalid
#            header_less=403:csrf_token_invalid
#   guards   (after the route guards ship)
#            v2user_unprimed=403:csrf_token_invalid
#            v2user_primed = the handler's own refusal (not csrf_token_invalid)
#            cookie_only_delete_v2user, cookie_only_user_delete,
#            cookie_only_gdpr_revoke, cookie_only_profile = 403:csrf_token_invalid
#            paired_profile = the handler's own answer (not csrf_token_invalid)
#

set -u

PROBE_API="${PROBE_API:-https://app.thinx.cloud/api}"
PROBE_API="${PROBE_API%/}"
UA="thinx-p25-probe"
GUARDS=0

for arg in "$@"; do
  case "$arg" in
    --guards) GUARDS=1 ;;
    -h|--help) sed -n '2,60p' "$0"; exit 0 ;;
    *) echo "usage: $0 [--guards]" >&2; exit 64 ;;
  esac
done

TMP=$(mktemp -d "${TMPDIR:-/tmp}/csrf-probe.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

TRANSPORT_FAIL=0
ZERO_OWNER=$(printf '0%.0s' $(seq 1 64))
OWNER_BODY="{\"owner\":\"${ZERO_OWNER}\"}"

# Value of cookie $2 in curl jar $1 (column 6 = name, 7 = value). HttpOnly
# cookies are written as "#HttpOnly_<domain>", so comment lines are not skipped
# blindly.
jar_value() {
  [ -f "$1" ] || return 0
  awk -v n="$2" 'BEGIN{FS="\t"} ($0 !~ /^# / && NF >= 7 && $6 == n) {v=$7} END{if (v != "") print v}' "$1"
}

# Expiry epoch (column 5) of cookie $2 in jar $1, empty when absent.
jar_expiry() {
  [ -f "$1" ] || return 0
  awk -v n="$2" 'BEGIN{FS="\t"} ($0 !~ /^# / && NF >= 7 && $6 == n) {v=$5} END{if (v != "") print v}' "$1"
}

token_shape() {
  local t="$1"
  if [ -z "$t" ]; then echo none; return; fi
  if printf '%s' "$t" | grep -Eq '^[0-9a-f]{64}\.[0-9a-f]{32}$'; then echo signed; return; fi
  if printf '%s' "$t" | grep -Eq '^[0-9a-f]{48}$'; then echo legacy; return; fi
  echo other
}

# The "response" string of a JSON body, redacted when it looks like a token.
response_field() {
  local r
  r=$(sed -n 's/.*"response"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" 2>/dev/null | head -n 1)
  if printf '%s' "$r" | grep -Eq '[0-9a-fA-F]{24,}'; then r="<redacted>"; fi
  printf '%s' "$r"
}

# Prime a jar: GET $PROBE_API/csrf-token with the cookie jar $1.
prime() {
  if ! curl -sS -o /dev/null -A "$UA" --max-time 20 -c "$1" "$PROBE_API/csrf-token" 2>"$TMP/err"; then
    TRANSPORT_FAIL=1
  fi
}

# request METHOD PATH BODY COOKIE_HEADER XSRF_HEADER -> prints {code}:{response}
request() {
  local method="$1" path="$2" body="$3" cookie="$4" xsrf="$5" code
  local args=(-sS -o "$TMP/body" -w '%{http_code}' -A "$UA" --max-time 20 -X "$method"
    -H "Content-Type: application/json" --data "$body")
  [ -n "$cookie" ] && args+=(-H "Cookie: $cookie")
  [ -n "$xsrf" ] && args+=(-H "X-XSRF-TOKEN: $xsrf")
  : > "$TMP/body"
  if ! code=$(curl "${args[@]}" "$PROBE_API$path" 2>"$TMP/err"); then
    TRANSPORT_FAIL=1
    code="000"
  fi
  printf '%s:%s' "$code" "$(response_field "$TMP/body")"
}

# Cookie header from a session value and an XSRF value (either may be empty).
cookie_header() {
  local sess="$1" xsrf="$2" out=""
  [ -n "$sess" ] && out="x-thx-core=$sess"
  if [ -n "$xsrf" ]; then
    [ -n "$out" ] && out="$out; "
    out="${out}XSRF-TOKEN=$xsrf"
  fi
  printf '%s' "$out"
}

# --- anon_set_cookie -------------------------------------------------------
if curl -sS -o /dev/null -D "$TMP/anon.h" -A "$UA" --max-time 20 "$PROBE_API/p25-anon-probe" 2>"$TMP/err"; then
  ANON=$(grep -ciE '^set-cookie:[[:space:]]*(x-thx-core|XSRF-TOKEN)=' "$TMP/anon.h" || true)
else
  TRANSPORT_FAIL=1
  ANON=0
fi
echo "anon_set_cookie=${ANON}"

# --- jar A prime ------------------------------------------------------------
JAR_A="$TMP/jarA"
prime "$JAR_A"
A_SESS=$(jar_value "$JAR_A" "x-thx-core")
A_XSRF=$(jar_value "$JAR_A" "XSRF-TOKEN")
echo "prime_token_shape=$(token_shape "$A_XSRF")"

A_EXP=$(jar_expiry "$JAR_A" "x-thx-core")
if [ -n "$A_SESS" ] && [ -n "$A_EXP" ] && [ "$A_EXP" != "0" ]; then
  TTL=$(( A_EXP - $(date +%s) ))
  [ "$TTL" -lt 0 ] && TTL=0
else
  TTL=0
fi
echo "pre_session_ttl_s=${TTL}"

# --- valid / planted / stale / header_less ---------------------------------
echo "valid=$(request POST /user/create '{}' "$(cookie_header "$A_SESS" "$A_XSRF")" "$A_XSRF")"

JAR_B="$TMP/jarB"
prime "$JAR_B"
B_XSRF=$(jar_value "$JAR_B" "XSRF-TOKEN")
echo "planted=$(request POST /user/create '{}' "$(cookie_header "$A_SESS" "$B_XSRF")" "$B_XSRF")"

STALE=$(openssl rand -hex 24)
echo "stale=$(request POST /user/create '{}' "$(cookie_header "$A_SESS" "$STALE")" "$STALE")"

echo "header_less=$(request POST /user/create '{}' '' '')"

# --- route guards (optional) -------------------------------------------------
if [ "$GUARDS" = "1" ]; then
  JAR_C="$TMP/jarC"
  prime "$JAR_C"
  C_SESS=$(jar_value "$JAR_C" "x-thx-core")
  C_XSRF=$(jar_value "$JAR_C" "XSRF-TOKEN")
  C_COOKIE=$(cookie_header "$C_SESS" "$C_XSRF")

  echo "v2user_unprimed=$(request POST /v2/user '{}' '' '')"
  echo "v2user_primed=$(request POST /v2/user '{}' "$C_COOKIE" "$C_XSRF")"
  echo "cookie_only_delete_v2user=$(request DELETE /v2/user "$OWNER_BODY" "$C_COOKIE" '')"
  echo "cookie_only_user_delete=$(request POST /user/delete "$OWNER_BODY" "$C_COOKIE" '')"
  echo "cookie_only_gdpr_revoke=$(request POST /gdpr/revoke "$OWNER_BODY" "$C_COOKIE" '')"
  echo "cookie_only_profile=$(request POST /v2/profile '{}' "$C_COOKIE" '')"
  echo "paired_profile=$(request POST /v2/profile '{}' "$C_COOKIE" "$C_XSRF")"
fi

if [ "$TRANSPORT_FAIL" != "0" ]; then
  exit 2
fi
exit 0
