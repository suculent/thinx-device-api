/* This class manages user ACLs and performs reading and writing to Mosquitto ACL file. */

const Globals = require("./globals");
module.exports = class ACL {

    constructor(user) {

        this.users = new Map();
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
        
        this.users = new Map();

        this.users.set(this.current_user, []);

        let query = this.current_user;

        let user_array = this.users.get(this.current_user);

        if (query == null) {
            query = "*";
        }

        try {
            let racls = this.client.smembers(query + ":racls");
            for (var rindex in racls) {
                user_array.push("read " + racls[rindex]);
            }
        } catch (e) {
            console.log("RACL ERROR:", e);
        }

        try {
            let wacls = this.client.smembers(query + ":wacls");
            for (var windex in wacls) {
                user_array.push("write " + wacls[windex]);
            }
        } catch (e) {
            console.log("WACL ERROR:", e);
        }

        try {
            let rwacls = this.client.smembers(query + ":rwacls");
            for (var rwindex in rwacls) {
                user_array.push("readwrite " + rwacls[rwindex]);
            }

            if (user_array.length)
                console.log("ℹ️ [info] Loaded ACLs from redis:", user_array);
        } catch (e) {
            console.log("RWACL ERROR:", e);
        }

        this.users.set(this.current_user, user_array);

        if (typeof (callback) !== "undefined") callback();
    }

    // Prunes lines with specific topic, can be used for quick removal from all devices/owners.
    // Don't use after load() before commit() or any changes will be lost:
    prune(topic, callback) {
        console.log(`ℹ️ [info] Pruning ACL topic ${topic}`);
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
            console.log("☣️ [error] Invalid user on addTopic!");
        }

        let topic_mode = this.sanitize(mode);
        let topic_name = this.sanitize(topic);
        let topic_line = topic_mode + " " + topic_name;  // sanitized – no newlines or spaces in inputs

        // Create user if does not exist
        let user_array = [];
        if (typeof (this.users.get(user)) !== "undefined") {
            user_array = this.users.get(user);
        }

        // Parse all topics by name only to allow changing mode
        let exists = false;
        for (let index in user_array) {
            let xtopic = user_array[index];
            if (xtopic.indexOf(topic) !== -1) {
                // overwrite existing
                exists = true;
                user_array[index] = `${topic_line}`;
                console.log(`ℹ️ [info] Updating existing ACL topics for user ${user}`);
            }
        }

        if (!exists) {
            user_array.push(topic_line);
        }

        // Update existing or new user
        this.users.set(user, user_array);
    }

    removeTopic(user, topic) {
        let found = false;
        let usertopics = this.users.get(user);
        for (let index in usertopics) {
            let xtopic = usertopics[index];
            if (xtopic.indexOf(topic) !== -1) {
                delete usertopics[index];
                found = true;
                console.log(`ℹ️ [info] Deleted ACL topic ${topic} for user ${user}`);
            }
        }
        if (!found) {
            console.log(`☣️ [error] Topic ${topic} for user ${user} not found on removal.`);
            return;
        }
        this.users.set(user, usertopics);
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
        let user = this.users.get(this.current_user);
        
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