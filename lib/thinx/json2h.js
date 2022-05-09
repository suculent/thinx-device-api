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

        console.log("[info] JSON2H output:\n", out_arr.join("\n"));

        return out_arr.join("\n"); // return array as string with newlines
    }

    static languageNameForPlatform(platform) {
        if (!Util.isDefined(platform)) return "<unknown-language>";
        console.log("[debug] languageNameForPlatform platform", platform);
        let language = JSON2H.languageForPlatform(platform);
        console.log("[debug] languageNameForPlatform language", language);
        let descriptor_path = `/opt/thinx/thinx-device-api/languages/${language}/descriptor.json`;
        console.log("[debug] languageNameForPlatform descriptor_path", descriptor_path);
        let file = fs.readFileSync(descriptor_path);
        let descriptor = JSON.parse(file);
        console.log("[debug] languageNameForPlatform descriptor", descriptor);
        return descriptor.name;
    }

    static languageForPlatform(platform) {
        console.log("[debug] languageForPlatform platform", platform);
        let descriptor_path = `/opt/thinx/thinx-device-api/platforms/${platform}/descriptor.json`;
        console.log("[debug] languageForPlatform descriptor_path", descriptor_path);
        let file = fs.readFileSync(descriptor_path);
        let descriptor = JSON.parse(file);
        console.log("[debug] languageForPlatform descriptor", descriptor);
        return descriptor.language;
    }

};