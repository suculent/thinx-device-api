/** This THiNX-RTM API module is responsible for returning current app version. */

// Usage:
// require('./lib/thinx/version.js');
// var v = new Version();
// v.revision();

// Definitive Module Pattern
var Version = (function() {

	var Globals = require("./globals.js");
  var app_config = Globals.app_config(); 

	// public
	var _public = {

		/**
		 * Returns current repository revision (development version)
		 * @return {string} App version (repository revision).
		 */

		revision: function() {

			// production
			if (typeof(process.env.REVISION) !== "undefined") {
				return process.env.REVISION;
			}

			// development
			var exec = require("child_process");
			var CMD = "cd " + app_config.project_root +
				"; git init; git rev-list HEAD --count";
			var temp = exec.execSync(CMD).toString().replace("\n", "");
			this.version = parseInt(temp, 10);
			return this.version;
		}
	};

	return _public;

})();

exports.revision = Version.revision;
