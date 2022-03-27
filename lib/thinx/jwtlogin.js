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
        this.initialized = false;
        this.secretkey = null; // class could be per-user
    }

    // Private Functions

    // JWT Implementation requires a JWT_SECRET_KEY value, which should be random on start,
    // but should allow decoding valid tokens between app restarts. Therefore it's stored in Redis.

    createSecretKey(callback) {
        require('crypto').randomBytes(48, (ex, buf) => {
            let new_key = buf.toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
            callback(new_key);
        });
    }

    // Should be called after each restart; sessions will die but security in case of app in exception will be reset
    resetSecretKey(callback) {
        this.createSecretKey((key) => {
            this.client.set(JWT_KEY, key, (/* err, result */) => {
                callback(key);
            });
        });
    }

    fetchOrCreateSecretKey(callback) {
        this.client.get(JWT_KEY, (err, result) => {
            if ((err !== null) || (result == null)) {
                this.createSecretKey((key) => {
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
        if ((typeof (this.secretkey) === "undefined") || (this.secretkey === null)) {
            this.fetchOrCreateSecretKey((secretkey) => {
                this.secretkey = secretkey;
                this.initialized = true;
                callback(secretkey);
            });
        } else {
            callback(secretkey);
        }
    }

    // Step 2: Sign

    sign(_username, _owner_id, callback) {

        const username = sanitka.username(_username);
        const owner_id = sanitka.username(_owner_id);

        this.fetchOrCreateSecretKey((secretkey) => {

            console.log("Fetched or created secret key", secretkey);

            let payload = {
                username: username,
                owner: owner_id,
                scope: '/api/',
                exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
            };

            let options = { algorithm: 'HS512' }; // should be taken from config, not hardcoded

            let cb = (err, jwt_token) => {
                if (err) console.log(err);
                callback(jwt_token);
            };

            jwt.sign(payload, secretkey, options,  cb );
        });
    }

    // Step 3: Verify

    verify_impl(req, callback) {
        let token = req.headers['Authorization'].split(' ')[1];
        token = token.replace("Bearer ", "");

        let options = { algorithm: 'HS512' }; // should be taken from config, not hardcoded

        let sck = this.secretkey;

        console.log("[jwt] verify_impl with", {token}, {sck}, {options}, {callback});

        jwt.verify(
            token,
            this.secretkey,
            options, // should be taken from config, not hardcoded
            callback
        );
    }

    verify(req, callback) {
        console.log("[jwt] verify with req", {req});
        if (typeof(req.headers['Authorization']) === "undefined") {
            console.log("[jwt] req.headers.authorization undefined...");
            callback(false);
        }
        if (this.initialized === false) {
            console.log("[jwt] not init yet...");
            this.init(() => {
                console.log("[jwt] init, running impl...");
                this.verify_impl(req, callback);
            });
        } else {
            console.log("[jwt] running impl...");
            this.verify_impl(req, callback);
        }
    }

};
