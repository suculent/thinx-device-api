# Phase 39: Internal OpenBao on the Swarm - Pattern Map

**Mapped:** 2026-10-12
**Files classified:** 23 proposed new/modified files
**Analog coverage:** 14 / 23 (4 exact, 10 role-match, 9 without a close analog)

## Ownership and scope

`S/` below means the separate sibling repository `/Users/sychram/Repositories/thinx-swarm/`; `P/` means `/Users/sychram/Repositories/thinx-api/thinx-device-api/`. Sibling deployment source is not a parent subdirectory or submodule. Commit/deploy ownership must remain explicit in plans. This map changes neither repository's source.

Names come from 39-CONTEXT.md and 39-RESEARCH.md; wildcard artifacts are expanded to proposed concrete names. Rows marked **inferred** make required installation, transfer, alerting and verification responsibilities explicit; planners may consolidate them. Runtime copies under `/etc`, `/var/lib`, `/var/log`, `/var/backups` and `/run` are installation outputs, never source analogs. Existing helper/notifier files are reference-only: API encryption belongs to Phase 40.

All analogs below were verified tracked with `git ls-files` in their owning repository. No project-local `.codex/skills` or `.agents/skills` files were found. Parent AGENTS.md governs rollout; no sibling AGENTS.md was present.

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `S/vault.yml` | replace | config | request-response | `S/traefik.yml` socket-proxy stanza | role-match |
| `S/vault.conf` | replace | config | file-I/O | none | none |
| `S/openbao/policies/operator.hcl` | new | config | request-response | none | none |
| `S/openbao/policies/thinx-api.hcl` | new | config | request-response | none | none |
| `S/openbao/policies/backup.hcl` | new | config | request-response | none | none |
| `S/openbao/openssl.cnf` | new | config | transform | none | none |
| `S/scripts/openbao-preflight.sh` | new | utility | batch | `S/scripts/mosquitto-cert-renew.sh` | role-match |
| `S/scripts/openbao-bootstrap.sh` | new | utility | request-response | same shell analog | role-match |
| `S/scripts/openbao-verify.sh` | new | test | request-response | same shell analog, probes | role-match |
| `S/scripts/openbao-backup.sh` | new | utility | file-I/O | same shell analog, protected staging | role-match |
| `S/scripts/openbao-cert-renew.sh` | new | utility | file-I/O | same shell analog | role-match |
| `S/scripts/openbao-restore-rehearsal.sh` | new | test | file-I/O | same shell analog, rollback probes | role-match |
| `S/scripts/openbao-recovery-archive.sh` | new | utility | file-I/O | none | none |
| `S/openbao/backup.cron` | new | config | batch | `S/scripts/mosquitto-cert-renew.cron` | exact |
| `S/openbao/cert-renew.cron` | new | config | batch | same cron analog | exact |
| `S/openbao/logrotate.conf` | new | config | file-I/O | none | none |
| `S/thinx.yml` | modify | config | request-response | existing API stanza in same file | exact |
| `P/docker-swarm.yml` | modify | config | request-response | existing API stanza in same file | exact |
| `P/.planning/runbooks/openbao.md` | new | utility (documentation) | batch | `P/.planning/runbooks/swarm.md` | role-match |
| `S/scripts/openbao-common.sh` | new, inferred | utility | event-driven/file-I/O | `S/scripts/mosquitto-cert-renew.sh` shell guard pattern | role-match |
| `S/scripts/openbao-install.sh` | new, inferred | utility | file-I/O | same shell analog, guards/install | role-match |
| `S/scripts/openbao-snapshot-receive.sh` | new, inferred | utility | file-I/O | none | none |
| `S/tests/openbao-maintenance.test.sh` | new, inferred | test | batch/event-driven | none | none |

## Pattern Assignments

### `S/vault.yml`: isolated service declaration

**Analog:** `S/traefik.yml`, lines 202–218 and 243–246. Copy structural conventions, not service-specific mounts or placement labels:

```yaml
    healthcheck:
      test: ["CMD", "/healthcheck"]
      interval: 30s
      timeout: 5s
      retries: 2
      start_period: 5s
    read_only: true
    cap_drop:
      - ALL
```

```yaml
  traefik-socket:
    external: true
```

The external declaration alone does not create an internal network: installation must create and inspect a dedicated overlay with Internal=true. Do not reuse `traefik-socket`. Replace the image, command, healthcheck and mounts for OpenBao; validate initial sealed/uninitialized behavior against the exact image. Set one replica, manager plus micro hostname constraints and **stop-first** updates (the proxy's start-first update is inappropriate for one Raft directory). No socket mount, public labels or published port. The dormant Vault source is a replacement target, not an analog for TLS/storage/networking.

### `S/thinx.yml` and `P/docker-swarm.yml`: API integration and mirror

**Analogs:** own API stanzas, respectively lines 216–230 and 270–290:

```yaml
    networks:
      - internal
      - traefik-public
    image: ${REGISTRY}/thinx/api:swarm
    secrets:
      - SLACK_BOT_TOKEN
      - SLACK_WEBHOOK
```

Add the dedicated external overlay and AppRole secret references without dropping existing entries. Top-level external-secret declarations are at S/thinx.yml:21–47 and P/docker-swarm.yml:66–92. Public CA material belongs in an immutable Docker config, not an environment credential. `S/traefik.yml:252–260` supplies the versioned config convention:

```yaml
configs:
  tls-config:
    # [intervening comments omitted]
    name: tls-config-${CONFIG:-3}
    file: ./traefik/tls.toml # or /mnt/data/ingress/traefik/tls.toml
```

Use OpenBao-specific names and the reviewed public trust bundle. Live API integration is one targeted service update after a protected spec backup; do not deploy the thinx or Traefik stacks. Keep the existing passphrase through Phase 39; its retirement is Phase 41.

### `S/scripts/openbao-{preflight,bootstrap,verify,backup,cert-renew,restore-rehearsal}.sh`, `openbao-common.sh`, `openbao-install.sh`

**Analog:** `S/scripts/mosquitto-cert-renew.sh`. This is a shell/lifecycle analog; it implements neither Raft backup nor OpenBao authentication.

**Initialization and imports:** shell utilities are executable scripts, with no JS module imports. Lines 27–28:

```bash
set -euo pipefail
umask 077
```

**Logging, exclusion and guard shape**, lines 42–51:

```bash
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE"; }
die() { log "ERROR $*"; echo "mosquitto-cert-renew: ERROR $*" >&2; exit 1; }
trap 'log "ERROR unexpected failure at line $LINENO"' ERR

exec 9> "$LOCK_FILE"
flock -n 9 || { log "SKIP another run holds $LOCK_FILE"; exit 0; }

if [[ "${MCR_ALLOW_ANY_HOST:-0}" != "1" ]]; then
  [[ "$(hostname -s)" == "micro" ]] || die "must run on micro (acme.json volume host), not $(hostname -s)"
  [[ "$(docker info --format '{{.Swarm.ControlAvailable}}' 2>/dev/null)" == "true" ]] || die "not a swarm manager"
```

Use sanitized reason codes and root-owned parent directories. Add realpath/findmnt/stat checks before installation; node-local means neither Gluster paths nor symlinks into them. Do not carry test bypass variables into unattended production configuration. Explicitly handle errors in maintenance branches: `set -e` alone does not implement incident transitions or rollback.

**Certificate validation**, lines 68–76:

```bash
pub_cert() { openssl x509 -in "$1" -noout -pubkey 2> /dev/null | openssl sha256 | awk '{print $NF}'; }
pub_key()  { openssl pkey -in "$1" -pubout 2> /dev/null | openssl sha256 | awk '{print $NF}'; }
fp_leaf()  { openssl x509 -in "$1" -noout -fingerprint -sha256 2> /dev/null | cut -d= -f2; }

openssl x509 -in "$TMP/cert.pem" -noout -ext subjectAltName 2> /dev/null \
  | tr ',' '\n' | sed 's/^[[:space:]]*//' | grep -qxF "DNS:$DOMAIN" || die "exported cert SAN lacks $DOMAIN"
openssl x509 -in "$TMP/cert.pem" -noout -checkend 86400 > /dev/null 2>&1 || die "exported cert expires within 1 day"
NEW_PUB="$(pub_cert "$TMP/cert.pem")"
[[ -n "$NEW_PUB" && "$NEW_PUB" == "$(pub_key "$TMP/key.pem")" ]] || die "exported key does not match exported cert"
```

For OpenBao, add full CA-chain and hostname verification, chosen service DNS/loopback SANs, and both issuer and leaf renewal. This analog merely exports ACME certificates and does not solve private-CA issuance. Its public fingerprint probe does not establish trusted TLS by itself.

**Protected rollback staging**, lines 92–95:

```bash
BK="$BACKUP_ROOT/mosquitto-cert-renew-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p -m 700 "$BK"
install -m 600 -o root -g root "$SSL_DIR/$CERT_NAME" "$BK/$CERT_NAME"
install -m 600 -o root -g root "$SSL_DIR/$KEY_NAME" "$BK/$KEY_NAME"
```

**Bounded verification**, lines 121–128:

```bash
verify() { # retry up to ~60s while the new task starts
  local i
  for i in $(seq 1 12); do
    if probe_8883 "$1" && probe_1883; then return 0; fi
    sleep 5
  done
  return 1
}
```

**Rollback structure**, lines 130–139:

```bash
install_pair "$TMP/cert.pem" "$TMP/key.pem"
if restart && verify "$NEW_FP"; then
  log "renewed $DOMAIN fp=${NEW_FP:0:23} notAfter=\"$NEW_END\" backup=$BK service=$SERVICE"
  exit 0
fi

OLD_FP="$(fp_leaf "$BK/$CERT_NAME")"
install_pair "$BK/$CERT_NAME" "$BK/$KEY_NAME"
if restart && verify "$OLD_FP"; then
  die "renewal of $DOMAIN failed (restart or :8883/:1883 check); restored old pair fp=${OLD_FP:0:23} backup=$BK"
```

Adapt the control flow, not the literal MQTT calls. OpenBao requires a paired directory switch plus SIGHUP and verified API trust; the analog's two separate renames are only individually atomic. Backup requires Raft snapshot API/inspection, remote checksum/finalization and 90-day retention on both nodes. Bootstrap requires independent logins before root revocation; rehearsal requires isolated fresh Raft state and restored-state auth. These substantive behaviors have no existing implementation to copy.

### `S/openbao/backup.cron` and `cert-renew.cron`

**Analog:** `S/scripts/mosquitto-cert-renew.cron:2–4`:

```cron
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
40 4 * * * root /mnt/gluster/deployment/swarm/scripts/mosquitto-cert-renew.sh
```

Keep an explicit PATH and root scheduling. Change command paths to reviewed **node-local installed copies**, with separate daily schedules and shared exclusion/state primitives. The source analog's Gluster execution path violates Phase 39 custody/layout decisions if copied literally. No recurring restore rehearsal schedule was selected.

### `P/.planning/runbooks/openbao.md`

**Analog:** `P/.planning/runbooks/swarm.md:287–290`:

> **Secret hygiene.** The out-of-git rollback snapshot and the pre-roll-demo spec backup stay on
> `micro` at mode 600 (dir 700, root) and are **never** committed or scp'd into a repo — they hold the
> resolved pilot UUID, the `admin-auth` hash, the ACME email and raw `acme.json` key material.
> Committed artifacts name them by path only and redact every secret to `<redacted>`/`${VAR}`.

Copy the procedure/evidence/rollback organization, not obsolete historical edge state. Include installation, custody ceremony, four-hour login proof, independent backup auth, no-valid-login recovery, seal rotation, both snapshot generations, certificate expiry recovery, remote retention and API rollback. Separate completed evidence from proposed commands. Preserve 7442 and plaintext MQTT explicitly in regression gates.

## Shared Patterns

### Credential integration boundary

**Source:** tracked `P/lib/thinx/secrets.js:14–18,32–35,42–43`:

```javascript
const fs = require("fs");
const path = require("path");
const SECRETS_DIR = "/run/secrets/";
const cache = {};
```

```javascript
if (fs.existsSync(secret_path)) {
    value = fs.readFileSync(secret_path, "utf8").trim();
} else if (typeof process.env[name] !== "undefined") {
    value = process.env[name];
}
```

Mount credentials under the names Phase 40 will consume (`BAO_ROLE_ID`, `BAO_SECRET_ID` proposed by research); do not add a second application loader now. Cached reads mean rotation needs a deliberate reload/restart strategy. Host-only snapshot credentials and runtime static seal custody are separate from API Docker secrets; the seal key must not become a Swarm secret.

### Notification destination, not notification lifecycle

**Source:** tracked `P/lib/thinx/notifier.js:13–14,44,50,54–59`:

```javascript
const SlackNotify = require("slack-notify");
const { readSecret } = require("./secrets.js");
```

```javascript
const webhook = readSecret("SLACK_WEBHOOK");
const slack = SlackNotify(webhook);
```

The payload identifies `channel: "#thinx"` at line 58. This locates the existing operations integration, not proof of the modern webhook's configured destination. Validate destination during execution. Do not import this application's database-heavy notifier into host maintenance jobs or copy raw exception logging. `openbao-common.sh` needs new durable per-job state under flock, atomic failure/recovery transitions, secret-safe transport and explicit retry behavior after ambiguous delivery. Cover process restart and repeated failed runs in the proposed maintenance test.

### Testing seams

The renewal analog documents environment overrides at lines 20–23 and bounded probes at 121–128, which can guide command stubs and temporary fixture directories. No close dedicated tracked maintenance-test analog was found in the sibling tree. Test real failure boundaries: checksum mismatch, failed transfer, retention cutoff, certificate mismatch/expiry, rollback failure, lock contention, persistent incident/recovery and process restart. OpenBao integration and emergency recovery need throwaway exact-image tests, not shell text assertions.

## No Analog Found

| File | Reason / planning direction |
|---|---|
| `S/vault.conf` | Old Vault file storage/TLS-disabled configuration is incompatible; use release-specific HCL in research and validate against the exact image. |
| Three `S/openbao/policies/*.hcl` files | No existing OpenBao ACLs; derive separate API, backup and operator capabilities and negative tests from research. |
| `S/openbao/openssl.cnf` | Existing renewal consumes ACME material; no reusable CA issuance/overlap profile. |
| `S/scripts/openbao-recovery-archive.sh` | No encrypted DMG/Keychain custody workflow; implement research's local prompted ceremony with no plaintext staging. |
| `S/openbao/logrotate.conf` | No audited OpenBao rotation/reopen configuration; use research's logrotate/SIGHUP design and test failure recovery. |
| `S/scripts/openbao-snapshot-receive.sh` | No restricted cross-node snapshot receiver; fixed paths, pinned peer and integrity/finalization are new. |
| `S/tests/openbao-maintenance.test.sh` | No close host maintenance fixture suite in sibling tracked source; create meaningful failure/recovery tests. |

## Metadata

**Search scope:** sibling tracked deployment/config/script inventory; parent deployment mirror, secret loader, notifier and operational runbook. Five primary analogs: sibling traefik.yml, thinx.yml, renewal shell and cron; parent docker-swarm.yml. Three supporting tracked references: parent secrets.js, notifier.js and swarm.md. Search stopped after these strong structural matches; absence claims mean no close analog found in this scope, not proof against every repository file.

**Extraction date:** 2026-10-12. Line numbers describe current local tracked sources. Research owns release verification; this map makes no new production or upstream-version claims. No secret contents, runtime state or live service changes were needed.
