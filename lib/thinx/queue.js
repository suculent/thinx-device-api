// Build Queue Manager

const Globals = require("./globals");
const Notifier = require("./notifier");
const Action = require("./queue_action");

const schedule = require('node-schedule');
const io = require('socket.io-client');

const express = require("express");
let app = express(); // may be replaced by application's main Express instance, this is for stand-alone testing only
app.disable('x-powered-by');
const helmet = require("helmet");
app.use(helmet.frameguard());
module.exports = class Queue {

    checkSocketIoConnect(url, timeout) {
        return new Promise(function (resolve, reject) {
            timeout = timeout || 5000;
            let socket = io(url, { reconnection: false, timeout: timeout });
            let timer;
            let errAlready = false;

            // common error handler
            function error(data) {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (!errAlready) {
                    errAlready = true;
                    reject(data);
                    socket.disconnect();
                }
            }

            // set our own timeout in case the socket ends some other way than what we are listening for
            timer = setTimeout(function () {
                timer = null;
                error("local timeout");
            }, timeout);

            // success
            socket.on("connect", function () {
                clearTimeout(timer);
                resolve();
                socket.close();
            });

            // errors
            socket.on("connect_error", error);
            socket.on("connect_timeout", error);
            socket.on("error", error);
            socket.on("disconnect", error);

        });
    }


    constructor(redis, builder, di_app, ssl_options, opt_thx) {

        if (typeof (redis) === "undefined") throw new Error("Queue now requires connected Redis.");

        this.thx = opt_thx;

        this.port = 4000;

        if (typeof (Globals.app_config().builder) !== "undefined") {
            this.maxRunningBuilds = Globals.app_config().builder.concurrency;
        } else {
            console.log("⚠️ [warning] builder.concurrency integer not set in config.json, falling back to default 1 (disabled)");
            this.maxRunningBuilds = 1;
        }

        this.redis = redis;
        this.notifier = new Notifier();

        if ((typeof (di_app) !== "undefined") && (di_app !== null)) app = di_app;

        if (builder !== null) {

            this.builder = builder;

            try {

                // HTTP Fallback is for testing only
                if ((typeof (ssl_options) !== "undefined") && (ssl_options !== null)) {
                    this.https = require('https').Server(ssl_options, di_app);
                } else {
                    this.https = require('http').Server(di_app);
                }

                this.initloop(this.https, this.port, true);
                this.io = require('socket.io')(this.https,
                    {
                        //transports: ['websocket'],
                        //allowUpgrades: false,
                        pingTimeout: 300000
                    }
                );
                this.setupIo(this.io);
                this.builder.io = this.io;

            } catch (e) {
                console.log("[queue] server init failed, eating exception, this Queue is initialized WITHOUT listener...");
            }

        } else {
            console.log("☣️ [error] No builder defined for queue, not setting up IO!");
        }

        this.workers = [];
    }

    initloop(server, port, firstRun) {

        // if (server.isRunning) return;

        let sock_url = "http://localhost:" + port;

        console.log(`ℹ️ [warning] [queue] checking socket port availability at ${sock_url} seems to destroy existing test socket`);

        this.checkSocketIoConnect(sock_url).then(function () {
            console.log(`ℹ️ [info] BuildServer Manager already listening on port ${port}`);
        }, function (reason) {
            if (reason.toString().indexOf("Error: xhr poll error") === -1) {
                console.log(`[error] [queue] initloop unexpected reason: ${reason}`);
                return;
            }
            try {
                server.listen(port, function () {
                    console.log(`ℹ️ [info] BuildServer Manager listening on port ${port}`);
                });
            } catch (e) {
                if (firstRun) {
                    port += 1;
                    console.log(`ℹ️ [info] BuildServer Manager restarting on port ${port}`);
                    this.initloop(server, port, false);
                }
            }
        });
    }


    getWorkers() {
        return this.workers || [];
    }

    cron() {
        let cron_rule = "*/5 * * * *";
        this.schedule = schedule.scheduleJob(cron_rule, () => {
            this.loop();
        });
    }

    add(udid, source, owner_id, opt_callback) {
        let action = new Action(udid, this.redis);
        action.queueWithSource(source, owner_id, opt_callback);
    }

    pruneIfCompleted(action) {
        if ((action.status == "success") || (action.status == "error")) {
            console.log("ℹ️ [info] Pruning completed build action...");
            action.delete();
            return true;
        }
        return false;
    }

    // TODO: FIXME: This is ugly and wrong and needs refactoring. There cannot be external variable "limit"
    // to the async callback that controlls it... the callback should just report true and action (is running, is waiting)
    // the limit must be held for actions that are waiting only so this could be filtered first
    // there is a side effect of pruning...
    async findNext() {
        let action_keys = await this.redis.v4.keys("queue:*");
        if ((typeof(action_keys) === "undefined") || (action_keys === null)) {
            return Promise.resolve(false);
        }

        //console.log("[DEBUG] findNext action_keys:", action_keys);
        
        let limit = Math.abs(this.maxRunningBuilds); // abs to force copy

        for (let i = 0, len = action_keys.length; i < len; i++) {

            if (limit < 1) continue;
            let action_key = action_keys[i];
            let uaid = action_key.replace("queue:", "");

            let contents = await this.redis.v4.get(action_key);

            let action = new Action(uaid, this.redis).withString(contents);

            // Prune completed actions instead of running...
            this.pruneIfCompleted(action);

            // Count-in running actions
            if (action && action.isRunning()) {
                limit--;
            }

            // Return next waiting action
            if (action.isWaiting() && (limit > 0)) {
                let a = action.action;
                console.log(`ℹ️ [info] Scheduling waiting build action ${a.build_id} with remaining concurrent job limit ${limit}`);
                limit--;
                return Promise.resolve(action);
            }
        }
        return Promise.resolve(false); // added to complete (in tests)
    }

    actionWorkerValid(action, worker) {
        let valid = true;
        if ((typeof (action) === "undefined") || (action === null) || (action === false)) {
            console.log("☣️ [error] actionWorkerValid called with empty action, skipping...");
            valid = false;
        }
        if ((typeof (worker) === "undefined") || (worker === null) || (worker === false)) {
            if (action) {
                try {
                    console.log("☣️ [error] actionWorkerValid called with empty worker, skipping, will set error for action", action.action);
                    action.setError();
                } catch (e) {
                    console.log("☣️ [error] actionWorkerValid exception", e);
                }
            }
            valid = false;
        }
        return valid;
    }

    runNext(action, worker) {

        if (!this.actionWorkerValid(action, worker)) {
            console.log(`☣️ [error] runNext failed, skipping ${action}...`);
            return;
        }

        // Scheduler runs actions one after each (FIFO), about once a minute.
        console.log("ℹ️ [info] runNext:", JSON.stringify(action));

        if (typeof (action.setStarted) === "function") {
            action.setStarted();
        } else {
            console.log("☣️ [error] Edge case: action has no functions!" + JSON.stringify(action));
            return;
        }

        let source_id = action.action.source;

        const build = {
            udid: action.action.udid,
            source_id: source_id,
            dryrun: false
        };

        if ((typeof(worker) !== "undefined") && (worker !== null) && (worker !== false)) worker.running = true;

        this.builder.build(
            action.action.owner_id,
            build,
            [], // notifiers
            (success, message) => {
                console.log("ℹ️ [info] 1 - Build exit state", success, message);
                console.log("ℹ️ [info] 2 - Deleting action after build request completed, set worker to not running...");
                action.delete();
                if ((typeof(worker) !== "undefined") && (worker !== null) && (worker !== false)) {
                    worker.running = false;
                }
            }, // callback
            worker // worker
        );
    }

    // should be called using scheduler; can be async! and findNext too!
    async loop() {
        // check events in queue and schedule one if eligible
        let next = await this.findNext();
        if (next) {
            let workerAvailable = this.nextAvailableWorker();
            if (workerAvailable !== null) {
                this.runNext(next, workerAvailable);
            }
        }
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
                console.log("ℹ️ [info] Queue found available worker", index);
                return this.workers[index];
            }
        }
        return false;
    }

    // Internals

    parseSocketMessage(socket, msg) {
        // STATUS
        if (typeof (msg.status) === "undefined") return;

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
            console.log(`ℹ️ [info] Worker connected: ${socket.id}`);
            that.workers[socket.id].connected = true;
            //
            if (typeof (this.thx) !== "undefined") this.thx.emit("workerReady");
        });

        socket.on('disconnect', () => {
            console.log(`ℹ️ [info] [queue] Unregistering disconnected worker ${socket.id}.`);
            if (typeof (socket.id) !== "undefined") {
                delete that.workers[socket.id];
            } else {
                console.log("Socket ID undefined on disconnect.");
            }
        });

        // either by directly modifying the `auth` attribute
        socket.on("connect_error", () => {
            if ((typeof (process.env.WORKER_SECRET) !== "undefined")) {
                socket.auth.token = process.env.WORKER_SECRET;
                console.log("connect_error attempt to resolve using WORKER_SECRET");
                socket.connect();
            }
            console.log("onerror workers", that.workers);
        });

        // Business Logic events

        socket.on('register', (msg) => {
            if (typeof (that.workers[socket.id]) === "undefined") {
                that.workers[socket.id] = {
                    connected: true,
                    socket: socket,
                    running: false
                };
            }
            this.parseSocketMessage(socket, msg);

            console.log("ℹ️ [info] Currently registered workers", Object.keys(that.workers));
        });

        socket.on('poll', async (msg) => {
            console.log("ℹ️ [info] Worker is polling...", msg);
            let next = await this.findNext();
            if (next) this.runNext(next, socket.id);
        });

        socket.on('job-status', (job_status) => {
            this.notifier.process(job_status, (result) => {
                console.log("ℹ️ [info] [queue] Notifier's Processing result:", result);
            });
            if ((typeof (this.workers[socket.id]) !== "undefined") && (this.workers[socket.id] !== null)) {
                this.workers[socket.id].running = false;
            }
        });
    }

    setupIo(dio) {
        dio.on('connection', (socket) => {
            this.setupSocket(socket);
        });
    }

};
