// Includes app_config, what about a re-use?

// Prefix equals static globals

var Globals = (function() {

  var Rollbar = require("rollbar");
  var fs = require("fs-extra");

  // all cached
  var _prefix = null;
  var _app_config = null;
  var _github_ocfg = null;
  var _google_ocfg = null;
  var _use_screen = false;
  var _rollbar = null;

  var _public = {

    load: function() {

      if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
        console.log("» Starting server on Circle CI...");
        this._app_config = require("../../conf/config-test.json");

        if (fs.existsSync('../../conf/google-oauth-test.json')) {
          this._google_ocfg = require('../../conf/google-oauth-test.json');
        } else {
          console.log("Skipping Google OAuth, configuration not found...");
        }

        if (fs.existsSync('../../conf/github-oauth-test.json')) {
          this._github_ocfg = require('../../conf/github-oauth-test.json');
        } else {
          console.log("Skipping GitHub OAuth, configuration not found...");
        }

        this._use_sqreen = false;

      } else {

        console.log("» Starting in production 'root' mode (needs to control Docker until Agens)...");
        this._app_config = require("../../conf/config.json");

        if (fs.existsSync('../../conf/google-oauth.json')) {
          this._google_ocfg = require('../../conf/google-oauth.json');
        }

        if (fs.existsSync('../../conf/github-oauth.json')) {
          this._github_ocfg = require('../../conf/github-oauth.json');
        }
      }

      console.log("Loaded mandatory config: " + JSON.stringify(this._app_config));
      this._rollbar = new Rollbar({
      	accessToken: this._app_config.rollbar_token,
      	handleUncaughtExceptions: false,
      	handleUnhandledRejections: false
      });

    },

    prefix: function() {
      _public.load();
      if (this._prefix === null) {
        try {
      		var pfx_path = this._app_config.project_root + '/conf/.thx_prefix';
      		if (fs.existsSync(pfx_path)) {
      			this._prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
      		}
      	} catch (e) {
      		console.log("[globals] thx_prefix_exception " + e);
          this._prefix = ""; // returns something valid not to die...
      	}
      }
      return _prefix;
    },

    app_config: function() {
      _public.load();
      console.log("app_config: " + JSON.stringify(this._app_config));
      return this._app_config;
    },

    use_screen: function() {
      _public.load();
      return this._use_screen;
    },

    google_ocfg: function () {
      _public.load();
      return this._google_ocfg;
    },

    github_ocfg: function () {
      _public.load();
      return this._github_ocfg;
    },

    rollbar: function () {
      _public.load();
      return this._rollbar;
    }

  };

  console.log("Loading globals...");

  _public.load();

  return _public;

})();

exports.prefix = Globals.prefix;
exports.app_config = Globals.app_config;
exports.use_screen = Globals.use_screen;
exports.google_ocfg = Globals.google_ocfg;
exports.github_ocfg = Globals.github_ocfg;
exports.rollbar = Globals.rollbar;
