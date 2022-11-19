// /api/v2/build

const Util = require("./thinx/util");
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Deployment = require("../lib/thinx/deployment"); var deployment = new Deployment();
module.exports = function (app) {

    app.existing_sockets = {};

    function logNextWorker(worker) {
        if (!Util.isDefined(worker)) {
            console.log(`Next worker not available.`);
        } else {
            console.log(`Next available worker – previous_id:${worker.previous_id}, running:${worker.running}, connected:${worker.connected}`);
        }
    }

    function build(req, res) {
        
        if (!Util.validateSession(req)) return res.status(401).end(); // Not authorized
        if (!Util.isDefined(req.body.build)) return res.status(400).end(); // Invalid Request

        // Input validation
        let unsafe_build = req.body.build;

        let owner = sanitka.owner(req.session.owner);
        let udid = sanitka.udid(unsafe_build.udid);
        let source_id = sanitka.source(unsafe_build.source_id);

        if (Util.isUndefinedOf([owner, udid, source_id])) {
            console.log("[warning] [build] rejecting request for invalid input:", JSON.stringify(req.body, null, 2));
            return res.status(304).end(); // Not Modified
        }

        let socket = null;
        if (Util.isDefined(app.existing_sockets)) {
            console.log("app._ws owner:", req.session.owner);
            let sowner = sanitka.owner(req.session.owner);
            let xocket = app.existing_sockets[sowner];
            if ((typeof (xocket) !== "undefined")) {
                socket = xocket;
            }
        }

        console.log("app has", Object.keys(app.existing_sockets).count, "app.existing_sockets registered.");

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
                Util.responder(res, true, "queued");
            });
        } else {
            logNextWorker(next_worker);
            let callback = function (success, response) {
                Util.responder(res, success, response);
            };

            app.builder.build(
                owner,
                safe_build,
                notifiers,
                callback,
                next_worker
            );
        }
    }

    function getLastBuildEnvelope(req, res) {
        let udid = sanitka.udid(req.body.udid);
        let owner = sanitka.owner(req.session.owner);
        if (Util.isUndefinedOf([udid, owner])) {
            Util.responder(res, false, {});
        } else {
            let envelope = deployment.latestFirmwareEnvelope(owner, udid);
            Util.responder(res, success, envelope);
        }
    }

    function rejectRequestWithError(res, name) {
        res.status(400);
        Util.responder(res, false, name);
        return false;
    }

    // solves issue with too many returns in getArtiFats
    function getArtifactsValidate(owner, udid, build_id, req, res) {

        let retVal = true;
        var device_owner = req.body.owner;
        if (!device_owner) {
            retVal = rejectRequestWithError(res, "missing_owner");
        } else if (!udid) {
            retVal = rejectRequestWithError(res, "missing_udid");
        } else if (!build_id) {
            retVal = rejectRequestWithError(res, "missing_build_id");
        } else if (owner !== device_owner) {
            retVal = rejectRequestWithError(res, "invalid_request");
        } 

        return retVal;
    }

    function getArtifacts(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        var udid = sanitka.udid(req.body.udid);
        var build_id = sanitka.udid(req.body.build_id);

        if (!getArtifactsValidate(owner, udid, build_id, req, res)) return;

        const artifact_data = deployment.artifact(owner, udid, build_id);
        if ((artifact_data !== null) && (artifact_data.length > 0)) {
            res.header("Content-Disposition", "attachment; filename=\"" + build_id + ".zip\"");
            res.header("Content-Type", "application/zip");
            Util.respond(res, artifact_data);
        } else {
            Util.responder(res, false, "artifact_not_found");
        }
    }

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.post("/api/v2/build", function (req, res) {
        build(req, res);
    });

    app.post("/api/v2/build/artifacts", function (req, res) {
        getArtifacts(req, res);
    });

    app.post("/api/v2/device/lastbuild", function (req, res) {
        getLastBuildEnvelope(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    app.post("/api/device/artifacts", function (req, res) {
        getArtifacts(req, res);
    });

    app.post("/api/device/envelope", function (req, res) {
        getLastBuildEnvelope(req, res);
    });

    app.post("/api/build", function (req, res) {
        build(req, res);
    });

};