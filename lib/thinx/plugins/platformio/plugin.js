/* THiNX Platform Support Plugin for PlatformIO */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

var fs = require("fs-extra");

const platform = "platformio";

function load() {
    // constructor if required
}

function check(path) {

    // positive
    if (fs.existsSync(path + "/platformio.ini")) {
        return platform;
    }

    // negative
    return false;
}

function extensions() {
    return ['*.bin'];
}

module.exports = {
    load,
    check,
    extensions
};