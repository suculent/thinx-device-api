// Includes app_config, what about a re-use?

// Prefix equals static globals

var Globals = (function() {

  var Rollbar = require("rollbar");
  var fs = require("fs-extra");

  // all cached
  var _prefix = "";
  var _app_config = null;
  var _github_ocfg = null;
  var _google_ocfg = null;
  var _use_screen = false;
  var _rollbar = null;

  var _public = {

    redis_options: function() {
        return {
      	  password: _app_config.redis.password,
      		host: _app_config.redis.host,
      		port: 6379,
      	  retry_strategy: function (options) {
    	    console.log('retry strategy check');
    	    console.log(options);
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
    	    return 10000;
      	}
      };
    },

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
      	handleUncaughtExceptions: true,
      	handleUnhandledRejections: true
      });

    },

    prefix: function() {

      try {
        var pfx_path = app_config.project_root + '/conf/.thx_prefix';
        if (fs.existsSync(pfx_path)) {
          _prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
          if (_prefix.length > 0) {
            console.log("early prefix: "+_prefix);
            return _prefix;
          }
        } else {
          // create .thx_prefix with random key on first run!
          fs.ensureFile(pfx_path, function(e) {
            if (e) {
              console.log("error creating thx_prefix: " + e);
            } else {
              crypto.randomBytes(12, function(err, buffer) {
                var prefix = buffer.toString('hex');
                fs.writeFile(prefix, "", function(err) {
                  if (err) {
                    console.log("error writing thx_prefix: " + err);
                  }
                  console.log("Returning new prefix: "+_prefix);
                  return _prefix;
                });
              });
            }
          });
        }
      } catch (e) {
        console.log("[index] thx_prefix_exception" + e);
      }

      if (_prefix === null) {
        _public.load();
      }
      if (_prefix === null) {
        try {
      		var pfx_path = '../../conf/.thx_prefix';
      		if (fs.existsSync(pfx_path)) {
      			_prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
            console.log("[globals] loaded prefix: '" + _prefix + "'");
      		}
      	} catch (e) {
      		console.log("[globals] thx_prefix_exception " + e);
          _prefix = ""; // returns something valid not to die...
      	}
      }
      if (_prefix === null) _prefix = "";
      console.log("Globals returning prefix '"+_prefix+"'");
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
exports.redis_options = Globals.redis_options;
