// Prefix equals static globals

let Globals = (function () {

  let Rollbar = require("rollbar");
  let fs = require("fs-extra");
  let crypto = require("crypto");

  let CONFIG_ROOT = "/mnt/data/conf";

  if (process.env.ENVIRONMENT == "development") {
    CONFIG_ROOT = __dirname + "/../../spec/mnt/data/conf";
  }

  let CONFIG_PATH = CONFIG_ROOT + "/config.json";

  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found in ${CONFIG_PATH} in environment ${process.env.ENVIRONMENT}`);
  }

  // all cached
  let _prefix = "";
  let _app_config = null;
  let _github_ocfg = null;
  let _google_ocfg = null;
  let _rollbar = null;

  // CI / test envs: keep the old short-cap behaviour so the test suite cannot
  // hang indefinitely waiting for a Redis that the CI runner won't ever bring
  // up. Detected via CIRCLE_USERNAME (CircleCI) or ENVIRONMENT === 'test'.
  //
  // Production / staging: NEVER return an Error while the process is alive.
  // The previous strategy surfaced a terminal Error after 10 retries (or any
  // ECONNREFUSED / ECONNRESET / ETIMEDOUT), causing node-redis to give up
  // and the application to enter a CRASH-RESTART loop. During the
  // 2026-05-31 incident this loop accumulated 13+ orphan Mosquitto users
  // and OOM-killed the API container (exit 137). Infinite reconnect with
  // bounded exponential backoff (cap 30s) is intentional — see quick task
  // 260531-n72.
  const redis_reconnect_strategy = function (retries, cause) {

    const isTestEnv = (typeof (process.env.CIRCLE_USERNAME) !== "undefined") ||
                      (process.env.ENVIRONMENT === "test");

    if (isTestEnv) {
      const max_attempts = 5;
      if (cause) {
        if (cause.code === 'ECONNREFUSED') {
          return new Error('The server refused the connection');
        }
        if (cause.code === 'ECONNRESET') {
          return new Error('The server reset the connection');
        }
        if (cause.code === 'ETIMEDOUT') {
          return new Error('The server timeouted the connection');
        }
      }
      if (retries > max_attempts) {
        return new Error('Retry attempts ended');
      }
      return 1000;
    }

    // Production / staging: infinite retry with bounded exponential backoff.
    // 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 6400ms, 12800ms, 25600ms,
    // then clamped at 30s forever. Never returns an Error.
    const delay = Math.min(30000, 100 * Math.pow(2, retries));
    if (retries > 0) {
      // Lightweight debug breadcrumb so the deploy log shows backoff is
      // engaged. Not rate-limited at the strategy level — node-redis itself
      // calls this once per retry attempt.
      console.log(`ℹ️ [info] [globals] Redis reconnect attempt #${retries}, next delay ${delay}ms${cause && cause.code ? ' (cause=' + cause.code + ')' : ''}`);
    }
    return delay;
  };

  let _public = {

    redis_options: function () {

      if ((typeof (_app_config) === "undefined") || (_app_config === null)) {
        console.log("CRITICAL CONFIGURATION ERROR: missing conf/config.json");
        return retval;
      }

      if ((typeof (_app_config.redis) === "undefined") || (_app_config.redis === null)) {
        console.log("CRITICAL CONFIGURATION ERROR: `redis` block missing in conf/config.json");
        return retval;
      }

      const source = _app_config.redis;
      const config = {
        legacyMode: true
      };

      // #418 (SEC-CFG-01): prefer a Docker secret (/run/secrets/REDIS_PASSWORD)
      // over the env var, which itself overrides config.json — to stay in sync.
      const { readSecret } = require("./secrets.js");
      const redis_password = readSecret("REDIS_PASSWORD");
      if (redis_password) {
        config.password = redis_password;
      } else if (typeof (source.password) !== "undefined") {
        config.password = source.password;
      }

      if (typeof (source.url) === "string" && source.url.length > 0) {
        config.url = source.url;
      }

      if (typeof (source.db) !== "undefined") {
        config.database = source.db;
      }

      config.socket = {
        reconnectStrategy: redis_reconnect_strategy
      };

      if (typeof (source.host) === "string" && source.host.length > 0) {
        config.socket.host = source.host;
      }

      if (typeof (source.port) !== "undefined") {
        config.socket.port = source.port;
      }

      return config;
    },

    load: function () {

      if (fs.existsSync(CONFIG_ROOT + '/google-oauth.json')) {
        _google_ocfg = require(CONFIG_ROOT + '/google-oauth.json');
      }

      if (fs.existsSync(CONFIG_ROOT + '/github-oauth.json')) {
        _github_ocfg = require(CONFIG_ROOT + '/github-oauth.json');
      }

      let path = null;

      if ((path == null) && fs.existsSync(CONFIG_ROOT + '/config.override.json')) {
        path = CONFIG_ROOT + '/config.override.json';
        console.log("Configuration loaded from:", path);
        _app_config = require(path);
      }

      if ((path == null) && fs.existsSync(CONFIG_ROOT + '/config.json')) {
        path = CONFIG_ROOT + '/config.json';
        console.log("Configuration loaded from:", path);
        _app_config = require(path);
      }

      if ((typeof (process.env.ROLLBAR_ACCESS_TOKEN) !== "undefined") && (process.env.ROLLBAR_ACCESS_TOKEN !== null)) {
        _rollbar = new Rollbar({
          accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
          handleUncaughtExceptions: true,
          handleUnhandledRejections: true,
          revision: process.env.REVISION || "latest"
        });
      }

      _public.load_or_create_prefix();

    },

    load_or_create_prefix: function () {
      let pfx_path = CONFIG_ROOT + '/.thx_prefix'; // old
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
      console.log("[globals.js] Prefix file not found...");
      _public.save_new_prefix(pfx_path);
    },

    save_new_prefix: function (pfx_path) {
      fs.ensureFile(pfx_path, function (e) {
        if (e) {
          console.log(`☣️ [error] creating thx_prefix: ${e}`);
          return;
        }
        crypto.randomBytes(12, function (_cerr, buffer) {
          _prefix = buffer.toString('hex');
          fs.writeFile(pfx_path, _prefix, "", function (werr) {
            if (werr) {
              console.log(`☣️ [error] writing thx_prefix: ${werr}`);
            } else {
              console.log(`ℹ️ [info] [globals.js] Created new prefix ${_prefix}`);
            }
          });
        });
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
          crypto.randomBytes(12, function (_cerr, buffer) {
            let prefix = buffer.toString('hex');
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

      let pfx_path;
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

      if (process.env.ENVIRONMENT == "development") {
        _app_config.ssh_keys = process.env.HOME + "/.ssh";
      }

      return _app_config;
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
exports.google_ocfg = Globals.google_ocfg;
exports.github_ocfg = Globals.github_ocfg;
exports.rollbar = Globals.rollbar;
exports.redis_options = Globals.redis_options;
