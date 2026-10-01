// /api/v2/logs


const Buildlog = require("../lib/thinx/buildlog"); const blog = new Buildlog();
const AuditLog = require("../lib/thinx/audit"); var alog = new AuditLog();
const Sanitka = require("./thinx/sanitka"); var sanitka = new Sanitka();
const Util = require("./thinx/util");
const paging = require("./thinx/log_paging");

// LOG-03 / LOG-04: the paged branch is opt-in. A request with `limit` or
// `cursor` gets {success, response, paging}; anything else keeps the legacy
// {success, response} shape the classic console relies on (LOG-02).
function isPagedRequest(q) {
    if (!q || typeof q !== "object") return false;
    return Object.prototype.hasOwnProperty.call(q, "limit") ||
        Object.prototype.hasOwnProperty.call(q, "cursor");
}

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
    // The owner comes from the session only: never from the query, the
    // cursor or the body.
    let owner = sanitka.owner(req.session.owner);

    if (isPagedRequest(req.query)) {
        const q = req.query;
        const lim = paging.parseLimit(q.limit);
        if (!lim.ok) return Util.failureResponse(res, 400, "invalid_limit");
        const cur = paging.decodeCursor(q.cursor, "audit");
        if (!cur.ok) return Util.failureResponse(res, 400, "invalid_cursor");
        alog.fetchPage(owner, lim.limit, cur.cursor, (err, page) => {
            if (err) return Util.responder(res, false, "log_fetch_failed");
            Util.respond(res, { success: true, response: page.items, paging: page.paging });
        });
        return;
    }

    alog.fetch(owner, (err, body) => {
        if (err !== false) {
            const code = (err && typeof err.statusCode === "number") ? err.statusCode : "error";
            console.log("Audit Log Fetch Error", code);
            Util.responder(res, false, "log_fetch_failed");
        } else {
            if (!body) {
                console.log("Audit log not found.");
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

    if (typeof (req.session.owner) === "undefined") {
        return Util.responder(res, false, "session_failed");
    }

    // The owner comes from the session only: never from the query, the
    // cursor or the body.
    const owner = sanitka.owner(req.session.owner);

    if (isPagedRequest(req.query)) {
        const q = req.query;
        const lim = paging.parseLimit(q.limit);
        if (!lim.ok) return Util.failureResponse(res, 400, "invalid_limit");
        const cur = paging.decodeCursor(q.cursor, "builds");
        if (!cur.ok) return Util.failureResponse(res, 400, "invalid_cursor");
        blog.listPage(owner, lim.limit, cur.cursor, (err, page) => {
            if (err) return Util.responder(res, false, "build_list_failed");
            Util.respond(res, {
                success: true,
                response: page.rows.map((row) => Buildlog.toBuildListItem(row.doc)),
                paging: page.paging
            });
        });
        return;
    }

    // Legacy: reads only, no pruning (D-07); same item shape as before.
    blog.list(owner, (err, body) => {

        if (err) {
            console.log("Build list failed.");
            return Util.responder(res, false, "build_list_failed");
        }

        if (!body) {
            console.log("Build list not found.");
            return Util.responder(res, false, "build_list_empty");
        }

        const rows = Array.isArray(body.rows) ? body.rows : [];
        Util.responder(res, true, rows.map((row) => Buildlog.toBuildListItem(row ? row.value : null)));
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