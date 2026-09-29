var axios = require('axios');

var events = require('events');
var url = require('url');
var crypto = require('crypto');

const ALLOWED_URLS = new Set([
  'https://github.com/login/oauth/access_token'
]);

// Required lazily (require() is cached, so this costs nothing after the first
// call): oauth_return pulls in globals.js, which reads config from disk and
// needs rollbar/fs-extra. Loading that at module scope would break the
// standalone plain-node tests in scripts/, which require this file directly.
function oauthReturn() {
  return require('./oauth_return.js');
}

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Login-CSRF defence. The `state` nonce used to be generated ONCE per factory
// call and shared by every user of the process, and the callback never looked
// at it — so an attacker could drive a victim's browser to
// /api/oauth/github/callback with the attacker's own authorization code and
// bind the victim's session to the attacker's GitHub account.
//
// Now: one nonce per authorization request, stashed in its own short-lived
// cookie (same shape as the return-origin marker in oauth_return.js — httpOnly,
// SameSite=Lax so it survives the top-level navigation back from GitHub, shared
// parent domain because the initiator host and the redirect_uri host differ),
// read + cleared once on the callback and compared before the token exchange.
// req.session is deliberately not used: it is not reliable across that hop.
const STATE_COOKIE = 'thx_oauth_state';

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

// Pure: constant-time equality for the state nonce. Rejects anything that is
// not a pair of equal-length, non-empty strings — timingSafeEqual THROWS on a
// length mismatch, so the length guard comes first and is not a shortcut we
// could have skipped.
// Every failure path of callback() reports to its caller first (the 'error'
// event and cb(err)) and then closes the request here if the caller has not.
// Before this, a rejected callback left the socket open until the client timed
// out — which a live probe of /api/oauth/github/callback confirmed (no response
// at all). 403 = rejected input (state/code), 401 = GitHub answered without an
// access token, 502 = the token exchange itself failed.
function endRejected(resp, status) {
  if (resp && resp.writableEnded === false) {
    resp.statusCode = status || 403;
    resp.end();
  }
}

function statesMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  if (expected.length === 0 || received.length === 0) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Pure: builds the outbound token-exchange request. Every value goes through
// URLSearchParams, so a `code` (which arrives URL-DECODED from
// url.parse(req.url, true).query) can never inject an extra parameter, and the
// client secret travels in the POST body instead of a logged query string.
function buildTokenRequest(params) {
  const u = new URL(GITHUB_TOKEN_URL);
  const body = new URLSearchParams();
  body.set('client_id', params.githubClient);
  body.set('client_secret', params.githubSecret);
  body.set('code', params.code);
  body.set('state', params.state);
  return {
    url: u.toString(),
    body: body.toString(),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
}

// Accepts GitHub's JSON answer (what `Accept: application/json` asks for) and
// still tolerates the form-encoded default, e.g. on an error content-type.
function parseResponse(body) {
  if (body === null || typeof body === 'undefined') return null;
  if (typeof body === 'object') {
    return typeof body.access_token === 'string' ? body.access_token : null;
  }
  if (typeof body !== 'string') return null;
  const value = new URLSearchParams(body).get('access_token');
  return typeof value === 'string' ? value : null;
}

module.exports = function (opts) {
  if (!opts.callbackURI) opts.callbackURI = '/github/callback';
  if (!opts.loginURI) opts.loginURI = '/github/login';
  if (typeof opts.scope === 'undefined') opts.scope = 'user';
  var urlObj = url.parse(opts.baseURL);
  urlObj.pathname = url.resolve(urlObj.pathname, opts.callbackURI);
  var redirectURI = url.format(urlObj);
  var emitter = new events.EventEmitter();

  function login(req, resp) {
    // Fresh nonce per authorization request, remembered in its own cookie.
    var state = generateState();
    if (!oauthReturn().setShortLivedCookie(resp, STATE_COOKIE, state)) {
      console.log("[warning] [oauth-github] cannot set the oauth state cookie; the callback will reject this login");
    }
    var u = 'https://github.com/login/oauth/authorize'
      + '?client_id=' + opts.githubClient
      + (opts.scope ? '&scope=' + opts.scope : '')
      + '&redirect_uri=' + redirectURI
      + '&state=' + encodeURIComponent(state)
      ;
    resp.statusCode = 302;
    resp.setHeader('location', u);
    resp.end();
  }

  // Reports a failure without ever throwing: EventEmitter throws on an
  // 'error' emit that nobody listens for. The event carries only the reason
  // string; listeners are process-wide and must not touch `resp`.
  function fail(resp, cb, reason, status) {
    if (emitter.listenerCount('error') > 0) {
      emitter.emit('error', { error: reason }, resp);
    }
    if (typeof cb === 'function') cb(new Error(reason));
    endRejected(resp, status);
  }

  // cb(err) on every failure (the response is then ended here unless cb ended
  // it), cb(null, access_token) on success (the response is left to cb). The
  // token goes to THIS request's cb only. The 'token' event is still emitted
  // for emitter consumers, but it reaches every listener in the process, so a
  // listener must never answer a request with it.
  function callback(req, resp, cb) {
    var query = url.parse(req.url, true).query

    // CSRF gate, before anything is exchanged: single-use cookie vs. the state
    // GitHub echoed back. Never log the attacker-supplied value itself.
    var expectedState = oauthReturn().takeCookie(req, resp, STATE_COOKIE);
    if (!statesMatch(expectedState, query.state)) {
      console.log("[warning] [oauth-github] oauth state rejected", {
        cookie_present: typeof expectedState === 'string' && expectedState.length > 0,
        state_present: typeof query.state === 'string' && query.state.length > 0
      });
      return fail(resp, cb, 'invalid oauth state', 403);
    }

    var code = query.code
    if (!code || code.length < 4) {
      const rbody = resp.body;
      console.log("[debug] [oauth-github] missing or invalid oauth code in ", {query}, {rbody});
      return fail(resp, cb, 'missing or invalid oauth code', 403);
    }
    const request = buildTokenRequest({
      githubClient: opts.githubClient,
      githubSecret: opts.githubSecret,
      code: code,
      state: expectedState // verified above to equal query.state
    });

    (async () => {
      let data = null;
      try {
        if (!ALLOWED_URLS.has(request.url)) {
          throw new Error('URL not allowed for token exchange');
        }
        const body = await axios.post(request.url, request.body, { headers: request.headers });
        data = parseResponse(body.data);
        if (data === null || data.indexOf("gho_") === -1) {
          // Never log `body` itself: body.config.data is the request body,
          // which carries the client secret.
          console.log("[debug] [oauth-github] Invalid GitHub Response:", {
            status: body.status,
            error: (body.data && typeof body.data === 'object') ? body.data.error : undefined
          });
          data = null;
        }
      } catch (e) {
        // Same for axios errors: e.config.data carries the client secret.
        console.log("[error] [oauth-github] token exchange failed:", {
          message: e && e.message,
          status: e && e.response ? e.response.status : undefined
        });
        return fail(resp, cb, 'token exchange failed', 502);
      }
      // Outside the try: a throw inside cb must not be reported as a failed
      // exchange (and call cb a second time).
      if (data === null) return fail(resp, cb, 'invalid github response', 401);
      if (typeof cb === 'function') cb(null, data);
      emitter.emit('token', data);
    })()
  }

  emitter.login = login;
  emitter.callback = callback;
  return emitter;
}

// Exposed for tests (scripts/test-oauth-github-url.js); not part of the runtime API.
module.exports.buildTokenRequest = buildTokenRequest;
module.exports.parseResponse = parseResponse;
module.exports.GITHUB_TOKEN_URL = GITHUB_TOKEN_URL;
module.exports.statesMatch = statesMatch;
module.exports.generateState = generateState;
module.exports.STATE_COOKIE = STATE_COOKIE;