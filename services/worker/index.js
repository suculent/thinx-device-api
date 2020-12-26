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
const version = require('./package.json').version;
const schedule = require('node-schedule');
const io = require('socket.io-client');

const fs = require("fs-extra");

class Worker {

    constructor(build_server) {
        this.client_id = null;
        this.is_running = false;
        this.socket = io(build_server);
        console.log(new Date().getTime(), `» -= THiNX Cloud Build Worker ${version} rev. ${process.env.REVISION} =-`);
        this.setupSocket(this.socket);
        // this.setupScheduler();
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

    validateJob(sock, job) {

        if (typeof(job.cmd) === "undefined") {
            this.failJob(sock, job, "Missing command");
            return false;
        }

        let command = job.cmd;
        if (command.indexOf(";") !== -1) {
            console.log(new Date().getTime(), "Remote command contains unexpected character `;`; this security incident should be reported.");
            return false;
        }
        if (command.indexOf("&") !== -1) {
            console.log(new Date().getTime(), "Remote command contains unexpected character `&`; this security incident should be reported.");
            return false;
        }

        if (typeof(job.build_id) === "undefined") {
            this.failJob(sock, job, "Missing build_id");
            return false;
        }

        if (typeof(job.udid) === "undefined") {
            this.failJob(sock, job, "Missing udid");
            return false;
        }

        if (typeof(process.env.WORKER_SECRET) !== "undefined") {
            if (typeof(job.secret) === "undefined") {
                this.failJob(sock, job, "Missing job secret");
                return false;
            } else {
                if (job.secret === null) {
                    console.log("Warning, JOB SECRET NULL! This will be error soon.", job);
                    return false;
                } else {
                    if (job.secret.indexOf(process.env.WORKER_SECRET) !== 0) {
                        this.failJob(sock, job, "Invalid job authentication");
                        return false;
                    } else {
                        console.log("[OID:" + job.owner + "] Job authenticateion successful.");
                    }
                }
            }
        }

        return true;
    }

    runJob(sock, job) {
        if (this.validateJob(sock, job)) {
            this.runShell(job.cmd, job.owner, job.build_id, job.udid, job.path, sock);
        } else {
            console.log(new Date().getTime(), "« Job validation failed on this worker. Developer error, or attack attempt. No shell will be run.");
        }
    }

    runShell(CMD, owner, build_id, udid, path, socket) {

        CMD.replace("./builder", "/opt/thinx/thinx-device-api/builder"); // WTF?

        console.log("[OID:" + owner + "] [BUILD_STARTED] Worker started...");
        
        let shell = exec.spawn(CMD, { shell: true });

        let build_start = new Date().getTime();

		shell.stdout.on("data", (data) => {
			var string = data.toString();
            var logline = string;
            
            logline.replace(/\r/g, '');
			logline.replace(/\n/g, '');

			if (logline.substr(logline.count - 3, 1) === "\n\n") {
				logline = string.substr(0, string.count - 2); // cut trailing newline
			}

			if (logline !== "\n") {
                //console.log("W [" + build_id + "] »» " + logline);
                console.log(logline);
				// just a hack while shell.exit does not work or fails with another error
				if (logline.indexOf("JOB-RESULT") !== -1) {
                    
                    // parses "[86ad8d90-46e8-11eb-a48a-b59a7e739f77] »» JOB-RESULT:" {...
                    let start_pos = logline.indexOf("{");
                    let annotation_string = logline.substr(start_pos);

                    let status_object = {
                        udid: udid,
                        state: "Failed",
                        build_id: build_id, 
                        owner: owner
                    };

                    try {
                        let annotation_json = JSON.parse(annotation_string);
                        status_object = annotation_json;
                        
                    } catch (e) {
                        console.log("ERROR: Annotation status in \'", annotation_string, "\' not parsed.");
                    }

                    status_object.completed = true;
                    
                    socket.emit('job-status', status_object);
				}
            }

			// Something must write to build_path/build.log where the file is tailed from to websocket...
			var build_log_path = path + "/" + build_id + "/build.log";
			fs.ensureFile(build_log_path, function (err) {
                if (err) {
                    console.log(chalk.red("Log file could not be created."));
                } else {
                    fs.appendFileSync(build_log_path, logline);
                }				
            });

            //socket.emit('log', logline); currently not needed, logging is done through file appends (but this is certainly faster)
            
		}); // end shell on out data

		shell.stderr.on("data", (data) => {
			var dstring = data.toString();
			console.log("ERR [" + build_id + "] »» " + dstring);
			if (dstring.indexOf("fatal:") !== -1) {
                socket.emit('job-status', {
                    udid: udid,
                    build_id: build_id, 
                    state: "Failed",
                    reason: dstring
                });
			}
		}); // end shell on error data

		shell.on("exit", (code) => {
            console.log("[OID:" + owner + "] [BUILD_COMPLETED] with code " + code);
            this.is_running = false;
            
            // calculate build time
            let build_time = (new Date().getTime() - build_start)/1000; // to seconds
            if (build_time < 60) {
                console.log("BUILD TIME:", build_time, "seconds");
            } else {
                let minutes = Math.floor(build_time/60);
                let seconds = Math.floor(build_time % 60);
                console.log("BUILD TIME:", minutes, "minutes", seconds, "seconds");
            }
            

            let state = "Failed";
			if (code === 0) {
                state = "Success";
            }
            
            socket.emit('job-status', {
                udid: udid,
                build_id: build_id, 
                state: state,
                elapsed: build_time
            });
		}); // end shell on exit
	}

    setupSocket(socket) {
        
        // Connectivity Events

        socket.on('connect', () => { 
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Worker socket connected, sending registration..."));
            socket.emit('register', { status: "Hello from BuildWorker.", id: this.socket_id, running: this.running }); // refactor, post status as well (running, id...)
        });

        socket.on('disconnect', () => { 
            console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.bold.white("Worker socket disconnected."));
        });

        // either by directly modifying the `auth` attribute
        socket.on("connect_error", () => {
            if ((typeof(process.env.WORKER_SECRET) !== "undefined")) {
                socket.auth.token = process.env.WORKER_SECRET;
                console.log(new Date().getTime(), "connect_error attempt to resolve using WORKER_SECRET");
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
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`Worker has new job:`), data);
            if (typeof(data.mock) === "undefined" || data.mock !== true) {
                this.client_id = data;
                console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.bold.white("Processing incoming job..."));
                this.is_running = true;
                this.runJob(socket, data);
                this.is_running = false;
                console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Job synchronously completed."));
            } else {
                console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("This is a MOCK job!"));
                this.is_running = true;
                this.runJob(socket, data);
                this.is_running = false;
            }
        });
    }

    /*

    setupScheduler() {
        var cron_rule = "*/5 * * * *";
        schedule.scheduleJob(cron_rule, () => {
            this.loop();
        });
        console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Polling loop (5 minutes) scheduled."));
    }

    */

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
    if (typeof(srv) === "undefined" || srv === null) {
        console.log("THINX_SERVER environment variable must be defined in order to build firmware with proper backend binding.");
        process.exit(1);
    }
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

