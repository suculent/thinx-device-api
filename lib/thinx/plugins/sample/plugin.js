// Platform Support Plugin PoC

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

const platform = "sample";

function load() {
    console.log(`[info] Platform plugin ${platform} loaded.`);
}

function check(path, callback) {

    if (typeof(callback) !== "undefined") {
        callback(true, platform);
    } else return platform;


    if (typeof(callback) !== "undefined") {
        callback(false);
    } else return false;
  
    // if platform is detected, return platform shortname
}

module.exports = {
    load,
    check
};