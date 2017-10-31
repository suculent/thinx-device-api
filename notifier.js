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
if (typeof(process.env.CIRCLE_USERNAME) !== "undefined") {
  console.log("» Starting on Circle CI...");
  config = require("./conf/config-test.json");
}
if (process.env.LOGNAME == "sychram") {
  console.log("» Starting on workstation...");
  config = require("./conf/config-local.json");
}
if (process.env.LOGNAME == "root") {
  console.log("» Starting in production mode...");
  config = require("./conf/config.json");
}

var sha256 = require("sha256");

var db = config.database_uri;

// Initially creates DB, otherwise fails silently.
var prefix = "";
try {
  var pfx_path = config.project_root + '/conf/.thx_prefix';
  if (fs.existsSync(pfx_path)) {
    prefix = fs.readFileSync(pfx_path) + "_";
  }
} catch (e) {
  //console.log(e);
}

var userlib = require("nano")(db).use(prefix + "managed_users");
var buildlib = require("nano")(db).use(prefix + "managed_builds");
var loglib = require("nano")(db).use(prefix + "managed_logs");
var devicelib = require("nano")(db).use(prefix + "managed_devices");

var client_user_agent = config.client_user_agent;
var slack_webhook = config.slack_webhook;
var slack = require("slack-notify")(slack_webhook);

var that = this;

var http = require("http");
var fs = require("fs");
var nano = require("nano")(db);
var mqtt = require("mqtt");

var Messenger = require('./lib/thinx/messenger');

var rdict = {};

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

nano.db.create(prefix + "managed_builds", function(err, body, header) {
  if (err) {
    if (err ==
      "Error: The build database could not be created, the file already exists."
    ) {
      // silently fail, this is ok
    } else {
      console.log("» Repository database attached.");
    }
  } else {
    console.log("» Build database creation completed. Response: " +
      JSON.stringify(body));
  }
});

console.log("build_id : " + build_id);
console.log("commit_id : " + commit_id);
console.log("version : " + version);
console.log("outfile/build_path : " + build_path);
console.log("repo_url : " + repo_url);
console.log("build_path : " + build_path);
console.log("udid : " + udid);
console.log("sha : " + sha);
console.log("status : " + status);

var blog = require("./lib/thinx/buildlog");

blog.log(build_id, owner, udid, status);

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
    process.exit(1);
  }

  if (!doc.hasOwnProperty("source")) {
    rollbar.info("device " + udid + "has no source on build!");
    process.exit(1);
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
      build_id + "/build.json";

    console.log("envelopePath: " + envelopePath);

    var deployedEnvelopePath = deploymentPathForDevice(owner, udid) +
      "/build.json";

    console.log("deployedEnvelopePath: " + deployedEnvelopePath);

    var envelopeString = JSON.stringify(buildEnvelope);

    console.log("Saving build envelope: " + envelopeString);

    buffer = new Buffer(envelopeString + "\n");

    fs.writeFileSync(envelopePath, buffer);
    fs.writeFileSync(deployedEnvelopePath, buffer);


    // TODO: Update current build version in managed_users.repos

    // Select targets

    // TODO: -- collect push tokens (each only once)

    // Notify admin (Slack)

    // Bundled notification types:

    console.log("STATUS: " + status);

    if (status === true || status.indexOf("OK") === 0) {
      slack.alert({
        text: "Build successfully completed.",
        username: "notifier.js",
        fields: buildEnvelope
      });
    } else if (status.indexOf("DEPLOYED") !== -1) {
      slack.alert({
        text: "Deployment successful.", // todo: reference git_url + commit_id here
        username: "notifier.js",
        icon_emoji: ":ghost:",
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
      messenger.publish(owner, udid, message);
      notify_device_channel(owner, udid, message); // deprecated; integration testing only
    }

    process.exit(0);

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
// MQTT Notifications (deprecated, done through Messenger)
//

function notify_device_channel(owner, udid, message) {
  console.log("notify_device_channel is DEPRECATED");
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
}


function deploymentPathForDevice(owner, udid) {
  var user_path = __dirname + config.deploy_root + "/" + owner;
  var device_path = user_path + "/" + udid;
  return device_path;
}
