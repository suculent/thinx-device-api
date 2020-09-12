// Git Shell Manager

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require("fs-extra");

module.exports = class Git {

	checkResponse(response, local_path) {
		let success = false;
		if (rstring.indexOf("already exists and is not an empty") != -1) {
			success = true;
		}
		if (rstring.indexOf("FETCH_HEAD") != -1) {
			success = true;
		}
		if (rstring.indexOf("up-to-date") != -1) {
			success = true;
		} 
		if (typeof(local_path) !== "undefined") {
			success = fs.existsSync(local_path + "/basename.json"); // may throw! but does not work.
			console.log("[git] Fetch successful? : " + success, "in path", local_path);
		}
		return success;
	}

    fetch(owner, command, local_path) {
		const exec = require("child_process");
		let success = false;
		let result;
		let RSAKey = require("./rsakey"); let rsa = new RSAKey();
		const key_paths = rsa.getKeyPathsForOwner(owner);
		if (key_paths.count < 1) {
			console.log("[git] no_rsa_keys_found"); // todo: build or audit log
			try {
				result = exec.execSync(cmd); // lgtm [js/command-line-injection]
				let rstring = result.toString();
				console.log("[git] [sources] git rsa clone result: ", rstring);
				success = this.checkResponse(rstring, local_path);
			} catch (e) {
				console.log("[git] git rsa clone error: " + e);
				success = false;
			}
		}		
		for (var kindex in key_paths) {
			var gfpfx = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
			console.log("[git] git prefix", kindex, gfpfx);
			let cmd = gfpfx + command + "' 2>&1";
			console.log("[git] git command: " + cmd);			
			try {
				result = exec.execSync(cmd); // lgtm [js/command-line-injection]
				let rstring = result.toString();
				console.log("[git] [sources] git rsa clone result: ", rstring);
				success = this.checkResponse(rstring, local_path);
			} catch (e) {
				console.log("[git] git rsa clone error: " + e);
				success = false;
			}
		}
		console.log("[git] git complete with success: ", success);
		return success;
	}
};