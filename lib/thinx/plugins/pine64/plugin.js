/* THiNX Platform Support Plugin for Pine64 */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

var fs = require("fs-extra");

const platform = "pine64";

function load() {
    // constructor if required
}

function check(path, callback) {

    // positive
    if (fs.existsSync(path + "/Makefile")) {
        let pineFile;
        try {
            pineFile = fs.readFileSync(path + "/Makefile");
            if (pineFile.toString().indexOf('BL60X') === -1) {
                console.log("ℹ️ [info] Makefile found for Pine64, but does not contain BL60X keyword in file:\n", pineFile.toString());
            } else {
                if (typeof(callback) !== "undefined") {
                    callback(true, platform);
                } else return platform;
            }
        } catch(e) {
            console.log("☣️ [error] pine64 import failed", e);
        }
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