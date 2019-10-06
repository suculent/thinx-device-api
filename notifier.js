/*
 * This THiNX-RTM module is responsible for saving build results to database and notifying users/devices
 */

//
// Shared Configuration
//

var Rollbar = require('rollbar');

var Globals = require("./lib/thinx/globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var rollbar = new Rollbar({
  accessToken: app_config.rollbar_token,
  handleUncaughtExceptions: false,
  handleUnhandledRejections: false
});

var sha256 = require("sha256");
var crypto = require('crypto');
var fs = require('fs-extra');
var db = app_config.database_uri;

var userlib = require("nano")(db).use(prefix + "managed_users"); // lgtm [js/unused-local-variable]
var buildlib = require("nano")(db).use(prefix + "managed_builds"); // lgtm [js/unused-local-variable]
var loglib = require("nano")(db).use(prefix + "managed_logs"); // lgtm [js/unused-local-variable]
var devicelib = require("nano")(db).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]

var slack_webhook = app_config.slack_webhook;
var slack = require("slack-notify")(slack_webhook);

var that = this;

var mqtt = require("mqtt");

var Messenger = require("./lib/thinx/messenger");
var messenger = new Messenger().getInstance(); // take singleton to prevent double initialization

console.log("-=[ ☢ THiNX IoT RTM NOTIFIER ☢ ]=-");

// Parse input params

// [2] d47b83c0-81ce-11e7-b5a2-8f1cacde898b
// [3] c796c171dc598c11a1ea3b29a6a3def9b7b2949d
// [4] 16
// [5] git@github.com:suculent/thinx-firmware-esp8266-ino.git
// [6] d2d7b050-7c53-11e7-b94e-15f5f3a64973 0x00000000 cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12 "OK"

var build_id = process.argv[2]; // unique build identifier
var commit_id = process.argv[3]; // build artifact commit_id
var version = process.argv[4]; // build artifact version
var repo_url = process.argv[5]; // reference to git repo
var build_path = process.argv[6]; // path to build artifact
var udid = process.argv[7]; // udid address of target device or ANY
var sha = process.argv[8]; // sha hash of the binary
var owner = process.argv[9]; // owner_id
var status = process.argv[10] || true; // build result status
var platform = process.argv[11] || "unknown"; // build result status
var thinx_firmware_version = process.argv[12] || repo_url; // build result status
var md5 = process.argv[13] || repo_url; // build result status

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
  build_path = app_config.data_root + app_config.deploy_root + "/" + owner + "/" + commit_id;
}

function processSHA(build_path) {
  console.log("Processing SHA for build path...");
  var binary_path_sha = build_path + ".bin";
  if (!fs.existsSync(binary_path_sha)) {
    console.log("binary_path_sha does not exist at " + binary_path_sha);
    process.exit(2);
    return;
  }
  console.log("Reading file for sha256 checksum from: " + binary_path_sha);
  var ndata = fs.readFileSync(binary_path_sha, "binary", function(err, data) {
    console.log("Calllback..." + data);
    if (err) {
      console.log(err);
      process.exit(2);
      return;
    }
  });
  console.log("Processing data: "+ndata.length);
  if (ndata) {
    sha = sha256(ndata.toString());
    that.sha = sha;
    console.log("Calculated new sha256: " + sha);
  } else {
    sha = "FILE_NOT_FOUND";
    that.sha = sha;
    console.log("Data file not found.");
  }
  console.log("Done.");
  return sha;
}

if (typeof(sha) === "undefined" || sha === "") {
  sha = processSHA(build_path);
}

if (typeof(md5) === "undefined" || md5 === "") {
  var binary_path = build_path + ".bin";
  console.log("Calculating md5 checksum for " + binary_path);
  var mdata = fs.readFileSync(binary_path, "binary", function(err, data) {
    if (err) {
      console.log(err);
    }
  });
  if (mdata) {
    md5 = crypto.createHash('md5').update(mdata).digest('hex');
    that.md5 = md5;
    console.log("Calculated new md5: " + md5);
  } else {
    md5 = "";
    that.md5 = md5;
    console.log("Data file not found.");
  }
}

console.log("build_id : " + build_id);
console.log("commit_id : " + commit_id);
console.log("version : " + version);
console.log("outfile/build_path : " + build_path);
console.log("platform : " + platform);
console.log("repo_url : " + repo_url);
console.log("build_path : " + build_path);
console.log("udid : " + udid);
console.log("sha : " + sha);
console.log("status : " + status);
console.log("thinx_firmware_version : " + thinx_firmware_version);
console.log("md5 : " + md5);


var BuildLog = require("./lib/thinx/buildlog");
var blog = new BuildLog();

blog.log(build_id, owner, udid, status);

//
// Device -> Souce Alias -> User -> Sources ...
//

function notify_device_channel(owner, udid, message) {

  var mqtt_password;
  var mqtt_username;

  if (typeof(app_config.mqtt.password) !== "undefined") {
    mqtt_password = app_config.mqtt.password;
    console.log("Setting mosquitto password from configuration file.");
  }

  if (typeof(process.env.MOSQUITTO_PASSWORD) !== "undefined") {
    mqtt_password = process.env.MOSQUITTO_PASSWORD;
    console.log("Setting mosquitto password from environment variable.");
  }

  if (typeof(process.env.MOSQUITTO_USERNAME) !== "undefined") {
    mqtt_username = process.env.MOSQUITTO_USERNAME;
    console.log("Setting mosquitto password from environment variable.");
  }

  console.log("notify_device_channel is DEPRECATED");
  var channel = "/thinx/devices/" + owner + "/" + udid;
  console.log("Posting to MQTT queue " + channel);


  var client = mqtt.connect("mqtt://"+mqtt_username+":"+mqtt_password+"@" + process.env.THINX_HOSTNAME + ":"+app_config.mqtt.port);
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
}

function deploymentPathForDevice(owner, udid) {
  var user_path = app_config.data_root + app_config.deploy_root + "/" + owner;
  var device_path = user_path + "/" + udid;
  return device_path;
}

devicelib.get(udid, function(err, doc) {

  if (err || (typeof(doc) === "undefined")) {
    console.log(err);
    console.log("No such device with udid " + udid);
    rollbar.warning(err);
    return;
  }

  if (!doc.hasOwnProperty("source")) {
    rollbar.info("device " + udid + "has no source on build!");
    return;
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
      process.exit(1);
    }

    if (body.rows.length === 0) {
      console.log("No results.");
      process.exit(1);
    }

    // Parse all devices with same source (?)

    for (var index in body.rows) {
      //if (!body.rows.hasOwnProperty(index)) continue;
      var item = body.rows[index];
      // if (!item.hasOwnProperty("push")) continue;
      if (typeof(item.push) !== "undefined") {
        push_tokens.push(item.push);
      }
    }

    var device = body.rows[0];
    device.last_build_id = build_id;
    device.last_build_date = new Date().getTime();

    const apath = build_path + "/" + build_id + ".zip";
    if (fs.existsSync(apath)) {
      device.artifact = apath;
    }

    // Save last_build_id, last_build_date and artifact
    devicelib.atomic("devicelib", "modify", udid, device, function(error, body) {
      if (error) {
        console.log("Notifier device update error: " + error);
      }
    });

    // Create build envelope
    var buildEnvelope = {
      platform: platform,
      url: repo_url,
      udid: udid,
      commit: commit_id,
      version: version,
      firmware: thinx_firmware_version,
      checksum: sha,
      build_id: build_id,
      owner: owner,
      status: status,
      timestamp: device.last_build_date,
      artifact: device.artifact,
      sha: sha,
      md5: md5
    };

    // save to build_path
    var envelopePath = deploymentPathForDevice(owner, udid) + "/" + build_id + "/build.json";
    var deployedEnvelopePath = deploymentPathForDevice(owner, udid) + "/build.json";
    var envelopeString = JSON.stringify(buildEnvelope, null, 4);
    console.log("Saving build envelope: " + envelopeString);
    //console.log("deployedEnvelopePath: " + envelopePath);
    var buffer = new Buffer(envelopeString + "\n");
    //console.log("saving envelopePath: " + deployedEnvelopePath);
    fs.writeFileSync(envelopePath, buffer);
    console.log("Deploying build envelope: " + deployedEnvelopePath);
    fs.writeFileSync(deployedEnvelopePath, buffer);

    // TODO: Update current build version in managed_users.repos
    // Select targets
    // TODO: -- collect push tokens (each only once)
    // Notify admin (Slack); may be out of notifier.js scope and can be done later in core after calling notifier (means when calling builder finishes)...
    // Bundled notification types:

    console.log("STATUS: " + status);

    if (status === true || status.indexOf("OK") === 0) {
      slack.alert({
        text: "Build successfully completed.",
        username: "notifier.js",
        fields: buildEnvelope
      });
    } else if (status.indexOf("DRY_RUN_OK") !== -1) {
      slack.alert({
        text: "Dry run successful. Firmware left undeployed.", // todo: reference git_url + commit_id here
        username: "notifier.js",
        icon_emoji: ":ghost:",
        fields: buildEnvelope
      });
    } else {
      slack.alert({
        text: "FAILED",
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

    // TODO: Get registration token from device database instead

    var admin = require("firebase-admin");
    var serviceAccount = require(
      app_config.fcm_auth);
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
      if ((typeof(registrationToken) !== "undefined") && (registrationToken !== null)) {
          if (registrationToken.length > 0) {
            console.log("Sending GCM notification to  registration token: " + registrationToken);
            admin.messaging().sendToDevice(registrationToken, message)
              .then(successFunction)
              .catch(failureFunction);
        }
      }
    }

    // Device channel
    if (status == "DEPLOYED") {
      console.log("Calling messenger publish...");
      messenger.publish(owner, udid, message);
      notify_device_channel(owner, udid, message); // deprecated; integration testing only
    }

    process.exit(0);

  });
});

//
// MQTT Notifications (deprecated, done through Messenger)
//
