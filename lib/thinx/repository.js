/*
 * This THiNX-RTM API module is responsible for managing repositories.
 */

var Repository = (function() {

	var fs = require("fs-extra");
	var path = require("path");
	var app_config = require("../../conf/config.json"); // this file should be actually omitted from repository
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var exec = require("child_process");
	var exit_callback = function(status) {};
	var githooked = require("githooked");
	var search = require("recursive-search");
	var finder = require("fs-finder");
	var Regex = require("regex");

	function timeoutFunction(local_path, repeat, callback) {
		return function() {
			Repository.checkRepositoryChange(local_path, false, callback);
		};
	}

	console.log("» Starting Git Webhook Listener on port 9001...");

	if (typeof(process.env.CIRCLE_USERNAME) === "undefined") {

		// && platformio run
		var gh = githooked("push", function(info) {


			var repository = info.repository;
			var url = repository.url;
			var ssh_url = repository.ssh_url;
			var cline_url = repository.clone_url;
			var name = repository.name;
			var full_name = repository.full_name;

			if (full_name == "suculent/thinx-device-api") {
				console.log(
					"» Skipping own webhook in favour of deploy-hook.sh on port 9000.");
				return;
			}

			console.log("»» GitHub Webhook called for Git repository: " + full_name);

			var repositories_path = app_config.project_root +
				app_config.build_root;

			//repositories = search.recursiveSearchSync(name, repositories_path);
			var repositories = [];
			var repo_gits = finder.from(repositories_path).showSystemFiles().findDirectories(
				full_name + "/.git");

			//console.log("repo_gits: " + JSON.stringify(repo_gits));

			if (repo_gits) {
				for (var dindex in repo_gits) {
					if (repo_gits[dindex].indexOf("/.git/") === -1) {
						repositories.push(repo_gits[dindex].replace("/.git", ""));
					}
				}
			}

			console.log("selected repos: " + JSON.stringify(repositories));

			if (typeof(this.exit_callback) === "undefined") {
				this.exit_callback = function() {
					// console.log("Exit callback was undefined, this is a placeholder. We don't probably need it here.");
				};
			}

			if (repositories.length > 0) {
				console.log("Found " + repositories.length + " repositories with name: " + name);
				for (var rindex in repositories) {
					var path = repositories[rindex];
					//console.log("Checking repository changes in " + path);
					_public.checkRepositoryChange(path, false, this.exit_callback);
				}
			} else {
				console.log(name + " not found in " + repositories_path);
			}

		}).listen(9001);

		githooked().on('push', function(info) {
			console.log('githooked ref ' + info.ref + ' was pushed.');
			console.log(JSON.stringify(info));
		});

		githooked().on('delete', function(info) {
			console.log('githooked ref ' + info.ref + ' was deleted.');
			console.log(JSON.stringify(info));
		});

		githooked().on('error', function(msg) {
			console.log("githooked error: " + msg);
		});

	}

	// public
	var _public = {

		watchRepository: function(local_path, callback) {

			if (typeof(callback) === "function") {
				this.exit_callback = callback;
			} else {
				this.exit_callback = function(success) {
					return success;
				};
			}

			if (local_path === null) {
				callback(false, "invalid_local_path");
			}

			console.log("Watching repository: " + local_path);

			this.watcher = {
				repository: local_path,
				callback: callback,
				run: true
			};

			if (typeof(callback) === "undefined") {
				console.log(
					"[REPOSITORY] Warning, no watch callback given, watching anyway...");
				_public.checkRepositoryChange(local_path, true, function(status, response) {
					callback(status, response);
				});
			} else {
				console.log("Starting callback repository watcher on " + local_path);
				_public.checkRepositoryChange(local_path, true, this.exit_callback);
			}


		},

		unwatchRepository: function() {

			if (this.watcher) {
				console.log("[REPOSITORY] Stopping watcher for " + this.watcher.repository);
				if (typeof(exit_callback) !== "undefined") {
					exit_callback();
				} else {
					console.log("[REPOSITORY] WARNING! Watcher has no callback.");
				}
			} else {
				console.log("[REPOSITORY] unwatchRepository: no watcher... exiting.");
				if (typeof(exit_callback) !== "undefined") {
					exit_callback(false);
				}
			}
		},

		/*
		 * Perform a pull on repository to find out if there are new commits.
		 */

		checkRepositoryChange: function(local_path, repeat, check_callback) {

			console.log("[checkRepositoryChange] Checking change by git pull at: " +
				local_path);

			local_path.replace("./", app_config.project_root);

			/* this hack should deprecate */
			if (typeof(check_callback) === "undefined") {
				check_callback = function(arg) {};
			}

			/* whoa whoa who was drunk here? who should throw? */
			if (typeof(local_path) === "undefined" || local_path === null) {
				throw new Error('checkRepositoryChange: local_path must be valid');
			}

			if (local_path === []) {
				throw new Error('checkRepositoryChange: local_path must be string');
			}

			if (!fs.existsSync(local_path)) {
				console.log("Repository local path " + local_path + " not found.");
				if (typeof(check_callback) === "function") {
					check_callback({
						local_path: local_path,
						version: "n/a",
						revision: "n/a",
						changed: false
					});
				}
				return;
			}

			var all_dirs = finder.from(local_path).showSystemFiles().findDirectories(
				"\/.git");
			var git_dirs = [];
			// filter only git dirs
			for (var dindex in all_dirs) {
				var adir = all_dirs[dindex];
				if (adir.indexOf(".git") === (adir.length - 4)) {
					git_dirs.push(adir);
				}
			}

			// In case there is not even one git dir on local path,
			// this is not a directory and rest should be skipped.
			console.log("checkRepositoryChange: git_dirs found: " + JSON.stringify(
				git_dirs));

			/* This seems whole wrong. Why is the local_path not final?

					// Search for a git repository in root folder is doomed to return false
					var gitdir = null;
					if (!fs.existsSync(gitdir)) {
						//console.log("[REPOSITORY][INFO] Not a git repo here (1): " + gitdir); dommed?
						// Fetch all repositories on the REPO_PATH/local_path
						var directories = fs.readdirSync(local_path).filter(
							file => fs.lstatSync(path.join(local_path, file)).isDirectory()
						);
						// find inner path with git folder, adjust and break
						for (var dindex in directories) {
							var inner_path = local_path + "/" + directories[dindex] + "/.git";
							console.log("Traversing inner_path: " + inner_path);

							if (!fs.existsSync(inner_path)) continue;

							if (fs.lstatSync(inner_path).isDirectory()) {
								console.log("Assigning inner_path: " + inner_path);
								var path = local_path + "/" + directories[dindex];
								gitdir = path;
								console.log("setting git dir to " + path);
								break;
							}
						}
					}

					// dupe from index, extract or use npm!
					var getNewestFolder = function(dir, regexp) {
						newest = null;
						files = fs.readdirSync(dir);
						one_matched = 0;

						for (i = 0; i < files.length; i++) {

							if (regexp.test(files[i]) === false) {
								continue;
							} else if (one_matched === 0) {
								newest = dir + "/" + files[i];
								one_matched = 1;
								continue;
							}

							var filepath = dir + "/" + files[i];
							//console.log("STAT> " + filepath);
							f1_time = fs.statSync(filepath).mtime.getTime();
							f2_time = fs.statSync(newest).mtime.getTime();
							if (f1_time > f2_time)
								newest[i] = files[i];
						}

						if (newest !== null)
							return (newest);
						return null;
					};
					//

					// From all the build_ids take latest only!
					if (gitdir === null) {
						gitdir = getNewestFolder(local_path, new Regex(".*");
				));
		}*/

			//console.log("gitdir: " + JSON.stringify(gitdir)); * /

			// now the gitdir should be really valid
			if (!fs.lstatSync(local_path).isDirectory() || git_dirs.length === 0) {
				console.log("checkRepositoryChange: This is not a git repo: " +
					__dirname + "(localpath: " +
					local_path + "/.git )");
				if (typeof(check_callback) === "function") {
					check_callback({
						local_path: local_path,
						version: "n/a",
						revision: "n/a",
						changed: false
					});
				}
				return;
			}

			// what if this is not a repository yet? pull will fail...
			var CMD = "bash -c \"cd " + local_path +
				"; git status; ls -la; git reset --hard; git pull; git submodule sync; git submodule update --init --recursive\"";
			var nochange = "Already up-to-date.";
			var temp = exec.execSync(CMD).toString().replace("\n", "");

			if (this.timer !== null) {
				clearTimeout(this.timer);
			}

			if (temp.indexOf(nochange) !== -1) {

				if (local_path.indexOf("undefined") !== -1) {
					console.log("[REPOSITORY].js:289: Skipping incorrect local_path " +
						local_path);
					return false;
				}

				if (repeat === false) {
					return false;
				} else {
					// watcher needs to be set before calling check
					// console.log("Watcher: " + JSON.stringify(watcher));
					if (typeof(this.watcher) !== "undefined" || this.watcher !== null) {
						console.log("[REPOSITORY].js:299: Setting watcher timer for " +
							local_path);
						this.timer = setTimeout(timeoutFunction(
							local_path,
							repeat,
							check_callback), 30000);
					} else {
						return false;
					}
				}
			} else {

				if (repeat) {
					console.log("[REPOSITORY] git-watch: " + local_path +
						" : repository updated with timer");
				}

				console.log("[REPOSITORY] Current version: " + this.getRevisionNumber(local_path));
				console.log("[REPOSITORY] Current revision: " + this.getRevision(local_path));

				// TODO: Mark as update-available somwehere in user sources by setting 'available_version',
				// which will be then non-null and if higher than firmware version, new build is available...
				// ...but; it would be safer to save filename timestamp on build and then always compare
				// with real filename (but it takes lot of IO power to list all visible devices like file-manager))

				if (typeof(check_callback) === "function") {
					check_callback({
						local_path: local_path,
						version: this.version,
						revision: this.revision,
						changed: true
					});
				}

				return true;
			}
		},

		getRevisionNumber: function(local_path) {
			var CMD = "cd " + app_config.project_root + "&& git rev-list HEAD --count";
			if ((typeof(local_path) !== "undefined") && local_path !== null) {
				CMD = "cd " + local_path + "&& git rev-list HEAD --count";
			}
			var temp = exec.execSync(CMD).toString().replace("\n", "");
			this.version = parseInt(temp);
			return this.version;
		},

		getRevision: function(local_path) {
			var CMD = "cd " + app_config.project_root + "&& git rev-parse HEAD";
			if ((typeof(local_path) !== "undefined") && local_path !== null) {
				CMD = "cd " + local_path + "&& git rev-parse HEAD";
			}
			var temp = exec.execSync(CMD).toString().replace("\n", "");
			this.revision = temp;
			return temp;
		},

		// returns (platform); or calls back (success, platform)

		getPlatform: function(local_path, callback) {

			console.log("getPlatform on path: " + local_path);

			if (typeof(local_path) === "undefined") {
				callback(false, "local_path not defined");
				return;
			}

			var hasManifest = fs.existsSync(local_path + "thinx.json"); // try to read yml with node.js

			//
			// Arduino
			//

			var results = [];
			var isArduino = false;

			var inos = finder.from(local_path).findFiles('*.ino');
			var xinos = [];

			// Ignore all files in /examples/ (Arduino libs)
			for (var inoindex in inos) {
				if (inos[inoindex].indexOf("/examples/") === -1) {
					xinos.push(inos[inoindex]);
					results.push(xinos);
				}
			}

			if (xinos.length > 0) {
				isArduino = true;
			}

			//
			// Platformio
			//

			var isPlatformio = fs.existsSync(local_path + "/platformio.ini");
			if (isPlatformio) {
				isArduino = false;
			}

			//
			// Node
			//

			var isNodeJS = fs.existsSync(local_path + "/package.json");
			if (isNodeJS) {
				console.log("Repository is Node.js");
				isNode = true;
			}

			//
			// NodeMCU (Lua)
			//

			var isLua = fs.existsSync(local_path + "/init.lua");

			//
			// Micropython
			//

			var isPython = (fs.existsSync(local_path + "/boot.py") ||
				fs.existsSync(local_path + "/main.py"));
			if (isPython) {
				console.log("Repository is Micropython");
			}

			//
			// MongooseOS
			//

			var isMOS = fs.existsSync(local_path + "/mos.yml"); // https://mongoose-os.com/downloads/esp8266.zip

			//////////////////////////////////////////////////////
			// Decision logic
			//

			var platform = "unknown";

			// TODO: Assign platforms by plugin implementations instead of this, extact matching functions!

			if (isPlatformio) {

				platform = "platformio";

			} else if (isArduino) {

				platform = "arduino";

			} else if (isPython) {

				platform = "python";

			} else if (isLua) {

				platform = "nodemcu";

			} else if (isMOS) {

				platform = "mongoose";

			} else if (isNodeJS) {

				platform = "nodejs";

			}

			// console.log("Detected platform: " + platform);
			//
			var result = true;

			if (platform == "unknown") {
				console.log("Exiting on unknown platform.");
				result = false;
			}

			if (typeof(callback) !== "undefined") {
				callback(true, platform);
			} else {
				return platform;
			}

		}

	};

	return _public;

})();

exports.watchRepository = Repository.watchRepository;
exports.unwatchRepository = Repository.unwatchRepository;
exports.checkRepositoryChange = Repository.checkRepositoryChange;
exports.getRevisionNumber = Repository.getRevisionNumber;
exports.getRevision = Repository.getRevision;
exports.getPlatform = Repository.getPlatform;
