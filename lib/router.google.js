// /api/v2/oauth/google

const Globals = require("./thinx/globals");
const Database = require("../lib/thinx/database.js");

let db_uri = new Database().uri();
const prefix = Globals.prefix();
var userlib = require("nano")(db_uri).use(prefix + "managed_users");

var AuditLog = require("../lib/thinx/audit");
var alog = new AuditLog();

const https = require('https');
const sha256 = require("sha256");
const oauthReturn = require("./thinx/oauth_return");

const app_config = Globals.app_config(); // public_url and public_url but it is the same now

//
// OAuth2 for Google
//

const google_ocfg = Globals.google_ocfg();

const oAuthConfig = {
  client: {
    id: process.env.GOOGLE_OAUTH_ID,
    secret: process.env.GOOGLE_OAUTH_SECRET
  },
  auth: {
    authorizeHost: 'https://accounts.google.com',
    authorizePath: '/o/oauth2/v2/auth',
    tokenHost: 'https://www.googleapis.com',
    tokenPath: '/oauth2/v4/token'
  }
};

const { AuthorizationCode } = require('simple-oauth2');

module.exports = function (app) {

  let redis_client = app.redis_client;

  var user = app.owner;

   /*
   * OAuth 2 with Google
   */

  function createUserWithGoogle(req, ores, odata, userWrapper, access_token) {
    console.log("[google] Creating new user...");

    // No e-mail to validate.
    let will_require_activation = true;
    if (typeof (odata.email) === "undefined") {
      will_require_activation = false;
    }

    // No such owner, create...
    user.create(userWrapper, will_require_activation, ores, (/*res, success, status*/) => {

      console.log("[OID:" + req.session.owner + "] [NEW_SESSION] [oauth] 2860:");

      alog.log(req.session.owner, "OAuth User created: " + userWrapper.given_name + " " + userWrapper.family_name);

      // This is weird. Token should be random and with prefix.
      const token = sha256(access_token.token.access_token); // "o:"+
      app.redis_client.set(token, JSON.stringify(userWrapper));
      app.redis_client.expire(token, 3600);

      // New account: consent not yet given -> g=false so the console shows the
      // GDPR consent gate before logging in.
      const ourl = oauthReturn.returnURLFor(oauthReturn.takeReturnOrigin(req, ores), token, false);
      console.log("OURL", ourl);
      console.log("Redirecting to:", ourl);
      ores.redirect(ourl);
    });
  }

  // processGoogleCallbackError only
  function failOnDeletedAccountDocument(error, ores) {
    // User does not exist
    if (error.toString().indexOf("Error: deleted") !== -1) {
      // Redirect to error page with reason for deleted documents
      console.log("[processGoogleCallbackError][oauth] user document deleted");
      ores.redirect(app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=account_doc_deleted');
      return true;
    }
    return false;
  }

  // processGoogleCallbackError only
  function failOnDeletedAccount(udoc, ores) {
    if (typeof (udoc) === "undefined") return false;
    if ((typeof (udoc.deleted) !== "undefined") && udoc.deleted === true) {
      console.log("[processGoogleCallbackError][oauth] user account marked as deleted");
      ores.redirect(
        app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=account_deleted'
      );
      return true;
    }
    return false;
  }

  // from userWrapper, this uses owner and createUserWithGoogle uses whole wrapper to create a user object (only if udoc does not exist),
  // and to store it in redis with token temporarily to allow login without accessing the CouchDB
  function processGoogleCallbackError(error, ores, udoc, req, odata, userWrapper, access_token) {

    if (failOnDeletedAccountDocument(error, ores)) return;
    if (failOnDeletedAccount(udoc, ores)) return;

    // In case the document is undefined (and identity confirmed by Google), create new one...
    if (typeof (udoc) === "undefined" || udoc === null) {
      console.log("Setting session owner from Google User Wrapper...");
      req.session.owner = userWrapper.owner;
      console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on UserWrapper /login");
      createUserWithGoogle(req, ores, odata, userWrapper, access_token);
    }
  }

  function needsGDPR(doc) {
    // Returns true when the user has ALREADY consented (the &g flag then tells the
    // console to skip the consent page). Keyed on gdpr_consent alone: the old
    // additional doc.info requirement re-prompted a consented user with no info
    // doc on every login.
    return (typeof (doc.gdpr_consent) !== "undefined" && doc.gdpr_consent === true);
  }

  // Routes are same for API v1 and v2

  // Initial page redirecting to OAuth2 provider.
  // Mounted under both /api and /api/v2 — the Vue console builds OAuth URLs from
  // the /api/v2 base (parity with the dual-mounted /login + /logout routes).
  app.get(['/api/oauth/google', '/api/v2/oauth/google'], function (req, res) {
    // User requested login, destroy existing session first...
    if (typeof (req.session) !== "undefined") {
      req.session.destroy();
    }
    // Remember an allowlisted console origin (e.g. the Vue console) so the
    // callback can return the user there instead of the legacy auth.html.
    oauthReturn.rememberReturnOrigin(req, res);
    require("crypto").randomBytes(48, (_err, buffer) => {
      var token = buffer.toString('hex');
      redis_client.set("oa:google:" + token, token); // one-shot state marker, auto-expires in 1 minute
      redis_client.expire("oa:google:" + token, 60);

      const client = new AuthorizationCode(oAuthConfig);

      const authorizationUri = client.authorizeURL({
        redirect_uri: google_ocfg.web.redirect_uris[0],
        scope: 'email',
        state: sha256(token) // returned upon auth provider call back
      });
      res.redirect(authorizationUri);
    });
  });

  app.get(['/api/oauth/google/callback', '/api/v2/oauth/google/callback'], async (req, res) => {

    const code = req.query.code;
    if (typeof (code) !== "string") {
      res.set(403).end();
      return;
    } else {
      if (code.length > 255) {
        res.set(403).end();
        return; // should not DoS the regex now; lgtm [js/type-confusion-through-parameter-tampering]
      }
    }

    const tokenParams = {
      code: code,
      redirect_uri: google_ocfg.web.redirect_uris[0],
      scope: 'email',
    };

    const client = new AuthorizationCode(oAuthConfig);
    let accessToken;

    try {
      accessToken = await client.getToken(tokenParams);
    } catch (error) {
      console.log('Access Token Error', error.message);
      res.set(400).end();
      return;
    }

    let gat_url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + accessToken.token.access_token;

    https.get(gat_url, (res3) => {

      let data = '';
      res3.on('data', (chunk) => { data += chunk; });
      res3.on('end', () => {

        const odata = JSON.parse(data);
        const email = odata.email;

        if (typeof (email) === "undefined") {
          res.redirect(
            app_config.public_url + '/error.html?success=failed&title=Sorry&reason=' +
            'E-mail missing.'
          );
          return;
        }

        const family_name = odata.family_name;
        const given_name = odata.given_name;
        const owner_id = sha256(prefix + email);

        var userWrapper = {
          first_name: given_name,
          last_name: family_name,
          email: email,
          owner: owner_id,
          username: owner_id
        };

        // Check user and make note on user login
        userlib.get(owner_id,  (error, udoc) => {

          if (error) {
            // may also end-up creating new user
            processGoogleCallbackError(error, res, udoc, req, odata, userWrapper, accessToken);
            return;
          }
          console.log(`ℹ️ [info] Calling trackUserLogin on Google Auth Callback...`);
          user.trackUserLogin(owner_id);
          console.log(`ℹ️ [info] Calling updateLastSeen on Google Auth Callback...`);
          user.updateLastSeen(udoc, false);
          alog.log(owner_id, "OAuth2 User logged in...");
          var token = sha256(accessToken.token.access_token);
          redis_client.set(token, JSON.stringify(userWrapper));
          redis_client.expire(token, 3600);
          const ourl = oauthReturn.returnURLFor(oauthReturn.takeReturnOrigin(req, res), token, needsGDPR(udoc)); // require GDPR consent
          res.redirect(ourl);
        });
      });
    }).on("error", (err) => {
      console.log("Error: " + err.message);
      // deepcode ignore OR: there is noting injected in the URL
      res.redirect(app_config.public_url + '/error.html?success=failed&title=OAuth-Error&reason=' + err.message);
    });

  });

};
