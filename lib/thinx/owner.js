/** This THiNX-RTM API module is responsible for managing userlib records. */

var Owner = (function() {

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

		profile: function(owner, callback) {

			userlib.get(owner, function(err, body) {
				if (err) {
					callback(false, err);
					return;
				}

				var avatar = app_config.default_avatar;
				if (typeof(body.avatar) !== "undefined") {
					avatar = body.avatar;
				}

				var fn = body.first_name;
				var ln = body.last_name;

				if (typeof(body.info) !== "undefined") {
					if (typeof(body.info.first_name !== "undefined")) {
						fn = body.info.first_name;
					}
					if (typeof(body.info.last_name !== "undefined")) {
						ln = body.info.first_name;
					}
				}

				var profile = {
					first_name: fn,
					last_name: ln,
					username: body.username,
					owner: body.owner,
					avatar: avatar,
					info: body.info
				};

				callback(true, profile);
			});
		}

	};

	return _public;

})();

exports.profile = Owner.profile;

// exports.create = Owner.create;
// exports.begin_reset_password = Owner.begin_reset_password;
// exports.password_reset = Owner.password_reset;
// exports.activate = Owner.activate;
// exports.set_password = Owner.set_password;

// Should go to rsakey.js
// exports.add_rsakey = Owner.add_rsakey;
// exports.remove_rsakeys = Owner.remove_rsakeys;
// exports.rsa_keys = Owner.rsa_keys;
