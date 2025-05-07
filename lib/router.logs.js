// /api/v2/logs


const Buildlog = require("../lib/thinx/buildlog"); const blog = new Buildlog();
const AuditLog = require("../lib/thinx/audit"); var alog = new AuditLog();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Util = require("./thinx/util");

function getLogRows(body) {
    var logs = [];
    for (var lindex in body.rows) {
        const item = body.rows[lindex];

        // check if the record has a value, otherwise skip
        var hasValueProperty = Object.prototype.hasOwnProperty.call(item, "value");
        if (!hasValueProperty) continue;

        // check if the value contains log, otherwise skip
        var hasLogProperty = Object.prototype.hasOwnProperty.call(item.value, "log");
        if (!hasLogProperty) continue;

        logs.push(item.value.log);
    }
    return logs;
}

function getAuditLog(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();
    let owner = sanitka.owner(req.session.owner);
    alog.fetch(owner, (err, body) => {
        if (err !== false) {
            console.log("Audit Log Fetch Error", err);
            Util.responder(res, false, "log_fetch_failed");
        } else {
            if (!body) {
                console.log("Log for owner " + owner + " not found.");
                Util.responder(res, false, "log_fetch_failed");
            } else {
                Util.responder(res, true, body);
            }
        }
    });
}

function fetchBuildLogID(bid, req, res) {
    
    let owner = sanitka.owner(req.session.owner);
    if (typeof (bid) === "undefined" || bid == null) {
        return Util.responder(res, false, "missing_build_id");
    }

    let build_id = sanitka.udid(bid);

    blog.fetch(build_id, (err, body) => {
        if (err) {
            console.log("[warning] log fetch error", err);
            return Util.responder(res, false, "build_fetch_failed");
        }
        if (!body) {
            console.log("Log for owner " + owner + " not found with error", err);
            return Util.responder(res, false, "build_fetch_empty");
        }
        const logs = getLogRows(body);
        console.log("Build-logs for build_id " + build_id + ": " + JSON.stringify(logs));
        body.success = true;
        Util.respond(res, body);
    });
}

function getBuildLogs(req, res) {
    if (!Util.validateSession(req)) return res.status(401).end();

    let owner = req.session.owner;

    if (typeof (owner) === "undefined") {
        return Util.responder(res, false, "session_failed");
    }

    blog.list(sanitka.owner(owner), (err, body) => {

        var builds = [];

        if (err) {
            console.log("err: " + err);
            return Util.responder(res, false, "build_list_failed");
        }

        if (!body) {
            console.log("Log for owner " + owner + " not found.");
            return Util.responder(res, false, "build_list_empty");
        }

        // SIDE-EFFECT FROM HERE, MOVE INTO BUILDLIB! - >dcl
        for (var bindex in body.rows) {

            var row = body.rows[bindex];
            var buildlog = row.value;
            var log = buildlog.log;

            if (typeof (log) === "undefined") {
                console.log("Warning, build has no saved log!");
                if (typeof (body.value) === "undefined") {
                    console.log("[build list] IGNORED Invalid buildlog body value in", body, "using", buildlog);
                }
                var build = {
                    date: buildlog.timestamp,
                    udid: buildlog.udid
                };
                console.log("exporting", { build });
                builds.push(build);
            } else {
                let timestamp = 0;
                let latest = log[0];
                for (var logline of log) {
                    if (logline.timestamp > timestamp) {
                        latest = logline;
                        timestamp = logline.timestamp;
                    }
                }
                buildlog.log = [latest];
                builds.push(buildlog);
            }
        }
        // < - SIDE-EFFECT UP UNTIL HERE, MOVE INTO BUILDLIB!

        Util.responder(res, true, builds);

    });
}

module.exports = function (app) {

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.get("/api/v2/logs/audit", function (req, res) {
        getAuditLog(req, res);
    });

    app.get("/api/v2/logs/build/:bid", function (req, res) {
        if ((typeof(req.params) === "undefined") || (typeof(req.params.bid) === "undefined")) {
            return Util.failureResponse(res, 400, "missing_build_id");
        }
        fetchBuildLogID(req.params.bid, req, res);
    });

    app.get("/api/v2/logs/build", function (req, res) {
        getBuildLogs(req, res);
    });

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v1
    //

    app.get("/api/user/logs/audit", function (req, res) {
        getAuditLog(req, res);
    });

    /* Returns list of build logs for owner */
    app.get("/api/user/logs/build/list", function (req, res) {
        getBuildLogs(req, res);
    });

    // old version
    app.post("/api/user/logs/build", function (req, res) {
        if ((typeof(req.body) === "undefined") || (typeof(req.body.build_id) === "undefined")) {
            return Util.failureResponse(res, 400, "missing_build_id");
        }
        fetchBuildLogID(req.body.build_id, req, res);
    });

    // new version for new UI
    app.get("/api/user/logs/build/:bid", function (req, res) {
        if ((typeof(req.params) === "undefined") || (typeof(req.params.bid) === "undefined")) {
            return Util.failureResponse(res, 400, "missing_build_id");
        }
        fetchBuildLogID(req.params.bid, req, res);
    });
    

};