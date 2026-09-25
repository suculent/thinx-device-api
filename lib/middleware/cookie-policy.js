// SEC-PROXY-01 / SEC-COOKIE-02 — single source of truth for which hops may set
// X-Forwarded-* headers, and for how cookies negotiate their Secure flag.
//
// This API always terminates plain HTTP: TLS is unwrapped in Traefik. So `secure`
// can never be hardcoded. `true` makes express-session drop the Set-Cookie header
// entirely when the connection is not secure (express-session/index.js:242), which
// silently kills login; `false` gives up the flag in production. Both cookie kinds
// therefore negotiate it from the connection — and that only works while
// `trust proxy` actually matches the hop Traefik connects from.

// Traefik (10.0.1.95) reaches the api container (10.0.1.48) over the traefik-public
// overlay. Loopback is kept for in-container traffic and for the specs.
//
// Deliberately NOT the swarm ingress gateway (10.0.0.x): port 7442 is published for
// legacy devices without an HTTPS proxy, and anything trusted there could forge
// X-Forwarded-For and take over another client's express-rate-limit bucket.
const DEFAULT_TRUSTED_PROXY = ["loopback", "10.0.1.0/24"];

// Resolution order mirrors csrf.js isEnforced(): env first, then config, then default.
// Never returns the boolean `true` — express-rate-limit 8.x rejects that outright
// with ERR_ERL_PERMISSIVE_TRUST_PROXY.
function trustedProxy(app_config) {

    const env = process.env.TRUSTED_PROXY;
    if ((typeof (env) === "string") && (env.trim().length > 0)) {
        return env.split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }

    const configured = (app_config) ? app_config.trusted_proxy : undefined;
    if (Array.isArray(configured) && (configured.length > 0)) return configured;
    if ((typeof (configured) === "string") && (configured.length > 0)) return [configured];

    return DEFAULT_TRUSTED_PROXY;
}

// `secure: 'auto'` resolves per connection in express-session's store.generate().
// sameSite stays the literal "lax" on purpose — 'auto' would flip it to 'none'
// whenever secure resolves true (express-session/index.js:169).
function sessionCookie(options) {

    const cookie = {
        // deepcode ignore WebCookieSecureDisabledExplicitly: 'auto' is stricter than a
        // hardcoded literal, not weaker — it resolves to true behind Traefik and a
        // hardcoded `true` would suppress Set-Cookie outright. See PR #552.
        secure: "auto", /* lgtm [js/clear-text-cookie] */
        httpOnly: true,
        sameSite: "lax",
        domain: options.domain
    };

    if (typeof (options.maxAge) !== "undefined") cookie.maxAge = options.maxAge;
    if (typeof (options.expires) !== "undefined") cookie.expires = options.expires;

    return cookie;
}

// Shared parent `Domain` for the session and XSRF-TOKEN cookies, derived from
// `api_url` by dropping the first hostname label (https://rtm.thinx.cloud ->
// ".thinx.cloud"), so console.* and rtm.* both see them. Never throws: a URL that
// does not parse, an IP or a host with fewer than three labels yields undefined,
// i.e. a host-only cookie. The old split(".") on the whole URL kept ports and
// paths (".thinx.cloud:7443", ".thinx.cloud/"), which made res.cookie() throw
// "option domain is invalid" on every cookieless request (21-REVIEW WR-02).
const COOKIE_DOMAIN_PATTERN = /^\.[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function cookieDomain(api_url) {

    if ((typeof (api_url) !== "string") || (api_url.trim().length === 0)) return undefined;

    const raw = api_url.trim();
    let hostname;
    try {
        hostname = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw).hostname;
    } catch (_e) {
        return undefined;
    }

    if (!hostname || hostname.startsWith("[") || /^[0-9.]+$/.test(hostname)) return undefined; // IPv6 / IPv4

    const labels = hostname.split(".");
    if (labels.length < 3) return undefined;

    const domain = "." + labels.slice(1).join(".");
    return COOKIE_DOMAIN_PATTERN.test(domain) ? domain : undefined;
}

module.exports = {
    trustedProxy,
    sessionCookie,
    cookieDomain,
    DEFAULT_TRUSTED_PROXY
};
