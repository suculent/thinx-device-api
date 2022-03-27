/* THiNX Platform Support Plugin for NodeMCU/Lua */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

var fs = require("fs-extra");

const platform = "nodemcu";

function load() {
    // constructor if required
}

function check(path, callback) {

    // positive
    if (fs.existsSync(path + "/init.lua")) {
        if (typeof(callback) !== "undefined") {
            callback(true, platform);
        } else return platform;
    }

    // negative
    if (typeof(callback) !== "undefined") {
        callback(false);
    } else return false;
}

module.exports = {
    load,
    check
};