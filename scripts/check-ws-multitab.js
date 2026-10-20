#!/usr/bin/env node
/**
 * Live multi-tab WebSocket probe. v1.18 Phase 43 (NOTIF-02): several Legacy console tabs of one
 * owner hold sockets on the same `/<owner>` path.
 *
 * Before Phase 43 the API kept one socket per URL path: a second upgrade on a path that already
 * had a socket was dropped (production answered it with 502). Since Phase 43 upgrades are tracked
 * per connection (lib/thinx/socket_upgrade.js), so every concurrent upgrade on one path is
 * answered. This probe tells the two apart without any credential.
 *
 * Usage:
 *   node scripts/check-ws-multitab.js <ws:// or wss:// base URL> [--sockets N] [--timeout-ms M]
 *       Opens N WebSocket clients at once (default 2, at most 10) on one random path that is not an
 *       owner id (`<base path>/p43probe-<timestamp>-<random>`) and records for each whether 'open'
 *       fired. It sends no cookie, header or credential of its own, so the API closes every opened
 *       socket with 1008 right after the handshake; that later close code is printed but does not
 *       count against the socket. --timeout-ms bounds the whole probe (default 8000).
 *   Example: node scripts/check-ws-multitab.js wss://rtm.thinx.cloud
 *
 * Output: one `socket <i>: ...` line per socket (`opened`, `opened, close <code>`, or
 *   `not opened (HTTP <status>)` / `not opened (error <code>)` / `not opened (timeout)`), then
 *   `WS-MULTITAB OK <n>/<n> opened` or `WS-MULTITAB FAIL <k>/<n> opened`.
 *   Response headers and bodies are never printed.
 *
 * Exit codes: 0 = every socket opened, 1 = at least one did not, 2 = usage error.
 *
 * Only node built-ins and the declared dependency `ws` are used.
 */

"use strict";

const crypto = require("crypto");
const WebSocket = require("ws");

const DEFAULT_SOCKETS = 2;
const MAX_SOCKETS = 10;
const DEFAULT_TIMEOUT_MS = 8000;
const CLOSE_GRACE_MS = 500;

const USAGE = "usage: node scripts/check-ws-multitab.js <ws:// or wss:// base URL> [--sockets N (default 2, max 10)] [--timeout-ms M (default 8000)]";

function parsePositiveInt(value) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const n = Number(value);
  return (Number.isSafeInteger(n) && n > 0) ? n : null;
}

// Returns { url, sockets, timeoutMs } or { error }.
function parseArgs(argv) {
  const opts = { url: null, sockets: DEFAULT_SOCKETS, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sockets" || arg === "--timeout-ms") {
      const n = parsePositiveInt(argv[i + 1]);
      if (n === null) return { error: arg + " needs a positive integer" };
      if (arg === "--sockets") {
        if (n > MAX_SOCKETS) return { error: "--sockets is at most " + MAX_SOCKETS };
        opts.sockets = n;
      } else {
        opts.timeoutMs = n;
      }
      i++;
    } else if (opts.url === null && arg.indexOf("--") !== 0) {
      opts.url = arg;
    } else {
      return { error: "unexpected argument" };
    }
  }
  if (opts.url === null) return { error: "missing base URL" };
  let base;
  try {
    base = new URL(opts.url);
  } catch (_e) {
    return { error: "not a URL" };
  }
  if (base.protocol !== "ws:" && base.protocol !== "wss:") return { error: "the URL must be ws:// or wss://" };
  if (base.username !== "" || base.password !== "") return { error: "the URL must not carry credentials" };
  if (base.search !== "" || base.hash !== "") return { error: "the URL must not carry a query or fragment" };
  opts.base = base;
  return opts;
}

function probePath(base) {
  const prefix = base.pathname.replace(/\/+$/, "");
  return prefix + "/p43probe-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");
}

// Opens every client at once and calls back with one record per socket.
function probe(opts, callback) {
  const target = new URL(opts.base.href);
  target.pathname = probePath(opts.base);
  const records = [];
  let finished = false;
  let graceTimer = null;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(overall);
    clearTimeout(graceTimer);
    for (const r of records) {
      try { r.ws.terminate(); } catch (_e) { /* already closed */ }
    }
    callback(records);
  };

  const settled = (r) => r.opened || r.failed !== null;

  const check = () => {
    if (finished || !records.every(settled)) return;
    if (records.every((r) => !r.opened || r.closeCode !== null)) return finish();
    // Every socket has opened or failed; give the server a moment to close the opened ones.
    if (graceTimer === null) graceTimer = setTimeout(finish, CLOSE_GRACE_MS);
  };

  const overall = setTimeout(finish, opts.timeoutMs);

  for (let i = 0; i < opts.sockets; i++) {
    const r = { index: i + 1, opened: false, failed: null, closeCode: null, ws: null };
    records.push(r);
    const ws = new WebSocket(target.href, { handshakeTimeout: opts.timeoutMs });
    r.ws = ws;
    ws.on("open", () => { r.opened = true; check(); });
    ws.on("unexpected-response", (_req, res) => {
      if (!r.opened && r.failed === null) r.failed = "HTTP " + res.statusCode;
      try { ws.terminate(); } catch (_e) { /* ignore */ }
      check();
    });
    ws.on("error", (err) => {
      if (!r.opened && r.failed === null) r.failed = "error " + ((err && err.code) ? err.code : "unknown");
      check();
    });
    ws.on("close", (code) => {
      if (r.opened) {
        r.closeCode = code;
      } else if (r.failed === null) {
        r.failed = "closed " + code;
      }
      check();
    });
  }
}

function report(records) {
  const lines = [];
  for (const r of records) {
    if (r.opened) {
      lines.push("socket " + r.index + ": opened" + (r.closeCode !== null ? ", close " + r.closeCode : ""));
    } else {
      lines.push("socket " + r.index + ": not opened (" + (r.failed !== null ? r.failed : "timeout") + ")");
    }
  }
  const opened = records.filter((r) => r.opened).length;
  const ok = opened === records.length;
  lines.push("WS-MULTITAB " + (ok ? "OK" : "FAIL") + " " + opened + "/" + records.length + " opened");
  return { ok: ok, lines: lines };
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    console.error(USAGE);
    console.error("error: " + opts.error);
    process.exitCode = 2;
    return;
  }
  probe(opts, (records) => {
    const out = report(records);
    for (const line of out.lines) console.log(line);
    process.exitCode = out.ok ? 0 : 1;
  });
}

module.exports = { parseArgs, report };

if (require.main === module) main(process.argv.slice(2));
