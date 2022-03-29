var Globals = require("./globals.js");
var redis = require("redis");
const { v1: uuidV1 } = require('uuid');
module.exports = class Action {

    constructor(udid) {
        // action is always with string from redis
        this.action = {
            udid: udid,
            status: "new",
            build_id: uuidV1()
        };
        this.redis = redis.createClient(Globals.redis_options());
    }

    withString(json_string) {
        this.action = JSON.parse(json_string);
        return this;
    }

    queueWithSource(source, owner_id, opt_callback) {
        this.action.source = source;
        this.action.status = "waiting";
        this.action.owner_id = owner_id;
        this.save(opt_callback);
    }

    setStarted() {
        this.action.status = "running";
        let key = "queue:"+this.action.udid;
        let contents = this.toString();
        console.log("ℹ️ [info] setting Queue Action to Started (with 20 min timeout)", {key}, {contents});
        this.redis.set(key, contents);
        this.redis.expire("queue:"+this.action.udid, 20*60); // 20 minutes max build time
    }

    getStatus() {
        return this.action.status;
    }

    isRunning() {
        if ((typeof(this.action) === "undefined") || (this.action === null)) {
            console.log("Invalid action!", this.action);
            return false;
        }
        return (this.action.status.indexOf("running") !== -1) ? true : false;
    }

    isWaiting() {
        return (this.action.status.indexOf("waiting") !== -1) ? true : false;
    }

    toString() {
        if (typeof(this.action.source) === "undefined") {
            console.log("No source defined while calling toString() on queue action: "+JSON.stringify(this.action));
        }
        return JSON.stringify(this.action);
    }

    save(opt_callback) {
        this.redis.set("queue:"+this.action.udid, this.toString(), (err, reply) => {
            if (typeof(opt_callback) !== "undefined") opt_callback();
        });
    }

    delete() {
        this.redis.del("queue:"+this.action.udid);
    }
};