/*
 * This THiNX-RTM API module is responsible for responding to devices and build requests.
 */

require("./core.js");

//
// Shared Configuration
//

var session_config = require("./conf/node-session.json");
var app_config = require("./conf/config.json");

var client_user_agent = app_config.client_user_agent;
var db = app_config.database_uri;
var serverPort = app_config.port;

var uuidV1 = require("uuid/v1");
var http = require("http");
var parser = require("body-parser");
var nano = require("nano")(db);
var sha256 = require("sha256");
var Emailer = require('email').Email;

var request = require("request");

var v = require("./lib/thinx/version");

var rdict = {};

// Database access
// ./vault write secret/password value=13fd9bae19f4daffa17b34f05dbd9eb8281dce90 owner=test revoked=false
// Vault init & unseal:

var options = {
	apiVersion: 'v1', // default
	endpoint: 'http://127.0.0.1:8200', // default
	token: 'b7fbc90b-6ae2-bbb8-ff0b-1a7e353b8641' // optional client token; can be fetched after valid initialization of the server
};

/*
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
var gitlib = require("nano")(db).use("managed_repos");
var buildlib = require("nano")(db).use("managed_builds");
var userlib = require("nano")(db).use("managed_users");

// Express App

var express = require("express");
var session = require("express-session");
var app = express();
var sess;

app.use(session({
	secret: session_config.secret,
	name: "x-thx-session",
	resave: false,
	saveUninitialized: false
}));

app.use(parser.json());
app.use(parser.urlencoded({
	extended: true
}));

app.all("/*", function(req, res, next) {

	// CORS headers

	var origin = req.get("origin");

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

	if ((origin == "http://rtm.thinx.loc") ||
		(origin == "https://rtm.thinx.cloud") ||
		(origin == "127.0.0.1") ||
		(origin == "undefined") ||
		(origin == "rtm.thinx.cloud")
	) {
		console.log("X-Origin: " + origin);
	} else {
		console.log("Origin: " + origin);
	}

	// Custom user agent is required for devices
	var client = req.get("User-Agent");
	if (client == client_user_agent) {
		console.log("Device Agent: " + client);
		if (origin == "device") {
			next();
			return;
		} else {
			// skip for local tests and calls so far [chec4sec]
			if (origin != "rtm.thinx.cloud") {
				console.log("Non-device Origin: " + origin);
			}
		}
	}

	res.header("Access-Control-Allow-Origin", allowedOrigin); // rtm.thinx.cloud
	res.header("Access-Control-Allow-Credentials", "true");
	res.header(
		"Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
	// Set custom headers for CORS
	res.header("Access-Control-Allow-Headers",
		"Content-type,Accept,X-Access-Token,X-Key");
	if (req.method == "OPTIONS") {
		res.status(200).end();
	} else {
		next();
	}
});

// http://thejackalofjavascript.com/architecting-a-restful-node-js-app/

/*
 * Devices
 */

/* Authenticated view draft */
app.get("/api/user/devices", function(req, res) {
	if (!validateSecureGETRequest(req)) return;

	// reject on invalid session
	if (!sess) {
		failureResponse(res, 405, "not allowed");
		console.log("/api/user/devices: No session!");
		return;
	}

	// reject on invalid owner
	var owner = null;
	if (req.session.owner || sess.owner) {
		if (req.session.owner) {
			console.log("assigning owner = req.session.owner;");
			owner = req.session.owner;
		}
		if (sess.owner) {
			console.log(
				"assigning owner = sess.owner; (client lost or session terminated?)");
			owner = sess.owner;
		}
	} else {
		failureResponse(res, 403, "session has no owner");
		console.log("/api/user/devices: No valid owner!");
		return;
	}

	devicelib.view("devicelib", "devices_by_owner", {
		"key": owner,
		"include_docs": false
	}, function(err, body) {

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
		if (req.session.admin === true && typeof(req.body.query) == "undefined") {
			var response = JSON.stringify({
				devices: devices
			});
			res.end(response);
			return;
		}

		for (var row in rows) {
			var rowData = rows[row];
			console.log("Matching device of device owner " + rowData.key +
				" with alien user " + owner + " in " + rowData.toString());
			if (owner == rowData.key) {
				console.log("/api/user/devices: OWNER: " + JSON.stringify(rowData) +
					"\n");
				devices.push(rowData);
			} else {
				console.log("/api/user/devices: ROW: " + JSON.stringify(rowData) + "\n");
			}
		}
		var reply = JSON.stringify({
			devices: devices
		});
		console.log("/api/user/devices: Response: " + reply);
		res.end(reply);
	});
});

/*
 * API Keys
 */

/* Creates new api key. */

// FIXME: does not save to DB
app.get("/api/user/apikey", function(req, res) {

	// So far must Authenticated using owner session.
	// This means, new API KEY can requested only
	// from authenticated web UI.

	console.log(JSON.stringify(sess));

	if (!validateSecureGETRequest(req)) return;

	// reject on invalid owner
	var owner = null;
	if (req.session.owner || sess.owner) {
		if (req.session.owner) {
			console.log("assigning owner = req.session.owner;");
			owner = req.session.owner;
		}
		if (sess.owner) {
			console.log(
				"assigning owner = sess.owner; (client lost or session terminated?)");
			owner = sess.owner;
		}
	} else {
		failureResponse(res, 403, "session has no owner");
		console.log("/api/user/devices: No valid owner!");
		return;
	}

	var new_api_key = sha256(new Date().toString()).substring(0, 40);

	// Get all users
	userlib.view("users", "owners_by_username", function(err, doc) {

		if (err) {
			console.log(err);
			return;
		}

		var users = doc.rows;
		var user_data;
		var doc_id;
		for (var index in users) {
			if (users[index].key === owner) {
				doc_id = users[index]._id;
				break;
			}
		}

		// Fetch complete user
		userlib.get(users[index].id, function(error, doc) {

			if (!doc) {
				console.log("User " + users[index].id + " not found.");
				return;
			}

			console.log("Updating user: " + JSON.stringify(doc));

			userlib.destroy(users[index]._id, doc._rev, function(err) {

				console.log("Destroyed, inserting " + JSON.stringify(dic));

				// Add new API Key
				doc.api_keys.push(new_api_key);
				delete doc._rev;

				userlib.insert(doc, owner, function(err, body, header) {
					if (err) {
						console.log("/api/user/apikey ERROR:" + err);
					} else {
						console.log("Userlib " + owner + "document inserted");
						res.end(JSON.stringify({
							api_key: new_api_key
						}));
					}
				});
			});
		});
	});
});

// /user/apikey/revoke POST
app.post("/api/user/apikey/revoke", function(req, res) {

	console.log("/api/user/apikey/revoke");

	var vtest = vault.read('secret/password');
	console.log("vtest: " + JSON.stringify(vtest));

	if (!validateSecureRequest(req)) return;

	var owner = null;
	if (req.session.owner || sess.owner) {
		if (req.session.owner) {
			console.log("assigning owner = req.session.owner;");
			owner = req.session.owner;
		}
		if (sess.owner) {
			console.log(
				"assigning owner = sess.owner; (client lost or session terminated?)");
			owner = sess.owner;
		}
	} else {
		failureResponse(res, 403, "session has no owner");
		console.log("/api/user/apikey/revoke: No valid owner!");
		return;
	}

	var api_key = req.body.api_key;

	// Get all users
	userlib.view("users", "owners_by_username", function(err, doc) {

		if (err) {
			console.log(err);
			return;
		}

		var users = doc.rows;
		var user_data;
		var doc_id;
		for (var index in users) {
			if (users[index].key === owner) {
				doc_id = users[index]._id;
				break;
			}
		}

		// Fetch complete user
		userlib.get(users[index].id, function(error, doc) {

			if (!doc) {
				console.log("User " + users[index].id + " not found.");
				return;
			}

			var keys = doc.api_keys;
			var removeIndex = keys[api_key];
			keys.splice(removeIndex, 1);
			doc.api_keys = keys;
			delete doc._rev;

			console.log("Saving: " + JSON.stringify(doc.api_keys));

			// Save new document
			userlib.insert(doc, users[index].owner, function(err) {
				if (err) {
					console.log(err);
					res.end(JSON.stringify({
						success: false,
						status: "Revocation failed."
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
// TODO L8TR: Mangle keys as display placeholders only, but support this in revocation!
app.get("/api/user/apikey/list", function(req, res) {

	console.log("/api/user/apikey/list");

	// So far must Authenticated using owner session.
	// This means, new API KEY can requested only
	// from authenticated web UI.

	if (!validateSecureGETRequest(req)) return;

	// reject on invalid session
	if (!sess) {
		failureResponse(res, 405, "not allowed");
		console.log("/api/user/devices: No session!");
		return;
	}

	var owner = null;
	if (typeof(sess) !== "undefined" && ((typeof(req.session) !==
				"undefined") ||
			sess.owner)) {
		if (typeof(req.session.owner) !== "undefined") {
			console.log("assigning owner = req.session.owner;");
			owner = req.session.owner;
		}
		if (typeof(sess.owner) !== "undefined") {
			console.log(
				"assigning owner = sess.owner; (client lost or session terminated?)");
			owner = sess.owner;
		}
	} else {
		failureResponse(res, 403, "session has no owner");
		console.log("/api/user/apikey/list: No valid owner!");
		return;
	}

	var new_api_key = sha256(new Date().toString()).substring(0, 40);

	// Get all users
	userlib.view("users", "owners_by_username", function(err, doc) {

		if (err) {
			console.log(err);
			return;
		}

		var users = doc.rows;
		var user_data;
		var doc_id;
		for (var index in users) {
			if (users[index].key === owner) {
				doc_id = users[index]._id;
				break;
			}
		}

		// Fetch complete user
		userlib.get(users[index].id, function(error, doc) {

			if (!doc) {
				console.log("User " + users[index].id + " not found.");
				return;
			}

			// Return all api-keys
			console.log("Listing api keys: " +
				JSON.stringify(doc.api_keys));
			res.end(JSON.stringify({
				api_keys: doc.api_keys
			}));

		});
	});
});

/*
 * Password Reset
 */

// TODO: /user/create GET
/* Create username based on e-mail. Owner should be unique (docid?). */
app.post("/api/user/create", function(req, res) {

	console.log("/api/user/create");
	console.log(JSON.stringify(req.body));

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
				return;
			}
		}

		var new_api_keys = [];
		var new_api_key = sha256(new Date().toString()).substring(0, 40);
		new_api_keys.push(new_api_key);

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
					res.writeHead(409, {
						"Content-Type": "application/json"
					});
					res.end(JSON.stringify({
						success: false,
						status: "User already exists"
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
					new_activation_token + "'>activate</a> your THiNX account.</html>"
			});

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

	console.log(JSON.stringify(req.body));

	var owner = req.query.owner; // for faster search
	var reset_key = req.query.reset_key; // for faster search

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

		console.log(body);

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
				res.redirect('http://rtm.thinx.cloud:80' + '/password.html?reset_key=' +
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

	console.log("GET /api/user/activate");
	console.log(JSON.stringify(req.query));

	var ac_key = req.query.activation;
	var ac_owner = req.query.owner;

	console.log("Searching ac_key " + ac_key + " for owner: " + ac_owner);

	userlib.view("users", "owners_by_activation", {
		"key": ac_key,
		"include_docs": false
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
			res.redirect('http://rtm.thinx.cloud:80' + '/password.html?activation=' +
				ac_key +
				'&owner=' + ac_owner);
			return;
		}
	});
});

/* Used by the password.html page to perform the change in database. Should revoke reset_key when done. */
app.post("/api/user/password/set", function(req, res) {

	console.log("POST /api/user/password/set");

	var password1 = req.body.password;
	var password2 = req.body.rpassword;

	var request_owner = null;
	if (typeof(req.body.owner) !== undefined) {
		request_owner = req.body.owner;
	} else {
		console.log("Request has no owner for fast-search.");
	}

	console.log(JSON.stringify(req.body));

	if (password1 !== password2) {
		res.end(JSON.stringify({
			status: "password_mismatch",
			success: false
		}));
	} else {
		console.log("Passwords match....");
	}

	if (typeof(req.body.reset_key) !== "undefined") {

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

				if (body.rows.length === 0) {
					res.end(JSON.stringify({
						status: "user_not_found",
						success: false
					}));
				}

				// console.log(body);

				var userdoc = body.rows[0];

				// console.log("userdoc: " + JSON.stringify(userdoc));

				userdoc.doc.password = sha256(password1);
				userdoc.doc.last_reset = new Date();
				userdoc.doc.reset_key = null;

				userlib.destroy(userdoc.id, userdoc.doc._rev, function(err) {

					if (err) {
						console.log("Cannot destroy user on password-reset");
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
							console.log("Cannot insert user on password-reset");
							res.end(JSON.stringify({
								status: "user_not_saved",
								success: false
							}));
							return;
						} else {
							//res.redirect("http://rtm.thinx.cloud:80/");
							res.end(JSON.stringify({
								status: "password_reset_successful",
								success: true
							}));
							return;
						}
					});
				});
			}
		});

	} else if (typeof(req.body.activation) !== "undefined") {

		console.log("Performing new activation...");

		// Validate new activation
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

				if (body.rows.length === 0) {
					res.end(JSON.stringify({
						status: "user_not_found",
						success: false
					}));
					return;
				}

				console.log("Activating user: " + JSON.stringify(body));

				var userdoc = body.rows[0].doc;

				console.log("Updating user document: " + JSON.stringify(userdoc));

				userdoc.password = sha256(password1);
				userdoc.activation_date = new Date();
				// TODO: reset activation on success userdoc.activation = null;

				userlib.destroy(userdoc._id, userdoc._rev, function(err) {

					if (err) {
						console.log("Cannot destroy user on new activation.");
						res.end(JSON.stringify({
							status: "user_not_reset",
							success: false
						}));
						return;
					} else {
						console.log("Deleted " + userdoc._id + " revision " + userdoc._rev);
					}

					delete userdoc._rev; // should force new revision...

					userlib.insert(userdoc, userdoc.owner, function(err) {

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

	console.log("POST /api/user/password/reset");

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

		userlib.destroy(user._id, user._rev, function(err) {
			if (err) {
				console.log(err);
				res.end(JSON.stringify({
					success: false,
					status: "destroy_failed"
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
		}); // destroy
	}); // view
}); // post

/*
 *  User Profile
 */

// TODO: Implement user profile changes (what changes?)
// /user/profile POST
app.post("/api/user/profile", function(req, res) {

	console.log("POST /api/user/profile");
	console.log(JSON.stringify(req.body));

	if (!validateSecureRequest(req)) return;
	res.end(JSON.stringify({
		status: "not-implemented-yet"
	}));
});

// /user/profile GET
app.get("/api/user/profile", function(req, res) {

	console.log("GET /api/user/profile");
	console.log(JSON.stringify(req.body));

	// reject on invalid headers
	if (!validateSecureGETRequest(req)) return;

	// reject on invalid session
	if (!sess) {
		failureResponse(res, 405, "not allowed");
		console.log("/api/user/devices: No session!");
		return;
	}

	// reject on invalid owner
	var owner = null;
	if (req.session.owner || sess.owner) {
		if (req.session.owner) {
			console.log("assigning owner = req.session.owner;");
			owner = req.session.owner;
		}
		if (sess.owner) {
			console.log(
				"assigning owner = sess.owner; (client lost or session terminated?)"
			);
			owner = sess.owner;
		}

	} else {
		failureResponse(res, 403, "session has no owner");
		console.log("/api/user/devices: No valid owner!");
		return;
	}

	userlib.view("users", "owners_by_username", {
		"key": owner,
		"include_docs": true // might be useless
	}, function(err, body, fw) {

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
		}
		// TODO: Limit results for security
		var json = JSON.stringify(body);
		res.set("Connection", "close");
		res.end(json);
	});
});

/* Provides list of users’ devices. Should mangle certain secure data.
app.get("/api/user/devices", function(req, res) {

	console.log(req.toString());

	// reject on invalid headers
	if (!validateSecureRequest(req)) return;

	// reject on invalid session
	if (!sess) {
		failureResponse(res, 405, "not allowed");
		console.log("/api/user/devices: No session!");
		return;
	}

	// reject on invalid owner
	var owner = null;
	if (req.session.owner || sess.owner) {
		if (req.session.owner) {
			console.log("assigning owner = req.session.owner;");
			owner = req.session.owner;
		}
		if (sess.owner) {
			console.log(
				"assigning owner = sess.owner; (client lost or session terminated?)"
			);
			owner = sess.owner;
		}

	} else {
		failureResponse(res, 403, "session has no owner");
		console.log("/api/user/devices: No valid owner!");
		return;
	}

	devicelib.view("devicelib", "devices_by_owner", {
		"key": owner,
		"include_docs": false
	}, function(err, body) {

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
			console.log("Matching device of device owner " + rowData.key +
				" with alien user " + owner + " in " + rowData.toString());
			if (owner == rowData.key) {
				console.log("/api/user/devices: OWNER: " + JSON.stringify(rowData) +
					"\n");
				devices.push(rowData);
			} else {
				console.log("/api/user/devices: ROW: " + JSON.stringify(rowData) +
					"\n");
			}
		}
		var reply = JSON.stringify({
			devices: devices
		});
		console.log("/api/user/devices: Response: " + reply);
		res.set("Connection", "keep-alive"); // allow XHR request
		res.end(reply);
	});
});

//
// WORK ON ROAD. <-
//
*/

//
// Main Device API
//

// Device login/registration (no authentication, no validation, allows flooding so far)
app.post("/device/register", function(req, res) {

	var api_key = null;

	validateRequest(req, res);

	sess = req.session;

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

	var reg = req.body.registration;
	if (typeof(req.body.registration) == "undefined") {
		return;
	}

	rdict.registration = {};

	console.log(reg.toString());

	var mac = reg.mac;
	var fw = "unknown";
	if (!reg.hasOwnProperty("firmware")) {
		fw = "undefined";
	} else {
		fw = reg.firmware;
	}

	var hash = reg.hash;
	var push = reg.push;
	var alias = reg.alias;
	var owner = reg.owner; // cannot be changed, must match if set

	var success = false;
	var status = "ERROR";

	console.log(req.headers);

	// Headers must contain Authentication header
	if (typeof(req.headers.authentication) !== "undefined") {
		api_key = req.headers.authentication;
		console.log("API KEY in request: '" + api_key + "'");
	} else {
		console.log("ERROR: Registration requests now require API key!");
		res.end(JSON.stringify({
			success: false,
			status: "authentication"
		}));
	}

	console.log("Serching for owner: " + owner);

	userlib.view("users", "owners_by_username", {
		"key": owner,
		"include_docs": true // might be useless
	}, function(err, body) {

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
		}

		// Find user and match api_key
		var api_key_valid = false;
		var user_record = body.rows;

		// Should be only one record actually
		for (var index in user_record) {
			var user_data = user_record[index].doc;
			for (var kindex in user_data.api_keys) {
				var userkey = user_data.api_keys[kindex];
				if (userkey.indexOf(api_key) !== -1) {
					console.log("Found valid key.");
					api_key_valid = true;
					break;
				}
				if (api_key_valid === true) break;
			}
			if (api_key_valid === true) break;
		}

		// Bail out on invalid API key
		if (api_key_valid === false) {
			console.log("Invalid API key.");
			res.end(JSON.stringify({
				success: false,
				status: "authentication"
			}));
			return;
		}

		var isNew = true;

		// See if we know this MAC which is a primary key in db

		if (err) {
			console.log("Querying devices failed. " + err + "\n");
		} else {
			isNew = false;
		}

		var success = false;
		var status = "OK";

		var device_id = mac;
		var device_version = "1.0.0"; // default

		if (typeof(req.version) !== "undefined" && req.version !== null) {
			device_version = req.version;
		}

		// TODO: Find existing version by firmware hash (from envelope)
		//deploy.initWithDevice(...)
		//deploy.versionWithHash(hash)

		var firmware_url = "";
		var known_alias = "";
		var known_owner = "";

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
			push: push,
			alias: alias,
			owner: owner,
			version: device_version,
			device_id: device_id,
			lastupdate: new Date(),
			lastkey: api_key
		};

		console.log("Seaching for possible firmware update...");
		var deploy = require("./lib/thinx/deployment");
		deploy.initWithDevice(device);

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
			device.device_id = uuidV1();

			devicelib.insert(device, device.mac, function(err, body, header) {

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
					console.log(reg);
				}
				sendRegistrationOKResponse(res, rdict);
			});

		} else {

			console.log(reg);

			// KNOWN DEVICES:
			// - see if new firmware is available and reply FIRMWARE_UPDATE with url
			// - see if alias or owner changed
			// - otherwise reply just OK

			devicelib.get(mac, function(error, existing, fw) {
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
							console.log("Device updated.");
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

							// todo: sendRegistrationFailureResponse(res, rdict);
							sendRegistrationOKResponse(res, rdict);
						}
					});

				} else {
					console.log("GET:FAILED");
					reg.success = false;
					reg.status = "Get for update failed";
					// todo: sendRegistrationFailureResponse(res, rdict);
					sendRegistrationOKResponse(res, rdict);
				}
			});
		}
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
		console.log("☢ UA: " + ua + " invalid!");
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
	console.log("☢ UA: " + ua);
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

function validateSecureRequest(req, res) {
	// Only log webapp user-agent
	var ua = req.headers["user-agent"];
	console.log("☢ UA: " + ua);
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

//
// Databases
//

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

	nano.db.create("managed_repos", function(err, body, header) {
		if (err) {
			handleDatabaseErrors(err, "managed_repos");
		} else {
			console.log("» Repository database creation completed. Response: " +
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

//
// Builder
//

// Build respective firmware and notify target device(s)
app.post("/api/build", function(req, res) {

	sess = req.session;

	res.writeHead(200, {
		"Content-Type": "application/json"
	});

	if (validateRequest(req, res) === true) {

		var rdict = {};

		var build = req.body.build;
		var mac = build.mac; // should be optional only, used for paths now
		var udid = build.udid; // target device UDID
		var tenant = build.owner;
		var git = build.git;
		var dryrun = false;

		if (typeof(build.dryrun) != "undefined") {
			dryrun = build.dryrun;
		}

		if ((typeof(build) === "undefined" || build === null) ||
			(typeof(mac) === "undefined" || mac === null) ||
			(typeof(tenant) === "undefined" || tenant === null) ||
			(typeof(git) === "undefined" || git === null)) {
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

		buildCommand(build_id, tenant, mac, git, udid, dryrun);
	}
});

function buildCommand(build_id, tenant, mac, git, udid, dryrun) {

	console.log("Executing build chain...");

	var exec = require("child_process").exec;
	CMD = "./builder --tenant=" + tenant + " --udid=" + udid + " --git=" +
		git +
		" --id=" + build_id;

	if (typeof(mac) !== "undefined" && mac !== null) {
		CMD = CMD + " --mac=" + mac;
	}

	if (dryrun === true) {
		CMD = CMD + " --dry-run";
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

/** Tested with: !device_register.spec.js` */
app.get("/", function(req, res) {
	sess = req.session;
	console.log("owner: " + sess.owner);
	if (sess.owner) {
		res.redirect("http://rtm.thinx.cloud:80/app");
	} else {
		res.end("This is API ROOT."); // insecure
	}
});

app.version = function() {
	return v.revision();
};

app.listen(serverPort, function() {
	var package_info = require("./package.json");
	var product = package_info.description;
	var version = package_info.version;

	console.log("");
	console.log("-=[ ☢ " + product + " v" + version + " rev. " + app.version() +
		" ☢ ]=-");
	console.log("");
	console.log("» Started on port " + serverPort);
});

/*
 * Authentication
 */

// Used by web app
app.get("/api/logout", function(req, res) {
	console.log("/api/logout");
	req.session.destroy(function(err) {
		if (err) {
			console.log(err);
		} else {
			res.redirect("http://rtm.thinx.cloud/"); // HOME_URL (Apache)
		}
	});
});

// Front-end authentication, returns 5-minute session on valid authentication
app.post("/api/login", function(req, res) {
	console.log("/api/login");
	sess = req.session;

	console.log("Origin: " + req.headers.origin);

	var client_type = "webapp";
	var ua = req.headers["user-agent"];
	var validity = ua.indexOf(client_user_agent);

	if (validity === 0) {
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

	userlib.view("users", "owners_by_username", {
		"key": username,
		"include_docs": true // might be useless
	}, function(err, body) {

		if (err) {
			console.log("Error: " + err.toString());

			// Did not fall through, goodbye...
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
				if (password == sha256(user_data.value)) {
					req.session.owner = user_data.key;
					// TODO: write last_seen timestamp to DB here __for devices__
					console.log("client_type: " + client_type);
					if (client_type == "device") {
						res.end(JSON.stringify({
							status: "WELCOME"
						}));
						return;
					} else if (client_type == "webapp") {
						res.end(JSON.stringify({
							"redirectURL": "http://rtm.thinx.cloud:80/app"
						}));
						return;
					}
					// TODO: If user-agent contains app/device... (what?)
					return;
				} else

				if (password == user_data.value) {
					req.session.owner = user_data.key;
					// TODO: write last_seen timestamp to DB here __for devices__
					console.log("client_type: " + client_type);
					if (client_type == "device") {
						res.end(JSON.stringify({
							status: "WELCOME"
						}));
						return;
					} else if (client_type == "webapp") {
						res.end(JSON.stringify({
							"redirectURL": "http://rtm.thinx.cloud:80/app"
						}));
						return;
					}
					// TODO: If user-agent contains app/device... (what?)
					return;


				} else {
					console.log("Password mismatch for " + username);
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
				// or res.end(JSON.stringify({ redirectURL: "https://rtm.thinx.cloud:80/app" }));
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

/*
// Prevent crashes on uncaught exceptions
process.on("uncaughtException", function(err) {
	console.log("Caught exception: " + err);
});
*/
