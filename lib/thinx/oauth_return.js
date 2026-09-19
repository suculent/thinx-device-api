// Origin-aware OAuth return.
//
// By default the OAuth callback always lands on the legacy `auth.html` page at
// app_config.public_url (the rtm/legacy console). The Vue console lives on a
// different origin and authenticates via JWT, so it can never complete OAuth
// there. This helper lets a console at an ALLOWLISTED origin opt into completing
// OAuth on its own domain: the initiator passes `?return=<origin>`, we stash it
// in a short-lived SameSite=Lax cookie that survives the IdP round-trip, and the
// callback redirects to `<origin>/#/oauth-return?t=<token>` instead.
//
// Security: the origin MUST be in the shared CORS allowlist
// (lib/thinx/origins.js: CORS_ALLOWED_ORIGINS plus public_url).
// Anything else (or absent) falls back to the unchanged legacy behavior — no
// open redirect. The token handed over is the same one-shot redis token the
// legacy flow already exposes in the URL.

const Globals = require("./globals");

const RETURN_COOKIE = "thx_oauth_origin";

// Shared with lib/middleware/cors.js — one allowlist, never two.
const allowedOrigins = require("./origins").allowedOrigins;

// Shared parent domain so the marker cookie set on the initiator host (which may
// be the console origin, e.g. console.thinx.cloud, because the SPA proxies /api)
// is also sent to the OAuth callback host (the fixed redirect_uri host, e.g.
// rtm.thinx.cloud). Without this the cookie is host-scoped and the callback never
// sees it -> the user falls back to the legacy console. Mirrors the session
// cookie's domain logic in thinx-core.js. Returns undefined for apex/non-domain
// hosts (leave host-scoped).
function cookieDomain() {
  const app_config = Globals.app_config();
  const raw = (app_config && (app_config.api_url || app_config.public_url)) || "";
  const host = raw.replace(/^https?:\/\//, "").replace(/[:/].*$/, "").trim();
  const parts = host.split(".");
  if (parts.length < 3) return undefined;
  return "." + parts.slice(1).join(".");
}

function normalize(origin) {
  if (typeof origin !== "string") return null;
  const o = origin.trim().replace(/\/+$/, "");
  if (o.length === 0 || o.length > 2048) return null;
  if (!/^https?:\/\/[^\s/?#]+$/.test(o)) return null; // scheme + host only, no path/query
  return o;
}

// Initiator: validate ?return= and remember it in a short-lived cookie.
function rememberReturnOrigin(req, res) {
  const candidate = normalize(req.query && req.query.return);
  if (candidate === null) return;
  if (allowedOrigins().indexOf(candidate) === -1) {
    console.log("[oauth] ignoring non-allowlisted return origin:", candidate);
    return;
  }
  res.cookie(RETURN_COOKIE, candidate, {
    maxAge: 10 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax", // sent on the top-level callback navigation back from the IdP
    path: "/",
    domain: cookieDomain() // shared across console.* and rtm.* (undefined => host-scoped)
  });
}

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (typeof header !== "string") return null;
  const parts = header.split(";");
  for (let i = 0; i < parts.length; i++) {
    const idx = parts[i].indexOf("=");
    if (idx === -1) continue;
    if (parts[i].slice(0, idx).trim() === name) {
      try { return decodeURIComponent(parts[i].slice(idx + 1).trim()); } catch (_e) { return null; }
    }
  }
  return null;
}

// Callback: read + clear the remembered origin. Returns a validated, allowlisted
// console origin, or null to use the legacy flow.
function takeReturnOrigin(req, res) {
  const remembered = normalize(readCookie(req, RETURN_COOKIE));
  if (typeof res.clearCookie === "function") res.clearCookie(RETURN_COOKIE, { path: "/", domain: cookieDomain() });
  if (remembered === null) return null;
  if (allowedOrigins().indexOf(remembered) === -1) return null;
  const publicUrl = (Globals.app_config().public_url || "").replace(/\/+$/, "");
  if (remembered === publicUrl) return null; // same host as legacy -> use auth.html
  return remembered;
}

// Build the post-OAuth redirect URL. `origin` is the value from takeReturnOrigin
// (null => legacy auth.html on public_url).
function returnURLFor(origin, token, gdpr) {
  if (origin) {
    return origin + "/#/oauth-return?t=" + token + "&g=" + gdpr;
  }
  return Globals.app_config().public_url + "/auth.html?t=" + token + "&g=" + gdpr;
}

// --- Short-lived round-trip cookies ----------------------------------------
//
// Additive helpers (nothing above changes). Other parts of the OAuth flow need
// to carry a value across the IdP round-trip with exactly the cookie shape the
// return-origin marker uses — httpOnly, SameSite=Lax (the callback is a
// top-level navigation back from the IdP, so Strict would drop it), path "/",
// the shared parent domain (initiator host console.* vs. fixed redirect_uri
// host rtm.*) and a short TTL. The GitHub OAuth `state` nonce is one such
// value; it gets its OWN cookie, never overloaded onto thx_oauth_origin, so
// each cookie carries a single value with a single meaning and a single use.

const SHORT_COOKIE_MAX_AGE = 10 * 60 * 1000; // 10 minutes; long enough for a login, short enough to not linger

function shortLivedCookieOptions() {
  return {
    maxAge: SHORT_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    domain: cookieDomain() // undefined => host-scoped
  };
}

// Returns false when the response cannot set cookies (non-Express stub).
function setShortLivedCookie(res, name, value) {
  if (!res || typeof res.cookie !== "function") return false;
  res.cookie(name, value, shortLivedCookieOptions());
  return true;
}

// Read + clear in one breath: these cookies are single-use, so a replay of the
// same callback URL finds nothing to compare against. Mirrors takeReturnOrigin.
function takeCookie(req, res, name) {
  const value = readCookie(req, name);
  if (res && typeof res.clearCookie === "function") {
    res.clearCookie(name, { path: "/", domain: cookieDomain() });
  }
  return value;
}

module.exports = {
  rememberReturnOrigin, takeReturnOrigin, returnURLFor, allowedOrigins, RETURN_COOKIE,
  // additive:
  shortLivedCookieOptions, setShortLivedCookie, takeCookie, SHORT_COOKIE_MAX_AGE
};
