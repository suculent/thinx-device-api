const Util = require("../thinx/util");
const Sanitka = require("../thinx/sanitka"); const sanitka = new Sanitka();

module.exports = function (app) {
  return function requireAdmin(req, res, next) {
    if (!Util.validateSession(req)) return res.status(401).end();
    const owner = sanitka.owner(req.session.owner);
    if (typeof (owner) === "undefined") return res.status(401).end();
    app.owner.profile(owner, (success, profile) => {
      if (!success || !profile || profile.admin !== true) {
        return res.status(403).end();
      }
      next();
    });
  };
};
