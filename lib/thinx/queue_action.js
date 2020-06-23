var Globals = require("./globals.js");
var redis = require("redis");

module.exports = class Action {

    constructor(udid) {
        // action is always with string from redis
        this.action = {
            udid: udid,
            status: "new",
        };
        this.redis = redis.createClient(Globals.redis_options());
    }

    withString() {
        this.action = JSON.parse(string);
    }

    queueWithSource(source) {
        this.action.source = source;
        this.action.status = "waiting";
        this.save();
    }

    setStarted() {
        this.action.status = "running";
        this.save();
    }

    isRunning() {
        return (this.action.status == "running") ? true : false;
    }

    isWaiting() {
        return (this.action.status == "waiting") ? true : false;
    }

    save() {
        this.redis.set("queue:"+this.action.udid, JSON.stringify(this.action));
    }

    delete() {
        this.redis.expire("queue:"+this.action.udid, 0);
    }
};