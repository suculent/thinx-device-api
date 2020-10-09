var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require('fs-extra');

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
			var git;

			if (fs.existsSync(app_config.project_root + "/.git")) {
				try {
					// Query the entry
					git = fs.lstatSync(app_config.project_root + "/.git");
				
					// Is it a directory?
					if (git.isDirectory()) {
						// Yes it is
						try {
							temp = exec.execSync(CMD).toString().replace("\n", "");
						} catch (e) {
							console.log("error fetching .git revision", e); //
						}
					} else {
						// cannot fetch revision from here
					}
				}
				catch (f) {
					console.log(f); // cannot fetch revision from here
				}
			}
			
			// console.log(temp);

			let version = parseInt(temp, 10);
			
			// production
			if (typeof(process.env.REVISION) !== "undefined" && (process.env.REVISION > version)) {
				return process.env.REVISION;
			} else {
				return version;
			}
		}
};
