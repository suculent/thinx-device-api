const Util = require("./util");
const fs = require("fs-extra");

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

    /** Returns the parsed descriptor, or null when it is missing or unreadable. */
    static readDescriptor(kind, name) {
        let descriptor_path = `/opt/thinx/thinx-device-api/${kind}/${name}/descriptor.json`;
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