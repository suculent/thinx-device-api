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
};