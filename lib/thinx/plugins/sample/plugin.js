/* THiNX Platform Support Plugin PoC */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

const platform = "sample";

function load() {
    // constructor if required
}

function check(path, callback) {

    // prevent false positive in production, make sure to set 'test' environment when running npm test from console
    if (process.env.ENVIRONMENT == "test") {
        // positive (primitive sample infer by name, not functional!)
        if (path.indexOf("arduino") !== -1) {
            if (typeof(callback) !== "undefined") {
                callback(true, platform);
            } else return platform;
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