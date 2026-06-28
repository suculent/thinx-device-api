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
// Security: the origin MUST be in the existing CORS allowlist
// (CORS_ALLOWED_ORIGINS, same set used by enforceACLHeaders) plus public_url.
// Anything else (or absent) falls back to the unchanged legacy behavior — no
// open redirect. The token handed over is the same one-shot redis token the
// legacy flow already exposes in the URL.

const Globals = require("./globals");

const RETURN_COOKIE = "thx_oauth_origin";

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

module.exports = { rememberReturnOrigin, takeReturnOrigin, returnURLFor, allowedOrigins, RETURN_COOKIE };
