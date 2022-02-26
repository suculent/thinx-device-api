/* This class manages user ACLs and performs reading and writing to Mosquitto ACL file. */

const Globals = require("./globals");
module.exports = class ACL {

    constructor(user) {

        this.users = {};
        this.current_user = user;

        let options = Globals.redis_options();
        this.client = require("redis").createClient(options);
    
        this.load();
    }

    /**
     * Read current ACL file into manageable structure
     * @param {string} filename - Mosquitto ACL file
     */

    load(callback) {
        this.users = {};

        this.users[this.current_user] = [];

        let query = this.current_user;

        if (query == null) {
            query = "*";
        }

        try {
            let racls = this.client.smembers(query + ":racls");
            for (var rindex in racls) {
                this.users[this.current_user].push("read " + racls[rindex]);
            }
        } catch (e) {
            console.log("1", e);
        }

        try {
            let wacls = this.client.smembers(query + ":wacls");
            for (var windex in wacls) {
                this.users[this.current_user].push("write " + wacls[windex]);
            }
        } catch (e) {
            console.log("2", e);
        }

        try {
            let rwacls = this.client.smembers(query + ":rwacls");
            for (var rwindex in rwacls) {
                this.users[this.current_user].push("readwrite " + rwacls[rwindex]);
            }

            if (this.users[this.current_user].length)
                console.log("[info] Loaded ACLs from redis:", this.users[this.current_user]);
        } catch (e) {
            console.log("3", e);
        }

        if (typeof (callback) !== "undefined") callback();
    }

    // Prunes lines with specific topic, can be used for quick removal from all devices/owners.
    // Don't use after load() before commit() or any changes will be lost.

    prune(topic, callback) {
        console.log("[warning] Pruning ACL topic", topic);
        // get user from topic, call this.removeTopic(user, topic, callback...)
        this.removeTopic(this.userFromTopic(topic), topic);
        if (typeof (callback) !== "undefined") callback();
    }

    userFromTopic(topic) {
        return topic.split("/")[0];
    }

    sanitize(input) {
        let no_spaces = input.replace(/\s/g, "");
        return no_spaces.replace(/\n/g, "");
    }

    addTopic(user, mode, topic) {

        if (typeof (user) == "undefined") {
            throw new Error("Invalid user on addTopic!");
        }

        let topic_mode = this.sanitize(mode);
        let topic_name = this.sanitize(topic);
        let topic_line = topic_mode + " " + topic_name;  // sanitized – no newlines or spaces in inputs

        // Create user if does not exist
        let user_array = [];
        if (typeof (this.users[user]) !== "undefined") {
            user_array = this.users[user];
        }

        // Parse all topics by name only to allow changing mode
        let exists = false;
        for (let index in user_array) {
            let xtopic = user_array[index];
            if (xtopic.indexOf(topic) !== -1) {
                // overwrite existing
                exists = true;
                user_array[index] = topic_line;
                console.log("[ACL] Topic already exists for this user, updating.");
            }
        }

        if (!exists) {
            user_array.push(topic_line);
        }

        // Update existing or new user
        this.users[user] = user_array;
    }

    removeTopic(user, topic) {
        let found = false;
        for (let index in this.users[user]) {
            let xtopic = this.users[user][index];
            if (xtopic.indexOf(topic) !== -1) {
                // overwrite existing
                found = true;
                delete this.users[user][index];
                console.log("[ACL] Topic deleted.");
            }
        }
        if (!found) {
            console.log("[ACL] Topic", topic, "for user", user, "not found on removal.");
        }
    }

    commit(callback) {
        this.commit_redis(callback);
    }

    commit_redis(callback) {
        
        if (this.current_user == null) {
            console.log("Current user shouldn't be null on commit.");
            callback(false, "user_null");
            return;
        }

        // walk through user
        let user = this.users[this.current_user];
        
        if ((typeof (user) === "undefined") || (user.length == 0 || user === null)) {
            callback(false, "user_not_defined");
            return;
        }
            
        let racls = [];
        let wacls = [];
        let rwacls = [];

        for (var index in user) {
            let topic = user[index];
            if (topic.startsWith("readwrite ")) {
                rwacls.push(topic.replace("readwrite ", ""));
            }
            if (topic.startsWith("read ")) {
                racls.push(topic.replace("read ", ""));
            }
            if (topic.startsWith("write ")) {
                wacls.push(topic.replace("write ", ""));
            }
        }

        if (racls.length > 0) {
            this.client.sadd(this.current_user + ":racls", racls, (error, reply) => {
                if (error) console.log("RACLS1 failed.", error, reply);
            });
            // Auto-add subscribe ACLS
            this.client.sadd(this.current_user + ":sacls", racls, (error, reply) => {
                if (error) console.log("SACLS1 failed.", error, reply);
            });
        }

        if (wacls.length > 0) {
            this.client.sadd(this.current_user + ":wacls", wacls, (error, reply) => {
                if (error) console.log("RACLS2 failed.", error, reply);
            });
        }

        if (rwacls.length > 0) {
            // Add read/write ACLS
            this.client.sadd(this.current_user + ":rwacls", rwacls, (error, reply) => {
                if (error) console.log("RWACLS failed with error", error, reply);
            });
            // Auto-add subscribe ACLS
            this.client.sadd(this.current_user + ":sacls", rwacls, (error, reply) => {
                if (error) console.log("SACLS2 failed.", error, reply);
            });
        }

        // Generic subscribe ACL for Mosquitto > 1.5
        this.client.sadd(this.current_user + ":sacls", ["/#"], (error, reply) => {
            if (error) console.log("SACLS3 failed.", error, reply);
        });


        if (typeof (callback) !== "undefined") callback(true, "acls_added");
    }
};