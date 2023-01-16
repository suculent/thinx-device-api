// Git Shell Manager

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var fs = require("fs-extra");

const exec = require("child_process");

module.exports = class Git {

	checkResponse(rstring, local_path) {

		let valid_responses = [
			"already exists and is not an empty",
			"FETCH_HEAD",
			"up-to-date",
			"Checking out files: 100%",
			"done.",
			"Cloning into"
		];
		
		// default response is ''
		let success = false;
		for (let index in valid_responses) {
			if (rstring.indexOf(valid_responses[index]) != -1) {
				success = true;
				console.log("Success based on valid response ", valid_responses[index], "in", rstring );
				break;
			}
		}

		// the basefile must exist
		if ((success == false) && (typeof(local_path) !== "undefined")) {
			let basename_path = local_path + "/basename.json";
			success = fs.existsSync(basename_path); // may throw! but does not work.
			console.log(basename_path, "does not exist -> SUCCESS = ", success);
		}

		return success;
	}

	tryShellOp(cmd, local_path) {
		let result;
		try {
			result = exec.execSync(cmd).toString(); // lgtm [js/command-line-injection]			
			console.log("[git] exec result: '", result, "'");
		} catch (e) {
			result = e.stdout.toString();
			console.log("[ERROR] [git] exec result: '", result, "'");
		}
		return this.checkResponse(result, local_path);
	}

	askpath(keypath) {
		return keypath + ".sh";
	}

	create_askfile(keypath, password) {
		let path = this.askpath(keypath);
		let contents = `#!/usr/bin/env sh\necho "${password}"`;
		fs.writeFileSync(path, contents); // TODO: owner's keypass
		fs.chmodSync(path, 0o700);
		console.log("ℹ️ [info] Created askfile at ", path);
	}

	delete_askfile(keypath) {
		fs.removeSync(this.askpath(keypath));
	}

    fetch(owner, command, local_path) {
		// TODO: Fetch owner's key password (defaults to thinx now) and create askfile (should be per-user to allow parallelism, and deleted at the end)
		let success = false;
		let RSAKey = require("./rsakey"); let rsa = new RSAKey();
		let key_paths = rsa.getKeyPathsForOwner(owner);
		if ((typeof(key_paths) === "undefined") || (key_paths.length < 1)) {
			console.log("ℹ️ [info] [git] no_rsa_keys_found");
			success = this.tryShellOp(command, local_path);
		} else {
			// tries all keys until successful... may use last_successful_key first
			for (var kindex in key_paths) {
				let keypath = app_config.ssh_keys + "/" + key_paths[kindex];
				let askpath = this.askpath(keypath);
				var gfpfx = `ssh-agent sh -c 'DISPLAY=: SSH_ASKPASS=${askpath} GIT_ASKPASS=${askpath} ssh-add ${keypath} >/dev/null 2>&1; `;
				let prefixed_command = gfpfx + command + "' 2>&1";
				console.log("[REMOVEME] [git fetch] trying command:", prefixed_command); // REMOVE THIS!
				this.create_askfile(keypath, "thinx"); // owner keypass
				success = this.tryShellOp(prefixed_command, local_path);
				console.log("OP result", success);
				this.delete_askfile(keypath);
				if (success) return success;
			}
		}
		return success;
	}

	prefetch(GIT_PREFETCH) {
		console.log(`🔨 [debug] git prefetch command:\n ${GIT_PREFETCH}`);
		var result = "";
		try {
			result = exec.execSync(GIT_PREFETCH).toString().replace("\n", "");
			if (result !== "Already up to date.") {
				console.log(`ℹ️ [info] [builder] git prefetch result: ${result}`);
			}
		} catch (e) { console.log("⚠️ [warning] git prefetch not successful..."); }
		return result;
	}
};