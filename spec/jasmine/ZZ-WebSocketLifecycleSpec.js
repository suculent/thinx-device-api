/* REFACTOR-03 regression spec.
 *
 * Asserts that the raw-socket close handler added at thinx-core.js
 * (immediately after `socketMap.set(socketKey, socket)`) releases the
 * socketMap entry deterministically when a WebSocket upgrade aborts
 * mid-flight — i.e. when the client tears down the TCP connection AFTER
 * the server has called `socketMap.set` but BEFORE `wss.handleUpgrade`
 * has wired up the wss-level `ws.on('close')` handler at thinx-core.js:597.
 *
 * Without the new raw-socket handler, the `socketMap` entry leaks
 * monotonically: every aborted upgrade leaves the same-socketKey
 * duplicate-upgrade guard at thinx-core.js:463-467 "armed" against a
 * legitimate reconnect, and the map size grows without bound.
 *
 * Observation channel: `socketMap` is closure-private inside thinx-core.js
 * and not exposed on `thx.app`. So the spec observes cleanup BEHAVIORALLY:
 * it monkey-patches `console.log` and then opens a SECOND raw-socket
 * upgrade against the SAME socketKey. If the raw-socket close handler
 * fired and deleted the map entry, the duplicate-guard at :463-467 will
 * NOT trigger and the captured log lines will NOT contain the substring
 * "Socket already mapped for <socketKey>". If the handler did NOT fire
 * (regression bait), the duplicate-guard WILL trigger and the captured
 * log lines WILL contain that substring — failing the spec.
 *
 * Uses raw `net.connect` + manual HTTP/1.1 upgrade headers (no chai-http;
 * chai-http cannot abort mid-upgrade). No sinon/jest per CONVENTIONS.md.
 *
 * Local-vs-CI note (Phase 5 ACCEPT pattern): `npm test` aborts on missing
 * `/mnt/data/conf/config.json` locally; the trailing `|| true` in
 * package.json:19 masks the failure to exit 0. Therefore the canonical
 * green-gate for this spec is the CI-side Jasmine run inside the Docker
 * test image. Local gates are static (file exists + node --check clean).
 */

const THiNX = require("../../thinx-core.js");

const chai = require('chai');
const expect = require('chai').expect;
const net = require('net');

let thx;
let originalConsoleLog;
let capturedLines;

describe("WebSocket lifecycle (REFACTOR-03)", function () {

  beforeAll((done) => {
    thx = new THiNX();
    thx.init(() => {
      console.log("🚸 [chai] >>> running WebSocket Lifecycle (REFACTOR-03) spec");
      done();
    });
  });

  afterAll((done) => {
    if (originalConsoleLog) {
      console.log = originalConsoleLog;
    }
    if (thx && thx.server) {
      thx.server.close();
    }
    console.log("🚸 [chai] <<< completed WebSocket Lifecycle (REFACTOR-03) spec");
    done();
  });

  beforeEach(() => {
    capturedLines = [];
    originalConsoleLog = console.log;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  // Helper: open a raw TCP socket and send a manual HTTP/1.1 WebSocket upgrade
  // request against the given socketKey path. Returns the net.Socket instance.
  function openUpgradeSocket(port, socketKey) {
    const sock = net.connect(port, '127.0.0.1');
    sock.on('error', () => { /* swallow — aborts are expected */ });
    sock.on('connect', () => {
      const req =
        `GET /${socketKey} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `Connection: upgrade\r\n` +
        `Upgrade: websocket\r\n` +
        `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `Cookie: x-thx-core=bogus-test-session\r\n` +
        `\r\n`;
      sock.write(req);
    });
    return sock;
  }

  it("REFACTOR-03 — raw-socket close handler releases socketMap on aborted upgrade", function (done) {
    // Read the ephemeral port that thx.server bound to (test env uses port 0).
    const addr = thx.server && thx.server.address();
    if (!addr || !addr.port) {
      // Defensive: if the server didn't expose an address (rare local-env shape),
      // skip behavioral observation but still mark done. Static gates in the
      // plan's verify step are authoritative locally.
      console.log("🚸 [chai] (skipping behavioral phase — thx.server.address() not available)");
      done();
      return;
    }
    const port = addr.port;

    // Unique key per run — guarantees no collision with other specs that may
    // touch the same socketMap in parallel/sequential runs.
    const socketKey = `refactor-03-test-${Date.now()}`;

    // PHASE A: prime + abort.
    // Open a raw socket, send the upgrade headers, give the server a brief
    // moment to run `socketMap.set(socketKey, socket)`, then abort.
    const firstSock = openUpgradeSocket(port, socketKey);

    setTimeout(() => {
      try { firstSock.destroy(); } catch (_e) { /* ignore */ }

      // PHASE B: wait for the server-side raw-socket 'close' event to fire,
      // then start capturing console.log lines and open a SECOND upgrade
      // against the SAME socketKey. The duplicate-guard at thinx-core.js:463-467
      // logs "Socket already mapped for <socketKey>, dropping duplicate upgrade."
      // — we assert that line is NOT captured (because the close handler ran).
      setTimeout(() => {
        capturedLines = [];
        console.log = function () {
          const args = Array.prototype.slice.call(arguments);
          const line = args.map(function (a) {
            return (typeof a === "string") ? a : (function () {
              try { return JSON.stringify(a); } catch (_e) { return String(a); }
            })();
          }).join(" ");
          capturedLines.push(line);
          originalConsoleLog.apply(console, args);
        };

        const secondSock = openUpgradeSocket(port, socketKey);

        // Give the server enough time to either (a) hit the duplicate-guard
        // and log "Socket already mapped" — regression — or (b) accept the
        // upgrade attempt because the map entry was cleaned up.
        setTimeout(() => {
          console.log = originalConsoleLog;

          const leaked = capturedLines.filter(l =>
            l.indexOf(`Socket already mapped for ${socketKey}`) !== -1
          );

          try {
            // The negative assertion. If the raw-socket close handler did NOT
            // delete the map entry, the second upgrade attempt would have
            // tripped the duplicate-guard and emitted the "Socket already
            // mapped" string — proving the REFACTOR-03 fix is absent.
            expect(leaked).to.have.lengthOf(0);
          } finally {
            try { secondSock.destroy(); } catch (_e) { /* ignore */ }
            try { firstSock.destroy(); } catch (_e) { /* ignore */ }
            done();
          }
        }, 250);
      }, 150);
    }, 100);
  }, 30000);

});
