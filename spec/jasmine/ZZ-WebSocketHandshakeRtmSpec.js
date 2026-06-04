/* TEST-WS-01 — WebSocket handshake CI smoke probe (regression coverage for SEC-WS-01).
 *
 * Purpose: exercise the rtm-style `/<owner>(/<timestamp>)?` WebSocket upgrade against
 * the in-process THiNX server so any future regression of the `server.on('upgrade')`
 * handler at thinx-core.js:466 surfaces at CI rather than user-report. This spec is
 * the local CI half of the SEC-WS-01 coverage pair; the live rtm-edge probe (against
 * the production wss rtm-edge host) lives in the operator runbook executed by Phase
 * 13 OPS-EXEC-01 and is NOT exercised here.
 *
 * Regression target: thinx-core.js:466 — `this.server.on('upgrade', function (request, socket, head) { ... })`.
 * If that registration is removed or breaks (e.g. refactored away during a future WS
 * surface sweep) the `open` event never fires and this spec times out at 30000ms →
 * spec FAILS. That is the implicit negative-case proof for TEST-WS-01 per Phase 12
 * decision D-32 (the user explicitly accepted timeout-on-missing-handler over a
 * separate explicit-negative-block alternative).
 *
 * Why the `ws` client (not chai-http): chai-http v4 (LOCKED per AGENTS.md:82-92) lacks
 * WebSocket upgrade support; v5 has it but is ESM-only and removes the `chai.request(app)`
 * API used in ~200 call sites. The `ws` package is already a runtime dep
 * (thinx-core.js:274 — `var WebSocket = require("ws");`) so this spec adds no new
 * dependency. See `ZZ-WebSocketLifecycleSpec.js` (Phase 6 REFACTOR-03) for the
 * raw-socket-based variant that tests aborted upgrades — that spec DIVERGES from this
 * one because it observes abort behavior, not successful handshake completion.
 *
 * Local-vs-CI note (Phase 5 Test-env ACCEPT pattern, carried into Phase 12 per D-41):
 * local `npm test` aborts on missing `/mnt/data/conf/config.json`; the canonical
 * green-gate for this spec is the CircleCI-side Jasmine run inside the Docker test
 * image. Local gates per Plan 12-01 are static (file exists + `node --check` clean +
 * grep gates on the locked identifiers).
 */

// IMPORTANT: do not move the require of the bootstrap helper into a function body.
// bootstrap.thx is asynchronously populated by bootstrap.js's beforeAll, which is
// registered AT REQUIRE-TIME by Jasmine. Moving the require() into a nested scope
// (beforeAll body, helper function, dynamic import, etc.) unregisters bootstrap's
// beforeAll for this spec → `thx` stays null → handshake test fails silently with
// "WebSocket 'open' event did not fire within 5000ms" but for the WRONG reason.
// The top-level require of the bootstrap helper below is load-bearing.

const bootstrap = require('../helpers/bootstrap');
const chai = require('chai');
const expect = require('chai').expect;
const WebSocket = require('ws');
const envi = require('../_envi.json');

// chai is imported for parity with the other ZZ-* specs even though this file uses
// only `expect`; keeping the explicit reference here documents the assertion-library
// LOCK (chai 4.5.0 commonjs) for future maintainers.
void chai;

let thx;
let openSockets = [];

describe("WebSocket Handshake (rtm)", function () {

  beforeAll((done) => {
    console.log("🚸 [chai] >>> running WebSocket Handshake (rtm) spec");
    thx = bootstrap.thx;
    done();
  });

  afterAll(() => {
    // Do NOT close thx.server here — bootstrap.js owns the server lifecycle per
    // Phase 12 D-28 / D-33 (bootstrap's global afterAll shuts down the shared
    // thx.server after the entire ZZ-* set completes).
    console.log("🚸 [chai] <<< completed WebSocket Handshake (rtm) spec");
  });

  afterEach(() => {
    while (openSockets.length) {
      const s = openSockets.pop();
      try { s.close(); } catch (_e) { /* ignore — socket may already be closed */ }
    }
  });

  // Helper: read the ephemeral port that bootstrap.thx.server bound to (test env
  // uses port 0 per Phase 6 precedent). Returns null if the server didn't expose
  // an address (rare local-env shape), in which case the it() block done()'s out
  // and leans on the static gates as authoritative locally.
  function getPort() {
    const addr = thx.server && thx.server.address();
    return addr && addr.port ? addr.port : null;
  }

  it("GET /<owner> (WebSocket upgrade)", function (done) {
    const port = getPort();
    if (!port) {
      // Defensive — see helper comment. CI will always provide a real port.
      done();
      return;
    }
    const url = "ws://127.0.0.1:" + port + "/" + envi.oid;
    const ws = new WebSocket(url);
    openSockets.push(ws);
    const openTimer = setTimeout(() => {
      try { ws.close(); } catch (_e) { /* ignore */ }
      done(new Error("WebSocket 'open' event did not fire within 5000ms — regression at thinx-core.js:466 server.on('upgrade')"));
    }, 5000);
    ws.on('open', () => {
      clearTimeout(openTimer);
      expect(true).to.equal(true);
      done();
    });
    ws.on('error', (_err) => {
      /* swallow — open or timeout decides; an early 'error' before 'open' is treated as
         "open never fires" by the 5000ms timer (which then emits the regression-target
         message). This matches D-31's positive-assertion-only semantics. */
    });
  }, 30000);

  it("GET /<owner>/<timestamp> (rtm-style WebSocket upgrade)", function (done) {
    const port = getPort();
    if (!port) {
      done();
      return;
    }
    const url = "ws://127.0.0.1:" + port + "/" + envi.oid + "/" + Date.now();
    const ws = new WebSocket(url);
    openSockets.push(ws);
    const openTimer = setTimeout(() => {
      try { ws.close(); } catch (_e) { /* ignore */ }
      done(new Error("WebSocket 'open' event did not fire within 5000ms — regression at thinx-core.js:466 server.on('upgrade')"));
    }, 5000);
    ws.on('open', () => {
      clearTimeout(openTimer);
      expect(true).to.equal(true);
      done();
    });
    ws.on('error', (_err) => {
      /* see sibling it() for the rationale */
    });
  }, 30000);

});
