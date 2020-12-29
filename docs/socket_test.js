const WebSocket = require('ws');

const ws = new WebSocket('wss://thinx.kgr.cz/');

ws.on('open', function open() {
  ws.send('something');
});

ws.on('message', function incoming(data) {
  console.log(data);
});

