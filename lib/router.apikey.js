// /api/v2/apikey

const APIKey = require("../lib/thinx/apikey");
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); 

let sanitka = new Sanitka();

const sha256 = require("sha256");

module.exports = function (app) {

  let apikey = new APIKey(app.redis_client);

  // SEC-CSRF-05 / D-11: credential mutations need the session-bound token.
  const csrf = require("./middleware/csrf")(app);

  function setAPIKey(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = sanitka.owner(req.session.owner);

    if (!Util.isDefined(req.body)) return Util.responder(res, false, "missing_body");
    if (!Util.isDefined(req.body.alias)) return Util.responder(res, false, "missing_alias");
    if (!Util.isDefined(owner)) return Util.responder(res, false, "missing_owner");

    apikey.create(owner, req.body.alias, (success, all_keys) => {
      if (!success || !Array.isArray(all_keys) || (all_keys.length === 0)) {
        const reason = (typeof (all_keys) === "string") ? ` (${all_keys})` : "";
        console.log(`[error] Creating API key ${req.body.alias} for ${owner} failed${reason}`);
        return Util.responder(res, false, "set_api_key_failed");
      }
      // create() answers the whole store with the new key LAST.
      const created = all_keys[all_keys.length - 1];
      if ((created === null) || (typeof (created) !== "object") || (typeof (created.key) !== "string") || (created.key.length === 0)) {
        console.log(`[error] Creating API key ${req.body.alias} for ${owner} failed (created_key_missing)`);
        return Util.responder(res, false, "set_api_key_failed");
      }
      // The key is returned once here and never again: list() exports no key (quick 261003-w13).
      const response = {
        api_key: created.key,
        hash: sha256(created.key)
      };
      console.log(`ℹ️ [info] Created API key ${req.body.alias} for ${owner} (${Util.redactToken(response.hash)})`);
      Util.responder(res, success, response);
    });
  }

  function revokeAPIKey(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = sanitka.owner(req.session.owner);
    var api_key_hashes = [];

    if (Util.isDefined(req.body.fingerprint)) api_key_hashes = [req.body.fingerprint];
    if (Util.isDefined(req.body.fingerprints)) api_key_hashes = req.body.fingerprints;

    apikey.revoke(owner, api_key_hashes, (success, deleted_keys) => {
      if (!success) return Util.responder(res, false, "revocation_failed");
      Util.responder(res, true, deleted_keys);
    });
  }

  function listAPIKeys(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    apikey.list(sanitka.owner(req.session.owner), (keys) => {
      Util.responder(res, true, keys);
    });
  }

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v1
  //

  /* Creates new API Key. */
  app.post("/api/user/apikey", csrf.verifyCsrfToken, function (req, res) {
    setAPIKey(req, res);
  });

  /* Deletes API Key by its hash value */
  app.post("/api/user/apikey/revoke", csrf.verifyCsrfToken, function (req, res) {
    revokeAPIKey(req, res);
  });

  /* Lists all API keys for user. */
  app.get("/api/user/apikey/list", function (req, res) {
    listAPIKeys(req, res);
  });

  ///////////////////////////////////////////////////////////////////////
  // API ROUTES v2
  //

  /* Creates new API Key. */
  app.post("/api/v2/apikey", csrf.verifyCsrfToken, function (req, res) {
    setAPIKey(req, res);
  });

  /* Deletes API Key by its hash value */
  app.delete("/api/v2/apikey", csrf.verifyCsrfToken, function (req, res) {
    revokeAPIKey(req, res);
  });

  /* Lists all API keys for user. */
  app.get("/api/v2/apikey", function (req, res) {
    listAPIKeys(req, res);
  });

};