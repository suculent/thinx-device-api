const { v4: uuidV4 } = require('uuid');
module.exports = class Action {

    constructor(udid, redis) {
        // action is always with string from redis
        this.action = {
            udid: udid,
            status: "new",
            build_id: uuidV4()
        };
        this.redis = redis;
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
        this.redis.set(key, contents, () => {
            this.redis.expire("queue:"+this.action.udid, 20*60); // 20 minutes max build time
        });
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

    setError() {
        let action = new Action(this.action.udid, this.redis);
        action.action.status = "error";
        action.save();
    }

    toString() {
        return JSON.stringify(this.action);
    }

    save(opt_callback) {
        this.redis.set("queue:"+this.action.udid, this.toString());
        // errors are ignored, good only for analytics but must not leak details
        if (typeof(opt_callback) !== "undefined") opt_callback();
    }

    delete() {
        this.redis.del("queue:"+this.action.udid);
    }
};