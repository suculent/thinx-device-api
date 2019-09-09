/** This THiNX-RTM API module is responsible for device transfer management. */

var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

var mailgun = require('mailgun-js')({apiKey: app_config.mailgun.api_key, domain: app_config.mailgun.domain});

var db = app_config.database_uri;
var fs = require("fs-extra");

var userlib = require("nano")(db).use(prefix + "managed_users");
var sha256 = require("sha256");
var redis = require("redis");

var alog = require("./audit");
var device = require("./device");
var devices = require("./devices");
var deploy = require("./deployment");

var uuidV1 = require("uuid/v1");

module.exports = class Transfer {

	constructor() {
		this.client = redis.createClient(Globals.redis_options());
	}

	// migration

	transfer_valid(encoded_json_keys, callback) {

		var json_keys = JSON.parse(encoded_json_keys);

		if (err) {
			console.log("[transfer] transfer_id not found.");
			callback(false, "transfer_id_invalid");
			return false;
		}

		if (json_keys === null) {
			console.log("[transfer] No udids remaining, expiring record...");
			this.client.expire(dtid, 1);
			callback(true, "transfer_completed");
			return false;
		}

		console.log("json_keys: " + JSON.stringify(json_keys));

		if ((typeof(body.list) !== "undefined") && body.list === true) {
			callback(true, json_keys);
			return false;
		}

		return true; // no callback called, continue with transfer...
	}

  migrate_device(original_owner, xudid, recipient) {

		device.edit(original_owner, {
			udid: xudid,
			owner: recipient,
			previous_owner: original_owner
		}, function(){});

		delete json_keys.udids[xudid];

		// Move all data:
		const original_path = deploy.pathForDevice(original_owner, xudid);
		const destination_path = deploy.pathForDevice(recipient, xudid);
		rename(original_path, destination_path);
		console.log("[transfer] Device builds artefacts transfer ended.");

		// Move all repositories/move sources

		if (body.mig_sources === true) {
			var old_sources_path = original_path.replace(app_config.deploy_root, app_config.build_root);
			var new_sources_path = destination_path.replace(app_config.deploy_root, app_config.build_root);
			console.log("Should rename " + old_sources_path + " to " + new_sources_path);
			rename(old_sources_path, new_sources_path);

			const usid = device.source;
			move_source(usid, original_owner, recipient);
			attach_source(target_owner, usid, xudid);
		}

		// Move all repositories:
		if (body.api_keys === true) {
			// #THX-396: Migrate API Keys from original owner to recipient in Redis!"
			// get device, fetch its API Key hash, find this in Redis and migrate to another user
			migrate_api_keys(original_owner, target_owner, xudid);
		} // end device fetch
	}

	migrate_api_keys(original_owner, recipient, xudid) {

		var source_id = "ak:" + original_owner;
		var recipient_id = "ak:" + recipient;

		devices.get(xudid, function(success, dev) {
			if (!success) callback(false, "api_key_transfer_failed");
			const last_key_hash = dev.lastkey;

			// Get source keys
			this.client.get(source_id, function(err1, json_keys) {
				if (err1) callback(false, err1);
				var json_array = JSON.parse(json_keys);
				var delete_this = null;
				var migrate_this = null;
				for (var ai in json_array) {
					var item = json_array[ai];
					if (sha256(item) == last_key_hash) {
						delete_this = ai;
						migrate_this = item;
					}
				}

				// Get recipient keys
				this.client.get(recipient_id, function(err2, recipient_keys) {
					if (err2) callback(false, err2);
					var recipient_array = JSON.parse(recipient_keys);
					if (delete_this) {
						recipient_array.push(migrate_this);
						delete json_array[delete_this];
					}
					// Save array with respective API Key removed
					this.client.set(source_id, JSON.stringify(json_array), function(err3, removal_response) {
						if (err3) callback(false, err3);
						// Save new array with respective API Key added
						this.client.set(recipient_id, JSON.stringify(recipient_array), function(err4, transfer_response) {
							if (err4) {
								callback(false, err4);
								return;
							}
							callback(true, "api_key_migrated"); // ??
						});
					});
				});

			}); // this.client.get

		}); // devices.get

	} // end migrate_api_keys

	rename(from, to) {
		fs.rename(from, to, function(err) {
			if (err) {
				console.log(err);
			}
		});
	}

	move_source(usid, original_owner, target_owner) {

		userlib.get(original_owner, function(err1, abody) {

			if (err1) {
				callback(false, err1);
				return;
			}

			userlib.get(target_owner, function(err2, bbody) {

				if (err2) {
					callback(false, err2);
					return;
				}

				var osources = abody.sources;
				var tsources = bbody.sources;
				tsources[usid] = osources[usid];

				delete osources[usid];

				userlib.atomic("users", "edit", abody._id, {
					sources: tsources
				}, function(error, response) {
					if (error) {
						console.log("Source transfer failed: " + error);
					} else {
						alog.log(abody._id, "Source transfer succeeded.");
					}
				});

			});
		});
	}

	attach_source(target_owner, usid, udid) {
		devices.attach(target_owner, {
			source_id: usid,
			udid: udid
		}, function(success, response) {
			if (!success) {
				console.log("Migration error:" + response);
			}
			if (response) {
				console.log("Migration response:" + response);
			}
		});
	}


	// public

	request(owner, body, callback) {

		// body should look like { "to":"some@email.com", "udids" : [ "some-udid", "another-udid" ] }

		// THX-396

		// when true, sources will be COPIED to new owner as well
		if (typeof(body.mig_sources) === "undefined") {
			body.mig_sources = false;
		}

		// when true, API Keys will be TRANSFERRED:
		// - MQTT combination udid/apikey does not change
		// - API Keys are deleted from sender and added to recipient
		if (typeof(body.mig_apikeys) === "undefined") {
			body.mig_apikeys = false;
		}

		// Generic Check
		if (typeof(body.to) === "undefined") {
			callback(false, "missing_recipient");
			return;
		}

		if (typeof(body.udids) === "undefined") {
			callback(false, "missing_subject");
			return;
		}

		var recipient_id = sha256(prefix + body.to);

		function exit_on_transfer(udid, result_callback) {
			this.client.get("dtr:" + udid, function(err, reply) {
				if (!err) {
					result_callback(false);
				}
			});
		}

		var result = true;

		function result_callback(status) {
			result = status;
		}

		// check whether this device is not transferred already
		for (var udid in body.udids) {
			exit_on_transfer(udid, result_callback);
		}

		// When the loop above completes (we should give it a time...)
		// `result` should stay true otherwise there's already
		// transfer in progress.

		if (result === false) {
			callback(false, "transfer_already_in_progress");
			return;
		}

		// gives 5 secs to process exit_on_transfer callbacks

		setTimeout(function() {

			userlib.get(owner, function(err, ownerdoc) {

				if (err) {
					callback(false, "owner_unknown");
					return;
				}

				userlib.get(recipient_id, function(err, recipient) {

					if (err) {
						callback(false, "recipient_unknown");
						console.log("Transfer target " + body.to + " id " + recipient_id +
							"not found?");
						return;
					}

					// 2. add recipient to body as "from"
					body.from = ownerdoc.email;

					// 2. add recipient to body as "from"

					// 3. store as "dt:uuid()" to redis
					var transfer_uuid = uuidV1(); // used for email
					var transfer_id = "dt:" + transfer_uuid;

					this.client.set(transfer_id, JSON.stringify(body), function(err, result) {

						if (err) {
							console.log("Transfer redis save error: " + err);
							callback(false, "transfer_ticket_save_error");
							return;
						}

						// 4. respond with success/failure to the request
						callback(true, "transfer_requested");

						function store_pending_transfer(udid) {
							this.client.set("dtr:" + udid, transfer_id);
							this.client.expire("dtr:" + udid, 86400); // expire pending transfer in one day...
						}

						for (var udid in body.udids) {
							store_pending_transfer(udid);
						}

						var htmlDeviceList = "<p><ul>";
						for (var dindex in body.udids) {
							htmlDeviceList += "<li>" + body.udids[dindex] + "</li>";
						}
						htmlDeviceList += "</ul></p>";

						var plural = "";
						if (body.udids.length > 1) {
							plural = "s";
						}

						var recipientTransferEmail = {
							from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
							to: body.to,
							subject: "Device transfer requested",
							text: "<!DOCTYPE html><p>Hello " + body.to + ".</p>" +
								"<p> User with e-mail " + body.from +
								" is transferring following device" + plural + " to you:</p>" +
								htmlDeviceList +
								"<p>You may " +
								"<a href='" + app_config.public_url + ":7443/api/transfer/accept?transfer_id=" +
								transfer_uuid + "'>Accept</a> or" +
								"<a href='" + app_config.public_url + ":7443/api/transfer/decline?transfer_id=" +
								transfer_uuid + "'>Decline</a> this offer.</p>" +
								"</html>"
						};

						console.log("Sending transfer e-mail to sender: " + JSON.stringify(
							recipientTransferEmail));

						mailgun.messages().send(recipientTransferEmail, function (error, body) {
							if (error) {
								console.log(error);
								callback(false, error);
							} else {
								console.log("Recipient transfer e-mail sent.");
							}
							console.log(body);
						});

						var senderTransferEmail = {
							from: 'THiNX API <api@' + app_config.mailgun.domain + '>',
							to: body.from,
							subject: "Device transfer requested",
							text: "<!DOCTYPE html><p>Hello " + body.from + ".</p>" +
								"<p> You have requested to transfer following devices to " +
								body.to +
								":</p>" +
								htmlDeviceList +
								"<p>You will be notified when your offer will be accepted or declined.</p>" +
								"</html>"
						};

						console.log("Sending transfer e-mail to sender: " + JSON.stringify(
							senderTransferEmail));

						mailgun.messages().send(senderTransferEmail, function (error, body) {
							if (error) {
								console.log(error);
								callback(false, error);
							} else {
								console.log("Sender transfer e-mail sent.");
								if (body.to == "cimrman@thinx.cloud") {
									callback(true, transfer_id);
								} else {
									callback(true, "email_sent");
								}
							}
							console.log(body);
						});

					});
				});
			});
		}, 5000);
	}

	accept(body, callback) {

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

		console.log("[transfer] Fetching Device-Transfer ID: " + dtid);

		this.client.get(dtid, function(err, encoded_json_keys) {

			var json_keys = JSON.parse(encoded_json_keys);

			if (!transfer_valid(encoded_json_keys, callback)) return;

			// perform on all devices if udids not given
			if (udids.length === 0) udids = json_keys.udids;

			var expiry = 3600; // 1 hour to let user accept/decline different devices
			var recipient_email = json_keys.to;

			if (typeof(recipient_email) === "undefined" || recipient_email === null) {
				callback(false, "recipient_to_must_be_set");
				return;
			}

			console.log("[transfer] Searching 'to' recipient in: " + json_keys);
			console.log("[transfer]recipient_email: " + recipient_email);
			var recipient = sha256(prefix + recipient_email);
			var original_owner_email = json_keys.from;

			if ( (typeof(original_owner_email) === "undefined") || (original_owner_email === null) ) {
				callback(false, "originator_from_must_be_set");
				return;
			}

			var original_owner = sha256(prefix + original_owner_email);

			// Check if there are some devices left
			if (json_keys.udids.length === 0) {
				this.client.expire(dtid, 1);
				for (var udid in udids) {
					this.client.expire("dtr:" + udid, 1);
				}
				callback(true, "transfer_completed");
				return;
			}

			console.log("[transfer]Accept transfer " + transfer_id);

			alog.log(original_owner, "Accepting device transfer: " +
				transfer_id + " for devices: " + JSON.stringify(udids));
			alog.log(recipient, "Accepting device transfer: " + transfer_id +
				" for devices: " + JSON.stringify(udids));

			console.log("[OID:" + recipient + "] [TRANSFER_ACCEPT] " + JSON.stringify(
				udids));

			for (var dindex in udids) {
				migrate_device(original_owner, udids[dindex], recipient);
			}

			// Store remaining (not accepted) keys
			this.client.set(dtid, JSON.stringify(json_keys), function(err, response) {
				if (err) {
					callback(false, err);
				} else {
					if (json_keys.udids.length > 1) {
						callback(true, "transfer_partially_completed");
						this.client.expire(dtid, expiry);
					} else {
						callback(true, "transfer_completed");
						this.client.expire(dtid, 1);
					}
				}
			});

		});
	}

	decline(body, callback) {

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
		this.client.get(dtid, function(err, json_keys) {

			if (udids.length === 0) {
				// perform on all devices if udids not given
				udids = json_keys.udids;
			}

			if (err) {
				console.log("[transfer] transfer_id not found.");
				callback(false, "transfer_id_invalid");
				return;
			}

			var recipient_email = json_keys.to;
			var recipient = sha256(prefix + recipient_email);
			var original_owner_email = json_keys.from;
			var original_owner = sha256(prefix + original_owner_email);

			// Check if there are some devices left
			if (json_keys.udids.length === 0) {
				callback(true, "transfer_completed");
				this.client.expire(dtid, 1);
				return;
			}

			console.log("Decline transfer " + transfer_id);

			alog.log(original_owner, "Declining device transfer: " +
				transfer_id +
				" for devices: " + JSON.stringify(udids), "warning");
			alog.log(recipient, "Declining device transfer: " + transfer_id +
				" for devices: " + JSON.stringify(udids), "warning");

			console.log("[OID:" + recipient + "] [TRANSFER_DECLINE] " + JSON
				.stringify(
					udids));

			for (var dindex in udids) {
				var udid = udids[dindex];
				delete json_keys.udids[udid];
			}

			// Store remaining (not declined) keys
			this.client.set(dtid, JSON.stringify(json_keys), function(err, response) {
				if (err) {
					callback(false, err);
				} else {
					if (json_keys.udids.length > 1) {
						callback(true, "transfer_partially_completed");
						this.client.expire(dtid, 3600); // 1 hour to let user accept/decline different devices
					} else {
						callback(true, "transfer_completed");
						this.client.expire(dtid, 1);
					}

				}
			});
		});
	}

};
