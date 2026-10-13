// GitHub APIs Implementation
const https = require('node:https');
const gitKeysURL = "https://api.github.com/user/keys";

// 45-REVIEW CR-01: these requests carry the user's GitHub token in an Authorization
// header, and GitHub's error bodies can echo request data. Never log the options, the
// headers, the request body or the response body: method, path and status only, and a
// transport error by its code.
function logRequest(method, path, status) {
    console.log(`[github] ${method} ${path} ${status}`);
}

function errorCode(e) {
    return (e && typeof e.code === "string") ? e.code : "request_error";
}

// JSON body or null; a non-JSON answer (a proxy error page) must not throw in 'end'.
function parseBody(data) {
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

module.exports = class GitHub {

    // check with GitHub if the added access token is valid 
    static validateAccessToken(token, callback) {

        let options = {
            headers: {
                "User-Agent": "THiNX API",
                "Authorization": "Bearer " + token,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        };

        https.get(gitKeysURL, options, (res) => {
            let data = "";
            res.on('data', (d) => {
                data += d;
            });
            res.on('end', () => {
                logRequest("GET", "/user/keys", res.statusCode);
                let json_data = parseBody(data);
                if (res.statusCode == 200 && json_data !== null) {
                    callback(true, json_data);
                } else {
                    callback(false);
                }
            });
        }).on('error', (e) => {
            console.log(`[github] GET /user/keys failed: ${errorCode(e)}`);
            callback(false, e);
        });
    }

    static processPublicKeyRequest(res, callback) {
        let data = "";

        res.on('data', (d) => {
            data += d;
        });

        res.on('end', () => {
            logRequest("POST", "/user/keys", res.statusCode);
            let json_data = parseBody(data) || {};
            let valid_state = false;
            if ((json_data.error) && (json_data.errors.message === "key is already in use")) valid_state = true;
            if (res.statusCode === 201) valid_state = true;
            if (res.statusCode === 422) valid_state = true;
            callback(valid_state, json_data); // should not respond directly but be parsed, validated and only enumerated errors should be  returned intentionally 
        });

        res.on('error', (e) => {
            console.log(`[github] POST /user/keys response failed: ${errorCode(e)}`);
            callback(false, e);
        });
    }

    static addPublicKey(token, key, callback) {

        let options = {
            method: 'POST',
            hostname: 'api.github.com',
            port: 443,
            path: '/user/keys',
            headers: {
                "User-Agent": "THiNX API",
                "Authorization": "Bearer " + token,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        };

        let body = JSON.stringify({
            title: "THiNX Key",
            key: key
        });

        let req = https.request(options, (res) => {
            GitHub.processPublicKeyRequest(res, callback);
        }).on('error', (e) => {
            console.log(`[github] POST /user/keys failed: ${errorCode(e)}`);
            callback(false, e);
        });

        req.write(body);
        req.end();
    }
};