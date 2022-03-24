// THiNX Platform Support Plugin for Arduino

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

const platform = "arduino";

var finder = require("fs-finder");

function load() {
    console.log(`[info] [plugin] ${platform} ready.`);
}

function check(path, callback) {

    var inos = finder.from(path).findFiles('*.ino');
    var xinos = [];

    // Ignore all files in /examples/ (Arduino libs)
    for (var inoindex in inos) {
        if (inos[inoindex].indexOf("/lib/") === -1) {
            xinos.push(inos[inoindex]);
        }
    }

    // positive
    if (xinos.length > 0) {
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