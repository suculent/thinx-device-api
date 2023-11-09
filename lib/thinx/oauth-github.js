var axios = require('axios');

var events = require('events');
var url = require('url');
var crypto = require('crypto');

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

  function callback(req, resp, cb) {
    var query = url.parse(req.url, true).query;
    var code = query.code;
    if (!code || code.length < 4) {
      const rbody = resp.body;
      console.log("[debug] [oauth-github] missing or invalid oauth code in ", {query}, {rbody});
      return emitter.emit('error', { error: 'missing or invalid oauth code' }, resp);
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
        console.log("[debug] emitting event token with body", { body });
        const data = parseResponse(body.data);
        if (data.indexOf("gho_") !== -1) {
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
    })();
  }

  emitter.login = login;
  emitter.callback = callback;
  return emitter;
}