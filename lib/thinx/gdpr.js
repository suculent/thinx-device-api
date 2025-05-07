// GDPR

const Globals = require("./globals.js");
const app_config = Globals.app_config(); // for strict_gdpr

module.exports = class GDPR {

    constructor(app) {
        const Database = require("./database.js");
        let db_uri = new Database().uri();
        this.userlib = require("nano")(db_uri).use(Globals.prefix() + "managed_users");
        this.schedule = require('node-schedule');
        this.owner = app.owner;
    }

    guard() {

        if ((typeof (app_config.strict_gdpr) === "undefined") || app_config.strict_gdpr === false) {
            return true;
        }

        let cron_rule_15_min = "*/15 * * * *";
        let cron_rule_daily = "0 8 * * *"; // daily 8 am

        if (process.env.ENVIRONMENT == "test") {
            cron_rule_15_min = "0/59 * * * * *"; // seconds
            cron_rule_daily = "0/59 * * * * *"; // seconds
        }
    
        this.schedule.scheduleJob(cron_rule_15_min, () => {
            this.purgeOldUsers();
        });

        
        this.schedule.scheduleJob(cron_rule_daily, () => {
            this.notifyOldUsers();
        });
        return true;
    }

    purgeIfExpired(id) {
        var d = new Date();
        d.setMonth(d.getMonth() - 3);
        this.userlib.atomic("users", "delete_expired", id, { mindate: d }, (error, response) => {
            if (error) {
                if ((typeof(error.code) !== "undefined") && (error.code !== 409)) console.log("☣️ [error] Purge Old Error:", error, "with id", id); // returns invalid parameters
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
                if ((typeof(doc.deleted) === "undefined") || (doc.deleted === false)) {
                    this.purgeIfExpired(doc.id);
                }
			}
            if (typeof(opt_callback) !== "undefined") opt_callback(true);
        }).catch(() => {
            if (typeof(opt_callback) !== "undefined") opt_callback(true);   
        });
    }

    monthDayAgo(month, day) {
        var d = new Date();
        d.setMonth(d.getMonth() - month);
        d.setDate(d.getDay() - day);
        return Math.floor(d.valueOf() / 1000);
    }

    notify24(user, _opt_callback) {
        let opt_callback = _opt_callback;
        if ((user.last_update < this.monthDayAgo(3, 1)) &&
            ((typeof (user.notifiedBeforeGDPRRemoval24) === "undefined") || (user.notifiedBeforeGDPRRemoval24 !== true))
            ) {
            this.owner.sendGDPRExpirationEmail24(user, user.email, () => {
                this.userlib.atomic("users", "edit", user.owner, { notifiedBeforeGDPRRemoval24: true }, (uerror) => {
                    opt_callback(uerror);
                    opt_callback = null; // to prevent double call
                });
            });
        } else {
            if ((typeof (opt_callback) !== "undefined") && (opt_callback !== null)) return opt_callback(false);
        }
    }

    notify168(user, _opt_callback) {
        let opt_callback = _opt_callback;
        if ((user.last_update < this.monthDayAgo(3, 7)) &&
            ((typeof (user.notifiedBeforeGDPRRemoval168) === "undefined") || (user.notifiedBeforeGDPRRemoval168 !== true))
            ) {
            this.owner.sendGDPRExpirationEmail168(user, user.email, () => {
                this.userlib.atomic("users", "edit", user.owner, { notifiedBeforeGDPRRemoval168: true }, (uerror) => {
                    if (typeof (opt_callback) !== "undefined") {
                        opt_callback(uerror);
                        opt_callback = null; // to prevent double call
                    }
                });
            });
        } else {
            if ((typeof (opt_callback) !== "undefined") && (opt_callback !== null)) return opt_callback(false);
        }
    }

    // Should send an e-mails once a day, two emails in total per owner
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
        }).catch(() => {
            if (typeof(opt_callback) !== "undefined") opt_callback(true);
        });
    }
};
