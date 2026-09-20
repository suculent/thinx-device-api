var axios = require('axios');

var events = require('events');
var url = require('url');
var crypto = require('crypto');

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
// The only 'error' listener (router.github.js:187) logs, and ends the response
// ONLY under ENVIRONMENT=test. In production nothing terminated the request, so
// a rejected callback left the socket open until the client timed out — which a
// live probe of /api/oauth/github/callback confirmed (no response at all).
// Emit first so the listener keeps its test behaviour, then close the request
// ourselves if it is still open.
function endRejected(resp) {
  if (resp && resp.writableEnded === false) {
    resp.statusCode = 403;
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
      emitter.emit('error', { error: 'invalid oauth state' }, resp);
      return endRejected(resp);
    }

    var code = query.code
    if (!code || code.length < 4) {
      const rbody = resp.body;
      console.log("[debug] [oauth-github] missing or invalid oauth code in ", {query}, {rbody});
      emitter.emit('error', { error: 'missing or invalid oauth code' }, resp);
      return endRejected(resp);
    }
    const request = buildTokenRequest({
      githubClient: opts.githubClient,
      githubSecret: opts.githubSecret,
      code: code,
      state: expectedState // verified above to equal query.state
    });

    (async () => {
      try {
        const body = await axios.post(request.url, request.body, { headers: request.headers });
        //console.log("[debug] emitting event token with body", { body });
        const data = parseResponse(body.data);
        if (data !== null && data.indexOf("gho_") !== -1) {
          emitter.emit('token', data);
          if (cb) return cb(null, data);
        } else {
          console.log("[debug] Invalid GitHub Response:", {body});
        }
      } catch (e) {
        console.log("axios get error:", e);
        if (cb) return cb(e);
        emitter.emit('error', null, e);
      }
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
