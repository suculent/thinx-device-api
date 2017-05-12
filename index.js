/*
 * This THiNX-RTM API module is responsible for responding to devices and build requests.
 */

require("./core.js");

//
// Shared Configuration
//

require('console-stamp')(console, 'yyyy-mm-dd HH:MM:ss.l');

var dummy_avatar =
	"data:image/png;base64,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";

var session_config = require("./conf/node-session.json");
var app_config = require("./conf/config.json");

var client_user_agent = app_config.client_user_agent;
var db = app_config.database_uri;
var serverPort = app_config.port;

var uuidV1 = require("uuid/v1");
var http = require("http");
var https = require("https");
var parser = require("body-parser");
var nano = require("nano")(db);
var sha256 = require("sha256");
var fingerprint = require('ssh-fingerprint');
var Emailer = require('email').Email;
var fs = require("fs");
var gutil = require('gulp-util');
var request = require("request");
var mkdirp = require('mkdirp');
var path = require('path');

var deploy = require("./lib/thinx/deployment");
var v = require("./lib/thinx/version");
var alog = require("./lib/thinx/audit");
var blog = require("./lib/thinx/build");
var watcher = require("./lib/thinx/repository");

var rdict = {};
var watched_repos = [];

/*
 * Databases
 */

function initDatabases() {

	nano.db.create("managed_devices", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_devices");
		} else {
			console.log("» Device database creation completed. Response: " +
				JSON.stringify(
					body) + "\n");
		}
	});

	nano.db.create("managed_builds", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_builds");
		} else {
			console.log("» Build database creation completed. Response: " +
				JSON
				.stringify(
					body) + "\n");
		}
	});

	nano.db.create("managed_users", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_users");
		} else {
			console.log("» User database creation completed. Response: " + JSON
				.stringify(
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
		console.log("🚫 Database connectivity issue. " + err);
		process.exit(1);

	} else {
		console.log("🚫 Database " + name + " creation failed. " + err);
		process.exit(2);
	}
}

/*
// Database access
// ./vault write secret/password value=13fd9bae19f4daffa17b34f05dbd9eb8281dce90 owner=test revoked=false
// Vault init & unseal:

var options = {
	apiVersion: 'v1', // default
	endpoint: 'http://127.0.0.1:8200', // default
	token: 'b7fbc90b-6ae2-bbb8-ff0b-1a7e353b8641' // optional client token; can be fetched after valid initialization of the server
};


// get new instance of the client
var vault = require("node-vault")(options);

// init vault server
vault.init({
		secret_shares: 1,
		secret_threshold: 1
	})
	.then((result) => {
		var keys = result.keys;
		// set token for all following requests
		vault.token = result.root_token;
		// unseal vault server
		return vault.unseal({
			secret_shares: 1,
			key: keys[0]
		})
	})
	.catch(console.error);

*/

initDatabases();

var devicelib = require("nano")(db).use("managed_devices");
var buildlib = require("nano")(db).use("managed_builds");
var userlib = require("nano")(db).use("managed_users");

// Express App

var express = require("express");
var session = require("express-session");
var app = express();

var redis = require("redis");
var redisStore = require('connect-redis')(session);
var client = redis.createClient();

app.use(session({
	secret: session_config.secret,
	store: new redisStore({
		host: 'localhost',
		port: 6379,
		client: client
	}),
	name: "x-thx-session",
	resave: true,
	rolling: true,
	saveUninitialized: true
}));

app.use(parser.json());
app.use(parser.urlencoded({
	extended: true
}));

app.all("/*", function(req, res, next) {

	console.log("[" + req.method + "]:" + req.url);

	var origin = req.get("origin");

	if (typeof(req.session) === "undefined") {
		console.log("---session-less-request---");
	}

	// FIXME: This is a hack. It should not work like this. We just need to find out,
	// why the login page rejects CORS on browser-side (redirect from successful
	// Password-change operation).

	if (typeof(origin) === "undefined") {
		origin = "rtm.thinx.cloud";
	}

	if (origin === null) {
		origin = "rtm.thinx.cloud";
	}

	var allowedOrigin = origin;

	// Custom user agent is required for devices
	var client = req.get("User-Agent");
	if (client == client_user_agent) {
		console.log("Device Agent: " + client);
		if (origin == "device") {
			next();
			return;
		}
	}

	res.header("Access-Control-Allow-Origin", allowedOrigin); // rtm.thinx.cloud
	res.header("Access-Control-Allow-Credentials", "true");
	res.header(
		"Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
	res.header("Access-Control-Allow-Headers",
		"Content-type,Accept,X-Access-Token,X-Key");

	if (req.method == "OPTIONS") {
		res.status(200).end();
	} else {
		next();
	}

	if ((typeof(req.session) !== "undefined") && (typeof(req.session
			.owner) !== "undefined")) {
		console.log(req.session.owner, req.method + " : " + req.url);
	} else {
		console.log("API", req.method + " : " + req.url);
	}


});

/*
 * User Profile
 */

/* Updates user profile allowing following types of bulked changes:
 * { avatar: "base64hexdata..." }
 * { info: { "arbitrary" : "user info data "} } }
 */
app.post("/api/user/profile", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	var update_key = null;
	var update_value = null;

	if (typeof(req.body.avatar) !== "undefined") {

		update_key = "avatar";
		update_value = req.body.avatar;

	} else if (typeof(req.body.info) !== "undefined") {

		update_key = "info";
		update_value = req.body.info;

	} else {
		res.end(JSON.stringify({
			success: false,
			status: "invalid_protocol"
		}));
	}

	//console.log("Updating owner: " + owner + "(" + username + ")");
	alog.log(owner, "Attempt to update owner: " + owner +
		" with: " + update_key + "and: " + JSON.stringify(update_value));

	// Fetch complete user
	userlib.get(owner, function(err, doc) {

		if (err) {
			console.log(err);
			alog.log(owner, "Profile update failed.");
			res.end(JSON.stringify({
				success: false,
				status: "owner_not_found"
			}));
			return;
		}

		if (!doc) {
			console.log("Document for " + owner + " not found.");
			alog.log(owner, "Profile update failed.");
			res.end(JSON.stringify({
				success: false,
				status: "document_not_found"
			}));
			return;
		}

		doc[update_key] = update_value;

		userlib.destroy(doc._id, doc._rev, function(err) {

			delete doc._rev;

			userlib.insert(owner, doc._id, function(err) {

				if (err) {
					console.log(err);
					alog.log(owner, "Profile updated.");
					res.end(JSON.stringify({
						success: false,
						status: "profile_update_failed"
					}));
					return;
				} else {
					alog.log(owner, "Profile update failed.");
					res.end(JSON.stringify({
						"success": true,
						update_key: update_value
					}));
				}

			});
		});
	});
});

/*
 * Devices
 */

/* List all devices for user. */
app.get("/api/user/devices", function(req, res) {

	if (!validateSecureGETRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;

	console.log("Listing devices by owner:" + owner);

	devicelib.view("devicelib", "devices_by_owner",
		/*{
			"key": owner,
			"include_docs": true
		},*/
		function(err, body) {

			if (err) {
				if (err.toString() == "Error: missing") {
					res.end(JSON.stringify({
						result: "none"
					}));
				}
				console.log("/api/user/devices: Error: " + err.toString());
				return;
			}

			var rows = body.rows; // devices returned
			var devices = []; // an array by design (needs push), to be encapsulated later

			// Show all devices for admin (if not limited by query)
			if (req.session.admin === true && typeof(req.body.query) ==
				"undefined") {
				var response = JSON.stringify({
					devices: devices
				});
				res.end(response);
				return;
			}

			for (var row in rows) {
				var rowData = rows[row];
				// Compare owner to device owner
				if (owner.indexOf(rowData.key) != -1) {
					devices.push(rowData);
				}
			}
			var reply = JSON.stringify({
				devices: devices
			});
			res.end(reply);
		});
});

/* Attach code source to a device. Expects unique device identifier and source alias. */
app.post("/api/device/attach", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	if (typeof(req.body.alias) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_alias"
		}));
		return;
	}

	if (typeof(req.body.mac) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_mac"
		}));
		return;
	}

	var mac = req.body.mac;
	var alias = req.body.alias;
	var owner = req.session.owner;
	var username = req.session.username;

	alog.log(owner, "Attempt to attach repository: " + alias +
		" to device: " + mac);

	devicelib.view("devicelib", "devices_by_mac", {
		"key": mac,
		"include_docs": true
	}, function(err, body) {

		if (err) {
			console.log(err);
			return;
		}

		if (body.rows.length === 0) {
			res.end(JSON.stringify({
				success: false,
				status: "udid_not_found"
			}));
			alog.log(owner,
				"Attempt to attach repository to non-existent device: " +
				mac);
			return;
		}

		var doc = body.rows[0].doc;
		alog.log(doc.owner, "Attaching repository to device: " + JSON.stringify(
			doc.hash));

		deploy.initWithOwner(doc.owner);
		var repo_path = deploy.pathForDevice(doc.owner, doc.device_id);
		console.log("repo_path: " + repo_path);

		mkdirp(repo_path, function(err) {
			if (err) console.error(err);
			else console.log(repo_path + ' created.');
		});

		if (typeof(watched_repos) === "undefined") {
			watched_repos = [];
		}

		if (fs.existsSync(repo_path)) {
			watcher.watchRepository(repo_path, watcher_callback);
			watched_repos.push(repo_path);
		} else {
			console.log(repo_path + " is not a directory.");
		}

		doc.source = alias;

		devicelib.destroy(doc._id, doc._rev, function(err) {
			delete doc._rev;
			devicelib.insert(doc, doc._id, function(err, body, header) {
				if (err) {
					console.log("/api/device/attach ERROR:" + err);
					res.end(JSON.stringify({
						success: false,
						status: "attach_failed"
					}));
					return;
				} else {
					res.end(JSON.stringify({
						success: true,
						attached: alias
					}));
				}
			});
		});
	});
});

/* Detach code source from a device. Expects unique device identifier. */
// FIXME: Should be based on device_id instead of MAC
app.post("/api/device/detach", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	if (typeof(req.body.mac) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_mac"
		}));
		return;
	}

	var mac = req.body.mac;
	var owner = req.session.owner;
	var username = req.session.username;

	alog.log(owner, "Attempt to detach repository from device: " + mac);

	devicelib.view("devicelib", "devices_by_mac", {
		"key": mac,
		"include_docs": true
	}, function(err, body) {

		if (err) {
			console.log(err);
			return;
		}

		console.log(JSON.stringify(body.rows));

		var doc = body.rows[0].doc;

		console.log("Detaching repository from device: " + JSON.stringify(doc.hash));

		var repo_path = deploy.pathForDevice(doc.owner, doc.device_id);
		console.log("repo_path: " + repo_path);
		if (fs.existsSync(repo_path)) {
			watcher.unwatchRepository(repo_path);
			watched_repos.splice(watched_repos.indexOf(repo_path));
		}

		doc.source = null;
		delete doc._rev;

		devicelib.destroy(doc._id, doc._rev, function(err) {
			devicelib.insert(doc, doc._id, function(err, body, header) {
				if (err) {
					console.log("/api/device/detach ERROR:" + err);
					res.end(JSON.stringify({
						success: false,
						status: "detach_failed"
					}));
					return;
				} else {
					res.end(JSON.stringify({
						success: true,
						attached: doc.source
					}));
				}
			});
		});
	});
});

/* Revokes a device. Expects unique device identifier. */
app.post("/api/device/revoke", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	if (typeof(req.body.udid) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_udid"
		}));
		return;
	}

	var udid = req.body.udid;
	var owner = req.session.owner;
	var username = req.session.username;

	alog.log(owner, "Attempt to revoke device: " + udid);

	devicelib.view("devicelib", "devices_by_id", {
		"key": udid,
		"include_docs": true
	}, function(err, body) {

		if (err) {
			console.log(err);
			return;
		}

		if (body.rows.count === 0) {
			alog.log(owner, "No such device: " + doc.alias +
				" (${doc.udid})");
			res.end(JSON.stringify({
				success: false,
				status: "no_such_device"
			}));
			return;
		}

		console.log("revoked device: " + JSON.stringify(body));

		var doc = body.rows[0];
		if (typeof(doc) === "undefined") {
			res.end(JSON.stringify({
				success: true,
				status: "already_revoked"
			}));
			return; // prevent breaking db
		}
		doc.udid = udid;

		var logmessage = "Revoking device: " + doc.udid;

		console.log(logmessage);

		alog.log(owner, logmessage);

		doc.source = null;
		delete doc._rev;

		devicelib.destroy(doc._id, doc._rev, function(err) {
			if (err) {
				console.log("/api/device/revoke ERROR:" + err);
				res.end(JSON.stringify({
					success: false,
					status: "revocation_failed"
				}));
				return;
			} else {
				var logmessage = "Revocation succeed: " + doc.alias +
					" (${doc.udid})";
				alog.log(owner, logmessage);
				res.end(JSON.stringify({
					success: true,
					revoked: doc.udid
				}));
			}
		});
	});
});

/*
 * API Keys
 */

/* Creates new api key. */
app.post("/api/user/apikey", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	if (typeof(req.body.alias) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_alias"
		}));
		return;
	}
	var new_api_key_alias = req.body.alias;

	var new_api_key = sha256(new Date().toString()).substring(0, 40);

	console.log("Searching for owner " + owner);


	userlib.get(owner, function(err, doc) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: err
			}));
			return;
		}

		console.log("doc: " + JSON.stringify(doc));

		if (doc === null) {
			console.log("User " + username + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		}

		//console.log("/api/use/apikey doc:" + JSON.stringify(doc));

		var keys = [];
		if (typeof(doc.api_keys) === "undefined") {
			keys = [];
		} else {
			keys = doc.api_keys;
		}

		keys[keys.length] = {
			"key": new_api_key,
			"hash": sha256(new_api_key),
			"alias": new_api_key_alias
		};

		console.log("[WARNING-NEW]: Storing key to redis: ");
		client.set("ak:" + doc._id, JSON.stringify(keys));

		doc.api_keys = keys;

		userlib.destroy(doc._id, doc._rev, function(err) {

			delete doc._rev;

			userlib.insert(doc, doc._id, function(err, body, header) {
				if (err) {
					console.log("/api/user/apikey ERROR:" + err);
				} else {
					console.log(doc.owner + " API Keys updated.");
					res.end(JSON.stringify({
						success: true,
						api_key: new_api_key
					}));
				}
			});
		});
	});
});

/* Deletes API Key by its hash value */
app.post("/api/user/apikey/revoke", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;
	var api_key_hash = req.body.fingerprint;

	console.log("Revoke API Key by hash: " + api_key_hash);

	userlib.get(owner, function(err, user) {

		if (err) {
			console.log(err);
			return;
		}

		if (!user) {
			console.log("User " + owner + " not found.");
			return;
		} else {
			console.log("ud: " + JSON.stringify(user));
		}

		// Search API key by hash
		var keys = user.api_keys; // array
		var api_key_index = null;
		var api_key = null;
		console.log("keys: " + keys);
		for (var index in keys) {
			var internal_hash = keys[index].hash;
			console.log("ihash: " + internal_hash + " ahash: " + api_key_hash);
			if (internal_hash.indexOf(api_key_hash) !== -1) {
				api_key_index = index;
				api_key = keys[index].key;
				console.log("Found and splicing index " + api_key_index + " key " +
					api_key);
				user.api_keys.splice(api_key_index, 1); // important
				break;
			}
		}

		if (api_key_index === null) {
			res.end(JSON.stringify({
				success: false,
				status: "hash_not_found"
			}));
			return;
		}

		user.last_update = new Date();

		userlib.destroy(user._id, user._rev, function(err) {

			delete user._rev;

			userlib.insert(user, user._id, function(err) {
				if (err) {
					console.log(err);
					res.end(JSON.stringify({
						success: false,
						status: "revocation_failed"
					}));
				} else {
					res.end(JSON.stringify({
						revoked: api_key,
						success: true
					}));
				}
			});
		});
	});
});

/* Lists all API keys for user. */
app.get("/api/user/apikey/list", function(req, res) {

	if (!validateSecureGETRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;

	userlib.get(owner, function(err, user) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "invalid_user"
			}));
			return;
		}

		//console.log("user: " + JSON.stringify(user));

		if (!user) {
			console.log("User " + owner + " not found.");
			console.log(user);
			res.end(JSON.stringify({
				success: false,
				status: "user_not_fond"
			}));
			return;
		}

		client.get("ak:" + user._id, function(err, redis_keys) {
			if ((typeof(redis_keys) !== "undefined") || (redis_keys !== null)) {
				console.log("[WARNING-NEW]: fetched redis_keys" + JSON.parse(
					redis_keys));
			} else {
				console.log("[WARNING-NEW]: fetched no redis_keys");
			}
		});

		var exportedKeys = [];
		for (var index in user.api_keys) {
			console.log("K: " + JSON.stringify(user.api_keys[index]));
			var info = {
				name: "******************************" + user.api_keys[index].key.substring(
					30),
				hash: user.api_keys[index].hash,
				alias: user.api_keys[index].alias
			};
			exportedKeys.push(info);
		}

		console.log("Listing API keys. ");
		res.end(JSON.stringify({
			api_keys: exportedKeys
		}));
	});
});

/*
 * Sources (GIT Repositories)
 */

/* List available sources */
app.get("/api/user/sources/list", function(req, res) {

	if (!validateSecureGETRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;

	userlib.get(owner, function(err, user) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "api-user-apikey-list_error"
			}));
			return;
		}

		console.log("Listing Repositories: " +
			JSON.stringify(user.repos));
		res.end(JSON.stringify({
			success: true,
			sources: user.repos
		}));
	});
});

/* Adds a GIT repository. Expects URL, alias and a optional branch (origin/master is default). */
app.post("/api/user/source", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	if (typeof(req.body.alias) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_source_alias"
		}));
		return;
	}

	if (typeof(req.body.url) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_source_url"
		}));
		return;
	}

	var branch = "origin/master";
	var url = req.body.url;
	var alias = req.body.alias;

	userlib.get(owner, function(err, body) {

		if (err) {
			console.log(err);
			return;
		}

		console.log("body:" + JSON.stringify(body));

		var user = body;
		var doc = body;

		if (!doc) {
			console.log("User " + owner + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		}

		var new_source = {
			alias: alias,
			url: url,
			branch: branch
		};

		if (typeof(doc.repos) === "undefined") {
			doc.repos = [];
		}

		doc.repos.push(new_source);

		userlib.destroy(doc._id, doc._rev, function(err) {

			delete doc._rev;

			userlib.insert(doc, doc._id, function(err, body, header) {
				if (err) {
					console.log("/api/user/source ERROR:" + err);
					res.end(JSON.stringify({
						success: false,
						status: "key-not-added"
					}));
					return;
				} else {
					res.end(JSON.stringify({
						success: true,
						source: new_source
					}));
				}
			});
		});
	});
});

/* Removes a GIT repository. Expects alias. */
app.post("/api/user/source/revoke", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	if (typeof(req.body.alias) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_source_alias"
		}));
		return;
	}

	var alias = req.body.alias;

	userlib.get(owner, function(err, body) {

		if (err) {
			console.log(err);
			return;
		}

		var user = body;
		var doc = user.doc;

		if (!doc) {
			console.log("User " + users[index].id + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		}

		var sources = [];
		for (var index in doc.repos) {
			var source = doc.repos[index];
			// TODO: Sources should have UUID as well
			if (source.alias.indexOf(alias) !== -1) {
				// skip this one to delete
			} else {
				sources.push(source);
			}
		}

		userlib.destroy(doc._id, doc._rev, function(err) {

			doc.repos = sources;
			delete doc._rev;

			userlib.insert(doc, doc._id, function(err, body, header) {
				if (err) {
					console.log("/api/user/source ERROR:" + err);
					res.end(JSON.stringify({
						success: false,
						status: "source_not_removed"
					}));
					return;
				} else {
					res.end(JSON.stringify({
						success: true,
						alias: alias
					}));
				}
			});
		});
	});
});

/*
 * RSA Keys
 */

app.post("/api/user/rsakey", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	// Validate those inputs from body... so far must be set
	if (typeof(req.body.alias) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_ssh_alias"
		}));
		return;
	}

	if (typeof(req.body.key) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_ssh_key"
		}));
		return;
	}

	var new_key_alias = req.body.alias;
	var new_key_body = req.body.key;
	var new_key_fingerprint = fingerprint(new_key_body);

	userlib.get(owner, function(err, doc) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		}

		console.log("body: " + JSON.stringify(doc));

		console.log(JSON.stringify(doc));

		if (!doc) {
			console.log("User " + owner + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "userid_not_found"
			}));
			return;
		}

		// FIXME: Change username to owner_id
		var file_name = username + "-" + Math.floor(new Date() /
			1000) + ".pub";
		var ssh_path = "../.ssh/" + file_name;

		var new_ssh_key = {
			alias: new_key_alias,
			key: ssh_path
		};

		fs.open(ssh_path, 'w+', function(err, fd) {
			if (err) {
				console.log(err);
			} else {
				fs.writeFile(ssh_path, new_ssh_key, function(err) {
					if (err) {
						console.log(err);
					} else {
						fs.close(fd, function() {
							console.log('RSA key installed...');
						});
						console.log("Updating permissions for " + ssh_path);
						fs.chmodSync(ssh_path, '644');
					}
				});
			}
		});

		doc.rsa_keys[new_key_fingerprint] = new_ssh_key;

		userlib.destroy(doc._id, doc._rev, function(err) {

			delete doc._rev;

			userlib.insert(doc, doc._id, function(err, body, header) {
				if (err) {
					console.log("/api/user/rsakey ERROR:" + err);
					res.end(JSON.stringify({
						success: false,
						status: "key-not-added"
					}));
				} else {
					console.log("RSA Key successfully added.");
					res.end(JSON.stringify({
						success: true,
						fingerprint: new_key_fingerprint
					}));
				}
			});
		});
	});
});

/* Lists all SSH keys for user. */
// TODO L8TR: Mangle keys as display placeholders only, but support this in revocation!
app.get("/api/user/rsakey/list", function(req, res) {

	if (!validateSecureGETRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	// Get all users
	userlib.get(owner, function(err, user) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		}

		console.log("user: " + JSON.stringify(user));

		if (typeof(user) === "undefined") {
			console.log("User " + user.id + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "userid_not_found"
			}));
			return;
		}

		var exportedKeys = [];
		var fingerprints = Object.keys(user.rsa_keys);
		for (var i = 0; i < fingerprints.length; i++) {
			var key = user.rsa_keys[fingerprints[i]];
			var info = {
				name: key.alias,
				fingerprint: fingerprints[i]
			};
			exportedKeys.push(info);
		}

		var reply = JSON.stringify({
			rsa_keys: exportedKeys
		});
		console.log("Listing RSA keys: " + reply);
		res.end(reply);
	});
});

/* Deletes RSA Key by its fingerprint */
app.post("/api/user/rsakey/revoke", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	if (typeof(req.body.fingerprint) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_attribute:fingerprint"
		}));
		return;
	}

	var rsa_key_fingerprint = req.body.fingerprint;

	console.log("Searching by username " + username);

	userlib.view(owner, function(err, user) {

		if (err) {
			console.log(err);
			return;
		}

		var doc = user.doc;

		if (!doc) {
			console.log("User " + user.id + " not found.");
			return;
		}

		// Search RSA key by hash
		var keys = doc.rsa_keys;
		var delete_key = null;

		var fingerprints = Object.keys(doc.rsa_keys);
		var new_keys = {};
		for (var i = 0; i < fingerprints.length; i++) {
			var key = doc.rsa_keys[fingerprints[i]];
			if (fingerprints[i].indexOf(rsa_key_fingerprint) !== -1) {

				if (fs.existsSync(key.key)) {
					console.log("Deleting RSA key file:" + key.key);
					fs.unlink(key.key);
				}
				console.log("Removing RSA key from database: " + rsa_key_fingerprint);
				delete_key = true;
			} else {
				new_keys[fingerprint] = fingerprints[fingerprint];
			}
		}

		if (delete_key !== null) {
			doc.last_update = new Date();
			user.doc.rsa_keys = new_keys;
		} else {
			res.end(JSON.stringify({
				success: false,
				status: "fingerprint_not_found"
			}));
			return;
		}


		if (err) {
			console.log("Cannot destroy user on password-reset");
			console.log(err);
			res.end(JSON.stringify({
				status: "user_not_reset",
				success: false
			}));
			return;
		} else {

			delete user.doc._rev;

			userlib.insert(user.doc, user.doc.id, function(err) {
				if (err) {
					console.log("rsa_revocation_failed:" + err);
					res.end(JSON.stringify({
						success: false,
						status: "rsa_revocation_failed"
					}));
				} else {
					res.end(JSON.stringify({
						revoked: rsa_key_fingerprint,
						success: true
					}));
				}
			});
		}
	});
});

/*
 * Password Reset
 */

// /user/create GET
/* Create username based on e-mail. Owner is  be unique (email hash). */
app.post("/api/user/create", function(req, res) {

	var first_name = req.body.first_name;
	var last_name = req.body.last_name;
	var email = req.body.email;
	var username = req.body.owner;
	// password will be set on successful e-mail activation

	var new_owner_hash = sha256(email);

	userlib.view("users", "owners_by_username", {
		"key": new_owner_hash,
		"include_docs": true // might be useless
	}, function(err, body) {

		if (err) {
			if (err != "Error: missing") {
				console.log("Error: " + err.toString());
			}
		} else {
			var user_should_not_exist = body.rows.length;
			if (user_should_not_exist > 0) {
				res.end(JSON.stringify({
					success: false,
					status: "email_already_exists"
				}));
				console.log("Already exists.");
				return;
			}
		}

		var new_api_keys = [];
		var new_rsa_keys = {};

		var new_activation_date = new Date().toString();
		var new_activation_token = sha256(new_activation_date);

		var default_repo = {
			alias: "THiNX Vanilla Device Firmware",
			url: "git@github.com:suculent/thinx-firmware-esp8266.git",
			devices: [
				"ANY"
			]
		};

		// Create user document
		var new_user = {
			owner: new_owner_hash,
			username: username,
			email: email,
			api_keys: new_api_keys,
			rsa_keys: new_rsa_keys,
			first_name: first_name,
			last_name: last_name,
			activation: new_activation_token,
			activation_date: new_activation_date,
			repos: [default_repo]
		};

		userlib.insert(new_user, new_owner_hash, function(err,
			body, header) {

			if (err) {
				if (err.statusCode == 409) {
					res.end(JSON.stringify({
						success: false,
						status: "email_already_exists"
					}));
				} else {
					console.log(err);
				}
				return;
			}

			console.log("Sending activation email...");

			// Creates registration e-mail with activation link
			var activationEmail = new Emailer({
				bodyType: "html",
				from: "api@thinx.cloud",
				to: email,
				subject: "Account activation",
				body: "<!DOCTYPE html>Hello " + first_name + " " + last_name +
					". Please <a href='http://rtm.thinx.cloud:7442/api/user/activate?owner=" +
					username + "&activation=" +
					new_activation_token +
					"'>activate</a> your THiNX account.</html>"
			});

			console.log("Sending reset e-mail: " + JSON.stringify(
				activationEmail));

			activationEmail.send(function(err) {
				if (err) {
					console.log(err);
					res.end(JSON.stringify({
						success: false,
						status: "activation_failed"
					}));
				} else {
					console.log("Activation email sent.");
					res.end(JSON.stringify({
						success: true,
						status: "email_sent"
					}));
				}
			});
		}); // insert
	}); // view
}); // post


/* Endpoint for the password reset e-mail. */
app.get("/api/user/password/reset", function(req, res) {

	var owner = req.query.owner; // for faster search
	var reset_key = req.query.reset_key; // for faster search

	alog.log(owner, "Attempt to reset password with: " + reset_key);

	console.log("Searching for owner " + owner);

	userlib.view("users", "owners_by_resetkey", {
		"key": reset_key,
		"include_docs": true
	}, function(err, body) {

		if (err) {
			console.log("Error: " + err.toString());
			req.session.destroy(function(err) {
				if (err) {
					console.log(err);
					res.end(err);
				} else {
					res.end(JSON.stringify({
						success: false,
						status: "invalid_protocol"
					}));
					console.log("Not a valid request.");
				}
			});
			return;
		}

		if (body.rows.length === 0) {
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		}

		var user = body.rows[0].doc;

		if (typeof(req.query.reset_key) !== "undefined") {

			var reset_key = req.query.reset_key;
			var user_reset_key = user.reset_key;

			if (typeof(user_reset_key) === "undefined") {
				user_reset_key = null;
			}

			console.log("Attempt to reset password with key: " + reset_key);

			if (req.query.reset_key != user_reset_key) {
				console.log("reset_key does not match");
				res.end(JSON.stringify({
					success: false,
					status: "invalid_reset_key"
				}));
				return;
			} else {
				res.redirect('http://rtm.thinx.cloud:80' +
					'/password.html?reset_key=' +
					reset_key +
					'&owner=' + user.owner);
				return;
			}

		} else {

			console.log("Missing reset key.");

		}
	});
});

/* Endpoint for the user activation e-mail, should proceed to password set. */
app.get("/api/user/activate", function(req, res) {

	console.log(JSON.stringify(req.query));

	var ac_key = req.query.activation;
	var ac_owner = req.query.owner;

	console.log("Searching ac_key " + ac_key + " for owner: " + ac_owner);

	userlib.view("users", "owners_by_activation", {
		"key": ac_key,
		"include_docs": true
	}, function(err, body) {

		if (err) {
			console.log("Error: " + err.toString());

			req.session.destroy(function(err) {
				console.log(err);
				res.end(JSON.stringify({
					status: "user_not_found",
					success: false
				}));
			});

			res.end(JSON.stringify({
				status: "activation",
				success: false
			}));

		} else {
			res.redirect('http://rtm.thinx.cloud:80' +
				'/password.html?activation=' +
				ac_key +
				'&owner=' + ac_owner);
			return;
		}
	});
});

/* Used by the password.html page to perform the change in database. Should revoke reset_key when done. */
app.post("/api/user/password/set", function(req, res) {

	var password1 = req.body.password;
	var password2 = req.body.rpassword;

	var request_owner = null;
	if (typeof(req.body.owner) !== undefined) {
		request_owner = req.body.owner;
	} else {
		console.log("Request has no owner for fast-search.");
	}

	if (password1 !== password2) {
		res.end(JSON.stringify({
			status: "password_mismatch",
			success: false
		}));
	} else {
		console.log("Passwords match....");
	}

	if (typeof(req.body.reset_key) !== "undefined") {

		alog.log(request_owner, "Attempt to set password with: " + req.body.reset_key);

		console.log("Performing password reset...");

		// Validate password reset_key
		userlib.view("users", "owners_by_resetkey", {
			"key": req.body.reset_key,
			"include_docs": true
		}, function(err, body) {

			if (err) {
				console.log("Error: " + err.toString());
				req.session.destroy(function(err) {
					if (err) {
						console.log(err);
					} else {
						res.end(JSON.stringify({
							status: "reset",
							success: false
						}));
						console.log("Not a valid request.");
					}
				});
				return;
			} else {

				console.log("resetting user: " + JSON.stringify(body));

				if (body.rows.length === 0) {
					res.end(JSON.stringify({
						status: "reset_user_not_found",
						success: false
					}));
					return;
				}

				var userdoc = body.rows[0];

				userdoc.doc.password = sha256(password1);
				userdoc.doc.last_reset = new Date();
				userdoc.doc.reset_key = null;

				if (err) {
					console.log("Cannot destroy user on password-set");
					res.end(JSON.stringify({
						status: "user_not_reset",
						success: false
					}));
					return;
				}

				console.log("Creating document...");

				delete userdoc.doc._rev;

				userlib.insert(userdoc.doc, userdoc.owner, function(err) {
					if (err) {
						console.log("Cannot insert user on password-set");
						res.end(JSON.stringify({
							status: "user_not_saved",
							success: false
						}));
						return;
					} else {
						console.log("Password reset completed saving new user document.");
						res.end(JSON.stringify({
							status: "password_reset_successful",
							success: true,
							redirect: "http://thinx.cloud/"
						}));
						return;
					}
				});
			}
		});

	} else if (typeof(req.body.activation) !== "undefined") {

		console.log("Performing new activation...");

		alog.log(request_owner, "Attempt to activate account with: " + req.body.activation);

		userlib.view("users", "owners_by_activation", {
			"key": req.body.activation,
			"include_docs": true
		}, function(err, body) {

			if (err) {
				console.log("Error: " + err.toString());
				res.end(JSON.stringify({
					status: "reset",
					success: false
				}));
				return;

			} else {

				console.log("activating user: " + JSON.stringify(body));

				if (body.rows.length === 0) {
					res.end(JSON.stringify({
						status: "activated_user_not_found",
						success: false
					}));
					return;
				}

				console.log("Activating user: " + JSON.stringify(body));

				var userdoc = body.rows[0].doc;

				deploy.initWithOwner(userdoc.owner);

				userdoc.password = sha256(password1);
				userdoc.activation_date = new Date();
				userdoc.activation = null;

				console.log("Updating user document: " + JSON.stringify(userdoc));

				userlib.destroy(userdoc._id, userdoc._rev, function(err) {

					delete userdoc._rev; // should force new revision...

					userlib.insert(userdoc, userdoc._id, function(err) {

						if (err) {
							console.log(err);
							console.log("Could not re-insert user on new activation.");
							res.end(JSON.stringify({
								status: "user_not_saved",
								success: false
							}));
							return;
						} else {
							// TODO: Password-reset success page, should redirect to login.
							console.log(
								"Password reset success page, should redirect to login...");
							//res.redirect("http://rtm.thinx.cloud:80/");
							res.end(JSON.stringify({
								redirect: "http://rtm.thinx.cloud:80/",
								success: true
							}));
							return;
						}
					});

				});
			}
		});
	} else {
		console.log("No reset or activation? Edge assert!");
		failureResponse(res, 403, "Password change not authorized.");
	}
});

// /user/password/reset POST
/* Used to initiate password-reset session, creates reset key with expiraation and sends password-reset e-mail. */
app.post("/api/user/password/reset", function(req, res) {

	var email = req.body.email;

	userlib.view("users", "owners_by_email", {
		"key": email,
		"include_docs": true // might be useless
	}, function(err, body) {

		if (err) {
			console.log("Error: " + err.toString());
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		} else {
			console.log("password reset users: " + body.rows.length);
			if (body.rows.length > 2) {
				res.end(JSON.stringify({
					success: false,
					status: "too_many_users"
				}));
				return;
			}

			if (body.rows.length === 0) {
				res.end(JSON.stringify({
					success: false,
					status: "email_not_found"
				}));
				return;
			}
		}

		var user = body.rows[0].doc;
		if (typeof(user) === "undefined" || user === null) {
			console.log("User not found.");
			res.end(JSON.stringify({
				success: false,
				status: "user_not_found"
			}));
			return;
		}


		console.log("Creating new reset-key...");
		user.reset_key = sha256(new Date().toString());

		delete user._rev;

		userlib.insert(user, user.owner, function(err, body, header) {

			if (err) {
				console.log(err);
				res.end(JSON.stringify({
					success: false,
					status: "insert_failed"
				}));
				return;
			}

			console.log("Resetting password for user: " + JSON.stringify(user));

			var resetEmail = new Emailer({
				bodyType: "html",
				from: "api@thinx.cloud",
				to: email,
				subject: "Password reset",
				body: "<!DOCTYPE html>Hello " + user.first_name + " " + user.last_name +
					". Someone has requested to <a href='http://rtm.thinx.cloud:7442/api/user/password/reset?owner=" +
					user.owner + "&reset_key=" + user.reset_key +
					"'>reset</a> your THiNX password.</html>"
			});

			console.log("Sending reset e-mail: " + JSON.stringify(resetEmail));

			resetEmail.send(function(err) {
				if (err) {
					console.log(err);
					res.end(JSON.stringify({
						success: false,
						status: err
					}));
				} else {
					console.log("Reset e-mail sent.");
					res.end(JSON.stringify({
						success: true,
						status: "email_sent"
					}));
				}
			});
			// Calling page already displays "Relax. You reset link is on its way."
		}); // insert
	}); // view
}); // post


// /user/profile GET
app.get("/api/user/profile", function(req, res) {

	// reject on invalid headers
	if (!validateSecureGETRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;

	userlib.get(owner, function(err, body) {

		if (err) {
			res.end(JSON.stringify({
				success: false,
				status: err
			}));
			return;
		}

		var avatar = dummy_avatar;
		if (typeof(body.avatar) !== "undefined") {
			avatar = body.avatar;
		}

		var profile = {
			first_name: body.first_name,
			last_name: body.last_name,
			username: body.username,
			owner: body.owner,
			avatar: avatar
		};

		res.end(JSON.stringify({
			success: true,
			profile: profile
		}));
	});
});

//
// Main Device API
//

// Firmware update retrieval. Serves binary [by owner (?) - should not be required] and device MAC.
app.post("/device/firmware", function(req, res) {

	validateRequest(req, res);

	var api_key = null;

	if (typeof(req.body.mac) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_mac"
		}));
		return;
	}

	if (typeof(req.body.hash) === "undefined") {
		/* optional, we'll find latest checksum if not available
		res.end(JSON.stringify({
			success: false,
			status: "missing_udid"
		}));
		return;
		*/
	}

	if (typeof(req.body.checksum) === "undefined") {
		/* optional, we'll find latest checksum if not available
		res.end(JSON.stringify({
			success: false,
			status: "missing_checksum"
		}));
		return;
		*/
	}

	if (typeof(req.body.commit) === "undefined") {
		/* optional, we'll find latest commit_id if not available
		res.end(JSON.stringify({
			success: false,
			status: "missing_commit"
		}));
		return;
		*/
	}

	var mac = req.body.mac; // will deprecate
	var udid = req.body.udid;
	var checksum = req.body.checksum;
	var commit = req.body.commit;
	var alias = req.body.alias;
	var owner = req.body.owner; // TODO: should be inferred from API Key, not required in request! But API Key is inside user which is a fail and should be stored in redis instead just with owner's secret ID reference.

	console.log("TODO: Validate if SHOULD update device " + mac +
		" using commit " + commit + " with checksum " + checksum +
		" and owner: " +
		owner);

	var success = false;
	var status = "ERROR";

	// Headers must contain Authentication header
	if (typeof(req.headers.authentication) !== "undefined") {
		api_key = req.headers.authentication;
	} else {
		console.log("ERROR: Update requests must contain API key!");
		res.end(JSON.stringify({
			success: false,
			status: "authentication"
		}));
		return;
	}

	userlib.view("users", "owners_by_username", {
		"include_docs": true // might be useless
	}, function(err, all_users) {

		if (err) {
			console.log("Error: " + err.toString());
			req.session.destroy(function(err) {
				if (err) {
					console.log(err);
				} else {
					failureResponse(res, 501, "protocol");
					console.log("Not a valid request.");
				}
			});
			return;
		} else {
			isNew = false;
		}

		// Find user and match api_key
		var api_key_valid = false;
		var user_data = null;

		// search API Key in owners, this will take a while...
		for (var oindex in all_users.rows) {
			var anowner = all_users.rows[oindex];
			for (var kindex in anowner.doc.api_keys) {
				var k = anowner.doc.api_keys[kindex].key;
				console.log("Comparing: " + k);
				if (k.indexOf(api_key) != -1) {
					user_data = anowner.doc;
					owner = anowner.doc.owner;
					console.log("Valid key found.");
					api_key_valid = true;
					break;
				}
			}
		}

		alog.log(owner, "Attempt to register device: " + udid + " alias: " +
			alias);

		// Bail out on invalid API key
		if (api_key_valid === false) {
			console.log("Invalid API key on firmware update.");
			alog.log(owner, "Attempt to use invalid API Key: " + api_key +
				"  on firmware update.");
			res.end(JSON.stringify({
				success: false,
				status: "api_key_invalid"
			}));
			return;
		} else {
			alog.log(owner, "Firmware request with API Key: " + api_key);
		}

		// See if we know this MAC which is a primary key in db

		if (err) {
			console.log("Querying devices failed. " + err + "\n");
		}

		var success = false;
		var status = "OK";

		devicelib.view("devicelib", "devices_by_id", {
			"key": udid,
			"include_docs": true
		}, function(err, existing) {

			if (err) {
				console.log(err);
				return;
			}

			var device = {
				mac: existing.mac,
				owner: existing.owner,
				version: existing.version
			};

			// FIXME: Validate checksum, commit and mac that should be part of request
			var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(device);
			var url = firmwareUpdateDescriptor.url;
			var mac = firmwareUpdateDescriptor.mac;
			var commit = firmwareUpdateDescriptor.commit;
			var version = firmwareUpdateDescriptor.version;
			var checksum = firmwareUpdateDescriptor.checksum;

			console.log("Seaching for possible firmware update... (owneer:" +
				device.owner + ")");

			deploy.initWithDevice(device);

			var update = deploy.hasUpdateAvailable(device);
			if (update === true) {
				var path = deploy.pathForDevice(owner, mac);
				fs.open(ssh_path, 'r', function(err, fd) {
					if (err) {
						res.end(JSON.stringify({
							success: false,
							status: "not_found"
						}));
						return console.log(err);
					} else {
						var buffer = fs.readFileSync(path);
						res.end(buffer);
						fs.close(fd, function() {
							console.log('Sending firmware update...');
						});

						devicelib.insert(existing, mac, function(err, body, header) {
							if (!err) {
								console.log("Device updated.");
								return;
							} else {
								console.log("Device record update failed." + err);
							}
						}); // insert

					}
				}); // fs.open

			} else {
				res.end(JSON.stringify({
					success: true,
					status: "no_update_available"
				}));
				console.log("No firmware update available for " + JSON.stringify(
					device));
			}
		}); // device get
	}); // user view
}); // app.get

// Device login/registration
// FIXME: MAC will be allowed for initial regitra
app.post("/device/register", function(req, res) {

	validateRequest(req, res);

	if (typeof(req.body.registration) == "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "no_registration"
		}));
		return;
	}

	var reg = req.body.registration;
	var api_key = null;

	rdict.registration = {};

	console.log("[!!!SEC!!!] Registration request: " + JSON.stringify(req.body));

	var mac = reg.mac;
	var fw = "unknown";
	if (!reg.hasOwnProperty("firmware")) {
		fw = "undefined";
	} else {
		fw = reg.firmware;
		console.log("Setting firmware " + fw);
	}

	var push = reg.push;
	var alias = reg.alias;
	var username = reg.owner;
	var success = false;
	var status = "ERROR";

	// Headers must contain Authentication header
	if (typeof(req.headers.authentication) !== "undefined") {
		api_key = req.headers.authentication;
	} else {
		console.log("ERROR: Registration requests now require API key!");
		alog.log(owner, "Attempt to register witout API Key!");
		res.end(JSON.stringify({
			success: false,
			status: "authentication"
		}));
		return;
	}

	userlib.view("users", "owners_by_username", { // because owners_by_apikey does not work anymore... apikeys should have to be in separate table
		"include_docs": true // might be useless
	}, function(err, body) {

		var isNew = true;

		if (err) {
			console.log("Error: " + err.toString());
			req.session.destroy(function(err) {
				if (err) {
					console.log(err);
				} else {
					failureResponse(res, 501, "protocol");
					console.log("Not a valid request.");
				}
			});
			return;
		} else {
			isNew = false;
		}

		if (body.rows.length === 0) {
			res.end(JSON.stringify({
				success: false,
				status: "owner_not_found"
			}));
			return;
		}

		//console.log("owners:" + JSON.stringify(body.rows));
		console.log("Searching for api-key: " + api_key);

		//console.log("in: " + JSON.stringify(body.rows));

		var user_data = null;
		var owner = null;

		var api_key_valid = false;

		// search API Key in owners, this will take a while...
		for (var oindex in body.rows) {
			var anowner = body.rows[oindex];
			for (var kindex in anowner.doc.api_keys) {
				var k = anowner.doc.api_keys[kindex].key;
				console.log("Comparing: " + k);
				if (k.indexOf(api_key) != -1) {
					user_data = anowner.doc;
					owner = anowner.doc.owner;
					console.log("Valid key found.");
					api_key_valid = true;
					break;
				}
			}
		}

		alog.log(owner, "Attempt to register device: " + hash + " alias: " +
			alias);

		var deploy = require("./lib/thinx/deployment");
		deploy.initWithOwner(owner); // creates user path if does not exist

		if (api_key_valid === false) {
			console.log("Invalid API key on registration.");
			alog.log(owner, "Attempt to use invalid API Key: " + api_key +
				" on device registration.");
			res.end(JSON.stringify({
				success: false,
				status: "authentication"
			}));
			return;
		} else {
			alog.log(owner, "Using API Key: " + api_key);
		}

		var success = false;
		var status = "OK";

		var device_id = mac;
		var device_version = "1.0.0"; // default

		if (typeof(reg.version) !== "undefined" && reg.version !== null) {
			console.log("Updating device version to " + reg.version);
			device_version = reg.version;
		}

		var firmware_url = "";
		var known_alias = "";
		var known_owner = "";

		var hash = null;
		if (typeof(reg.hash) !== "undefined") {
			hash = reg.hash;
		}

		var checksum = hash;
		if (typeof(reg.checksum) !== "undefined") {
			checksum = reg.checksum;
		}

		var udid = uuidV1(); // is returned to device which should immediately take over this value instead of mac for new registration
		if (typeof(reg.udid) !== "undefined") {
			udid = reg.udid;
		}

		//
		// Construct response
		//

		reg = rdict.registration;

		reg.success = success;
		reg.status = status;

		if (alias != known_alias) {
			known_alias = alias; // should force update in device library
		}

		if (known_owner === "") {
			known_owner = owner;
		}

		if (owner != known_owner) {
			// TODO: Fail from device side, notify admin.
			console.log("owner is not known_owner (" + owner + ", " +
				known_owner +
				")");
			reg.owner = known_owner;
			owner = known_owner; // should force update in device library
		}

		// Re-use existing UDID or create new one
		if (device_id !== null) {
			reg.device_id = device_id;
		}

		console.log("Device firmware: " + fw);

		var device = {
			mac: mac,
			firmware: fw,
			hash: hash,
			checksum: checksum,
			push: push,
			alias: alias,
			owner: owner,
			version: device_version,
			device_id: device_id,
			udid: udid,
			lastupdate: new Date(),
			lastkey: sha256(api_key)
		};

		console.log("Seaching for possible firmware update...");

		console.log("Checking update for device descriptor:\n" + JSON.stringify(
			device));

		//var deploy = require("./lib/thinx/deployment");
		var update = deploy.hasUpdateAvailable(device);
		if (update === true) {
			console.log("Firmware update available.");
			var firmwareUpdateDescriptor = deploy.latestFirmwareEnvelope(device);
			reg.status = "FIRMWARE_UPDATE";
			reg.success = true;
			reg.url = firmwareUpdateDescriptor.url;
			reg.mac = firmwareUpdateDescriptor.mac;
			reg.commit = firmwareUpdateDescriptor.commit;
			reg.version = firmwareUpdateDescriptor.version;
			reg.checksum = firmwareUpdateDescriptor.checksum;
		} else if (update === false) {
			reg.success = true;
			console.log("No firmware update available.");
		} else {
			console.log("Update semver response: " + update);
		}

		if (isNew) {

			// Create UDID for new device
			console.log("Considering a new device...");

			//device.udid = uuidV1(); // is returned to device which should immediately take over this value instead of mac for new registration
			device.device_id = device.udid; // backwards compatibility

			devicelib.insert(device, device.udid, function(err, body, header) {

				if (err == "Error: error happened in DB connection") {
					process.exit(3);
				}

				if (err) {
					console.log("Inserting device failed. " + err + "\n");
					reg.success = false;
					reg.status = "Insertion failed";
					console.log(reg);

				} else {
					console.log("Device inserted. Response: " + JSON.stringify(
							body) +
						"\n");
					reg.success = true;
					reg.status = "OK";
				}
				sendRegistrationOKResponse(res, rdict);
			});

		} else {

			console.log("Considering a device update...");

			// KNOWN DEVICES:
			// - see if new firmware is available and reply FIRMWARE_UPDATE with url
			// - see if alias or owner changed
			// - otherwise reply just OK

			devicelib.get(mac, function(error, existing) {

				if (!error) {

					existing.lastupdate = new Date();
					if (typeof(fw) !== undefined && fw !== null) {
						existing.firmware = fw;
					}
					if (typeof(hash) !== undefined && hash !== null) {
						existing.hash = hash;
					}
					if (typeof(push) !== undefined && push !== null) {
						existing.push = push;
					}
					if (typeof(alias) !== undefined && alias !== null) {
						existing.alias = alias;
					}
					if (typeof(owner) !== undefined && owner !== null) {
						existing.owner = owner;
					}

					devicelib.insert(existing, mac, function(err, body, header) {
						if (!err) {
							reg.success = true;
							console.log("Device info updated.");
							sendRegistrationOKResponse(res, rdict);

							return;

						} else {

							reg.success = false;
							reg.this.status = "Insert failed";
							console.log("Device record update failed." + err);

							console.log("CHECK5:");
							console.log(reg);
							console.log("CHECK5.1:");
							console.log(rdict);

							sendRegistrationOKResponse(res, rdict);
						}
					});

				} else {

					// IS NEW!

					console.log(error);

					device.device_id = uuidV1();

					device.lastupdate = new Date();
					if (typeof(fw) !== undefined && fw !== null) {
						device.firmware = fw;
					}
					if (typeof(hash) !== undefined && hash !== null) {
						device.hash = hash;
					}
					if (typeof(push) !== undefined && push !== null) {
						device.push = push;
					}
					if (typeof(alias) !== undefined && alias !== null) {
						device.alias = alias;
					}
					if (typeof(owner) !== undefined && owner !== null) {
						device.owner = owner;
					}

					devicelib.insert(device, mac, function(err, body, header) {
						if (!err) {
							reg.success = true;
							console.log("Device info created.");

							sendRegistrationOKResponse(res, rdict);

							return;

						} else {

							reg.success = false;
							reg.this.status = "Insert failed";
							console.log("Device record update failed." + err);

							console.log("CHECK6:");
							console.log(reg);
							console.log("CHECK6.1:");
							console.log(rdict);

							sendRegistrationOKResponse(res, rdict);
						}
					});
				}
			});
		}
	});
});

// Device editing (alias only so far)
app.post("/api/device/edit", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	if (typeof(req.body.changes) === "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_changes"
		}));
		return;
	}

	var owner = req.session.owner;
	var username = req.session.username;

	var changes = req.body.changes;

	console.log(JSON.stringify(changes));

	var change = changes; // TODO: support bulk operations

	var udid = change.device_id;

	console.log("Change with udid:" + udid);

	devicelib.view("devicelib", "devices_by_device_id", function(err, body) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "device_not_found"
			}));
			return;
		}

		if (body.rows.length === 0) {
			console.log(JSON.stringify(body));
			res.end(JSON.stringify({
				success: false,
				status: "no_such_device"
			}));
			return;
		}

		console.log("searching: " + udid);

		var device = null;

		for (var dindex in body.rows) {
			var dev = body.rows[dindex].key;
			console.log("Comparing dev" + JSON.stringify(dev));
			if (udid.indexOf(dev.device_id) != -1) {
				console.log("Found dev" + JSON.stringify(dev));
				device = dev;
				break;
			}
		}

		if (device === null) {
			res.end(JSON.stringify({
				success: false,
				status: "no_such_device"
			}));
			return;
		}

		var doc = device;

		console.log("doc: " + JSON.stringify(doc));

		console.log("Editing device: " +
			JSON.stringify(doc.alias));

		// Delete device document with old alias
		devicelib.destroy(doc._id, doc._rev, function(err) {

			delete doc._rev;

			if (err) {
				console.log("/api/device/edit ERROR:" + err);
				res.end(JSON.stringify({
					success: false,
					status: "destroy_failed"
				}));
				return;
			}

			if (typeof(change.alias) !== "undefined") {
				doc.alias = change.alias;
				console.log("Changing alias: " +
					JSON.stringify(doc.alias) + " to " + change.alias);
			}

			if (typeof(change.avatar) !== "undefined") {
				doc.avatar = change.avatar;
				console.log("Changing avatar: " +
					JSON.stringify(doc.avatar) + " to " + change.avatar);
			}

			devicelib.destroy(doc._id, doc._rev, function(err) {

				delete doc._rev;

				// Create device document with new alias
				devicelib.insert(doc, doc._id, function(err, body, header) {
					if (err) {
						console.log("/api/device/edit ERROR:" + err);
						res.end(JSON.stringify({
							success: false,
							status: "device_not_changed"
						}));
						return;
					} else {
						res.end(JSON.stringify({
							success: true,
							change: change
						}));
					}
				});
			});
		});
	});
});

function sendRegistrationOKResponse(res, dict) {
	var json = JSON.stringify(dict);
	res.set("Connection", "close");
	res.end(json);
}

function failureResponse(res, code, reason) {
	res.writeHead(code, {
		"Content-Type": "application/json"
	});
	res.end(JSON.stringify({
		success: false,
		"reason": reason
	}));
}

function validateRequest(req, res) {
	// Check device user-agent
	var ua = req.headers["user-agent"];
	var validity = ua.indexOf(client_user_agent);

	if (validity === 0) {
		return true;
	} else {
		console.log("User-Agent: " + ua + " invalid!");
		res.writeHead(401, {
			"Content-Type": "text/plain"
		});
		res.end("validate: Client request has invalid User-Agent.");
		return false;
	}
}

function validateSecureGETRequest(req, res) {
	// Only log webapp user-agent
	var ua = req.headers["user-agent"];
	//console.log("☢ User-Agent: " + ua);
	if (req.method != "GET") {
		console.log("validateSecure: Not a get request.");
		req.session.destroy(function(err) {
			if (err) {
				console.log(err);
			} else {
				failureResponse(res, 500, "protocol");
			}
		});
		return false;
	}
	return true;
}

function validateSecureDELETERequest(req, res) {
	var ua = req.headers["user-agent"];
	if (req.method != "DELETE") {
		console.log("validateSecure: Not a delete request.");
		req.session.destroy(function(err) {
			if (err) {
				console.log(err);
			} else {
				failureResponse(res, 500, "protocol");
			}
		});
		return false;
	}
	return true;
}

function validateSecurePOSTRequest(req, res) {
	var ua = req.headers["user-agent"];
	if (req.method != "POST") {
		console.log("validateSecure: Not a post request.");
		req.session.destroy(function(err) {
			if (err) {
				console.log(err);
			} else {
				failureResponse(res, 500, "protocol");
			}
		});
		return false;
	}
	return true;
}

function validateSession(req, res) {
	var sessionValid = false;
	if (typeof(req.session.owner) !== "undefined") {
		if (typeof(req.session.username) !== "undefined") {
			sessionValid = true;
		} else {
			console.log("validateSession: No username!");
		}
	} else {
		console.log("validateSession: No owner!");
	}
	if (sessionValid === false) {
		req.session.destroy(function(err) {
			if (err) {
				console.log(err);
			} else {
				console.log("validateSession: Invalid session, redirecting to login!");
				res.redirect("http://rtm.thinx.cloud:80/"); // redirects browser, not in XHR?
			}
		});
	}
	return sessionValid;
}

/*
 * Builder
 */

// Build respective firmware and notify target device(s)
app.post("/api/build", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var rdict = {};

	// FIXME: Change 'hash' to 'udid' in /build request
	// '{ "build" : { "hash" : "2d5b0e45f791cb3efd828d2a451e0dc64e4aefa3", "source" : "thinx-firmware-esp8266", "dryrun" : true } }'

	console.log(JSON.stringify(req.body));

	var owner = req.session.owner;
	var username = req.session.username;
	var build = req.body.build; // build descriptor wrapper	;

	var dryrun = false;
	if (typeof(build.dryrun) != "undefined") {
		dryrun = build.dryrun;
	}

	if (typeof(build.hash) === "undefined") {
		return res.end(JSON.stringify({
			success: false,
			status: "missing_device_hash"
		}));
	}
	var device_udid_hash = build.hash;
	console.log("Build for hash: " + build.hash);

	if (typeof(build.source) === "undefined") {
		return res.end(JSON.stringify({
			success: false,
			status: "missing_source_alias"
		}));
	}
	var source_alias = build.source;

	devicelib.view("devicelib", "devices_by_owner", {
		"key": owner,
		"include_docs": true
	}, function(err, body) {

		if (err) {
			if (err.toString() == "Error: missing") {
				res.end(JSON.stringify({
					result: "no_devices"
				}));
			}
			console.log("/api/build: Error: " + err.toString());
			return;
		}

		var rows = body.rows; // devices returned
		var udid = null;
		var device = null;
		var mac = null;

		for (var row in rows) {
			device = rows[row].doc;
			var db_udid = device.device_id;

			console.log(JSON.stringify(device));

			var device_owner = device.owner;
			console.log("Searching " + owner + " in " + device_owner);
			if (device_owner.indexOf(owner) !== -1) {
				console.log("Searching " + device_udid_hash + " in " + db_udid);
				if (device_udid_hash.indexOf(db_udid) != -1) {
					udid = device.device_id; // target device ID
					mac = device.mac; // target device ID mac, will deprecate
					break;
				}
			}
			// will deprecate when all devices will be re-registered using owner and not username
			if (typeof(username) !== "undefined") {
				if (username.indexOf(device.owner) !== -1) {
					if (device_udid_hash.indexOf(db_udid) != -1) {
						udid = device.device_id; // target device ID hash
						mac = device.mac; // target device ID mac, will deprecate
						break;
					}
				}
			}
		}

		// Converts build.git to git url by seeking in users' repos
		userlib.get(owner, function(err, doc) {

			if (err) {
				console.log(err);
				res.end(JSON.stringify({
					success: false,
					status: "api_build-device_fetch_error"
				}));
				return;
			}

			if (typeof(doc) === "undefined") {
				res.end(JSON.stringify({
					success: false,
					status: "no_such_owner"
				}));
				return;
			}

			var git = null;

			// Finds first source with given source_alias
			var sources = doc.repos;
			console.log("Parsing repos:" + JSON.stringify(sources));
			for (var index in sources) {
				var source = sources[index];
				if (source.alias.indexOf(source_alias) !== -1) {
					git = source.url;
					console.log("Found repo: " + git);
					break;
				}
			}

			if ((typeof(udid) === "undefined" || build === null) ||
				(typeof(mac) === "undefined" || mac === null) ||
				(typeof(owner) === "undefined" || owner === null) ||
				(typeof(git) === "undefined" || git === null)) {
				rdict = {
					build: {
						success: false,
						status: "invalid_params"
					}
				};

				res.end(JSON.stringify(rdict));
				return;
			}

			var build_id = uuidV1();

			if (dryrun === false) {
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

			buildCommand(build_id, owner, git, udid, dryrun);

		});
	});
});

function buildCommand(build_id, owner, git, udid, dryrun) {

	console.log("Executing build chain...");

	var exec = require("child_process").exec;
	CMD = "./builder --owner=" + owner + " --udid=" + udid + " --git=" +
		git +
		" --id=" + build_id;

	if (dryrun === true) {
		CMD = CMD + " --dry-run";
	}

	blog.log(build_id, owner, udid, "Running build...");

	console.log(CMD);
	exec(CMD, function(err, stdout, stderr) {
		console.log("WARNING: exec-test only...");
		if (err) {
			blog.log(build_id, owner, udid, "Build start failed...");
			console.error("err: " + err);
			return;
		}
		if (stderr) {
			blog.log(build_id, owner, udid, stderr);
			console.error("stderr:" + stderr);
		}
		console.log(build_id + " : " + stdout);
		blog.log(build_id, owner, udid, stdout);
	});

	console.log("build using sync-exec:");

	var sexec = require("sync-exec");
	var temp = sexec(CMD).stdout; // .replace("\n", "");
	console.log("sexec-stdout: " + temp);

	blog.log(build_id, owner, udid, temp);
}

/*
 * Build and Audit Logs
 */

/* Returns all audit logs per owner */
app.get("/api/user/logs/audit", function(req, res) {

	if (!validateSecureGETRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	alog.fetch(owner, function(err, body) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "log_fetch_failed",
				error: err
			}));
			return;
		}

		if (!body) {
			console.log("Log for owner " + owner + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "log_fetch_failed",
				error: err
			}));
			return;
		}

		//console.log("alog.fetch: " + JSON.stringify(body));

		res.end(JSON.stringify({
			success: true,
			logs: body
		}));
	});
});

/* Returns list of build logs for owner */
app.get("/api/user/logs/build/list", function(req, res) {

	if (!validateSecureGETRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;

	if (typeof(owner) === "undefined") {
		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "session_failed",
				error: err
			}));
			return;
		}
	}

	blog.list(owner, function(err, body) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "build_list_failed",
				error: err
			}));
			return;
		}

		if (!body) {
			console.log("Log for owner " + owner + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "build_list_empty",
				error: err
			}));
			return;
		}

		res.end(JSON.stringify({
			success: true,
			builds: body
		}));

	});
});

/* Returns specific build log for owner */
app.post("/api/user/logs/build", function(req, res) {

	if (!validateSecurePOSTRequest(req)) return;
	if (!validateSession(req, res)) return;

	var owner = req.session.owner;
	var username = req.session.username;

	if (typeof(req.body.build_id) == "undefined") {
		res.end(JSON.stringify({
			success: false,
			status: "missing_build_id"
		}));
		return;
	}

	blog.fetch(req.body.build_id, function(err, body) {

		if (err) {
			console.log(err);
			res.end(JSON.stringify({
				success: false,
				status: "build_fetch_failed",
				error: err
			}));
			return;
		}

		if (!body) {
			console.log("Log for owner " + owner + " not found.");
			res.end(JSON.stringify({
				success: false,
				status: "build_fetch_empty",
				error: err
			}));
			return;
		}

		res.end(JSON.stringify({
			success: true,
			log: body
		}));
	});
});



/*
 * Authentication
 */

// Front-end authentication, returns session on valid authentication
app.post("/api/login", function(req, res) {

	var client_type = "webapp";
	var ua = req.headers["user-agent"];
	var validity = ua.indexOf(client_user_agent);

	if (validity === 0) {
		console.log(ua);
		client_type = "device";
	}

	// Request must be post
	if (req.method != "POST") {
		req.session.destroy(function(err) {
			if (err) {
				console.log(err);
			} else {
				failureResponse(res, 500, "protocol");
				console.log("Not a post request.");
				return;
			}
		});
	}
	var username = req.body.username;
	var password = sha256(req.body.password);

	if (typeof(username) == "undefined" || typeof(password) == "undefined") {
		req.session.destroy(function(err) {
			if (err) {
				console.log(err);
			} else {
				failureResponse(res, 403, "unauthorized");
				console.log("User unknown.");
				return;
			}
		});
	}

	console.log("Serching user " + username);

	userlib.view("users", "owners_by_username", {
		"key": username,
		"include_docs": true // might be useless
	}, function(err, body) {

		if (err) {
			console.log("Error: " + err.toString());
			req.session.destroy(function(err) {
				if (err) {
					console.log(err);
				} else {
					failureResponse(res, 403, "unauthorized");
					console.log("Owner not found: " + username);
					return;
				}
			});
			return;
		}

		// Find user and match password
		var all_users = body.rows;
		for (var index in all_users) {
			var user_data = all_users[index];
			if (username == user_data.key) {

				// TODO: Second option (direct compare) will deprecate soon.
				if (password.indexOf(user_data.value) !== -1) {

					if (typeof(req.session === "undefined")) {
						console.log("ERROR, no session!");
					}

					console.log("login->owners_by_username->doc:" + JSON.stringify(
						user_data.doc));

					req.session.owner = user_data.doc.owner; // what if there's no session?
					console.log("ASsigning session owner: " + req.session.owner);
					req.session.username = user_data.doc.username;

					var minute = 5 * 60 * 1000;
					req.session.cookie.httpOnly = true;
					req.session.cookie.maxAge = 20 * minute;
					req.session.cookie.secure = false;

					console.log("Performing audit logging...");
					alog.log(req.session.owner, "User logged in: " + username);

					// TODO: write last_seen timestamp to DB here __for devices__
					console.log("client_type: " + client_type);
					if (client_type == "device") {
						res.end(JSON.stringify({
							status: "WELCOME",
							success: true
						}));
						return;
					} else if (client_type == "webapp") {
						//console.log("Redirecting through JSON body...");
						res.end(JSON.stringify({
							"redirectURL": "http://rtm.thinx.cloud:80/app"
						}));
						return;
					} else {
						res.end(JSON.stringify({
							status: "OK",
							success: true
						}));
					}
					// TODO: If user-agent contains app/device... (what?)
					return;

				} else {
					console.log("Password mismatch for " + username);
					alog.log(req.session.owner, "Password mismatch for: " + username);
					res.end(JSON.stringify({
						status: "password_mismatch",
						success: false
					}));
					return;
				}
			}
		}

		if (typeof(req.session.owner) == "undefined") {

			if (client_type == "device") {
				res.end(JSON.stringify({
					status: "ERROR"
				}));
				return;
			} else if (client_type == "webapp") {
				res.redirect("http://rtm.thinx.cloud:80/"); // redirects browser, not in XHR?
				return;
			}

			console.log("login: Flushing session: " + JSON.stringify(req.session));
			req.session.destroy(function(err) {
				if (err) {
					console.log(err);
				} else {
					res.end(JSON.stringify({
						success: false,
						status: "no session (owner)"
					}));
					console.log("Not a post request.");
					return;
				}
			});
		} else {
			failureResponse(res, 541, "authentication exception");
		}
	});
});

// Front-end authentication, destroys session on valid authentication
app.get("/api/logout", function(req, res) {
	if (typeof(req.session) !== "undefined") {
		req.session.destroy(function(err) {
			if (err) {
				console.log(err);
			}
		});
	}
	res.redirect("http://rtm.thinx.cloud/"); // HOME_URL (Apache)
});

/** Tested with: !device_register.spec.js` */
app.get("/", function(req, res) {
	console.log("/ called with owner: " + req.session.owner);
	if (req.session.owner) {
		res.redirect("http://rtm.thinx.cloud:80/app");
	} else {
		res.end("This is API ROOT."); // insecure
	}
});

app.version = function() {
	return v.revision();
};

var options = {
	key: fs.readFileSync(app_config.ssl_key),
	cert: fs.readFileSync(app_config.ssl_cert)
};

// FIXME: Link to letsencrypt SSL keys using configuration
https.createServer(options, app).listen(serverPort + 1);
http.createServer(app).listen(serverPort);

// Will probably deprecate...
//app.listen(serverPort, function() {
var package_info = require("./package.json");
var product = package_info.description;
var version = package_info.version;

console.log("");
console.log("-=[ ☢ " + product + " v" + version + " rev. " + app.version() +
	" ☢ ]=-");
console.log("");
console.log("» Started on port " + serverPort + " (HTTP) and " + (serverPort +
		1) +
	" (HTTPS)");
//});

/* Should load all devices with attached repositories and watch those repositories.
 * Maintains list of watched repositories for runtime handling purposes.
 * TODO: Re-build on change.
 */

var watcher_callback = function(result) {
	if (typeof(result) !== "undefined") {
		console.log("watcher_callback result: " + JSON.stringify(result));
		//watched_repos.splice(watched_repos.indexOf(path));
		console.log(
			"TODO: Commence re-build (will notify user but needs to get all required user data first (owner/device is in path)"
		);
	} else {
		console.log("watcher_callback: no result");
	}
};

var initWatcher = function(watcher) {

	console.log("» Starting GIT watcher...");

	devicelib.view("devicelib", "watcher_view", {
		"include_docs": true
	}, function(err, body) {

		if (err) {
			console.log(err);
			return;
		}

		for (var index in body.rows) {
			var owner = body.rows[index].doc.owner;
			var device_id = body.rows[index].doc.device_id;
			var path = deploy.pathForDevice(owner, device_id);
			//console.log("Watcher checks path " + path);
			if (!fs.existsSync(path)) {
				continue;
			} else {
				console.log("Trying to watch path: " + path);
				if (fs.lstatSync(path).isDirectory()) {
					watcher.watchRepository(path, watcher_callback);
					watched_repos.push(path);
				} else {
					console.log(path + " is not a directory.");
				}
			}
		}
	});
};

initWatcher(watcher);

//
// Database compactor
//

var database_compactor = function() {
	console.log("» Running database compact jobs...");
	nano.db.compact("builds");
	nano.db.compact("deviceslib");
	nano.db.compact("logs");
	nano.db.compact("users");
	console.log("» Database compact jobs completed.");
};

var COMPACT_TIMEOUT = 30000;
var database_compact_timer = setTimeout(database_compactor, COMPACT_TIMEOUT);

// Prevent crashes on uncaught exceptions

process.on("uncaughtException", function(err) {
	console.log("Caught exception: " + err);
});
