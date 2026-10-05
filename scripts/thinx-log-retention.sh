#!/usr/bin/env bash
#
# scripts/thinx-log-retention.sh
#
# Host wrapper for the Phase 26 retention job (LOG-04, D-16, D-17). Plan 26-08
# installs it on the swarm manager as /usr/local/sbin/thinx-log-retention.sh
# (root:root 0755) and schedules it from /etc/cron.d/thinx-log-retention.
#
# It runs scripts/log-retention.js in a ONE-SHOT container from the image of
# the running thinx_api service, on the thinx_internal overlay, capped at
# 256 MB. It never uses `docker exec` into the 256M-capped API container
# (D-17, Pitfall 8), and never the CouchDB container (no curl there; that is
# what broke the old couchdb-log-retention job, Pitfall 9).
#
# Arguments are the CLI's own:
#   (none) | --dry-run                                   dry run (default)
#   --apply --roots <deploy|repos|deploy,repos|none> [--no-audit]
#
# Mounts: a root is mounted read-write ONLY when the arguments contain
# --apply and --roots names it. Every other mount, and every mount of a dry
# run or of --roots none, is read-only, so a root the operator did not approve
# cannot be written even by a faulty run (D-16).
#
# Credentials: COUCHDB_USER and COUCHDB_PASS are read from the service spec of
# THINX_RETENTION_SERVICE, exported, and passed to docker by NAME (-e NAME),
# so the values never appear in argv, in the log or on stdout.
#
# Exit codes: 0 only when the container exited 0 AND its last output line is
# `LOG-RETENTION DRY-RUN OK` or `LOG-RETENTION APPLY OK` (empty output is a
# failure, Pitfall 9); 0 also when another run holds the lock; 1 on any
# failure; 2 on a usage error.
#
# Test overrides (env): THINX_RETENTION_LOG, THINX_RETENTION_LOCK,
# THINX_RETENTION_SERVICE, THINX_RETENTION_NETWORK,
# THINX_RETENTION_DEPLOY_HOST, THINX_RETENTION_REPOS_HOST, COUCHDB_HOST,
# THINX_PREFIX.
#
# Never enable shell tracing in this file: it would print the credentials.

set -uo pipefail

LOG=${THINX_RETENTION_LOG:-/var/log/thinx-log-retention.log}
LOCK=${THINX_RETENTION_LOCK:-/var/lock/thinx-log-retention.lock}
SERVICE=${THINX_RETENTION_SERVICE:-thinx_api}
NETWORK=${THINX_RETENTION_NETWORK:-thinx_internal}
DEPLOY_HOST=${THINX_RETENTION_DEPLOY_HOST:-/mnt/gluster/thinx/deploy}
REPOS_HOST=${THINX_RETENTION_REPOS_HOST:-/mnt/gluster/thinx/repos}
export COUCHDB_HOST=${COUCHDB_HOST:-couchdb}
export THINX_PREFIX=${THINX_PREFIX:-}

ARGS_TEXT="$*"

log_line() {
  mkdir -p "$(dirname "$LOG")" 2>/dev/null
  printf '%s\n' "$1" >> "$LOG"
}

header() {
  log_line "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] thinx-log-retention ${ARGS_TEXT}"
}

die() {
  # $1 = message (no secrets), $2 = exit code
  header
  log_line "wrapper: $1"
  echo "wrapper: $1"
  exit "$2"
}

usage() {
  echo "usage: thinx-log-retention.sh [--dry-run]"
  echo "       thinx-log-retention.sh --apply --roots <deploy|repos|deploy,repos|none> [--no-audit]"
  echo "error=usage:$1"
  exit 2
}

# --- 1. Arguments (same contract as scripts/log-retention.js) --------------

APPLY=0
DRY=0
NO_AUDIT=0
HAVE_ROOTS=0
ROOTS=""
ARGV=("$@")
i=0
while [ "$i" -lt "${#ARGV[@]}" ]; do
  a=${ARGV[$i]}
  case "$a" in
    --apply) APPLY=1 ;;
    --dry-run) DRY=1 ;;
    --no-audit) NO_AUDIT=1 ;;
    -h|--help)
      echo "usage: thinx-log-retention.sh [--dry-run]"
      echo "       thinx-log-retention.sh --apply --roots <deploy|repos|deploy,repos|none> [--no-audit]"
      exit 0
      ;;
    --roots)
      i=$((i + 1))
      [ "$i" -lt "${#ARGV[@]}" ] || usage roots_missing
      ROOTS=${ARGV[$i]}
      HAVE_ROOTS=1
      ;;
    *) usage unknown_argument ;;
  esac
  i=$((i + 1))
done

[ "$APPLY" -eq 1 ] && [ "$DRY" -eq 1 ] && usage apply_and_dry_run
[ "$APPLY" -eq 1 ] && [ "$HAVE_ROOTS" -eq 0 ] && usage roots_required
[ "$APPLY" -eq 0 ] && [ "$HAVE_ROOTS" -eq 1 ] && usage roots_without_apply
[ "$APPLY" -eq 0 ] && [ "$NO_AUDIT" -eq 1 ] && usage no_audit_without_apply

RW_DEPLOY=0
RW_REPOS=0
if [ "$HAVE_ROOTS" -eq 1 ]; then
  if [ "$ROOTS" != "none" ]; then
    [ -n "$ROOTS" ] || usage roots_missing
    IFS=',' read -r -a ROOT_LIST <<< "$ROOTS"
    [ "${#ROOT_LIST[@]}" -gt 0 ] || usage roots_missing
    for r in "${ROOT_LIST[@]}"; do
      case "$r" in
        deploy) RW_DEPLOY=1 ;;
        repos) RW_REPOS=1 ;;
        *) usage unknown_root ;;
      esac
    done
  fi
fi
# A dry run never mounts anything writable, whatever else was parsed.
if [ "$APPLY" -ne 1 ]; then
  RW_DEPLOY=0
  RW_REPOS=0
fi

# --- 2. One run at a time -------------------------------------------------

mkdir -p "$(dirname "$LOCK")" 2>/dev/null
if ! exec 9>"$LOCK"; then
  die "cannot open lock file" 1
fi
if ! flock -n 9; then
  header
  log_line "wrapper: another run holds the lock, skipping"
  echo "wrapper: another run holds the lock, skipping"
  exit 0
fi

# --- 3. Image and credentials from the running service --------------------

IMAGE=$(docker service inspect "$SERVICE" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null | head -n 1)
[ -n "$IMAGE" ] || die "image of service ${SERVICE} not resolved" 1

SPEC_ENV=$(docker service inspect "$SERVICE" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' 2>/dev/null)
COUCHDB_USER=""
COUCHDB_PASS=""
SPEC_PASSWORD=""
while IFS= read -r line; do
  case "$line" in
    COUCHDB_USER=*) COUCHDB_USER=${line#COUCHDB_USER=} ;;
    COUCHDB_PASS=*) COUCHDB_PASS=${line#COUCHDB_PASS=} ;;
    COUCHDB_PASSWORD=*) SPEC_PASSWORD=${line#COUCHDB_PASSWORD=} ;;
  esac
done <<< "$SPEC_ENV"
unset SPEC_ENV line
[ -n "$COUCHDB_PASS" ] || COUCHDB_PASS=$SPEC_PASSWORD
unset SPEC_PASSWORD
if [ -z "$COUCHDB_USER" ] || [ -z "$COUCHDB_PASS" ]; then
  die "couchdb credentials not found in the spec of service ${SERVICE}" 1
fi
export COUCHDB_USER COUCHDB_PASS

if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  docker pull "$IMAGE" > /dev/null 2>&1 || die "image pull failed" 1
fi

# --- 4. Run ---------------------------------------------------------------

DEPLOY_MODE=":ro"
REPOS_MODE=":ro"
[ "$RW_DEPLOY" -eq 1 ] && DEPLOY_MODE=""
[ "$RW_REPOS" -eq 1 ] && REPOS_MODE=""

OUT=$(docker run --rm --network "$NETWORK" --memory 256m --entrypoint node \
  -e COUCHDB_USER -e COUCHDB_PASS -e COUCHDB_HOST -e THINX_PREFIX \
  -e RETENTION_DEPLOY_ROOT=/mnt/data/deploy -e RETENTION_REPOS_ROOT=/mnt/data/repos \
  -v "${DEPLOY_HOST}:/mnt/data/deploy${DEPLOY_MODE}" \
  -v "${REPOS_HOST}:/mnt/data/repos${REPOS_MODE}" \
  "$IMAGE" scripts/log-retention.js "$@" 2>&1)
RC=$?

header
[ -n "$OUT" ] && log_line "$OUT"
[ -n "$OUT" ] && printf '%s\n' "$OUT"

LAST=$(printf '%s\n' "$OUT" | tail -n 1)
if [ "$RC" -eq 0 ] && { [ "$LAST" = "LOG-RETENTION DRY-RUN OK" ] || [ "$LAST" = "LOG-RETENTION APPLY OK" ]; }; then
  exit 0
fi
log_line "wrapper: run failed rc=${RC}"
echo "wrapper: run failed rc=${RC}"
exit 1
