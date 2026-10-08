# Deferred Items — Phase 33

## Deferred Items

- Plan `<automated>` verify literals that assume GNU/BSD `grep` BRE semantics and byte-exact Go-template spacing
  status: open
  **Found during:** 33-01 Task 1 (ports/publishers line) and Task 2 (thinx-api-ws rule grep)
  **What:** (a) the `docker service inspect … {{range .Endpoint.Ports}}…{{end}}` template emits a trailing space before each newline, so `tr '\n' ' '` yields two spaces after `7442->7442 ` and the plan's single-space literal does not match without `tr -s ' '`; (b) on this laptop `grep` is a shell function wrapping ugrep 7.8.4, which parses `${WEB_HOSTNAME}` / `(?i)` as regex operators — the plan's WS-rule grep matches 2/2 under `/usr/bin/grep` (BRE) or `grep -F`. The live state and the files are correct in both cases. Plans 33-02 / 33-03 carry copies of the same lines; the verifier should run them with `/usr/bin/grep` or normalise whitespace rather than treat a miss as a live regression.
