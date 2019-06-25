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
        _app_config = require("../../conf/config-test.json");

        if (fs.existsSync('../../conf/google-oauth-test.json')) {
          _google_ocfg = require('../../conf/google-oauth-test.json');
        } else {
          console.log("Skipping Google OAuth, configuration not found...");
        }

        if (fs.existsSync('../../conf/github-oauth-test.json')) {
          _github_ocfg = require('../../conf/github-oauth-test.json');
        } else {
          console.log("Skipping GitHub OAuth, configuration not found...");
        }

        _use_sqreen = false;

      } else {

        _app_config = require("../../conf/config.json");

        if (fs.existsSync('../../conf/google-oauth.json')) {
          _google_ocfg = require('../../conf/google-oauth.json');
        }

        if (fs.existsSync('../../conf/github-oauth.json')) {
          _github_ocfg = require('../../conf/github-oauth.json');
        }
      }

      _rollbar = new Rollbar({
      	accessToken: _app_config.rollbar_token,
      	handleUncaughtExceptions: false,
      	handleUnhandledRejections: false
      });

    },

    prefix: function() {
      if (_prefix === null) {
        _public.load();
      }
      if (_prefix === null) {
        try {
      		var pfx_path = _app_config.project_root + '/conf/.thx_prefix';
      		if (fs.existsSync(pfx_path)) {
      			_prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
      		}
      	} catch (e) {
      		console.log("[globals] thx_prefix_exception " + e);
          _prefix = ""; // returns something valid not to die...
      	}
      }
      return _prefix;
    },

    app_config: function() {
      if (_prefix === null) {
        _public.load();
      }
      // NEVER LOG THIS, critical data leak
      return _app_config;
    },

    use_screen: function() {
      if (_prefix === null) {
        _public.load();
      }
      return _use_screen;
    },

    google_ocfg: function () {
      if (_prefix === null) {
        _public.load();
      }
      return _google_ocfg;
    },

    github_ocfg: function () {
      if (_prefix === null) {
        _public.load();
      }
      return _github_ocfg;
    },

    rollbar: function () {
      if (_prefix === null) {
        _public.load();
      }
      return _rollbar;
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
