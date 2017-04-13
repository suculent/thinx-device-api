/*
 * This THiNX-RTM API module is responsible for returning current app version.
 */

// Usage:
// require('./lib/thinx/version.js');
// var v = new Version();
// v.revision();

// Definitive Module Pattern
var Version = (function() {

	// public
	var _public = {
		revision: function() {
			var exec = require("sync-exec");
			CMD = "git rev-list HEAD --count";
			var temp = exec(CMD).stdout.replace("\n", "");
			this.version = parseInt(temp);
			return this.version;
		}
	};

	return _public;

})();

exports.revision = Version.revision;
