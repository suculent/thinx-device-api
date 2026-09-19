var axios = require('axios');

var events = require('events');
var url = require('url');
var crypto = require('crypto');

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

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
  var state = crypto.randomBytes(8).toString('hex');
  var urlObj = url.parse(opts.baseURL);
  urlObj.pathname = url.resolve(urlObj.pathname, opts.callbackURI);
  var redirectURI = url.format(urlObj);
  var emitter = new events.EventEmitter();

  function login(req, resp) {
    var u = 'https://github.com/login/oauth/authorize'
      + '?client_id=' + opts.githubClient
      + (opts.scope ? '&scope=' + opts.scope : '')
      + '&redirect_uri=' + redirectURI
      + '&state=' + state
      ;
    resp.statusCode = 302;
    resp.setHeader('location', u);
    resp.end();
  }

  function callback(req, resp, cb) {
    var query = url.parse(req.url, true).query
    var code = query.code
    if (!code || code.length < 4) {
      const rbody = resp.body;
      console.log("[debug] [oauth-github] missing or invalid oauth code in ", {query}, {rbody});
      return emitter.emit('error', { error: 'missing or invalid oauth code' }, resp)
    }
    const request = buildTokenRequest({
      githubClient: opts.githubClient,
      githubSecret: opts.githubSecret,
      code: code,
      state: state
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
