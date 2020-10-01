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
  handleUncaughtExceptions: true,
  handleUnhandledRejections: true
});

var sha256 = require("sha256");
var crypto = require('crypto');
var fs = require('fs-extra');
var db = app_config.database_uri;

var buildlib = require("nano")(db).use(prefix + "managed_builds"); // lgtm [js/unused-local-variable]
var devicelib = require("nano")(db).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]

var slack_webhook = app_config.slack_webhook;
var slack = require("slack-notify")(slack_webhook);

var Messenger = require("./lib/thinx/messenger");
var messenger = new Messenger().getInstance(); // take singleton to prevent double initialization

var BuildLog = require("./lib/thinx/buildlog");
var blog = new BuildLog();

console.log("[notifier.js] \n-=[ ☢ THiNX IoT RTM NOTIFIER ☢ ]=-\n");

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
var env_hash = process.argv[14];

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

/*
function notify_companion_app(push_tokens, message, repo_url, udid, commit_id, version, sha) {

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
        console.log("[notifier.js] Successfully sent message:", response);
      };

      var failureFunction = function(error) {
        console.log("[notifier.js] Error sending message:", error);
      };

      for (var pindex in push_tokens) {
        if (!push_tokens.hasOwnProperty(pindex)) return;
        var registrationToken = push_tokens[pindex];
        if ((typeof(registrationToken) !== "undefined") && (registrationToken !== null)) {
            if (registrationToken.length > 0) {
              console.log("[notifier.js] Sending GCM notification to  registration token: " + registrationToken);
              admin.messaging().sendToDevice(registrationToken, message)
                .then(successFunction)
                .catch(failureFunction);
          }
        }
      }
}
*/

function getFileSHA(path) {
  console.log("[notifier.js] Calculating SHA256 for file", path);
  if (!fs.existsSync(path)) {
    console.log("[notifier.js] path does not exist at " + path);
    process.exit(2);
    return;
  }
  var ndata = fs.readFileSync(path, "binary", function(err, data) {
    console.log("[notifier.js] Calllback..." + data);
    if (err) {
      console.log(err);
      process.exit(2);
      return;
    }
  });
  console.log("[notifier.js] Processing data: "+ndata.length);
  if (ndata) {
    sha = sha256(ndata.toString());
    //that.sha = sha;
    console.log("[notifier.js] Calculated new sha256: " + sha);
  } else {
    sha = "FILE_NOT_FOUND";
    //that.sha = sha;
    console.log("[notifier.js] Data file not found.");
  }
  return sha;
}

function processSHA(a_build_path) {
  console.log("[notifier.js] Processing SHA for build path...");
  var binary_path_sha = a_build_path + ".bin";
  if (!fs.existsSync(binary_path_sha)) {
    console.log("[notifier.js] binary_path_sha does not exist at " + binary_path_sha);
    process.exit(2);
    return;
  }
  console.log("[notifier.js] Reading file for sha256 checksum from: " + binary_path_sha);
  var ndata = fs.readFileSync(binary_path_sha, "binary", function(err, data) {
    console.log("[notifier.js] Calllback..." + data);
    if (err) {
      console.log(err);
      process.exit(2);
      return;
    }
  });
  console.log("[notifier.js] Processing data: "+ndata.length);
  if (ndata) {
    sha = sha256(ndata.toString());
    //that.sha = sha;
    console.log("[notifier.js] Calculated new sha256: " + sha);
  } else {
    sha = "FILE_NOT_FOUND";
    //that.sha = sha;
    console.log("[notifier.js] Data file not found.");
  }
  return sha;
}

if (typeof(sha) === "undefined" || sha === "") {
  sha = processSHA(build_path);
}

if (typeof(md5) === "undefined" || md5 === "") {
  var binary_path = build_path + ".bin";
  console.log("[notifier.js] Calculating md5 checksum for " + binary_path);
  var mdata = fs.readFileSync(binary_path, "binary", function(err, data) {
    if (err) {
      console.log(err);
    }
  });
  if (mdata) {
    md5 = crypto.createHash('md5').update(mdata).digest('hex');
    //that.md5 = md5;
    console.log("[notifier.js] Calculated new md5: " + md5);
  } else {
    md5 = "";
    //that.md5 = md5;
    console.log("[notifier.js] Data file not found.");
  }
}

if (typeof(env_hash) === "undefined" || env_hash === null) {
  let env_path = build_path + "/environment.json";
  console.log("Notifier searching for environments...");
  if (fs.existsSync(binary_path_sha)) {
    env_hash = getFileSHA(env_path);
    console.log("Notifier-generated ENV_HASH:", env_hash);
  } else {
    console.log(env_path, "does not exist.");
  }
}

function deploymentPathForDevice(an_owner, a_udid) {
  var user_path = app_config.data_root + app_config.deploy_root + "/" + an_owner;
  var device_path = user_path + "/" + a_udid;
  return device_path;
}

function build_update_notification(a_repo_url, a_udid, a_alias, a_commit, a_version, a_sha, a_dsig) {
  var message = {
    data: {
      type: "firmware-update",
      url: a_repo_url,
      udid: a_udid,
      commit: a_commit,
      version: a_version,
      checksum: a_sha,
      dsig: a_dsig
    },
    notification: {
      title: "Firmware Update",
      body: "Update available for device " + a_alias + "."
    }
  };
  return JSON.stringify(message);
}

function formatMacForDevSec(incoming) {
  let no_colons = incoming.replace(/:/g, "");
  let outgoing = no_colons.substr(6, 6);
  return outgoing;
}

function notificationObject(newStatus, buildEnvelope) {
  let alertObj = {};
  if (newStatus === true || newStatus.indexOf("OK") === 0) {
    alertObj = {
      text: "Build successfully completed.",
      username: "notifier.js",
      fields: buildEnvelope
    };
  } else if (newStatus.indexOf("DRY_RUN_OK") !== -1) {
    alertObj = {
      text: "Dry run successful. Firmware left undeployed.", // todo: reference git_url + commit_id here
      username: "notifier.js",
      icon_emoji: ":ghost:",
      fields: buildEnvelope
    };
  } else {
    alertObj = {
      text: "FAILED",
      username: "notifier.js",
      icon_emoji: ":computerage:",
      fields: buildEnvelope
    };
  }
  return alertObj;
}

function notify_slack(newStatus, slackClient, buildEnvelope) {
  let alertObj = notificationObject(newStatus, buildEnvelope);
  slackClient.alert(alertObj);
}

////////////////////////////////////////////////////////////////////////////////


/*
 * 1. Argument Ingestion
 */


console.log("[notifier.js] build_id : " + build_id);
console.log("[notifier.js] commit_id : " + commit_id);
console.log("[notifier.js] version : " + version);
console.log("[notifier.js] outfile/build_path : " + build_path);
console.log("[notifier.js] platform : " + platform);
console.log("[notifier.js] repo_url : " + repo_url);
console.log("[notifier.js] build_path : " + build_path);
console.log("[notifier.js] udid : " + udid);
console.log("[notifier.js] sha : " + sha);
console.log("[notifier.js] status : " + status);
console.log("[notifier.js] thinx_firmware_version : " + thinx_firmware_version);
console.log("[notifier.js] md5 : " + md5);
console.log("[notifier.js] env_hash : " + env_hash);

blog.state(build_id, owner, udid, status);

/*
 * 2. Fetch devices, retrieve source alias, owner and source...
 */

devicelib.get(udid, function(err, doc) {

  if (err) {
    console.log(err);
    console.log("[notifier.js] No such device with udid " + udid);
    rollbar.warning(err);
    process.exit(1);
  }

  if (((typeof(doc) === "undefined") || (doc == null))) {
    rollbar.info("device " + udid + "has no source on build!");
    process.exit(1);
  }

  try {
    if (!doc.hasOwnProperty("source")) {
      rollbar.info("device " + udid + "has no source on build!");
      process.exit(1);
    }
  } catch (e) {
    console.log(e);
  }

  /*
   * 3. Collect push tokens for FCM
  */

//  var push_tokens = [];

  devicelib.view("devicelib", "devices_by_source", {
    "key": doc.source,
    "include_docs": true
  }, function(derr, body) {

    if (derr) {
      console.log(derr);
      process.exit(1);
    }

    if (body.rows.length === 0) {
      console.log("[notifier.js] No results.");
      process.exit(1);
    }

    // Parse all devices with same source (?)

    /* not needed until FCM notifications
      for (var index in body.rows) {
      //if (!body.rows.hasOwnProperty(index)) continue;
      var item = body.rows[index];
      // if (!item.hasOwnProperty("push")) continue;
      if (typeof(item.push) !== "undefined") {
        push_tokens.push(item.push);
      }
    } */

    var device = body.rows[0];
    device.last_build_id = build_id;
    device.last_build_date = new Date().getTime();

    const apath = build_path + "/" + build_id + ".zip";
    if (fs.existsSync(apath)) {
      device.artifact = apath;
    }

    // Save last_build_id, last_build_date and artifact
    devicelib.atomic("devicelib", "modify", udid, device, function(error) {
      if (error) {
        console.log("[notifier.js] Notifier device update error: ", error);
      }
    });



    // Create build envelope
    var buildEnvelope = {
      platform: platform,
      url: repo_url,
      udid: udid,
      commit: commit_id,
      version: version,
      firmware: thinx_firmware_version.replace(/"/g, ''),
      checksum: sha,
      build_id: build_id,
      owner: owner,
      status: status,
      timestamp: device.last_build_date,
      artifact: device.artifact,
      sha: sha,
      md5: md5,
      env_hash: env_hash
    };

    // save to build_path
    var envelopePath = deploymentPathForDevice(owner, udid) + "/" + build_id + "/build.json";
    var deployedEnvelopePath = deploymentPathForDevice(owner, udid) + "/build.json";
    var envelopeString = JSON.stringify(buildEnvelope, null, 4);
    console.log("[notifier.js] Saving build envelope: " + envelopeString);
    console.log("[notifier.js] deployedEnvelopePath: " + envelopePath);
    var buffer = new Buffer.from(envelopeString + "\n");
    console.log("[notifier.js] saving envelopePath: " + deployedEnvelopePath);
    fs.writeFileSync(envelopePath, buffer);
    console.log("[notifier.js] Deploying build envelope: " + deployedEnvelopePath);
    fs.writeFileSync(deployedEnvelopePath, buffer);

    // TODO: Update current build version in managed_users.repos
    // Select targets
    // Notify admin (Slack); may be out of notifier.js scope and can be done later in core after calling notifier (means when calling builder finishes)...

    console.log("[notifier.js] STATUS: " + status);

    notify_slack(status, slack, buildEnvelope);

    /*
    let messageString = build_update_notification(
      repo_url,
      udid,
      device.alias,
      commit_id,
      version,
      sha
    );

    notify_companion_app(push_tokens, messageString, repo_url, udid, commit_id, version, sha);
    */

    let registrationObject = {
      registration: {
        status: "FIRMWARE_UPDATE",
        commit: commit_id,
        version: version
      }
    };

    // Notify client's mobile app using FCM (user must have token stored)
    //

    // Notify device's channel on firmware build to enable quick unattended auto-updates; device should validate at least dsig first.
    if (status == "OK") {
      console.log("[notifier.js] Sending notification update...");
      messenger.publish(owner, udid, JSON.stringify(registrationObject)); // new implementation
    } else {
      console.log("[notifier.js] Status is not DEPLOYED, skipping device notifier...");
    }
  });
});
