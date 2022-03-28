var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();
var fs = require('fs-extra');

const Database = require("./database.js");
let db_uri = new Database().uri();
var devicelib = require("nano")(db_uri).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]

var slack_webhook = app_config.slack.webhook;
var slack = require("slack-notify")(slack_webhook);
module.exports = class Notifier {

    constructor() {
        console.log("✅ [info] Loaded module: Notifier");
    }

    deploymentPathForDevice(an_owner, a_udid) {
        var user_path = app_config.data_root + app_config.deploy_root + "/" + an_owner;
        return user_path + "/" + a_udid;
    }

    notificationObject(newStatus, buildEnvelope) {
        let alertObj = {};
        if (newStatus === true || newStatus.indexOf("OK") === 0) {
            alertObj = {
                text: `Building of ${buildEnvelope.url} commit ${buildEnvelope.commit} successfully completed.`,
                username: "notifier.js",
                fields: buildEnvelope
            };
        } else if (newStatus.indexOf("DRY_RUN_OK") !== -1) {
            alertObj = {
                text: `Dry run successful. Firmware from git ${buildEnvelope.url} commit ${buildEnvelope.commit} left undeployed.`,
                username: "notifier.js",
                icon_emoji: ":ghost:",
                fields: buildEnvelope
            };
        } else {
            alertObj = {
                text: `Building of ${buildEnvelope.url} commit ${buildEnvelope.commit} has failed.`,
                username: "notifier.js",
                icon_emoji: ":computerage:",
                fields: buildEnvelope
            };
        }
        return alertObj;
    }

    notify_slack(newStatus, slackClient, buildEnvelope) {
        let alertObj = this.notificationObject(newStatus, buildEnvelope);
        slackClient.alert(alertObj);
    }

    process(job_status, callback) {
        
        console.log("[lib/notifier.js] processing status:", { job_status });

        if ((typeof (job_status.outfile) === "undefined") || (job_status.outfile.indexOf("<none>") !== -1)) {
            callback(false);
            return;
        }

        const udid = job_status.udid; // udid address of target device or ANY
        var sha = job_status.sha; // sha hash of the binary status
        let md5 = job_status.md5;

        // 2. Fetch devices, retrieve source alias, owner and source...

        console.log("[debug] [lib/notifier.js] D0");

        devicelib.get(udid, (err, doc) => {

            if (err) {
                console.log(`[error] [notifier.js] No such device with udid ${udid}`);
                callback(false);
                return;
            }

            if (((typeof (doc) === "undefined") || (doc == null))) {
                console.log(`[error] [notifier.js] No doc with udid ${udid}`);
                callback(false);
                return;
            }

            try {
                var hasSourceProperty = Object.prototype.hasOwnProperty.call(doc, "source");
                if (!hasSourceProperty) {
                    console.log(`[error] [lib/notifier.js] no-source exiting...`);
                    callback(false);
                    return;
                }
            } catch (e) {
                console.log(e);
            }

            console.log("[debug] [lib/notifier.js] D1");

            // 3. Collect push tokens for FCM

            devicelib.view("devices", "devices_by_source", {
                "key": doc.source,
                "include_docs": true
            }, (derr, body) => {

                if (derr) {
                    console.log(`[error] [lib/notifier.js] ${derr} exiting...`);
                    callback(false);
                    return;
                }

                if (body.rows.length === 0) {
                    console.log(`[error] [lib/notifier.js] No device with source ${doc.source}, bailing out...`);
                    callback(false);
                    return;
                }

                console.log("[debug] [lib/notifier.js] D2");

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

                var device = {};
                device.last_build_id = job_status.build_id;
                device.last_build_date = new Date().getTime();

                const apath = app_config.deploy_root + "/" + job_status.owner_id + "/" + job_status.udid + "/" + job_status.build_id + "/" + job_status.build_id + ".zip";
                if (fs.existsSync(apath)) { // lgtm [js/path-injection]
                    device.artifact = apath;
                }

                // Save last_build_id, last_build_date and artifact
                devicelib.atomic("devices", "modify", udid, device)
                    .catch(e => console.log("[notifier.js] Notifier device update error: ", e));
                
                let firmware;
                if (typeof (job_status.thinx_firmware_version) !== "undefined") {
                    firmware = job_status.thx_version;
                } else {
                    firmware = job_status.version;
                }

                // Create build envelope
                var buildEnvelope = {
                    platform: job_status.platform,
                    url: job_status.git_repo,
                    udid: job_status.udid,
                    commit: job_status.commit,
                    version: job_status.version,
                    firmware: firmware,
                    checksum: sha, // deprecated?
                    build_id: job_status.build_id,
                    owner: job_status.owner,
                    status: job_status.status,
                    timestamp: device.last_build_date,
                    artifact: device.artifact,
                    sha: sha, // deprecated?
                    md5: md5,
                    env_hash: job_status.env_hash
                };

                // save to build_path
                var envelopePath = this.deploymentPathForDevice(job_status.owner, job_status.udid) + "/" + job_status.build_id + "/build.json";
                var deployedEnvelopePath = this.deploymentPathForDevice(job_status.owner, job_status.udid) + "/build.json";
                var envelopeString = JSON.stringify(buildEnvelope, null, 4);
                var buffer = Buffer.from(envelopeString + "\n");

                console.log("[debug] [lib/notifier.js] D3");

                try {
                    fs.writeFileSync(envelopePath, buffer);  // lgtm [js/path-injection]
                } catch (e) {
                    console.log("[error] Envelope write failed to", envelopePath);
                    callback(false);
                    return;
                }

                console.log("[debug] [lib/notifier.js] D4");
                
                try {
                    console.log(`ℹ️ [info] [notifier.js] Deploying build envelope: ${deployedEnvelopePath}`);
                    fs.writeFileSync(deployedEnvelopePath, buffer);  // lgtm [js/path-injection]
                    fs.fchmodSync(fs.openSync(deployedEnvelopePath), 0o665);  // lgtm [js/path-injection]
                } catch (e) {
                    console.log("[error] Envelope write failed to", deployedEnvelopePath);
                    callback(false);
                    return;
                }

                // TODO (20): Update current build version in managed_users.repos when build completes
                // https://github.com/suculent/thinx-device-api/issues/313

                console.log(`ℹ️ [info] [notifier.js] STATUS: ${job_status.status}`);

                console.log("[debug] [lib/notifier.js] D5");

                this.notify_slack(job_status.status, slack, buildEnvelope);

                console.log("[debug] [lib/notifier.js] D6");

                callback(true);
            });
        });
    }
};