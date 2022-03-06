// Prefix equals static globals

var Globals = (function () {

  var Rollbar = require("rollbar");
  var fs = require("fs-extra");
  var crypto = require("crypto");

  let CONFIG_ROOT = "/mnt/data/conf";

  if (process.env.ENVIRONMENT == "development") {
    CONFIG_ROOT = __dirname + "/../../spec/mnt/data/conf";
  }

  var CONFIG_PATH = CONFIG_ROOT + "/config.json"; 

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found in ${CONFIG_PATH}`);
  }

  // all cached
  var _prefix = "";
  var _app_config = null;
  var _github_ocfg = null;
  var _google_ocfg = null;
  var _use_sqreen = false;
  var _rollbar = null;

  const redis_reconnect_strategy = function (options) {

    var max_attempts = 10;
    var retry_time = 5 * 60 * 1000;

    // for test environment, limits are much shorter.
    if (typeof (process.env.CIRCLE_USERNAME) !== "undefined") {
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
    }
    if (options.total_retry_time > retry_time) {
      // End reconnecting after a specific timeout and flush all commands with a individual error
      return new Error('Retry time exhausted');
    }
    if (options.attempt > max_attempts) {
      // End reconnecting with built in error
      return new Error('Retry attempts ended');
    }
    // reconnect after
    return 1000;
  };

  var _public = {

    redis_options: function () {

      if ((typeof (_app_config) === "undefined") || (_app_config === null)) {
        console.log("CRITICAL CONFIGURATION ERROR: missing conf/config.json");
        return retval;
      }

      if ((typeof (_app_config.redis) === "undefined") || (_app_config.redis === null)) {
        console.log("CRITICAL CONFIGURATION ERROR: `redis` block missing in conf/config.json");
        return retval;
      }

      let config = _app_config.redis;
      if (typeof (_app_config.redis_goauth) !== "undefined") {
        config = _app_config.redis_goauth;
      }
      config.retry_strategy = redis_reconnect_strategy;
      return config;
    },
    
    load: function () {

      if (fs.existsSync(CONFIG_ROOT + '/google-oauth.json')) {
        _google_ocfg = require(CONFIG_ROOT + '/google-oauth.json');
      }

      if (fs.existsSync(CONFIG_ROOT + '/github-oauth.json')) {
        _github_ocfg = require(CONFIG_ROOT + '/github-oauth.json');
      }

      if (fs.existsSync(CONFIG_ROOT + '/config.json')) {
        _app_config = require(CONFIG_ROOT + '/config.json');
      }

      if (typeof(process.env.ROLLBAR_TOKEN) !== "undefined") {
        _rollbar = new Rollbar({
            accessToken: process.env.ROLLBAR_TOKEN,
            handleUncaughtExceptions: true,
            handleUnhandledRejections: true,
            revision: process.env.REVISION || "latest"
        });
    }

      _public.load_or_create_prefix();

    },

    load_or_create_prefix: function () {
      var pfx_path = CONFIG_ROOT + '/.thx_prefix'; // old
      if (!fs.existsSync(pfx_path)) {
        console.log("[globals.js] Prefix file not found at (1)", pfx_path);
        pfx_path = _app_config.data_root + '/conf/.thx_prefix'; // new
        if (!fs.existsSync(pfx_path)) {
          console.log("[globals.js] Prefix file not found at (2)", pfx_path);
          _prefix = null;
        }
      }
      if (fs.existsSync(pfx_path)) {
        _prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
        return;
      }
      console.log("[globals.js] Prefix file not found.");
      _public.save_new_prefix(pfx_path);
    },

    save_new_prefix: function (pfx_path) {
      fs.ensureFile(pfx_path, function (e) {
        if (e) {
          console.log("error creating thx_prefix: " + e);
        } else {
          crypto.randomBytes(12, function (cerr, buffer) {
            _prefix = buffer.toString('hex');
            fs.writeFile(_prefix, "", function (werr) {
              if (werr) {
                console.log("error writing thx_prefix: " + werr);
              }
            });
          });
        }
      });
    },

    generate_prefix: function () {
      let pfx_path = _app_config.data_root + '/conf/.thx_prefix';
      console.log("Generating prefix at " + pfx_path);
      fs.ensureFile(pfx_path, function (e) {
        if (e) {
          console.log("error creating thx_prefix: " + e);
          return null;
        } else {
          crypto.randomBytes(12, function (cerr, buffer) {
            var prefix = buffer.toString('hex');
            fs.writeFile(prefix, "", function (werr) {
              if (werr) {
                console.log("error writing thx_prefix: " + werr);
                return null;
              } else {
                console.log("Returning new prefix: " + _prefix);
                return _prefix;
              }
            });
          });
        }
      });
    },

    prefix: function () {

      if (_prefix === null) {
        console.log("prefix:_prefix==null; loading");
        _public.load();
      } else {
        return _prefix;
      }

      var pfx_path;
      pfx_path = CONFIG_ROOT + '/.thx_prefix';
      if (!fs.existsSync(pfx_path)) {
        pfx_path = _app_config.data_root + '/conf/.thx_prefix';
        if (!fs.existsSync(pfx_path)) {
          _prefix = null;
        }
      }

      try {
        console.log("Re-loading " + pfx_path);
        if (fs.existsSync(pfx_path)) {
          console.log("xists");
          _prefix = (fs.readFileSync(pfx_path).toString()).replace("\n", "");
          return _prefix; // allow empty prefix as well
        } else {
          console.log("does not exist " + pfx_path);
          _prefix = null;
        }
      } catch (e) {
        // create .thx_prefix with random key on first run!
        console.log("[globals] thx_prefix_exception (2) skipped " + e);
        _prefix = _public.generate_prefix(); // may cause loop, investigate...
      }

      if (_prefix === null) {
        console.log("No prefix found(!), generating...");
        _prefix = _public.generate_prefix();
      } else {
        console.log("Expected empty prefix: " + _prefix);
      }

      console.log("Globals returning prefix '" + _prefix + "'");
      return _prefix;
    },

    app_config: function () {

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

    use_sqreen: function () {
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
