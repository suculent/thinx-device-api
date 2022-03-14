var coap = require('coap');

module.exports = class CoAP {

	init() {

		this.server = coap.createServer();

    this.server.on('request', (req, res) => {      
      console.log("MQTT forwarding not implemented yet; feel free to file a PR or Feature Request.", {req});
      res.end(200);
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
