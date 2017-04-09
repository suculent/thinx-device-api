var http = require('http');
var parser = require('body-parser');
//var qs = require('querystring');

const client_user_agent = "THiNX-Client";

const dispatcher = new (require('httpdispatcher'))();

var serverPort = 7442;

function execCommand(parameter){
        const exec = require('child_process').exec;
	CMD='wemo switch "'+wemo_device_name+'" '+parameter;
	console.log(CMD);
        exec(CMD, function (err, stdout, stderr) {
                if (err) {
                        console.error(err);
                        return;
                }
        	console.log(stdout);
	});
}

dispatcher.onPost("/api/login", function(req, res) {
    console.log("POST/on");

	console.log("Data: " + req.body);

	var ua = req.headers['user-agent'];
	var validity = ua.indexOf(client_user_agent)

	console.log("UA: "+ua + " : " + validity);

	if (validity == -1)  {
		// TODO: reject as invalid request
		res.writeHead(400, {'Content-Type': 'text/plain'});
    	res.end('Bad request.');
		console.log("UA: "+ua);
	}

	if (req.method == 'POST') {
            
        var dict = JSON.parse(req.body.toString());        

	    var reg = dict['registration'];

	    if (reg) {

		   	var mac = reg['mac'];
		   	var fw = reg['firmware'];
		   	var hash = reg['hash'];
		   	var push = reg['push'];
		   	var alias = reg['alias'];
		   	var owner = reg['owner'];

		   	var success = false;
		   	var status = "ERROR";

		   	// Fetch MAC
		    // - see if this MAC is known or unknown

		    // KNOWN:
		    // - see if new firmware is available and reply FIRMWARE_UPDATE with url
		    // - see if alias or owner changed
		    // - otherwise reply just OK

		    // UNKNOWN:
		    // - store all parameters if valid and then reply OK

		    console.log("MAC: " + mac);
		    console.log("FW: " + fw);
		    console.log("HASH: " + hash);
		    console.log("PUSH: " + push);
		    console.log("ALIAS: " + alias);
		    console.log("OWNER: " + owner);

		    console.log("Searching for device in DB...");

		    var success = false;
		   	var status = "ERROR";

		   	var device_id = null;
		   	var firmware_url = null;
		   	var known_alias = null;
		   	var known_owner = null;

		   	status = "FIRMWARE_UPDATE";
		   	firmware_url = "/bin/eav/3b19d050daa5924a2370eb8ef5ac51a484d81d6e.bin";		   	


		   	// Construct response

		    var rdict = [];

		    rdict["registration"] = [];

		    rdict["registration"]["success"] = success;
		    rdict["registration"]["status"] = status;

		    if (firmware_url) {
		    	rdict["registration"]["url"] = firmware_url;
		    }

		    if (alias != known_alias) {
		    	rdict["registration"]["alias"] = known_alias;
		    }

		    if (owner != known_owner) {
		    	rdict["registration"]["owner"] = known_owner;
		    }

		    if (device_id != null) {
		    	rdict["registration"]["device_id"] = device_id;
		    }

		    res.writeHead(200, {'Content-Type': 'application/json'});
    		res.end(rdict.toString());

		}

	    

    }

    
    
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('on\n');

    
});

/* Should return true for known devices */
function identifyDeviceByMac(mac) {	
	return false;
}

//We need a function which handles requests and send response
function handleRequest(request, response){
  try {
        console.log(request.url);
        dispatcher.dispatch(request, response);
    } catch(err) {
        console.log(err);
    }
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(serverPort, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", serverPort);
});
