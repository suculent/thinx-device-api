/** This THiNX-RTM API module is responsible for managing RSA Keys. */

var RSAKey = (function() {

	var Rollbar = require("rollbar");

	var rollbar = new Rollbar({
		accessToken: "5505bac5dc6c4542ba3bd947a150cb55",
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var db = app_config.database_uri;
	var alog = require("./audit");

	var prefix = "";
	try {
		var pfx_path = app_config.project_root + '/conf/.thx_prefix';
		if (fs.existsSync(pfx_path)) {
			prefix = fs.readFileSync(pfx_path) + "_";
		}
	} catch (e) {
		//console.log(e);
	}

	var userlib = require("nano")(db).use(prefix + "managed_users");
	var fprint = require("ssh-fingerprint");
	var fs = require("fs");


	// public
	var _public = {

		/**
		 * Revoke RSA Key for owner
		 * @param {string} owner - owner._id
		 * @param {string} revoked_fingerprints - array od RSA Key fingerprints to be revoked
		 * @param {function} callback(success, message) - operation result callback
		 */

		revoke: function(owner, revoked_fingerprints, callback) {

			userlib.get(owner, function(err, doc) {

				if (err || !doc) {
					if (err) {
						console.log("ERRX:" + err);
					} else {
						console.log("User " + owner + " not found.");
					}
					callback(false, "owner_not_found");
					return;
				}

				if (!doc.hasOwnProperty("rsa_keys")) {
					Rollbar.warning("User " + owner + " has no RSA keys.");
					callback(false, "no_keys");
					return;
				}

				//console.log("revoking RSA doc:" + JSON.stringify(doc));

				// Search RSA key by hash
				var keys = doc.rsa_keys;
				var delete_key = false;

				if (typeof(keys) === "undefined") {
					callback(false, "rsa_keys_not_found");
					return;
				}

				var fingerprints = Object.keys(keys);
				console.log("Searching " + JSON.stringify(revoked_fingerprints) +
					" in " + JSON.stringify(fingerprints));

				var new_keys = {}; // may deprecate
				var revoked = [];
				for (var findex in revoked_fingerprints) {
					var fingerprint = revoked_fingerprints[findex];
					for (var i = 0; i < fingerprints.length; i++) {
						var key = keys[fingerprint];
						var query = fingerprints[i];
						if (query.indexOf(fingerprint) !== -1) {
							if (fs.existsSync(key.key)) {
								console.log("Deleting RSA key file:" + key.key);
								fs.unlink(key.key);
							}
							console.log("Removing RSA key from database: " +
								fingerprint);
							revoked.push(fingerprint);
							delete doc.rsa_keys[fingerprint]; // dupe!
							delete keys[fingerprint];
							delete_key = true;
						} else {
							new_keys[fingerprint] = key; // may deprecate
						}
					}
				}

				if (delete_key === false) {
					callback(false, "fingerprint_not_found:" + JSON.stringify(
						revoked_fingerprints));
					return;
				}

				var changes = {};
				changes.last_update = new Date();
				changes.rsa_keys = keys;
				userlib.atomic("users", "edit", doc._id, changes, function(error,
					body) {
					if (error) {
						console.log("rsa_revocation_failed:" + error);
						callback(false, "rsa_revocation_failed");
					} else {
						alog.log(owner, "RSA key revoked successfully.");
						callback(true, revoked);
					}
				});
			});

		},

		add: function(owner, new_key_alias, new_key_body, callback) {

			var new_key_fingerprint = fprint(new_key_body);

			userlib.get(owner, function(err, doc) {

				if (err) {
					console.log(err);
					callback(false, "user_not_found:" + owner);
					return;
				}

				if (!doc) {
					console.log("User " + owner + " not found.");
					callback(false, "userid_not_found");
					return;
				}

				if (typeof(doc.rsa_keys) === "undefined") {
					doc.rsa_keys = {};
				} else {
					if ((typeof(doc.rsa_keys[new_key_fingerprint]) !==
							"undefined") && (doc.rsa_keys[new_key_fingerprint] !==
							null)) {
						console.log("RSA Key " + new_key_fingerprint +
							" already exists, overwriting...");
						//callback(false, "already_exists, overwriting...");
					}
				}

				var file_name = owner + "-" + Math.floor(new Date() /
					1000) + ".pub";
				var ssh_path = "../.ssh/" + file_name;

				var new_ssh_key = {
					alias: new_key_alias,
					key: ssh_path
				};

				fs.open(ssh_path, "w+", function(err, fd) {
					if (err) {
						console.log(err);
					} else {
						fs.writeFile(ssh_path, new_key_body, function(err) {
							if (err) {
								console.log(err);
							} else {
								fs.close(fd, function() {
									console.log("RSA key installed...");
								});
								fs.chmodSync(ssh_path, "400");
							}
						});
					}
				});

				console.log("[OID:" + owner + "] [__RSAKEY_ADDED__] " +
					new_key_fingerprint);

				var changes = {};
				changes.rsa_keys = doc.rsa_keys;
				changes.rsa_keys[new_key_fingerprint] = new_ssh_key;
				userlib.atomic("users", "edit", doc._id, changes, function(error,
					body) {
					if (error) {
						console.log("/api/user/rsakey ERROR:" + error);
						callback(false, "key_not_added");
					} else {
						console.log("[RSAKEY_ADDED] RSA Key successfully added.");
						callback(true, new_key_fingerprint);
					}
				});
			});
		},

		list: function(owner, callback) {

			userlib.get(owner, function(err, user) {

				if (err) {
					console.log(err);
					callback(false, "user_not_found");
					return;
				}

				if (typeof(user) === "undefined") {
					console.log("User " + owner + " not found.");
					callback(false, "userid_not_found");
					return;
				}

				var exportedKeys = [];
				var fingerprints = Object.keys(user.rsa_keys);
				for (var i = 0; i < fingerprints.length; i++) {
					var key = user.rsa_keys[fingerprints[i]];
					var info = {
						name: key.alias,
						fingerprint: fingerprints[i]
					};
					exportedKeys.push(info);
				}
				callback(true, exportedKeys);
			});

		},

		create: function(owner, callback) {

			var success = true;
			const keyname = "/root/.ssh/" + owner + "-" + new Date().getTime();
			const GENERATE_KEYS = 'cd /root/.ssh/ && ssh-keygen -q -N "" -t rsa -f ' + keypath;
			const result = exec.execSync(GENERATE_KEYS);
			const public = fs.readFileSync(keyname + ".pub");

			console.log("RSA create result: "+public);

			callback(success, {
				pub: public,
			});
		}

	};

	return _public;

})();

exports.revoke = RSAKey.revoke;
exports.add = RSAKey.add;
exports.list = RSAKey.list;
exports.rsa_keys = RSAKey.list;
