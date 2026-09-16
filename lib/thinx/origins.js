// SEC-CORS-01 — Shared web-origin allowlist.
//
// Single source of truth for "which browser origins may talk to this API
// cross-origin with credentials". Used by lib/middleware/cors.js (CORS
// response headers) and lib/thinx/oauth_return.js (origin-aware OAuth return)
// so the two can never drift apart.
//
// Sources: CORS_ALLOWED_ORIGINS (comma-separated) plus app_config.public_url.
// Entries are trimmed and stripped of trailing slashes; matching is exact
// (scheme + host [+ port]) — no substring or suffix matching.
//
// Enforcement is fail-open by default (mirrors CSRF_ENFORCE): with
// CORS_ENFORCE unset and debug.cors_enforce absent/false, a non-allowlisted
// Origin is still reflected but logged, so a missed hostname shows up in the
// logs instead of as a broken console. Flip CORS_ENFORCE=true (or
// debug.cors_enforce: true) to stop emitting CORS headers for unknown origins.

const Globals = require("./globals");

function normalize(origin) {
  if (typeof origin !== "string") return null;
  const o = origin.trim().replace(/\/+$/, "");
  if (o.length === 0) return null;
  return o;
}

function allowedOrigins() {
  const app_config = Globals.app_config();
  const fromEnv = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const list = fromEnv.slice();
  if (app_config && typeof app_config.public_url === "string" && app_config.public_url.length > 0) {
    list.push(app_config.public_url);
  }
  return list.map((o) => o.replace(/\/+$/, ""));
}

function isAllowed(origin) {
  const o = normalize(origin);
  if (o === null) return false;
  return allowedOrigins().indexOf(o) !== -1;
}

function isEnforced() {
  if (process.env.CORS_ENFORCE === "true") return true;
  const app_config = Globals.app_config();
  if (app_config && typeof app_config.debug !== "undefined" && app_config.debug !== null &&
      app_config.debug.cors_enforce === true) return true;
  return false; // fail-open default
}

module.exports = { allowedOrigins, isAllowed, isEnforced, normalize };
