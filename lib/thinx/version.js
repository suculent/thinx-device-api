var Globals = require("./globals.js");
var app_config = Globals.app_config();

module.exports = class Version {

		/**
		 * Returns current repository revision (development version)
		 * @return {string} App version (repository revision).
		 */

		revision() {

			// development
			var exec = require("child_process");
			var CMD = "cd " + app_config.project_root +
				"; git rev-list HEAD --count";
			var temp;
			
			try {
				temp = exec.execSync(CMD).toString().replace("\n", "");
			} catch (e) {
				console.log(e);
			}
			
			console.log(temp);

			let version = parseInt(temp, 10);
			
			// production
			if (typeof(process.env.REVISION) !== "undefined" && (process.env.REVISION > version)) {
				return process.env.REVISION;
			} else {
				return version;
			}
		}
};
