// Build Queue Manager

var Globals = require("./globals.js");
var redis = require("redis");
var Notifier = require("./notifier");
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
        try {
            this.client.bgsave();
        } catch (e) {}

        this.notifier = new Notifier();

        if (builder !== null) {
            this.builder = builder;
            this.http = require('http').Server(app);
            this.http.listen(port, function () {
                console.log(`» THiNX BuildServer Manager listening on port ${port}`);
            });
            this.io = require('socket.io')(this.http,
                {
                    //transports: ['websocket'],
                    //allowUpgrades: false,
                    pingTimeout: 300000
                }
            );
            this.setupIo(this.io);
            builder.setIo(this.io);
        } else {
            console.log("No builder defined for queue, not setting up IO!");
        }
        
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

    runNext(action, worker) {

        // 2. Scheduler bude akce spouštět – jeden build po druhém postupně (FIFO), asi jednou za minutu a případně hned na webhook provést kontrolu synchronně, aby se hned spustila první.
        console.log("runNext:", action.toString());
        action.setStarted();
        var build = {
            udid: action.action.udid,
            source_id: action.action.source,
            dryrun: false
        };
        worker.running = true;
        this.builder.build(
            action.action.owner_id,
            build,
            [], // notifiers
            function (success, message) {
                action.delete();
                worker.running = false;
            }, // callback
            worker // worker
        );
    }

    // should be called using scheduler
    loop() {
        // check events in queue and schedule one if eligible
        this.findNext((next) => {
            if (next) {
                this.runNext(next, this.nextAvailableWorker());
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
            if (
                (this.workers[index].connected === true) &&
                (this.workers[index].running === false) 
            ) {
                console.log("[QUEUE] Assigning worker", index);
				return this.workers[index];
			}
		}
		return false;
	}

	// Internals

	parseSocketMessage(socket, msg) {
        // STATUS
        if (typeof(msg.status) === "undefined") return;
        
        // Assign client id to new workers...
        if (0 === msg.status.indexOf("Hello")) {
            socket.emit('client id', socket.id); // important, assigns socket ID to worker
            let previous_id = msg.id || null;
            let running = msg.running || false;
            // tracking
            this.workers[socket.id] = {
                previous_id: previous_id,
                running: running,
                connected: true,
                socket: socket
            };
        }
    }

    setupSocket(socket) {

        let that = this;

        socket.on('connect', () => {
            console.log(`»» Worker connected: ${socket.id}`);
            that.workers[socket.id].connected = true;
        });

        socket.on('disconnect', () => {
            console.log(`»» Unregistering disconnected worker ${socket.id}.`);
            if (typeof(socket.id) !== "undefined") {
                delete that.workers[socket.id];
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
            console.log("onerror workers", that.workers);
        });

        // Business Logic events

        socket.on('register', (msg) => {
            if (typeof(that.workers[socket.id]) === "undefined") {
                that.workers[socket.id] = {
                    connected: true,
                    socket: socket,
                    running: false
                };
            }
            this.parseSocketMessage(socket, msg);
            
            console.log("»» Currently registered workers", Object.keys(that.workers));
        });

        socket.on('poll', (msg) => {
            console.log("Worker is polling...", msg);
            this.findNext((next) => {
                if (next) {
                    this.runNext(next, socket.id);
                }
            });
        });

        socket.on('job-status', (job_status) => {
            this.notifier.process(job_status, (result) => {
                console.log("Notifier's Processing result:", result);
            });
            if (typeof(this.workers[socket.id]) !== "undefined") {
                this.workers[socket.id].running = false;
            }
        });

        socket.on('log', (msg) => {
            // console.log("» WORKER LOG", msg);
            // TODO: forward log to web UI, no need to process; maybe not needed as this is taken from a file anyway... this is useless stream
        });
    }

    setupIo(io) {
        io.on('connection', (socket) => {
            this.setupSocket(socket);
        });
    }

};