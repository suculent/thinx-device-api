// GitHub APIs Implementation
const https = require('node:https');
// per_page=100: github_link reads this list to confirm a key "already in use" (WR-01).
const gitKeysURL = "https://api.github.com/user/keys?per_page=100";

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

// GitHub's 422 for a key that is registered anywhere on GitHub: this account, another
// account or a repository deploy key. `errors` is an array (45-REVIEW WR-01).
function isKeyInUse(json_data) {
    if (!json_data || !Array.isArray(json_data.errors)) return false;
    return json_data.errors.some((e) => e && typeof e.message === "string" &&
        e.message.trim().toLowerCase() === "key is already in use");
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

    /**
     * callback(pushed, { status, result }): pushed is true only for 201 (result "created").
     * A 422 "key is already in use" gives (false, "already_in_use"): GitHub says that for a
     * key on any account, so only the caller, with this account's key list, can tell whether
     * the key is really present. Anything else is (false, "rejected"), a transport failure
     * (false, "error") with status null. No response body is passed on (45-REVIEW WR-01).
     */
    static processPublicKeyRequest(res, callback) {
        let data = "";
        let answered = false;
        const answer = (pushed, status, result) => {
            if (answered) return;
            answered = true;
            callback(pushed, { status: status, result: result });
        };

        res.on('data', (d) => {
            data += d;
        });

        res.on('end', () => {
            logRequest("POST", "/user/keys", res.statusCode);
            if (res.statusCode === 201) return answer(true, 201, "created");
            if (res.statusCode === 422 && isKeyInUse(parseBody(data))) return answer(false, 422, "already_in_use");
            answer(false, res.statusCode, "rejected");
        });

        res.on('error', (e) => {
            console.log(`[github] POST /user/keys response failed: ${errorCode(e)}`);
            answer(false, null, "error");
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
            callback(false, { status: null, result: "error" });
        });

        req.write(body);
        req.end();
    }
};