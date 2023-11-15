var axios = require('axios');

var events = require('events');
var url = require('url');
var crypto = require('crypto');

module.exports = function (opts) {
  if (!opts.callbackURI) opts.callbackURI = '/github/callback';
  if (!opts.loginURI) opts.loginURI = '/github/login';
  if (typeof opts.scope === 'undefined') opts.scope = 'user';
  var internalState = crypto.randomBytes(8).toString('hex');
  var urlObj = url.parse(opts.baseURL);
  urlObj.pathname = url.resolve(urlObj.pathname, opts.callbackURI);
  var redirectURI = url.format(urlObj);
  var emitter = new events.EventEmitter();

  function login(req, resp) {
    internalState = crypto.randomBytes(8).toString('hex');
    var u = 'https://github.com/login/oauth/authorize'
      + '?client_id=' + opts.githubClient
      + (opts.scope ? '&scope=' + opts.scope : '')
      + '&redirect_uri=' + redirectURI
      + '&state=' + internalState
      ;
    resp.statusCode = 302;
    resp.setHeader('location', u);
    resp.end();
  }

  function parseResponse(body) {
    const items = body.split("&");
    var data = null;
    items.forEach(() => {
      const kv = items[0].split("=");
      const key = kv[0];
      const val = kv[1];
      if (key.indexOf("access_token" !== -1)) {
        data = val;
      }
    });
    return data;
  }



  function callback(code, state, resp, cb) {
    // sample values: &code=d186aa2b6c2663e258ee&state=8df9aee854f9a6d3',
    // minimum (expected) code length = 20 characters
    // validation regex: [a-z0-9]
    // GET /api/oauth/github/callback?code=d4cce4d757b9a20699ca&state=7df9aee854f9a6d2 

    const codeIsValid = (/^([a-z0-9]{20,})$/.test(code));
    if (!codeIsValid) {
      const rbody = resp.body;
      console.log("[debug] [oauth-github] missing or invalid oauth code in ", { rbody });
      return emitter.emit('error', { error: 'missing or invalid oauth code' }, resp);
    }

    const stateIsValid = (/^([a-z0-9]{16,})$/.test(state));
    if (!stateIsValid) {
      const rbody = resp.body;
      console.log("[debug] [oauth-github] missing or invalid oauth state in ", { rbody });
      return emitter.emit('error', { error: 'missing or invalid oauth state' }, resp);
    }

    console.log(("[debug] [oauth-github] Requesting access token with state", {state}, "vs. internalState", {internalState}));

    if (state.indexOf(internalState) == 0) {
      console.log("[debug] [oauth-github] State is valid internal state.");
    } else {
      console.log("[debug] [oauth-github] State is valid but externally set before access_token request!");
    }

    var u = 'https://github.com/login/oauth/access_token'
      + '?client_id=' + opts.githubClient
      + '&client_secret=' + opts.githubSecret
      + '&code=' + code
      + '&state=' + state
      ;

    (async () => {
      try {
        const body = await axios.get(u);
        const data = parseResponse(body.data);
        if (data.indexOf("gho_") !== -1) {
          emitter.emit('token', data);
          if (cb) return cb(null, data);
        } else {
          console.log("[debug] Invalid GitHub Response:", { body });
        }
      } catch (e) {
        console.log("axios get error:", e);
        if (cb) return cb(e);
        emitter.emit('error', null, e);
      }
    })();
  }

  emitter.login = login;
  emitter.callback = callback;
  return emitter;
};
