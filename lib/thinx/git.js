// Git Shell Manager

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require("fs-extra");

const exec = require("child_process");

module.exports = class Git {

	checkResponse(rstring, local_path) {
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
		if (rstring.indexOf("Checking out files: 100%") != -1) {
			success = true;
		}
		if (rstring.indexOf("done.") != -1) {
			success = true;
		} 
		if (typeof(local_path) !== "undefined") {
			success = fs.existsSync(local_path + "/basename.json"); // may throw! but does not work.
			console.log("[git] Fetch successful? : " + success, "in path", local_path);
		}
		return success;
	}

	tryShellOp(cmd, local_path) {
		let success = false;
		let result;
		try {
			result = exec.execSync(cmd); // lgtm [js/command-line-injection]			
		} catch (e) {
			console.log("[git] git rsa clone error: " + e);
			//return false;
		}		
		let rstring = result.toString(); // result of exec is byte array
		//console.log({rstring});
		if (typeof(rstring) !== "undefined") {
			// console.log("[git] [sources] git rsa clone result: ", rstring);
			success = this.checkResponse(rstring, local_path);
		}
		return success;
	}

    fetch(owner, command, local_path) {
		let success = false;
		let RSAKey = require("./rsakey"); let rsa = new RSAKey();
		const key_paths = rsa.getKeyPathsForOwner(owner);
		if (key_paths.count < 1) {
			console.log("[git] no_rsa_keys_found"); // todo: build or audit log
			success = this.tryShellOp(command, local_path);
		} else {
			for (var kindex in key_paths) {
				var gfpfx = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
				let cmd = gfpfx + command + "' 2>&1";
				success = this.tryShellOp(cmd);
				if (success) return success;
			}
		}
		console.log("[git] git complete with success: ", success);
		return success;
	}
};