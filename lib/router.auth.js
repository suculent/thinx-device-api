// Standard Authentication Router

const Globals = require("./thinx/globals");

const Util = require("./thinx/util");

const Sanitka = require("./thinx/sanitka"); let sanitka = new Sanitka();
const AuditLog = require("./thinx/audit"); let alog = new AuditLog();

const Database = require("./thinx/database.js");

const sha256 = require("sha256");

module.exports = function (app) {

    let redis = app.redis_client;
    let user = app.owner;

    const hour = 3600 * 1000;
    const day = hour * 24;
    const fortnight = day * 14;

    let db_uri = new Database().uri();
    const prefix = Globals.prefix();
    const app_config = Globals.app_config();
    let userlib = require("nano")(db_uri).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]

    const InfluxConnector = require('./thinx/influx');

    /*
     * Authentication
     */

    function auditLogError(owner, data) {
        if (!Util.isDefined(owner)) owner = "0";
        InfluxConnector.statsLog(owner, "LOGIN_INVALID", data);
    }

    // this is more like performTokenLogin or performLoginWithToken...
    function performTokenLogin(req, res, oauth) {

        redis.get(oauth, (error, userWrapper) => {

                if ((typeof(userWrapper) === "undefined") || (userWrapper === null)) {
                    console.log("Login failed, wrapper not found for token", oauth);
                    auditLogError(oauth, "wrapper_error_1");
                    return Util.failureResponse(res, 403, "wrapper error");
                }

                console.log("PerformTokenLogin get result (should be valid):", {userWrapper});
            
                let wrapper = JSON.parse(userWrapper);

                let owner_id;

                if ((Util.isDefined(wrapper)) || (userWrapper == null)) {
                    owner_id = wrapper.owner;
                } else {
                    auditLogError(owner_id, "wrapper_error");
                    return Util.failureResponse(res, 403, "wrapper error");
                }

                // If the wrapper exists, user is valid. It is either to be created, or already exists.

                userlib.get(owner_id, (gerr, doc) => {

                    req.session.owner = owner_id;

                    if (gerr) {

                        // creates owner _only_ if does not exist!
                        user.create(wrapper, false, res, (_response, success, status) => {

                            console.log("Result creating OAuth user:", success, status);
                            console.log(`[OID:${req.session.owner}] [NEW_SESSION] [router.auth.js:69]`);

                            req.session.owner = wrapper.owner;
                            req.session.cookie.maxAge = fortnight;

                            let logline = `OAuth User created: ${wrapper.first_name} ${wrapper.last_name}`;
                            console.log("performTokenLogin error", logline);
                            alog.log(owner_id, logline);
                        });

                    } else {

                        // no error when getting username
                        req.session.cookie.maxAge = 24 * hour; // should be max 3600 seconds

                        console.log(`[OID:${owner_id}] [NEW_SESSION] [router.auth.js:84]`);

                        if ((typeof (req.body.remember) === "undefined") ||
                            (req.body.remember === 0)) {
                            req.session.cookie.maxAge = 24 * hour;
                        } else {
                            req.session.cookie.maxAge = fortnight;
                        }

                        alog.log(owner_id, "OAuth User logged in: " + doc.username, "info");

                        user.updateLastSeen(doc, false);

                    }

                    req.session.cookie.name = "x-thx-core";
                    req.session.cookie.secure = false;  // allows HTTP login
                    req.session.cookie.httpOnly = true;

                    console.log("🔨 [debug] redirecting with session...");

                    Util.respond(res, { "redirectURL": "/app" });
                });
        });
    }

    function willSkipGDPR(user_data) {
        let skip_gdpr_page = false;
        if (typeof (user_data.gdpr_consent) === "undefined") {
            skip_gdpr_page = true;
        } else {
            skip_gdpr_page = user_data.gdpr_consent;
        }
        return skip_gdpr_page;
    }

    function newTokenWithUserData(user_data) {
        let token = sha256(user_data.email + ":" + user_data.activation_date);

         // data copy, should expire soon or be deleted explicitly after use
        redis.set(token, JSON.stringify(user_data));
        redis.expire(token, 60);
        
        return token;
    }

    function respondRedirectWithToken(req, res, user_data) {

        if (typeof (user_data.owner) !== "undefined") {
            if (req.session.owner !== user_data.owner) {
                console.log("⚠️ [warning] Overriding req.session.owner from to prevent client-side injection.");
                req.session.owner = user_data.owner;
            }
        }

        if (typeof (req.session.owner) === "undefined") {
            req.session.destroy(function (err) {
                if (err) {
                    console.log("⚠️ [warning] Session destroy error: " + err);
                }
                Util.failureResponse(res, 403, "unauthorized");
            });
        }

        let token = newTokenWithUserData(user_data);
        let redirectURL = app_config.public_url + "/auth.html?t=" + token + "&g=" + willSkipGDPR(user_data);

        // Finally, add JWT token which should replace the t=token or auth.html will deprecate...
        app.login.sign_with_refresh(user_data.owner, (access_token, refresh_token) => {
            Util.respond(res, {
                status: "OK",
                success: true,
                access_token: access_token,
                refresh_token: refresh_token,
                redirectURL: redirectURL
            });
        });
    }

    function allowDebugHTTPLogin(req, res) {
        if (typeof (app_config.debug.allow_http_login) !== "undefined" && app_config.debug.allow_http_login === false) {
            if (req.protocol !== "https") {
                console.log("⚠️ [warning] HTTP rejected for login (set app_config.debug.allow_http_login = true to override for development or on-prem install).");
                res.status(403).end();
                return false;
            }
        }
        return true;
    }

    function rejectLogin(req, user_data, password, stored_response) {

        if (typeof (user_data) === "undefined" || (user_data === null) || (user_data === false)) {
            auditLogError(null, "no_userdata");
            Util.failureResponse(stored_response, 403, "invalid_credentials");
            return true;
        }

        // Exit when user is marked as deleted but not destroyed yet
        let deleted = user_data.deleted;
        if ((typeof (deleted) !== "undefined") && (deleted === true)) {
            auditLogError(user_data.owner, "user_deleted");
            Util.failureResponse(stored_response, 403, "user_account_deactivated");
            return true;
        }

        // Exit early on invalid password
        if (password.indexOf(user_data.password) === -1) {
            let p = user_data.password;
            if (typeof (p) === "undefined" || p === null) {
                console.log(`[OID:${user_data.owner}] [LOGIN_INVALID] not activated/no password.`);
                auditLogError(user_data.owner, "not_activated");
                alog.log(req.session.owner, "Password missing");
                Util.responder(stored_response, false, "password_missing");
            } else {
                console.log(`[OID:${user_data.owner}] [LOGIN_INVALID] Password mismatch.`);
                auditLogError(user_data.owner, "password_mismatch");
                alog.log(req.session.owner, "Password mismatch.");
                stored_response.status(401);
                Util.responder(stored_response, false, "password_mismatch");
            }
            return true;
        }

        return false;
    }

    // used by /login
    function checkMqttKeyAndLogin(req, cached_response, user_data) {

        user.mqtt_key(user_data.owner, function (success, key) {
            if (!success) {
                // Default MQTT key does not exist, create new one and try again 
                console.log("🔨 [debug] [api/login] Pre-creating default mqtt key...", key);
                user.create_default_mqtt_apikey(user_data.owner, () => {
                    checkMqttKeyAndLogin(req, cached_response, user_data);
                });
                return;
            }
            // mqtt key found, refreshing ACLs...
            user.create_default_acl(user_data.owner, () => {
                console.log(`ℹ️ [info] Refreshed owner default ACLs for ${user_data.owner}`);
                // audit
                user.trackUserLogin(user_data.owner);
                respondRedirectWithToken(req, cached_response, user_data);
            });
        });
    }

    function logoutAction(req, res) {
        if (typeof (req.session) !== "undefined") {
            req.session.destroy(function (err) {
                if (err) {
                    console.log("logoutAction error", err);
                }
            });
        }
        // Redirect to login page, must be on same CORS domain (public_url must be == public_url)...
        res.redirect(app_config.public_url);
    }

    function loginAction(req, res) {

        if (!allowDebugHTTPLogin(req, res)) return;

        //
        // OAuth-like Login
        //

        let token = req.body.token;

        if ((typeof (token) !== "undefined") && (token !== null)) {
            performTokenLogin(req, res, token);
            return;
        }

        //
        // Username/password login Variant (with local token)
        //

        let username = sanitka.username(req.body.username);
        let password = sha256(prefix + req.body.password);

        // Search the user in DB, should search by key and return one only
        user.validate(username, (db_body) => {

            if ((typeof (db_body.rows) === "undefined") || (db_body.rows.length == 0)) {
                console.log(`[OID:0] [LOGIN_INVALID] with username ${username}`);
                return Util.failureResponse(res, 403, "invalid_credentials");
            }

            let user_data = db_body.rows[0].value;

            if (rejectLogin(req, user_data, password, res)) return;

            let full_domain = app_config.api_url;
            let full_domain_array = full_domain.split(".");
            delete full_domain_array[0];
            let short_domain = full_domain_array.join('.');

            let maxAge;

            if (typeof (req.session) !== "undefined") {
                req.session.owner = user_data.owner;
                if ((typeof (req.body.remember) === "undefined") || (req.body.remember === 0)) {
                    maxAge = 8 * hour;
                } else {
                    maxAge = fortnight;
                }
            }

            req.session.cookie.maxAge = maxAge;
            res.cookie("x-thx-core", maxAge, {
                maxAge: maxAge,
                httpOnly: true,
                secure: false,
                domain: short_domain
            });

            alog.log(user_data.owner, "User logged in: " + username);
            checkMqttKeyAndLogin(req, res, user_data);
        });
    }

     ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    // Front-end authentication, returns session on valid authentication
    app.post("/api/login", function (req, res) {
       loginAction(req, res);
    });

    // Front-end authentication, destroys session on valid authentication
    app.get("/api/logout", function (req, res) {
        logoutAction(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    // Front-end authentication, returns session on valid authentication
    app.post("/api/v2/login", function (req, res) {
        loginAction(req, res);
    });

    // Front-end authentication, destroys session on valid authentication
    app.get("/api/v2/logout", function (req, res) {
        logoutAction(req, res);
    });

};