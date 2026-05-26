#!/bin/sh
# scripts/set-admin.sh
#
# Flip the admin flag on a managed_users CouchDB doc.
#
# Designed to run INSIDE the couchdb container (or any container that
# can reach couchdb on the docker network). The docker host typically
# cannot reach couchdb directly — that's why this script targets
# 127.0.0.1 by default.
#
# The API path for editing the admin field was deliberately blocked in
# commit 96e8e144 (defense-in-depth against mass-assignment via the
# users/edit design fn). Direct CouchDB access is the only remaining
# way to promote / demote admins. That is intentional.
#
# Usage (from inside couchdb container):
#   docker exec -it <couchdb-container> sh
#   apk add --no-cache jq   # (alpine) or: apt-get update && apt-get install -y jq (debian)
#   COUCHDB_USER=... COUCHDB_PASS=... sh /path/to/set-admin.sh
#
# Or one-shot from the host:
#   docker exec -e COUCHDB_USER=... -e COUCHDB_PASS=... \
#     -i <couchdb-container> sh < scripts/set-admin.sh
#
# Or from inside thinx-device-api container (override host):
#   COUCHDB_USER=... COUCHDB_PASS=... COUCHDB_HOST=couchdb \
#     sh scripts/set-admin.sh --yes

set -eu

DEFAULT_OWNER="4875d1b4794bac33de3774867e8abab825d344b08d916eb49f5e785e07fb452e"

OWNER="$DEFAULT_OWNER"
OWNER_EXPLICIT=0
TARGET_ADMIN="true"
ASSUME_YES=0

usage() {
  cat <<EOF
Flip the admin flag on a managed_users CouchDB doc.

Usage:
  $0 [OWNER_ID] [--admin true|false] [--yes]

Args:
  OWNER_ID    Owner hash (CouchDB _id in <prefix>managed_users).
              Default: $DEFAULT_OWNER  (the "Throw Away" account)

Flags:
  --admin V   Target value: true (promote) or false (demote). Default: true.
  --yes, -y   Skip the confirmation prompt.
  --help, -h  Show this help.

Env:
  COUCHDB_USER   required
  COUCHDB_PASS   required
  COUCHDB_HOST   default: 127.0.0.1 (use 'couchdb' when running from
                 another container on the docker network)
  COUCHDB_PORT   default: 5984

Requires: curl, jq.
  Alpine:  apk add --no-cache jq
  Debian:  apt-get update && apt-get install -y jq
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -y|--yes)  ASSUME_YES=1; shift ;;
    --admin)
      shift
      case "${1:-}" in
        true|false) TARGET_ADMIN="$1"; shift ;;
        *) echo "Error: --admin must be 'true' or 'false', got: ${1:-}" >&2; exit 1 ;;
      esac
      ;;
    --*) echo "Error: unknown flag: $1" >&2; exit 1 ;;
    *) OWNER="$1"; OWNER_EXPLICIT=1; shift ;;
  esac
done

[ -n "${COUCHDB_USER:-}" ] || { echo "Error: COUCHDB_USER must be set" >&2; exit 1; }
[ -n "${COUCHDB_PASS:-}" ] || { echo "Error: COUCHDB_PASS must be set" >&2; exit 1; }

HOST="${COUCHDB_HOST:-127.0.0.1}"
PORT="${COUCHDB_PORT:-5984}"
BASE="http://${HOST}:${PORT}"

command -v curl >/dev/null 2>&1 || { echo "Error: curl not found" >&2; exit 1; }
command -v jq   >/dev/null 2>&1 || {
  echo "Error: jq not found." >&2
  echo "Install with: apk add --no-cache jq  (alpine)" >&2
  echo "          or: apt-get update && apt-get install -y jq  (debian)" >&2
  exit 1
}

# -u "$USER:$PASS" sends Basic auth — never embed creds in the URL
# (some HTTP clients reject that; the docker-network host has no TLS,
# but creds-in-URL would also leak into proxy / access logs).
AUTH="-u ${COUCHDB_USER}:${COUCHDB_PASS}"

OWNER_LABEL="${OWNER}"
[ $OWNER_EXPLICIT -eq 0 ] && OWNER_LABEL="${OWNER}  (default — Throw Away)"
echo "CouchDB:    ${BASE}"
echo "Owner:      ${OWNER_LABEL}"
echo "Target:     admin = ${TARGET_ADMIN}"
echo

# 1. Discover the prefixed DB name (<prefix>managed_users)
DBS_JSON=$(curl -fsS $AUTH "${BASE}/_all_dbs") || {
  echo "Error: failed to list DBs (check COUCHDB_USER/PASS and network)" >&2
  exit 1
}
USER_DBS=$(echo "$DBS_JSON" | jq -r '.[] | select(endswith("managed_users"))')
[ -n "$USER_DBS" ] || { echo "Error: no *managed_users DB found at ${BASE}" >&2; exit 1; }
DB_COUNT=$(echo "$USER_DBS" | wc -l | tr -d ' ')
if [ "$DB_COUNT" -gt 1 ]; then
  echo "Error: multiple managed_users DBs found, ambiguous:" >&2
  echo "$USER_DBS" >&2
  exit 1
fi
DB="$USER_DBS"
echo "Resolved DB: ${DB}"

# 2. Fetch the doc (capture HTTP status separately so we can branch on 404)
TMP=$(mktemp -t set-admin.XXXXXX) || TMP="/tmp/set-admin.$$"
trap 'rm -f "$TMP"' EXIT INT TERM

HTTP_CODE=$(curl -s $AUTH \
  -o "$TMP" -w "%{http_code}" \
  "${BASE}/${DB}/${OWNER}")
case "$HTTP_CODE" in
  200) ;;
  404) echo "Error: owner ${OWNER} not found in ${DB}" >&2; exit 1 ;;
  *)   echo "Error: GET doc failed (HTTP $HTTP_CODE):" >&2; cat "$TMP" >&2; exit 1 ;;
esac

CURRENT_ADMIN=$(jq -r '.admin == true' "$TMP")
LABEL=$(jq -r '.username // .email // "(no username/email)"' "$TMP")
echo "Found:       ${LABEL}"
echo "  current admin: ${CURRENT_ADMIN}"

if [ "$CURRENT_ADMIN" = "$TARGET_ADMIN" ]; then
  echo "No change needed — admin is already ${TARGET_ADMIN}. Exiting."
  exit 0
fi

# 3. Confirm (unless --yes)
if [ $ASSUME_YES -eq 0 ]; then
  if [ "$TARGET_ADMIN" = "true" ]; then VERB="PROMOTE to admin"; else VERB="DEMOTE from admin"; fi
  printf "Proceed and %s this account? [y/N] " "$VERB"
  read -r REPLY || REPLY=""
  case "${REPLY}" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 2 ;;
  esac
fi

# 4. Build updated doc + PUT it back (preserve every other field + _rev)
UPDATED=$(jq --argjson admin "$TARGET_ADMIN" '. + {admin: $admin}' "$TMP")
PUT_RESPONSE=$(printf '%s' "$UPDATED" | curl -fsS $AUTH \
  -X PUT -H "Content-Type: application/json" \
  --data-binary @- "${BASE}/${DB}/${OWNER}") || {
  echo "Error: PUT failed" >&2
  exit 1
}
REV=$(echo "$PUT_RESPONSE" | jq -r '.rev')
echo "Wrote:       rev ${REV}"

# 5. Verify
VERIFY=$(curl -fsS $AUTH "${BASE}/${DB}/${OWNER}")
VERIFIED_ADMIN=$(echo "$VERIFY" | jq -r '.admin == true')
echo "Verified:    admin = ${VERIFIED_ADMIN}"
[ "$VERIFIED_ADMIN" = "$TARGET_ADMIN" ] || {
  echo "Error: verification failed — admin did not stick" >&2
  exit 1
}

echo
echo "Done."
