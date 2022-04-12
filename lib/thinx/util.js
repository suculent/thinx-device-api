// Shared Router Methods

const Sanitka = require("./sanitka"); var sanitka = new Sanitka();

module.exports = class Util {

    ///////////////////////////////////////////////////////////////////////
    //
    // DEVICE ROUTES
    //

    ownerFromRequest(req) {
        let owner = sanitka.owner(req.session.owner);
        var body = req.body;
        if ((typeof (owner) === "undefined") || (owner === null)) {
            owner = body.owner;
        }
        return owner;
    }

    responder(res, success, message) {
        res.header("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
            success: success,
            status: message
        }));
    }

    validateSession(req) {

        // OK if request has JWT authorization (was already checked in app.all("/*"))
        if ((typeof (req.headers['authorization']) !== "undefined") || (typeof (req.headers['Authorization']) !== "undefined")) {
          return true;
        }
    
        let sess = req.session;
    
        // OK if request session has internally set owner
        if (typeof (sess) !== "undefined") {
          if (typeof (sess.owner) !== "undefined") {
            return true;
          }
        }
    
        // OK if request has owner_id and api_key that has been previously validated
        if (typeof (req.body) !== "undefined") {
          if ((typeof (req.body.owner_id) !== "undefined") && (typeof (req.body.api_key) !== "undefined")) {
            return true;
          }
        }
    
        if (process.env.ENVIRONMENT == "test") {
          // log only in test when required; it may be dangerous log flood in production
          // console.log("⚠️ [warning] Session is invalid with headers", JSON.stringify(req.headers), "and session", req.session);
        }
    
        sess.destroy(function (err) {
          if (err) {
            console.log("☣️ [error] Session destroy error: " + JSON.stringify(err));
          }
        });
    
        // No session, no API-Key auth, rejecting...
        return false;
      }
};