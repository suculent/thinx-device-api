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
                value = value.replace("%%" + template_name + "%%", opts[template_name]); // strip all percent signs                
            }

            let outline = `#define ${key}="${value}"`;
            out_arr.push(outline);
        }
        return out_arr.join("\n"); // return array as string with newlines
    }

};