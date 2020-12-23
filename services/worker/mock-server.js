const chalk = require('chalk');
const app = require('express')();
const port = process.env.PORT || 3000;
class BuildServer {

    constructor(maybe_app) {
        
        this.http = require('http').Server(app);
        this.http.listen(port, function () {
            console.log(`» Build Manager Socket started on port *:${port}`);
        });
        
        this.io = require('socket.io')(this.http);
        this.setupIo(this.io);
        this.workers = [];
    }

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
                secret: true
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
}

new BuildServer();