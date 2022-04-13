// /api/v2/oauth/google

var User = require("../lib/thinx/owner");
var user = new User();

const Globals = require("./thinx/globals");

//const Util = require("./thinx/util");
const Database = require("../lib/thinx/database.js");

let db_uri = new Database().uri();
const prefix = Globals.prefix();
var userlib = require("nano")(db_uri).use(prefix + "managed_users");

var AuditLog = require("../lib/thinx/audit");
var alog = new AuditLog();

const https = require('https');
const sha256 = require("sha256");

const app_config = Globals.app_config();

//
// OAuth2 for Google
//

const google_ocfg = Globals.google_ocfg();

const oauth2 = require('simple-oauth2').create({
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
});

module.exports = function (app) {

  let redis_client = app.redis_client;

   /*
   * OAuth 2 with Google
   */

  function createUserWithGoogle(req, ores, odata, userWrapper, access_token) {
    console.log("Creating new user...");

    // No e-mail to validate.
    var will_require_activation = true;
    if (typeof (odata.email) === "undefined") {
      will_require_activation = false;
    }

    // No such owner, create...
    user.create(userWrapper, will_require_activation, ores, (/*res, success, status*/) => {

      console.log("[OID:" + req.session.owner + "] [NEW_SESSION] [oauth] 2860:");

      alog.log(req.session.owner, "OAuth User created: " + userWrapper.given_name + " " + userWrapper.family_name);

      // This is weird. Token should be random and with prefix.
      var gtoken = sha256(access_token); // "g:"+
      redis_client.set(gtoken, JSON.stringify(userWrapper));
      redis_client.expire(gtoken, 300);
      alog.log(req.session.owner, " OAuth2 User logged in...");

      var token = sha256(access_token); // "o:"+
      redis_client.set(token, JSON.stringify(userWrapper));
      redis_client.expire(token, 3600);

      const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=true"; // require GDPR consent
      console.log(ourl);
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

  function processGoogleCallbackError(error, ores, udoc, req, odata, userWrapper, access_token) {

    if (failOnDeletedAccountDocument(error, ores)) return;
    if (failOnDeletedAccount(udoc, ores)) return;

    console.log("[processGoogleCallbackError] Userlib get OTHER error: " + error.toString());

    // In case the document is undefined (and identity confirmed by Google), create new one...
    if (typeof (udoc) === "undefined" || udoc === null) {
      console.log("Setting session owner from Google User Wrapper...");
      req.session.owner = userWrapper.owner;
      console.log("[OID:" + req.session.owner + "] [NEW_SESSION] on UserWrapper /login");
      createUserWithGoogle(req, ores, odata, userWrapper, access_token);
    }
  }

  // Routes are same for API v1 and v2

  // Initial page redirecting to OAuth2 provider
  app.get('/api/oauth/google', function (req, res) {
    // User requested login, destroy existing session first...
    if (typeof (req.session) !== "undefined") {
      req.session.destroy();
    }
    require("crypto").randomBytes(48, (err, buffer) => {
      var token = buffer.toString('hex');
      redis_client.set("oa:google:" + token, 60); // auto-expires in 1 minute; TODO: verify
      const authorizationUri = oauth2.authorizationCode.authorizeURL({
        redirect_uri: google_ocfg.web.redirect_uris[0],
        scope: 'email',
        state: sha256(token) // returned upon auth provider call back
      });
      res.redirect(authorizationUri);
    });
  });

  app.get('/api/oauth/google/callback', async (req, res) => {

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

    const options = {
      code,
      redirect_uri: google_ocfg.web.redirect_uris[0]
    };

    const result = await oauth2.authorizationCode.getToken(options);
    const accessToken = oauth2.accessToken.create(result);
    const gat_url = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=' + accessToken.token.access_token;

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

          var needsGDPR = function (doc) {
            var gdpr = false;
            if (typeof (doc.info) !== "undefined") {
              if (typeof (doc.gdpr_consent) !== "undefined" && doc.gdpr_consent === true) {
                gdpr = true;
              }
            }
            return gdpr;
          };

          if (error) {
            // may also end-up creating new user
            processGoogleCallbackError(error, res, udoc, req, odata, userWrapper, accessToken);
            return;
          }
          user.trackUserLogin(owner_id);
          user.updateLastSeen(udoc);
          alog.log(owner_id, "OAuth2 User logged in...");
          var token = sha256(accessToken.token.access_token);
          redis_client.set(token, JSON.stringify(userWrapper));
          redis_client.expire(token, 3600);
          const ourl = app_config.acl_url + "/auth.html?t=" + token + "&g=" + needsGDPR(udoc); // require GDPR consent
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