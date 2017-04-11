/*
 * This THiNX-RTM module is responsible for saving build results to database and notifying users/devices
 */

"use strict";

//
// Shared Configuration
//

var config = require("./conf/config.json");
var sha256 = require("sha256");
const db = config['database_uri'];
//require('./core.js');
var that = this;

// Network
const client_user_agent = "THiNX-Client";
var http = require('http');

// CouchDB
var nano = require('nano')(db);

// CHECKSUM
var fs = require('fs');
var checksum = require('checksum'); // deprecated

// SLACK
var SLACK_WEBHOOK_URL = config.slack_webhook;
var slack = require('slack-notify')(SLACK_WEBHOOK_URL);

// MQTT
var mqtt = require('mqtt')

// Main
var rdict = {};

console.log("-=[ ☢ THiNX IoT RTM NOTIFIER ☢ ]=-" + '\n');

// Parse input params

var build_id = process.argv[2]; // unique build identifier
var commit_id = process.argv[3]; // build artifact commit_id
var version = process.argv[4]; // build artifact version
var repo_url = process.argv[5]; // reference to git repo
var build_path = process.argv[6]; // path to build artifact
var mac = process.argv[7]; // mac address of target device or ANY
var sha = process.argv[8]; // sha hash of the binary
var owner = process.argv[9] || 'test'; // owner/tenant
var status = process.argv[10] || true; // build result status

// Validate params

// Default build identifier
if (build_id == undefined || build_id == '') {
  build_id = '0xBUILD_ID';
}

// Existing commit identifier for initial OTA firmware
if (commit_id == undefined || commit_id == '') {
  commit_id = '18ee75e3a56c07a9eff08f75df69ef96f919653f'; // test only!
}

// We'll build for ZERO-MAC by default instead of 'ANY' to prevent accidents
if (mac == undefined || mac == '') {
  mac = '00:00:00:00:00:00';
}

// Attribute all builds to test user by default
if (owner == undefined || owner == '') {
  owner = 'test';
}

// Default version
if (version == undefined || version == '') {
  version = '0.0.1';
}

// Default path for vanilla OTA firmware
if (repo_url == undefined || repo_url == '') {
  repo_url = 'git@github.com:suculent/thinx-firmware-esp8266.git';
}

// Default path
if (build_path == undefined || build_path == '') {
  build_path = config.deploy_root + '/' + owner + '/' + commit_id;
}

if (sha == undefined || sha == '') {
  var binary = build_path + '.bin';
  console.log("Calculating sha256 checksum for " + binary);

  fs = require('fs');
  var data = fs.readFileSync(binary, 'binary', function(err, data) {
    if (err) {
      return console.log(err);
    }
  });

  if (data) {
    sha = sha256(data.toString());
    that.sha = sha;
    console.log("Calculated new sha256: " + sha);
  } else {
    sha = "FILE_NOT_FOUND";
    that.sha = sha;
    console.log("Data file not found.");
  }
}

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
nano.db.create("managed_repos", function(err, body, header) {
  if (err) {
    if (err ==
      "Error: The database could not be created, the file already exists.") {
      // silently fail, this is ok
    } else {
      console.log("» Repository database creation completed. " + err + "\n");
    }
  } else {
    console.log("» Repository database creation completed. Response: " +
      JSON.stringify(body) + "\n");
  }
});

var gitlib = require("nano")(db).use("managed_repos");
var devicelib = require("nano")(db).use("managed_devices");

// TODO: Create build envelope

var buildEnvelope = {
  url: '<' + repo_url + '|' + repo_url + '>',
  //  path: build_path,
  //  mac: mac,
  commit: commit_id,
  version: version,
  checksum: sha,
  //  build_id: build_id,
  owner: owner,
  status: status
};

// save to build_path

var envelopePath = deploymentPathForDevice(owner, mac) + '/' + commit_id +
  '.json'
console.log("envelopePath: " + envelopePath);

fs.writeFile(envelopePath, JSON.stringify(buildEnvelope), function(err) {
  if (err) {
    return console.log("Commit descriptor save error: " + err);
  } else {
    console.log("Commit descriptor saved successfully.");
  }
  console.log('\n');
});

// TODO: Update current build version in managed_repos


// Select targets

// -- fetch devices with matching MAC or any
// -- collect push tokens (each only once)

// Notify admin (Slack)

// Bundled notification types:

if (status == true) {
  slack.alert({
    text: 'Build successfully completed.',
    username: "notifier.js",
    fields: buildEnvelope
  });
} else {
  slack.alert({
    text: 'Build failed.',
    username: "notifier.js",
    icon_emoji: ':computerage:',
    fields: buildEnvelope
  });
}

// Notify users (FCM)

var message = {
  data: {
    type: "update",
    url: repo_url || "/bin/test/firmware.elf",
    mac: mac || "5C:CF:7F:EE:90:E0;ANY",
    commit: commit_id || "18ee75e3a56c07a9eff08f75df69ef96f919653a",
    version: version || "0.0.1",
    checksum: sha ||
      "6bf6bd7fc983af6c900d8fe162acc3ba585c446ae0188e52802004631d854c60"
  },
  notification: {
    title: 'Aktualizace EAV',
    body: 'Je k dispozici aktualizace software pro Akustim. Přejete si ji nainstalovat?'
  }
};

console.log('\n');

// TODO: Get registration token from device database instead

// This registration token comes from the client FCM SDKs.
var registrationToken =
  "dhho4djVGeQ:APA91bFuuZWXDQ8vSR0YKyjWIiwIoTB1ePqcyqZFU3PIxvyZMy9htu9LGPmimfzdrliRfAdci-AtzgLCIV72xmoykk-kHcYRhAFWFOChULOGxrDi00x8GgenORhx_JVxUN_fjtsN5B7T";

var admin = require("firebase-admin");
var serviceAccount = require(
  config.fcm_auth);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://thinx-cloud.firebaseio.com"
});

admin.messaging().sendToDevice(registrationToken, message)
  .then(function(response) {
    console.log("Successfully sent message:", response);
  })
  .catch(function(error) {
    console.log("Error sending message:", error);
  });

console.log('\n');

//
// Notify devices (MQTT)
//

// Device channel
notify_device_channel(owner, mac, message);

//
// Version Management
//

/* Returns currently available version for respective owner and mac address */
function availableVersionForDevice(owner, mac) {

  // if MAC=any, provide version of recent thinx-esp8266-firmware

  // else check the owner folder

  // searches in deployment directory

  var deployment_path = deploymentPathForDevice(owner, mac);
  console.log("deployment_path = " + deployment_path);

  // list all files

  // Find latest binary, fetch version

}

function deploymentPathForDevice(owner, mac) {
  // MMAC is file-system agnostic and easy to search
  var mmac = mac.toString().replace(':', '-');

  // Get path for owner (and optinaly a device)
  var user_path = config.deploy_root + '/' + owner;
  var device_path = user_path;
  if (mac.indexOf("ANY") != -1) {
    device_path = device_path + '/' + mac
  }
  return device_path;
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

//
// MQTT Notifications (for Devices)
//

function notify_device_channel(owner, mac, message) {

  var channel = '/devices/' + owner + '/' + mac;
  console.log("Posting to MQTT queue " + channel);
  var client = mqtt.connect('mqtt://guest:guest@thinx.cloud:1883');

  client.on('connect', function() {
    console.log("Connected to MQTT, will post to " + channel)
    client.subscribe(channel)
    var msg = message
    delete msg.notification
    client.publish(channel, JSON.stringify(message))

    var homeMessage = {
      text: "Released update for device " + mac + " owned by tenant '" +
        owner + "'"
    }
    client.subscribe("/home")
    client.publish("/home", JSON.stringify(homeMessage))
    client.end();
  })

  console.log('\n');
}
