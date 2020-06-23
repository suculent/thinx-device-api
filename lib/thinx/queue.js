// Build Queue Manager

var Globals = require("./globals.js");
var redis = require("redis");
var Builder = require("../lib/thinx/builder");

var Action = require("./queue_action");

var schedule  = require('node-schedule');

module.exports = class Queue {

    constructor() {
        this.client = redis.createClient(Globals.redis_options());
    }

    cron() {
        var cron_rule = "*/1 * * * *";
        console.log("Initializing Build scheduler...");
        this.schedule = schedule.scheduleJob(cron_rule, () => {
          this.loop();
          console.log('Running build jobs loop...');
        });
    }

    add(udid, source) {
        let action = new Action(udid);
        action.queueWithSource(source);
    }

    findNext() {
        let action_keys = redis.keys("queue:*");
        for (const action_key of action_keys) {
            let string = redis.get(action_key);
            // Return nothing if busy
            if ((action.status == "running")) {
                console.log("CHECK: Action already running...");
                return {};
            }
            // Fetch action synchronously
            let udid = action_key.replace("queue:", "");
            let action = new Action(udid).withString(string);
            // Prune completed actions
            if ((action.status == "success") || (action.status == "failed")) {
                console.log("CHECK: Pruning completed action...");
                action.delete();
            }
            // Add waiting actions to list
            if (action.isWaiting()) {
                console.log("CHECK: Scheduling new action...");
                return action;
            }
        }
        return {}; // something is running or nothing queued
    }

    runNext(action_key, action) {
        // 2. Scheduler bude akce spouštět – jeden build po druhém postupně (FIFO), asi jednou za minutu a případně hned na webhook provést kontrolu synchronně, aby se hned spustila první.
        action.status = "running";
        this.saveAction(action_key, action);
        var build = {
            udid: action.udid,
            source_id: action.source_id,
            dryrun: false
        };
        var builder = new Builder();
        builder.build(owner, build, [], function(success, message, build_id) {
            action.delete();
            console.log("Queued build", build_id, "completed with success", success, "message", message);
        });
    }

    // should be called using scheduler
    loop() {
        // check events in queue and schedule one if eligible
        let next = this.findNext();
        if (next) {
            console.log("CHECK: Next action found...");
            this.runNext(next_key, action);
        }
    }

};