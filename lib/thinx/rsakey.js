/** This THiNX-RTM API module is responsible for managing RSA Keys. */

var RSAKey = (function() {

	var Rollbar = require("rollbar");
	var exec = require("child_process");

	var Globals = require("./globals.js");
  var app_config = Globals.app_config();
	var rollbar = Globals.rollbar();
	var prefix = Globals.prefix();

	var db = app_config.database_uri;
	var alog = require("./audit");
	var fs = require("fs-extra");

	var userlib = require("nano")(db).use(prefix + "managed_users");
	var fprint = require("ssh-fingerprint");

	// public
	var _public = {

		/**
		 * Revoke RSA Key for owner
		 * @param {string} owner - owner._id
		 * @param {string} revoked_filenames - array od RSA Key fingerprints to be revoked
		 * @param {function} callback(success, message) - operation result callback
		 */

		revoke: function(owner, revoked_filenames, callback) {

			userlib.get(owner, function(err, doc) {

				console.log("Keys to revoke: " + revoked_filenames);

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

				var key_paths = fs.readdirSync(app_config.ssh_keys).filter(
					file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
				);

				if (key_paths.count < 1) {
					console.log("no_rsa_key_found");
					callback(true, []);
					return;
				}

				var revoked_keys = [];

				for (var kindex in revoked_filenames) {
					var path = app_config.ssh_keys + "/" + key_paths[kindex];
					fs.unlinkSync(path);
					fs.unlinkSync(path + ".pub");
					revoked_keys.push(key_paths[kindex]);
				}

				if (typeof(callback) == "function") {
					try {
						callback(true, revoked_keys);
					} catch (e) {
						console.log(e);
					}

				} else {
					console.log("Warning! No callback set in rsakey.js:revoke");
				}

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

				var key_paths = fs.readdirSync(app_config.ssh_keys).filter(
					file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
				);

				if (key_paths.count < 1) {
					console.log("no_rsa_key_found");
					callback(true, []);
					return;
				}

				// get all fingerprints
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
				callback(true, exportedKeys);
			});

		},

		create: function(owner, callback) {
			var success = true;
			const date = new Date();
			const filename = owner + "-" + date.getTime();
			const keyname = app_config.ssh_keys + "/" + filename;
			const GENERATE_KEYS = 'cd ' + app_config.ssh_keys + ' && ssh-keygen -C "' + owner + '@' + process.env.APP_HOSTNAME + '" -q -N "" -t rsa -f ' + keyname;
			console.log("create command: "+GENERATE_KEYS);
			const result = exec.execSync(GENERATE_KEYS);
			var public = fs.readFileSync(keyname + ".pub").toString('utf8');
			callback(success, {
				name: date,
				pubkey: public,
				filename: filename
			});
		}

	};

	return _public;

})();

exports.revoke = RSAKey.revoke;
exports.create = RSAKey.create;
exports.list = RSAKey.list;
