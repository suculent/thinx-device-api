// /api/v2/apikey

const APIKey = require("../lib/thinx/apikey"); var apikey = new APIKey();
const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();

const sha256 = require("sha256");

module.exports = function (app) {

  function setAPIKey(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = sanitka.owner(req.session.owner);

    if (typeof (req.body.alias) === "undefined") {
      Util.respond(res, {
        success: false,
        status: "missing_alias"
      });
      return;
    }

    var new_api_key_alias = req.body.alias;

    apikey.create(owner, new_api_key_alias, (success, all_keys) => {
      if (success) {
        if (all_keys.length == 0) {
          console.log(`[error] Creating API key ${new_api_key_alias} for ${owner} failed!`);
          Util.respond(res, {
            success: false
          });
        } else {
          let item_index = all_keys.length - 1;
          let object = all_keys[item_index];
          console.log(`ℹ️ [info] Created API key ${new_api_key_alias}`);
          Util.respond(res, {
            success: success,
            api_key: object.key,
            hash: sha256(object.key)
          });
        }
      }
    });
  }

  function revokeAPIKey(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = sanitka.owner(req.session.owner);
    var api_key_hashes = [];

    if (typeof (req.body.fingerprint) !== "undefined") {
      api_key_hashes = [req.body.fingerprint];
    }

    if (typeof (req.body.fingerprints) !== "undefined") {
      api_key_hashes = req.body.fingerprints;
    }

    apikey.revoke(owner, api_key_hashes, (success, deleted_keys) => {
      if (success) {
        Util.respond(res, {
          revoked: deleted_keys,
          success: true
        });
      } else {
        Util.respond(res, {
          success: false,
          status: "revocation_failed"
        });
      }
    });
  }

  function listAPIKeys(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = sanitka.owner(req.session.owner);

    apikey.list(owner, (keys) => {
      Util.respond(res, {
        success: true,
        api_keys: keys
      });
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