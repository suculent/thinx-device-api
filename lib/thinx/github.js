// GitHub APIs Implementation
const https = require('node:https');
const gitKeysURL = "https://api.github.com/user/keys";

module.exports = class GitHub {

    // check with GitHub if the added access token is valid 
    static validateAccessToken(token, callback) {

        let options = {
            headers: {
                "User-Agent": "THiNX API",
                "Authorization": "token " + token,
                "Accept": "application/vnd.github.v3+json"
            }
        };

        https.get(gitKeysURL, options, (res) => {

            let data = "";

            res.on('data', (d) => {
                data += d;
            });

            res.on('end', () => {
                let json_data = JSON.parse(data);
                if (res.statusCode == 200) {
                    callback(true, json_data);
                } else {
                    callback(false);
                }
            });

        }).on('error', (e) => {
            console.error(e);
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
                "Authorization": "token " + token,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/vnd.github.v3+json"
            }
        }

        let body = JSON.stringify({
            title: "THiNX Key",
            key: key
        });

        console.log("calling request", options, body);

        let req = https.request(options, (res) => {

            console.log('statusCode:', res.statusCode);
            console.log('headers:', res.headers);

            let data = "";

            res.on('data', (d) => {
                data += d;
                console.log(d);
            });

            res.on('end', () => {
                let json_data = JSON.parse(data);
                let valid_state = false;
                if (json_data.error) {
                    if (json_data.errors.message === "key is already in use") {
                        // OK
                        valid_state = true;
                    }
                }
                if (res.statusCode === 201) {
                    // OK
                    valid_state = true;
                }
                if (res.statusCode === 422) {
                    // OK
                    valid_state = true;
                }
                callback(valid_state, json_data); // should not respond directly but be parsed, validated and only enumerated errors should be  returned intentionally 
            });

            res.on('error', (e) => {
                console.log("error", e);
                callback(false, e);
            });
        }).on('error', (e) => {
            console.error(e);
            callback(false, e);
        });

        req.write(body);
        req.end();


    }
};