/*
 * This THiNX-RTM API module is responsible for responding to devices and build requests.
 */

require('./core.js');

//
// Shared Configuration
//

const client_user_agent = "THiNX-Client";
const webapp_user_agent = "THiNX-Web";

var config = require("./conf/config.json");
const db = config.database_uri;
const serverPort = config.port;

const uuidV1 = require('uuid/v1');
var http = require('http');
var parser = require('body-parser');
var nano = require("nano")(db);

var NodeSession = require('node-session');
var sessionConfig = require('./conf/node-session.json');
session = new NodeSession(sessionConfig);

// Response dictionary
var rdict = {};

// Welcome message for logfile
console.log("-=[ ☢ THiNX IoT RTM API ☢ ]=-");

initDatabases();

var devicelib = require("nano")(db).use("managed_devices");
var gitlib = require("nano")(db).use("managed_repos");
var buildlib = require("nano")(db).use("managed_builds");
var userlib = require("nano")(db).use("managed_users");

const dispatcher = new(require('httpdispatcher'))();

function validateRequest(req, res) {

	// Check device user-agent
	var ua = req.headers['user-agent'];
	var validity = ua.indexOf(client_user_agent)

	if (validity == 0) {
		return true;

	} else {
		console.log("☢ UA: '" + ua + "' invalid! " + validity);
		res.writeHead(401, {
			'Content-Type': 'text/plain'
		});
		res.end('Request not authorized.');
		return false;
	}
}

function validateSecureRequest(req, res) {

	// Check webapp user-agent
	var ua = req.headers['user-agent'];
	var validity = ua.indexOf(webapp_user_agent)

	if (validity == -1) {
		console.log("☢ UA: '" + ua + "' invalid! " + validity);
	}

	// Reasons to reject
	if ((req.method != 'POST') ||
		(validity == -1)) {
		// ? req.session.flush();
		failureResponse(res, 500, "protocol");
		console.log("Not a post request.");
		return false;
	}
	return true;
}



// CRUD on GIT repository database
/*
dispatcher.onPost("/api/repo/add", function(req, res) {
	// Repo should have 'firmware-name', URL and last commit ID, maybe array of devices (but that can be done by searching devices by commit id)

	// TODO: Fetch current user session by bearer token and use for 'owner'


	// TODO: Fetch parameters for following obj from req:
	var repo = {
		url: "https://github.com/suculent/thinx-firmware-esp8266.git",
		firmware_name: "thinx-firmware-esp8266",
		hash: "18ee75e3a56c07a9eff08f75df69ef96f919653f",
		owner: "admin",
		lastupdate: new Date()
	};

	gitlib.insert(repo, repo.firmware_name, function(err, body, header) {

		if (err == "Error: error happened in your connection") {
			//return;
		}

		if (err) {
			console.log("Inserting repo failed. " + err + "\n");
			// TODO

		} else {
			console.log("Repo inserted. Response: " + JSON.stringify(body) + "\n");
			// TODO

		}

		sendAddRepoResponse(res, rdict);
	});
})
*/

// Front-end authentication, returns 5-minute session on valid authentication
dispatcher.onPost("/api/login", function(req, res) {

	// Request must be post
	if (req.method != 'POST') {
		req.session.flush();

		failureResponse(res, 500, "protocol");
		console.log("Not a post request.");
		return;
	}

	var body = JSON.parse(req.body.toString());
	var username = body['username'];
	var password = body['password'];

	userlib.view('users', 'owners_by_username', {
		'key': username,
		'include_docs': true
	}, function(err, body) {

		if (req.session) {
			var data = req.session.all();
			console.log("Session data: " + JSON.stringify(data));
		}

		if (err) {
			console.log("Error: " + err.toString());

			// Did not fall through, goodbye...
			res.writeHead(401, {
				'Content-Type': 'application/json'
			});
			res.end(JSON.stringify({
				authentication: false
			}));
			req.session.flush();
			return;
		};

		var rows = body.rows; //the rows returned
		for (var row in rows) {
			var rowData = rows[row];
			if (username == rowData.key) {
				// console.log("Username known.");
				if (password == rowData.value) {
					// console.log("Username password known, user valid.");

					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Headers': 'Content-Type',
						'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
						'Access-Control-Allow-Origin': 'rtm.thinx.cloud'
					});

					session.startSession(req, res, function() {
						req.session.put('owner', rowData.key);

						// TODO: write last_seen timestamp to DB here
						res.end(JSON.stringify({
							status: "WELCOME"
						}));
						var data = req.session.all();
						console.log("Created new session: " + JSON.stringify(data));
					});
					return; // early exit
				}
			}

			// Did not fall through, goodbye...

			// EXTRACT: failureResponse("authentication")-->
			failureResponse(res, 401, "authentication");
			// <--


			if (req.session) {
				console.log("Flusing session: " + JSON.stringify(req.session.data));
				req.session.flush();
			}
		};
	}); // startSession
}); // onPost

function failureResponse(res, code, reason) {
	res.writeHead(code, {
		'Content-Type': 'application/json'
	});
	res.end(JSON.stringify({
		success: false,
		"reason": reason
	}));
}

/* Authenticated view draft
dispatcher.onPost("/api/view/devices", function(req, res) {

	if !validateSecureRequest(req) return;

	var body = JSON.parse(req.body.toString());
	//var query = body['query']; we might want to filter or page

	userlib.view('users', 'owners_by_username', {
		'key': username,
		'include_docs': true
	}, function(err, body) {

		if (req.session) {
			var data = req.session.all();
			console.log("Session data: " + JSON.stringify(data));
		}

		if (err) {
			console.log("Error: " + err.toString());

			// Did not fall through, goodbye...
			res.writeHead(401, {
				'Content-Type': 'application/json'
			});
			res.end(JSON.stringify({
				authentication: false
			}));
			req.session.flush();
			return;
		};

		var rows = body.rows; //the rows returned
		for (var row in rows) {
			var rowData = rows[row];
			if (username == rowData.key) {
				// console.log("Username known.");
				if (password == rowData.value) {
					// console.log("Username password known, user valid.");
					userV

					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Headers': 'Content-Type',
						'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
						'Access-Control-Allow-Origin': 'rtm.thinx.cloud'
					});

					session.startSession(req, res, function() {
						req.session.put('owner', rowData.key);

						// TODO: write last_seen timestamp to DB here
						res.end(JSON.stringify({
							status: "WELCOME"
						}));
						var data = req.session.all();
						console.log("Created new session: " + JSON.stringify(data));
					});
					return; // early exit
				}
			}

			// Did not fall through, goodbye...
			res.writeHead(401, {
				'Content-Type': 'application/json'
			});
			res.end(JSON.stringify({
				authentication: false
			}));
			if (req.session) {
				console.log("Flusing session: " + JSON.stringify(req.session.data));
				req.session.flush();
			}
		};
	}); // startSession
}); // onPost
*/

// Device login/registration (no authentication, no validation, allows flooding so far)
dispatcher.onPost("/device/register", function(req, res) {
	validateRequest(req, res);

	var callback = function() {};
	session.startSession(req, res, callback);

	if (req.method == 'POST') {

		var dict = JSON.parse(req.body.toString());
		var reg = dict['registration'];

		if (dict["registration"]) {

			rdict["registration"] = {};

			var mac = reg['mac'];
			var fw = reg['firmware'];
			var hash = reg['hash'];
			var push = reg['push'];
			var alias = reg['alias'];
			var owner = reg['owner']; // cannot be changed, must match if set

			var success = false;
			var status = "ERROR";

			var isNew = true;

			// See if we know this MAC which is a primary key in db
			devicelib.get(mac, function(err, existing) {

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
				var status = "OK";

				var device_id = mac;
				var firmware_url = "";
				var known_alias = "";
				var known_owner = "";

				status = "OK";
				update_available = false; // test only

				// function isUpdateAvailable(device) should search for new files since
				// last installed firmware (version ideally)

				// this is only a fake
				// TODO: fetch from commit notification descriptor
				var firmwareUpdateDescriptor = {
					url: "/bin/test/3b19d050daa5924a2370eb8ef5ac51a484d81d6e.bin",
					mac: "ANY",
					commit: "3b19d050daa5924a2370eb8ef5ac51a484d81d6e",
					version: "1",
					checksum: "4044decaad0627adb7946e297e5564aaf0c53f958175b388e02f455d3e6bc3d4"
				}

				//
				// Construct response
				//

				rdict["registration"]["success"] = success;
				rdict["registration"]["status"] = status;

				if (update_available) {
					rdict["registration"]["status"] = 'FIRMWARE_UPDATE';
					rdict["registration"]["url"] = firmwareUpdateDescriptor.url;
					rdict["registration"]["mac"] = firmwareUpdateDescriptor.mac;
					rdict["registration"]["commit"] = firmwareUpdateDescriptor.commit;
					rdict["registration"]["version"] = firmwareUpdateDescriptor.version;
					rdict["registration"]["checksum"] = firmwareUpdateDescriptor.checksum;
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

						if (err == "Error: error happened in your connection") {

							//return;
						}

						if (err) {
							console.log("Inserting device failed. " + err + "\n");
							rdict["registration"]["success"] = false;
							rdict["registration"]["status"] = "Insertion failed";

							console.log("CHECK6:");
							console.log(rdict['registration']);

						} else {
							console.log("Device inserted. Response: " + JSON.stringify(
									body) +
								"\n");
							rdict["registration"]["success"] = true;
							rdict["registration"]["status"] = "OK";

							console.log("CHECK7:");
							console.log(rdict['registration']);

						}

						sendRegistrationOKResponse(res, rdict);
					});

				} else {

					console.log("CHECK2:");
					console.log(rdict['registration']);

					// KNOWN:
					// - see if new firmware is available and reply FIRMWARE_UPDATE with url
					// - see if alias or owner changed
					// - otherwise reply just OK

					devicelib.get(mac, function(error, existing) {

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

							devicelib.insert(existing, mac, function(err, body, header) {

								if (!err) {

									console.log("Device updated. Response: " + JSON.stringify(
										body) + "\n");

									rdict["registration"]["success"] = true;

									// TESTING FIRMWARE_UPDATE
									//rdict["registration"]["status"] = "OK"; // test only, uncomment for production

									sendRegistrationOKResponse(res, rdict);

									return;

								} else {

									console.log("INSERT:FAILED");

									rdict["registration"]["success"] = false;
									rdict["registration"]["status"] = "Insert failed";

									console.log("CHECK5:");
									console.log(rdict['registration']);

									sendRegistrationOKResponse(res, rdict);
								}
							})

						} else {

							console.log("GET:FAILED");
							rdict["registration"]["success"] = false;
							rdict["registration"]["status"] = "Get for update failed";

							sendRegistrationOKResponse(res, rdict);
						}
					});
				}
			});
		}
	}
});

function sendRegistrationOKResponse(res, dict) {
	var json = JSON.stringify(dict);
	res.end(json);
}

/* Should return true for known devices */
function identifyDeviceByMac(mac) {
	return false;
}

//
// Databases
//

function initDatabases() {

	nano.db.create("managed_devices", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_devices")
		} else {
			console.log("» Device database creation completed. Response: " +
				JSON.stringify(
					body) + "\n");
		}
	});

	nano.db.create("managed_repos", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_repos")
		} else {
			console.log("» Repository database creation completed. Response: " +
				JSON.stringify(
					body) + "\n");
		}
	});

	nano.db.create("managed_builds", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_builds")
		} else {
			console.log("» Build database creation completed. Response: " + JSON
				.stringify(
					body) + "\n");
		}
	});

	nano.db.create("managed_users", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_users")
		} else {
			console.log("» User database creation completed. Response: " + JSON.stringify(
				body) + "\n");
		}
	});
}

function handleDatabaseErrors(err, name) {

	if (err.toString().indexOf("the file already exists") != -1) {
		// silently fail, this is ok

	} else if (err.toString().indexOf("error happened in your connection") !=
		-
		1) {
		console.log("🚫 Database connectivity issue. " + err)
		process.exit(1);

	} else {
		console.log("🚫 Database " + name + " creation failed. " + err);
		process.exit(2);
	}
}

//
// Builder
//

// Build respective firmware and notify target device(s)
dispatcher.onPost("/api/build", function(req, res) {

	var callback = function() {};
	session.startSession(req, res, callback);

	res.writeHead(200, {
		'Content-Type': 'application/json'
	});

	if (validateRequest(req, res) == true) {

		if (req.method == 'POST') {

			var rdict = {}

			var dict = JSON.parse(req.body.toString());

			var build = dict['build'];
			var mac = build.mac;
			var tenant = build.owner;
			var git = build.git;
			var dryrun = false;

			if (typeof(build.dryrun) != undefined) {
				dryrun = build.dryrun;
			}

			if ((typeof(build) == undefined || build == null) ||
				(typeof(mac) == undefined || mac == null) ||
				(typeof(tenant) == undefined || tenant == null) ||
				(typeof(git) == undefined || git == null)) {

				rdict = {
					build: {
						success: false,
						status: "Submission failed. Invalid params."
					}
				};

				res.end(JSON.stringify(rdict));
				return;
			}

			var build_id = uuidV1();

			if (dryrun == false) {
				rdict = {
					build: {
						success: true,
						status: "Build started.",
						id: build_id
					}
				};
			} else {
				rdict = {
					build: {
						success: true,
						status: "Dry-run started. Build will not be deployed.",
						id: build_id
					}
				};
			}

			res.end(JSON.stringify(rdict));

			buildCommand(build_id, tenant, mac, git, dryrun);
		}
	}
})

function buildCommand(build_id, tenant, mac, git, dryrun) {

	// ./builder --tenant=test --mac=ANY --git=https://github.com/suculent/thinx-firmware-esp8266 --dry-run
	// ./builder --tenant=test --mac=ANY --git=git@github.com:suculent/thinx-firmware-esp8266.git --dry-run

	console.log("Executing build chain...");

	const exec = require('child_process').exec;
	CMD = './builder --tenant=' + tenant + ' --mac=' + mac + ' --git=' + git +
		' --id=' + build_id;
	if (dryrun == true) {
		CMD = CMD + ' --dry-run'
	}
	console.log(CMD);
	exec(CMD, function(err, stdout, stderr) {
		if (err) {
			console.error(build_id + " : " + stdout);
			return;
		}
		console.log(build_id + " : " + stdout);
	});
}

//
// Server core and main loop
//

//We need a function which handles requests and send response
function handleRequest(request, response) {
	try {
		//console.log(request.url);
		dispatcher.dispatch(request, response);
	} catch (err) {
		console.log(err);
	}
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(serverPort, function() {
	//Callback triggered when server is successfully listening. Hurray!
	console.log("Server listening on: http://localhost:%s", serverPort);
});

// Prevent crashes on uncaught exceptions
process.on('uncaughtException', function(err) {
	console.log('Caught exception: ' + err);
});
