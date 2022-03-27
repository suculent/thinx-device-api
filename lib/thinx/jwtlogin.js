/*
 * This THiNX Login Helper used by router as JWT implementation.
 * Requires application's Redis instance to generate and keep secret key between restarts.
 * THREAT ANALYSIS: If this secret key leaks, it could lead to breaking whole system security. 
 */

var Globals = require("./globals.js");
var Sanitka = require("./sanitka"); var sanitka = new Sanitka();

const jwt = require("jsonwebtoken");

const JWT_KEY = "__JWT_SECRET__";

module.exports = class JWTLogin {

    // Static Constructor

    constructor(client) {
        if (typeof (client) === "undefined") {
            let options = Globals.redis_options();
            this.client = require("redis").createClient(options);
        } else {
            this.client = client;
        }
    }

    // Private Functions

    // JWT Implementation requires a JWT_SECRET_KEY value, which should be random on start,
    // but should allow decoding valid tokens between app restarts. Therefore it's stored in Redis.

    createSecretKey(callback) {
        require('crypto').randomBytes(48, function (ex, buf) {
            let new_key = buf.toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
            callback(new_key);
        });
    }

    // Should be called after each restart; sessions will die but security in case of app in exception will be reset
    resetSecretKey(callback) {
        this.createSecretKey((key) => {
            this.client.set(JWT_KEY, key, (err, result) => {
                callback(key);
            });
        });
    }

    fetchOrCreateSecretKey(callback) {
        this.client.get(JWT_KEY, function (err, result) {
            if ((err !== null) || (result == [])) {
                createSecretKey((key) => {
                    this.client.set(JWT_KEY, key);
                    callback(key);
                });
            } else {
                callback(result);
            }
        });
    }

    //
    // Usage
    //

    // Step 1: Initialize key from Redis or create new and save; separated for testability

    init(callback) {
        if ((typeof(this.secretkey) === "undefined") || (this.secretkey === null)) {
            this.fetchOrCreateSecretKey((secretkey) => {
                this.secretkey = secretkey;
                callback(true);
            });
        }
    }

    // Step 2: Sign

    sign(_username, _owner_id, callback) {

        const username = sanitka.username(_username);
        const owner_id = sanitka.username(_owner_id);

        this.fetchOrCreateSecretKey((secretkey) => {

            console.log("Fetched or created secret key", secretkey);

            let jwt_token = jwt.sign({
                username: username,
                owner: owner_id,
                scope: '/api/'
            },
                secretkey, {
                expiresIn: '7d'
            }
            );

            callback(jwt_token);

        });
    }

    // Step 3: Verify

    verify(req, callback) {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(
            token,
            this.secretkey
        );
        callback(decoded);
    }
};
