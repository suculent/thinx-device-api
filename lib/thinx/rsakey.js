/** This THiNX-RTM API module is responsible for managing RSA Keys. */

var RSAKey = (function() {

	var Rollbar = require("rollbar");
	var exec = require("child_process");

	var app_config = require("../../conf/config.json");
	if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
		console.log("» Configuring for Circle CI...");
		app_config = require("../../conf/config-test.json");
	}
	var rollbar = new Rollbar({
		accessToken: app_config.rollbar_token,
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});
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

				var key_paths = fs.readdirSync("/root/.ssh/").filter(
					file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
				);

				if (key_paths.count < 1) {
					console.log("no_rsa_key_found");
					callback(true, []);
					return;
				}

				var revoked_keys = [];

				for (var kindex in revoked_filenames) {
					var path = "/root/.ssh/" + key_paths[kindex];
					fs.unlink(path);
					fs.unlink(path + ".pub");
					revoked_keys.push(key_paths[kindex]);
				}

				callback(true, revoked_keys);

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

				var key_paths = fs.readdirSync("/root/.ssh/").filter(
					file => ((file.indexOf(owner) !== -1) && (file.indexOf(".pub") === -1))
				);

				if (key_paths.count < 1) {
					console.log("no_rsa_key_found");
					callback(true, []);
					return;
				}

				// get all fingerprints
				for (var kindex in key_paths) {
					var path = "/root/.ssh/" + key_paths[kindex] + ".pub";
					const key_data = fs.readFileSync(path);
					var tstamp = parseInt(key_paths[kindex].replace(owner+"-", ""));
					var info = {
						name: new Date(tstamp).toString(),
						fingerprint: key_data.toString('utf8'),
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
			const keyname = "/root/.ssh/" + filename;
			const GENERATE_KEYS = 'cd /root/.ssh/ && ssh-keygen -C "' + owner + '@thinx.cloud" -q -N "" -t rsa -f ' + keyname;
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
