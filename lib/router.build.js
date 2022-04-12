// /api/v2/build

const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Deployment = require("../lib/thinx/deployment"); var deployment = new Deployment();
module.exports = function (app) {

    /*
     * Builder
     */

    let existing_sockets = {};

    // Build respective firmware and notify target device(s
    app.post("/api/build", function (req, res) {

        if (!Util.validateSession(req)) return res.status(401).end();

        // Input validation
        let unsafe_build = req.body.build;

        if (typeof (unsafe_build) === "undefined") {
            res.status(400).end(); // Invalid Request
            return;
        }
        let owner = sanitka.owner(req.session.owner);
        let udid = sanitka.udid(unsafe_build.udid);
        let source_id = sanitka.udid(unsafe_build.source_id);

        if ((owner == null) || (udid == null) || (source_id == null)) {
            res.status(304).end(); // Not Modified
            console.log("[warning] [build] rejecting request for invalid input");
            return;
        }

        let socket = null;
        if (typeof (existing_sockets) !== "undefined") {
            console.log("app._ws owner:", req.session.owner);
            let sowner = sanitka.owner(req.session.owner);
            if ((typeof (sowner) !== "undefined") && (sowner !== null)) {
                let xocket = existing_sockets[sowner];
                if ((typeof (xocket) !== "undefined")) {
                    socket = xocket;
                }
            } else {
                console.log("[debug] SOWNER null");
            }
        }

        console.log("app has", Object.keys(existing_sockets).count, "existing_sockets registered.");

        var notifiers = {
            messenger: app.messenger,
            websocket: socket || null
        };


        let dryrun = false;
        if (typeof (unsafe_build.dryrun) !== "undefined" && unsafe_build.dryrun === true) {
            dryrun = true;
        }
        let safe_build = {
            udid: udid,
            source_id: source_id,
            dryrun: dryrun
        };
        let next_worker = app.queue.nextAvailableWorker();
        if (next_worker === false) {
            console.log("No swarm workers found.");
            // should only add to queue if there are no workers available (which should not, on running build...)
            app.queue.add(udid, source_id, owner, () => {
                Util.respond(res, { status: true, result: "queued" });
            });
        } else {
            console.log("Next available worker: ", next_worker);
            let callback = function (success, response) {
                Util.respond(res, response);
            };

            app.builder.build(
                owner,
                safe_build,
                notifiers,
                callback,
                next_worker
            );
        }
    });

    // should be under /api
    app.post("/api/device/envelope", function (req, res) {
        let udid = sanitka.udid(req.body.udid);
        let owner = sanitka.owner(req.session.owner);
        if ((typeof (udid) === "undefined") || (typeof (owner) === "undefined")) {
            Util.respond(res, "{}");
        } else {
            let envelope = deployment.latestFirmwareEnvelope(owner, udid);
            Util.respond(res, JSON.stringify(envelope));
        }
    });

    // Get build artifacts
    app.post("/api/device/artifacts", function (req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        var udid = sanitka.udid(req.body.udid);
        var build_id = sanitka.udid(req.body.build_id);

        if (!udid) {
            Util.respond(res, {
                success: false,
                status: "missing_udid"
            });
            return;
        }

        if (!build_id) {
            Util.respond(res, {
                success: false,
                status: "missing_build_id"
            });
            return;
        }

        const artifact_data = deployment.artifact(owner, udid, build_id);

        if ((artifact_data !== null) && (artifact_data.length > 0)) {
            res.header("Content-Disposition", "attachment; filename=\"" + build_id + ".zip\"");
            res.header("Content-Type", "application/zip");
            Util.respond(res, artifact_data);
        } else {
            Util.respond(res, {
                success: false,
                status: "artifact_not_found"
            });
        }

    });


};