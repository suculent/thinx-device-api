// GitHub APIs Implementation
const https = require('node:https');
const logSafe = require("./logsafe");
// per_page=100: github_link reads this list to confirm a key "already in use" (WR-01).
const gitKeysURL = "https://api.github.com/user/keys?per_page=100";

// 45-REVIEW CR-01: these requests carry the user's GitHub token in an Authorization
// header, and GitHub's error bodies can echo request data. Never log the options, the
// headers, the request body or the response body: method, path and status only, and a
// transport error by its code.
function logRequest(method, path, status) {
    console.log(`[github] ${method} ${path} ${status}`);
}

// Debug aid for a non-2xx answer: only allow-listed values, never free text from GitHub.
// The message is mapped to a fixed code; scope and permission headers are logged only when
// they look like scope lists (see isScopeList), the request id only when hex.
const GITHUB_MESSAGE_CODES = [
    ["bad credentials", "bad_credentials"],
    ["resource not accessible by personal access token", "pat_lacks_permission"],
    ["resource not accessible by integration", "integration_lacks_permission"],
    ["requires authentication", "auth_required"],
    ["must have admin rights", "admin_required"],
    ["validation failed", "validation_failed"],
    ["not found", "not_found"],
    ["api rate limit exceeded", "rate_limited"]
];
function messageCode(json_data) {
    const message = (json_data && typeof json_data.message === "string") ? json_data.message.trim().toLowerCase() : "";
    if (message.length === 0) return "none";
    for (const [prefix, code] of GITHUB_MESSAGE_CODES) {
        if (message.indexOf(prefix) === 0) return code;
    }
    return "other";
}
function safeHeader(res, name, isSafe) {
    const value = res && res.headers ? res.headers[name] : undefined;
    if (typeof value !== "string" || value.length > 200 || !isSafe(value)) return "-";
    return value.length > 0 ? value : "''";
}
// A scope or permission list: items such as `read:public_key` or `keys=read`, lower-case
// letters and `_` only, so a token (mixed case, digits) can never pass.
function isScopeList(value) {
    return value.split(/[,;]/).every((item) => /^[a-z_]+(:[a-z_]+)?(=[a-z_]+)?$/.test(item.trim()) || item.trim() === "");
}
function isRequestId(value) {
    return /^[A-Fa-f0-9:]+$/.test(value);
}
// GitHub's 422 `errors[].message` mapped to fixed codes (first match wins).
function errorsCode(json_data) {
    if (!json_data || !Array.isArray(json_data.errors) || json_data.errors.length === 0) return "none";
    for (const e of json_data.errors) {
        const m = (e && typeof e.message === "string") ? e.message.trim().toLowerCase() : "";
        if (m === "key is already in use") return "key_in_use";
        if (m.indexOf("key is invalid") === 0) return "key_invalid";
    }
    return "other";
}
function diagnose(res, json_data) {
    return `message=${messageCode(json_data)} errors=${errorsCode(json_data)}` +
        ` token_scopes=${safeHeader(res, "x-oauth-scopes", isScopeList)}` +
        ` accepted_scopes=${safeHeader(res, "x-accepted-oauth-scopes", isScopeList)}` +
        ` accepted_permissions=${safeHeader(res, "x-accepted-github-permissions", isScopeList)}` +
        ` request_id=${safeHeader(res, "x-github-request-id", isRequestId)}`;
}
function logRejection(method, path, res, json_data) {
    if (res.statusCode >= 200 && res.statusCode < 300) return;
    console.log(`[github] ${method} ${path} ${res.statusCode} ${diagnose(res, json_data)}`);
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
                logRejection("GET", "/user/keys", res, json_data);
                if (res.statusCode == 200 && json_data !== null) {
                    callback(true, json_data);
                } else {
                    // The status only (403: the token lacks the SSH-key scope), no body.
                    callback(false, { status: res.statusCode });
                }
            });
        }).on('error', (e) => {
            console.log(`[github] GET /user/keys failed: ${logSafe(errorCode(e))}`);
            callback(false, e);
        });
    }

    /**
     * callback(pushed, { status, result, key_id? }): pushed is true only for 201
     * (result "created"); key_id is the created key's id, for scoped cleanup.
     * A 422 "key is already in use" gives (false, "already_in_use"): GitHub says that for a
     * key on any account, so only the caller, with this account's key list, can tell whether
     * the key is really present. Anything else is (false, "rejected"), a transport failure
     * (false, "error") with status null. No response body is passed on (45-REVIEW WR-01).
     */
    static processPublicKeyRequest(res, callback) {
        let data = "";
        let answered = false;
        const answer = (pushed, status, result, key_id) => {
            if (answered) return;
            answered = true;
            const outcome = { status: status, result: result };
            if (Number.isSafeInteger(key_id) && key_id > 0) outcome.key_id = key_id;
            callback(pushed, outcome);
        };

        res.on('data', (d) => {
            data += d;
        });

        res.on('end', () => {
            logRequest("POST", "/user/keys", res.statusCode);
            logRejection("POST", "/user/keys", res, parseBody(data));
            if (res.statusCode === 201) return answer(true, 201, "created", parseBody(data)?.id);
            if (res.statusCode === 422 && isKeyInUse(parseBody(data))) return answer(false, 422, "already_in_use");
            answer(false, res.statusCode, "rejected");
        });

        res.on('error', (e) => {
            console.log(`[github] POST /user/keys response failed: ${errorCode(e)}`);
            answer(false, null, "error");
        });
    }

    // Delete only the exact id returned by creation; never select a key by its title.
    // 404 is already absent, so cleanup is safe to retry.
    static deletePublicKey(token, key_id, callback) {
        if (!Number.isSafeInteger(key_id) || key_id <= 0) return callback(false);
        const path = "/user/keys/" + key_id;
        let answered = false;
        const answer = (success) => {
            if (answered) return;
            answered = true;
            callback(success);
        };
        const req = https.request({
            method: "DELETE",
            hostname: "api.github.com",
            port: 443,
            path,
            headers: {
                "User-Agent": "THiNX API",
                "Authorization": "Bearer " + token,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        }, (res) => {
            // Consume the response without retaining or logging its body.
            res.on("data", () => {});
            res.on("end", () => {
                logRequest("DELETE", path, res.statusCode);
                answer(res.statusCode === 204 || res.statusCode === 404);
            });
            res.on("error", () => answer(false));
        });
        req.on("error", (e) => {
            console.log(`[github] DELETE ${path} failed: ${logSafe(errorCode(e))}`);
            answer(false);
        });
        req.setTimeout(10000, () => { answer(false); req.destroy(); });
        req.end();
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
            console.log(`[github] POST /user/keys failed: ${logSafe(errorCode(e))}`);
            callback(false, { status: null, result: "error" });
        });

        req.write(body);
        req.end();
    }
};
