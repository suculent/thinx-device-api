/*
 * This THiNX-RTM API module is responsible for returning current app version.
 */

// Usage:
// require("lib/version.js");
// var v = new Version();

module.exports = function(log) {
	// console.log("Exports called");
};

function Version() {
	this.version = Version.prototype.value();
	return this.version;
}

Version.prototype.value = function() {
	var exec = require("sync-exec");
	CMD = "git rev-list HEAD --count";
	var temp = exec(CMD).stdout.replace('\n', '');
	return parseInt(temp);
};
