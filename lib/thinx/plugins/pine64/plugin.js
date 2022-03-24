// THiNX Platform Support Plugin for Pine64

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

var fs = require("fs-extra");

const platform = "pine64";

function load() {
    console.log(`[info] [plugin] ${platform} ready.`);
}

function check(path, callback) {

    // positive
    var isPine64 = fs.existsSync(path + "/Makefile");
    if (isPine64) {
        let pineFile;
        try {
            pineFile = fs.readFileSync(path + "/Makefile");
            if (pineFile.toString().indexOf('BL60X') === -1) {
                console.log("ℹ️ [info] Makefile found for Pine64, but does not contain BL60X keyword in file:\n", pineFile.toString());
                isPine64 = false;
            } else {
                isPine64 = true;
            }
        } catch(e) {
            console.log("☣️ [error] pine64 import failed", e);
            isPine64 = false;
        }
    }
    
    if (isPine64) {
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