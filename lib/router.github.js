// /api/v2/oauth/github

const Globals = require("./thinx/globals");
const prefix = Globals.prefix();
const Database = require("../lib/thinx/database.js");
let db_uri = new Database().uri();
var userlib = require("nano")(db_uri).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

const github_ocfg = Globals.github_ocfg();
const https = require('https');
const sha256 = require("sha256");

//
// OAuth2 for GitHub
//

var githubOAuth;

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

module.exports = function (app) {

    /*
    * OAuth 2 with GitHub
    */

    function validateGithubUser(response, token, userWrapper) {

        let owner_id = userWrapper.owner; // must not be nil
        console.log("[oauth][github] searching for owner with ID: ", { owner_id });

        // Check user and make note on user login
        userlib.get(userWrapper.owner, (error, udoc) => {

            // Error case covers creating new user/managing deleted account
            if (error) {

                if (Globals.use_sqreen()) {
                    if (typeof (app.sqreen) !== "undefined") app.sqreen.auth_track(false, { doc: owner_id });
                }

                console.log("[oauth][github] userlib.get failed with error: ", error, { udoc });

                if (error.toString().indexOf("Error: deleted") !== -1) {
                    console.log("[debug] [oauth] [check] user document deleted");
                    response.redirect(
                        app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
                        encodeURI('Account document deleted.')
                    );
                    return;
                }

                // May exist, but be deleted. Can be cleared using Filtered Replication Handler "del"
                if (typeof (udoc) !== "undefined" && udoc !== null) {
                    if ((typeof (udoc.deleted) !== "undefined") && udoc.deleted === true) {
                        if (Globals.use_sqreen()) {
                            if (typeof (app.sqreen) !== "undefined") app.sqreen.auth_track(false, { doc: owner_id });
                        }
                        console.log("[debug] [oauth] [check] user account marked as deleted");
                        response.redirect(
                            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
                            encodeURI('Account deleted.')
                        );
                        return;
                    }
                } else {
                    console.log("No such owner, should create one...");
                }

                // No such owner, create...
                user.create(userWrapper, false, response, (/* res, success, status*/) => {

                    console.log("[OID:" + owner_id + "] [NEW_SESSION] [oauth] 2485:");

                    alog.log(owner_id, "OAuth User created. ");

                    console.log("validateGithubUser", { token }, { userWrapper });
                    app.redis_client.set(token, JSON.stringify(userWrapper));
                    app.redis_client.expire(token, 30);

                    const courl = app_config.acl_url + "/auth.html&t=" + token + "&g=true"; // require GDPR consent
                    console.log("FIXME: this request will probably fail fail (cannot redirect): " + courl);

                    if (Globals.use_sqreen()) {
                        Sqreen.signup_track({ username: owner_id });
                    }

                    console.log("Redirecting to login (2)");
                    response.redirect(courl); // for successful login, this must be a response to /oauth/<idp>/callback 
                });
                return;
            }

            user.trackUserLogin(owner_id);

            console.log("validateGithubUser", { token }, { userWrapper });
            app.redis_client.set(token, JSON.stringify(userWrapper));
            app.redis_client.expire(token, 3600);

            var gdpr = false;
            if (typeof (udoc) !== "undefined" && udoc !== null) {
                if (typeof (udoc.info) !== "undefined") {
                    if (typeof (udoc.gdpr_consent) !== "undefined" && udoc.gdpr_consent === true) {
                        gdpr = true;
                    }
                }
            }

            const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + gdpr; // require GDPR consent
            console.log("[validateGithubUser] using response with ourl: " + ourl);
            response.redirect(ourl);
        }); // userlib.get
    }

    function secureGithubCallbacks(original_response) {

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

        githubOAuth.on('error', (err) => {
            console.error('[debug] [oauth] [github] there was a login error', err);
            if (process.env.ENVIRONMENT == "test")
                if (typeof (original_response) !== "undefined") original_response.end("test-ok");
        });

        githubOAuth.on('token', (oauth_token_string/* , resp, _res, req */) => {

            let oauth_token_array = oauth_token_string.split("&");
            let access_token = oauth_token_array[0].replace("access_token=", "");

            console.log("[debug] [oauth] [github] access_token", access_token);

            if (typeof (access_token) === "undefined") {
                console.log("[debug] [github] [token] No token, exiting.");
                return;
            }

            var request_options = {
                host: 'api.github.com',
                port: 443,
                path: '/user',
                headers: {
                    'User-Agent': 'THiNX', // Application name from GitHub / Settings / Developer Settings
                    'Authorization': 'token ' + access_token,
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            console.log("[debug] [github] [token] getting user info with", { request_options });

            https.get(request_options, (res) => {

                var data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received. Print out the result.
                res.on('end', () => {

                    var token = "ghat:" + access_token;
                    var given_name;
                    var family_name = "User";
                    var hdata = JSON.parse(data);

                    if ((typeof (hdata.name) !== "undefined") && hdata.name !== null) {
                        if (hdata.name.indexOf(" ") > -1) {
                            var in_name_array = hdata.name.split(" ");
                            given_name = in_name_array[0];
                            family_name = in_name_array[in_name_array.count - 1];
                        } else {
                            given_name = hdata.name;
                        }
                    } else {
                        family_name = hdata.login;
                        given_name = hdata.login;
                        console.log("[debug] [github] [token] Warning: no name in GitHub access token response, using login: ", { hdata }); // logs personal data in case the user has no name!
                    }

                    var owner_id = null;
                    var email = hdata.email;

                    if (typeof (email) === "undefined" || email === null) {
                        console.log("[debug] [github] [token] Error: no email in response, should login without activation.");
                        email = hdata.login;
                    }

                    try {
                        owner_id = sha256(prefix + email);
                    } catch (e) {
                        console.log("☣️ [error] [github] [token] error parsing e-mail: " + e + " email: " + email);
                        res.redirect(
                            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=Missing%20e-mail.'
                        );
                        return;
                    }

                    var userWrapper = {
                        first_name: given_name,
                        last_name: family_name,
                        email: email,
                        owner: owner_id,
                        username: owner_id
                    };

                    console.log("[debug] [github] [token] validateGithubUser with GitHub Access token:", token);

                    validateGithubUser(original_response, token, userWrapper);

                }); // res.end
            }); // https.get
        });
    }

    // Initial page redirecting to OAuth2 provider
    app.get('/api/oauth/github', function (req, res) {
        if (typeof (req.session) !== "undefined") {
            console.log("[debug] /api/oauth/github will destroy old session...");
            req.session.destroy();
        }
        if (typeof (githubOAuth) !== "undefined") {
            githubOAuth.login(req, res);
        } else {
            res.status(400).end();
        }
    });

    // Callback service parsing the authorization token and asking for the access token
    app.get('/api/oauth/github/callback', function (req, res) {

        secureGithubCallbacks(res); // save original response to callbacks in this code path... when callback is called, response is used to reply
        if (githubOAuth.callback === "function") {
            githubOAuth.callback(req, res);
        } else {
            console.log("[warning] githubOAuth.callback(req, res); is not a function");
            res.status(401).end();
        }
    });

};