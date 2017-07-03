/** This THiNX-RTM API module is responsible for device transfer management. */

var Transfer = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var devicelib = require("nano")(db).use("managed_devices");
	var userlib = require("nano")(db).use("managed_users");
	var sha256 = require("sha256");
	var redis = require("redis");
	var client = redis.createClient();

	var fs = require("fs");
	var exec = require("child_process");
	var mkdirp = require('mkdirp');
	var Emailer = require('email').Email;

	var alog = require("./audit");
	var device = require("./device");

	var uuidV1 = require("uuid/v1");

	var Rollbar = require('rollbar');

	var rollbar = new Rollbar({
		accessToken: '5505bac5dc6c4542ba3bd947a150cb55',
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	// public
	var _public = {
		request: function(owner, body, callback) {

			// body should look like { "to":"some@email.com", "udids" : [ "some-udid", "another-udid" ] }

			if (typeof(body.to) === "undefined") {
				callback(false, "missing_recipient");
				return;
			}

			if (typeof(body.udids) === "undefined") {
				callback(false, "missing_subject");
				return;
			}

			var recipient_id = sha256(body.to);

			userlib.get(recipient_id, function(err, recipient) {

				// 1. sha(256) of "to" should end up with a valid "recipient"
				if (err) {
					callback(false, JSON.stringify(err));
					console.log("Transfer target " + body.to + " id " + recipient_id +
						"not found?");
					return;
				}

				// 2. add recipient to body as "from"
				body.from = recipient.email;

				// 2. add recipient to body as "from"

				// 3. store as "dt:uuid()" to redis
				var transfer_uuid = uuidV1(); // used for email
				var transfer_id = "dt:" + transfer_uuid;

				client.set(transfer_id, JSON.stringify(body), function(err, result) {

					if (err) {
						console.log("Transfer redis save error: " + err);
						callback(false, "transfer_ticket_save_error");
						return;
					}

					// 4. respond with success/failure to the request
					callback(true, "transfer_requested");

					var htmlDeviceList = "<p><ul>";
					for (var dindex in body.udids) {
						htmlDeviceList += "<li>" + body.udids[dindex] + "</li>";
					}
					htmlDeviceList += "</ul></p>";

					var plural = "";
					if (body.udids.length > 1) {
						plural = "s";
					}

					// 5. send an e-mail to the recipient with request outline and links to accept
					var recipientTransferEmail = new Emailer({
						bodyType: "html",
						from: "api@thinx.cloud",
						to: body.to,
						subject: "Device transfer requested",
						body: "<!DOCTYPE html><p>Hello " + body.to + ".</p>" +
							"<p> User with e-mail " + body.from +
							" is transferring following device" + plural + " to you:</p>" +
							htmlDeviceList +
							"<p>You may " +
							"<a href='https://rtm.thinx.cloud:7443/api/transfer/accept/?tid=" +
							transfer_uuid + "'>Accept</a> or" +
							"<a href='https://rtm.thinx.cloud:7443/api/transfer/decline/?tid=" +
							transfer_uuid + "'>Decline</a> this offer.</p>" +
							"</html>"
					});

					console.log("Sending transfer e-mail to recipient: " + JSON.stringify(
						recipientTransferEmail));

					recipientTransferEmail.send(function(err) {
						if (err) {
							console.log(err);
							callback(false, err);
						} else {
							console.log("Recipient transfer e-mail sent.");
							if (body.to == "cimrman@thinx.cloud") {
								callback(true, user.transfer_id);
							} else {
								callback(true, "email_sent");
							}
						}
					});

					var senderTransferEmail = new Emailer({
						bodyType: "html",
						from: "api@thinx.cloud",
						to: body.from,
						subject: "Device transfer requested",
						body: "<!DOCTYPE html><p>Hello " + body.to + ".</p>" +
							"<p> You have requested to transfer following devices to " +
							body.to +
							":</p>" +
							htmlDeviceList +
							"<p>You will be notified when your offer will be accepted or declined.</p>" +
							"</html>"
					});

					console.log("Sending transfer e-mail to sender: " + JSON.stringify(
						senderTransferEmail));

					senderTransferEmail.send(function(err) {
						if (err) {
							console.log(err);
							callback(false, err);
						} else {
							console.log("Sender transfer e-mail sent.");
							if (body.to == "cimrman@thinx.cloud") {
								callback(true, transfer_id);
							} else {
								callback(true, "email_sent");
							}
						}
					});
				});
			});
		},

		accept: function(body, callback) {

			// minimum body should look like { "transfer_id":"uuid" }
			// optional body should look like { "transfer_id":"uuid", "udids" : [ ... ] }

			if (typeof(body.transfer_id) === "undefined") {
				callback(false, "missing_transfer_id");
				return;
			}

			console.log("[transfer][accept] body: " + JSON.stringify(body));

			var transfer_id = body.transfer_id;
			var udids = null;

			// Possibly partial transfer but we don't know until count
			if (typeof(body.udids) !== "undefined") {
				udids = body.udids;
			}

			var dtid = "dt:" + transfer_id;

			client.get(dtid, function(err, json_keys) {

				if ((typeof(body.list) !== "undefined") && body.list === true) {
					callback(true, json_keys);
					return;
				}

				if (udids.length === 0) {
					// perform on all devices if udids not given
					udids = json_keys.udids;
				}

				var expiry = 3600; // 1 hour to let user accept/decline different devices

				if (err) {
					console.log("[transfer] transfer_id not found.");
					callback(false, "transfer_id_invalid");
					return;
				}

				var recipient_email = json_keys.to;
				var recipient = sha256(recipient_email);
				var original_owner_email = json_keys.from;
				var original_owner = sha256(original_owner_email);

				// Check if there are some devices left
				if (json_keys.udids.length === 0) {
					callback(true, "transfer_completed");
					client.expire(dtid, 0);
					return;
				}

				console.log("Accept transfer " + transfer_id);

				alog.log(original_owner, "Accepting device transfer: " +
					transfer_id +
					" for devices: " + JSON.stringify(udids));
				alog.log(recipient, "Accepting device transfer: " + transfer_id +
					" for devices: " + JSON.stringify(udids));

				console.log("[OID:" + recipient + "] [TRANSFER_ACCEPT] " + JSON.stringify(
					udids));

				var responseCallback = function(status, message) {
					console.log("Transfer result - status:" + status +
						" message: " +
						message);
				};

				for (var dindex in udids) {
					var udid = udids[dindex];
					device.edit(original_owner, {
						udid: udid,
						owner: recipient
					}, responseCallback);
					delete json_keys.udids[udid];
				}

				// Store remaining (not accepted) keys
				client.set(dtid, json_keys, function(err, response) {
					if (err) {
						callback(false, err);
					} else {
						if (json_keys.udids.length > 0) {
							callback(true, "transfer_partially_completed");
							client.expire(dtid, expiry);
						} else {
							callback(true, "transfer_completed");
							client.expire(dtid, 0);
						}
					}
				});
			});
		},

		decline: function(body, callback) {

			// minimum body should look like { "transfer_id":"uuid" }
			// optional body should look like { "transfer_id":"uuid", "udids" : [ ... ] }

			if (typeof(body.transfer_id) === "undefined") {
				callback(false, "missing_transfer_id");
				return;
			}

			console.log("[transfer][decline] body: " + JSON.stringify(body));

			var transfer_id = body.transfer_id;
			var udids = null;

			// Possibly partial transfer but we don't know until count
			if (typeof(body.udids) !== "undefined") {
				udids = body.udids;
			}

			var dtid = "dt:" + transfer_id;
			client.get(dtid, function(err, json_keys) {

				if (udids.length === 0) {
					// perform on all devices if udids not given
					udids = json_keys.udids;
				}

				var expiry = 3600; // 1 hour to let user accept/decline different devices

				if (err) {
					console.log("[transfer] transfer_id not found.");
					callback(false, "transfer_id_invalid");
					return;
				}

				var recipient_email = json_keys.to;
				var recipient = sha256(recipient_email);
				var original_owner_email = json_keys.from;
				var original_owner = sha256(original_owner_email);

				// Check if there are some devices left
				if (json_keys.udids.length === 0) {
					callback(true, "transfer_completed");
					client.expire(dtid, 0);
					return;
				}

				console.log("Decline transfer " + transfer_id);

				alog.log(original_owner, "Declining device transfer: " +
					transfer_id +
					" for devices: " + JSON.stringify(udids));
				alog.log(recipient, "Declining device transfer: " + transfer_id +
					" for devices: " + JSON.stringify(udids));

				console.log("[OID:" + recipient + "] [TRANSFER_DECLINE] " + JSON
					.stringify(
						udids));

				var responseCallback = function(status, message) {
					console.log("Transfer result - status:" + status +
						" message: " +
						message);
				};

				for (var dindex in udids) {
					var udid = udids[dindex];
					delete json_keys.udids[udid];
				}

				// Store remaining (not declined) keys
				client.set(dtid, json_keys, function(err, response) {
					if (err) {
						callback(false, err);
					} else {
						if (json_keys.udids.length > 0) {
							callback(true, "transfer_partially_completed");
							client.expire(dtid, expiry);
						} else {
							callback(true, "transfer_completed");
							client.expire(dtid, 0);
						}

					}
				});
			});
		}

	};

	return _public;

})();

exports.request = Transfer.request;
exports.accept = Transfer.accept;
exports.decline = Transfer.decline;
