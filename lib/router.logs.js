// /api/v2/logs


const Buildlog = require("../lib/thinx/buildlog"); const blog = new Buildlog();
const AuditLog = require("../lib/thinx/audit"); var alog = new AuditLog();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Util = require("./thinx/util");

module.exports = function (app) {


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
                console.log(err);
                Util.responder(res, false, "log_fetch_failed");
            } else {
                if (!body) {
                    console.log("Log for owner " + owner + " not found.");
                    Util.responder(res, false, "log_fetch_failed");
                } else {
                    Util.respond(res, {
                        success: true,
                        auditlog: body
                    });
                }
            }
        });
    }

    function fetchBuildLogID(req, res) {
        if (!Util.validateSession(req)) return res.status(401).end();
        let owner = sanitka.owner(req.session.owner);
        if (typeof (req.body.build_id) === "undefined") {
            return Util.responder(res, false, "missing_build_id");
        }

        var build_id = sanitka.udid(req.body.build_id);

        if (!build_id) {
            return Util.responder(res, false, "invalid_build_id");
        }

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
            return Util.respond(res, {
                success: false,
                status: "session_failed"
            });
        }

        blog.list(sanitka.owner(owner), (err, body) => {

            var builds = [];

            if (err) {
                console.log("err: " + err);
                return Util.respond(res, {
                    success: false,
                    status: "build_list_failed",
                    error: err.message
                });
            }

            if (!body) {
                console.log("Log for owner " + owner + " not found.");
                return Util.respond(res, {
                    success: false,
                    status: "build_list_empty"
                });
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

            Util.respond(res, {
                success: true,
                builds: builds
            });

        });
    }

    ///////////////////////////////////////////////////////////////////////
    // API ROUTES v2
    //

    app.get("/api/v2/logs/audit", function (req, res) {
        getAuditLog(req, res);
    });

    app.get("/api/v2/logs/build/:build_id", function (req, res) {
        req.body.build_id = req.params.build_id;
        fetchBuildLogID(req, res);
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
        fetchBuildLogID(req, res);
    });

    // new version for new UI
    app.get("/api/user/logs/build/:build_id", function (req, res) {
        req.body.build_id = req.params.build_id;
        fetchBuildLogID(req, res);
    });
    

};