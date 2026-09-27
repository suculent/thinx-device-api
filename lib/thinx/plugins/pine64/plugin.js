/* THiNX Platform Support Plugin for Pine64 */

// Main job for this class is to be able to detect platform inside a code repository (return false or platform)

// The Makefile belongs to the repository, so it is read through safepath
// (contained, no symlink, O_NOFOLLOW). A symlinked Makefile used to be followed,
// and when the keyword was missing its whole content went to the API log -- a
// way to copy any readable file (e.g. /run/secrets/*) into the logs. Only the
// path and a reason are logged now, never the content.
const safepath = require("../../safepath");

const platform = "pine64";

function load() {
    // constructor if required
}

function check(path) {

    const makefile = safepath.readFileInside(path, "Makefile", "utf8");

    if (!makefile.ok) {
        if (makefile.reason !== "missing") {
            console.log("⚠️ [warning] pine64: ignoring Makefile in", path, "(" + makefile.reason + ")");
        }
        // negative
        return false;
    }

    // positive
    if (makefile.data.indexOf('BL60X') !== -1) {
        return platform;
    }

    console.log("ℹ️ [info] Makefile found for Pine64, but it does not contain the BL60X keyword:", path);

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
