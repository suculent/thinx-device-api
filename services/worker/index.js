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

const chalk = require('chalk');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');
//console.log(error('Error!'));
//console.log(warning('Warning!'));
const version = require('./package.json').version;
const schedule = require('node-schedule');
const io = require('socket.io-client');

class Worker {

    constructor() {
        this.client_id = null;
        this.is_running = false;
        this.socket = io('http://localhost:3000');
        console.log(chalk`
{red +=====================================+}
{red  \\}   {white.bold THiNX Cloud Build Worker ${version} }   {red \\}
{red   +=====================================+}
`);
        this.setupSocket(this.socket);
        this.setupScheduler();
    }

    setupSocket(socket) {
        
        // Connectivity Events

        socket.on('connect', function () { 
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Worker socket connected, registering..."));
            socket.emit('register', "Hello from BuildWorker."); // refactor, post status as well (running, id...)
        });

        socket.on('disconnect', function () {
            console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.bold.white("Worker socket disconnected."));
        });

        // Business Logic Events

        socket.on('client id', function (data) {
            if (this.client_id === null) {
                console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`We've got assigned initial client id: ${data}`));
            } else {
                console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white(`We've got re-assigned a new client id: ${data}`));
            }

            this.client_id = data;
        });

        socket.on('job', function (data) {
            console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`Incoming job:`), data);
            if (typeof(data.mock) !== "undefined" && data.mock === true) {
                this.client_id = data;
                console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Setting running to true..."));
                console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.bold.white("TODO: Process incoming job by running a working and sending console log through the socket."));
                this.is_running = true;
                this.runJob(socket, data);
            }
        });
    }

    setupScheduler() {
        var cron_rule = "*/1 * * * *";
        schedule.scheduleJob(cron_rule, () => {
            this.loop();
        });
        console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Polling loop (1 minute) scheduled."));
    }

    //
    // Main Logic
    //

    // Polling Loop
    runJob(sock, job) {
        sock.emit('status', {
            id: job.id, 
            mock: job.mock,
            status: 'done' // started, failed, done...
        });
        this.is_running = false;
        console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white("Setting running to false, job done..."));
    }

    loop() {
        if (!this.is_running) {
            this.socket.emit('poll', 'true');
        } else {
            console.log(new Date().getTime(), chalk.bold.orange("» ") + chalk.white("Skipping poll cron (job still running and did not timed out)."));
        }
    }
}

new Worker();