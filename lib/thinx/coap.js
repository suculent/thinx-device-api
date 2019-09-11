var coap = require('coap');
var server = coap.createServer();

module.exports = class CoAP {

	init() {

    server.on('request', function(req, res) {
      res.end('Hello ' + req.url.split('/')[1] + '\n');
      // TODO: forward to MQTT if required
    });

    // the default CoAP port is 5683
    server.listen(function() {
      var req = coap.request('coap://localhost/announcements');
      req.on('response', function(res) {
        res.pipe(process.stdout);
        res.on('end', function() {
          process.exit(0);
        });
      });
      req.end();
    });
  }

};
