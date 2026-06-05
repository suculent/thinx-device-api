let Globals = require("./globals.js");
let app_config = Globals.app_config();
let prefix = Globals.prefix();
let fs = require('fs-extra');

const InfluxConnector = require('./influx');

const Database = require("./database.js");
let db_uri = new Database().uri();
let devicelib = require("nano")(db_uri).use(prefix + "managed_devices"); // lgtm [js/unused-local-variable]

const SlackNotify = require("slack-notify");

module.exports = class Notifier {

    /**
     * Static — fired once on app boot. Posts a Slack message containing
     * the package.json version and the last 8 chars of the commit SHA so
     * operators can confirm which build is live without diffing bundles.
     *
     * Reads `process.env.COMMIT_SHA` (set by the parent meta-repo's CI
     * `--build-arg COMMIT_SHA=$CIRCLE_SHA1` + Dockerfile ARG/ENV).
     * Falls back to a local `git rev-parse HEAD` (works in dev only —
     * .git is not present in the production image) and finally to
     * 'unknown'.
     *
     * Silently no-ops if SLACK_WEBHOOK isn't configured (dev runs).
     */
    static notifyAppStart() {
        try {
            const pkg = require("../../package.json");
            const version = pkg.version || "unknown";

            let commit = process.env.COMMIT_SHA || "";
            if (!commit) {
                try {
                    commit = require("child_process").execSync("git rev-parse HEAD").toString().trim();
                } catch (_e) { /* no .git in container — expected */ }
            }
            const commitShort = commit ? commit.slice(-8) : "unknown";

            const webhook = process.env.SLACK_WEBHOOK;
            if (!webhook) {
                console.log("ℹ️ [info] [notifier.js] SLACK_WEBHOOK not set — skipping app-start notification");
                return;
            }

            const slack = SlackNotify(webhook);
            // `.send()` returns a Promise — catch async rejection so an invalid
            // webhook can never surface as an unhandled rejection (see build-status
            // notifier above).
            const sendResult = slack.send({
                text: `🚀 THiNX Device API started — v${version} (commit ${commitShort})`,
                username: "notifier.js",
                icon_emoji: ":rocket:",
                channel: "#thinx"
            });
            if (sendResult && typeof sendResult.catch === "function") {
                sendResult.catch((e) => console.log("[error] [notifier.js] app-start Slack send failed (async):", e && e.message ? e.message : e));
            }
        } catch (e) {
            console.log("[notifier.js] notifyAppStart failed", e);
        }
    }

    deploymentPathForDevice(an_owner, a_udid) {
        let user_path = app_config.data_root + app_config.deploy_root + "/" + an_owner;
        return user_path + "/" + a_udid;
    }

    /* Generates notification object for slack-notify https://www.npmjs.com/package/slack-notify */
    notificationObject(newStatus, buildEnvelope) {
        let alertObj = {};
        if (newStatus === true || newStatus.indexOf("OK") === 0) {
            alertObj = {
                text: `Building of ${buildEnvelope.url} commit ${buildEnvelope.commit} successfully completed.`,
                username: "notifier.js",
                fields: buildEnvelope,
                channel: "#thinx" // TODO: import this from app_config.slack.bot_topic
            };
        } else if (newStatus.indexOf("DRY_RUN_OK") !== -1) {
            alertObj = {
                text: `Dry run successful. Firmware from git ${buildEnvelope.url} commit ${buildEnvelope.commit} left undeployed.`,
                username: "notifier.js",
                icon_emoji: ":ghost:",
                fields: buildEnvelope,
                channel: "#thinx" // TODO: import this from app_config.slack.bot_topic
            };
        } else {
            alertObj = {
                text: `Building of ${buildEnvelope.url} commit ${buildEnvelope.commit} has failed.`,
                username: "notifier.js",
                icon_emoji: ":computerage:",
                fields: buildEnvelope,
                channel: "#thinx" // TODO: import this from app_config.slack.bot_topic
            };
        }
        return alertObj;
    }

    process(job_status, callback) {

        console.log("[DEBUG] [lib/notifier.js] processing status:", { job_status });
        
        if ( (typeof(job_status) === "undefined") ||
             (typeof (job_status.outfile) === "undefined") ||
             (job_status.outfile === null))
        {
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
                } catch (_e) {
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

                // The DI is intentionally omitted here, because of the migrated SlackNotify and its potential exception throws.
                // To solve this problem better by refactoring, the 'slack-notify' should be initialized in constructure (while this Notifier has no constructor at the moment).
                try {
                    const webhook = process.env.SLACK_WEBHOOK;
                    if (!webhook) {
                        console.log("ℹ️ [info] [notifier.js] SLACK_WEBHOOK not set — skipping build-status notification");
                    } else {
                        const slack = SlackNotify(webhook);
                        // slack-notify v2 `.send()` returns a Promise. A try/catch
                        // only traps SYNC throws — an async rejection (e.g. the Slack
                        // webhook responding `no_team` for an invalid/expired hook)
                        // would otherwise become an UNHANDLED rejection that floats
                        // and, under Node's throw-on-unhandled-rejection, crashes an
                        // unrelated async context (the source of the CI `no_team`
                        // flake and a production crash risk). Catch it explicitly.
                        const sendResult = slack.send(this.notificationObject(job_status.status, buildEnvelope));
                        if (sendResult && typeof sendResult.catch === "function") {
                            sendResult.catch((e) => console.log("[error] [notifier.js] Slack build-status send failed (async):", e && e.message ? e.message : e));
                        }
                    }
                } catch (e) {
                    console.log("[error] SlackNotify startup failed with", {e});
                }

                callback(true);
            });
        });
    }
};