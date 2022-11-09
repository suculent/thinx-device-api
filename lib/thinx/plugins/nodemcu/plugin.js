/* THiNX Platform Support Plugin for NodeMCU/Lua */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

var fs = require("fs-extra");

const platform = "nodemcu";

function load() {
    // constructor if required
}

function check(path) {

    // positive
    if (fs.existsSync(path + "/init.lua")) {
       return platform;
    }

    // negative
    return false;
}

function extensions() {
    return ['*.lua'];
}

module.exports = {
    load,
    check,
    extensions
};