# Deferred Items — Phase 33

## Deferred Items

- Plan `<automated>` verify literals that assume GNU/BSD `grep` BRE semantics and byte-exact Go-template spacing
  status: open
  **Found during:** 33-01 Task 1 (ports/publishers line) and Task 2 (thinx-api-ws rule grep)
  **What:** (a) the `docker service inspect … {{range .Endpoint.Ports}}…{{end}}` template emits a trailing space before each newline, so `tr '\n' ' '` yields two spaces after `7442->7442 ` and the plan's single-space literal does not match without `tr -s ' '`; (b) on this laptop `grep` is a shell function wrapping ugrep 7.8.4, which parses `${WEB_HOSTNAME}` / `(?i)` as regex operators — the plan's WS-rule grep matches 2/2 under `/usr/bin/grep` (BRE) or `grep -F`. The live state and the files are correct in both cases. Plans 33-02 / 33-03 carry copies of the same lines; the verifier should run them with `/usr/bin/grep` or normalise whitespace rather than treat a miss as a live regression.

- Plan 33-02 `<automated>` verify literals that cannot pass against Traefik v3.7.14 / Docker 29 as written
  status: open
  **Found during:** 33-02 Task 1 (Stage C gate)
  **What:** (a) `docker config inspect tls-config-2 --format '{{.Spec.Data}}' | base64 -d` — Go's text template prints the `[]byte` field as decimal numbers, so `base64 -d` answers `invalid input`; the deployed-bytes gate was run with `--format '{{json .Spec.Data}}' | tr -d '"' | base64 -d | sha256sum` and matched the committed file (`bb0cba95ea22e973…`). (b) `/api/rawdata | jq -e '.tls.options …'` — the v3.7.14 API does not expose TLS options at all (`rawdata` keys are `middlewares`, `routers`, `services`; `/api/tls` and `/api/tls/options` → 404), so the `default` option can only be proven on the wire (CBC + P-384 refused, nmap set == the three RSA AEAD suites, TLS 1.3 on x25519), by the in-task config sha, and by the DEBUG parse probe's `Configuration received` line — all recorded in the Stage C record. (c) The parse probe's `grep -ci 'tls.toml' >= 1` holds only at `--log.level=DEBUG` (INFO emits no file-provider lines). None of the three is a live regression; the verifier should treat the literal misses as recorded quirks.
