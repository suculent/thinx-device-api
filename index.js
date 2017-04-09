const client_user_agent = "THiNX-Client";
const serverPort = 7442;
const db = "http://rtmapi:frohikey@localhost:5984";

var http = require('http');
var parser = require('body-parser');
var nano = require("nano")(db);

// Initially creates DB, otherwise fails silently.
nano.db.create("managed_devices", function (err, body, header) { 
    if (err) { 
        // console.log("» Database creation completed. " + err + "\n"); 
    } else { 
    	console.log("» Database creation completed. Response: " + JSON.stringify(body) + "\n"); 
    } 
});

var devicelib = require("nano")(db).use("managed_devices") 

const dispatcher = new (require('httpdispatcher'))();

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
    
    var ua = req.headers['user-agent'];
	var validity = ua.indexOf(client_user_agent)

	console.log("UA: "+ua + " : " + validity);

	if (validity == -1)  {
		res.writeHead(400, {'Content-Type': 'text/plain'});
    	res.end('Bad request.');
		console.log("UA: "+ua); // TODO: Report to security analytics!
	}

	if (req.method == 'POST') {

        var rdict = [];	   
        var dict = JSON.parse(req.body.toString());        
	    var reg = dict['registration'];

	    if (reg) {

	    	rdict["registration"] = [];

		   	var mac = reg['mac'];
		   	var fw = reg['firmware'];
		   	var hash = reg['hash'];
		   	var push = reg['push'];
		   	var alias = reg['alias'];
		   	var owner = reg['owner'];

		   	var success = false;
		   	var status = "ERROR";

		   	var isNew = true;

		   	// See if we know this MAC which is a primary key in db
		    devicelib.get(mac, function (err, existing) { 

		        if (err) { 		            
		            console.log("Querying devices failed. " + err + "\n"); 
		        } else {
		            isNew = false;
		        } 

		        /*
		        console.log("== Incoming attributes ==");
		        console.log("MAC: " + mac);
			    console.log("FW: " + fw);
			    console.log("HASH: " + hash);
			    console.log("PUSH: " + push);
			    console.log("ALIAS: " + alias);
			    console.log("OWNER: " + owner);
			    */

			    var success = false;
			   	var status = "ERROR";

			   	var device_id = undefined
			   	var firmware_url = undefined;
			   	var known_alias = undefined;
			   	var known_owner = undefined;

			   	status = "FIRMWARE_UPDATE";
			   	firmware_url = "/bin/eav/3b19d050daa5924a2370eb8ef5ac51a484d81d6e.bin";		   	

				//
			   	// Construct response			   
				//

			    rdict["registration"]["success"] = success;
			    rdict["registration"]["status"] = status;

			    if (firmware_url) {
			    	rdict["registration"]["url"] = firmware_url;
			    }

			    if (alias != known_alias) {
			    	rdict["registration"]["alias"] = known_alias;
			    }

			    if (owner != known_owner) {
			    	// TODO: Fail from device side, notify admin.
			    	rdict["registration"]["owner"] = known_owner;
			    }

			    if (device_id != null) {
			    	rdict["registration"]["device_id"] = device_id;
			    }

			    var device = { 
			        mac: mac, 
			        firmware: fw, 
			        hash: hash, 
			        push: push,
			        alias: alias,
			        owner: owner,
			        lastupdate: new Date()
			    }; 

			    if (isNew) {

			    	// UNKNOWN:
		    		// - store all parameters if valid and then reply OK
			     
				    devicelib.insert(device, device.mac, function(err, body, header) { 
				        if(err) { 
				            console.log("Inserting device failed. " + err + "\n"); 
				            rdict["registration"]["success"] = fail;
			    			rdict["registration"]["status"] = "Insertion failed";
				        } else { 
				            console.log("Device inserted. Response: " + JSON.stringify(body) + "\n"); 
				            rdict["registration"]["success"] = true;
			    			rdict["registration"]["status"] = "OK";
				        } 
				    }); 

				} else {

					// KNOWN:
				    // - see if new firmware is available and reply FIRMWARE_UPDATE with url
				    // - see if alias or owner changed
				    // - otherwise reply just OK

					devicelib.get(mac, function (error, existing) { 

				        if (!error) { 

				            existing.firmware = fw; 

				            if (typeof(hash) != undefined && hash != null) {
				            	existing.hash = hash;
				            }

				            if (typeof(push) != undefined && push != null) {
				            	existing.push = push;
				            }

				            if (typeof(alias) != undefined && alias != null) {
				            	existing.alias = alias;
				            }

				            if (typeof(owner) != undefined && owner != null) {
				            	existing.owner = owner;
				            }

				            existing.lastupdate = new Date();

				            devicelib.insert(existing, mac, function (err, body, header) { 

				                if (!err) { 

				                    console.log("Device updated. Response: " + JSON.stringify(body) + "\n"); 
				                    rdict["registration"]["success"] = true;
			    					rdict["registration"]["status"] = "OK";
				                    res.writeHead(200, {'Content-Type': 'application/json'});
    								res.end(rdict.toString());
    								return;

				                }  else {
				                	rdict["registration"]["success"] = false;
			    					rdict["registration"]["status"] = "Insert failed";
				                    res.writeHead(200, {'Content-Type': 'application/json'});
    								res.end(rdict.toString());
				                }
				            }) 

				        } else {

				        	rdict["registration"]["success"] = false;
			    			rdict["registration"]["status"] = "Get for update failed";
			    			res.writeHead(200, {'Content-Type': 'application/json'});
				    		res.end(rdict.toString());
				    		return;
				        }
				    }); 
				}

		    }); 

		    res.writeHead(200, {'Content-Type': 'application/json'});
    		res.end(rdict.toString());
    		return;
		}
    }
    
    // TODO: Should rather return nothing here due to flooding.
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('ERROR');
});

/* Should return true for known devices */
function identifyDeviceByMac(mac) {	
	return false;
}

//We need a function which handles requests and send response
function handleRequest(request, response){
  try {
        //console.log(request.url);
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
