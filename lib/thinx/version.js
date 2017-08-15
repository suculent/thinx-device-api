/** This THiNX-RTM API module is responsible for returning current app version. */

// Usage:
// require('./lib/thinx/version.js');
// var v = new Version();
// v.revision();

// Definitive Module Pattern
var Version = (function() {

	var app_config = require("../../conf/config.json");
	if (process.env.CIRCLE_CI === true) {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}

	// public
	var _public = {

		/**
		 * Returns current repository revision (development version)
		 * @return {string} App version (repository revision).
		 */

		revision: function() {
			var exec = require("child_process");
			var CMD = "cd " + app_config.project_root +
				"; git rev-list HEAD --count";
			var temp = exec.execSync(CMD).toString().replace("\n", "");
			this.version = parseInt(temp);
			return this.version;
		}
	};

	return _public;

})();

exports.revision = Version.revision;
