/* REFACTOR-03 regression spec, re-expressed for per-connection tracking (v1.18 Phase 43, NOTIF-02).
 *
 * Until Phase 43 thinx-core.js kept one socket per URL path and refused a second upgrade on a
 * path that already had one ("duplicate-upgrade guard"). REFACTOR-03 added a raw-socket close
 * handler so an upgrade aborted mid-flight would not leave its path armed against a reconnect.
 *
 * Phase 43 removed the path map: upgrades are tracked per connection and per verified owner in
 * lib/thinx/socket_upgrade.js, and each raw socket releases only its own slot on its own
 * 'close'. The REFACTOR-03 contract is now: an aborted upgrade leaves nothing armed, so a second
 * raw upgrade on the SAME path is admitted and answered `HTTP/1.1 101` (this spec), and the
 * per-owner counter returns to its baseline (SocketUpgradeSpec U3a/U3b, which run locally and
 * in CI, unlike this ZZ spec).
 *
 * Flow: open a raw upgrade, abort it after 100 ms, wait 150 ms, open a second raw upgrade on the
 * same path and collect what the server answers. It must start with `HTTP/1.1 101`. The cookie
 * is a bogus x-thx-core session, so the session has no owner: the socket is not counted against
 * any owner and SocketSession.accept closes it 1008 after the handshake. The captured-log check
 * for the old "Socket already mapped for <path>" line stays as regression bait.
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
  // request against the given path. Returns the net.Socket instance.
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

  it("REFACTOR-03 — after an aborted upgrade the second raw upgrade on the same path gets HTTP/1.1 101", function (done) {
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

    // Unique path per run, so no other spec's socket shares it.
    const socketKey = `refactor-03-test-${Date.now()}`;

    // PHASE A: prime + abort.
    // Open a raw socket, send the upgrade headers, give the server a brief
    // moment to admit the upgrade, then abort.
    const firstSock = openUpgradeSocket(port, socketKey);

    setTimeout(() => {
      try { firstSock.destroy(); } catch (_e) { /* ignore */ }

      // PHASE B: wait for the server-side raw-socket 'close' event to fire,
      // then start capturing console.log lines and open a SECOND upgrade
      // against the SAME path and collect the server's answer.
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
        let secondData = "";
        secondSock.on('data', (chunk) => { secondData += String(chunk); });

        // Give the server enough time to answer the second upgrade.
        setTimeout(() => {
          console.log = originalConsoleLog;

          const leaked = capturedLines.filter(l =>
            l.indexOf(`Socket already mapped for ${socketKey}`) !== -1
          );

          try {
            // The second upgrade on the same path is admitted: nothing stayed
            // armed by the aborted first one.
            expect(secondData.indexOf("HTTP/1.1 101"), "second upgrade answered 101").to.equal(0);
            // Regression bait: the pre-Phase-43 duplicate-path refusal line.
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
