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

  // why is this unused?
  function addRoutes(router, loginCallback) {
    console.log("[debug] emitter.addRoutes called, keep this code even when it looks unreferenced!");
    // compatible with flatiron/director
    router.get(opts.loginURI, login);
    router.get(opts.callbackURI, callback);
    if (!loginCallback) return;
    emitter.on('error', function (token, err, resp, tokenResp, req) {
      loginCallback(err, token, resp, tokenResp, req)
    });
    emitter.on('token', function (token, resp, tokenResp, req) {
      loginCallback(false, token, resp, tokenResp, req)
    });
  }

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
    if (!code) {
      const rbody = resp.body;
      console.log("[debug] [oauth-github] missing oauth code in ", {query}, {rbody});
      return emitter.emit('error', { error: 'missing oauth code' }, resp)
    }
    var u = 'https://github.com/login/oauth/access_token'
      + '?client_id=' + opts.githubClient
      + '&client_secret=' + opts.githubSecret
      + '&code=' + code
      + '&state=' + state
      ;

    (async () => {
      try {
        const { body } = await axios.get(u);
        if (cb) {
          cb(null, body);
        }
        emitter.emit('token', body);
      } catch (e) {
        console.log("axios get error:", e);
        if (cb) {
          return cb(e);
        }
        return emitter.emit('error', null, e);
      }
    })()
  }

  emitter.login = login;
  emitter.callback = callback;
  emitter.addRoutes = addRoutes;
  return emitter;
}