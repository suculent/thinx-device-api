# Phase 32: v3 Native Syntax & BC Removal - Research

**Researched:** 2026-10-08
**Domain:** Traefik v3.7.14 router-rule syntax migration (v2 matchers -> native v3) on Docker Swarm; removal of the `core.defaultRuleSyntax=v2` backward-compat switch; live-edge verification
**Confidence:** HIGH for every Traefik behaviour claim (read from the v3.7.14 source at tag `3bd7aa32` and the official v3 docs, with Go and live-edge falsification runs this session); HIGH for the live inventory (read over ssh, read-only, 2026-10-08)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Rollout sequencing
- **D-01:** Two-stage rollout on the live edge. **Stage 1** — on each of the four routers set
  `traefik.http.routers.<name>.ruleSyntax=v3` **and** the v3 rule in ONE `docker service update --label-add`
  (label-only, no task restart; per-router rollback = re-adding the v2 rule + removing the override).
  Verify. **Stage 2** — `docker service update --args` on `traefik_traefik` with the static command minus
  `--core.defaultRuleSyntax=v2` (one task restart, ~4 s as in Phase 31 B1). Verify again. — **Reversibility:**
  reversible — Stage 1 per router by label; Stage 2 by one `--args` update re-adding the switch.
- **D-02:** Prove the four candidate v3 rules **on a throwaway first**: a no-host-port `traefik:v3.7.14`
  probe booted WITHOUT the switch (ACME neutralized, `docker.sock:ro`, Phase 31 boot-and-discover recipe)
  plus a scaled-to-zero throwaway service carrying the four rules; assert they parse and report
  `status==enabled` before any live router is touched.
- **D-03:** After Stage 2, **strip** the four per-router `ruleSyntax=v3` overrides (`--label-rm`,
  label-only). End state: plain v3 rules, no switch, no overrides; committed files carry no per-router
  syntax overrides.
- **D-04:** **Repo first, then live**, for each stage: commit the change in `~/Repositories/thinx-swarm`
  (`thinx.yml`, `downtime.yml`, `errorpage.yml`, `traefik.yml`) and in this repo (`docker-swarm.yml` +
  regenerated `docker-compose.traefik.yml`), push thinx-swarm to origin, push + `git merge --ff-only` into
  micro's checkout `/mnt/gluster/deployment/swarm`, THEN apply the identical change live with
  `docker service update`. The deployed file and the live spec never disagree for longer than the update.

#### Catch-all rule form
- **D-05:** `downtime-http`, `downtime-https` and `error-router` become ``PathPrefix(`/`)``. —
  **Reversibility:** reversible — label-only; the v2 rule can be restored while the switch still exists.
- **D-06:** Accepted behaviour change: ``PathPrefix(`/`)`` also matches hostless / bare-IP requests on
  :80/:443, which today fall through to Traefik's bare 404. The downtime/error pages will answer them.
  No real host is affected (host routers win on priority/specificity).
- **D-07:** Router priorities (error-router 1, downtime 2, thinx-api-ws 200) are **re-derived by research**
  against v3 priority semantics and the shorter ``PathPrefix(`/`)`` rule; keep them if v3 behaves the same,
  adjust only with evidence. Note the live priorities are explicit labels today.
- **D-08:** `thinx-api-ws` becomes ``Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)``
  — only the matcher name changes; keep the case-insensitive regexp (legacy clients may send
  `Upgrade: WebSocket`) and `priority=200`.

#### BC switch end state
- **D-09:** Remove `--core.defaultRuleSyntax=v2` **outright** from the live `traefik_traefik` args and from
  `thinx-swarm/traefik.yml` (mirror regenerated; the static command drops from 17 to 16 flags). EDGE-MIG-03
  closes as "converted and removed", not "retained". — **Reversibility:** reversible — one `--args` update
  re-adds the switch.
- **D-10:** Stage 2 **auto-revert triggers** (executor acts without waiting for a human, then reports): the
  post-change `/api/http/routers` filter `select(.status!="enabled")` prints anything; any web host in the
  HTTPS matrix returns a code different from the pre-change baseline; or the `https://rtm.thinx.cloud/`
  WebSocket upgrade probe is not 200. Revert = `--args` update re-adding `--core.defaultRuleSyntax=v2`.

#### Verification gate
- **D-11:** Same gate as Phase 31: the executor gathers the automated evidence (router filter prints
  nothing; HTTPS matrix vs baseline incl. the external hosts; cert serial unchanged; `:7442`/`:1883`/`:8883`
  OPEN; device-flow harness PASS over `http://rtm.thinx.cloud:7442` + `mqtt://thinx.cloud:1883` and over
  `https://app.thinx.cloud`; rtm WS upgrade probe 200), then ONE `checkpoint:human-verify`
  `gate="blocking-human"` where the operator confirms the console (Devices page renders, live updates arrive
  over WS) in the browser. EDGE-MIG-04 is re-verified by this gate.
- **D-12:** The dashboard `admin-auth` credential for the router filter is **pre-staged by the operator**
  before `/gsd-execute-phase 32` as `/root/.p32-traefik-admin` (600 root) on micro. The plan carries it as a
  `<precondition>`; the executor verifies it against the live hash (`openssl passwd -apr1 -salt …` → MATCH,
  `/api/overview` → 200), reads it only into a shell variable on micro (never printed), and deletes the
  file at the end. No `--api.insecure` on the live service, ever.

### Claude's Discretion
- Exact v3 regexp anchoring/semantics for `HeaderRegexp`, and whether v3 priority rules require changes
  (D-07) — research decides with citations to `doc.traefik.io/traefik/migrate/v2-to-v3-details/`.
- Order of the four routers inside Stage 1 (suggest: catch-alls first, `thinx-api-ws` last so the WS
  probe is the final Stage-1 check).
- Probe mechanics (throwaway service names, teardown checks) — reuse the Phase 31 runbook recipe.
- Whether the `.C.post.yml`-style redacted capture of the final v3 edge is a new `D.post.yml` or an
  update to `C.post.yml` (follow `swarm-configs/README.md` persistence rules).

### Deferred Ideas (OUT OF SCOPE)
- Dead Traefik v1 labels (`traefik.frontend.headers.STSPreload`/`STSSeconds` on console/vue, `traefik.backend.*.noexpose` on transformer/worker) and the missing `security-headers@swarm` on `thinx-vue-console-https` — 31-REVIEW IN-05 → Phase 33/34 label inventory.
- `registry.thinx.cloud` through Traefik returns 400 (backend terminates its own TLS; no `loadbalancer.server.scheme=https`) — pre-existing, Phase 33/34 inventory.
- SEC-CFG-04: attach `COUCHDB_USER`/`COUCHDB_PASS`/`REDIS_PASSWORD` secrets to `thinx_api` after confirming the swarm secret values equal `.env`; prune `.env` fallbacks.

#### Reviewed Todos (not folded)
- "Split Rollbar server and client tokens" — config keyword match only; unrelated to routing syntax.
- "Transferred devices — what quick 261003-u86 left over", "Console notifications: remaining delivery gaps", "MQTT device writes are gated off", "Fix worker builder service polling" — keyword matches (mqtt/routing/remove) only; none touch the Traefik edge.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDGE-MIG-03 | Routing rules are converted to native v3 syntax and the BC switch is removed (or explicitly retained with documented rationale). | §Q1 matcher semantics (rename-only for `HeaderRegexp`; `PathPrefix(`/`)` catch-all), §Q1 D-07 priority (keep 1/2/200), §Q1 per-router `ruleSyntax` + switch side effects (none beyond a Warn log), §Q2 probe design, §Q4 stage order + rollback, §Q5 repo-first mechanics, §Validation Architecture |
| EDGE-MIG-04 (re-verify) | Plaintext `:7442` and plain MQTT keep accepting legacy device check-in, OTT redemption and firmware download after every migration hop. | §Architectural Responsibility Map (device ports are direct-published, outside Traefik — nothing in this phase touches them), §Validation Architecture rows V-PORTS / V-HARNESS, §Project Constraints |
</phase_requirements>

## Summary

Only four live routers still use v2-only matcher syntax (read live 2026-10-08, read-only): `thinx-api-ws`
(`HeadersRegexp`, priority 200, on `thinx_api`), `downtime-http`/`downtime-https` (`HostRegexp(`{host:.+}`)`,
priority 2, on `downtime_downtime`) and `error-router` (same rule, priority 1, on `errorpage_errorpage`).
`[VERIFIED: ssh micro docker service inspect, 2026-10-08]` The v3.7.14 source confirms the conversion is
semantically clean: v3 `HeaderRegexp` is `regexp.Compile` + unanchored `MatchString` over the canonical
header's values — exactly what the v2 `HeadersRegexp` (gorilla/containous mux) did — so D-08 is a pure
rename; `(?i)` is honoured (Go RE2) and was exercised live today (`Upgrade: WebSocket` reached the API).
`PathPrefix(`/`)` is a plain `strings.HasPrefix(routingPath, "/")` with no host involvement, so it matches
every request including bare-IP and hostless ones (D-06). Default router priority is still `len(rule)` and
is applied **only when no explicit priority is set**, so the explicit 1 / 2 / 200 labels behave identically
in v3 and the 14-character catch-all changes nothing (D-07: **keep**).

The single most important finding is a **silent failure mode**: under native v3, the v2 catch-all
`HostRegexp(`{host:.+}`)` compiles without error (Go treats the `{` as a literal) and simply never matches a
real host — the router stays `status: "enabled"` while being dead. The `select(.status!="enabled")` filter
therefore cannot detect an unconverted catch-all after the switch is removed; only the `HeadersRegexp`
rule fails loudly (`unsupported function: HeadersRegexp`, router disabled). This makes D-01's order
(Stage 1 converts all four under per-router `ruleSyntax=v3`, Stage 2 removes the switch) mandatory, and
the Stage 2 gate must add a behavioural catch-all probe (bare-IP `http://188.166.23.244/` -> `301`,
`https://188.166.23.244/` -> `200`) next to the status filter.

Two corrections to the locked wording that the planner must carry: (1) D-02's "scaled-to-zero throwaway"
yields **no router at all** — the swarm provider only emits servers for tasks in `running` state unless
`traefik.swarm.lbswarm=true`; run the throwaway at **1 replica** of `alpine:3.20` (already on micro) with
an explicit server-port label, isolated from the live edge by a distinct `traefik.constraint-label`
value. (2) D-10/D-11's "WS upgrade probe 200" is the wrong expectation: Phase 31's probe ran over HTTP/2,
where curl drops the `Upgrade`/`Connection` headers, so the request landed on the console nginx (200,
`server: nginx`) and never exercised the WS router. The correct probe forces `--http1.1` with full
upgrade headers and a cookie that lacks `x-thx-core`; the API then answers **`HTTP/1.1 401 Unauthorized`
with `X-Forwarded-Proto: https`** (verified live today), which is the only response the console nginx
cannot produce.

**Primary recommendation:** Execute D-01 exactly as locked (probe -> Stage 1 per router, catch-alls
first -> Stage 2 `--args` 17->16 -> Stage 3 `--label-rm ruleSyntax`), keep priorities 1/2/200, use the
`--http1.1` 401 WS probe and the bare-IP catch-all probe as gate signals, run the throwaway at 1 replica
with its own constraint label, and persist the end state as a new `traefik-edge.D.{pre,post}.yml` pair.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Router rule parsing (v2 vs v3 syntax) | Edge proxy (Traefik v3.7.14 task on micro) | — | Rules live in swarm service deploy labels; Traefik's muxer parses them at config build (`pkg/server/router/router.go:281`) |
| Rule syntax default / per-router override | Edge proxy static config (`--core.defaultRuleSyntax`) + per-router dynamic label | — | Static flag seeds the `@internal` model; empty per-router `ruleSyntax` inherits it (`pkg/server/aggregator.go:337-345`) |
| Catch-all routing (downtime / error page) | Edge proxy (HTTP routers `downtime-*`, `error-router`) | Downtime/errorpage nginx containers | Priority ordering decides which router answers an unmatched host |
| WebSocket upgrade routing to the API | Edge proxy (`thinx-api-ws`, priority 200) | API (`thinx-core.js:488` upgrade handler) | Traefik routes on the `Upgrade` header; the API accepts/rejects the upgrade |
| Legacy device check-in / OTT / firmware (`:7442`) and plain MQTT (`:1883`) | `thinx_api` and `thinx_mosquitto` swarm services (direct host publish) | — | Published directly, NOT via Traefik (`C.post.yml:153-156`); untouched by any change in this phase |
| Source of truth for edge config | `~/Repositories/thinx-swarm` (git) -> micro checkout `/mnt/gluster/deployment/swarm` | `docker-compose.traefik.yml` generated mirror + CI gate | One-way chain; live spec is updated by `docker service update`, never by stack deploy |
| Dashboard API readback (`/api/http/routers`) | Edge proxy `api@internal` behind `admin-auth` on `Host(`micro.thinx.cloud`)` | — | Credential handled host-side only (D-12) |

## Standard Stack

### Core (no new software is installed in this phase)
| Component | Version | Purpose | Status |
|-----------|---------|---------|--------|
| `traefik` | `v3.7.14` (live image, digest `e849695b…`) | The edge; image is NOT changed by this phase (args/labels only) | `[VERIFIED: ssh micro, args=17, Version.Index 38379311]` |
| Docker Engine (swarm manager `micro`) | `29.8.1` | `docker service update` / `inspect` | `[VERIFIED: docker version on micro]` |
| `alpine:3.20` | present on micro (7.81 MB) | Throwaway 1-replica service carrying the four candidate rules (no pull needed) | `[VERIFIED: docker image ls on micro]` |
| `jq`, `curl`, `openssl`, `shred`, `bash`, `nc` | present on micro | Gate filters, probes, apr1 check, credential file deletion | `[VERIFIED: command -v on micro]` |
| `node` (workstation) | as used by Phase 31 | `scripts/generate-traefik-mirror.js` / `check-traefik-mirror.js` | `[VERIFIED: ran in Phase 31; package.json scripts `generate:traefik-mirror` / `check:traefik-mirror`]` |
| Device-flow harness | `/tmp/p31-device-flow/thinx-device-flow.mjs` (3010 B, 2026-10-07) + `~/Repositories/thinx-mcp-device` | EDGE-MIG-04 re-verification | `[VERIFIED: ls, 2026-10-08]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `PathPrefix(`/`)` catch-all (D-05, locked) | `HostRegexp(`^.+$`)` | Stricter (requires a non-empty Host) and closest to the v2 semantics, but keeps a regexp in a catch-all; D-05 is locked — cited only |
| 1-replica `alpine:3.20` throwaway | `--replicas 0` + `traefik.swarm.lbswarm=true` | VIP path works in the source but is untested here (`[ASSUMED]`); 1 replica reproduces exactly how the live routers are built (per-task servers) |

## Package Legitimacy Audit

Not applicable — this phase installs no packages. The only image used beyond the live edge is `alpine:3.20`,
already present on micro (no registry pull). `[VERIFIED: docker image ls on micro, 2026-10-08]`

## Q1 — v3 matcher semantics (D-08, D-05, D-06, D-07, per-router `ruleSyntax`, switch side effects)

### `HeadersRegexp` -> `HeaderRegexp`: rename only, semantics identical

- Official rename: "The `Headers` and `HeadersRegexp` matchers have been renamed to `Header` and
  `HeaderRegexp` respectively." and "`HeaderRegexp`, `HostRegexp`, `PathRegexp`, `QueryRegexp`, and
  `HostSNIRegexp` matchers now uses the Go regexp syntax." `[CITED: doc.traefik.io/traefik/migrate/v2-to-v3-details/ §Router Rule Matchers]`
- v3 implementation (read this session, tag `v3.7.14` = `3bd7aa32`): `[VERIFIED: pkg/muxer/http/matcher.go:200-212]`
  ```go
  func headerRegexp(tree *matchersTree, headers ...string) error {
  	key, value := http.CanonicalHeaderKey(headers[0]), headers[1]
  	re, err := regexp.Compile(value)
  	...
  	tree.matcher = func(req *http.Request) bool {
  		return slices.ContainsFunc(req.Header[key], re.MatchString)
  	}
  ```
  → **unanchored partial match** (`MatchString`, no implicit `^…$`) over every value of the canonicalised
  header; Go RE2 syntax; `(?i)` is a normal Go flag.
- v2 implementation (what runs live today): `headersRegexpV2` delegates to `mux.NewRouter().NewRoute().HeadersRegexp(headers...)`
  `[VERIFIED: pkg/muxer/http/matcher_v2.go:227-236]`; gorilla/mux `HeadersRegexp` compiles with
  `regexp.Compile(pairs[i+1])` and matches with `v.MatchString(value)` over the canonical header's values —
  its own doc comment says "Use the start and end of string anchors (^ and $) to match an exact value."
  `[VERIFIED: gorilla/mux v1.8.1 route.go:269-282, mux.go:520-534, 575-593; identical in the containous/mux fork 41b6ec3 that traefik's go.mod replaces it with (mux.go:516, :577)]`
- **Conclusion:** the only behaviour that changes is the matcher name. No anchoring change, no case
  change. Documentation anchoring note: the v3 reference does not state a default; its examples anchor
  explicitly (`HeaderRegexp(`Content-Type`, `(?i)^application/(json|yaml)$`)`). `[CITED: doc.traefik.io/traefik/reference/routing-configuration/http/routing/rules-and-priority/]`
  Keep `(?i)websocket` unanchored as D-08 locks it.
- Falsification this session (Go 1.26): `(?i)websocket` MatchString → `WebSocket` true, `websocket` true,
  `Upgrade, websocket` true. `[VERIFIED: go run /tmp/p32-regexp-test/main.go]` Live under v2 today: a full
  HTTP/1.1 upgrade request with `Upgrade: WebSocket` (mixed case) reached the API (`401` with
  `X-Forwarded-Proto: https`) — i.e. the case-insensitive match the legacy clients rely on works and must
  keep working. `[VERIFIED: curl --http1.1 probe against rtm.thinx.cloud, 2026-10-08 12:06Z]`

### `PathPrefix(`/`)` as the catch-all (D-05 locked; D-06 accepted)

- v3 `PathPrefix` "no longer uses regular expressions to match path prefixes" and `Path`/`PathPrefix`
  "no longer support path parameter placeholders". `[CITED: migrate/v2-to-v3-details §New V3 Syntax Notable Changes]`
- Implementation: `[VERIFIED: pkg/muxer/http/matcher.go:175-188]`
  ```go
  	tree.matcher = func(req *http.Request) bool {
  		routingPath := getRoutingPath(req)
  		return routingPath != nil && strings.HasPrefix(*routingPath, path)
  	}
  ```
  → no host is consulted; matches every request with a routing path starting with `/`, i.e. every
  ordinary request including bare-IP and hostless (HTTP/1.0, no `Host`) requests — exactly D-06.
- What "today" actually looks like (baseline the executor must record, not assert — read-only probes
  2026-10-08): `http://188.166.23.244/` → `301 https://188.166.23.244/` (the v2 `{host:.+}` already matches a
  bare IP, so `downtime-http`'s `https-redirect` answers); `https://188.166.23.244/ -k` → `200` (downtime
  page); hostless `GET / HTTP/1.0` on `:80` → Traefik's own `HTTP/1.0 404 Not Found` (`text/plain`).
  `[VERIFIED: curl / nc from workstation]` So the D-06 delta is **only the hostless case** (404 → downtime
  redirect/page); bare-IP behaviour is unchanged. After Stage 2 the bare-IP pair (301 / 200) doubles as the
  behavioural proof that the catch-alls are alive (see the silent-failure pitfall below).
- Stricter equivalent, for the record: v3 `HostRegexp(`^.+$`)` (or the unanchored `.+`, identical for
  this pattern: both reject `""` and accept any non-empty host — `[VERIFIED: go run, "" → false; "188.166.23.244" → true]`).
  `hostRegexp` matches `re.MatchString(GetCanonicalHost) || re.MatchString(GetCNAMEFlatten)` with no
  implicit anchors. `[VERIFIED: matcher.go:124-142]` D-05 chose `PathPrefix(`/`)` — locked; it is simpler
  (no regexp), deterministic, and the hostless delta is accepted by D-06.

### The v2 catch-all under native v3 is a *silent* dead router (top pitfall, drives D-01's order)

- Under the v3 parser the rule `HostRegexp(`{host:.+}`)` is handed to `regexp.Compile("{host:.+}")`
  (`matcher.go:131`). Go's RE2 treats a `{` that does not start a valid repetition as a literal, so it
  **compiles successfully** and matches only hosts that literally contain `{host:` … `}`:
  `MatchString("rtm.thinx.cloud") = false`, `MatchString("188.166.23.244") = false`,
  `MatchString("{host:x}") = true`. `[VERIFIED: go run /tmp/p32-regexp-test/main.go, Go 1.26]`
- Consequence: `/api/http/routers` would keep reporting `downtime-*` / `error-router` as
  `status: "enabled"` with no error while they never match anything. The router status filter is
  therefore **blind** to an unconverted catch-all. Only `HeadersRegexp` fails loudly (next bullet).
- `HeadersRegexp` under v3: the v3 matcher table has no such function, so the predicate parser rejects it;
  `AddRoute` wraps the error as `error while parsing rule <rule>: …` and the router is put in error state
  (`routerConfig.AddError(err, true)`; logged at Error level, visible even at `--log.level=ERROR`).
  `[VERIFIED: pkg/muxer/http/mux.go:80-84; pkg/muxer/http/parser.go:86-104; pkg/server/router/router.go:281-284]`
  The leaf message is predicate's `unsupported function: %s` `[VERIFIED: vulcand/predicate v1.3.0 parse.go:182]`;
  the exact concatenated string (expected `… parsing rule …: unsupported function: HeadersRegexp`) is
  `[ASSUMED]` — the probe in §Q2 records the real text.
- **Planner consequence:** Stage 1 must convert all four routers (with `ruleSyntax=v3`) before Stage 2,
  and the Stage 2 gate must include the bare-IP catch-all probe (`301` / `200`) — status filter alone is
  insufficient for the two catch-all services.

### D-07 — v3 router priority: keep 1 / 2 / 200 unchanged

- Docs: "routes are sorted, by default, in descending order using rules length"; "The priority is directly
  equal to the length of the rule"; "A value of `0` for the priority is ignored: `priority: 0` means that
  the default rules length sorting is used."; "Negative priority values are supported."; max user priority
  `(MaxInt64 - 1000)` on 64-bit. `[CITED: reference/routing-configuration/http/routing/rules-and-priority/ §Priority Calculation]`
- Source: `[VERIFIED: pkg/muxer/http/mux.go:73-77]` `func GetRulePriority(rule string) int { return len(rule) }`;
  applied only when unset: `[VERIFIED: pkg/server/router/router.go:245-247]`
  ```go
  		if routerConfig.Priority == 0 {
  			routerConfig.Priority = httpmuxer.GetRulePriority(routerConfig.Rule)
  		}
  ```
  and routes sort `r[i].priority > r[j].priority || (equal && providerPriority …)` `[VERIFIED: mux.go:217-218]`.
- Applied to this edge: the three explicit labels (`priority=1`, `=2`, `=200`) are used verbatim — rule
  length is never consulted for them, so shortening the catch-all from 22 to 14 characters is
  irrelevant. Every host router keeps its default `len(rule)` (e.g. ``Host(`rtm.thinx.cloud`)`` = 23),
  which is > 2 > 1 (catch-alls lose to any host router, as today) and < 200 (the WS router keeps winning
  over the rtm console router, as today). **Conclusion: keep; no evidence for a change.**
- Readback signal: `/api/http/routers[].priority` (int) and `priorityStr` are returned by the API
  `[VERIFIED: pkg/api/handler_http.go:17-23; pkg/config/dynamic/http_config.go:98]`.

### Per-router `ruleSyntax` label (basis of D-01 Stage 1)

- Label key: `traefik.http.routers.<router_name>.ruleSyntax` (example value `v3`); "Labels are
  case-insensitive."; "RuleSyntax option is deprecated and will be removed in the next major version."
  `[CITED: reference/routing-configuration/other-providers/swarm/]` Valid values shown: `v2`, `v3`
  `[CITED: rules-and-priority §RuleSyntax]`; "The default value of the `ruleSyntax` option is inherited from
  the `core.defaultRuleSyntax` option." `[CITED: same]`
- Mechanism (why a `ruleSyntax=v3` router parses with v3 while the default is v2):
  `[VERIFIED: pkg/server/aggregator.go:337-345]` — only routers with **empty** `RuleSyntax` receive the
  model default; `[VERIFIED: pkg/server/router/router.go:281]` — `muxer.AddRoute(routerConfig.Rule,
  routerConfig.RuleSyntax, routerConfig.Priority, …)`; `[VERIFIED: pkg/muxer/http/parser.go:36-66]` — the
  parser map is `{"v2": httpFuncsV2, "v3": httpFuncs}` and `parse(syntax, rule)` picks `parsers[syntax]`
  (unknown → v3). The swarm provider feeds labels through the generic dynamic-config label decoder, so
  the key is the `RuleSyntax` field's label name (`ruleSyntax`, case-insensitive) — same as the Docker
  provider. `[VERIFIED: pkg/config/dynamic/http_config.go:96-97]`
- Readback: `/api/http/routers` returns `ruleSyntax` per router (`RouterInfo` embeds `*dynamic.Router`,
  json tag `ruleSyntax,omitempty`) `[VERIFIED: pkg/config/runtime/runtime_http.go:76-84; http_config.go:97]`.
  Today every root router should read `"ruleSyntax":"v2"` (inherited); after Stage 1 the four read `v3`;
  after Stage 2 all read `v3`.

### `--core.defaultRuleSyntax` removal: no side effects beyond a Warn log

- Static config: `DefaultRuleSyntax` defaults to `"v3"` (`SetDefaults`); the field is marked
  `// Deprecated: Please do not use this field and rewrite the router rules to use the v3 syntax.`
  `[VERIFIED: pkg/config/static/static_config.go:116-126]`
- The only places the value is used: (a) validation — `"v3"` NOOP, `"v2"` → `log.Warn().Msgf("v2 rules
  syntax is now deprecated, please use v3 instead...")`, anything else → startup error `unsupported default
  rule syntax configuration` `[VERIFIED: static_config.go:464-472]`; (b) copied into
  `providers.kubernetesIngress.defaultRuleSyntax` (not used on this edge) `[VERIFIED: static_config.go:390-393]`;
  (c) seeds the `@internal` model that empty-`ruleSyntax` routers inherit (aggregator, above).
- Logging signal: the deprecation Warn is emitted **at startup only and at Warn level** — invisible under the
  live `--log.level=ERROR`, so its absence proves nothing. The useful probe/live log signal is the
  Error-level `error while parsing rule …` line for a router that still carries a v2-only matcher
  (`router.go:283`), plus `status: "disabled"` + `error: [...]` in `/api/http/routers`. "By default, the
  `defaultRuleSyntax` install option is automatically set to `v3`". `[CITED: migrate/v2-to-v3-details §Remediation]`
- Official deprecation page lists no entry for the rule syntax (it carries only three items incl.
  `underscoreHeadersStrategy` deprecated in 3.7.12) — the deprecation is stated on the migration and
  routers pages instead. `[CITED: doc.traefik.io/traefik/deprecation/features/]`

## Q2 — Probe design for D-02 (throwaway `traefik:v3.7.14` without the switch)

### Why "scaled-to-zero" does not work as written

- Without `traefik.swarm.lbswarm=true` the swarm provider builds servers **from tasks**: `listTasks` filters
  `service=<id>` + `desired-state=running`, skips tasks whose `Status.State != running`, and only tasks with
  ≥1 network produce a `dockerData`. A service with 0 replicas has 0 tasks → no `dockerData` → **no router,
  no service, nothing in `/api/http/routers`**. `[VERIFIED: pkg/provider/docker/pswarm.go:196-210, 265-290]`
- `allowEmptyServices` (default `false`: "Instructs the provider to create any servers load balancer defined
  for Docker containers regardless of the healthiness of the corresponding containers")
  `[CITED: reference/install-configuration/providers/swarm/]` only relaxes the container **Health** filter
  (`if !p.AllowEmptyServices && container.Health != "" && container.Health != Healthy`) — it cannot
  conjure a task that does not exist. `[VERIFIED: pkg/provider/docker/config.go:228-231]` Do not add it.
- With `lbswarm=true` and VIP endpoint mode the provider uses `service.Endpoint.VirtualIPs` and emits the
  service if it has ≥1 network, independent of tasks `[VERIFIED: pswarm.go:200-203, 239-260]`; that a
  0-replica service keeps a valid VIP is `[ASSUMED]` (not exercised). Prefer the 1-replica form below.

### Recommended throwaway (1 replica, isolated from the live edge by constraint label)

- Isolation: the live edge prunes any service whose labels do not satisfy
  ``Label(`traefik.constraint-label`, `traefik-public`)`` (`constraints.MatchLabels` → "Container pruned by
  constraint expression") `[VERIFIED: config.go:205-213]`. Give the throwaway
  `traefik.constraint-label=p32-probe` and boot the probe with
  ``--providers.swarm.constraints=Label(`traefik.constraint-label`, `p32-probe`)``. The live
  `traefik_traefik` never sees the catch-all/WS rules; the probe sees only the throwaway. Constraint
  expressions support `Label`, `LabelRegex`, `&&`, `||`, `!` and parentheses
  `[CITED: reference/install-configuration/providers/swarm/ §constraints]` — optionally use
  ``Label(`traefik.constraint-label`, `p32-probe`) || Label(`traefik.constraint-label`, `traefik-public`)``
  on the probe to *also* observe the live v2-only routers failing under native v3 (expected: `thinx-api-ws@swarm`
  disabled with the parse error; `downtime-*`/`error-router` enabled-but-dead per §Q1) — a useful
  falsification record, read-only for the live edge.
- Server port: alpine exposes no port and "By default, Traefik uses the lowest exposed port of a container"
  `[CITED: other-providers/swarm/]`, so the throwaway MUST carry
  `traefik.http.services.p32.loadbalancer.server.port=80` or the service builds no server and the routers
  reference a missing service (`[ASSUMED]` exact failure text; the label avoids the question).
- Throwaway service (names under Claude's discretion; `alpine:3.20` is already on micro):
  ```bash
  ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service create --name p32-rules --detach --replicas 1 \
    --constraint 'node.labels.Traefik == true' --network traefik-public --limit-memory 16M \
    --label gsd.phase=32 --label gsd.purpose=rule-probe \
    --label traefik.enable=true --label traefik.constraint-label=p32-probe --label traefik.swarm.network=traefik-public \
    --label traefik.http.services.p32.loadbalancer.server.port=80 \
    --label 'traefik.http.routers.p32-ws.rule=Host(\`rtm.thinx.cloud\`) && HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)' \
    --label traefik.http.routers.p32-ws.entrypoints=https --label traefik.http.routers.p32-ws.priority=200 \
    --label traefik.http.routers.p32-ws.service=p32 --label traefik.http.routers.p32-ws.tls=true \
    --label 'traefik.http.routers.p32-downtime-http.rule=PathPrefix(\`/\`)' \
    --label traefik.http.routers.p32-downtime-http.entrypoints=http --label traefik.http.routers.p32-downtime-http.priority=2 \
    --label 'traefik.http.routers.p32-downtime-https.rule=PathPrefix(\`/\`)' \
    --label traefik.http.routers.p32-downtime-https.entrypoints=https --label traefik.http.routers.p32-downtime-https.priority=2 \
    --label traefik.http.routers.p32-downtime-https.tls=true \
    --label 'traefik.http.routers.p32-error-router.rule=PathPrefix(\`/\`)' \
    --label traefik.http.routers.p32-error-router.entrypoints=http --label traefik.http.routers.p32-error-router.priority=1 \
    alpine:3.20 sleep 3600"
  # expect: converges to 1/1 on micro; no published ports
  ```
  Deliberately **no** `tls.certresolver` on the throwaway routers (the probe's `le` resolver points at the
  LE staging CA with throwaway storage, but a catch-all has no Host to request anyway) and **no**
  `ruleSyntax` label — the probe's default is v3, so `enabled` proves native-v3 parsing (D-02's claim).
- Probe: the Phase 31 recipe `[VERIFIED: .planning/runbooks/traefik-v3-cutover.md:227-245]` minus
  `--core.defaultRuleSyntax=v2`, with the constraint swapped to `p32-probe`:
  ```bash
  ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service create --name traefik_p32probe --detach \
    --constraint 'node.labels.Traefik == true' --network traefik-public \
    --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly \
    --limit-memory 256M --label gsd.phase=32 --label gsd.purpose=boot-and-discover-v3-native \
    traefik:v3.7.14 \
    --providers.swarm '--providers.swarm.constraints=Label(\`traefik.constraint-label\`, \`p32-probe\`)' \
    --providers.swarm.exposedbydefault=true \
    --entrypoints.http.address=:80 --entrypoints.https.address=:443 --entrypoints.vpn.address=:1194 \
    --entrypoints.mqtt.address=:1883 --entrypoints.mqtts.address=:8883 --entrypoints.thxp.address=:7442 \
    --certificatesresolvers.le.acme.email=\${EMAIL} \
    --certificatesresolvers.le.acme.storage=/tmp/acme-test.json \
    --certificatesresolvers.le.acme.tlschallenge=true \
    --certificatesresolvers.le.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory \
    --accesslog --log --log.level=ERROR --api --api.insecure=true"
  # expect: 1/1 in ~10 s; Endpoint.Ports == null; the only mount is docker.sock:ro; 18 args (16 converted + 2 probe-only)
  ```
  `${EMAIL}` is read from the live service Args into a shell variable on micro and never printed (as in
  Phase 31). Optional second run WITH `--core.defaultRuleSyntax=v2` and the four `ruleSyntax=v3` labels on the
  throwaway mirrors Stage 1's exact live condition (v2 default + per-router override) — recommended, costs
  ~1 min, same teardown.
- Gate (reuses the runbook idiom `[VERIFIED: runbook:269-273]`):
  ```bash
  ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "T=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_p32probe | head -1); \
    docker exec \$T wget -qO- http://localhost:8080/api/http/routers \
    | jq -r '.[] | select(.name|startswith(\"p32-\")) | .name + \"  \" + .status + \"  \" + (.priority|tostring) + \"  \" + (.ruleSyntax // \"-\") + \"  \" + .rule'"
  # expect: exactly 4 lines, every status == enabled, priorities 200/2/2/1, ruleSyntax v3 (inherited default), rules verbatim
  ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "T=\$(docker ps -q -f label=com.docker.swarm.service.name=traefik_p32probe | head -1); \
    docker exec \$T wget -qO- http://localhost:8080/api/http/routers | jq -r '.[] | select(.status!=\"enabled\") | .name + \"  \" + .status + \"  \" + (.error|tostring)'"
  # expect: nothing (with the optional || constraint: exactly thinx-api-ws@swarm disabled … HeadersRegexp — record the text)
  ```
- Teardown + no-side-effect checks (runbook `:343-357`):
  ```bash
  ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service rm traefik_p32probe p32-rules; docker service ls --filter name=p32 --format '{{.Name}}'; docker service ls --filter name=p32probe --format '{{.Name}}'"
  # expect: two ids echoed by rm, then nothing
  ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "stat -c '%s %Y %a %U' /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json; docker service inspect traefik_traefik --format '{{.Version.Index}} {{len .Spec.TaskTemplate.ContainerSpec.Args}}'"
  # expect: 301121 1791410693 600 root (unchanged since 31-03); 38379311 17 (live edge untouched)
  ```

## Q3 — Verify-signal inventory (commands + `# expect:`)

All ssh calls use the literal form from AGENTS.md. `D` (dashboard host) is read from the live label, never
hard-coded: today it resolves to `Host(`micro.thinx.cloud`)` `[VERIFIED: ssh micro label readback]`
(`${DOMAIN}` is a public DNS name, not a D-12 secret class — README).

| Signal | Command | `# expect:` |
|---|---|---|
| Credential precondition | see §Q6 | `600 root`, `MATCH`, `/api/overview` → `200` |
| Router status filter (live API) | `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'P=$(cat /root/.p32-traefik-admin); U=$(docker service inspect traefik_traefik --format "{{index .Spec.Labels \"traefik.http.middlewares.admin-auth.basicauth.users\"}}"); D=$(docker service inspect traefik_traefik --format "{{index .Spec.Labels \"traefik.http.routers.traefik-public-https.rule\"}}" \| sed -E "s/.*\`([^\`]+)\`.*/\1/"); curl -sS -u "${U%%:*}:$P" "https://$D/api/http/routers" \| jq -r ".[] \| select(.status!=\"enabled\") \| .name + \"  \" + .status + \"  \" + (.error\|tostring)"; unset P'` | prints **nothing** (30 routers; `/api/overview` http routers 30 / errors 0 — probe counts are 32/9 only under `--api.insecure`) |
| Per-router rule + syntax readback (API) | same auth prefix, then `curl -sS -u … "https://$D/api/http/routers" \| jq -r '.[] \| select(.name\|test("^(thinx-api-ws\|downtime-http\|downtime-https\|error-router)@swarm$")) \| .name + "  " + .status + "  p=" + (.priority\|tostring) + "  syn=" + (.ruleSyntax // "-") + "  " + .rule'` | Stage 1: 4 lines, `enabled`, `p=200/2/2/1`, `syn=v3`, v3 rules; Stage 2/3: same with `syn=v3` inherited |
| Per-router label readback (spec) | `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "for s in thinx_api downtime_downtime errorpage_errorpage; do echo \"-- \$s\"; docker service inspect \$s --format '{{range \$k,\$v := .Spec.Labels}}{{\$k}}={{\$v}}{{println}}{{end}}' \| grep -E 'routers\.(thinx-api-ws\|downtime-http\|downtime-https\|error-router)\.(rule\|priority\|ruleSyntax)'; done"` | Stage 1: rule = v3 form + `…ruleSyntax=v3` per router; end state (D-03): v3 rule, priority, **no** `ruleSyntax` line; today: v2 rules, no `ruleSyntax` `[VERIFIED live 2026-10-08]` |
| Static args readback (flag count) | `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len .Spec.TaskTemplate.ContainerSpec.Args}} idx={{.Version.Index}}'; docker service inspect traefik_traefik --format '{{range .Spec.TaskTemplate.ContainerSpec.Args}}{{println .}}{{end}}' \| grep -c core.defaultRuleSyntax"` | before: `traefik:v3.7.14 args=17 idx=38379311` / `1`; after Stage 2: `args=16`, new index, `0` |
| Args index-exact vs mirror (pre-B1 idiom) | rebuild args on micro from the 600-root backup via `jq 'map(@sh)'` as in 31-03, dry-print, diff against the 16 `- --` lines of `docker-compose.traefik.yml` (email masked) | diff empty, 16/16 |
| Live log scan after Stage 2 | `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service logs traefik_traefik --since 3m 2>&1 \| grep -ci 'error while parsing rule\|unsupported function'"` | `0` (Error-level lines are visible at `--log.level=ERROR`) |
| HTTPS host matrix (baseline before, re-run after each stage) | `for H in app.thinx.cloud console.thinx.cloud rtm.thinx.cloud thinx.cloud swarmpit.thinx.cloud micro.thinx.cloud; do ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "curl -sS -o /dev/null -w '$H %{http_code}\n' https://$H/"; done` plus the external hosts discovered in the 31-01 table (`fotostim` com/cz, `igraczech`, `syxra`) | identical to the recorded baseline: app/console/rtm/thinx.cloud/swarmpit `200`, micro `401`; externals as baselined (record, don't assume) |
| HTTP redirect matrix | `for H in console.thinx.cloud rtm.thinx.cloud thinx.cloud swarmpit.thinx.cloud micro.thinx.cloud app.thinx.cloud; do ssh … "curl -sS -o /dev/null -w '$H %{http_code} %{redirect_url}\n' http://$H/"; done` | `301 https://<host>/` for the redirect hosts; `app 200` (by design) |
| **Catch-all behavioural probe (new, required after Stage 1 and Stage 2)** | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -m 15 http://188.166.23.244/; curl -sk -o /dev/null -w '%{http_code}\n' -m 15 https://188.166.23.244/` | `301 https://188.166.23.244/` and `200` — same as today's baseline `[VERIFIED 2026-10-08]`; anything else = the catch-alls died silently (§Q1) |
| Hostless probe (D-06 record only) | `printf 'GET / HTTP/1.0\r\n\r\n' \| timeout 10 nc 188.166.23.244 80 \| head -1` | today `HTTP/1.0 404 Not Found` (Traefik); after D-05 expected a `301`/downtime answer — **record**, do not gate on it |
| **WebSocket upgrade probe (replaces the "200" wording)** | `K=dGhlIHNhbXBsZSBub25jZQ==; curl -s --http1.1 -D - -o /dev/null -m 10 -H "Connection: upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: $K" -H "Sec-WebSocket-Version: 13" -H "Cookie: foo=bar" https://rtm.thinx.cloud/p32probe \| head -3` | `HTTP/1.1 401 Unauthorized` + `X-Forwarded-Proto: https` (the API's raw reject, `thinx-core.js:503-507`, through `sslheaders@swarm`); **no** `Server: nginx`. Repeat with `-H "Upgrade: WebSocket"` → same `401` (case-insensitivity, D-08) `[VERIFIED live 2026-10-08 12:06Z]` |
| Ports open (micro, local) | `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "for p in 7442 1883 8883; do timeout 3 bash -c \"</dev/tcp/127.0.0.1/\$p\" && echo \$p OPEN \|\| echo \$p CLOSED; done"` | `7442 OPEN`, `1883 OPEN`, `8883 OPEN` |
| Ports published directly | `ssh … "docker service inspect thinx_api --format '{{range .Endpoint.Ports}}{{.PublishedPort}}->{{.TargetPort}} {{end}}'; docker service inspect thinx_mosquitto --format '{{range .Endpoint.Ports}}{{.PublishedPort}}->{{.TargetPort}} {{end}}'"` | `7442->7442` ; `1883->1883 1884->1884 8883->8883` (unchanged; Traefik publishes only 80/443) |
| Device-flow harness (EDGE-MIG-04) | `cd ~/Repositories/thinx-mcp-device && THINX_AUTO_UPDATE=false node /tmp/p31-device-flow/thinx-device-flow.mjs p32-7442 http://rtm.thinx.cloud 7442 thinx.cloud 1883` and `… p32-https https://app.thinx.cloud` | `PASS` each: register → status → OTT 200 → firmware (md5Match) → MQTT connect + ACL → publish → recent → disconnect `[VERIFIED: 31-03-SUMMARY D5; harness args at /tmp/p31-device-flow/thinx-device-flow.mjs:7-11]` |
| Cert serials unchanged | `for H in app.thinx.cloud rtm.thinx.cloud; do echo \| openssl s_client -connect $H:443 -servername $H 2>/dev/null \| openssl x509 -noout -serial -checkend 0; done` | `serial=051152D5A20BE36DEFA1B6FA83379CE42809` (app), `serial=0535CC0C71E39D9378E72893F3A2141267B0` (rtm), `Certificate will not expire` `[VERIFIED: runbook:715-716]` |
| acme.json untouched | `ssh … "stat -c '%s %Y %a %U' /var/lib/docker/volumes/traefik_traefik-public-certificates/_data/acme.json"` | `301121 1791410693 600 root` before Stage 2; after the Stage 2 restart the mtime may change (v3 rewrites on start) — compare cert/key blobs as in 31-03 if size changes |
| Label-only = no task restart (Stage 1, Stage 3) | `ssh … "docker service ps thinx_api downtime_downtime errorpage_errorpage --filter desired-state=running --format '{{.ID}} {{.Name}} {{.CurrentState}}'"` before/after | identical task ids and "Running N days ago" (today: downtime on `core`, errorpage on `micro`, both 4 days) |
| Console (human) | `/console-retest` checklist in the browser: Devices page renders, WS target `wss://rtm.thinx.cloud/…`, DevTools WS frame `101` | operator sign-off at the single `blocking-human` gate (D-11) |

**Reconciling D-10/D-11 "WS probe 200":** Phase 31's probe returned 200 because it ran over HTTP/2
(curl's default for `https://`), where connection-specific `Upgrade`/`Connection` headers are not sent;
the request therefore matched the console router, not `thinx-api-ws` — re-verified today: the same full
headers over h2 → `server: nginx`, over `--http1.1` → `401` from the API. `[VERIFIED: curl -D - probes 2026-10-08]`
The planner should state the D-10 trigger as "WS upgrade probe is not `401` with `X-Forwarded-Proto: https`
over HTTP/1.1" and D-11's evidence as that 401. A `200` from this probe would mean the WS router is **not**
matching (regression), the opposite of what D-10 assumes. The `(?i)` case check is the mixed-case variant.
Note for the backlog, out of scope: `thinx-core.js:500-508` only rejects an upgrade when a `Cookie` header
is present *without* `x-thx-core`; a request with no `Cookie` header at all proceeds to `handleUpgrade`
(`thinx-core.js:510-522`) — not a Phase 32 concern, but do not use a cookie-less probe as the gate.

## Q4 — Stage ordering, per-router rollback, Stage 2 revert

### Stage 1 order (recommendation: lowest blast radius first, WS last)
1. `errorpage_errorpage` — `error-router` (http entrypoint only, priority 1; the least-reachable router:
   downtime at priority 2 shadows it for hostless requests, every host router beats it).
2. `downtime_downtime` — `downtime-http` **and** `downtime-https` in ONE update (both routers live on the
   same service; one `docker service update` with four `--label-add` keeps the service spec atomic).
3. `thinx_api` — `thinx-api-ws` last, so the `--http1.1` 401 probe is the final Stage-1 check (as
   CONTEXT suggests).
After each step: per-router API readback (`enabled`, `syn=v3`), then the behavioural probe for that
router (bare-IP 301/200 for the catch-alls; the 401 WS probe for the API).

### Exact Stage 1 commands (rule + override in ONE update per service)
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach \
  --label-add 'traefik.http.routers.error-router.rule=PathPrefix(\`/\`)' \
  --label-add traefik.http.routers.error-router.ruleSyntax=v3 errorpage_errorpage"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach \
  --label-add 'traefik.http.routers.downtime-http.rule=PathPrefix(\`/\`)'  --label-add traefik.http.routers.downtime-http.ruleSyntax=v3 \
  --label-add 'traefik.http.routers.downtime-https.rule=PathPrefix(\`/\`)' --label-add traefik.http.routers.downtime-https.ruleSyntax=v3 downtime_downtime"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach \
  --label-add 'traefik.http.routers.thinx-api-ws.rule=Host(\`rtm.thinx.cloud\`) && HeaderRegexp(\`Upgrade\`, \`(?i)websocket\`)' \
  --label-add traefik.http.routers.thinx-api-ws.ruleSyntax=v3 thinx_api"
# expect each: rc 0; task id unchanged (.Spec.Labels is outside TaskTemplate); provider picks the change up within refreshSeconds (15 s default)
```
`--label-add` on an existing key overwrites the value (runbook B2 note; observed live in 31-03).
`[VERIFIED: runbook:128 "closes the B1 window; --label-add on an existing key overwrites the value"; 31-03 timeline 22:04:52Z]`

### Per-router rollback (single step — never a mixed state)
```bash
# generic: restore the v2 rule AND drop the override in one update (valid only while the switch is still live, i.e. before Stage 2)
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach \
  --label-add 'traefik.http.routers.error-router.rule=HostRegexp(\`{host:.+}\`)' --label-rm traefik.http.routers.error-router.ruleSyntax errorpage_errorpage"
# downtime: both routers in one update; thinx-api-ws: rule=Host(`rtm.thinx.cloud`) && HeadersRegexp(`Upgrade`, `(?i)websocket`)
```
Why one update: a v2 rule with `ruleSyntax=v3` still set is a parse error (router disabled), and a v3
rule with the override removed is parsed as v2 (`HeaderRegexp` unknown → disabled; `PathPrefix(`/`)` is
valid v2 and would keep working). Both halves in one `--label-add … --label-rm …` avoid the window.

### Stage 2 and its revert
- Apply: rebuild the 16-flag args on micro from the 600-root full-spec backup
  (`/mnt/data/edge-rollback/traefik-p31-precutover-…json` idiom, `jq 'map(@sh)'`, index 3 =
  `--core.defaultRuleSyntax=v2` deleted), dry-print, diff index-exact against the regenerated
  `docker-compose.traefik.yml` (16 `- --` lines), then
  `docker service update --detach --args "<16 flags>" traefik_traefik` — one task restart (~4 s in 31-03 B1
  `[VERIFIED: runbook:688-690]`), `Version.Index` advances, image unchanged.
- Revert: the same command with the 17-flag set (re-adding `--core.defaultRuleSyntax=v2` at its original
  index 3 so the mirror diff stays index-exact if ever compared). Because Stage 1 already converted all
  four routers with per-router `ruleSyntax=v3`, the revert is safe in either direction: with the switch back,
  the four still parse as v3 via their override (aggregator only fills **empty** `RuleSyntax`).
- D-10 auto-revert triggers (restated with the corrected WS expectation): status filter prints anything;
  any HTTPS-matrix code differs from baseline; WS probe over `--http1.1` is not `401`; **add**: bare-IP
  probe is not `301`/`200`.

### Stage 3 (D-03) — strip the overrides
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-rm traefik.http.routers.error-router.ruleSyntax errorpage_errorpage"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-rm traefik.http.routers.downtime-http.ruleSyntax --label-rm traefik.http.routers.downtime-https.ruleSyntax downtime_downtime"
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service update --detach --label-rm traefik.http.routers.thinx-api-ws.ruleSyntax thinx_api"
# expect: label-only, task ids unchanged; API readback still syn=v3 (now inherited from the v3 default)
```
Functionally a no-op once the default is v3 — but it is the only way to make the live spec equal the
committed files (D-03/D-04).

### Rules that still apply
- **No two-label bridge** — the v3 swarm provider skips any service carrying both `traefik.docker.*` and
  `traefik.swarm.*` keys (`ERR Skip container error="both Docker and Swarm labels are defined"`); this phase
  touches no network-label family, but every label migration stays single-step. `[VERIFIED: runbook:116-130 CORRECTION; 31-03-SUMMARY deviation]`
- **Label-only updates do not restart tasks**: Stage A (16 services) and Stage C (15 services) in Phase 31
  changed labels with every task id pre == post and "4 s total, zero task restarts"; `.Spec.Labels` is
  outside `TaskTemplate`. `[VERIFIED: runbook:518-519, 31-03-SUMMARY "all 15 Stage-C task ids pre == post"]`
- **Never `docker stack deploy` / `restart.sh`** for edge changes (drops live-only secret mounts, resets
  edge auth hashes, redeploys storage-bearing services). `[VERIFIED: runbook:112-123]`
- **Swarmpit autoredeploy is irrelevant to labels**: a `thinx-staging` push rebuilds and rolls `thinx_api`
  (~6 min) but does not change live labels; only the `docker service update` does (CONTEXT Integration
  Points). A rolling `thinx_api` task during Stage 1 would briefly give `thinx-api-ws` 0→1 servers — avoid
  pushing `thinx-staging` while Stage 1 runs on `thinx_api`.

## Q5 — Repo-first mechanics (D-04)

### Files to edit (exact lines, read this session)
| Stage | File | Line(s) | Edit |
|---|---|---|---|
| 1 | `~/Repositories/thinx-swarm/errorpage.yml` | 23 | ``rule=HostRegexp(`{host:.+}`)`` → ``rule=PathPrefix(`/`)``; add `- traefik.http.routers.error-router.ruleSyntax=v3` `[VERIFIED: errorpage.yml:23-24]` |
| 1 | `~/Repositories/thinx-swarm/downtime.yml` | 23, 28 (note trailing spaces on 24/29 `priority=2 ` — YAML strips them; live value is `2`) | both rules → ``PathPrefix(`/`)``; add `ruleSyntax=v3` for `downtime-http` and `downtime-https` `[VERIFIED: downtime.yml:23-30; live label `priority=2`]` |
| 1 | `~/Repositories/thinx-swarm/thinx.yml` | 306 | `HeadersRegexp` → `HeaderRegexp`; add `"traefik.http.routers.thinx-api-ws.ruleSyntax=v3"` `[VERIFIED: thinx.yml:306-312]` |
| 1 | `docker-swarm.yml` (this repo) | 378 | identical edit to thinx.yml (must stay identical except the 3 SEC-CFG-04 secret attachments — confirmed: the only `diff` lines today are secret attachments and env ordering `[VERIFIED: diff 2026-10-08]`) |
| 2 | `~/Repositories/thinx-swarm/traefik.yml` | 106-108 | delete `- --core.defaultRuleSyntax=v2` and its two comment lines (or rewrite the comment to record the removal) `[VERIFIED: traefik.yml:106-108]` |
| 2 | `docker-compose.traefik.yml` | generated | regenerate (16 `- --` lines; banner SHA = new thinx-swarm HEAD) |
| 3 | `errorpage.yml`, `downtime.yml`, `thinx.yml`, `docker-swarm.yml` | as above | remove the four `ruleSyntax=v3` labels |

The `error-router` comment lines in `traefik.yml` (`:46-50`) and the WS comments in `thinx.yml`/`docker-swarm.yml`
(`:303-305` / `:375-377`) should mention Phase 32 (EDGE-MIG-03) so the next reader knows why `HeaderRegexp`.

### Mirror regeneration — after EVERY thinx-swarm commit, not only the traefik.yml one
`check-traefik-mirror.js --swarm-repo` compares the banner SHA to thinx-swarm **HEAD**, so a thinx.yml-only
commit also makes the mirror `MIRROR-STALE` locally (CI runs integrity-only mode).
`[VERIFIED: scripts/check-traefik-mirror.js header, "Freshness mode … must equal the banner's source SHA (else MIRROR-STALE)"]`
```bash
node scripts/generate-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm" && node scripts/check-traefik-mirror.js --swarm-repo "$HOME/Repositories/thinx-swarm"
# expect: MIRROR-GENERATED ok source=thinx-swarm@<new 40-hex sha> -> docker-compose.traefik.yml ; MIRROR OK files=1
grep -c '^ *- --' docker-compose.traefik.yml      # expect: 17 after Stage-1 commits, 16 after the Stage-2 commit
grep -c 'core.defaultRuleSyntax' docker-compose.traefik.yml   # expect: 0 after Stage 2 (comments included — rewrite any comment that names it, or accept 1 and grep the flag line form `- --core` instead)
```
CI gate name: `Traefik mirror staleness (EDGE-RECON-01)` `[VERIFIED: .circleci/config.yml:679-680]`.
Commit the mirror + `docker-swarm.yml` in this repo per stage.

### micro checkout update (thinx-swarm has NO CI; micro cannot reach GitHub)
Precondition read today: micro checkout at `677e3a9` on `master` == workstation `master` `677e3a9`; working
tree has only 7 untracked `*.bak.20261007222957.pre-v3-labels` files (do not block a fast-forward).
`[VERIFIED: ssh micro git rev-parse/status 2026-10-08]`
```bash
cd ~/Repositories/thinx-swarm && git push origin master
GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020" git push ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/heads/p32-stage1
GIT_SSH_COMMAND="ssh -i ~/.ssh/DOKey2 -p2020" git push ssh://root@188.166.23.244/mnt/gluster/deployment/swarm master:refs/remotes/origin/master
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "cd /mnt/gluster/deployment/swarm && git status --short | grep -v '^??' ; git merge --ff-only p32-stage1 && git branch -d p32-stage1 && git rev-parse --short HEAD"
# expect: no tracked modifications listed; 'Fast-forward'; the new short SHA == workstation HEAD
```
`[VERIFIED: memory thinx-swarm-deploy-checkout.md (mechanism); micro state read today]` Repeat per stage
with `p32-stage2` / `p32-stage3`. Only then run the matching `docker service update`.

### Capture persistence — new `D` step pair, never touch `C.post.yml`
README convention is per-step pairs `traefik-edge.<step>.{pre,post}.yml`, redacted on micro (`<redacted>`
for secret values, `${DOMAIN}`/`${EMAIL}`/`${USERNAME}`/`${HASHED_PASSWORD}` kept templated, no resolved
values in comments). `[VERIFIED: swarm-configs/README.md "Persistence rules"]` Phase 32 is a new step:
- `traefik-edge.D.pre.yml` — captured before the probe (should differ from `C.post.yml` only in the header
  timestamps/`Version.Index` lines; the empty body-diff proves nothing moved between the phases).
- `traefik-edge.D.post.yml` — captured after Stage 3: 16-flag command, the four v3 rules and `ruleSyntax`
  ABSENT, `Version.Index` and task restart recorded, `acme.json` stat/blob continuity, the 30/0 router
  overview, the WS 401 and bare-IP probe results.
`C.post.yml` is the Phase 31 record — immutable. Secret-marker scan before commit: reuse the 31-03-PLAN
`<automated>` grep (apr1 / bcrypt hash prefixes, PEM armor headers) → count `0`; e-mail regex → `0`.
`[VERIFIED: 31-03-PLAN:173 idiom]`

## Q6 — Dashboard credential handling (D-12)

```bash
# precondition (plan <precondition>): operator pre-staged the file
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "stat -c '%a %U %s' /root/.p32-traefik-admin"
# expect: 600 root <nonzero>   (today: file ABSENT — verified 2026-10-08; the plan must not start Stage 1 without it)

# verify against the live apr1 hash and the API, entirely on micro, password never echoed and never on argv
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 'set +x; P=$(cat /root/.p32-traefik-admin); \
  U=$(docker service inspect traefik_traefik --format "{{index .Spec.Labels \"traefik.http.middlewares.admin-auth.basicauth.users\"}}"); \
  USER=${U%%:*}; HASH=${U#*:}; SALT=$(printf "%s" "$HASH" | cut -d\$ -f3); \
  CALC=$(printf "%s" "$P" | openssl passwd -apr1 -salt "$SALT" -stdin); \
  [ "$CALC" = "$HASH" ] && echo HASH=MATCH || echo HASH=MISMATCH; \
  D=$(docker service inspect traefik_traefik --format "{{index .Spec.Labels \"traefik.http.routers.traefik-public-https.rule\"}}" | sed -E "s/.*\`([^\`]+)\`.*/\1/"); \
  printf "overview=%s\n" "$(curl -sS -o /dev/null -w "%{http_code}" -u "$USER:$P" "https://$D/api/overview")"; unset P CALC'
# expect: HASH=MATCH ; overview=200

# end of phase (after D.post capture): destroy the file
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "shred -u /root/.p32-traefik-admin && ls /root/.p32-traefik-admin 2>&1 | grep -c 'No such file'"
# expect: 1
```
Notes: `-stdin` keeps the password off `ps`; the apr1 salt is field 3 of `$apr1$<salt>$<hash>`; the live
label holds the raw hash (compose `$$` escaping applies only to files). The dashboard host is the
`traefik-public-https` router's `Host()` (`micro.thinx.cloud` today), read from the label. Never use
`--api.insecure` on the live service; never `set -x` around these lines; never paste `$U`/`$HASH` into a
commit (the apr1 hash is a D-12 secret class — `C.post.yml` redacts it). Phase 31 did the same with
`/root/.p31-traefik-admin` (MATCH, `/api/overview` 200, file deleted at task end). `[VERIFIED: 31-03-SUMMARY "Secret hygiene"]`

## Architecture Patterns

### System Architecture Diagram (data flow of a request through the v3 edge, this phase's routers)

```
Internet ──:80/:443──> traefik_traefik (v3.7.14, swarm provider, constraint traefik-public)
                          │  static: --core.defaultRuleSyntax=v2  ──[Stage 2 removes]──> default v3
                          │  dynamic: labels of 16 traefik-enabled services (refreshSeconds 15s)
                          │
   per request ───────────┼─> entrypoint http (:80)                 entrypoint https (:443, TLS/ACME le)
                          │     ├ Host routers (prio=len rule ≈19-26) ├ Host routers (prio=len)
                          │     ├ downtime-http  prio 2 [v2→v3 rule]  ├ thinx-api-ws prio 200 [HeadersRegexp→HeaderRegexp] ─> thinx-api@swarm 10.0.1.x:7442 (sslheaders@swarm)
                          │     └ error-router   prio 1 [v2→v3 rule]  └ downtime-https prio 2 [v2→v3 rule]
                          │
   legacy devices ──:7442 plaintext ──> thinx_api (direct host publish, NOT via traefik)   ← untouched
   legacy devices ──:1883 / :8883 ────> thinx_mosquitto (direct host publish, NOT via traefik) ← untouched

   operator/executor ─ssh─> micro: docker service update (labels | args)  ←  repo-first: thinx-swarm commit → origin + micro ff → mirror regen (this repo)
   probe (D-02): traefik_p32probe (no host ports, --api.insecure inside task, constraint p32-probe) ⇄ p32-rules (alpine, 1 replica, 4 candidate routers)
```

### Pattern 1: Ordered surgical `docker service update`, repo-first, label-only where possible
**What:** one `docker service update` per service per stage; labels change without task restarts; the only
restart is the Stage 2 `--args` update on `traefik_traefik`.
**When to use:** every live edge change in this phase. **Source:** runbook §Cutover mechanism, 31-03 record.

### Pattern 2: Boot-and-discover probe with constraint isolation
**What:** a throwaway Traefik that sees only services labelled for it, asserts parse/enabled through its
in-task API, owns no host ports, neutralised ACME. **When to use:** D-02, and again for any future rule or
static-flag change (P33/P34).

### Pattern 3: Behavioural probe next to the status filter
**What:** for routers whose failure mode is silent (catch-alls), assert an observable response (bare-IP
301/200) in addition to `status==enabled`. **When:** Stage 1 (per catch-all) and Stage 2 gate.

### Anti-Patterns to Avoid
- **Converting the rule and the `ruleSyntax` override in two updates** — a parse-error window per router.
- **Trusting `status==enabled` for the catch-alls** — dead `{host:.+}` routers stay enabled (§Q1).
- **HTTP/2 WS probe** — curl drops the upgrade headers; the probe measures the console, not the WS router.
- **`--replicas 0` throwaway without `lbswarm`** — zero tasks, zero routers, a vacuous "pass".
- **Editing files in place on micro** — leaves the checkout dirty and blocks later fast-forwards.
- **`docker stack deploy` / `restart.sh`** for an edge change — drops secret mounts, resets auth hashes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Router enabled/parse assertion | log-scraping regex | `/api/http/routers` + `jq` status/error filter (+ `ruleSyntax`, `priority` readback) | structured, exact, exposes the parse error text |
| Catch-all liveness | guessing from status | bare-IP `curl` 301/200 behavioural probe | only observable proof for silent dead routers |
| apr1 verification | custom hashing | `openssl passwd -apr1 -salt <salt> -stdin` compared to the live label | identical algorithm to Traefik's basicauth check |
| Mirror freshness | manual diff | `generate-traefik-mirror.js` + `check-traefik-mirror.js --swarm-repo` | banner SHA + body sha256 are what CI enforces |
| Static args rebuild | hand-typed 16-flag string | `jq 'map(@sh)'` from the 600-root full-spec backup, index-exact diff against the mirror | proven in 31-03; avoids quoting mistakes around backticks |
| Device-path proof | ad-hoc curl of `/device/register` | the Phase 31 harness (`thinx-device-flow.mjs`) over `:7442`+`:1883` and HTTPS | covers register → OTT → firmware md5 → MQTT ACL in one run, secrets masked |

**Key insight:** every signal in this phase already exists as a Phase 31 idiom; the two new ones (bare-IP
probe, `--http1.1` 401 WS probe) are one curl each.

## Runtime State Inventory (config migration phase)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Traefik's dynamic config is derived from service labels at every poll; `acme.json` carries certificates/keys only (24 blobs, unchanged by rule syntax; the catch-all routers have no `Host` so no ACME domain is ever derived from them). `[VERIFIED: C.post.yml:133-141; traefik_p32 routers carry no certresolver change]` | none |
| Live service config | The four router rule labels on `thinx_api`, `downtime_downtime`, `errorpage_errorpage` and the 17-flag `Args` of `traefik_traefik` — the live spec is authoritative and is exactly what this phase edits. The external stacks (`fotostim_*`, `igraczech-com_web`, `syxra-cz_web`, `registry_registry`) carry only `Host()` rules (31-01 inventory + today's reading: only 4 v2-only routers live). `[VERIFIED: ssh micro 2026-10-08; runbook:51-89]` | code edit (labels/args via `docker service update`); no data migration |
| OS-registered state | None — Traefik runs only as a swarm service; no cron/systemd/pm2 artifact references rule syntax. `[ASSUMED]` (crontab/systemd not enumerated this session; nothing in the runbooks or memory names one) | none |
| Secrets / env vars | `/root/.p32-traefik-admin` (operator-staged, 600 root, deleted at the end — absent today); `${EMAIL}` stays inside the live Args at index 10 (shifts to index 9 after the flag removal — read it from the live spec, never hard-code); `${DOMAIN}`/`${USERNAME}`/`${HASHED_PASSWORD}` untouched. `[VERIFIED: args listing on micro (email masked)]` | create/verify/shred the credential file; no key or name changes |
| Build artifacts | `docker-compose.traefik.yml` (generated mirror) goes `MIRROR-STALE` after every thinx-swarm commit until regenerated; stale bookkeeping label `com.docker.stack.image=traefik:v2.11@…` on `traefik_traefik` is cosmetic and pre-existing (only a stack deploy rewrites it — do not "fix" it). `[VERIFIED: C.post.yml:89-91]` | regenerate + commit the mirror per stage; leave the stack label |

## Common Pitfalls

### Pitfall 1: Silent dead catch-all after the switch is removed
**What goes wrong:** `HostRegexp(`{host:.+}`)` parsed as v3 compiles (literal `{`) and matches nothing; the
router stays `enabled`. **Why:** Go RE2 literal fallback; no parse error. **How to avoid:** Stage 1
converts all four under `ruleSyntax=v3` before Stage 2; gate on the bare-IP probe (301/200). **Warning
signs:** `https://188.166.23.244/` returns Traefik's `404 page not found` instead of the downtime page.

### Pitfall 2: WS probe measured over HTTP/2
**What goes wrong:** curl silently drops `Upgrade`/`Connection`; the request hits the console nginx and
returns 200 regardless of the WS router's state (this is why Phase 31 saw "200"). **How to avoid:** `--http1.1`
+ full upgrade headers + `Cookie: foo=bar`, expect `401` + `X-Forwarded-Proto: https`. **Warning signs:**
`server: nginx` in the response headers.

### Pitfall 3: Scaled-to-zero throwaway proves nothing
**What goes wrong:** 0 tasks → 0 routers → the filter prints nothing and looks green. **How to avoid:** 1
replica (`alpine:3.20 sleep`), assert **exactly 4** `p32-*` routers are present and enabled, not merely
"no disabled ones". **Warning signs:** `/api/http/routers` has no `p32-` names.

### Pitfall 4: Throwaway discovered by the live edge
**What goes wrong:** a `PathPrefix(`/`)` router at priority 2 on a service labelled `traefik-public` would
be picked up by the live edge and shadow the live downtime router / add an `HeaderRegexp` router the live
v2 parser rejects. **How to avoid:** `traefik.constraint-label=p32-probe` on the throwaway and the matching
constraint on the probe only. **Warning signs:** live `/api/overview` router count ≠ 30 during the probe.

### Pitfall 5: Missing server-port label on the alpine throwaway
**What goes wrong:** alpine exposes no port; without `loadbalancer.server.port` the service has no server
and the routers reference a non-existent service. **How to avoid:** the `…server.port=80` label (any value —
the probe never forwards traffic).

### Pitfall 6: Mirror stale after a thinx.yml-only commit
**What goes wrong:** `check-traefik-mirror.js --swarm-repo` fails with `MIRROR-STALE` because the banner
SHA no longer equals thinx-swarm HEAD, even though `traefik.yml` did not change. **How to avoid:** regenerate
+ commit the mirror after every thinx-swarm commit (Stage 1, 2 and 3).

### Pitfall 7: Rolling `thinx_api` during Stage 1
**What goes wrong:** a `thinx-staging` push triggers Swarmpit autoredeploy of `thinx_api`; the WS router
transiently has 0 servers while the task replaces, confusing the 401 probe. **How to avoid:** do not push
`thinx-staging` between the Stage-1 `thinx_api` update and its verification (operator deferred pushes
anyway — 31-03 readiness).

### Pitfall 8: Comment text that still names the flag
**What goes wrong:** a `grep -c core.defaultRuleSyntax` gate reports 1 from a comment in `traefik.yml` /
the mirror. **How to avoid:** grep the flag line form (`^ *- --core.defaultRuleSyntax`) or rewrite the
comment to record the removal ("removed in Phase 32").

### Pitfall 9: ACME on the catch-all https router
**What goes wrong (does not, but looks alarming):** `downtime-https` keeps `tls.certresolver=le`; with a
`PathPrefix` rule Traefik cannot derive a domain, so no certificate is requested — identical to today's
`HostRegexp` situation (no Host matcher either). **Warning signs:** none expected; an ACME log line naming
the downtime router would be new and worth reading, not acting on.

## Code Examples

### Verified v3 rule strings (byte-exact for the labels)
```
traefik.http.routers.thinx-api-ws.rule=Host(`rtm.thinx.cloud`) && HeaderRegexp(`Upgrade`, `(?i)websocket`)
traefik.http.routers.downtime-http.rule=PathPrefix(`/`)
traefik.http.routers.downtime-https.rule=PathPrefix(`/`)
traefik.http.routers.error-router.rule=PathPrefix(`/`)
traefik.http.routers.<name>.ruleSyntax=v3        # Stage 1 only; removed in Stage 3
```
`[CITED: migrate/v2-to-v3-details (HeaderRegexp rename); rules-and-priority (Host, HeaderRegexp, PathPrefix rows)]`

### Reading the live state without secrets (today's values)
```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "docker service inspect traefik_traefik --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} args={{len .Spec.TaskTemplate.ContainerSpec.Args}} idx={{.Version.Index}}'"
# 2026-10-08: traefik:v3.7.14 args=17 idx=38379311
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v2 matchers `HeadersRegexp`, `HostRegexp(`{name:re}`)`, regexp `PathPrefix` | v3 `HeaderRegexp`, Go-regexp `HostRegexp`, literal `PathPrefix`, `PathRegexp` | Traefik v3.0 (2024) | the four routers here |
| `core.defaultRuleSyntax: v2` / router `ruleSyntax` as a migration bridge | both "deprecated and will be removed in the next major version" | v3.x docs | removing now avoids a forced change at v4 |
| `--providers.docker.swarmmode` | `--providers.swarm` (done in Phase 31) | v3.0 | unchanged here |

**Deprecated/outdated:** `HeadersRegexp`, `Headers`, `HostHeader` (removed in v3), `{name:regex}` host
placeholders, `core.defaultRuleSyntax`/`ruleSyntax` (deprecated). `[CITED: migrate/v2-to-v3-details; rules-and-priority §RuleSyntax]`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact parse-error string for `HeadersRegexp` under v3 is `error while parsing rule …: parsing rule …: unsupported function: HeadersRegexp` (structure verified; concatenation not executed) | Q1 | Low — the probe records the real text; the status filter does not depend on it |
| A2 | A `--replicas 0` service with `traefik.swarm.lbswarm=true` keeps valid VIPs and would be discovered | Q2 | None — the recommendation is the 1-replica form |
| A3 | A throwaway with no exposed port and no `server.port` label yields no server / an errored router | Q2 | None — the label is mandated |
| A4 | No OS-registered state (cron/systemd) references Traefik rule syntax | Runtime State Inventory | Very low — nothing outside swarm services drives the edge |
| A5 | `${EMAIL}` index shift (10 → 9) after removing the flag has no consumer that hard-codes the index | Runtime State Inventory | Low — all Phase 31 tooling reads args by content, not index |

## Open Questions

1. **Should the probe also observe the live services (`|| Label(… traefik-public)`)?**
   - What we know: it would record the exact failure text for the live `HeadersRegexp` router and show the
     catch-alls enabled-but-dead under native v3 — read-only for the live edge.
   - What's unclear: whether the planner wants that extra evidence in `D.post.yml`.
   - Recommendation: yes, in the first probe run; it costs nothing and documents the silent-failure mode.
2. **Stage 2 in the same window as Stage 1, or a separate window?**
   - What we know: Stage 2 is one ~4 s task restart (web only; device ports unaffected); Stage 1 is
     restart-free.
   - Recommendation: one window, one human gate at the end (D-11), as CONTEXT's "Specific Ideas" asks.
3. **Backlog (out of scope):** the API accepts a WebSocket upgrade that carries no `Cookie` header at all
   (`thinx-core.js:500-522`). Not a Phase 32 item; capture as a todo for a later security phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ssh to micro (`188.166.23.244:2020`, DOKey2) | everything live | ✓ (read-only checks ran 2026-10-08) | — | — |
| Docker Engine on micro | service update/inspect | ✓ | 29.8.1 | — |
| `traefik:v3.7.14` image on micro | probe + live | ✓ | digest `e849695b…` | — |
| `alpine:3.20` on micro | throwaway service | ✓ | 7.81 MB | any image already on micro with a long-running command |
| `jq`, `curl`, `openssl`, `shred`, `bash`, `nc` on micro | gates, apr1 check, credential delete | ✓ | — | `rm -f` if `shred` ever missing |
| `node` on the workstation | mirror scripts | ✓ (used in Phase 31) | — | — |
| `go` on the workstation | regexp falsification only (research, not execution) | ✓ | 1.26.0 | not needed by the plan |
| Device-flow harness + `thinx-mcp-device` | EDGE-MIG-04 re-verify | ✓ | `/tmp/p31-device-flow/thinx-device-flow.mjs` (2026-10-07) | recreate from the `mcp__thinx-device__*` tools if `/tmp` is cleaned |
| `/root/.p32-traefik-admin` on micro | D-12 router filter | ✗ (absent today — operator pre-stages it) | — | none — plan `<precondition>` |
| thinx-swarm micro checkout fast-forwardable | D-04 | ✓ (`677e3a9`, only untracked `.bak` files) | — | stash tracked changes if any appear |

**Missing dependencies with no fallback:** `/root/.p32-traefik-admin` (operator action before execution).
**Missing dependencies with fallback:** none.

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json`; this section is included because the
> orchestrator requested the verify-command inventory. There is no unit-test framework for this phase — the
> "tests" are the live/probe commands below, each with its expected output (see §Q3 for the full forms).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (operational verification via ssh/curl/jq against the live edge and the probe) |
| Config file | none |
| Quick run command | router status filter + bare-IP probe + `--http1.1` WS probe (3 commands, < 10 s) |
| Full suite command | the §Q3 table top to bottom (HTTPS/HTTP matrices, ports, harness x2, cert serials, args readback) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDGE-MIG-03 | four candidate rules parse under native v3 | probe (smoke) | §Q2 gate: `jq … select(.name\|startswith("p32-"))` → 4 lines `enabled` | n/a (live) |
| EDGE-MIG-03 | every live router enabled after each stage | integration | §Q3 "Router status filter" → prints nothing | n/a |
| EDGE-MIG-03 | catch-alls alive after conversion / switch removal | integration | bare-IP `curl` → `301 https://188.166.23.244/` and `200` | n/a |
| EDGE-MIG-03 | WS router matches natively (`(?i)` kept) | integration | `--http1.1` upgrade probe → `401` + `X-Forwarded-Proto: https`; mixed-case variant → `401` | n/a |
| EDGE-MIG-03 | switch removed live and in repo | integration | `args=16`, `grep -c core.defaultRuleSyntax` → 0; `MIRROR OK files=1`; micro HEAD == workstation HEAD | n/a |
| EDGE-MIG-03 | no per-router overrides at end state | integration | label readback: no `ruleSyntax` lines; API `ruleSyntax` = `v3` (inherited) | n/a |
| EDGE-MIG-04 | `:7442`/`:1883`/`:8883` open, direct-published; full device flow | integration | ports loop → OPEN x3; harness x2 → PASS | harness ✓ |
| EDGE-MIG-02 regression guard | HTTPS/HTTP matrix identical to baseline; cert serials unchanged | integration | matrices + `openssl x509 -serial -checkend 0` | n/a |
| D-11 | console renders, live updates over WS | manual (blocking-human) | `/console-retest` in the browser | — |

### Sampling Rate
- **Per task (each Stage-1 service, Stage 2, Stage 3):** quick run (status filter + the probe that targets
  the router just changed).
- **Per stage end:** full suite.
- **Phase gate:** full suite green, `D.post.yml` committed with 0 secret markers, then the single human gate.

### Wave 0 Gaps
- [ ] Operator pre-stages `/root/.p32-traefik-admin` (600 root) on micro — precondition, not a test file.
- [ ] Baseline capture (matrices incl. externals, bare-IP pair, WS 401 probe, cert serials, task ids,
      `D.pre.yml`) recorded BEFORE the probe — every later check compares against it.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no auth code changes) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | dashboard API stays behind `admin-auth` (basic auth) on `Host(`micro.thinx.cloud`)`; never `--api.insecure` live; probe API reachable only inside the probe task (no host port) |
| V5 Input Validation | yes (config) | rules are operator-controlled labels validated by Traefik's parser; probe gate asserts parse before live |
| V6 Cryptography | yes (verification only) | apr1 check via `openssl passwd -apr1 -stdin`; TLS cert continuity asserted by serial |
| V14 Configuration | yes | repo-first, mirror gate, redacted captures, no secrets in commits (P29 D-12) |

### Known Threat Patterns for this change
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Dashboard password leaking via argv/`ps`, shell tracing or logs | Information disclosure | `-stdin` to openssl, shell variable only, no `set -x`, `shred -u` at the end, never printed/committed |
| Throwaway catch-all hijacking live traffic | Tampering / DoS | distinct `traefik.constraint-label=p32-probe`; live `/api/overview` count stays 30 during the probe |
| Catch-alls dying silently → downtime/error pages unreachable for unknown hosts (and hostless) | DoS (availability of the error surface) | bare-IP behavioural probe in every gate |
| WS router mis-parse → console live updates lost | DoS | `--http1.1` 401 probe per stage; per-router single-step rollback |
| Hostless/bare-IP requests now answered by downtime/error pages (D-06) | Information disclosure (none — static pages) | accepted by D-06; record the hostless response in `D.post.yml` |
| Probe writing production ACME state | Tampering | throwaway storage + LE staging CA + no cert volume mount (Phase 31 recipe); `acme.json` stat unchanged check |

## Project Constraints (from AGENTS.md)

- **Keep 7442 and plain MQTT.** The plaintext HTTP device port `:7442` and plain MQTT `:1883` are required
  for legacy `__DISABLE_HTTPS__` THiNXLib devices (operator decision 2026-10-04). Nothing in this phase may
  close, redirect or TLS-enforce them; both are direct-published by `thinx_api`/`thinx_mosquitto` outside
  Traefik and are re-verified at the gate (EDGE-MIG-04).
- **micro ssh form:** call `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "…"` literally (pre-approved allow
  rules match the leading words); swarm path `/mnt/gluster/deployment/swarm`; placement floats — query it.
- **Deploy flow for the application:** push to `thinx-staging` → CircleCI → Swarmpit rollout. Edge label/arg
  changes are NOT delivered by that flow — only by `docker service update` (and never by `docker stack
  deploy` / `restart.sh`).
- **CI validation:** when source changes should be validated in CI, push the commit to the current branch
  (`thinx-staging`) — but see Pitfall 7: not while Stage 1 is mid-flight on `thinx_api`; the operator
  deferred the Phase 31 push and decides the timing.
- **Builder/image version locks** (chai-http, Ubuntu 22.04 ceiling, mos from source, Temurin JRE, newlib
  pre-seed, HTTPS checkout) are unaffected by this phase — do not touch builder files.
- **Secrets:** no hashes, e-mails or keys in any committed file; captures redacted on micro before output is
  read (P29 D-12 / swarm-configs README).

## Sources

### Primary (HIGH confidence — official source at the live tag, read this session)
- `github.com/traefik/traefik` tag `v3.7.14` (`3bd7aa32`): `pkg/muxer/http/matcher.go`, `matcher_v2.go`,
  `mux.go`, `parser.go`; `pkg/server/router/router.go`; `pkg/server/aggregator.go`; `pkg/config/static/static_config.go`;
  `pkg/config/dynamic/http_config.go`; `pkg/config/runtime/runtime_http.go`; `pkg/api/handler_http.go`;
  `pkg/provider/docker/pswarm.go`, `config.go`; `go.mod` (gorilla/mux → containous/mux `41b6ec3`).
- `github.com/gorilla/mux` v1.8.1 `route.go`, `mux.go`; `github.com/containous/mux` `41b6ec3` `mux.go`;
  `github.com/vulcand/predicate` v1.3.0 `parse.go`.
- Live edge (read-only ssh, 2026-10-08): `traefik_traefik` args/labels, the three services' router labels,
  task placement, images, tools, micro checkout state; live HTTP probes (WS variants, bare-IP, hostless).
- Go 1.26 falsification run `/tmp/p32-regexp-test/main.go`.
- Repo artifacts: `.planning/runbooks/traefik-v3-cutover.md`, `swarm-configs/README.md`, `traefik-edge.C.post.yml`,
  `31-03-SUMMARY.md`, `31-REVIEW.md` (IN-06), `31-RESEARCH.md`, `docker-swarm.yml`, `docker-compose.traefik.yml`,
  `scripts/{generate,check}-traefik-mirror.js`, `.circleci/config.yml:679`, `thinx-core.js:476-535`,
  `~/Repositories/thinx-swarm/{traefik,thinx,downtime,errorpage}.yml`, `/tmp/p31-device-flow/thinx-device-flow.mjs`.

### Secondary (MEDIUM confidence — official documentation, `[CITED]`)
- https://doc.traefik.io/traefik/migrate/v2-to-v3-details/ — Router Rule Matchers, Remediation (`core.defaultRuleSyntax`, per-router `ruleSyntax`).
- https://doc.traefik.io/traefik/reference/routing-configuration/http/routing/rules-and-priority/ — matcher table, Priority Calculation, RuleSyntax (deprecated).
- https://doc.traefik.io/traefik/reference/install-configuration/providers/swarm/ — `allowEmptyServices`, `constraints`, `exposedByDefault`, `refreshSeconds`.
- https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/swarm/ — `ruleSyntax` label, `lbswarm`, `swarm.network`, port selection, deploy labels.
- https://doc.traefik.io/traefik/deprecation/features/ — no rule-syntax entry (checked).

### Tertiary (LOW confidence)
- none — no WebSearch-only claims were used.

## Metadata

**Confidence breakdown:**
- Matcher semantics / priority / `ruleSyntax` / switch side effects: HIGH — source at the exact live tag + docs + Go/live falsification.
- Probe design: HIGH on the zero-replica finding (source) and isolation (source + docs); MEDIUM on the exact
  throwaway command text (assembled from the verified Phase 31 recipe; first execution is the test).
- Verify signals: HIGH — every expected value was read live today or from the Phase 31 record; the WS 401
  and bare-IP values were measured this session.
- Repo-first mechanics: HIGH — files/lines read, micro checkout state read, memory procedure confirmed.

**Research date:** 2026-10-08
**Valid until:** 2026-11-07 for the Traefik findings (pinned tag; stable); the live inventory is a snapshot —
re-read the four router labels and `args=17 idx=38379311` at the start of execution.
