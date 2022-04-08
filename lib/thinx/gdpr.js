// GDPR

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const Owner = require("../../lib/thinx/owner"); let owner = new Owner();
module.exports = class GDPR {

    constructor() {
        const Database = require("./database.js");
        let db_uri = new Database().uri();
        this.userlib = require("nano")(db_uri).use(Globals.prefix() + "managed_users");
        this.schedule = require('node-schedule');
    }

    guard() {

        if ((typeof (app_config.strict_gdpr) === "undefined") || app_config.strict_gdpr === false) {
            console.log("ℹ️ [info] Not purging inactive users today.");
            return true;
        }

        let cron_rule_15_min = "*/15 * * * *";
        let cron_rule_daily = "0 8 * * *"; // daily 8 am

        if (process.env.ENVIRONMENT == "test") {
            cron_rule_15_min = "0/45 * * * * *"; // seconds
            cron_rule_daily = "0/45 * * * * *"; // seconds
        }
    
        this.schedule.scheduleJob(cron_rule_15_min, () => {
            this.purgeOldUsers();
        });

        
        this.schedule.scheduleJob(cron_rule_daily, () => {
            this.notifyOldUsers();
        });
        return true;
    }

    purgeAtomic(id) {
        var d = new Date();
        d.setMonth(d.getMonth() - 3);
        this.userlib.atomic("users", "delete_expired", id, { mindate: d }, (error, response) => {
            if (error) {
                console.log("☣️ [error] Purge Old Error:", error); // returns invalid parameters
                return;
            } 
            console.log("✅ [info] Purged:", response);
        });
    }

    purgeOldUsers(opt_callback) {
        this.userlib.view("users", "owners_by_id", {
			"include_docs": false
        }).then((body) => {
            for (let index in body.rows) {
				let doc = body.rows[index];
                console.log("Doc for optional purge: ", {doc}); // TODO: FIXME: Remove me, debug only
                this.purgeAtomic(doc.id);
			}
            if (typeof(opt_callback) !== "undefined") opt_callback(true);
        }).catch((err) => {
            if (typeof(opt_callback) !== "undefined") opt_callback(err);
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
                        opt_callback = null; // to prevent double call
                    });
                });
                return;
            } 
        } 
        if ((typeof(opt_callback) !== "undefined") && (opt_callback !== null)) return opt_callback(false);
    }

    notify168(user, _opt_callback) {
        let opt_callback = _opt_callback;
        var d2 = new Date();
        d2.setMonth(d2.getMonth() - 3);
        d2.setDate(d2.getDay() - 7);
        if (user.last_update < d2) {
            if (typeof (user.notifiedBeforeGDPRRemoval168) === "undefined" || user.notifiedBeforeGDPRRemoval168 !== true) {
                owner.sendGDPRExpirationEmail168(user, user.email, () => {
                    this.userlib.atomic("users", "edit", user.owner, { notifiedBeforeGDPRRemoval168: true }, (uerror, /* abody */) => {
                        //console.log("📤 [info] sendGDPRExpirationEmail168", uerror, abody); // abody is whole (edited) user object
                        if (typeof(opt_callback) !== "undefined") {
                            opt_callback(uerror);
                            opt_callback = null; // to prevent double call
                        }
                    });
                });
                return;
            } 
        } 
        if ((typeof(opt_callback) !== "undefined") && (opt_callback !== null)) return opt_callback(false);
    }

    // Should send an e-mail once a day
    // Must parse all users, find users with expiration
    notifyOldUsers(opt_callback) {
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
