// Git Shell Manager

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require("fs-extra");

const exec = require("child_process");

module.exports = class Git {

	checkResponse(rstring, local_path) {
		console.log("checking git response:", {rstring});
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
		}
		return success;
	}

	tryShellOp(cmd, local_path) {
		let success = false;
		let result;
		try {
			result = exec.execSync(cmd).toString(); // lgtm [js/command-line-injection]			
			console.log("git fetch cmd result:", result);
		} catch (e) {
			console.log("[git] git rsa clone error: " + e);
		}		
		if (typeof(result) !== "undefined") {
			success = this.checkResponse(result, local_path);
		}
		return success;
	}

    fetch(owner, command, local_path) {
		let success = false;
		let RSAKey = require("./rsakey"); let rsa = new RSAKey();
		let key_paths = rsa.getKeyPathsForOwner(owner);
		if ((typeof(key_paths) === "undefined") || (key_paths.length < 1)) {
			console.log("[git] no_rsa_keys_found"); // todo: build or audit log
			success = this.tryShellOp("cd " + local_path + ";" + command, local_path);
		} else {
			for (var kindex in key_paths) {
				var gfpfx = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
				let prefixed_command = gfpfx + "cd " + local_path + ";" + command + "' 2>&1";
				console.log("[git fetch] trying command", prefixed_command);
				success = this.tryShellOp(prefixed_command, local_path);
				if (success) return success;
			}
		}
		return success;
	}
};