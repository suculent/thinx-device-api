if (typeof(process.env.SQREEN_TOKEN) !== "undefined") {
    require('sqreen');
}

if (typeof(process.env.ROLLBAR_TOKEN) !== "undefined") {
    var Rollbar = require('rollbar');
    new Rollbar({
        accessToken: process.env.ROLLBAR_TOKEN,
        handleUncaughtExceptions: true,
        handleUnhandledRejections: true
    });
}

const exec = require("child_process");
const chalk = require('chalk');
//const error = chalk.bold.red;
//const warning = chalk.keyword('orange');
//console.log(error('Error!'));
//console.log(warning('Warning!'));
const version = require('./package.json').version;
const schedule = require('node-schedule');
const io = require('socket.io-client');

const fs = require("fs-extra");

class Worker {

    constructor(build_server) {
        this.client_id = null;
        this.is_running = false;
        this.socket = io(build_server);
        console.log(new Date().getTime(), chalk.bold.red("» ") + chalk(`{red  \\} {white.bold THiNX Cloud Build Worker ${version} rev. ${process.env.REVISION}} {red \\}`));
        this.setupSocket(this.socket);
        this.setupScheduler();
        this.socket_id = null;
        this.running = false;
    }

    //
    // Main Logic
    //

    failJob(sock, job, details) {
        sock.emit('job-status', {
            build_id: job.build_id,
            status: "Failed",
            details: details
        });
        this.is_running = false;
    }

    runJob(sock, job) {

        if (typeof(job.cmd) === "undefined") {
            this.failJob(sock, job, "Missing command");
            return;
        }

        if (typeof(job.build_id) === "undefined") {
            this.failJob(sock, job, "Missing build_id");
            return;
        }

        if (typeof(job.udid) === "undefined") {
            this.failJob(sock, job, "Missing udid");
            return;
        }

        if (typeof(job.path) === "undefined") {
            this.failJob(sock, job, "Missing path for device");
            return;
        }

        if (typeof(process.env.WORKER_SECRET) !== "undefined") {
            if (typeof(job.secret) === "undefined") {
                this.failJob(sock, job, "Missing job secret");
                return;
            } else {
                if (job.secret.indexOf(process.env.WORKER_SECRET) !== 0) {
                    this.failJob(sock, job, "Invalid job authentication");
                    return;
                } else {
                    console.log("[OID:" + job.owner_id + "] Job authenticateion successful.");
                }
            }
        }

        this.runShell(job.cmd, job.owner_id, job.build_id, job.udid, job.path, sock);
    }

    runShell(CMD, owner, build_id, udid, path, socket) {

		var shell = exec.spawn(CMD, { shell: true });

		console.log("[OID:" + owner + "] [BUILD_STARTED] EXEC from " + __dirname);

		shell.stdout.on("data", (data) => {
			var string = data.toString();
			var logline = string;
			if (logline.substr(logline.count - 3, 1) === "\n\n") {
				logline = string.substr(0, string.count - 2); // cut trailing newline
			}

			if (logline !== "\n") {

                //logline = logline.replace(/\r/g, '').replace(/\n/g, '');

				console.log("[" + build_id + "] »» " + logline);

				// just a hack while shell.exit does not work or fails with another error
				if (logline.indexOf("STATUS OK") !== -1) {
                    socket.emit('job-status', {
                        udid: udid,
                        state: "Success",
                        completed: true,
                        build_id: build_id, 
                        owner: owner,
                    });
				}
			}

			// Something must write to build_path/build.log where the file is tailed from to websocket...
			//var path = blog.pathForDevice(owner, udid);
			var build_log_path = path + "/" + build_id + "/build.log";
			fs.ensureFile(build_log_path, function (err) {
                if (err) {
                    console.log(chalk.red("Log file could not be created."));
                } else {
                    fs.appendFileSync(build_log_path, logline);
                }				
			});

			socket.emit('log', logline);

		}); // end shell on out data

		shell.stderr.on("data", (data) => {
			var dstring = data.toString();
			console.log("[STDERR] " + data);
			if (dstring.indexOf("fatal:") !== -1) {
                socket.emit('job-status', {
                    udid: udid,
                    build_id: build_id, 
                    state: "Failed"
                });
			}
		}); // end shell on error data

		shell.on("exit", (code) => {
            console.log("[OID:" + owner + "] [BUILD_COMPLETED] [builder] with code " + code);
            this.is_running = false;
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Setting running to false, job done..."));

            let state = "Failed";
			if (code === 0) {
                state = "Success";
            }
            
            socket.emit('job-status', {
                udid: udid,
                build_id: build_id, 
                state: state
            });
		}); // end shell on exit
	}

    setupSocket(socket) {
        
        // Connectivity Events

        socket.on('connect', () => { 
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Worker socket connected, registering..."));
            socket.emit('register', { status: "Hello from BuildWorker.", id: this.socket_id, running: this.running }); // refactor, post status as well (running, id...)
        });

        socket.on('disconnect', () => { 
            console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.bold.white("Worker socket disconnected."));
        });

        // either by directly modifying the `auth` attribute
        socket.on("connect_error", () => {
            if ((typeof(process.env.WORKER_SECRET) !== "undefined")) {
                socket.auth.token = process.env.WORKER_SECRET;
                console.log("connect_error attempt to resolve using WORKER_SECRET");
                socket.connect();
            }
        });

        // Business Logic Events

        socket.on('client id', (data) => { 
            if (this.client_id === null) {
                console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`We've got assigned initial client id: ${data}`));
            } else {
                console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white(`We've got re-assigned a new client id: ${data}`));
            }

            this.client_id = data;
        });

        socket.on('job', (data) => { 
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`Incoming job:`), data);
            if (typeof(data.mock) !== "undefined" && data.mock === true) {
                this.client_id = data;
                console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Setting running to true..."));
                console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.bold.white("Processing incoming job..."));
                this.is_running = true;
                this.runJob(socket, data); // sync?
                console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Setting running to false..."));
            }
        });
    }

    setupScheduler() {
        var cron_rule = "*/5 * * * *";
        schedule.scheduleJob(cron_rule, () => {
            this.loop();
        });
        console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Polling loop (5 minutes) scheduled."));
    }

    loop() {
        if (!this.is_running) {
            this.socket.emit('poll', 'true');
        } else {
            console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("Skipping poll cron (job still running and did not timed out)."));
        }
    }
}

if (typeof(process.env.THINX_SERVER) !== "undefined") {
    let srv = process.env.THINX_SERVER;
    // fix missing http if defined in env file just like api:3000
    if (srv.indexOf("http") == -1) {
        srv = "http://" + srv;
    }
    console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("Starting build worker against"), srv);
    new Worker(srv);
} else {
    new Worker('http://localhost:3000'); // developer only, no authentication required
    console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("Starting build worker without configuration."));
}

