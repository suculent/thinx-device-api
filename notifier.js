/* 
 * This THiNX-RTM module is responsible for saving build results to database and notifying users/devices 
 */

 "use strict";

const db = "http://rtmapi:frohikey@localhost:5984";

var http = require('http');
var parser = require('body-parser');
var nano = require("nano")(db);

var rdict = {};

console.log("-=[ ☢ THiNX IoT RTM NOTIFIER ☢ ]=-" + '\n');

// Parse input params

var build_id = process.argv[2];
var commit_id = process.argv[3];
var version = process.argv[4];
var repo_url = process.argv[5];
var build_path = process.argv[6];
var mac = process.argv[7];
var sha = process.argv[8];
var status = process.argv[9];

// Validate params

console.log("build_id : " + build_id + '\n');
console.log("commit_id : " + commit_id + '\n');
console.log("version : " + version + '\n');
console.log("repo_url : " + repo_url + '\n');
console.log("build_path : " + build_path + '\n');
console.log("mac : " + mac + '\n');
console.log("sha : " + sha + '\n');
console.log("status : " + status + '\n');

// Prepare payload

var pushNotificationPayload = {
  firmware_update: {
    url: build_path,
    mac: mac,
    commit: commit_id,
    version: version,
    checksum: sha
  }
}

// Initially creates DB, otherwise fails silently.
nano.db.create("managed_repos", function (err, body, header) {
	if (err) {
		if (err == "Error: The database could not be created, the file already exists.") {
			// silently fail, this is ok
		} else {
			console.log("» Repository database creation completed. " + err + "\n");
		}
	} else {
		console.log("» Repository database creation completed. Response: " + JSON.stringify(body) + "\n");
	}
});

var gitlib = require("nano")(db).use("managed_repos");
var devicelib = require("nano")(db).use("managed_devices");

// Select targets

// -- fetch devices with matching MAC or any
// -- collect push tokens (each only once)

// Notify devices (MQTT)

// Notify users (FCM)

var message = {  
    data: {
    	type: "update",
        url: "/bin/test/firmware.elf",
        mac: "5C:CF:7F:EE:90:E0;ANY",
        commit: "18ee75e3a56c07a9eff08f75df69ef96f919653f",
        version: "0.1",
        checksum: "6bf6bd7fc983af6c900d8fe162acc3ba585c446ae0188e52802004631d854c60"
    },
    notification : {
        title : 'Update',
        body : 'New firmware update is available.'
    }
};

// This registration token comes from the client FCM SDKs.
var registrationToken = "dhho4djVGeQ:APA91bFuuZWXDQ8vSR0YKyjWIiwIoTB1ePqcyqZFU3PIxvyZMy9htu9LGPmimfzdrliRfAdci-AtzgLCIV72xmoykk-kHcYRhAFWFOChULOGxrDi00x8GgenORhx_JVxUN_fjtsN5B7T";

// See the "Defining the message payload" section below for details


var admin = require("firebase-admin");
//firebase-adminsdk-wjhzo@thinx-cloud.iam.gserviceaccount.com
var serviceAccount = require("./thinx-cloud-firebase-adminsdk-wjhzo-9fd8c42211.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://thinx-cloud.firebaseio.com"
});

admin.messaging().sendToDevice(registrationToken, message)
  .then(function(response) {
    // See the MessagingDevicesResponse reference documentation for
    // the contents of response.
    console.log("Successfully sent message:", response);
  })
  .catch(function(error) {
    console.log("Error sending message:", error);
  });


/*

function execCommand(parameter)
{
	const exec = require('child_process').exec;
	CMD='wemo switch "'+wemo_device_name+'" '+parameter;
	console.log(CMD);
	exec(CMD, function (err, stdout, stderr) {
		if (err) {
			console.error(err);
			return;
		}
		console.log(stdout);
	});
}

dispatcher.onPost("/api/repo/add", function(req, res)
{
	// Repo should have 'firmware-name', URL and last commit ID, maybe array of devices (but that can be done by searching devices by commit id)

	// TODO: Fetch current user session by bearer token and use for 'owner'


	// TODO: Fetch parameters for following obj from req:
	var repo = {
		url: "https://github.com/suculent/thinx-firmware-esp8266.git",
		firmware_name: "thinx-firmware-esp8266",
		hash: "18ee75e3a56c07a9eff08f75df69ef96f919653f",
		owner: "admin",
		lastupdate: new Date()
	};

	gitlib.insert(repo, repo.firmware_name, function(err, body, header) {

		if (err == "Error: error happened in your connection") {
			//return;
		}

		if(err) {
			console.log("Inserting repo failed. " + err + "\n");
			// TODO

		} else {
			console.log("Repo inserted. Response: " + JSON.stringify(body) + "\n");
			// TODO

		}
		
		sendAddRepoResponse(res, rdict);
	});
})

*/