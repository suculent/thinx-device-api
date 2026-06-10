#!/bin/sh
# scripts/set-username.sh
#
# Set the login `username` on a managed_users CouchDB doc, by owner_id.
#
# WHY THIS EXISTS
#   The legacy register form posted the chosen login name in the `owner`
#   field (input name="owner"), but Owner.create read only `body.username`,
#   so the chosen name was discarded and doc.username fell back to the email
#   hash (== owner_id). Affected accounts can only log in by owner_id.
#   The code fix (Owner.create accepts the `owner` field) is forward-looking;
#   this script repairs EXISTING docs whose username is still the hash.
#
# WHO CAN RUN IT
#   Anyone with infrastructure access (docker/CouchDB on the swarm). There is
#   deliberately NO thinx-admin API path for this — same posture as
#   scripts/set-admin.sh. Direct CouchDB access is the intended channel.
#
# WHERE TO RUN IT
#   Inside the couchdb container, or any container that can reach couchdb on
#   the docker network. The docker host usually cannot reach couchdb directly
#   (it only listens on the internal overlay), which is why HOST defaults to
#   127.0.0.1 (run from inside couchdb) — override with COUCHDB_HOST=couchdb
#   when running from another container (e.g. thinx_api).
#
# Usage (from inside the couchdb container):
#   docker exec -it <couchdb-container> sh
#   apk add --no-cache jq    # (alpine)  or: apt-get update && apt-get install -y jq (debian)
#   COUCHDB_USER=... COUCHDB_PASS=... sh /path/to/set-username.sh <OWNER_ID> <NEW_USERNAME>
#
# One-shot from the host (pipe the script into the couchdb container):
#   docker exec -e COUCHDB_USER=... -e COUCHDB_PASS=... \
#     -i <couchdb-container> sh -s -- <OWNER_ID> <NEW_USERNAME> --yes < scripts/set-username.sh
#
# From inside the thinx_api container (override host to the overlay name):
#   COUCHDB_USER=... COUCHDB_PASS=... COUCHDB_HOST=couchdb \
#     sh scripts/set-username.sh <OWNER_ID> <NEW_USERNAME> --yes

set -eu

OWNER=""
NEW_USERNAME=""
ASSUME_YES=0
POSITIONAL=0

usage() {
  cat <<EOF
Set the login username on a managed_users CouchDB doc, by owner_id.

Usage:
  $0 <OWNER_ID> <NEW_USERNAME> [--yes]

Args:
  OWNER_ID       Owner hash (CouchDB _id in <prefix>managed_users). 64 hex chars.
  NEW_USERNAME   The login name to store in doc.username.

Flags:
  --yes, -y      Skip the confirmation prompt.
  --help, -h     Show this help.

Env:
  COUCHDB_USER   required
  COUCHDB_PASS   required
  COUCHDB_HOST   default: 127.0.0.1 (use 'couchdb' from another container)
  COUCHDB_PORT   default: 5984

Notes:
  - NEW_USERNAME must NOT contain any of  { } \\ " ' ; & @  — Sanitka.username()
    strips these at login (lib/thinx/sanitka.js), so a stored name containing
    them would never match what the user types. The script rejects them.
  - The name must be UNIQUE: Owner.validate() treats >1 match as failure, so a
    duplicate username would break login for everyone sharing it. The script
    checks the owners_by_username view and refuses a name already taken by a
    different owner.

Requires: curl, jq.
  Alpine:  apk add --no-cache jq
  Debian:  apt-get update && apt-get install -y jq
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -y|--yes)  ASSUME_YES=1; shift ;;
    --*) echo "Error: unknown flag: $1" >&2; exit 1 ;;
    *)
      if [ $POSITIONAL -eq 0 ]; then OWNER="$1"; POSITIONAL=1
      elif [ $POSITIONAL -eq 1 ]; then NEW_USERNAME="$1"; POSITIONAL=2
      else echo "Error: unexpected extra argument: $1" >&2; exit 1; fi
      shift ;;
  esac
done

[ -n "$OWNER" ]        || { echo "Error: OWNER_ID is required." >&2; usage >&2; exit 1; }
[ -n "$NEW_USERNAME" ] || { echo "Error: NEW_USERNAME is required." >&2; usage >&2; exit 1; }
[ -n "${COUCHDB_USER:-}" ] || { echo "Error: COUCHDB_USER must be set" >&2; exit 1; }
[ -n "${COUCHDB_PASS:-}" ] || { echo "Error: COUCHDB_PASS must be set" >&2; exit 1; }

# Validate OWNER_ID shape (managed_users _id is a 64-char sha256 hex)
if ! printf '%s' "$OWNER" | grep -Eq '^[0-9a-f]{64}$'; then
  echo "Error: OWNER_ID does not look like a 64-char hex owner hash: $OWNER" >&2
  exit 1
fi

# Reject usernames carrying chars that Sanitka.username() strips at login
# (lib/thinx/sanitka.js strips  { } \ " ' ; & @ ). tr deletes the same set;
# if anything was removed, the typed name would never match what is stored.
SANITIZED=$(printf '%s' "$NEW_USERNAME" | tr -d '{}\\"'"'"';&@')
if [ "$SANITIZED" != "$NEW_USERNAME" ]; then
  echo "Error: NEW_USERNAME contains a character stripped at login ( { } \\ \" ' ; & @ )." >&2
  echo "       Choose a name without those characters." >&2
  exit 1
fi

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

# -u sends Basic auth — never embed creds in the URL (leaks into logs).
AUTH="-u ${COUCHDB_USER}:${COUCHDB_PASS}"

echo "CouchDB:     ${BASE}"
echo "Owner:       ${OWNER}"
echo "New username: ${NEW_USERNAME}"
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

# 2. Fetch the target doc (branch on 404)
TMP=$(mktemp -t set-username.XXXXXX) || TMP="/tmp/set-username.$$"
trap 'rm -f "$TMP"' EXIT INT TERM

HTTP_CODE=$(curl -s $AUTH -o "$TMP" -w "%{http_code}" "${BASE}/${DB}/${OWNER}")
case "$HTTP_CODE" in
  200) ;;
  404) echo "Error: owner ${OWNER} not found in ${DB}" >&2; exit 1 ;;
  *)   echo "Error: GET doc failed (HTTP $HTTP_CODE):" >&2; cat "$TMP" >&2; exit 1 ;;
esac

CURRENT_USERNAME=$(jq -r '.username // "(none)"' "$TMP")
LABEL=$(jq -r '.email // "(no email)"' "$TMP")
echo "Found:       ${LABEL}"
echo "  current username: ${CURRENT_USERNAME}"

if [ "$CURRENT_USERNAME" = "$NEW_USERNAME" ]; then
  echo "No change needed — username is already '${NEW_USERNAME}'. Exiting."
  exit 0
fi

# 3. Uniqueness check — the new name must not belong to a DIFFERENT owner.
#    owners_by_username emits doc.username; Owner.validate() fails on >1 match.
ENC_KEY=$(jq -rn --arg v "$NEW_USERNAME" '$v|@uri')
VIEW_JSON=$(curl -fsS $AUTH \
  "${BASE}/${DB}/_design/users/_view/owners_by_username?key=%22${ENC_KEY}%22") || {
  echo "Error: owners_by_username view query failed" >&2
  exit 1
}
CONFLICTS=$(echo "$VIEW_JSON" | jq -r --arg me "$OWNER" '[.rows[]? | select(.id != $me) | .id] | length')
if [ "${CONFLICTS:-0}" -gt 0 ]; then
  echo "Error: username '${NEW_USERNAME}' is already taken by another owner:" >&2
  echo "$VIEW_JSON" | jq -r --arg me "$OWNER" '.rows[]? | select(.id != $me) | "  owner=\(.id)"' >&2
  echo "Refusing to create a duplicate (would break login for both)." >&2
  exit 1
fi

# 4. Confirm (unless --yes)
if [ $ASSUME_YES -eq 0 ]; then
  printf "Change username '%s' -> '%s' for owner %s? [y/N] " \
    "$CURRENT_USERNAME" "$NEW_USERNAME" "$OWNER"
  read -r REPLY || REPLY=""
  case "${REPLY}" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 2 ;;
  esac
fi

# 5. Build updated doc + PUT it back (preserve every other field + _rev)
UPDATED=$(jq --arg u "$NEW_USERNAME" '. + {username: $u}' "$TMP")
PUT_RESPONSE=$(printf '%s' "$UPDATED" | curl -fsS $AUTH \
  -X PUT -H "Content-Type: application/json" \
  --data-binary @- "${BASE}/${DB}/${OWNER}") || {
  echo "Error: PUT failed" >&2
  exit 1
}
REV=$(echo "$PUT_RESPONSE" | jq -r '.rev')
echo "Wrote:       rev ${REV}"

# 6. Verify
VERIFY=$(curl -fsS $AUTH "${BASE}/${DB}/${OWNER}")
VERIFIED_USERNAME=$(echo "$VERIFY" | jq -r '.username // "(none)"')
echo "Verified:    username = ${VERIFIED_USERNAME}"
[ "$VERIFIED_USERNAME" = "$NEW_USERNAME" ] || {
  echo "Error: verification failed — username did not stick" >&2
  exit 1
}

echo
echo "Done. The account can now log in with username '${NEW_USERNAME}'."
echo "(If the owners_by_username view index lags, allow a moment before first login.)"
