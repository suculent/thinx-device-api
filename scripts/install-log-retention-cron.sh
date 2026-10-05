#!/usr/bin/env bash
#
# scripts/install-log-retention-cron.sh
#
# Enables the daily log/build retention job (Phase 26, LOG-04, D-07..D-17) on
# the swarm manager. Run it once as root after the first `docker stack deploy`;
# scripts/stack-deploy calls it for you. Re-running is safe.
#
# What it does:
#   1. Installs scripts/thinx-log-retention.sh as
#      /usr/local/sbin/thinx-log-retention.sh (root:root 0755). An existing copy
#      is replaced only when its content differs from this repository's.
#   2. Writes /etc/cron.d/thinx-log-retention (root:root 0644) with one daily
#      line `MM HH * * * root /usr/local/sbin/thinx-log-retention.sh --apply
#      --roots <roots>`. An existing schedule is KEPT (the operator may have
#      chosen other roots or another slot) unless --force is given.
#
# The default is --roots none: expired audit docs and build records only, no
# folder deletion. Deleting build folders (--roots deploy,repos) is a one-way
# step that needs a dry run first (D-10/D-16): run
#   /usr/local/sbin/thinx-log-retention.sh
# read its counts, then rerun this script with --force --roots deploy,repos.
#
# It never runs the job, never deletes anything and never touches the legacy
# /etc/cron.daily/couchdb-log-retention job; if that job is present it only
# prints a note (retire it as in .planning/runbooks/log-paging-retention.md).
#
# Options:
#   --roots <deploy,repos|deploy|repos|none>   default: none (no folder deletion)
#   --time HH:MM (UTC)                         default: 09:40
#   --force                                    rewrite an existing schedule
#
# The slot must avoid 01:00-05:00 UTC (CouchDB compaction window) and
# 06:00-07:10 UTC (cron.daily and apt-daily-upgrade, which can restart dockerd).
#
# Wrapper settings exported in this script's environment are copied into the
# cron file, so a non-default install keeps working from cron:
#   THINX_RETENTION_DEPLOY_HOST, THINX_RETENTION_REPOS_HOST,
#   THINX_RETENTION_SERVICE, THINX_RETENTION_NETWORK, COUCHDB_HOST, THINX_PREFIX
#
# Test overrides (env): THINX_INSTALL_SBIN_DIR, THINX_INSTALL_CRON_D_DIR,
# THINX_INSTALL_LEGACY_JOB, THINX_INSTALL_SKIP_ROOT_CHECK=1.
#
# Output is key=value lines; the last line is `LOG-RETENTION-CRON OK` on success.
# Exit codes: 0 ok, 1 failure, 2 usage error.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_WRAPPER="$SCRIPT_DIR/thinx-log-retention.sh"
SBIN_DIR=${THINX_INSTALL_SBIN_DIR:-/usr/local/sbin}
CRON_D_DIR=${THINX_INSTALL_CRON_D_DIR:-/etc/cron.d}
LEGACY_JOB=${THINX_INSTALL_LEGACY_JOB:-/etc/cron.daily/couchdb-log-retention}
TARGET_WRAPPER="$SBIN_DIR/thinx-log-retention.sh"
CRON_FILE="$CRON_D_DIR/thinx-log-retention"
trap 'rm -f "$TARGET_WRAPPER.new" "$CRON_FILE.new"' EXIT

ROOTS="none"
TIME="09:40"
FORCE=0

usage() {
  echo "usage: install-log-retention-cron.sh [--roots <deploy,repos|deploy|repos|none>] [--time HH:MM] [--force]"
  echo "error=usage:$1"
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --roots) [ $# -ge 2 ] || usage "roots_missing"; ROOTS="$2"; shift 2 ;;
    --time) [ $# -ge 2 ] || usage "time_missing"; TIME="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage "help" ;;
    *) usage "unknown_argument" ;;
  esac
done

case "$ROOTS" in
  deploy,repos|deploy|repos|none) ;;
  *) usage "roots" ;;
esac

if ! [[ "$TIME" =~ ^([01][0-9]|2[0-3]):([0-5][0-9])$ ]]; then
  usage "time_format"
fi
HOUR=$((10#${BASH_REMATCH[1]}))
MINUTE=$((10#${BASH_REMATCH[2]}))
T=$((HOUR * 60 + MINUTE))
if [ "$T" -ge 60 ] && [ "$T" -lt 300 ]; then
  usage "time_in_compaction_window"
fi
if [ "$T" -ge 360 ] && [ "$T" -le 430 ]; then
  usage "time_in_unattended_upgrade_window"
fi

if [ "${THINX_INSTALL_SKIP_ROOT_CHECK:-0}" != "1" ] && [ "$(id -u)" -ne 0 ]; then
  echo "error=not_root"
  exit 1
fi

if [ ! -f "$SOURCE_WRAPPER" ]; then
  echo "error=wrapper_source_missing"
  exit 1
fi

set_owner() {
  # root:root when we can; test runs (non-root) keep the caller's owner.
  if [ "$(id -u)" -eq 0 ]; then
    chown root:root "$1"
  fi
}

# --- 1. Wrapper ---------------------------------------------------------------

mkdir -p "$SBIN_DIR"
if [ -f "$TARGET_WRAPPER" ] && cmp -s "$SOURCE_WRAPPER" "$TARGET_WRAPPER"; then
  echo "wrapper=unchanged"
else
  if [ -f "$TARGET_WRAPPER" ]; then WRAPPER_ACTION=updated; else WRAPPER_ACTION=installed; fi
  cp "$SOURCE_WRAPPER" "$TARGET_WRAPPER.new"
  set_owner "$TARGET_WRAPPER.new"
  chmod 0755 "$TARGET_WRAPPER.new"
  mv -f "$TARGET_WRAPPER.new" "$TARGET_WRAPPER"
  echo "wrapper=$WRAPPER_ACTION"
fi

# --- 2. Schedule ----------------------------------------------------------------

if [ -f "$CRON_FILE" ] && [ "$FORCE" -ne 1 ]; then
  echo "cron_d=kept"
else
  if [ -f "$CRON_FILE" ]; then CRON_ACTION=rewritten; else CRON_ACTION=installed; fi
  mkdir -p "$CRON_D_DIR"
  {
    echo "# THiNX log and build retention (Phase 26), scope --roots $ROOTS."
    echo "# Installed by scripts/install-log-retention-cron.sh. Disable: rm this file."
    echo "SHELL=/bin/sh"
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    for name in THINX_RETENTION_DEPLOY_HOST THINX_RETENTION_REPOS_HOST \
                THINX_RETENTION_SERVICE THINX_RETENTION_NETWORK COUCHDB_HOST THINX_PREFIX; do
      value="${!name:-}"
      if [ -n "$value" ]; then
        if ! [[ "$value" =~ ^[A-Za-z0-9_./:-]+$ ]]; then
          echo "error=unsafe_env_value:$name" >&2
          exit 1
        fi
        echo "$name=$value"
      fi
    done
    echo "$MINUTE $HOUR * * * root $TARGET_WRAPPER --apply --roots $ROOTS"
  } > "$CRON_FILE.new"
  set_owner "$CRON_FILE.new"
  chmod 0644 "$CRON_FILE.new"
  mv -f "$CRON_FILE.new" "$CRON_FILE"
  echo "cron_d=$CRON_ACTION"
fi

printf 'schedule=%s\n' "$(grep -vE '^[[:space:]]*(#|$)|^[A-Z_]+=' "$CRON_FILE" | awk '{print $2":"$1" --roots "$NF}')"

# --- 3. Notes ------------------------------------------------------------------

if [ "$ROOTS" = "none" ] && grep -qE -- '--roots none$' "$CRON_FILE"; then
  echo "note=folder deletion off; dry-run /usr/local/sbin/thinx-log-retention.sh, then rerun with --force --roots deploy,repos"
fi

if [ -e "$LEGACY_JOB" ]; then
  echo "legacy_job=present (retire it: see .planning/runbooks/log-paging-retention.md)"
fi

if command -v systemctl >/dev/null 2>&1; then
  echo "cron_service=$(systemctl is-active cron 2>/dev/null || true)"
fi

echo "LOG-RETENTION-CRON OK"
