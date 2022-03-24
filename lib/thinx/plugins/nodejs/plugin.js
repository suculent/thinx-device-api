// THiNX Platform Support Plugin for NodeJS

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

var fs = require("fs-extra");

const platform = "nodejs";

function load() {
    console.log(`[info] [plugin] ${platform} ready.`);
}

function check(path, callback) {

    // positive
    if (fs.existsSync(path + "/package.json")) {
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