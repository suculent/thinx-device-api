const Util = require("./util");
const fs = require("fs-extra");
const path = require("path");

// Descriptors ship with the application: <app root>/platforms/<name>/descriptor.json
// and <app root>/languages/<name>/descriptor.json. `kind` is never free-form,
// it is one of these two (see languageForPlatform/languageNameForPlatform).
const APP_ROOT = "/opt/thinx/thinx-device-api"; // same value as Filez.appRoot()
const DESCRIPTOR_KINDS = ["platforms", "languages"];

/** JSON to C-header conversion, replacing legacy shell functions in `infer` */
module.exports = class JSON2H {

    /** This function should create C-Header multiline from JSON file, injecting opts (same-named env-vars) */
    static convert(json, destination, opts) {
        let header = JSON2H.process(json, opts);
        JSON2H.writeFile(destination, header);
    }

    static writeFile(destination, header) {
        fs.writeFile(destination, header);
    }

    static process(json, opts) {

        let out_arr = [];
        let keys = Object.keys(json);
        for (let key of keys) {
            let value = json[key];
            // replace %%PLACEHOLDER%% with respectively named value in opts
            if ((typeof (value) === "string") && (value.indexOf("%%") !== -1)) {
                let template_name = value.replace(/^(.*)%%(.*)%%(.*)$/, "$2");
                if (!Util.isDefined(opts[template_name])) {
                    value = value.replace("%%" + template_name + "%%", opts[template_name]); // strip all percent signs                
                } else {
                    console.log(`[warning] JSON2H ${template_name} missing in OPTS while rewriting ${value}`);
                }
            }

            let outline;

            if (typeof(value) === "string") {
                outline  = `#define ${key} "${value}"`;
            } else {
                if (typeof(value) !== "undefined") {
                    outline = `#define ${key} ${value}`;
                } else {
                    console.log("[warning] JSON2H value undefined for key: ", key);
                }
            }
            
            out_arr.push(outline);
        }

        // Terminate the last line as well: services/worker/builder appends
        // `#define ENV_HASH "..."` with `>>`, and an unterminated last line
        // would swallow it into the preceding #define.
        return out_arr.join("\n") + "\n";
    }

    /**
     * A device platform carries an optional ":<arch>" suffix -- "platformio:esp8266",
     * "arduino:esp8266" -- but descriptors live under the bare platform name.
     * builder.js:722 and deployment.js:237 both strip it; this did not, so the
     * lookup went to platforms/platformio:esp8266/descriptor.json, which does
     * not exist.
     */
    static basePlatform(platform) {
        return String(platform).split(":")[0]; // works without the delimiter too
    }

    /**
     * The application root holding platforms/ and languages/. Inside the container
     * this is /opt/thinx/thinx-device-api; outside it (local dev, plain-node tests)
     * fall back to the repository root, which carries the very same trees.
     */
    static descriptorRoot() {
        if (fs.existsSync(APP_ROOT)) return APP_ROOT;
        return path.resolve(__dirname, "..", "..");
    }

    /**
     * Pure containment guard (SEC: path traversal / require(variable)).
     *
     * Resolves `<root>/<name>` but ONLY when `name` is an exact match of one of
     * the directory names actually present in `root`. Anything else -- a relative
     * walk ("../../etc"), an encoded one ("..%2f.."), an embedded separator
     * ("nodemcu/../../.."), an absolute path, an empty/non-string value, or a
     * name that simply does not exist -- returns null. The resolve/relative
     * assertion afterwards is belt and braces, matching lib/thinx/secrets.js:27-31.
     *
     * Returns the absolute directory path, or null. Never throws.
     */
    static safeDirectory(root, name) {
        if ((typeof (name) !== "string") || (name.length === 0)) return null;
        let entries;
        try {
            entries = fs.readdirSync(root, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name);
        } catch (_e) {
            return null; // unreadable root: nothing can be validated against it
        }
        if (entries.indexOf(name) === -1) return null;
        const base = path.resolve(root);
        const candidate = path.resolve(base, name);
        const relative = path.relative(base, candidate);
        if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
        return candidate;
    }

    /**
     * Validates a platform name (with or without the ":<arch>" suffix) against the
     * real platforms/ listing. Returns the absolute platform directory, or null.
     * Used by builder.js, where the platform name comes from the build repository's
     * own thinx.yml and is therefore attacker-controlled.
     */
    static validatedPlatformDirectory(platforms_root, platform) {
        if ((typeof (platform) !== "string") || (platform.length === 0)) return null;
        return JSON2H.safeDirectory(platforms_root, JSON2H.basePlatform(platform));
    }

    /** Returns the parsed descriptor, or null when it is missing or unreadable. */
    static readDescriptor(kind, name) {
        if (DESCRIPTOR_KINDS.indexOf(kind) === -1) {
            console.log(`[warning] JSON2H unsupported descriptor kind: ${JSON.stringify(kind)}`);
            return null;
        }
        let directory = JSON2H.safeDirectory(path.join(JSON2H.descriptorRoot(), kind), name);
        if (directory === null) {
            console.log(`[warning] JSON2H no ${kind} descriptor for ${JSON.stringify(name)}`);
            return null;
        }
        let descriptor_path = path.join(directory, "descriptor.json");
        try {
            return JSON.parse(fs.readFileSync(descriptor_path));
        } catch {
            // readFileSync used to throw straight out of the build here. Nothing
            // catches it up the stack, so a device whose platform had no matching
            // descriptor killed run_build() silently, right after the path was
            // logged, with no state change and no error in the build log.
            console.log(`[warning] JSON2H no ${kind} descriptor at ${descriptor_path}`);
            return null;
        }
    }

    static languageNameForPlatform(platform) {
        if (!Util.isDefined(platform)) return "<unknown-language>";
        let language = JSON2H.languageForPlatform(platform);
        if (language === null) return "<unknown-language>";
        let descriptor = JSON2H.readDescriptor("languages", language);
        if (descriptor === null) return "<unknown-language>";
        return descriptor.name;
    }

    static languageForPlatform(platform) {
        let descriptor = JSON2H.readDescriptor("platforms", JSON2H.basePlatform(platform));
        if (descriptor === null) return null;
        return descriptor.language;
    }

};