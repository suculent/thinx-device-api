# THiNX Device API Session Notes

## Repositories
- Parent repo: `/Users/igraczech/Repositories/thinx-device-api`
- Console frontend: `/Users/igraczech/Repositories/thinx-device-api/services/console`
- Console source root: `/Users/igraczech/Repositories/thinx-device-api/services/console/src`

## Deployment
- Production console URL: `https://rtm.thinx.cloud/`
- Swarmpit URL used for task monitoring: `https://swarmpit.thinx.cloud/#/tasks`
- When Codex makes source changes that should be validated in CI, push the commit to the current branch to trigger CircleCI instead of waiting for the user to do it manually.
- Deployment flow:
  - Push `services/console` to `thinx-staging`
  - Update parent repo submodule pointer and push parent `thinx-device-api` repo to `thinx-staging`
  - CircleCI builds and pushes images
  - Swarmpit rolls out the new service task
- User-provided server access:
  - `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020`
  - Swarm path: `/mnt/gluster/deployment/swarm`

## Swarm Auto-Pull Recovery

- **Symptom:** `https://swarmpit.thinx.cloud` returns Bad Gateway (502) AND `docker service logs swarmpit_app --since 30m` is empty. CircleCI builds and pushes `thinxcloud/api:latest` successfully, but the swarm does not pick up the new image (Swarmpit watcher silently degraded — container Running, app deadlocked).
- **Recovery (rung 1 — restart swarmpit watcher):**
  ```
  ssh -i ~/.ssh/DOKey2 -p 2020 root@188.166.23.244 "docker service update --force swarmpit_app"
  ```
  Wait ~90s for the new task to boot; verify `curl -s -o /dev/null -w '%{http_code}\n' https://swarmpit.thinx.cloud` returns 200 and `docker service logs swarmpit_app --since 2m` is non-empty (expect startup banner + `Swarmpit running on port 8080`).
- **Verification:** push a no-op commit to `thinx-staging`; observe `docker service ps thinx_api` for a new task with the new image SHA within 5 minutes (typical observed delta: 60-120s post-digest-change).
- **If recovery doesn't restore autoredeploy:** see `.planning/phases/03-swarm-auto-pull/03-PLAN.md` Rungs 2-4 (swarmpit_db rebuild → stale-node membership cleanup → Swarmpit 1.9→latest upgrade). Each requires operator approval.
- **Reference:** `.planning/phases/03-swarm-auto-pull/03-SUMMARY.md` (root cause + reversion plan + verification matrix). Phase 3 closed 2026-05-26 via Rung 1.

## Confirmed Fixes
- Login regression was caused by bad validator asset paths in the public pages. Fixed in:
  - `services/console/src/index.html`
  - `services/console/src/auth.html`
  - `services/console/src/password.html`
- CSP websocket blocking was fixed by allowing `connect-src` websocket origins in nginx config.
- Backend CORS bug was fixed in `lib/router.js` by reflecting request origins instead of returning `*` with credentials.
- Committed conflict markers were resolved in:
  - `services/console/src/default.conf`
  - `services/console/vue/default.conf`

## Websocket Findings
- Original live issue:
  - frontend used `wss://app.thinx.cloud/<owner>` and got `404`
- Root cause:
  - console build derived websocket URL from stale host configuration
- Console-side websocket fix:
  - `services/console/src/gulpfile.js` now derives websocket origin from `API_BASEURL`/API origin
- Local rebuilt output now uses:
  - `wss://rtm.thinx.cloud/<owner>`
  - `wss://rtm.thinx.cloud/<owner>/<timestamp>`
- Important:
  - if live still returns `404` after serving the corrected bundle, the remaining bug is server-side websocket routing or upgrade handling on `rtm.thinx.cloud`, not CSP and not the console host selection

## Frontend Issues Fixed In Source
- Sensitive browser logging removed from:
  - `services/console/src/app/js/main.js`
  - `services/console/src/app/js/controllers/LogviewController.js`
- `propsFilter` hardened in:
  - `services/console/src/app/js/main.js`
  - now skips undefined/null fields instead of calling `.toString()` on them
- Devices page Angular parse/runtime issue fixed in:
  - `services/console/src/app/views/devices.html`
  - removed `ng-dblclick="return false"` from build links and replaced with `preventDefault()` in the click handler

## Local Verification
- Build command:
  - `npm run build:test`
- Current test env used by build:
  - `LANDING_HOSTNAME=https://thinx.cloud`
  - `API_BASEURL=https://rtm.thinx.cloud`
  - `API_HOSTNAME=https://rtm.thinx.cloud/api`
  - `WEB_HOSTNAME=https://rtm.thinx.cloud`
- Generated local build artifacts to inspect:
  - `services/console/src/html/app/js/controllers/LogviewController.js`
  - `services/console/src/html/app/js/main.js`
  - `services/console/src/html/app/views/devices.html`

## Live Retest Checklist
- Hard reload the authenticated app in Chrome DevTools
- Check `/app/js/controllers/LogviewController.js` served by `rtm.thinx.cloud`
- Verify websocket target is `wss://rtm.thinx.cloud/...`
- Verify whether websocket handshake still returns `404`
- Check console for:
  - cookie logging
  - owner/profile/debug logging
  - old websocket debug logs
- Visit Devices page and confirm no Angular parse error
- Reassess findings list to include remaining issues only

## Dependency Version Locks

### chai-http — hold at ^4.3.0, do NOT bump to v5

`chai-http` v5.x is **ESM-only** and removes the `chai.request(app)` API.
Upgrading would require:
- Converting all 16 ZZ-\* spec files from CommonJS (`require`) to ESM (`import`)
- Renaming ~200 `chai.request(thx.app)` call sites to `request.execute(thx.app)`
- Renaming 14 `chai.request.agent(app)` calls to `request.agent(app)`
- Potentially converting `thinx-core.js` and all lib modules to ESM

**Trigger to reconsider:** only if Snyk/Dependabot flags a CVE in `superagent` v3 (the underlying transitive dep).

---

## Current Known Remaining Risks Before Retest
- Websocket handshake may still return `404` even with corrected frontend bundle
- Authenticated dashboard still fetches broad operational/account data immediately on load
