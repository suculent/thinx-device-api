// Build Queue Manager

var Globals = require("./globals.js");
var redis = require("redis");
var Builder = require("./builder");
var Action = require("./queue_action");

var schedule = require('node-schedule');

// WebSocket Build Server Extension
const chalk = require('chalk');
const app = require('express')();
const port = process.env.PORT || 3000;
// <--

module.exports = class Queue {

    constructor(builder) {
        if (typeof(Globals.app_config.builder) !== "undefined") {
            this.maxRunningBuilds = Globals.app_config.builder.concurrency;
        } else {
            this.maxRunningBuilds = 1;
        }
        this.client = redis.createClient(Globals.redis_options());
        this.builder = builder;

        this.http = require('http').Server(app);
        this.http.listen(port, function () {
            console.log(chalk`
        {blue *************************************************}
        {blue *} {white.bold THiNX BuildServer Manager listening on *:${port} }{blue *}
        {blue *************************************************}
            `);
        });
        
        this.io = require('socket.io')(this.http);
        this.setupIo(this.io);
        this.workers = [];
    }

    cron() {
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
            // Debug section, remove later >>>
            if (error) {
                console.log(error);
            }
            if ((typeof(action_keys) !== "undefined") && (action_keys.length > 0)) {
                console.log("action_keys", action_keys); // data leak to log, remove or limit...
            }
            // <<< Debug section, remove later
            if (error) return false;
            let limit = this.maxRunningBuilds;
            for (var i = 0, len = action_keys.length; i < len; i++) {
                if (limit < 1) continue;
                let action_key = action_keys[i];
                let udid = action_key.replace("queue:", "");
                this.client.get(action_key, (job_error, contents) => {
                    if (job_error) {
                        console.log(job_error);
                        return;
                    }
                    let action = new Action(udid).withString(contents);
                    // Count-in running actions
                    if (action && action.isRunning()) {
                        limit--;
                    }
                    // Return next running action
                    if (action.isWaiting()) {
                        if (limit > 0) {
                            let a = action.action;
                            console.log("Scheduling build action", limit, {a});
                            callback(action);
                            limit--;
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
        this.builder.build(action.action.owner_id, build, [], this.nextAvailableWorker(), function (success, message, build_id) {
            action.delete();
            console.log("Queued build_id: ", build_id, "completed with success", success, "message", message);
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

    //

    //
	// WebSocket Build Server Extension
	//

	// Interface to Builder

	nextAvailableWorker() {
		for (let index in this.workers) {
			if (this.workers[index] == true) {
				return index;
			}
		}
		return false;
	}

	// Internals

	parseSocketMessage(socket, msg) {

        // Assign client id to new workers...
        if (0 === msg.indexOf("Hello from BuildWorker")) {
            socket.emit('client id', socket.id);
        }
    }

    setupSocket(socket) {

        // General events

        socket.on('connect', () => {
            console.log(new Date().getTime(), chalk.bold.green(`»`), chalk.white(`Worker connected: ${socket.id}`));
            this.workers[socket.id] = true;
        });

        socket.on('disconnect', () => {
            console.log(new Date().getTime(), chalk.bold.red(`»`), chalk.white(`Worker disconnected: ${socket.id}`));
            if (typeof(socket.id) !== "undefined") {
                this.workers[socket.id] = false;
            } else {
                console.log("Socket ID undefined on disconnect.");
            }
        });

        // either by directly modifying the `auth` attribute
        socket.on("connect_error", () => {
            if ((typeof(process.env.WORKER_SECRET) !== "undefined")) {
                socket.auth.token = process.env.WORKER_SECRET;
                console.log("connect_error attempt to resolve using WORKER_SECRET");
                socket.connect();
            }
        });

        // Business Logic events

        socket.on('register', (msg) => {
            this.io.emit('chat message', "Registration: "+msg);
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`Worker registered: ${socket.id}`));
            this.parseSocketMessage(socket, msg);
        });

        socket.on('poll', (msg) => {
            this.io.emit('job', {
                mock: true,
                build_id: 1,
                owner_id: "m0ck3r1z3r",
                cmd: "echo hele-vole-ryby",
                udid: "air-force-one",
                //path: "/mnt/data/thinx/eu/repos/owner/udid/build_id/"
				path: "/tmp/thinx-test/",
				secret: process.env.WORKER_SECRET || null
            });
            console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("Responding to job request with empty mock (TODO: respond with no-job or real data)."));
        });

        socket.on('job-status', function (msg) {
            console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("Incoming job status:"), msg);
        });

        socket.on('log', function (msg) {
            console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("LOG: "), msg);
            // TODO: forward log to web UI, no need to process.
        });
    }

    setupIo(io) {
        io.on('connection', (socket) => {
            this.setupSocket(socket);
        });
    }

};