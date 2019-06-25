// Includes app_config, what about a re-use?

// Prefix equals static globals

var Globals = (function() {

  // all cached
  var prefix = null;
  var app_config = null;
  var github_ocfg = null;
  var google_ocfg = null;
  var use_screen = false;

  // preload once on init... (statics, don't care of copy...)
  if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
    console.log("» Starting server on Circle CI...");
    app_config = require("./conf/config-test.json");

    if (fs.existsSync('./conf/google-oauth-test.json')) {
      google_ocfg = require('./conf/google-oauth-test.json');
    } else {
      console.log("Skipping Google OAuth, configuration not found...");
    }

    if (fs.existsSync('./conf/github-oauth-test.json')) {
      github_ocfg = require('./conf/github-oauth-test.json');
    } else {
      console.log("Skipping GitHub OAuth, configuration not found...");
    }

    use_sqreen = false;
  }
  if (process.env.LOGNAME == "sychram") {
    console.log("» Starting on workstation...");
    app_config = require("./conf/config-local.json");

    if (fs.existsSync('./conf/google-oauth-test.json')) {
      google_ocfg = require('./conf/google-oauth-test.json');
    }

    if (fs.existsSync('./conf/github-oauth-test.json')) {
      github_ocfg = require('./conf/github-oauth-test.json');
    }
    use_sqreen = false;
  }
  if (process.env.LOGNAME == "root") {
    console.log("» Starting in production 'root' mode (needs to control Docker until Agens)...");
    app_config = require("./conf/config.json");

    if (fs.existsSync('./conf/google-oauth.json')) {
      google_ocfg = require('./conf/google-oauth.json');
    }

    if (fs.existsSync('./conf/github-oauth.json')) {
      github_ocfg = require('./conf/github-oauth.json');
    }
  }

  var _public = {

    prefix: function() {
      if (prefix == null) {
        try {
      		var pfx_path = app_config.project_root + '/conf/.thx_prefix';
      		if (fs.existsSync(pfx_path)) {
      			prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
      		}
      	} catch (e) {
      		console.log("[apikey] thx_prefix_exception " + e);
          prefix = ""; // returns something valid not to die...
      	}
      }
      return prefix;
    },

    app_config: function() {
      return app_config;
    },

    use_screen: function() {
      return use_screen;
    },

    google_ocfg: function () {
      return google_ocfg;
    },

    github_ocfg: function () {
      return github_ocfg;
    }

  };

  return _public;

})();

exports.prefix = Globals.prefix;
exports.app_config = Globals.app_config;
exports.use_screen = Globals.use_screen;
exports.google_ocfg = Globals.google_ocfg;
exports.github_ocfg = Globals.github_ocfg;
