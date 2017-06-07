/** This THiNX-RTM API module is responsible for managing RSA Keys. */

var RSAKey = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var userlib = require("nano")(db).use("managed_users");
	var fprint = require('ssh-fingerprint');
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

				// Search RSA key by hash
				var keys = doc.rsa_keys;
				var delete_key = null;

				if (typeof(keys !== "undefined")) {
					//
				} else {
					callback(false, "rsa_keys_not_found");
					return;
				}

				var fingerprints = Object.keys(doc.rsa_keys);
				if (typeof(doc.rsa_keys) === "undefined") {
					console.log("ERROR: No fingerprints in keys: " + JSON.stringify(
						keys));
					callback(false, "fingerprint_not_found");
					return;
				}

				var new_keys = {};
				var revoked = [];
				for (var findex in revoked_fingerprints) {
					var fingerprint = revoked_fingerprints[findex];
					console.log("Searching for revoked fingerprint: " +
						fingerprint);

					for (var i = 0; i < fingerprints.length; i++) {
						var key = doc.rsa_keys[fingerprints[i]];
						if (query.indexOf(fingerprint) !== -1) {
							if (fs.existsSync(key.key)) {
								console.log("Deleting RSA key file:" + key.key);
								fs.unlink(key.key);
							}
							console.log("Removing RSA key from database: " +
								fingerprint);
							revoked.push(fingerprint);
							delete_key = true;
						} else {
							new_keys[fingerprint] = key;
						}
					}
				}

				if (delete_key !== null) {
					doc.last_update = new Date();
					doc.rsa_keys = new_keys;
				} else {
					callback(false, "no_fingerprint_found");
					return;
				}

				userlib.destroy(doc._id, doc._rev, function(err) {
					delete doc._rev;
					userlib.insert(doc, doc._id, function(err) {
						if (err) {
							console.log("rsa_revocation_failed:" + err);
							callback(false, "rsa_revocation_failed");
						} else {
							callback(true, revoked);
						}
					});
				});
			});

		},

		add: function(owner, new_key_alias, new_key_body, callback) {

			var new_key_fingerprint = fprint(new_key_body);

			userlib.get(owner, function(err, doc) {

				if (err) {
					console.log(err);
					callback(false, "user_not_found");
					return;
				}

				if (!doc) {
					console.log("User " + owner + " not found.");
					callback(false, "userid_not_found");
					return;
				}

				var file_name = owner + "-" + Math.floor(new Date() /
					1000) + ".pub";
				var ssh_path = "../.ssh/" + file_name;

				var new_ssh_key = {
					alias: new_key_alias,
					key: ssh_path
				};

				fs.open(ssh_path, 'w+', function(err, fd) {
					if (err) {
						console.log(err);
					} else {
						fs.writeFile(ssh_path, new_ssh_key, function(err) {
							if (err) {
								console.log(err);
							} else {
								fs.close(fd, function() {
									console.log('RSA key installed...');
								});
								fs.chmodSync(ssh_path, '644');
							}
						});
					}
				});

				if (typeof(doc.rsa_keys) === "undefined") {
					doc.rsa_keys = {};
				} else {
					if ((typeof(doc.rsa_keys[new_key_fingerprint]) !==
							"undefined") && (doc.rsa_keys[new_key_fingerprint] !==
							null)) {
						console.log("RSA Key " + new_key_fingerprint +
							" already exists.");
						callback(false, "already_exists");
						return;
					}
				}

				console.log("[OID:" + owner + "] [__RSAKEY_ADDED__] " +
					new_key_fingerprint);

				doc.rsa_keys[new_key_fingerprint] = new_ssh_key;

				userlib.destroy(doc._id, doc._rev, function(err) {

					delete doc._rev;

					userlib.insert(doc, doc._id, function(err, body, header) {
						if (err) {
							console.log("/api/user/rsakey ERROR:" + err);
							callback(false, "key_not_added");
						} else {
							console.log("[RSAKEY_ADDED] RSA Key successfully added.");
							callback(true, new_key_fingerprint);
						}
					});
				});
			});

		},

		list: function(owner, callback) {
			// TODO: TODO: TODO: Start from here and move rest of function code to rsakey.js:list

			// Get all users
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

		}

	};

	return _public;

})();

exports.revoke = RSAKey.revoke;
exports.add = RSAKey.add;
exports.list = RSAKey.list;
exports.rsa_keys = RSAKey.list;
