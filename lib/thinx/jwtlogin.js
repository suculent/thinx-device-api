/*
 * This THiNX Login Helper used by router as JWT implementation.
 * Requires application's Redis instance to generate and keep secret key between restarts.
 * THREAT ANALYSIS: If this secret key leaks, it could lead to breaking whole system security. 
 */

const jwt = require("jsonwebtoken");

const JWT_KEY = "__JWT_SECRET__";

let jwt_options = { algorithm: 'HS512' }; // should be taken from config, not hardcoded
module.exports = class JWTLogin {

    // Static Constructor

    constructor(redis) {
        this.redis = redis;
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
            this.redis.set(JWT_KEY, key, (/* err, result */) => {
                callback(key);
            });
        });
    }

    revokeSecretKey(callback) {
        this.redis.del(JWT_KEY, (err) => {
            callback(err);
        });
    }

    fetchOrCreateSecretKey(callback) {
        this.redis.get(JWT_KEY, (err, result) => {
            if ((err !== null) || (result == null)) {
                this.createSecretKey((key) => {
                    this.redis.set(JWT_KEY, key); // could use error callback
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
            callback(this.secretkey);
        }
    }

    // Step 2: Sign

    sign(uid, callback) {

        // uid = username or owner_id

        this.fetchOrCreateSecretKey((secretkey) => {

            console.log("Fetched or created secret key", secretkey);

            let payload = {
                username: uid,
                scope: '/api/',
                exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
            };

            let cb = (err, jwt_token) => {
                if (err) console.log(err);
                callback(jwt_token);
            };

            jwt.sign(payload, secretkey, jwt_options,  cb );
        });
    }

    // Step 3: Verify

    verify_impl(req, callback) {
        let token = req.headers['Authorization'].split(' ')[1];
        token = token.replace("Bearer ", "");
        
        let sck = this.secretkey;

        jwt.verify(
            token,
            sck,
            jwt_options, // should be taken from config, not hardcoded
            callback
        );
    }

    verify(req, callback) {
        // guard
        if (typeof(req.headers['Authorization']) === "undefined") {
            callback(false);
        }
        // key guard
        if (this.initialized === false) {
            this.init(() => {
                // retry
                this.verify_impl(req, callback);
            });
        } else {
            // try
            this.verify_impl(req, callback);
        }
    }

};
