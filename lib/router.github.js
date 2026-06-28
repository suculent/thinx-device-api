// /api/v2/oauth/github

let RSAKey = require("../lib/thinx/rsakey.js");
let rsakey = new RSAKey();
let GitHub = require("../lib/thinx/github.js");
let GitHubLink = require("../lib/thinx/github_link.js");
let Sanitka = require("../lib/thinx/sanitka.js"); let sanitka = new Sanitka();

const Globals = require("./thinx/globals");
const prefix = Globals.prefix();
const Database = require("../lib/thinx/database.js");
let db_uri = new Database().uri();
let userlib = require("nano")(db_uri).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

const github_ocfg = Globals.github_ocfg();
const https = require('https');
const sha256 = require("sha256");
const oauthReturn = require("./thinx/oauth_return");

const app_config = Globals.app_config();

let AuditLog = require("../lib/thinx/audit"); let alog = new AuditLog();

const Util = require("./thinx/util");

//
// OAuth2 for GitHub
//

module.exports = function (app) {

    /*
    * OAuth 2 with GitHub
    */

    let user = app.owner;

    let githubOAuth;

    if (typeof (process.env.GITHUB_CLIENT_SECRET) !== "undefined" && process.env.GITHUB_CLIENT_SECRET !== null) {
        try {
            let specs = {
                githubClient: process.env.GITHUB_CLIENT_ID,
                githubSecret: process.env.GITHUB_CLIENT_SECRET,
                baseURL: github_ocfg.base_url, // should be rather gotten from global config!
                loginURI: '/api/oauth/github',
                callbackURI: '/api/oauth/github/callback',
                scope: 'user'
            };
            githubOAuth = require('./thinx/oauth-github.js')(specs);
        } catch (e) {
            console.log(`[debug] [oauth] [github] github_ocfg init error: ${e}`);
        }
    }

    function validateGithubUser(response, token, userWrapper) {

        let owner_id = userWrapper.owner; // must not be nil

        // Check user and make note on user login
        userlib.get(userWrapper.owner, (error, udoc) => {

            // Error case covers creating new user/managing deleted account
            if (error) {

                if (error.toString().indexOf("Error: deleted") !== -1) {
                    console.log("🔨 [debug] [oauth] [check] user document deleted");
                    response.redirect(
                        app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
                        encodeURI('Account document deleted.')
                    );
                    return;
                }

                // May exist, but be deleted. Can be cleared using Filtered Replication Handler "del"
                if (typeof (udoc) !== "undefined" && udoc !== null) {
                    if ((typeof (udoc.deleted) !== "undefined") && udoc.deleted === true) {
                        console.log("🔨 [debug] [oauth] [check] user account marked as deleted");
                        response.redirect(
                            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
                            encodeURI('Account deleted.')
                        );
                        return;
                    }
                } else {
                    console.log("No such owner, should create one...");
                }

                // No such owner, create without activation.
                this.user.create(userWrapper, false, response, (/* res, success, status*/) => {

                    console.log("[OID:" + owner_id + "] [NEW_SESSION] [oauth] 2485:");

                    alog.log(owner_id, "OAuth User created. ");

                    app.redis_client.set(token, JSON.stringify(userWrapper));
                    app.redis_client.expire(token, 30);

                    // New account: consent not yet given -> g=false so the console
                    // shows the GDPR consent gate before logging in.
                    const courl = oauthReturn.returnURLFor(response.thx_return_origin, token, false);

                    console.log("Redirecting to login (2)", courl);
                    response.redirect(courl); // for successful login, this must be a response to /oauth/<idp>/callback
                });
                return;
            }

            console.log(`ℹ️ [info] Calling trackUserLogin on GtHub Auth Callback...`);
            user.trackUserLogin(owner_id);

            console.log("validateGithubUser", { token }, { userWrapper });
            app.redis_client.set(token, JSON.stringify(userWrapper));
            app.redis_client.expire(token, 3600);

            // gdpr=true means the user has already consented (console then skips
            // the consent page). Keyed on gdpr_consent alone — see needsGDPR in
            // router.google.js for why the old doc.info requirement was dropped.
            let gdpr = false;
            if (typeof (udoc) !== "undefined" && udoc !== null) {
                if (typeof (udoc.gdpr_consent) !== "undefined" && udoc.gdpr_consent === true) {
                    gdpr = true;
                }
            }

            const ourl = oauthReturn.returnURLFor(response.thx_return_origin, token, gdpr); // require GDPR consent
            response.redirect(ourl);
        }); // userlib.get
    }

    function githubLogin(access_token, hdata, res, original_response) {
        let token = "ghat:" + access_token;
        let owner_id, given_name, family_name, email;
    
        if ((typeof (hdata.name) !== "undefined") && hdata.name !== null) {
            let in_name_array = hdata.name.split(" ");
            given_name = in_name_array[0];
            family_name = in_name_array[in_name_array.count - 1];
        } else {
            family_name = hdata.login;
            given_name = hdata.login;
            console.log("🔨 [debug] [github] [token] Warning: no name in GitHub access token response, using login: ", { hdata }); // logs personal data in case the user has no name!
        }
        email = hdata.email || hdata.login;
    
        try {
            owner_id = sha256(prefix + email);
        } catch (e) {
            console.log("☣️ [error] [github] [token] error parsing e-mail: " + e + " email: " + email);
            return res.redirect(app_config.public_url + '/error.html?success=failed&title=Sorry&reason=Missing%20e-mail.');
        }
        validateGithubUser(original_response, token, {
            first_name: given_name,
            last_name: family_name,
            email: email,
            owner: owner_id,
            username: owner_id
        });
    }

    function secureGithubCallbacks(original_response, callback) {

        if (typeof (githubOAuth) === "undefined") {
            console.log("[critical] [githubOAuth] undefined on secure! attempting to fix...");

            try {
                let specs = {
                    githubClient: process.env.GITHUB_CLIENT_ID,
                    githubSecret: process.env.GITHUB_CLIENT_SECRET,
                    baseURL: github_ocfg.base_url, // should be rather gotten from global config!
                    loginURI: '/api/oauth/github',
                    callbackURI: '/api/oauth/github/callback',
                    scope: 'user'
                };
                githubOAuth = require('./thinx/oauth-github.js')(specs);

            } catch (e) {
                console.log(`[debug] [oauth] [github] github_ocfg init error: ${e}`);
            }
        }

        // configure callbacks for Emitter events

        githubOAuth.on('error', (err) => {
            console.error('[debug] [oauth] [github] there was a login error', err);
            if (process.env.ENVIRONMENT == "test")
                if (typeof (original_response) !== "undefined") original_response.end("test-ok");
        });

        githubOAuth.on('token', (access_token, /* resp, _res, req */) => {

            if (!Util.isDefined(access_token)) {
                original_response.status(401).end();
                console.log("[github] oauth_response missing (test or intrusion)");
                return;
            }

            if ((!access_token) || (access_token.indexOf("bad_verification") !== -1)) {
                console.log("🔨 [debug] [github] [token] No token, exiting.");
                original_response.status(401).end();
                return;
            }

            const requestOptions = {
                host: 'api.github.com',
                port: 443,
                path: '/user',
                headers: {
                    'User-Agent': 'THiNX', // Application name from GitHub / Settings / Developer Settings 
                    'Authorization': 'token ' + access_token, 
                    'Accept': 'application/vnd.github+json' 
                } 
            };

            https.get(requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    githubLogin(access_token, JSON.parse(data), res, original_response);
                });
            });
        });

        callback(); // async completes the secureGithubCallbacks()
    }

    // Initial page redirecting to OAuth2 provider.
    // Mounted under both /api and /api/v2 — the Vue console builds OAuth URLs from
    // the /api/v2 base (parity with the dual-mounted /login + /logout routes).
    app.get(['/api/oauth/github', '/api/v2/oauth/github'], function (req, res) {
        if (typeof (req.session) !== "undefined") {
            console.log("🔨 [debug] GET /api/oauth/github will destroy old session...");
            req.session.destroy();
        }
        // Remember an allowlisted console origin (e.g. the Vue console) for the callback.
        oauthReturn.rememberReturnOrigin(req, res);
        if (typeof (githubOAuth) !== "undefined") {
            console.log("🔨 [debug] GET /api/oauth/github calling githubOAuth.login");
            githubOAuth.login(req, res);
        } else {
            res.status(400).end();
        }
    });

    // Callback service parsing the authorization token and asking for the access token
    app.get(['/api/oauth/github/callback', '/api/v2/oauth/github/callback'], function (req, res) {
        // Read+clear the remembered console origin here (req is only available on
        // this handler) and stash it on the response, which flows down to
        // validateGithubUser where the post-login redirect is built.
        res.thx_return_origin = oauthReturn.takeReturnOrigin(req, res);
        // save original response to callbacks in this code path... when callback is called, response is used to reply (except for error)
        secureGithubCallbacks(res, () => {
            githubOAuth.callback(req, res, (err) => {
                console.log("[spec] GitHub OAuth result", err);
            });
        });
    });

    // #392 (GH-01 + GH-02): authenticated per-user token link. Validates the
    // caller's GitHub token, stores it on THEIR user document (not a hardcoded
    // test owner), auto-creates an RSA key if they have none, and pushes the
    // public key to GitHub. The token is never echoed back in the response.
    app.post('/api/github/token', (req, res) => {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner_id = sanitka.owner(req.session.owner);
        if (!owner_id) return Util.responder(res, false, "invalid_owner");

        GitHubLink.link({ GitHub: GitHub, rsakey: rsakey, user: user }, owner_id, req.body.token, (result) => {
            if (result.status && result.status !== 200) {
                return Util.failureResponse(res, result.status, result.response);
            }
            Util.respond(res, { success: result.success, response: result.response });
        });
    });
};
