---
phase: 33
review: 33-REVIEW.md
updated: 2026-10-12T09:37:08Z
findings:
  - id: CR-01
    severity: critical
    title: "Scan prints `EDGE-SCAN OK` with gating predicates silently skipped when `jq` or `nmap` is absent"
    disposition: "fixed (0d93e119)"
  - id: WR-01
    severity: warning
    title: "Four tracked `traefik.yml.bak.*` files still carry the cleartext `--pilot.token` UUID; README now claims none is committed"
    disposition: "fixed (thinx-swarm d156e79; mirror f3e5905d)"
  - id: WR-02
    severity: warning
    title: "The former dashboard `PASSWORD` literal remains recoverable from thinx-swarm history; no rotation is recorded"
    disposition: "fixed (P34 D-18, thinx-swarm 1c4d683: couch-auth/influx-auth pair of the same lineage rotated; the historic literal is challenged with 401 on db and influx, see ### P34 credential rotation record; bcrypt since 34-REVIEW WR-06; history still holds the dead literal at 158f369)"
  - id: WR-03
    severity: warning
    title: "Edge-wide HSTS depends on a dynamic-provider middleware — a single point of failure for every `https` router"
    disposition: "fixed (P34 Stage C/D: security-headers@file from tls-config-3, thinx-swarm 8a7a693, 3d3a31b)"
  - id: WR-04
    severity: warning
    title: "`couch-auth` challenges clients on plaintext `:80` before redirecting to HTTPS (pre-existing, untouched by the TLS hardening)"
    disposition: "fixed (P34 Stage D, D-17, thinx-swarm 3d3a31b: thinx-db-http and registry-http are https-redirect only; end state db :80 301 with 0 WWW-Authenticate)"
  - id: WR-05
    severity: warning
    title: "`vault.yml` is dormant but, as committed, publishes Vault in cleartext on `:8200` and routes a hostname the scan does not cover"
    disposition: "fixed (thinx-swarm b04f066)"
  - id: IN-01
    severity: info
    title: "`port-open` predicate matches the word `open` anywhere on the nmap line"
    disposition: "deferred — the scan port loop still matches open anywhere on the nmap line; false-FAIL risk only → edge runbook § Recorded for later (after Phase 34), 261012-fqh"
  - id: IN-02
    severity: info
    title: "Hosts are not asserted to resolve to `EDGE_IP`"
    disposition: "deferred — no resolves-to-EDGE_IP assertion yet → edge runbook § Recorded for later (after Phase 34), 261012-fqh"
  - id: IN-03
    severity: info
    title: "Explicit `curvePreferences` disables the X25519MLKEM768 post-quantum hybrid that was live before"
    disposition: "fixed (P34 Stage C, D-15, thinx-swarm 8a7a693: tls-config-3 has no curve list, so the Go default incl. X25519MLKEM768 applies; the P34 end state negotiates it ×3)"
  - id: IN-04
    severity: info
    title: "`traefik.sh` has no error handling and is not idempotent"
    disposition: "deferred — 34-REVIEW IN-02 (thinx-swarm 9204a8e) added only the docker.sock gid guard; still no strict mode or idempotent network create, NODE_ID unquoted; bootstrap-only script → edge runbook § Recorded for later (after Phase 34), 261012-fqh"
  - id: IN-05
    severity: info
    title: "Unused `net` overlay network declared in `traefik.yml`"
    disposition: "deferred — the net overlay is still declared and unused (= 30 IN-04 = 32 IN-08) → edge runbook § Recorded for later (after Phase 34), 261012-fqh"
  - id: IN-06
    severity: info
    title: "Dashboard/API one-liners assume the Traefik task is on `micro`"
    disposition: "deferred — the AGENTS.md / thinx-swarm README one-liners have no empty-container guard; Traefik is pinned by node.labels.Traefik == true → edge runbook § Recorded for later (after Phase 34), 261012-fqh"
---

# Phase 33 — Code Review Disposition Ledger

One row per finding in 33-REVIEW.md; `open` until triaged. Advisory: the phase gate does not block on this file.

Re-dispositioned 2026-10-12 by quick 261012-fqh: IN-03 and WR-02/WR-03/WR-04 fixed (Phase 34), IN-01/02/04/05/06
deferred to the edge runbook § Recorded for later (after Phase 34).
