// GDPR

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const Owner = require("../../lib/thinx/owner"); let owner = new Owner();

const Database = require("./database.js");
let db_uri = new Database().uri();
var userlib = require("nano")(db_uri).use(prefix + "managed_users");

module.exports = class GDPR {

    constructor() {
        const Database = require("./database.js");
        let db_uri = new Database().uri();
        this.userlib = require("nano")(db_uri).use(Globals.prefix() + "managed_users");
        this.schedule = require('node-schedule');
    }

    guard() {
        const cron_rule_15_min = "*/15 * * * *";
        this.schedule.scheduleJob(cron_rule_15_min, () => {
            this.purgeOldUsers();
        });

        const cron_rule_daily = "0 8 * * *"; // daily 8 am
        this.schedule.scheduleJob(cron_rule_daily, () => {
            this.notifyOldUsers();
        });
        return true;
    }

    purgeOldUsers(opt_callback) {
        if ((typeof (app_config.strict_gdpr) === "undefined") || app_config.strict_gdpr === false) {
            if (typeof(opt_callback) !== "undefined") opt_callback(false);
            console.log("ℹ️ [info] Not purging inactive users today.");
            return;
        }
        
        
        userlib.view("users", "owners_by_id", {
			"include_docs": false
		}, (err, body) => {

			if (err || 
				(typeof (body) === "undefined") ||
				(typeof (body.rows) === "undefined") || 
				(body.rows.length === 0)
			) {
				return;
			}

            let _error = null;

			for (let index in body.rows) {
				let doc = body.rows[index];
                var d = new Date();
                d.setMonth(d.getMonth() - 3);
                let req = { query: { id: doc.id, mindate: d, doc: doc } };
                this.userlib.atomic("users", "delete_expired", req, (error, response) => {
                    if (error) {
                        console.log("☣️ [error] Purge Old Error:", error);
                        _error = error;
                    } else {
                        console.log("✅ [info] Purged:", response);
                    }
                });
			}

            if (typeof(opt_callback) !== "undefined") opt_callback(_error);
		});

        
    }

    notify24(user, _opt_callback) {
        let opt_callback = _opt_callback;
        var d1 = new Date();
        d1.setMonth(d1.getMonth() - 3);
        d1.setDate(d1.getDay() - 1);
        if (user.last_update < d1) {
            if (typeof (user.notifiedBeforeGDPRRemoval24) === "undefined" || user.notifiedBeforeGDPRRemoval24 !== true) {
                owner.sendGDPRExpirationEmail24(user, user.email, () => {
                    this.userlib.atomic("users", "edit", user.owner, { notifiedBeforeGDPRRemoval24: true }, (uerror, abody) => {
                        console.log("📤 [info] sendGDPRExpirationEmail24", uerror, abody);
                        opt_callback(uerror);
                        opt_callback = undefined; // to prevent double call
                    });
                });
            } else {
                if (typeof(opt_callback) !== "undefined") {
                    opt_callback(false);
                    return;
                }
            }
        } else {
            if (typeof(opt_callback) !== "undefined") {
                opt_callback(false);
                return;
            }
        }
    }

    notify168(user, _opt_callback) {
        let opt_callback = _opt_callback;
        var d2 = new Date();
        d2.setMonth(d2.getMonth() - 3);
        d2.setDate(d2.getDay() - 7);
        if (user.last_update < d2) {
            if (typeof (user.notifiedBeforeGDPRRemoval168) === "undefined" || user.notifiedBeforeGDPRRemoval168 !== true) {
                owner.sendGDPRExpirationEmail168(user, user.email, () => {
                    this.userlib.atomic("users", "edit", user.owner, { notifiedBeforeGDPRRemoval168: true }, (uerror, abody) => {
                        console.log("📤 [info] sendGDPRExpirationEmail168", uerror, abody);
                        if (typeof(opt_callback) !== "undefined") {
                            opt_callback(uerror);
                            opt_callback = undefined; // to prevent double call
                        }
                    });
                });
            } else {
                if (typeof(opt_callback) !== "undefined") {
                    opt_callback(false);
                    return;
                }
            }
        } else {
            if (typeof(opt_callback) !== "undefined") {
                opt_callback(false);
                return;
            }
        }
    }

    // Should send an e-mail once a day
    // Must parse all users, find users with expiration
    notifyOldUsers(opt_callback) {

        if ((typeof (app_config.strict_gdpr) === "undefined") || app_config.strict_gdpr === false) {
            console.log("ℹ️ [info] Notification for old users skipped. Enable with strict_gdpr = true in config.json");
            if (typeof(opt_callback) !== "undefined") opt_callback(false);
            return;
        }

        this.userlib.view("users", "owners_by_username", {
            "include_docs": true
        }).then((user_view_body) => {
            for (var index in user_view_body.rows) {
                let user = user_view_body.rows[index];
                this.notify24(user);
                this.notify168(user);
            }
            if (typeof(opt_callback) !== "undefined") opt_callback(true);
        }).catch((err) => {
            console.log(err);
        });
    }
};
