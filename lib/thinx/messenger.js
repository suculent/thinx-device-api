/** This THiNX-RTM API module is responsible for managing MQTT communication. */

var Messenger = (function() {

	//
	// • Should be able to send a message to device using MQTT, internally provide path and authentication.
	// • Should use own MQTT password.
	// • ACLs/role needs to be adjusted for messenger to work globally.
	// • There should be therefore one Messenger instance per owner.
	// • Messenger will fetch device list based on the owner.
	// • Will provide topic-based (should support regex) subscription callback.
	//

	var Rollbar = require("rollbar");

	var rollbar = new Rollbar({
		accessToken: "5505bac5dc6c4542ba3bd947a150cb55",
		handleUncaughtExceptions: true,
		handleUnhandledRejections: true
	});

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var broker = app_config.mqtt_server;
	var devicelib = require("nano")(db).use("managed_devices");
	var userlib = require("nano")(db).use("managed_users");

	var mqtt = require("mqtt");
	var clients = {};

	// FIXME: password should be generated and stored securely
	clients.messenger = mqtt.connect([{
		host: broker,
		port: 1883,
		username: "messenger",
		password: "5ec1fdd8-5d68-11e7-b0e3-4c327591230d"
	}]);

	//var sha256 = require("sha256");
	//var uuidV1 = require("uuid/v1");
	//var fs = require("fs");

	var apikey = require("./apikey");
	var redis = require("redis");
	var client = redis.createClient();

	// useless so far

	var _private = {
		_owner: null,
		_devices: null
	};

	// public
	var _public = {

		init: function() {
			_public.getAllDevices(function(success, devices) {
				if (success) {
					for (var din in devices) {
						var oid = devices[din][0];
						var udid = devices[din][1];
					}
				}
			});
		},

		initWithOwner: function(owner, socket, callback) {

			// Fetch all devices for owner

			_private._owner = owner; // useless

			_public.getDevices(owner, function(success, devices) {

				if (success) {

					_private._devices = devices; // use to fetch aliases by device id!
					_devices = devices;

					// Fetch MQTT authentication for owner
					_public.apiKeyForOwner(owner, function(success, apikey) {

						if (!success) {
							console.log("MQTT: API key fetch failed.");
						}

						// Connect and set callbacks (should use QoS 2 but that's not supported to all clients)
						clients[owner] = mqtt.connect([{
							host: broker,
							port: 1883,
							qos: 1,
							username: owner,
							password: apikey
						}]);

						clients[owner].on("connect", function(error) {

							console.log("Messenger: connected for owner " + owner);

							//clients[owner].subscribe("/thinx/announcements");
							clients[owner].subscribe("/" + owner + "/shared");
							clients[owner].subscribe("/" + owner + "/#");

							for (var i = _devices.length - 1; i >= 0; i--) {
								var udid = _devices[i];
								var device_topic = "/" + owner + "/" + udid;
								clients[owner].subscribe(device_topic);
								var status_topic = "/" + owner + "/" + udid + "/status";
								clients[owner].subscribe(status_topic);
							}

							clients[owner].publish("/thinx/announcements",
								"Messenger connected.");
							if (error.returnCode !== 0) {
								callback(false, error);
							} else {
								callback(true, error);
							}
						});

						clients[owner].on("reconnect", function() {
							console.log("MQTT: reconnect");
						});

						clients[owner].on("error", function(error) {
							console.log("MQTT: error " + error);
							callback(false, error);
						});

						clients[owner].on("message", function(topic, message) {

							if (message.toString().length === 0) return;

							console.log("MQTT Message: " + message.toString());

							var origins = topic.split("/");
							var oid = origins[1];
							var did = origins[2];

							//clients[owner].end()

							if (typeof(socket) !== "undefined") {

								if (typeof(message.status) !== "undefined") {

									if (message.status == "connected") {
										var notification_in = {
											notification: {
												title: "Check-in",
												body: "Device " + did + " checked-in.",
												type: "info"
											}
										};
										console.log("Forwarding Connect to socket...");
										socket.send(JSON.stringify(notification_in));
									} else if (message.status == "disconnected") {
										var notification_out = {
											notification: {
												title: "Check-out",
												body: "Device " + did + " disconnected.",
												type: "warning"
											}
										};
										console.log("Forwarding Disconnect to socket...");
										socket.send(JSON.stringify(notification_out));
									}

								} else if (typeof(message.connected) !== "undefined") {

									var status = message.connected ? "Connected" :
										"Disconnected";

									if (message.connected === true) {
										var notification_cc = {
											notification: {
												title: "Device Connected",
												body: oid,
												type: "info"
											}
										};
										socket.send(JSON.stringify(notification_cc));
									} else {
										var notification_dc = {
											notification: {
												title: "Device Disconnected",
												body: oid,
												type: "warning"
											}
										};
										socket.send(JSON.stringify(notification_dc));
									}

								} else if (typeof(message.response_type) !== "undefined") {

									// In case the message has "response", it is for device
									// otherwise it is from device.

									var messageFromDevice = (typeof(message.response) ===
										"undefined") ? true : false;

									if (messageFromDevice) {

										var actionable = {
											notification: {
												nid: did,
												title: "Device Interaction",
												body: message.body,
												response_type: response_type,
												type: "actionable"
											}
										};

										// Actionable notifications
										client.get("nid:" + did, function(err, json_keys) {

											if (!err) {
												// This actually IS an error, because nid should have not existed.
												console.log("Actionable notification " + nid +
													" already exists.");
												return;
											}

											// Send actionable notification to the web...
											socket.send(JSON.stringify(actionable));

											// Attach reply-to topic and store to Redis
											actionable.topic = topic; // reply-to
											actionable.done = false; // user did not respond yet
											client.set("nid:" + did, JSON.stringify(actionable),
												function(err) {
													if (err) {
														console.log("MQTT Action Save Error: " + err);
													}
												});
										});

									} else {

										// Message for device
										var nid = message.nid;

										console.log("NID message for device :" + nid + " : " +
											JSON.stringify(message));

										// Search existing transaction
										client.get("nid:" + did, function(err, json_keys) {
											var nid_data = JSON.parse(json_keys);

											if (!err) {
												// NID transaction already exists, update data...
												nid_data.done = true;
												nid_data.response = message.response;
												nid_data.response_type = message.response_type;
											} // if err this is new transaction

											client.set("nid:" + did, JSON.stringify(nid_data),
												function(err) {
													if (err) {
														console.log("MQTT Action Save Error: " + err);
													}
												});
										});
									}

								} else {

									console.log("Forwarding Unknown message to socket...");
									var notification_unknown = {
										notification: {
											title: "Notification",
											body: message,
											type: "info"
										}
									};
									socket.send(JSON.stringify(notification_unknown));
								}
							} else {
								console.log("Forwarding websocket undefined.");
							}
						});
					});

				} else {
					console.log(
						"Error initializing messenger when getting devices for owner " +
						owner);
				}
			});
		},

		getDevices: function(owner, callback) {
			devicelib.view("devicelib", "devices_by_owner", {
					"key": owner,
					"include_docs": false
				},
				function(err, body) {

					if (err) {
						if (err.toString() == "Error: missing") {
							callback(false, "none");
						}
						console.log("/api/user/devices: Error: " + err.toString());
						return;
					}

					var rows = body.rows; // devices returned
					var devices = [];
					for (var row in rows) {
						var rowData = rows[row];
						var device = rowData.value;
						console.log("Device: " + JSON.stringify(device));
						var topic = "/" + owner + "/" + device.udid;
						devices.push(topic);
					}
					callback(true, devices);
				});
		},

		// This might be significant performance issue (first if this kind), we'll need to page this and possibly extract to different app on different server!
		getAllOwners: function(callback) {
			userlib.view("userlib", "owners_by_id", {
					"include_docs": false
				},
				function(err, body) {
					if (err) {
						if (err.toString() == "Error: missing") {
							callback(false, "none");
						}
						console.log("/api/user/devices: Error: " + err.toString());
						return;
					}
					var rows = body.rows; // devices returned
					var devices = [];
					for (var row in rows) {
						var rowData = rows[row];
						var device = rowData.value;
						devices.push([device.owner, device.udid]);
					}
					callback(true, devices);
				});
		},

		// Fetch API key from Redis, should be the MQTT API key...
		apiKeyForOwner: function(owner, callback) {
			apikey.list(owner, function(success, keys) {
				if (success) {
					callback(true, keys[0]); // using first API key by default until we'll have initial API key based on user creation.
				} else {
					callback(success, keys);
				}
			});
		},

		// Send a message to device
		publish: function(owner, udid, message) {

			if (typeof(client[owner]) === "undefined") {
				console.log("No MQTT client for owner! : " + owner);

			} else {

				var mqtt_topic = "/" + owner + "/" + udid;

				// Check for actionable notifications and pick up transaction from Redis
				if (typeof(message.nid) !== "undefined") {
					var nid = "nid:" + message.nid;
					var reply = message.reply;
					message.topic = mqtt_topic;
					message.done = true; // user already responded; never notify again...
					client.set(nid, JSON.stringify(message), function(err) {
						if (err) {
							console.log(err);
						}
					});

					// In case the notification contains 'nid'; send only 'reply' and delete this nid from redis.
					client[owner].publish(mqtt_topic, message);
				}
			}
		}
	};

	return _public;

})();

exports.initWithOwner = Messenger.initWithOwner;
exports.getDevices =
	Messenger.getDevices;
exports.getAllOwners = Messenger.getAllOwners;
exports.apiKeyForOwner =
	Messenger.apiKeyForOwner;
exports.publish = Messenger.publish;
