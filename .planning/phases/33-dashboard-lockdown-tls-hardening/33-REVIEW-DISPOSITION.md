---
phase: 33
review: 33-REVIEW.md
updated: 2026-10-09T10:50:42Z
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
    disposition: "skipped — operator credential rotation; recorded for Phase 34"
  - id: WR-03
    severity: warning
    title: "Edge-wide HSTS depends on a dynamic-provider middleware — a single point of failure for every `https` router"
    disposition: "skipped — live static flag/middleware move; recorded for Phase 34"
  - id: WR-04
    severity: warning
    title: "`couch-auth` challenges clients on plaintext `:80` before redirecting to HTTPS (pre-existing, untouched by the TLS hardening)"
    disposition: "skipped — live label change; recorded for Phase 34"
  - id: WR-05
    severity: warning
    title: "`vault.yml` is dormant but, as committed, publishes Vault in cleartext on `:8200` and routes a hostname the scan does not cover"
    disposition: "fixed (thinx-swarm b04f066)"
  - id: IN-01
    severity: info
    title: "`port-open` predicate matches the word `open` anywhere on the nmap line"
    disposition: open
  - id: IN-02
    severity: info
    title: "Hosts are not asserted to resolve to `EDGE_IP`"
    disposition: open
  - id: IN-03
    severity: info
    title: "Explicit `curvePreferences` disables the X25519MLKEM768 post-quantum hybrid that was live before"
    disposition: open
  - id: IN-04
    severity: info
    title: "`traefik.sh` has no error handling and is not idempotent"
    disposition: open
  - id: IN-05
    severity: info
    title: "Unused `net` overlay network declared in `traefik.yml`"
    disposition: open
  - id: IN-06
    severity: info
    title: "Dashboard/API one-liners assume the Traefik task is on `micro`"
    disposition: open
---

# Phase 33 — Code Review Disposition Ledger

One row per finding in 33-REVIEW.md; `open` until triaged. Advisory: the phase gate does not block on this file.
