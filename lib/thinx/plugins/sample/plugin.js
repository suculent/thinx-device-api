// Platform Support Plugin PoC

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

const platform = "arduino";

function load() {
    console.log(`[info] Platform plugin ${platform} loaded.`);
}

function check(path, callback) {

    // positive (primitive sample infer by name, not functional!)
    if (path.indexOf(platform) !== -1) {
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