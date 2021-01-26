var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var sha256 = require("sha256");
var crypto = require('crypto');
var fs = require('fs-extra');
var db = app_config.database_uri;

var devicelib = require("nano")(db).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]

var slack_webhook = app_config.slack_webhook;
var slack = require("slack-notify")(slack_webhook);

var BuildLog = require("./buildlog");
var blog = new BuildLog();


module.exports = class Notifier {

    constructor() {
        console.log("Loaded module: Notifier");
    }

    getFileSHA(path) {
        console.log("[lib/notifier.js] Calculating SHA256 for file", path);
        if (!fs.existsSync(path)) { // lgtm [js/path-injection]
            console.log("[notifier.js] path does not exist at " + path);
            return false;
        }
        var ndata = fs.readFileSync(path, "binary", function (err, data) {
            console.log("[lib/notifier.js] Calllback..." + data);
            if (err) {
                console.log(err);
                return false;
            }
        });
        console.log("[lib/notifier.js] Processing data: " + ndata.length);
        let sha;
        if (ndata) {
            sha = sha256(ndata.toString());
            //that.sha = sha;
            console.log("[lib/notifier.js] Calculated new sha256: " + sha);
        } else {
            sha = "FILE_NOT_FOUND";
            //that.sha = sha;
            console.log("[lib/notifier.js] Data file not found.");
        }
        return sha;
    }

    processSHA(binary_path_sha) {
        console.log("[lib/notifier.js] Processing SHA for build path...");
        binary_path_sha = binary_path_sha.replace("//", "/");
        if (!fs.existsSync(binary_path_sha)) { // lgtm [js/path-injection]
            console.log("[lib/notifier.js] binary_path_sha does not exist at " + binary_path_sha);
            return false;
        }
        console.log("[notifier.js] Reading file for sha256 checksum from: " + binary_path_sha);
        var ndata = fs.readFileSync(binary_path_sha, "binary", function (err, data) {
            console.log("[lib/notifier.js] Callback..." + data);
            if (err) {
                console.log(err);
            }
        });
        console.log("[lib/notifier.js] Processing data: " + ndata.length);
        let sha;
        if (ndata) {
            sha = sha256(ndata.toString());
            //that.sha = sha;
            console.log("[lib/notifier.js] Calculated new sha256: " + sha);
        } else {
            sha = "FILE_NOT_FOUND";
            //that.sha = sha;
            console.log("[lib/notifier.js] Data file not found.");
        }
        return sha;
    }

    deploymentPathForDevice(an_owner, a_udid) {
        var user_path = app_config.data_root + app_config.deploy_root + "/" + an_owner;
        var device_path = user_path + "/" + a_udid;
        return device_path;
    }

    /* unused, may change
    build_update_notification(data, device_alias) {
        var message = {
            data: data,
            notification: {
                title: "Firmware Update",
                body: "Update available for device " + device_alias + "."
            }
        };
        return JSON.stringify(message);
    }
    */

    notificationObject(newStatus, buildEnvelope) {
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

    notify_slack(newStatus, slackClient, buildEnvelope) {
        let alertObj = this.notificationObject(newStatus, buildEnvelope);
        slackClient.alert(alertObj);
    }

    process(job_status, callback) {
        // Parse input params

        console.log("[lib/notifier.js] processing status:", {job_status});

        const udid = job_status.udid; // udid address of target device or ANY
        var sha = job_status.sha; // sha hash of the binary status
        let md5 = job_status.md5;

        blog.state(job_status.build_id, job_status.owner, job_status.udid, job_status.status);
        
        if (typeof(job_status.outfile) === "undefined") {
            console.log("Missing outfile, exiting notifier...");
            callback(false);
            return;
        }

        // Validate params

        if (job_status.outfile == "<none>") {
            callback(false);
            return;
        }

        // this should not be needed, dropping the outfile requirement, just exit on error
        if (typeof (sha) === "undefined" || sha === "") {
            console.log("[lib/notifier.js] Calculating SHA checksum for " + job_status.outfile);
            sha = this.processSHA(job_status.outfile);
        }

        // this should not be needed, dropping the outfile requirement, just exit on error
        if (typeof (md5) === "undefined" || md5 === "") {
            console.log("[lib/notifier.js] Calculating md5 checksum for " + job_status.outfile);
            var mdata = fs.readFileSync(job_status.outfile, "binary", function (err, data) {
                if (err) {
                    console.log(err);
                }
            });
            if (mdata) {
                md5 = crypto.createHash('md5').update(mdata).digest('hex');
                //that.md5 = md5;
                console.log("[lib/notifier.js] Calculated new md5: " + md5);
            } else {
                md5 = "";
                //that.md5 = md5;
                console.log("[lib/notifier.js] Data file not found.");
                callback(false);
                return;
            }
        }

        // 2. Fetch devices, retrieve source alias, owner and source...

        devicelib.get(udid, (err, doc) => {

            if (err) {
                console.log(err);
                console.log("[lib/notifier.js] No such device with udid " + udid);
                console.log("[lib/notifier.js]", "no-device", "exiting...");
                callback(false);
                return;
            }

            if (((typeof (doc) === "undefined") || (doc == null))) {
                console.log("[lib/notifier.js]", "no-udid", "exiting...");
                callback(false);
                return;
            }

            try {
                if (!doc.hasOwnProperty("source")) {
                    console.log("[lib/notifier.js]", "no-source", "exiting...");
                    callback(false);
                    return;
                }
            } catch (e) {
                console.log(e);
            }

            // 3. Collect push tokens for FCM

            devicelib.view("devicelib", "devices_by_source", {
                "key": doc.source,
                "include_docs": true
            }, (derr, body) => {

                if (derr) {
                    console.log("[lib/notifier.js]", derr, "exiting...");
                    callback(false);
                    return;
                }

                if (body.rows.length === 0) {
                    console.log("[lib/notifier.js] No results, exiting...");
                    callback(false);
                    return;
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

                var device = {};
                device.last_build_id = job_status.build_id;
                device.last_build_date = new Date().getTime();

                const apath = app_config.deploy_root + "/" + job_status.owner_id + "/" + job_status.udid + "/" + job_status.build_id + "/" + job_status.build_id + ".zip";
                if (fs.existsSync(apath)) { // lgtm [js/path-injection]
                    device.artifact = apath;
                }

                // Save last_build_id, last_build_date and artifact
                try {
                    devicelib.atomic("devicelib", "modify", udid, device, function (error) {
                        if (error) {
                            console.log("[notifier.js] Notifier device update error: ", error);
                        }
                    });
                } catch (e) {
                    console.log(e);
                }

                let firmware;
                if (typeof(job_status.thinx_firmware_version) !== "undefined") {
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
                var buffer = new Buffer.from(envelopeString + "\n");
                fs.writeFileSync(envelopePath, buffer);
                console.log("[notifier.js] Deploying build envelope: " + deployedEnvelopePath);
                fs.writeFileSync(deployedEnvelopePath, buffer);

                // TODO: Update current build version in managed_users.repos
                // Select targets
                // Notify admin (Slack); may be out of notifier.js scope and can be done later in core after calling notifier (means when calling builder finishes)...

                console.log("[notifier.js] STATUS: " + job_status.status);

                this.notify_slack(job_status.status, slack, buildEnvelope);

                callback(true);

                /*
              
                let data = {
                    type: "firmware-update",
                    url: repo_url,
                    udid: udid,
                    commit: commit_id,
                    version: version,
                    checksum: sha,
                    dsig: a_dsig?
                };
                let messageString = this.build_update_notification(
                  data,
                  device_alias
                );
            
                notify_companion_app(push_tokens, messageString, repo_url, udid, commit_id, version, sha);
                
                // Notify client's mobile app using FCM (user must have token stored)
                //

                // Notify device's channel on firmware build to enable quick unattended auto-updates; device should validate at least dsig first.
                if ((status.indexOf("OK") !== -1) || (status.indexOf("uccess") !== -1)) {
                    console.log("[notifier.js] Not sending DEPLOYED notification update (gets stucked)...");
                    
                    let updateObject = {
                        registration: {
                            status: "FIRMWARE_UPDATE",
                            commit: commit_id,
                            version: version
                        }
                    };
                    // messenger.publish(owner, udid, JSON.stringify(updateObject)); // new implementation
                    
                } else {
                    console.log("[notifier.js] Status is not DEPLOYED, skipping device notifier...");
                }
                */
            });
        });
    }
};