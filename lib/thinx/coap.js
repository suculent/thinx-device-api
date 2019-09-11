var coap = require('coap');

module.exports = class CoAP {

	init() {

		this.server = coap.createServer();

    this.server.on('request', (req, res) => {
      res.end('Hello ' + req.url.split('/')[1] + '\n');
      // TODO: forward to MQTT if required
    });

    // the default CoAP port is 5683
    this.server.listen(() => {
      var req = coap.request('coap://localhost/announcements');
      req.on('response', (res) => {
        res.pipe(process.stdout);
        res.on('end', () => {
          process.exit(0);
        });
      });
      req.end();
    });
  }

};
