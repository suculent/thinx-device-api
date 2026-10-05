// Bearer bridge owner binding (lib/router.js, D-09).
//
// Handlers read the acting owner from req.session.owner, so a verified Bearer request
// sets it there. But the session is whatever the request's x-thx-core cookie names,
// and express-session saves it when the response ends: a sibling subdomain could plant
// its own pre-session cookie and have the victim's next Vue call write the victim's
// owner into it (25-REVIEW CR-02). So the owner is request-local: the values set here
// are put back just before express-session's own res.end wrapper saves the session.
// A session regenerated during the request (a login) is a different object and is
// left alone, and the binding never rotates the session id (login-only, SEC-CSRF-03).

const KEYS = ["owner", "impersonator_owner"];

function bindBearerOwner(req, res, owner, impersonator) {
    const sess = req.session;
    if ((typeof (sess) === "undefined") || (sess === null)) return;

    const before = {};
    for (const key of KEYS) {
        before[key] = { had: Object.prototype.hasOwnProperty.call(sess, key), value: sess[key] };
    }

    sess.owner = owner;
    if (impersonator) sess.impersonator_owner = impersonator;

    const end = res.end;
    res.end = function () {
        res.end = end;
        if (req.session === sess) {
            for (const key of KEYS) {
                if (before[key].had) {
                    sess[key] = before[key].value;
                } else {
                    delete sess[key];
                }
            }
        }
        return end.apply(this, arguments);
    };
}

module.exports = { bindBearerOwner };
