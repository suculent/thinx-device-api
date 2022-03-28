/* THiNX Platform Support Plugin PoC */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

const platform = "sample";

function load() {
    // constructor if required
}

function check(path) {

    // prevent false positive in production, make sure to set 'test' environment when running npm test from console
    if (process.env.ENVIRONMENT == "test") {
        // positive (primitive sample infer by name, not functional!)
        if (path.indexOf("arduino") !== -1) {
            return platform;
        }
    }

    // negative
    return false;
}

module.exports = {
    load,
    check
};