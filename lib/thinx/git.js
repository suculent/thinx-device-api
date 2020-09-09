// Git Shell Manager

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require("fs-extra");

module.exports = class Git {

    fetch(owner, command, local_path) {
		const exec = require("child_process");
		let success = false;
		let result;
		let RSAKey = require("./rsakey"); let rsa = new RSAKey();
		const key_paths = rsa.getKeyPathsForOwner(owner);
		if (key_paths.count < 1) {
			console.log("[git] no_rsa_keys_found"); // todo: build or audit log
			return false;
		}		
		for (var kindex in key_paths) {
			var gfpfx = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
			console.log("[git] git prefix", kindex, gfpfx);
			let cmd = gfpfx + command + "' 2>&1";
			console.log("[git] git command: " + cmd);			
			try {
				result = exec.execSync(cmd);
				let rstring = result.toString();
				console.log("[git] [sources] git rsa clone result: ", rstring);

				if (rstring.indexOf("Already up-to-date.") != -1) {
					return true;
				}

				if (rstring.indexOf("already exists and is not an empty") != -1) {
					return true;
				}

				if (rstring.indexOf("FETCH_HEAD") != -1) {
					return true;
				}

				if (rstring.indexOf("up-to-date") != -1) {
					return true;
				} 

				if (typeof(local_path) !== "undefined") {
					success = fs.existsSync(local_path + "/basename.json"); // may throw! but does not work.
					console.log("[git] Fetch successful? : " + success, "in path", local_path);
				}
				if (success == true) {
					return success;
				}
			} catch (e) {
				console.log("[git] git rsa clone error: " + e);
				success = false;
			}
		}
		return success;
	}
};