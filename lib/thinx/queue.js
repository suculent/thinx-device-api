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
            console.log("CHECK: Pruning completed action...");
            action.delete();
            return true;
        }
        return false;
    }

    findNext() {
        this.client.keys("queue:*", (error, action_keys) => {
            console.log("action_keys", action_keys);
            if (error) return false;
            for (var i = 0, len = action_keys.length; i < len; i++) {
                let action_key = action_keys[i];
                console.log("parsing queue key", action_key);
                let udid = action_key.replace("queue:", "");
                let contents = this.client.get(action_key);
                console.log("contents", contents);
                let action = new Action(udid).withString(contents);
                console.log(action);
                // Return nothing if busy
                if ((action.status == "running")) {
                    console.log("CHECK: Action already running...");
                    return false;
                }
                // Prune completed actions
                if (this.pruneIfCompleted(action)) continue;
                // Return first waiting action
                if (action.isWaiting()) {
                    console.log("CHECK: Scheduling new action...");
                    return action;
                }
            }
            return false; // something is running or nothing queued
        });
    }

    runNext(action) {
        // 2. Scheduler bude akce spouštět – jeden build po druhém postupně (FIFO), asi jednou za minutu a případně hned na webhook provést kontrolu synchronně, aby se hned spustila první.
        console.log("runNext:", action, action.toString());
        action.setStarted();
        var build = {
            udid: action.udid,
            source_id: action.source_id,
            dryrun: false
        };
        this.builder.build(action.owner_id, build, [], function (success, message, build_id) {
            action.delete();
            console.log("Queued build", build_id, "completed with success", success, "message", message);
        });
    }

    // should be called using scheduler
    loop() {
        console.log("Queue loop...");
        // check events in queue and schedule one if eligible
        let next = this.findNext();
        if (next) {
            console.log("CHECK: Next action found...");
            this.runNext(next);
        }
    }

};