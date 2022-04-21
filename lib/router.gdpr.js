// /api/v2/ GDPR router

const Devices = require("./thinx/devices");
const Database = require("./thinx/database");
const Globals = require("./thinx/globals");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
var APIEnv = require("../lib/thinx/apienv"); var apienv = new APIEnv();
const Util = require("./thinx/util");

let db_uri = new Database().uri();
const prefix = Globals.prefix();
var userlib = require("nano")(db_uri).use(prefix + "managed_users");

var User = require("../lib/thinx/owner"); var user = new User();

module.exports = function (app) {

    var devices = new Devices(app.messenger);
    var redis_client = app.redis_client;

    function revokeGDPR(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();

        var owner_id = sanitka.owner(req.session.owner);
        if ((owner_id === false) || (req.body.owner !== owner_id)) {
            return Util.responder(res, false, "deletion_not_confirmed");
        }

        userlib.get(owner_id, function (error, udoc) {
            if (error) {
                console.log("unexpected /gdpr/revoke error");
                return Util.responder(res, false, "unexpected error");
            }

            console.log("Deleting owner " + owner_id);
            devices.list(owner_id, (dsuccess, devicez) => {
                if (!dsuccess) {
                    return Util.responder(res, dsuccess, devicez);
                }
                devicez.forEach(() => {
                    devicez.revoke(owner_id, req.body, function (rsuccess, status) {
                        return (rsuccess, status);
                    });
                }).then((rsuccess, status) => {
                    Util.responder(res, rsuccess, status);
                }).catch(e => {
                    console.log("revokeGDPR error", e);
                });
            });

            console.log("Deleting all API keys for this owner...");
            redis_client.expire("ak:" + owner_id, 1);

            redis_client.keys("/" + owner_id + "/*", function (_err, obj_keys) {
                console.dir("Deleting Redis cache for this owner: " + owner_id);
                for (var key in obj_keys) redis_client.expire(key, 1);
            });

            userlib.destroy(udoc._id, udoc._rev, function (err) {
                if (err) {
                    Util.responder(res, false, "Your data deletion failed. Personal data may NOT been deleted successfully. Please contact THiNX data processor in order to fix this GDPR issue for you.");
                } else {
                    Util.responder(res, true, "Your personal data has been marked as deleted. It will be removed from the system completely on midnight.");
                }
            });
        });
    }

    function transferGDPR(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();

        var owner_id = sanitka.owner(req.session.owner);
        if (owner_id === null) {
            return Util.responder(res, false, "invalid owner");
        }
        userlib.get(owner_id, function (error, udoc) {
            if (error) {
                console.log("/api/gdpr/transfer error", error);
                return Util.responder(res, false, "unexpected error");
            }
            devices.list(owner_id, function (dsuccess, ddevices) {
                apienv.list(owner_id, function (esuccess, envs) {
                    Util.responder(res, (!error && dsuccess && esuccess),
                        {
                            user_data: udoc,
                            device_data: ddevices,
                            environment: envs
                        }
                    );
                });
            });
        });
    }

    function setGDPR(req, res) {
        var gdpr_consent = req.body.gdpr;
        var token = req.body.token;

        if (typeof (gdpr_consent) === "undefined" || gdpr_consent === null) {
            res.status(400);
            return Util.responder(res, false, "consent_missing");
        }

        if (typeof (token) === "undefined" || token === null) {
            console.log("[debug] request is missing token");
            res.status(401);
            return Util.responder(res, false, "token_missing");
        }

        redis_client.get(token, function (err, userWrapper) {

            if (err) {
                console.log("[oauth][gdpr] takeover failed with error", err);
                return Util.failureResponse(res, 403, "unauthorized");
            }

            var wrapper = JSON.parse(userWrapper);
            if (typeof (wrapper) === "undefined" || wrapper === null) {
                console.log("Not found wrapper", userWrapper, "for token", token);
                return Util.responder(res, false, "handover_failed");
            }

            const owner_id = wrapper.owner;
            console.log("[login][oauth] fetching owner: " + owner_id);

            // eslint-disable-next-line no-unused-vars
            userlib.get(owner_id, function (gerr, _doc) {
                if (gerr) return Util.responder(res, false, "gdpr_consent_failed");
                    
                var changes = {
                    gdpr_consent: req.body.gdpr_consent
                };

                // Mark user document as deleted with this change in case of no consent
                if (gdpr_consent === false) {
                    changes['delete'] = true;
                }

                // Edit and save user's GDPR consent
                user.update(owner_id, req.body, function (success, status) {
                    console.log("Updating GDPR settings...");
                    Util.responder(res, success, status);
                });
            
            });
        });
    }


    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.put("/api/v2/gdpr", function (req, res) {
        setGDPR(req, res);
    });

    app.delete("/api/v2/gdpr", function (req, res) {
        revokeGDPR(req, res);
    });

    app.post("/api/v2/gdpr", function (req, res) {
        transferGDPR(req, res);
    });


    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    /* Use to issue/withdraw GDPR consent, does not require valid session while the one-shot token is known. */
    app.post('/api/gdpr', function (req, res) {
        setGDPR(req, res);
    });

    /* Used to transfer user data to user in compliance with GDPR. */
    app.post('/api/gdpr/transfer', function (req, res) {
        transferGDPR(req, res);
    });

    /* Used to revoke user data in compliance with GDPR. */
    app.post('/api/gdpr/revoke', function (req, res) {
        revokeGDPR(req, res);
    });

};