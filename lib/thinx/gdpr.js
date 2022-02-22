// GDPR

const Globals = require("./globals.js");
const app_config = Globals.app_config();
const Owner = require("../../lib/thinx/owner");

module.exports = class GDPR {

    constructor() {
        this.userlib = require("nano")(app_config.database_uri).use(Globals.prefix() + "managed_users");
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

    purgeOldUsers() {
        if ((typeof (app_config.strict_gdpr) !== "undefined") && app_config.strict_gdpr === false) {
            console.log("[info] Not purging inactive users today.");
            return;
        }
        if (process.env.ENVIRONMENT === "test") {
            return; // no expired users in test, query will fail with "doc is null" error...
        }
        var d = new Date();
        d.setMonth(d.getMonth() - 3);
        let req = {
            query: {
                mindate: d
            }
        };
        this.userlib.atomic("users", "delete_expired", req, function (error, response) {
            if (error) {
                console.log("Purge Old Error:", error);
            } else {
                console.log("Purged:", response);
            }
        });
    }

    notify24(user) {
        var d1 = new Date();
        d1.setMonth(d1.getMonth() - 3);
        d1.setDay(d1.getDay() - 1); // setDay is not a function?
        if (user.last_update == d1) {
            if (typeof (user.notifiedBeforeGDPRRemoval24) === "undefined" || user.notifiedBeforeGDPRRemoval24 !== true) {
                Owner.sendGDPRExpirationEmail24(user, user.email, function () {
                    this.userlib.atomic("users", "edit", user.owner, { notifiedBeforeGDPRRemoval24: true }, (uerror, abody) => {
                        console.log("sendGDPRExpirationEmail24", uerror, abody);
                    });
                });
            }
        }
    }

    notify168(user) {
        var d2 = new Date();
        d2.setMonth(d2.getMonth() - 3);
        d2.setDay(d2.getDay() - 7);
        if (user.last_update == d2) {
            if (typeof (user.notifiedBeforeGDPRRemoval168) === "undefined" || user.notifiedBeforeGDPRRemoval168 !== true) {
                Owner.sendGDPRExpirationEmail168(user, user.email, function () {
                    this.userlib.atomic("users", "edit", user.owner, { notifiedBeforeGDPRRemoval168: true }, (uerror, abody) => {
                        console.log("sendGDPRExpirationEmail168", uerror, abody);
                    });
                });
            }
        }
    }

    // Should send an e-mail once a day
    // Must parse all users, find users with expiration
    notifyOldUsers() {

        if ((typeof (app_config.strict_gdpr) !== "undefined") && app_config.strict_gdpr === false) {
            console.log("Notification for old users skipped. Enable with strict_gdpr = true in config.json");
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
        }).catch((err) => {
            console.log(err);
        });
    }
};
