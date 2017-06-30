/*
 * This THiNX-RTM module is responsible for saving build results to database and notifying users/devices
 */

//
// Shared Configuration
//

var Rollbar = require('rollbar');

var rollbar = new Rollbar({
  accessToken: '5505bac5dc6c4542ba3bd947a150cb55',
  handleUncaughtExceptions: true,
  handleUnhandledRejections: true
});

var config = require("./conf/config.json");
var sha256 = require("sha256");

var db = config.database_uri;

var userlib = require("nano")(db).use("managed_users");
var buildlib = require("nano")(db).use("managed_builds");
var loglib = require("nano")(db).use("managed_logs");
var devicelib = require("nano")(db).use("managed_devices");

var client_user_agent = config.client_user_agent;
var slack_webhook = config.slack_webhook;
var slack = require("slack-notify")(slack_webhook);

var that = this;

var http = require("http");
var fs = require("fs");
var nano = require("nano")(db);
var mqtt = require("mqtt");

var rdict = {};

console.log("-=[ ☢ THiNX IoT RTM NOTIFIER ☢ ]=-" + "\n");

// Parse input params

var build_id = process.argv[2]; // unique build identifier
var commit_id = process.argv[3]; // build artifact commit_id
var version = process.argv[4]; // build artifact version
var repo_url = process.argv[5]; // reference to git repo
var build_path = process.argv[6]; // path to build artifact
var udid = process.argv[7]; // udid address of target device or ANY
var sha = process.argv[8]; // sha hash of the binary
var owner = process.argv[9]; // owner_id
var status = process.argv[10] || true; // build result status

// Validate params

// Default build identifier
if (typeof(build_id) === "undefined" || build_id === "") {
  build_id = "0xBUILD_ID";
}

// Existing commit identifier for initial OTA firmware
if (typeof(commit_id) === "undefined" || commit_id === "") {
  commit_id = "18ee75e3a56c07a9eff08f75df69ef96f919653f"; // test only!
}

// Attribute all builds to test user by default
if (typeof(owner) === "undefined" || owner === "") {
  owner = "test";
}

// Default version
if (typeof(version) === "undefined" || version === "") {
  version = "0.0.1";
}

// Default path for vanilla OTA firmware
if (typeof(repo_url) === "undefined" || repo_url === "") {
  repo_url = "git@github.com:suculent/thinx-firmware-esp8266.git";
}

// Default path
if (typeof(build_path) === "undefined" || build_path === "") {
  build_path = __dirname + config.deploy_root + "/" + owner + "/" + commit_id;
}

if (typeof(sha) === "undefined" || sha === "") {
  var binary = build_path + ".bin";
  console.log("Calculating sha256 checksum for " + binary);

  var data = fs.readFileSync(binary, "binary", function(err, data) {
    if (err) {
      console.log(err);
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

// Initially creates DB, otherwise fails silently.
nano.db.create("managed_builds", function(err, body, header) {
  if (err) {
    if (err ==
      "Error: The build database could not be created, the file already exists."
    ) {
      // silently fail, this is ok
    } else {
      console.log("» Repository database attached.\n");
    }
  } else {
    console.log("» Build database creation completed. Response: " +
      JSON.stringify(body) + "\n");
  }
});

console.log("build_id : " + build_id + "\n");
console.log("commit_id : " + commit_id + "\n");
console.log("version : " + version + "\n");
console.log("repo_url : " + repo_url + "\n");
console.log("build_path : " + build_path + "\n");
console.log("udid : " + udid + "\n");
console.log("sha : " + sha + "\n");
console.log("status : " + status + "\n");

var blog = require("./lib/thinx/buildlog");

blog.log(build_id, owner, udid, "Starting build notifier...");

//
// Device -> Souce Alias -> User -> Sources ...
//

devicelib.get(udid, function(err, doc) {

  if (err || typeof(doc) == "undefined") {
    console.log(err);
    rollbar.warning(err);
  }

  if (typeof(doc) === "undefined") {
    console.log("No such device with udid " + udid);
    return;
  }

  if (!doc.hasOwnProperty("source")) {
    rollbar.info("device " + udid + "has no source on build!");
    return false;
  }

  var source = doc.source;

  // Collect push tokens
  var push_tokens = [];
  devicelib.view("devicelib", "devices_by_source", {
    "key": source,
    "include_docs": true
  }, function(err, body) {

    if (err) {
      console.log(err);
      return false;
    }

    if (body.rows.length === 0) {
      console.log("No results.");
      return false;
    }

    for (var index in body.rows) {
      if (!body.rows.hasOwnProperty(index)) continue;
      var item = body.rows[index];
      if (!item.hasOwnProperty("push")) continue;
      if (typeof(item.push !== "undefined")) {
        push_tokens.push(item.push);
      }
    }

    //console.log(JSON.stringify(body));

    // Create build envelope

    var buildEnvelope = {
      url: repo_url,
      udid: udid,
      commit: commit_id,
      version: version,
      checksum: sha,
      build_id: build_id,
      owner: owner,
      status: status,
      timestamp: new Date()
    };

    // save to build_path

    var envelopePath = deploymentPathForDevice(owner, udid) + "/" +
      build_id + "/" + build_id + ".json";

    console.log("Saving build envelope: " + envelopePath);

    fs.open(envelopePath, "w", function(err, fd) {
      if (err) {
        throw "error opening file: " + err;
      } else {
        fs.writeFile(envelopePath, JSON.stringify(buildEnvelope),
          function(err) {
            if (err) {
              console.log("Build envelope save error: " + err);
            } else {
              console.log("Build envelope saved successfully:");
              //console.log(JSON.stringify(buildEnvelope));
            }
            console.log("\n");
          });
      }
    });

    // TODO: Update current build version in managed_users.repos


    // Select targets

    // TODO: -- collect push tokens (each only once)

    // Notify admin (Slack)

    // Bundled notification types:

    console.log("STATUS: " + status);

    if (status === true) {
      slack.alert({
        text: "Build successfully completed.",
        username: "notifier.js",
        fields: buildEnvelope
      });
    } else if (status.indexOf("DEPLOYED") !== 1) {
      slack.alert({
        text: "Deployment successful.", // todo: reference git_url + commit_id here
        username: "notifier.js",
        icon_emoji: ":ghost:",
        fields: buildEnvelope
      });
    } else if (status.indexOf("DRY_RUN_OK") !== 1) {
      slack.alert({
        text: "Dry run successful. Firmware left undeployed.", // todo: reference git_url + commit_id here
        username: "notifier.js",
        icon_emoji: ":ghost:",
        fields: buildEnvelope
      });
    } else {
      slack.alert({
        text: "Build failed.",
        username: "notifier.js",
        icon_emoji: ":computerage:",
        fields: buildEnvelope
      });
    }

    // Notify users (FCM)

    var message = {
      data: {
        type: "update",
        url: repo_url || "/bin/test/firmware.elf",
        udid: udid,
        commit: commit_id ||
          "18ee75e3a56c07a9eff08f75df69ef96f919653a",
        version: version || "0.0.1",
        checksum: sha ||
          "6bf6bd7fc983af6c900d8fe162acc3ba585c446ae0188e52802004631d854c60"
      },
      notification: {
        title: "Aktualizace EAV",
        body: "Je k dispozici aktualizace software pro Akustim. Přejete si ji nainstalovat?"
      }
    };

    console.log("\n");

    // TODO: Get registration token from device database instead

    var admin = require("firebase-admin");
    var serviceAccount = require(
      config.fcm_auth);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://thinx-cloud.firebaseio.com"
    });

    var successFunction = function(response) {
      console.log("Successfully sent message:", response);
    };

    var failureFunction = function(error) {
      console.log("Error sending message:", error);
    };

    for (var pindex in push_tokens) {
      if (!push_tokens.hasOwnProperty(pindex)) return;
      var registrationToken = push_tokens[pindex];
      if ((typeof(registrationToken) !== "undefined") && (
          registrationToken !== null)) {
        if (registrationToken.length > 0)  {
          console.log(
            "Sending GCM notification to  registration token: " +
            registrationToken);
          admin.messaging().sendToDevice(registrationToken, message)
            .then(successFunction)
            .catch(failureFunction);
        }
      }
    }

    //
    // Notify devices (MQTT)
    //

    // Device channel
    if (status == "DEPLOYED") {
      notify_device_channel(owner, udid, message);
    }

  });
});

// Prepare payload

var pushNotificationPayload = {
  firmware_update: {
    url: build_path,
    udid: udid,
    commit: commit_id,
    version: version,
    checksum: sha
  }
};

//
// MQTT Notifications (for Devices)
//

function notify_device_channel(owner, udid, message) {
  var channel = "/thinx/devices/" + owner + "/" + udid;
  console.log("Posting to MQTT queue " + channel);
  var client = mqtt.connect("mqtt://guest:guest@thinx.cloud:1883");
  client.on("connect", function() {
    console.log("Connected to MQTT, will post to " + channel);
    client.subscribe(channel);
    var msg = message;
    delete msg.notification;
    client.publish(channel, JSON.stringify(message), {
      retain: true
    });
    client.end();
  });

  console.log("\n");
}

function deploymentPathForDevice(owner, udid) {
  var user_path = __dirname + config.deploy_root + "/" + owner;
  var device_path = user_path + "/" + udid;
  return device_path;
}
