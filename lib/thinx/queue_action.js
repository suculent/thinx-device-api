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
        //console.log("action with string", json_string);
        this.action = JSON.parse(json_string);
        return this;
    }

    queueWithSource(source, owner_id) {
        this.action.source = source;
        this.action.status = "waiting";
        this.action.owner_id = owner_id;
        this.save();
    }

    setStarted() {
        this.action.status = "running";
        let key = "queue:"+this.action.udid;
        let contents = this.toString();
        console.log("setStarted", {key}, {contents});
        this.redis.set(key, contents);
        this.redis.expire("queue:"+this.action.udid, 20*60); // 20 minutes max build time
    }

    getStatus() {
        return this.action.status;
    }

    isRunning() {
        return (this.action.status.indexOf("running") !== -1) ? true : false;
    }

    isWaiting() {
        return (this.action.status.indexOf("waiting") !== -1) ? true : false;
    }

    toString() {
        if (typeof(this.action.source) === "undefined") {
            throw new Error("No source defined while calling toString() on queue action: "+JSON.stringify(this.action));
        }
        return JSON.stringify(this.action);
    }

    save() {
        this.redis.set("queue:"+this.action.udid, this.toString());
    }

    delete() {
        this.redis.expire("queue:"+this.action.udid, 0);
    }
};