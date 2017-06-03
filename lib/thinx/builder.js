/** This THiNX-RTM API module is responsible for managing builds and should be offloadable to another server. */

var Builder = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var nano = require("nano")(db);

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

// exports.build = Builder.build;
