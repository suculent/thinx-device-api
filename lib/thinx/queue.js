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
        this.notifier = new Notifier();

        if (builder !== null) {
            this.builder = builder;
            this.http = require('http').Server(app);
            this.http.listen(port, function () {
                console.log(`» THiNX BuildServer Manager listening on *:${port}`);
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
        this.builder.build(
            action.action.owner_id,
            build,
            [], // notifiers
            function (success, message, build_id) {
                action.delete();
                console.log("Queued build_id: ", build_id, "completed with success", success, "message", message);
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
            console.log("Searching for free worker in", index, ":", this.workers[index]);
			if (this.workers[index].connected === true) {
				return this.workers[index];
			}
		}
		return false;
	}

	// Internals

	parseSocketMessage(socket, msg) {
        // STATUS
        if (typeof(msg.status) !== "undefined") {
            // Assign client id to new workers...
            if (0 === msg.status.indexOf("Hello")) {
                socket.emit('client id', socket.id); // important, assigns socket ID to worker
                let old_id = msg.id || null;
                let running = msg.running || false;
                // tracking
                this.workers[socket.id] = {
                    old_id: old_id,
                    running: running,
                    connected: true,
                    socket: socket
                };
            }
        }
    }

    setupSocket(socket) {

        let that = this;

        socket.on('connect', () => {
            console.log(new Date().getTime(), chalk.bold.green(`»`), chalk.white(`Worker connected: ${socket.id}`));
            that.workers[socket.id].connected = true;
        });

        socket.on('disconnect', () => {
            console.log(new Date().getTime(), chalk.bold.red(`»`), chalk.white(`Worker ${socket.id} disconnected from this Queue.`));
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
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`Registering new worker: ${socket.id}`));
            if (typeof(that.workers[socket.id]) === "undefined") {
                that.workers[socket.id] = {
                    connected: true,
                    socket: socket
                };
            }
            this.parseSocketMessage(socket, msg);
            //let workers = that.workers;
            //console.log("Currently registered workers", workers);
        });

        socket.on('poll', (msg) => {
            this.findNext((next) => {
                if (next) {
                    this.runNext(next, socket.id);
                } else {
                    this.io.emit('job', {
                        mock: true,
                        build_id: "3929c3f0-452f-11eb-bc94-dd1fab39660c",
                        owner: "baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78",
                        cmd: "./builder --owner=baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78 --udid=b4c48370-d729-11ea-9b7c-b1d713ada127 --fcid=1840EF --mac=6D437E --git=git@github.com:keyguru/keyguru-firmware-yuki.git --branch=develop --id=3929c3f0-452f-11eb-bc94-dd1fab39660c --workdir=/mnt/data/repos/baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78/b4c48370-d729-11ea-9b7c-b1d713ada127/3929c3f0-452f-11eb-bc94-dd1fab39660c/keyguru-firmware-yuki --env=[]",
                        udid: "b4c48370-d729-11ea-9b7c-b1d713ada127",
                        //path: "/mnt/data/thinx/eu/repos/owner/udid/build_id/"
                        path: "/mnt/data/repos/baecb3124695efa1672b7e8d62e5b89e44713968f45eae6faa52066e87795a78/b4c48370-d729-11ea-9b7c-b1d713ada127/3929c3f0-452f-11eb-bc94-dd1fab39660c/keyguru-firmware-yuki",
                        secret: process.env.WORKER_SECRET || null
                    });
                    console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("Responding to job request with empty mock (TODO: respond with no-job or real data)."));
                }
            });
        });

        socket.on('job-status', (job_status) => {
            console.log("[queue.js] » Incoming job status:", job_status);
            if (job_status.status == "OK") {
                this.notifier.process(job_status);
            }
        });

        socket.on('log', (msg) => {
            // console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("LOG: "), msg);
            // TODO: forward log to web UI, no need to process; maybe not needed as this is taken from a file anyway... this is useless stream
        });
    }

    setupIo(io) {
        io.on('connection', (socket) => {
            this.setupSocket(socket);
        });
    }

};