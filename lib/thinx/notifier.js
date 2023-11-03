let Globals = require("./globals.js");
let app_config = Globals.app_config();
let prefix = Globals.prefix();
let fs = require('fs-extra');

const InfluxConnector = require('./influx');

const Database = require("./database.js");
let db_uri = new Database().uri();
let devicelib = require("nano")(db_uri).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]

let slack = require("slack-notify")(process.env.SLACK_WEBHOOK);

module.exports = class Notifier {

    deploymentPathForDevice(an_owner, a_udid) {
        let user_path = app_config.data_root + app_config.deploy_root + "/" + an_owner;
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

        console.log("[DEBUG] [lib/notifier.js] processing status:", { job_status });
        
        if ( (typeof(job_status) === "undefined") ||
             (typeof (job_status.outfile) === "undefined") ||
             (job_status.outfile === null))
        {
            console.log("[DEBUG] job_status or outfile undefined");
            return callback(false);
        }

        let outfile = job_status.outfile;
        if ((typeof(outfile) === "string") && (outfile.indexOf("<none>") !== -1)) {
            console.log("[DEBUG] outfile is <none>");
            return callback(false);
        }

        const udid = job_status.udid; // udid address of target device or ANY
        let sha = job_status.sha; // sha hash of the binary status
        let md5 = job_status.md5;

        // 2. Fetch devices, retrieve source alias, owner and source...

        console.log("[DEBUG] getting device");

        devicelib.get(udid, (err, doc) => {

            if (err || ((typeof (doc) === "undefined") || (doc == null) || !Object.prototype.hasOwnProperty.call(doc, "source"))) {
                console.log(`[error] [notifier.js] No doc with source for udid ${udid}`);
                return callback(false);
            }

            // 3. Collect push tokens for FCM

            console.log("[DEBUG] getting devices by source");

            devicelib.view("devices", "devices_by_source", {
                "key": doc.source,
                "include_docs": true
            }, (derr, body) => {

                console.log("[DEBUG] notifier process body (expected rows.length, may not have rows), derr, body:", derr, body);

                if ((derr) || (body === null) || (body.rows.length === 0)) {
                    console.log(`[error] [lib/notifier.js] ${derr} exiting...`);
                    return callback(false);
                }

                // Parse all devices with same source (?)

                /* not needed until FCM notifications
                  for (let index in body.rows) {
                  //if (!body.rows.hasOwnProperty(index)) continue;
                  let item = body.rows[index];
                  // if (!item.hasOwnProperty("push")) continue;
                  if (typeof(item.push) !== "undefined") {
                    push_tokens.push(item.push);
                  }
                } */

                let device = {
                    last_build_id: job_status.build_id,
                    last_build_date: new Date().getTime()
                };

                const apath = app_config.deploy_root + "/" + job_status.owner_id + "/" + job_status.udid + "/" + job_status.build_id + "/" + job_status.build_id + ".zip";
                if (fs.existsSync(apath)) { // lgtm [js/path-injection]
                    device.artifact = apath;
                }

                // Save last_build_id, last_build_date and artifact
                devicelib.atomic("devices", "modify", udid, device)
                    .catch(e => console.log("[notifier.js] Atomic device update error: ", e));
                
                let firmware;
                if (typeof (job_status.thinx_firmware_version) !== "undefined") {
                    firmware = job_status.thx_version;
                } else {
                    firmware = job_status.version;
                }

                // Create build envelope
                let buildEnvelope = {
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
                let envelopeFolder = this.deploymentPathForDevice(job_status.owner, job_status.udid) + "/" + job_status.build_id;
                let envelopePath = envelopeFolder + "/build.json";
                let deployedEnvelopePath = this.deploymentPathForDevice(job_status.owner, job_status.udid) + "/build.json";
                let envelopeString = JSON.stringify(buildEnvelope, null, 4);
                let buffer = Buffer.from(envelopeString + "\n");

                try {
                    fs.mkdirpSync(envelopeFolder); // lgtm [js/path-injection]
                } catch (e) {
                    console.log("ℹ️ [info] No need to create envelopeFolder, is this another issue?", {e});
                }

                try {
                    fs.writeFileSync(envelopePath, buffer);  // lgtm [js/path-injection]
                    console.log(`ℹ️ [info] [notifier.js] Deploying build envelope: ${deployedEnvelopePath}`);
                    fs.writeFileSync(deployedEnvelopePath, buffer);  // lgtm [js/path-injection]
                    fs.fchmodSync(fs.openSync(deployedEnvelopePath), 0o665);  // lgtm [js/path-injection]
                } catch (e) {
                    console.log("☣️ [error] Envelope write failed to", deployedEnvelopePath);
                    return callback(false);
                }

                if (typeof(job_status.status) === "undefined") {
                    job_status.status = "UNDEFINED";
                }

                if (job_status.status.indexOf("OK") !== -1) {
                    InfluxConnector.statsLog(job_status.owner, "BUILD_SUCCESS", job_status.build_id);
                } else {
                    console.log("[TODO] FIXME: Unmatched job status", job_status.status);
                }

                console.log(`ℹ️ [info] [notifier.js] STATUS: ${job_status.status}`);

                this.notify_slack(job_status.status, slack, buildEnvelope);

                callback(true);
            });
        });
    }
};