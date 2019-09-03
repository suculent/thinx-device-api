/** This THiNX-RTM API module is responsible for managing RSA Keys. */

var RSAKey = (function() {

	var Globals = require("./globals.js");
  var app_config = Globals.app_config();
	var db = app_config.database_uri;
	var exec = require("child_process");
	var fs = require("fs-extra");
	var prefix = Globals.prefix();
	var userlib = require("nano")(db).use(prefix + "managed_users");

	var revokeUserKeys = function(revoked_filenames) {
		var revoked_keys = [];
		for (var kindex in revoked_filenames) {
			var path = app_config.ssh_keys + "/" + key_paths[kindex];
			fs.unlinkSync(path);
			fs.unlinkSync(path + ".pub");
			revoked_keys.push(key_paths[kindex]);
		}
		return revoked_keys;
	};

	var exportKeysForList = function(key_paths, owner) {
		var exportedKeys = [];
		for (var kindex in key_paths) {
			var path = app_config.ssh_keys + "/" + key_paths[kindex] + ".pub";
			const key_data = fs.readFileSync(path);
			var tstamp = parseInt(key_paths[kindex].replace(owner+"-", ""), 10);
			var info = {
				name: new Date(tstamp).toString(),
				fingerprint: key_data.toString('utf8'), // TODO: FIXME: needs proper fingerprint, what is this?
				date: new Date(tstamp).toString(),
				pubkey: key_data.toString('utf8'),
				filename: key_paths[kindex]
			};
			exportedKeys.push(info);
		}
		return exportedKeys;
	};

	var keyPathsExist = function(owner) {
		var key_paths = fs.readdirSync(app_config.ssh_keys).filter(
			file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
		);
		return (key_paths.count > 0);
	};

	var revokeUserKeysAndCallback = function(revoked_filenames, callback) {
		const revoked_keys = revokeUserKeys(revoked_filenames);
		console.log("Keys revoked: " + JSON.stringify(revoked_keys));
		if (typeof(callback) === "function") {
			callback((revoked_keys.count > 0), revoked_keys);
		}
	};

	// public
	var _public = {

		/**
		 * Revoke RSA Key for owner
		 * @param {string} owner - owner._id
		 * @param {string} revoked_filenames - array od RSA Key fingerprints to be revoked
		 * @param {function} callback(success, message) - operation result callback
		 */

		revoke: function(owner, revoked_filenames, callback) {
			if (!keyPathsExist(owner)) {
				console.log("no_rsa_keys_found");
				callback(true, []);
				return;
			}
			userlib.get(owner, function(err, doc) {
				if (err || !doc) {
					callback(false, "owner_not_found");
					return;
				}
				if (!doc.hasOwnProperty("rsa_keys")) {
					callback(false, "no_keys");
					return;
				}
				revokeUserKeysAndCallback(revoked_filenames, callback);
			});
		},

		list: function(owner, callback) {
			var key_paths = fs.readdirSync(app_config.ssh_keys).filter(
				file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
			);
			if (key_paths.count < 1) {
				console.log("no_rsa_key_found");
				callback(true, []);
				return;
			}
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
				callback(true, exportKeysForList(key_paths, owner));
			});
		},

		create: function(owner, callback) {
			const date = new Date();
			const filename = owner + "-" + date.getTime();
			const keyname = app_config.ssh_keys + "/" + filename;
			const GENERATE_KEYS = 'cd ' + app_config.ssh_keys + ' && ssh-keygen -C "' + owner + '@' + process.env.THINX_HOSTNAME + '" -q -N "" -t rsa -f ' + keyname;
			const result = exec.execSync(GENERATE_KEYS);
			var public_key = fs.readFileSync(keyname + ".pub").toString('utf8');
			callback(true, {
				name: date,
				pubkey: public_key,
				filename: filename
			});
		}
	};
	return _public;
})();

exports.revoke = RSAKey.revoke;
exports.create = RSAKey.create;
exports.list = RSAKey.list;
