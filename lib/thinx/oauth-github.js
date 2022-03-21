const https = require('https');
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
        var u = 'https://github.com/login/oauth/authorize' +
            '?client_id=' + process.env.GITHUB_CLIENT_ID +
            (opts.scope ? '&scope=' + opts.scope : '') +
            '&redirect_uri=' + redirectURI +
            '&state=' + state;
        resp.statusCode = 302;
        resp.setHeader('location', u);
        resp.end();
    }

    function callback(req, resp, cb) {
        var query = url.parse(req.url, true).query;
        var code = query.code;
        var body = "";
        if (!code) return emitter.emit('error', { error: 'missing oauth code' }, resp);
        var o = {
            host: 'github.com',
            port: 443,
            path: '/login/oauth/access_token?code=' + code + '&state=' + state,
            headers: {
                'Authorization': 'Basic ' + new Buffer(process.env.GITHUB_CLIENT_ID + ':' + process.env.GITHUB_CLIENT_SECRET).toString('base64')
            }
        };
        https.get(o, (res) => {
            res.setEncoding('utf8');
            res.on('data', (d) => {
                body += d;
            });
            res.on('end', () => {
                if (cb) {
                    cb(null, body);
                }
                emitter.emit('token', body, resp, res, req);
            });
        }).on('error', (e) => {
            console.error(e);
            if (cb) {
                e.body = body;
                return cb(e);
            }
            return emitter.emit('error', body, e, resp, req);
        });
    }

    emitter.login = login;
    emitter.callback = callback;
    return emitter;
};