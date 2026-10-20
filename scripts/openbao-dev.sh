#!/usr/bin/env bash
# scripts/openbao-dev.sh - laptop wrapper for the OpenBao 2.7.1 dev server that
# CI runs from docker-compose.test.yml (Phase 40, KEYENC-05).
#
#   scripts/openbao-dev.sh up            start openbao + run openbao-setup
#   scripts/openbao-dev.sh down          remove containers, volume and state dir
#   scripts/openbao-dev.sh run -- CMD..  up, run CMD with BAO_* set, always down
#
# The role_id thinx-ci-bao-role and secret_id thinx-ci-bao-secret are the same
# CI throwaways openbao-setup pins on the ephemeral dev instance; they are never
# production credentials. This script never prints its environment or the dev
# server log (the dev server writes its root token and unseal key there).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT="thinx-openbao-dev"
COMPOSE_FILE="$ROOT/docker-compose.test.yml"
STATE_DIR="${TMPDIR:-/tmp}"
STATE_DIR="${STATE_DIR%/}/thinx-openbao-dev"
CA_FILE="$STATE_DIR/vault-ca.pem"
ROLE_ID="thinx-ci-bao-role"
SECRET_ID="thinx-ci-bao-secret"
# The dev server's throwaway root token (docker-compose.test.yml openbao,
# AR-40-01), handed to the command as BAO_DEV_ADMIN_TOKEN for the rotate /
# config calls of TransitRotationSpec. Never BAO_TOKEN, never production.
DEV_ADMIN_TOKEN="thinx-ci-bao-root"

dc() {
  # The test compose file interpolates many ${VAR}s the dev server does not
  # need; silence those warnings rather than set them.
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@" 2> >(grep -vE 'variable is not set|attribute `version` is obsolete' >&2)
}

addr_port() {
  local hp port
  hp=$(dc port openbao 8200 | head -n 1)
  port="${hp##*:}"
  [[ "$port" =~ ^[0-9]+$ ]] || { echo "OPENBAO-DEV-FAIL no published port" >&2; return 1; }
  printf '%s' "$port"
}

cmd_up() {
  dc up -d openbao >/dev/null
  if ! dc run --rm openbao-setup | grep '^OPENBAO-SETUP-OK$' >/dev/null; then
    echo "OPENBAO-DEV-FAIL openbao-setup did not report OPENBAO-SETUP-OK" >&2
    return 1
  fi
  local port
  port=$(addr_port)
  ( umask 077; mkdir -p "$STATE_DIR" )
  chmod 700 "$STATE_DIR"
  dc cp openbao:/openbao/file/vault-ca.pem "$CA_FILE" >/dev/null
  chmod 600 "$CA_FILE"
  echo "OPENBAO-DEV-UP addr=https://127.0.0.1:${port}"
}

cmd_down() {
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$STATE_DIR"
}

cmd_run() {
  [[ "${1:-}" == "--" ]] && shift
  [[ $# -gt 0 ]] || { echo "usage: $0 run -- CMD [ARGS...]" >&2; return 2; }
  trap cmd_down EXIT
  cmd_up
  local port rc=0
  port=$(addr_port)
  BAO_ADDR="https://127.0.0.1:${port}" BAO_CACERT="$CA_FILE" \
    BAO_ROLE_ID="$ROLE_ID" BAO_SECRET_ID="$SECRET_ID" \
    BAO_DEV_ADMIN_TOKEN="$DEV_ADMIN_TOKEN" "$@" || rc=$?
  return "$rc"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  run) shift; cmd_run "$@" ;;
  *) echo "usage: $0 up | down | run -- CMD [ARGS...]" >&2; exit 2 ;;
esac
