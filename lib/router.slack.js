// /api/v2/slack

const Globals = require("./thinx/globals");
const app_config = Globals.app_config();
const https = require('https');
const typeOf = require("typeof");

module.exports = function (app) {

    // This is not missing anywhere... what is it supposed to do?
    // var thinx_slack = require("slack-notify")(app_config.slack.webhook);

    /*
     * Slack OAuth Integration
     */

    // TODO: Convert SLACK_CLIENT_ID to env-var and configure externally so it does not reside in cleartext config flatfil
    app.get("/api/slack/direct_install", (req, res) => {
        const slack_client_id = app_config.slack.client_id || null;
        res.redirect(
            "https://slack.com/oauth/authorize?client_id=" + slack_client_id + "&scope=bot&state=Online&redirect_uri=" + app_config.api_url + "/api/slack/redirect"
        );
    });

    app.get("/api/slack/redirect", (req, xres) => {

        console.log("[debug] [slack] Redirect URL: " + JSON.stringify(req.url));
        console.log("[debug] [slack] Redirect Code: " + req.query.code);
        console.log("[debug] [slack] Redirect State: " + req.query.state);

        const slack_client_secret = app_config.slack.client_secret || null;
        const slack_client_id = app_config.slack.client_id || null;

        var options = {
            protocol: 'https:',
            host: 'slack.com',
            hostname: 'slack.com',
            port: 443,
            path: '/api/oauth.access?client_id=' + slack_client_id + '&client_secret=' + slack_client_secret + '&redirect_uri=' + app_config.api_url + '/slack/redirect&scope=bot&code=' +
                req.query.code
        };

        var areq = https.get(options, function (res) {

            // console.log("[debug] [slack] /redirect GET status", res.statusCode); == 200

            var bodyChunks = [];
            if (typeof (res) === "undefined" || (res == null) || res.statusCode == 403) {
                console.log("[debug] [slack] No response.");
                return;
            }

            res.on('data', function (chunk) {
                if (typeOf(chunk) !== "number") {
                    bodyChunks.push(chunk);
                }

            }).on('end', function () {
                var body = Buffer.concat(bodyChunks);
                console.log('[debug] [slack] Incoming BODY: ' + body);
                // can be {"ok":false,"error":"invalid_code"}

                // ...and/or process the entire body here.
                try {
                    var auth_data = JSON.parse(body);
                    if (!auth_data.ok) {
                        console.log("[warning] OAuth login failed", { auth_data });
                        return;
                    }
                    var token = auth_data.bot_access_token;
                    if (typeof (token) !== "undefined") {
                        app.redis_client.set("__SLACK_BOT_TOKEN__", token);
                        console.log(`ℹ️ [info] Saving new Bot token ${token}`);
                    }
                    // may also return {"ok":false,"error":"invalid_code"} in test
                } catch (e) {
                    console.log("[error] parsing Slack token");
                    return;
                }
            });
        });

        areq.on('error', function (e) {
            console.log('[debug] [slack] ERROR: ' + e.message);
        });

        xres.redirect(
            "https://" + process.env.WEB_HOSTNAME + "/app/#/profile/help"
        );

    });

};