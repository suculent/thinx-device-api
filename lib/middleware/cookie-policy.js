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

module.exports = {
    trustedProxy,
    sessionCookie,
    DEFAULT_TRUSTED_PROXY
};
