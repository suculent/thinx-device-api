/* This class manages user ACLs and performs reading and writing to Mosquitto ACL file. */

const Globals = require("./globals");
const fs = require("fs-extra");
const readline = require('readline');
var exec = require("child_process");

const lineTypes = {
    "none": 0,
    "user": 1,
    "topic": 2
};

module.exports = class ACL {

    constructor(user) {

        let app_config = Globals.app_config();

        this.users = {};
        this.path = app_config.mqtt.acl;
        this.current_user = user;

        if (!fs.existsSync(this.path)) {
            console.log("[ACL] Warning, no ACL file found at", this.path); // could create file on first run
        }

        this.use_plugin = false;  // does not use goauth plugin by default

        if ((typeof (app_config.mqtt) !== "undefined") &&
            (typeof (app_config.mqtt.use_plugin) !== "undefined")) {
            this.use_plugin = app_config.mqtt.use_plugin;
			let options = Globals.redis_goauth_options();
            this.client = require("redis").createClient(options);
        }

        this.load();
    }

    /**
     * Read current ACL file into manageable structure
     * @param {string} filename - Mosquitto ACL file
     */

    load(callback) {
        if (this.use_plugin) {
            this.load_redis(callback);
        } else {
            this.load_file(callback);
        }
    }

    load_redis(callback) {

        this.users = {};

        this.users[this.current_user] = [];

        let query = this.current_user;

        if (query == null) {
            query = "*";
        }

        let racls = this.client.get(query + ":racls");

        for (var rindex in racls) {
            this.users[this.current_user].push("read " + racls[rindex]);
        }

        let wacls = this.client.get(query + ":wacls");

        for (var windex in wacls) {
            this.users[this.current_user].push("write " + wacls[windex]);
        }

        let rwacls = this.client.get(query + ":rwacls");

        for (var rwindex in rwacls) {
            this.users[this.current_user].push("readwrite " + rwacls[rwindex]);
        }

        if (this.users[this.current_user].length)
            console.log("Loaded ACLs from redis:", this.users[this.current_user]);

        if (typeof(callback) !== "undefined") callback();
    }

    load_file(callback) {
        const readInterface = readline.createInterface({
            input: fs.createReadStream(this.path),
            output: false,
            console: false
        });

        this.users = {};
        this.current_user = null;

        readInterface.on('line', (line) => {
            this.parseLine(line);
            // If line starts with 'user', create new user... if line starts with 'topic', write to same user...
        });

        readInterface.on('close', () => {
            //console.log("[ACL] Loaded ACL file.");
            // this.debugPrintACLs();
            if (typeof (callback) !== "undefined") callback();
        });
    }

    // Prunes lines with specific topic, can be used for quick removal from all devices/owners.
    // Don't use after load() before commit() or any changes will be lost.

    prune(topic, callback) {

        console.log("Pruning ACL topic", topic);
        let search_query = "/" + topic;

        let memcache = "";
        const readInterface = readline.createInterface({
            input: fs.createReadStream(this.path),
            output: false, // enables console logging
            console: false
        });
        readInterface.on('line', (line) => {
            if (!line.endsWith(search_query)) {
                memcache += line + '\n';
            }
        });
        readInterface.on('close', () => {
            // console.log("[ACL] Pruned ACL file, saving:", memcache);
            if (memcache.length > 8) {
                let stamp = "-" + new Date().getTime() + ".bak";
                fs.copyFileSync(this.path, this.path + stamp); // backup
                fs.writeFileSync(this.path, memcache);
            }
            if (typeof (callback) !== "undefined") callback();
        });
    }

    parseLine(line) {
        let segments = line.split(" ");
        let firstWord = segments[0];
        let lineType = this.parseLineType(firstWord);
        switch (lineType) {
            case lineTypes["user"]: {
                let user_insane = segments[1];
                let user = user_insane; // todo: sanitize
                if (typeof (user) !== "undefined") {
                    this.current_user = user;
                    this.users[this.current_user] = [];
                }
            } break;
            case lineTypes["topic"]: {
                let topic_mode = segments[1];
                let topic_name = segments[2];
                let topic = topic_mode + " " + topic_name; // todo: sanitize
                this.users[this.current_user].push(topic);
            } break;
            default: break;
        }
    }

    /* For line starting with 'user' returns 1, 'topic' returns 2, otherwise 0 */
    parseLineType(line) {
        let firstWord = line.split(" ")[0];
        if (typeof (lineTypes[firstWord]) !== "undefined") {
            return lineTypes[firstWord];
        }
    }

    sanitize(input) {
        let no_spaces = input.replace(/\s/g, "");
        let no_newlines = no_spaces.replace(/\n/g, "");
        return no_newlines;
    }

    addTopic(user, mode, topic) {

        console.log("[acl] addTopic", user, mode, topic);

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
            //console.log("[ACL] user topic", xtopic);
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
            //console.log("[ACL] user topic", xtopic);
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
        if (this.use_plugin) {
            this.commit_redis(callback);
        } else {
            this.commit_file(callback);
        }
    }

    commit_file(callback) {

        console.log("Committing ACL changes...");

        // Create and/or overwrite existing ACLs
        fs.writeFileSync(this.path, "");

        //console.log("[ACL] Will export ACLs to", this.path);

        var stream = fs.createWriteStream(this.path, { flags: 'a' });

        for (var user_id in this.users) {
            let user = this.users[user_id];
            if (user.length > 0 && user !== null) {
                let user_line = "user " + user_id + "\n";
                stream.write(user_line);
                for (var index in user) {
                    let top = user[index];
                    if (top !== null) {
                        let topic_line = "topic " + user[index] + "\n";
                        stream.write(topic_line);
                    }
                }
                stream.write("\n");
            } else {
                // console.log("Empty user", user);
            }
        }

        stream.end();

        //console.log("[ACL] Saved ACL file:");
        //this.debugPrintACLs();

        // Restarts any mosquitto running in same environment with THiNX, backwards compatibility for non-dockerized runs.
        this.forceReload();

        if (typeof (callback) !== "undefined") callback();
    }

    commit_redis(callback) {

        // "username:sacls", "username:racls", "username:wacls" and "username:rwacls"
        if (this.current_user == null) {
            console.log("Current user shouldn't be null on commit.");
            return;
        }

        // walk through user

        let user = this.users[this.current_user];

        if (user.length > 0 && user !== null) {
            
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
                    console.log(error, reply);
                });
                // Auto-add subscribe ACLS
                this.client.sadd(this.current_user + ":sacls", racls, (error, reply) => {
                    console.log(error, reply);
                });
            }

            if (wacls.length > 0 ) {
                this.client.sadd(this.current_user + ":wacls", wacls, (error, reply) => {
                    console.log(error, reply);
                });
            }

            if (rwacls.length > 0) {
                // Add read/write ACLS
                this.client.sadd(this.current_user + ":rwacls", rwacls, (error, reply) => {
                    console.log(error, reply);
                });
                // Auto-add subscribe ACLS
                this.client.sadd(this.current_user + ":sacls", rwacls, (error, reply) => {
                    console.log(error, reply);
                });
            }

        } else {
            console.log("Empty user", user);
        }

        if (typeof (callback) !== "undefined") callback();
    }

    debugPrintACLs() {
        console.log("[ACL]", JSON.stringify(this.users, null, 2));
    }

    forceReload() {
        // MQTT reload happens boath after ACL record creation and password creation.
        // Therefore it should be sufficient only once.
        // Also, this operation is now used only in non-dockerized runs, deprecated.
        var GETPID = "ps -ax | grep 'mosquitto -d' | grep -v 'grep' | awk '{print $1}'";
        var result = exec.execSync(GETPID);
        if (result !== null) {
            var process_id = result.toString();
            if (parseInt(GETPID).toString() !== "NaN") {
                console.log("MQTT has process ID " + process_id);
                var RELOADMQTT = "kill -HUP " + parseInt(GETPID).toString();
                console.log(RELOADMQTT);
                result = exec.execSync(RELOADMQTT);
                console.log("Kill MQTT result: " + result);
            }
        }
    }
};