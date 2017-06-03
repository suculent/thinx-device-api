/** This THiNX-RTM API module is responsible for managing RSA Keys. */

var RSAKey = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);
	var userlib = require("nano")(db).use("managed_users");

	var sha256 = require("sha256");

	var Rollbar = require('rollbar');

	var rollbar = new Rollbar({
		accessToken: '5505bac5dc6c4542ba3bd947a150cb55',
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

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
				for (var fingerprint in revoked_fingerprints) {
					for (var i = 0; i < fingerprints.length; i++) {
						var key = doc.rsa_keys[fingerprints[i]];
						if (fingerprints[i].indexOf(fingerprint) !== -1) {
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

		add: function(owner, body, callback) {

		},

		list: function(owner, callback) {

		}

	};

	return _public;

})();

exports.revoke = RSAKey.revoke;
exports.add = RSAKey.add;
exports.rsa_keys = RSAKey.list;
