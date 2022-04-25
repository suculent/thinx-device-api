/* THiNX Platform Support Plugin for NodeJS */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

var fs = require("fs-extra");

const platform = "nodejs";

function load() {
    // constructor if required
}

function check(path) {

    // positive
    if (fs.existsSync(path + "/package.json")) {
        return platform;
    }

    // negative
    return false;
}

function extensions() {
    return ['*.js'];
}

module.exports = {
    load,
    check,
    extensions
};