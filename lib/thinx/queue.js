// Build Queue Manager

var Globals = require("./globals.js");
var redis = require("redis");
var Builder = require("./builder");
var Action = require("./queue_action");

var schedule = require('node-schedule');

module.exports = class Queue {

    constructor() {
        this.client = redis.createClient(Globals.redis_options());
    }

    cron() {
        this.builder = new Builder();
        var cron_rule = "*/1 * * * *";
        this.schedule = schedule.scheduleJob(cron_rule, () => {
            this.loop();
        });
    }

    add(udid, source, owner_id) {
        let action = new Action(udid);
        action.queueWithSource(source, owner_id);
    }

    pruneIfCompleted(action) {
        if ((action.status == "success") || (action.status == "failed")) {
            console.log("Pruning completed build action...");
            action.delete();
            return true;
        }
        return false;
    }

    findNext(callback) {
        this.client.keys("queue:*", (error, action_keys) => {

            if (action_keys.length == 0) {
                //console.log("Build job queue is empty now.");
            } else {
                console.log("action_keys", action_keys);
            }

            if (error) return false;
            let found = false;
            for (var i = 0, len = action_keys.length; i < len; i++) {
                if (found) continue;
                let action_key = action_keys[i];                
                let udid = action_key.replace("queue:", "");
                this.client.get(action_key, (job_error, contents) => {
                    if (job_error) {
                        console.log(job_error);
                        return;
                    }
                    let action = new Action(udid).withString(contents);
                    // Return first waiting action
                    if (action.isRunning()) {
                        found = true; // only if nothing is running
                    }
                    if (action.isWaiting()) {
                        console.log("Scheduling new build action...");
                        if (found == false) {
                            callback(action);
                            found = true; // only once!
                        }
                    }
                    // Prune completed actions
                    this.pruneIfCompleted(action);
                });
            }
        });
    }

    runNext(action) {
        // 2. Scheduler bude akce spouštět – jeden build po druhém postupně (FIFO), asi jednou za minutu a případně hned na webhook provést kontrolu synchronně, aby se hned spustila první.
        console.log("runNext:", action.toString());
        action.setStarted();
        var build = {
            udid: action.action.udid,
            source_id: action.action.source,
            dryrun: false
        };
        this.builder.build(action.action.owner_id, build, [], function (success, message, build_id) {
            action.delete();
            console.log("Queued build", build_id, "completed with success", success, "message", message);
        });
    }

    // should be called using scheduler
    loop() {
        // check events in queue and schedule one if eligible
        this.findNext((next) => {
            if (next) {
                this.runNext(next);
            }
        });
    }

};