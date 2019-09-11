var Globals = require("./globals.js");
var app_config = Globals.app_config();

module.exports = class Version {

		/**
		 * Returns current repository revision (development version)
		 * @return {string} App version (repository revision).
		 */

		revision() {

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
