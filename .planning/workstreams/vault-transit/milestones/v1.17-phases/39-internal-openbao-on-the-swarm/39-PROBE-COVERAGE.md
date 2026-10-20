# Phase 39 fallback probe accounting

Specless fallback is active because no phase config overrides it. The supplied edge report has eight entries; all eight remain visible below.

| Requirement | Detector class | Planning disposition | Concrete backstop |
|---|---|---|---|
| VAULT-01 | unclassified | FLAGGED ASSUMPTION | 39-01 exact-tag/source tests and blocking micro/network/live preflight; 39-05/06 prove the live task, DNS and absence of public exposure |
| VAULT-02 | unclassified | FLAGGED ASSUMPTION | 39-03 tests local/core copies, retention and generation manifests; 39-05 proves real snapshots and restore |
| VAULT-05 | unclassified | FLAGGED ASSUMPTION | 39-01 tests key type, non-exportability and deletion-disabled state; 39-05/06 re-read live key metadata |
| VAULT-08 | unclassified | FLAGGED ASSUMPTION | 39-02 tests encrypted archive/identity boundaries and root-revocation ordering; 39-04 supplies only the two locally held passwords; 39-05 proves live custody |
| VAULT-03 | concurrency | RESOLVED BY ACCEPTANCE | 39-01 serializes key creation and tests concurrent encrypt/decrypt/rewrap; 39-03 serializes certificate maintenance plus the recurring API trust consumer; 39-06 proves a second issuer renewal against the actual API runtime with an expired predecessor |
| VAULT-04 | concurrency | RESOLVED BY ACCEPTANCE | 39-01 requires AppRole concurrency without privilege drift; 39-05 requires restart/rotation and generation-matched restore evidence |
| VAULT-06 | concurrency | RESOLVED BY ACCEPTANCE | 39-01 tests concurrent API-role operations and denials; 39-06 uses one start-first API update and validates the canary in the running task |
| VAULT-07 | concurrency | RESOLVED BY ACCEPTANCE | 39-01 checks audit entries under concurrent calls; 39-03/05 serialize rotation/reopen and require a post-reopen canary |

Accounting: **8 report entries = 4 flagged assumptions + 4 concurrency acceptances = 8 planned entries**. A flagged assumption may become green only from the named execution proof; failure or absent evidence remains a blocking gap.

Final WebSocket regression uses the tracked probe exactly as implemented: it has no flags and its exit status is diagnostic-only. Plan 39-06 therefore parses the live `0/4` summary and separately requires protected-config HTTP/1.1 upgrade requests to produce the unauthenticated 401 and authenticated 101 responses.

## Prohibition fallback

`projectProhibitions` recall produced the descriptor-less planning form required by the fallback reference. The plans serialize only `status` and `verification`; they do not invent check descriptors.

| Recalled prohibition | Plan | Status | Verification |
|---|---|---|---|
| Do not expose OpenBao publicly or change required legacy plaintext protocols | 39-01 | resolved | judgment |
| Do not persist credentials, recovery material, plaintext/ciphertext canaries or webhook values in repository/ops evidence | 39-03 | resolved | judgment |
| Do not accept a stale/mismatched seal generation during restore or silently claim recovery | 39-05 | resolved | judgment |

Security-candidate material is represented in the phase threat registers and remains subject to secure-phase verification. Routine engineering guidance was not promoted into fabricated prohibitions.

## Assumption-delta result

`assumption-delta scan 39 --ws=vault-transit` returned `detected: false`. No identity-model delta block is needed; the operator=userpass and services=AppRole split is already explicit in D-10 through D-13 and in plans 39-01, 39-02 and 39-04.
