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

	};

	return _public;

})();

// exports.create = Owner.create;
// exports.begin_reset_password = Owner.begin_reset_password;
// exports.password_reset = Owner.password_reset;
// exports.activate = Owner.activate;
// exports.set_password = Owner.set_password;
// exports.profile = Owner.profile;
// exports.add_source = Owner.add_source;
// exports.remove_sources = Owner.remove_sources;
// exports.sources = Owner.sources;
// exports.add_rsakey = Owner.add_rsakey;
// exports.remove_rsakeys = Owner.remove_rsakeys;
// exports.rsa_keys = Owner.rsa_keys;
