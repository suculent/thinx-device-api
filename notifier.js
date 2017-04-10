/* 
 * This THiNX-RTM module is responsible for saving build results to database and notifying users/devices 
 */

const db = "http://rtmapi:frohikey@localhost:5984";

var http = require('http');
var parser = require('body-parser');
var nano = require("nano")(db);

var FCM = require('fcm-push');
var serverkey = 'AAAARM9VDGs:APA91bHS49MhXxLk6-as4IRJy59WbOZEMBN9qE_foptk_IiGVwOfgGKyd_r78Eet-OxoyHahm8f1CgI6rylFt8h3koyRmOa6ccLCpNMWIBs1flcNn7LZadyxcXOxU4bd8GBE6VXWMQcg'; // public development key only!
var fcm = FCM(serverkey);

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

console.log("build_id : " + build_id +);
console.log("commit_id : " + commit_id);
console.log("version : " + version);
console.log("repo_url : " + repo_url);
console.log("build_path : " + build_path);
console.log("mac : " + mac);
console.log("sha : " + sha);
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

var message {  
    to : "d877126b0b76fe086d63679c8d747423e7b4a1bdb4e1679e59216732b7060f03",
    collapse_key : '<insert-collapse-key>',
    data : {
        <random-data-key1> : '<random-data-value1>',
        <random-data-key2> : '<random-data-value2>'
    },
    notification : {
        title : 'Title of the notification',
        body : 'Body of the notification'
    }
};

fcm.send(message, function(err,response){  
    if(err) {
        console.log("Something has gone wrong !");
    } else {
        console.log("Successfully sent with resposne :",response);
    }
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