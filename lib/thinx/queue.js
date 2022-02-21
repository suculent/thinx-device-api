// Build Queue Manager

var Globals = require("./globals.js");
var redis = require("redis");
var Notifier = require("./notifier");
var Action = require("./queue_action");

var schedule = require('node-schedule');

// WebSocket Build Server Extension
const app = require('express')();
var port = process.env.PORT || 3000;
module.exports = class Queue {

    constructor(builder) {
        
        if (typeof(Globals.app_config().builder) !== "undefined") {
            this.maxRunningBuilds = Globals.app_config().builder.concurrency;
        } else {
            console.log("[warning] builder.concurrency integer not set in config.json, falling back to default 1 (disabled)");
            this.maxRunningBuilds = 1;
        }
        
        this.client = redis.createClient(Globals.redis_options());
        this.notifier = new Notifier();

        if (builder !== null) {
            this.builder = builder;
            // TODO: Make this a HTTPS server, use existing certificate to secure the socket.
            this.http = require('http').Server(app); 
            this.http.listen(port, function () {
                console.log(`[info] BuildServer Manager listening on port ${port}`);
            });
            this.io = require('socket.io')(this.http,
                {
                    //transports: ['websocket'],
                    //allowUpgrades: false,
                    pingTimeout: 300000
                }
            );
            this.setupIo(this.io);
            this.builder['io'] = this.io;
        } else {
            console.log("[error] No builder defined for queue, not setting up IO!");
        }
        
        this.workers = [];

        console.log("[info] Loaded module: Queue");
    }

    cron() {
        var cron_rule = "*/5 * * * *";
        this.schedule = schedule.scheduleJob(cron_rule, () => {
            this.loop();
        });
    }

    add(udid, source, owner_id) {
        let action = new Action(udid);
        action.queueWithSource(source, owner_id);
    }

    pruneIfCompleted(action) {
        if ((action.status == "success") || (action.status == "error")) {
            console.log("[info] Pruning completed build action...");
            action.delete();
            return true;
        }
        return false;
    }

    findNext(callback) {
        // TODO: Refactor to a promise(s) – 2x
        this.client.keys("queue:*", (error, action_keys) => {
            if (error) {
                callback(false, error);
                return;
            }
            let limit = Math.abs(this.maxRunningBuilds); // abs to force copy
            for (var i = 0, len = action_keys.length; i < len; i++) {
                if (limit < 1) continue;
                let action_key = action_keys[i];
                let uaid = action_key.replace("queue:", "");
                this.client.get(action_key, (job_error, contents) => {
                    if (job_error) {
                        console.log(`[error] findNext job error ${job_error}`);
                    }
                    let action = new Action(uaid).withString(contents);
                    
                    // Count-in running actions
                    if (action && action.isRunning()) {
                        limit--;
                    }
                    // Return next running action
                    if (action.isWaiting() && (limit > 0)) {
                        let a = action.action;
                        console.log(`[info] Scheduling build action ${a.build_id} with remaining concurrent job limit ${limit}`);
                        limit--;
                        callback(action);
                    }
                    // Prune completed actions
                    this.pruneIfCompleted(action);
                });
            }
            callback(null); // added to complete (in tests)
        });
    }

    runNext(action, worker) {

        if ((typeof(worker) === "undefined") || (worker === null) || (worker === false)) {
            console.log("[warning] runNext called with empty worker, skipping...");
            return false;
        }

        if ((typeof(action) === "undefined") || (action === null) || (action === false)) {
            console.log("[warning] runNext called with empty action, skipping...");
            return false;
        }

        // Scheduler runs actions one after each (FIFO), about once a minute.
        console.log("runNext:", action.toString());

        if (typeof(action.setStarted) === "function") {
            action.setStarted();
        } else {
            throw new Error("[error] Edge case: action has no functions:" + JSON.stringify(action));
        }

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
            (success, message) => {
                console.log("[info] 1 - Build exit state", success, message);
                console.log("[info] 2 - Deleting action after build request completed, set worker to not running...");
                action.delete();
                if (worker !== null) {
                    worker.running = false;
                }
            }, // callback
            worker // worker
        );
    }

    // should be called using scheduler
    loop() {
        // check events in queue and schedule one if eligible
        this.findNext((next) => {
            if (next !== null) {
                let workerAvailable = this.nextAvailableWorker();
                if (workerAvailable !== null) {
                    this.runNext(next, workerAvailable);
                }
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
                console.log("[info] Queue found available worker", index);
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
            console.log(`[info] Worker connected: ${socket.id}`);
            that.workers[socket.id].connected = true;
        });

        socket.on('disconnect', () => {
            console.log(`[info] Unregistering disconnected worker ${socket.id}.`);
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
            
            console.log("[info] Currently registered workers", Object.keys(that.workers));
        });

        socket.on('poll', (msg) => {
            console.log("[info] Worker is polling...", msg);
            this.findNext((next) => {
                if (next !== null) {
                    this.runNext(next, socket.id);
                }
            });
        });

        socket.on('job-status', (job_status) => {
            this.notifier.process(job_status, (result) => {
                console.log("[info] Notifier's Processing result:", result);
            });
            if ((typeof(this.workers[socket.id]) !== "undefined") && (this.workers[socket.id] !== null)) {
                this.workers[socket.id].running = false;
            }
        });
    }

    setupIo(io) {
        io.on('connection', (socket) => {
            this.setupSocket(socket);
        });
    }

};