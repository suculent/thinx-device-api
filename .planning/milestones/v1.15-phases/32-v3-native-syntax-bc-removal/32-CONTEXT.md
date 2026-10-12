# Phase 32: v3 Native Syntax & BC Removal - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the routing rules that still use Traefik v2-only matcher syntax to native v3 syntax, remove the
backward-compatibility switch `--core.defaultRuleSyntax=v2` from the live edge and from the committed
source, keep the committed config identical to the deployed config, and re-verify full route parity plus
the plaintext `:7442` + plain MQTT device paths (EDGE-MIG-03; EDGE-MIG-04 re-verified).

**Live inventory (read 2026-10-08, 32 HTTP routers across 16 traefik-enabled services):** only **four**
rules are v2-only —

| Router | Service | Current rule (v2) |
|---|---|---|
| `thinx-api-ws` (priority 200) | `thinx_api` | ``Host(`rtm.thinx.cloud`) && HeadersRegexp(`Upgrade`, `(?i)websocket`)`` |
| `downtime-http` / `downtime-https` (priority 2) | `downtime_downtime` | ``HostRegexp(`{host:.+}`)`` |
| `error-router` (priority 1) | `errorpage_errorpage` | ``HostRegexp(`{host:.+}`)`` |

Every other router (thinx stack, landing, swarmpit, registry, traefik dashboard, and the external
`fotostim_*`, `igraczech-com_web`, `syxra-cz_web` stacks that have no committed stack file) uses plain
``Host(`…`)`` or ``Host(`a`) || Host(`b`)``, which is valid v3. No router carries a `ruleSyntax` override today.
Removing the switch therefore cannot break the external stacks.

**Not in this phase:** dashboard/API lockdown, TLS hardening, ACME e-mail, `exposedbydefault` audit, log
level, socket-proxy (Phases 33/34); dead Traefik v1 labels and the missing vue `security-headers@swarm`
(31-REVIEW IN-05 → Phase 33/34 label inventory).

</domain>

<decisions>
## Implementation Decisions

### Rollout sequencing
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

### Catch-all rule form
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

### BC switch end state
- **D-09:** Remove `--core.defaultRuleSyntax=v2` **outright** from the live `traefik_traefik` args and from
  `thinx-swarm/traefik.yml` (mirror regenerated; the static command drops from 17 to 16 flags). EDGE-MIG-03
  closes as "converted and removed", not "retained". — **Reversibility:** reversible — one `--args` update
  re-adds the switch.
- **D-10:** Stage 2 **auto-revert triggers** (executor acts without waiting for a human, then reports): the
  post-change `/api/http/routers` filter `select(.status!="enabled")` prints anything; any web host in the
  HTTPS matrix returns a code different from the pre-change baseline; or the `https://rtm.thinx.cloud/`
  WebSocket upgrade probe is not 200. Revert = `--args` update re-adding `--core.defaultRuleSyntax=v2`.

### Verification gate
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Migration contract and prior-phase decisions
- `.planning/research/TRAEFIK-MIGRATION.md` — three-phase rollout; phase 3 = convert routing to v3 syntax (this phase); `:7442`/MQTT must survive every hop.
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-CONTEXT.md` — D-02 staged rollback, D-03 image pin, D-04 BC switch + `exposedbydefault` stays true, D-05 device paths; all rule conversion deferred here.
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-RESEARCH.md` §`core.defaultRuleSyntax` placement & scope, §Package Legitimacy Audit (v3.7.14 pin).
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-03-SUMMARY.md` — live cutover record, the dual-label outage lesson, device-flow harness invocation.

### Operational runbook (the command conventions to reuse verbatim)
- `.planning/runbooks/traefik-v3-cutover.md` — §Boot-and-discover (probe recipe: no host ports, ACME neutralized, `/api/http/routers` filter), §Cutover mechanism (ordered surgical `docker service update`, Post-B2 gate row, CORRECTION: no two-label bridge), §Rollback (digest image, Steps 0–5, re-hop precondition), §Live cutover record.
- `.planning/runbooks/swarm-configs/README.md` — capture persistence rules (`${DOMAIN}`/`${EMAIL}`/`${USERNAME}`/`${HASHED_PASSWORD}` stay templated; no secrets).
- `.planning/runbooks/swarm-configs/traefik-edge.C.post.yml` — redacted live v3 edge capture (17-flag static command) — the "before" state of this phase.

### Code review carry-overs
- `.planning/phases/31-v2-v3-upgrade-backward-compat-mode/31-REVIEW.md` — IN-06 (`HeadersRegexp` → `HeaderRegexp`, per-router `ruleSyntax=v3` first), IN-05 (dead v1 labels — deferred, not this phase).

### Source of truth and deploy mechanics
- `docker-swarm.yml` (this repo) — authoritative thinx-stack labels (`thinx-api-ws` rule at the `api` service); must stay identical to thinx-swarm `thinx.yml` except the 3 SEC-CFG-04 api secret attachments.
- `~/Repositories/thinx-swarm/{traefik.yml,thinx.yml,downtime.yml,errorpage.yml}` (sibling repo, master `677e3a9`) — the deployed stack files; `/mnt/gluster/deployment/swarm` on micro is a checkout of this repo and is updated by `git push ssh://micro/… master:refs/heads/<tmp>` + `git merge --ff-only` there (micro cannot reach GitHub). thinx-swarm triggers NO CI.
- `scripts/generate-traefik-mirror.js`, `scripts/check-traefik-mirror.js` — mirror `docker-compose.traefik.yml` from thinx-swarm `traefik.yml`; CI gate `Traefik mirror staleness (EDGE-RECON-01)` in `.circleci/config.yml`.
- `AGENTS.md` — micro ssh form (`ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`), keep-7442 rule, no stack deploy via `restart.sh` for edge changes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 31 boot-and-discover probe recipe (runbook §Boot-and-discover): throwaway `traefik:v3.7.14` service with no host ports, ACME storage at a throwaway path, LE staging CA, `docker.sock:ro`, router discovery through `/api/http/routers` — rerun it WITHOUT `--core.defaultRuleSyntax=v2` for D-02.
- Device-flow harness used in 31-03 (`/tmp/p31-device-flow/thinx-device-flow.mjs`, run from `~/Repositories/thinx-mcp-device`; recreate from the `mcp__thinx-device__*` tools if `/tmp` was cleaned): register → status → OTT → firmware download (md5 match) → plain MQTT connect/publish → disconnect, over `:7442`+`:1883` and over HTTPS.
- Mirror generator/checker scripts; the runbook's `# expect:` command convention; the `{{range $k,$v := .Spec.Labels}}` label-inspect idiom; the label-rename inventory table (16 services).
- Rollback machinery staged in Phase 31 (digest image `d57faa4f…`, 600-root snapshot, Steps 0–5) — for this phase the rules rollback is simply re-adding the switch / v2 rules.

### Established Patterns
- Ordered surgical `docker service update` per service; label-only changes do not restart tasks; NEVER `docker stack deploy`/`restart.sh` for edge changes (drops live-only secret mounts, resets edge auth hashes).
- No two-label bridges under v3 (swarm provider skips services carrying both `traefik.docker.*` and `traefik.swarm.*`); every label migration is single-step. The `ruleSyntax=v3` + v3-rule pair must land in ONE update per router.
- Repo-first ordering (D-04) with the thinx-swarm push + micro ff procedure; mirror regenerated after every thinx-swarm commit; `.C.*.yml` captures redacted on micro before output is read.
- Secret hygiene P29 D-12: no hashes/emails/keys in committed files; dashboard credential only in a root-only file on micro, verified against the live hash, deleted after use.

### Integration Points
- `thinx_api` service labels (`thinx-api-ws` router) — the one rule whose failure breaks live console updates; `priority=200` keeps WS upgrades off the console router.
- `downtime_downtime` and `errorpage_errorpage` services — catch-all routers; downtime overrides errorpage only when scaled up.
- `traefik_traefik` static args — Stage 2 removes one flag (17 → 16); `Version.Index` and task restart recorded as in Phase 31.
- CI: every push to `thinx-staging` rebuilds and rolls `thinx_api` via Swarmpit (~6 min) — the `docker-swarm.yml` label edits land in the image build context but do NOT change live labels; live labels change only via the service updates.

</code_context>

<specifics>
## Specific Ideas

- "Same gate as Phase 31" — the operator wants the identical evidence bundle and one browser sign-off on the console, not a per-stage pause.
- Pre-stage the dashboard credential (`/root/.p32-traefik-admin`) so the run has no mid-flight blocking-human stop for it; the executor deletes it afterwards.
- End state must be clean: no BC switch, no per-router overrides, committed files identical to the deployed checkout.

</specifics>

<deferred>
## Deferred Ideas

- Dead Traefik v1 labels (`traefik.frontend.headers.STSPreload`/`STSSeconds` on console/vue, `traefik.backend.*.noexpose` on transformer/worker) and the missing `security-headers@swarm` on `thinx-vue-console-https` — 31-REVIEW IN-05 → Phase 33/34 label inventory.
- `registry.thinx.cloud` through Traefik returns 400 (backend terminates its own TLS; no `loadbalancer.server.scheme=https`) — pre-existing, Phase 33/34 inventory.
- SEC-CFG-04: attach `COUCHDB_USER`/`COUCHDB_PASS`/`REDIS_PASSWORD` secrets to `thinx_api` after confirming the swarm secret values equal `.env`; prune `.env` fallbacks.

### Reviewed Todos (not folded)
- "Split Rollbar server and client tokens" — config keyword match only; unrelated to routing syntax.
- "Transferred devices — what quick 261003-u86 left over", "Console notifications: remaining delivery gaps", "MQTT device writes are gated off", "Fix worker builder service polling" — keyword matches (mqtt/routing/remove) only; none touch the Traefik edge.

</deferred>

---

*Phase: 32-v3-native-syntax-bc-removal*
*Context gathered: 2026-10-08*
