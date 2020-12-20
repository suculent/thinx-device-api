const chalk = require('chalk');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');
//console.log(error('Error!'));
//console.log(warning('Warning!'));

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

function parseMessage(socket, msg) {

    // Assign client id to new workers...
    if (0 === msg.indexOf("Hello from BuildWorker")) {
        socket.emit('client id', socket.id);
    }
}

io.on('connection', function (socket) {

    // console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`Socket connection ${socket.id} initiated.`));

    socket.on('chat message', function (msg) {
        io.emit('chat message', msg);
        console.log("Chat message:", msg);
    });
    

    socket.on('socket message', function (msg) {
        io.emit('socket message', msg);
        console.log("Socket message:", msg);
        parseMessage(socket, msg);
    });

    socket.on('connect', () => {
        console.log(new Date().getTime(), chalk.bold.green(`»`), chalk.white(`Worker connected: ${socket.id}`));
        io.emit('socket message', "Hello from server.");
    });

    socket.on('disconnect', () => {
        console.log(new Date().getTime(), chalk.bold.red(`»`), chalk.white(`Worker disconnected: ${socket.id}`));
    });

    // either by directly modifying the `auth` attribute
    socket.on("connect_error", () => {
        //socket.auth.token = "abcd";
        //socket.connect();
        console.log("connect_error unresolved");
    });

    // Business Logic

    socket.on('register', function (msg) {
        console.log(new Date().getTime(), chalk.bold.green("» ") + chalk.white(`Worker registered: ${socket.id}`));
        parseMessage(socket, msg);
    });

    socket.on('poll', function (msg) {
        io.emit('job', { mock: true, id: 1 });
        console.log(new Date().getTime(), chalk.bold.red("» ") + chalk.white("Responding to job request with empty mock (TODO: respond with no-job or real data)."));
    });

});

http.listen(port, function () {
    console.log(chalk`
{blue *************************************************}
{blue *} {white.bold THiNX BuildServer Manager listening on *:${port} }{blue *}
{blue *************************************************}
    `);
});