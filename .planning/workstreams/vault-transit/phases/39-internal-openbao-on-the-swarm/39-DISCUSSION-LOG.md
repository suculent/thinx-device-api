# Phase 39: Internal OpenBao on the Swarm - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `39-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-10-12
**Workstream:** vault-transit
**Phase:** 39-internal-openbao-on-the-swarm
**Areas discussed:** Key custody and recovery; Operator access; Backup routine; Rollout and maintenance

The user selected **all** four areas. Earlier milestone decisions were carried forward rather than re-asked. Questions used numbered text choices.

## Key custody and recovery

### Where should the offline seal-key backup and recovery keys live?

| Option | Selected |
|---|---|
| 1. Encrypted removable drive (recommended) |  |
| 2. Encrypted archive on your laptop | ✓ |
| 3. Existing recovery arrangement |  |

**User’s choice:** Encrypted archive on the operator laptop, outside synced folders and the repository.

### How should its decryption password be kept?

| Option | Selected |
|---|---|
| 1. Your password manager (recommended) | ✓ |
| 2. macOS Keychain only | ✓ |
| 3. Memorized or recorded offline |  |

**User’s choice:** Both password manager (primary copy) and macOS Keychain (convenience).

### Who should be able to recover OpenBao?

| Option | Selected |
|---|---|
| 1. You alone | ✓ |
| 2. You and a designated backup operator |  |
| 3. Two people together |  |

**User’s choice:** The user alone; sole recovery operator.

### How should we prepare the laptop archive?

| Option | Selected |
|---|---|
| 1. Guided local setup (recommended) | ✓ |
| 2. Manual packaging |  |

**User’s choice:** Guided local setup: automate packaging and verification, with password entered locally outside chat.

### Move to operator access or discuss key custody further?

| Option | Selected |
|---|---|
| 1. Move to operator access | ✓ |
| 2. Discuss key custody further |  |

**User’s choice:** Move to operator access.

## Operator access

### How should routine maintenance obtain privileges?

| Option | Selected |
|---|---|
| 1. Dedicated operator login (recommended) | ✓ |
| 2. Recovery keys each time |  |

**User’s choice:** Dedicated operator login issuing short-lived tokens; reserve recovery keys for emergencies.

### How long should an operator session last before requiring a fresh login?

| Option | Selected |
|---|---|
| 1. 1 hour (recommended) |  |
| 2. 30 minutes |  |
| 3. 4 hours | ✓ |

**User’s choice:** Four hours. User replied "4", interpreted as four hours and reflected back in subsequent questions.

### What should that login be allowed to do?

| Option | Selected |
|---|---|
| 1. Routine maintenance only (recommended) |  |
| 2. Full operational administration | ✓ |

**User’s choice:** Full operational administration, including snapshots, health checks, Transit key rotation/rewrap, restores, policy changes and authentication management. Use an operator policy; bootstrap root token remains revoked.

### How should you authenticate after connecting over SSH?

| Option | Selected |
|---|---|
| 1. Username and password (recommended) | ✓ |
| 2. Client certificate |  |

**User’s choice:** Username/password login, dedicated operator password kept in the password manager. Operator access remains SSH plus docker exec.

### Move to backup routine or discuss operator access further?

| Option | Selected |
|---|---|
| 1. Move to backup routine | ✓ |
| 2. Discuss operator access further |  |

**User’s choice:** Move to backup routine.

## Backup routine

### How often should OpenBao take Raft snapshots?

| Option | Selected |
|---|---|
| 1. Daily, plus before and after changes (recommended) | ✓ |
| 2. Every six hours, plus before and after changes |  |
| 3. Only around planned changes |  |

**User’s choice:** Daily, plus before and after key/configuration changes.

### Where should the off-node snapshot copy go, separate from Gluster backups?

| Option | Selected |
|---|---|
| 1. The other swarm node (recommended) | ✓ |
| 2. Separate backup storage |  |
| 3. Your laptop |  |

**User’s choice:** Automated copies to the other swarm node, in a dedicated root-only directory on its local disk, outside Gluster.

### How long should snapshots be retained on both nodes?

| Option | Selected |
|---|---|
| 1. 30 days (recommended) |  |
| 2. 7 days |  |
| 3. 90 days | ✓ |

**User’s choice:** 90 days on both nodes.

### After the required initial restore rehearsal, how often should it be repeated?

| Option | Selected |
|---|---|
| 1. Quarterly and before upgrades (recommended) |  |
| 2. Monthly and before upgrades |  |
| 3. Before upgrades only | ✓ |

**User’s choice:** Before upgrades only; initial Phase 39 restore rehearsal remains required.

### Move to rollout and maintenance or discuss backups further?

| Option | Selected |
|---|---|
| 1. Move to rollout and maintenance | ✓ |
| 2. Discuss backups further |  |

**User’s choice:** Move to rollout and maintenance.

## Rollout and maintenance

### What deployment window should we plan for when updating the API service?

| Option | Selected |
|---|---|
| 1. Normal operation, allowing a brief API restart (recommended) | ✓ |
| 2. A scheduled maintenance window |  |
| 3. No API interruption |  |

**User’s choice:** Normal operation, allowing a brief API restart; verify immediately and roll back on regression.

### How should internal TLS certificates be maintained?

| Option | Selected |
|---|---|
| 1. Automatic renewal (recommended) | ✓ |
| 2. Manual renewal with reminders |  |

**User’s choice:** Automatic renewal and deployment, verification of the new certificate, and failure reporting.

### Where should backup and certificate-maintenance failures be reported?

| Option | Selected |
|---|---|
| 1. Existing THiNX operations Slack channel (recommended) | ✓ |
| 2. Email to an operator address |  |
| 3. Local logs only |  |

**User’s choice:** Existing THiNX operations Slack channel.

### How should repeated failures be reported?

| Option | Selected |
|---|---|
| 1. Once on failure, once on recovery (recommended) | ✓ |
| 2. Every failed run |  |
| 3. Daily summary |  |

**User’s choice:** Once when a failure begins and once when it recovers; suppress repeat alerts while the same problem persists.

### Write the Phase 39 context or explore remaining questions?

| Option | Selected |
|---|---|
| 1. Write the Phase 39 context | ✓ |
| 2. Explore remaining questions |  |

**User’s choice:** Write the Phase 39 context for research and planning. User selected option 1 after reviewing the summary of all four areas.

## Agent Discretion

The user did not give blanket discretion over the selected preferences. Remaining implementation choices and research questions are explicitly separated in `39-CONTEXT.md`.

## Deferred Ideas

No new out-of-scope ideas were introduced. Existing Phase 40/41 and future requirements remain deferred.
