// Prefix equals static globals

var Globals = (function() {

  var Rollbar = require("rollbar");

  // const CONFIG_ROOT = "/mnt/data/conf";
  var CONFIG_ROOT = __dirname + "/../../conf";

  if (process.env.ENVIRONMENT == "test") {
    CONFIG_ROOT = "/opt/thinx/thinx-device-api/conf";
  }

  var fs = require("fs-extra");
  var crypto = require("crypto");

  // all cached
  var _prefix = "";
  var _app_config = null;
  var _github_ocfg = null;
  var _google_ocfg = null;
  var _use_sqreen = false;
  var _rollbar = null;

  var _public = {

    redis_options: function() {

        const strategy = function(options) {

          console.log('Retry strategy requested with options:');
          console.log(JSON.stringify(options));

          var max_attempts = 10;
          var retry_time = 5 * 60 * 1000;

          // for test environment, limits are much shorter.
          if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
            max_attempts = 5;
            retry_time = 1000 * 60;
          }

          if (options.error) {
            if (options.error.code === 'ECONNREFUSED') {
              // End reconnecting on a specific error and flush all commands with a individual error
              return new Error('The server refused the connection');
            }
            if (options.error.code === 'ECONNRESET') {
              return new Error('The server reset the connection');
            }
            if (options.error.code === 'ETIMEDOUT') {
              return new Error('The server timeouted the connection');
            }
            if (options.error.code === 'EPIPE') {
              // return new Error('Broken pipe');
            }
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            // End reconnecting after a specific timeout and flush all commands with a individual error
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 100) {
            // End reconnecting with built in error
            return new Error('Retry attempts ended');
          }
          // reconnect after
          return 1000;
        };

        var retval = {};

        // allow password-less login for testing
        if (_app_config.redis.password.length > 1) {
          retval = {
        	  password: _app_config.redis.password,
            host: _app_config.redis.host,
            port: 6379,
        	  retry_strategy: strategy
          };
        } else {
          retval = {
        		host: _app_config.redis.host,
        		port: 6379
          };
        }

        return retval;
    },

    load: function() {

      // TODO: Refactor. CI should copy the files here on its own.

      if ((typeof(process.env.CIRCLE_USERNAME) !== "undefined") ||
          (typeof(process.env.NODE_ENV) !== "undefined" && process.env.NODE_ENV == "test")
          ) {

        console.log("» Starting server on Circle CI...");
        _app_config = require(CONFIG_ROOT + '/config-test.json');

        if (fs.existsSync(CONFIG_ROOT + '/google-oauth-test.json')) {
          _google_ocfg = require(CONFIG_ROOT + '/google-oauth-test.json');
        } else {
          console.log("Skipping Google OAuth, configuration not found...");
        }

        if (fs.existsSync(CONFIG_ROOT + '/github-oauth-test.json')) {
          _github_ocfg = require(CONFIG_ROOT + '/github-oauth-test.json');
        } else {
          console.log("Skipping GitHub OAuth, configuration not found...");
        }

        _use_sqreen = false;

      } else {

        if (fs.existsSync(CONFIG_ROOT + '/google-oauth.json')) {
          _google_ocfg = require(CONFIG_ROOT + '/google-oauth.json');
        }

        if (fs.existsSync(CONFIG_ROOT + '/github-oauth.json')) {
          _github_ocfg = require(CONFIG_ROOT + '/github-oauth.json');
        }

        if (fs.existsSync(CONFIG_ROOT + '/config.json')) {
          _app_config = require(CONFIG_ROOT + '/config.json');
        } else {
          console.log(CONFIG_ROOT + '/config.json NOT FOUND! Fallback to test...');
          _app_config = require(CONFIG_ROOT + '/config-test.json');
          // _google_ocfg = require('../../google-oauth-test.json');
          // _github_ocfg = require('../../github-oauth-test.json');
        }
      }

      _rollbar = new Rollbar({
      	accessToken: _app_config.rollbar_token,
      	handleUncaughtExceptions: false,
      	handleUnhandledRejections: false
      });

  	  _public.load_or_create_prefix();

    },

    load_or_create_prefix: function() {
      var pfx_path;
      try {
  	    pfx_path = CONFIG_ROOT + '/.thx_prefix';
        //console.log("Checking prefix at "+pfx_path);
      } catch (e) {
        console.log("[index] thx_prefix_exception (1) " + e);
        return;
      }
      if (fs.existsSync(pfx_path)) {
        //console.log("File exists at "+pfx_path);
	      _prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
	      console.log("Using prefix: "+_prefix);
        return;
	    }
      console.log("Prefix file not found.");
      _public.save_new_prefix(pfx_path);

    },

    save_new_prefix: function(pfx_path) {
      fs.ensureFile(pfx_path, function(e) {
        if (e) {
          console.log("error creating thx_prefix: " + e);
        } else {
          crypto.randomBytes(12, function(err, buffer) {
            _prefix = buffer.toString('hex');
            fs.writeFile(_prefix, "", function(err) {
              if (err) {
                console.log("error writing thx_prefix: " + err);
              }
            });
          });
        }
      });
    },

    generate_prefix: function() {
      var pfx_path = CONFIG_ROOT + '/.thx_prefix';
      console.log("Generating prefix at "+pfx_path);
      fs.ensureFile(pfx_path, function(e) {
        if (e) {
          console.log("error creating thx_prefix: " + e);
          return null;
        } else {
          crypto.randomBytes(12, function(err, buffer) {
            var prefix = buffer.toString('hex');
            fs.writeFile(prefix, "", function(err) {
              if (err) {
                console.log("error writing thx_prefix: " + err);
                return null;
              } else {
                console.log("Returning new prefix: "+_prefix);
                return _prefix;
              }
            });
          });
        }
      });
    },

    prefix: function() {

      if (_prefix === null) {
        console.log("prefix:_prefix==null; loading");
        _public.load();
      } else {
        return _prefix;
      }

      try {
        var pfx_path = CONFIG_ROOT + '/.thx_prefix';
        console.log("Re-loading " + pfx_path);
        if (fs.existsSync(pfx_path)) {
          console.log("xists");
          _prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
          return _prefix; // allow empty prefix as well
        } else {
          console.log("does not exist " +pfx_path);
          _prefix = null;
        }
      } catch (e) {
        // create .thx_prefix with random key on first run!
        console.log("[globals] thx_prefix_exception (2) skipped " + e);
        _prefix = _public.generate_prefix(); // may cause loop, investigate...
      }

      if (_prefix === null)  {
        console.log("No prefix found(!), generating...");
        _prefix = _public.generate_prefix();
      } else {
        console.log("Expected empty prefix: "+_prefix);
      }

      console.log("Globals returning prefix '"+_prefix+"'");
      return _prefix;
    },

    app_config: function() {

      if (_app_config === null) {
        console.log("re-ladung publik konfigurazion");
        _public.load();
      }

      if (_app_config === null) {
        console.log("_public.load still failed, hardkernfixoperazione...");
        _app_config = require(CONFIG_ROOT + '/config.json'); // not compatible with test!
      }
      return _app_config;
    },

    use_sqreen: function() {
      if (_use_sqreen === null) {
        _public.load();
      }
      _use_sqreen = _app_config.use_sqreen || false;
      return _use_sqreen;
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
exports.save_new_prefix = Globals.save_new_prefix;
exports.load_or_create_prefix = Globals.load_or_create_prefix;
exports.app_config = Globals.app_config;
exports.use_sqreen = Globals.use_sqreen;
exports.google_ocfg = Globals.google_ocfg;
exports.github_ocfg = Globals.github_ocfg;
exports.rollbar = Globals.rollbar;
exports.redis_options = Globals.redis_options;
