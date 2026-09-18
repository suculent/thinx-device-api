// Git Shell Manager

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const fs = require("fs-extra");
const exec = require("child_process");
const shellEscape = require("shell-escape");

const valid_responses = [
	"already exists and is not an empty",
	"FETCH_HEAD",
	"up-to-date",
	"Checking out files: 100%",
	"done.",
	"Cloning into"
];
module.exports = class Git {

	responseWhiteBlacklist(rstring) {
		// Must default to false, not undefined: checkResponse() below falls back
		// to "did basename.json appear?" only when this is == false, and
		// `undefined == false` is false in JS. A run whose output matched neither
		// list therefore skipped the fallback and returned undefined -- which is
		// the "[TODO TEST] Git response result undefined" in the build logs, and
		// meant a clone that did write basename.json could still be reported as
		// a failed fetch.
		let success = false;
		for (let index in valid_responses) {
			if (rstring.indexOf(valid_responses[index]) != -1) {
				success = true;
				console.log("Success expected with valid response ", valid_responses[index]);
				break;
			}
		}

		// blacklist
		let invalid_responses = [ "fatal" ];
		for (let index in invalid_responses) {
			if (rstring.indexOf(invalid_responses[index]) != -1) {
				success = false;
				console.log("Failure override due to invalid response ", invalid_responses[index]);
				break;
			}
		}
		return success;
	}

	checkResponse(rstring, local_path) {

		// whitelist (default response is '')
		let success = this.responseWhiteBlacklist(rstring);

		// the basefile must exist; local_path must be valid
		if ((success == false) && (typeof(local_path) !== "undefined")) {
			if (!fs.existsSync(local_path)) return false;
			let basename_path = local_path + "/basename.json";
			success = fs.existsSync(basename_path); // may throw! but does not work.
			if (success) console.log(basename_path, "exists, success...");
		}

		console.log("[TODO TEST] Git response result", success);

		return success;
	}

	tryShellOp(cmd, local_path) {
		let result;
		try {
			result = exec.execSync(cmd).toString().trim(); // lgtm [js/command-line-injection]
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
		fs.writeFileSync(path, contents);
		fs.chmodSync(path, 0o700);
	}

	delete_askfile(keypath) {
		fs.removeSync(this.askpath(keypath));
	}

    fetch(owner, command, local_path) {
		// TODO: Fetch owner's key password and create askfile (should be per-user to allow parallelism, and deleted at the end)
		let success = false;
		let RSAKey = require("./rsakey"); let rsa = new RSAKey();
		let key_paths = rsa.getKeyPathsForOwner(owner);
		if ((typeof(key_paths) === "undefined") || (key_paths.length < 1)) {
			console.log("ℹ️ [info] [git] no_rsa_keys_found");
			return this.tryShellOp(command, local_path);
		} 
		
		// tries all keys until successful... may use last_successful_key first
		for (var kindex in key_paths) {
			let keypath = app_config.ssh_keys + "/" + key_paths[kindex];
			let askpath = this.askpath(keypath);

			// The script is ONE argument to `sh -c`. Concatenating it into a
			// hand-written 'single-quoted' string broke the moment `command`
			// contained a quote of its own -- builder.js quotes its arguments
			// with shell-escape, so the inner quote closed the outer one and the
			// tail of the script was re-parsed as separate words. That is how
			//   printf '{"basename":"%s",...}' "$(basename "$(pwd)")" main
			// turned into `/bin/sh: "$(basename "$(pwd)")" main > ../basename.json:
			// not found`: basename.json was never written correctly, so even a
			// clone that authenticated fine was reported as a failed fetch.
			// Escape the whole script as a single argument instead.
			const script = `DISPLAY=: SSH_ASKPASS=${shellEscape([askpath])} GIT_ASKPASS=${shellEscape([askpath])} ` +
				`ssh-add ${shellEscape([keypath])} >/dev/null 2>&1; ${command}`;
			let prefixed_command = `ssh-agent sh -c ${shellEscape([script])} 2>&1`;

			this.create_askfile(keypath, process.env.GIT_KEY_PASSPHRASE || ''); // must be configured per-deployment via GIT_KEY_PASSPHRASE env var
			success = this.tryShellOp(prefixed_command, local_path);
			this.delete_askfile(keypath);
			if (success) return success;
		}
		
		return success;
	}

	// WHY IS THIS HERE? WHY IS THIS NOT FETCH? TO TRY WITHOUT KEY? FETCH WILL SUCCEED ANYWAY (IF ANY KEY EXISTS)
	prefetch(GIT_PREFETCH) {
		console.log(`🔨 [debug] git prefetch command:\n ${GIT_PREFETCH}`);
		var result = "";
		try {
			result = exec.execSync(GIT_PREFETCH).toString().replace("\n", "");
			if (result !== "Already up to date.") {
				console.log(`ℹ️ [info] [builder] git prefetch result: ${result}`);
			}
		} catch (_e) { console.log("⚠️ [warning] git prefetch not successful..."); }
		return result;
	}
};