// Shared Filesystem Methods

const Globals = require("./globals.js");
const app_config = Globals.app_config(); // for data_root, deploy_root
const fs = require("fs-extra");

module.exports = class Filez {

    static appRoot() {
        return "/opt/thinx/thinx-device-api";
    }

    static deployPathForDevice(owner, udid) {
		return Filez.deployPathForOwner(owner) + "/" + udid;	
	}

    static deployPathForOwner(owner) {
		return app_config.data_root + app_config.deploy_root + "/" + owner;
	}
};