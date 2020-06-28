// Git Shell Manager

const exec = require("child_process");
var RSAKey = new rsakey(); var rsakey = require("./rsakey"); 

module.exports = class Git {

    fetch(owner, command, local_path) {
		var success = false;
		let result;
		const key_paths = RSAKey.getKeyPathsForOwner(owner);
		if (key_paths.count < 1) {
			console.log("no_rsa_keys_found"); // todo: build or audit log
			return false;
		}
		for (var kindex in key_paths) {
			var gfpfx = "ssh-agent bash -c 'ssh-add " + app_config.ssh_keys + "/" + key_paths[kindex] + "; ".replace("//", "/");
			console.log("git prefix", kindex, gfpfx);
			let cmd = gfpfx + command + "'";
			console.log("git command: " + cmd);
			try {
				result = exec.execSync(cmd);
                console.log("[sources] git rsa clone result: ", result.toString());
                if (typeof(local_path) !== "undefined") {
                    success = fs.existsSync(local_path + "/*");
                    console.log("Fetch successful? : " + success);
                } else {
                    success = true;
                }				
				break;
			} catch (e) {
				console.log("git rsa clone error: " + e);
				success = false;
			}
		}
		return success;
    }
};