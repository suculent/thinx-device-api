//
// Constants
//

const client_user_agent = "THiNX-Client";

//
// Shared Configuration
//

var config = require("./conf/config.json");
const db = config.database_uri;

//
// Version Management
//

/* Returns currently available version for respective owner and mac address */
function availableVersionForDevice(owner, mac) {

	// if MAC=any, provide version of recent thinx-esp8266-firmware

	// else check the owner folder

	// searches in deployment directory

	// Get path for owner (and optinaly a device)
	var user_path = config.deploy_root + '/' + owner;
	var device_path = user_path;
	if (mac.indexOf("ANY") != -1) {
		device_path = device_path + '/' + mac
	}

	// Find latest binary, fetch version

}

function hasUpdateAvailable(device) {

	var deviceVersion = device.version;
	var deployedVersion = availableVersionForDevice(device.owner, device.mac);

	if (semver.valid(deviceVersion) == true) {



	} else {

	}

	semver.satisfies('1.2.3', '1.x || >=2.5.0 || 5.0.0 - 7.2.3') // true
	semver.gt('1.2.3', '9.8.7') // false
	semver.lt('1.2.3', '9.8.7') // true
}
