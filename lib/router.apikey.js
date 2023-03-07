// /api/v2/apikey

const APIKey = require("../lib/thinx/apikey");
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); 

let sanitka = new Sanitka();

const sha256 = require("sha256");

module.exports = function (app) {

  let apikey = new APIKey(app.redis_client);

  function setAPIKey(req, res) {

    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = sanitka.owner(req.session.owner);

    if (!Util.isDefined(req.body)) return Util.responder(res, false, "missing_body");
    if (!Util.isDefined(req.body.alias)) return Util.responder(res, false, "missing_alias");
    if (!Util.isDefined(owner)) return Util.responder(res, false, "missing_owner");

    apikey.create(owner, req.body.alias, (success, all_keys) => {
      if (!success || (all_keys.length == 0)) {
        console.log(`[error] Creating API key ${req.body.alias} for ${owner} failed!`);
        return Util.responder(res, false, "set_api_key_failed");
      }
      let item_index = all_keys.length - 1; // takes always last key, is this correct? the alias should be validated
      let object = all_keys[item_index];
      console.log(`ℹ️ [info] Created API key ${req.body.alias}`);
      const response = {
        api_key: object.key,
        hash: sha256(object.key)
      };
      console.log(`ℹ️ [info] Created API key ${req.body.alias}`);
      console.log(`ℹ️ [debug] Responding with (REMOVEME) ${JSON.stringify(response)}`);
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
  app.post("/api/user/apikey", function (req, res) {
    setAPIKey(req, res);
  });

  /* Deletes API Key by its hash value */
  app.post("/api/user/apikey/revoke", function (req, res) {
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
  app.post("/api/v2/apikey", function (req, res) {
    setAPIKey(req, res);
  });

  /* Deletes API Key by its hash value */
  app.delete("/api/v2/apikey", function (req, res) {
    revokeAPIKey(req, res);
  });

  /* Lists all API keys for user. */
  app.get("/api/v2/apikey", function (req, res) {
    listAPIKeys(req, res);
  });

};