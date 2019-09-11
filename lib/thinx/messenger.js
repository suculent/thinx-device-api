/** This THiNX-RTM API module is responsible for managing MQTT communication. */

var GRQ = require('get-random-quote');
var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();
var db = app_config.database_uri;
var dateFormat = require("dateformat");
var mqtt = require("mqtt");

var devicelib = require("nano")(db).use(prefix + "managed_devices");
var userlib = require("nano")(db).use(prefix + "managed_users");

var base64 = require("base-64");

var ApiKey = require("./apikey"); var apikey = new ApiKey();
var Device = require("./device"); var device = new Device();

const { RTMClient, WebClient } = require('@slack/client');

module.exports = class Messenger {

	//
	// • Sends a message to device using MQTT, internally provides path and authentication.
	// • Each user should use own MQTT password/apikey.
	// • ACLs/role needs to be adjusted for messenger to work globally.
	// • There should be one Messenger instance per owner.
	// • Messenger fetches device list based on the owner.
	// • Provides topic-based (should support regex) subscription callback.
	//

	constructor() {

		var redis = require("redis");
		this.client = redis.createClient(Globals.redis_options());

		this.master = null;
		this.socket = null;
		this.channel = null;
		this.clients = {};
		this.webclient = null;
		this.rtm = null;

		this._private = {
			_owner: null,
			_devices: null,
			_socket: null
		};

		this.init();
	}

	publish(owner, udid, message) {
		if (typeof(this.client[owner]) === "undefined") {
			this.apiKeyForOwner(owner, (success, apikey) => {
				this.clients[owner] = mqtt.connect(app_config.mqtt.server, {
					host: app_config.mqtt.server,
					port: app_config.mqtt.port,
					username: owner,
					password: apikey.key
				});
				console.log("[publish] Created new MQTT client for owner: " + owner);
				console.log("[publish] Calling recursively after fetching API Key and setting new client...");
				this.publish(owner, udid, message);

			});
			return;
		}

		var mqtt_topic = "/" + owner + "/" + udid;

		// Check for actionable notifications and pick up transaction from Redis
		// In case the notification contains 'nid'; send only 'reply' and delete this nid from redis.
		if (typeof(message.nid) !== "undefined") {
			var nid = "nid:" + message.nid;
			message.topic = mqtt_topic;
			message.done = true; // user already responded; never notify again...
			this.client.set(nid, JSON.stringify(message), (err) => {
				if (err) {
					console.log(err);
				}
			});
		}
		this.client[owner].publish(mqtt_topic, message);
	}

	attachCallback(rtm, err_callback) {
		this.rtm.on('message', (data) => {
			console.log(`Message from ${data.user}: ${data.text}`);
			if (typeof(this._socket) !== "undefined" && this._socket !== null) {
				try {
					this._socket.send(JSON.stringify(data.text));
				} catch (e) {
					console.log("Attach callback exception: "+e);
				}
			} else {
				console.log("[messenger] CLIENT_EVENTS forwarder has no websocket");
				if (typeof(err_callback) !== "undefined") {
					err_callback("[messenger] no socket");
				}
			}
		});

		this.rtm.on('ready', (rtmStartData) => {
	    this.web.conversations.list({ limit: 20 })
	    .then((response) => {
	        for (var c in response.channels) {
	            const conversation = response.channels[c];
	            if (conversation.name == app_config.slack_bot_topic) {
	                this.channel = conversation.id;
	                new GRQ().then((quote) => {
	                    var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;
	                    this.web.chat.postMessage({ channel: conversation.id, text: message })
	                    .catch(console.error);
	                });
									break;
	            }
	        }
	    })
	    .catch((error) => {
	        // Error :/
	        console.log('Conversations list error:');
	        console.log(error);
	    });
		});
	}

	messageResponder(topic, message) {

		if (message.toString().length === 0) return;
		try {
			message = JSON.parse(message.toString());
		} catch (e) {
			try {
				message = JSON.parse(message);
			} catch (e) {
				// if not JSON it's just a message
			}
		}

		// more information about additional params https://api.slack.com/methods/chat.postMessage

		// define channel, where bot exist. You can adjust it there https://my.slack.com/services
		if ((typeof(bot) !== "undefined") &&
				(typeof(message.notification) === "undefined") &&
				(typeof(this.channel) !== "undefined"))
		{
			this.rtm.sendMessage(message, this.channel);
		}

		var origins = topic.split("/");
		var oid = origins[1];
		var did = origins[2];

		// pre-parse status for possible registration...
		if ((topic.indexOf("/status") !== -1) &&
			 (typeof(message.registration) !== "undefined") &&
			 (message.registration !== null))
		{
			console.log("MQTT Registration NOT IMPLEMENTED in messenger...: " + JSON.stringify(message, null, 4));
			const _ws = null;
			const _auth = apikey.key; // requires API key to validate, but that already happens on MQTT authentication
			device.register(message.registration, _auth, _ws, (success, registration_response) => {
				console.log("TODO: Device registration response from MQTT (unfinished call):");
				// Append timestamp inside as library is not parsing HTTP response JSON properly
				// when it ends with anything else than }}
				if (success && typeof(registration_response.registration) !== "undefined") {
					registration_response.registration.timestamp = Math.floor(new Date() / 1000);
				}
				if (success === false) {
					console.log("Device registration over MQTT failed with response: " + JSON.stringify(registration_response, null, 4));
				} else {
					console.log("Device registration over MQTT response: " + JSON.stringify(registration_response, null, 4));
				}
				// send the response to device topic (without status)
				// WARNING: the UDID parameter is a reflection here, should be validated instead!
				this.publish(oid, message.registration.udid, registration_response);
			}, null);
		}

		if (typeof(socket) === "undefined") {
			console.log("Forwarding websocket undefined.");
			return;
		}

		devicelib.get(did, (error, body) => {
			if (error) {
				console.log(error);
				return;
			}
			if (topic.indexOf("/status") !== -1) {
				const changes = {
					udid: did,
					status: message
				};
				device.edit(oid, changes, (success, message) => {
					if (!success) {
						console.log("MQTT Device Edit Success: "+success+" status: "+message);
					}
				});
				device.run_transformers(did, body.owner, false, (rerror, rstatus) => {
					if (typeof(rstatus) !== "undefined") {
						if (rerror === false) {
							console.log("MQTT Device Edit OK.");
						} else {
							console.log("MQTT run_transformers Failed:" + rstatus);
						}
						console.log("MQTT Status Transformer Status: "+rstatus);
					}
				});
			}
		});

		// Match by message.status (should be optional)

		if (typeof(message.status) !== "undefined") {

			// console.log("Message is kind of Status.");

			devicelib.get(did, (error, body) => {
				if (error) {
					console.log(error);
					return;
				}

				if (message.status == "connected") {
					var notification_in = {
						notification: {
							title: "Check-in",
							body: "Device " + body.alias + " checked-in.",
							type: "info",
							udid: did
						}
					};
					if (this._socket.readyState === this.socket.OPEN) {
						this._socket.send(JSON.stringify(notification_in));
					}
				} else if (message.status == "disconnected") {
					var notification_out = {
						notification: {
							title: "Check-out",
							body: "Device " + body.alias + " disconnected.",
							type: "warning",
							udid: did
						}
					};
					if (this._socket.readyState === this.socket.OPEN) {
						this._socket.send(JSON.stringify(notification_out));
					}
				}
			});

			// Match by message.connected (should be optional)

		} else if (typeof(message.connected) !== "undefined") {

			// console.log("Message is kind of Connected.");

			var status = message.connected ? "Connected" :
			"Disconnected";

			if (message.connected === true) {
				var notification_cc = {
					notification: {
						title: "Device Connected",
						body: oid,
						type: "info",
						udid: did
					}
				};
				if (this._socket.readyState === this.socket.OPEN) {
					this._socket.send(JSON.stringify(notification_cc));
				}
			} else {
				var notification_dc = {
					notification: {
						title: "Device Disconnected",
						body: oid,
						type: "warning",
						udid: did
					}
				};
				if (this._socket.readyState === this.socket.OPEN) {
					this._socket.send(JSON.stringify(notification_dc));
				}
			}

			// Match by Actionability

		} else if (typeof(message.notification) !== "undefined") {

			//console.log("Message is kind of Notification.");

			var notification = message.notification;

			// In case the message has "response", it is for device
			// otherwise it is from device.

			var messageFromDevice = (typeof(notification.response) ===
			"undefined") ? true : false;

			if (messageFromDevice) {

				var actionable = {
					notification: {
						nid: did,
						title: "Device Interaction",
						body: notification.body,
						response_type: notification.response_type,
						type: "actionable",
						udid: did
					}
				};

				// Actionable notifications
				var nid = "nid:" + did;

				this.client.get(nid, (err, json_keys) => {

					if (!err) {
						// nid should have not existed.
						console.log("Actionable notification " + nid +
						" already exists, will not be displayed anymore.");
						if ((typeof(actionable.done) !== "undefined") ||
						(actionable.done === false)) {
							return;
						} else {
							// actionable notification of this type is deleted,
							// when device firmware gets updated;
							// one device can currently manage only one NID notification (thus update replaces old one with same ID)
						}
						return;
					}

					// Send actionable notification to the webclient...
					if (this._socket.readyState === this.socket.OPEN) {
						this._socket.send(JSON.stringify(actionable));
					} else {
						console.log("Socket not ready.");
					}

					// Attach reply-to topic and store to Redis
					actionable.topic = topic; // reply-to
					actionable.done = false; // user did not respond yet
					var not = JSON.stringify(actionable);
					console.log("Saving actionable: " + not);
					this.client.set("nid:" + did, not, (err) => {
						if (err) {
							console.log("MQTT Action Save Error: " + err);
						}
					});
				});

			} else {

				var notification_to = message.notification;

				// Message for device

				console.log("NID message for device :" + notification_to.nid +
				" : " +
				JSON.stringify(message));

				// Search existing transaction
				this.client.get("nid:" + notification_to.nid, (err, json_keys) => {
						var nid_data = JSON.parse(json_keys);
						if (!err) {
							// NID transaction already exists, update data...
							nid_data.done = true;
							nid_data.response = notification_to.response;
							nid_data.response_type = notification_to.response_type;
						} // if err this is new transaction
						this.client.set("nid:" + did, JSON.stringify(nid_data), (err) => {
							if (err) {
								console.log("MQTT Action Save Error: " + err);
							}
						});
					});
				}

				// Debug unknown notifications (will deprecate)

			} else {

				try {
					var m = JSON.parse(message);
					message = m;
				} catch (e) {
					// message is not json
				}

				var notification_unknown = {
					notification: {
						title: "[DEBUG] Generic Message",
						body: message.toString(),
						type: "success"
					}
				};
				if (this._socket.readyState === this.socket.OPEN) {
					this._socket.send(JSON.stringify(notification_unknown));
				}
			}
	}

	postRandomQuote(quote) {
		var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;

		if (typeof(this.channel) === "undefined") {
			console.log("Cannot post without Slack channel.");
			return;
		}

		this.webclient.chat.postMessage({ channel: this.channel, text: message })
			.then((res) => {
			// `res` contains information about the posted message
				console.log('Slack Message sent: ', res.ts);
			})
			.catch(console.error);
	}

	setupMqttClient(owner, mqtt_options, callback) {

		this.clients[owner] = mqtt.connect(app_config.mqtt.server, mqtt_options);

		console.log("MESENGER #1 CONNECT: "+JSON.stringify(apikey));

		this.clients[owner].on("connect", (error) => {

			console.log("SECDEBUG! Connected, subscribing owner channel with options " + JSON.stringify(mqtt_options));

			this.clients[owner].subscribe("/" + owner + "#");

			if (typeof(callback) === "function") {
				if (error.returnCode !== 0) {
					console.log("Messeger using callback with result FALSE.");
					if (typeof(callback) !== "undefined") {
						callback(false, error);
					}
					return;
				} else {
					if (typeof(callback) !== "undefined") {
						callback(true, error);
					}
					return;
				}
			} else {
				console.log("No callback in messenger.js:134");
			}
		});

		this.clients[owner].on("reconnect", () => {
			//console.log("[messenger] reconnected");
			console.log("[messenger] SECDEBUG! reconnected with options: "+JSON.stringify(mqtt_options));
		});

		this.clients[owner].on("error", (error) => {
			console.log("MQTT: error " + error);
		});

		this.clients[owner].on('close', () => {
			console.log('[mqtt] Connection closed for owner ' + owner);
		});

		// Message Responder
		this.clients[owner].on("message", (topic, message) => {
			this.messageResponder(topic, message);
		});
	}

	sendSlack(message, chan, callback) {
		this.rtm.sendMessage(message, chan, (err, response) => {
			if (err) {
				console.log(err);
			}
			if (typeof(callback) !== "undefined") {
				if (err) {
					callback(err, response);
				} else {
					callback(false, "message_sent");
				}
			}
		});
	}

	// public

	init() {

		var mqtt_config = {
			clientId: 'THiNX-API-' + Math.random().toString(16).substr(2, 8),
			host: 		app_config.mqtt.server,
			port: 		app_config.mqtt.port,
			username: app_config.mqtt.username,
			password: app_config.mqtt.key
		};

		console.log("MQTT connect with config: ");
		console.log({mqtt_config});

		this.master = mqtt.connect(app_config.mqtt.server, mqtt_config);

		this.clients = {
			master: this.master
		};

		this.master.on("connect", (error) => {
			console.log("[OID:MASTER] MQTT listener connected.");
			this.master.subscribe("#");
		});

		this.master.on("reconnect", () => {
			console.log("[OID:MASTER] listener reconnected.");
		});

		this.master.on("error", (error) => {
			console.log("[OID:MASTER] MQTT: error '" + error + "' with config: " + JSON.stringify(mqtt_config, false, 2));
		});

		this.master.on("message", (topic, message) => {

			const msg_string = message.toString();
			if (msg_string.length === 0) return;

			const enc_message = base64.encode(message); // prevent attacks on Redis
			const iso_date = dateFormat(new Date(), "isoDate");

			this.client.get(topic + "@" + iso_date, (err, json_keys) => {

				var keys = json_keys;

				try {
					keys = JSON.parse(json_keys);
				} catch(e) {
					console.log("error parsing redis keys for client.get: "+e);
				}

				if ((keys === null) || (typeof(keys) === "undefined")) {
					keys = {};
				}

				const now = new Date().getTime();
				// console.log("Incoming MQTT message at: " + now);
				var newkeys = {};
				for (const key in keys) {
					let timestamp = parseInt(key, 10);
					if (timestamp > (now - 86400000)) {
						newkeys[key] = keys[key];
					} else {
						/* DATA LEAD, ONLY FOR DEBUGGING */
						try {
							var keydate = new Date(timestamp);
							console.log("Stripped key: " + keydate + " : " + base64.decode(keys[key]));
						} catch (e) {
							console.log("Stripped invalid key: " + e);
						}
					}
				}

				newkeys[now.toString()] = enc_message;

				this.client.set(topic + "@" + iso_date, JSON.stringify(newkeys), (err) => {
						if (err) {
							console.log("MQTT/Redis Action Save Error: " + err);
						}
					});
			});

			// Keeps MQTT Data for 24 hours only
			this.client.expire(topic, 3 * 86400);
		});
	}

	get_result_or_callback(reply, i, callback, results, replies) {
		this.client.get(reply, (err, json_keys) => {
			var keys = {};
			try {
				keys = JSON.parse(json_keys);
			} catch (e) {
				console.log("[messenger] reply_parser_exception " + e);
			}
			if (!err) {
				if ((typeof(keys) !== "undefined") && keys !== null) {
					var ks = Object.keys(keys);
					const keycount = ks.length;
					console.log("Decoding " + keycount + " Keys: ");
					for (var index in ks) {
						const key = ks[index];
						const decoded = base64.decode(keys[key]);
						results[key] = decoded;
						// This is a side-effect, what is the reason for that? Should deprecate or move.
						try {
							results[key] = JSON.parse(decoded);
						} catch (e) {
							// does not matter, just trying...
						}
					}
					console.log("Results: " + JSON.stringify(results));
					if (i === replies.length - 1) {
						callback(true, results);
						console.log("Returning results: " + JSON.stringify(results));
					}
				} else {
					if (i === replies.length - 1) {
						callback(false, "[]");
					}
				}
			}
		});
	}

	data(owner, udid, callback) {
		console.log("Getting data for owner: " + owner);
		this.client.keys("/*" + owner + "/" + udid + "*", (err, replies) => {
			var results = {};
			replies.forEach((reply, i) => {
				console.log("    " + i + ": " + reply);
				this.get_result_or_callback(reply, i, callback, results, replies);
			});
		});
	}

	initWithOwner(owner, websocket, callback) {

		// Fetch all devices for owner
		if ((typeof(websocket) === "undefined") || websocket === null) {
			console.log("[messenger] init without socket for owner " + owner);
			if (typeof(callback) !== "undefined") {
				callback(false, "init_without_socket_error");
			}
			return;
		}

		this._socket = websocket;
		this._owner = owner; // useless

		this.attachCallback(this.rtm, callback);

		this.getDevices(owner, (success, devices) => {

			if (!success) {
			console.log(
				"Error initializing messenger when getting devices for owner " +
				owner);
				return;
			}

			this._devices = devices; // use to fetch aliases by device id!

			// Fetch MQTT authentication for owner
			this.apiKeyForOwner(owner, (success, apikey) => {

				if (!success) {
					console.log("MQTT: API key fetch failed.");
					return;
				}

				if ((typeof(apikey) === "undefined") || (typeof(apikey.hash) === "undefined")) {
					console.log("MQTT: No API keys found in Redis for this owner. Database persistency not enabled?");
					return;
				}

				if ((typeof(this.clients[owner]) !== "undefined") && (this.clients[owner] !== null)) {
					// console.log("MQTT/WS client already exists for this owner.");
					return;
				}

				// Connect and set callbacks (should use QoS 2 but that's not supported to all client
				const mqtt_options = {
					host: app_config.mqtt.server,
					port: app_config.mqtt.port,
					username: owner,
					password: apikey.key
				};

				// Setup per-owner MQTT client
				this.setupMqttClient(owner, mqtt_options, callback);

				if (typeof(callback) == "function") {
					if (typeof(callback) !== "undefined") {
						callback(true, "messenger_init_success");
					}
				}
			});
		});
	}

	getDevices(owner, callback) {
		devicelib.view("devicelib", "devices_by_owner", {
				"key": owner,
				"include_docs": false
			},
			(err, body) => {
				if (err) {
					if (err.toString() == "Error: missing") {
						if (typeof(callback) == "function") {
							if (typeof(callback) !== "undefined") {
								callback(false, "no_such_owner_device");
							}
						}
					}
					console.log("/api/user/devices: Error: " + err.toString());
					return;
				}

				var rows = body.rows; // devices returned
				var devices = [];
				for (var row in rows) {
					var rowData = rows[row];
					var device = rowData.value;
					//console.log("Device: " + JSON.stringify(device));
					var topic = "/" + owner + "/" + device.udid;
					devices.push(topic);
				}
				if (typeof(callback) == "function") {
					if (typeof(callback) !== "undefined") {
						callback(true, devices);
					}
				}
			});
	}

	// This might be significant performance issue (first if this kind), we'll need to page this and possibly extract to different app on different server!
	getAllOwners(callback) {
		userlib.view("users", "owners_by_id", {
				"include_docs": true
			},
			(err, body) => {
				if (err) {
					if (err.toString().indexOf("Error: missing") !== -1) {
						if (typeof(callback) !== "undefined") {
							callback(false, "no_owners");
						}
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
				if (typeof(callback) !== "undefined") {
					callback(true, devices);
				}
			});
	}

	// Fetch API key from Redis, should be the MQTT API key...
	apiKeyForOwner(owner, callback) {
		apikey.list(owner, (success, keys) => {
			if (success === true) {
				if (typeof(callback) !== "undefined") {
					console.log("API Key list found, returning key 0:");
					console.log(JSON.stringify(keys[0]));
					callback(true, keys[0]); // using first API key by default until we'll have initial API key based on user creation.
				}
			} else {
				console.log("API Key list failed. Returning default: "+owner.api_keys[0]);
				if (typeof(callback) !== "undefined") {
					callback(success, owner.api_keys[0]);
				}
			}
		});
	}

	// Receive a WS chat message and slack it...
	slack(owner, message, callback) {
		// define global channel, where bot exist. You can adjust it there https://my.slack.com/services
		if ((typeof(this.channel) === "undefined") || (this.channel === null)) {
			this.client.get("__SLACK_CHANNEL_ID__", (err, ch) => {
				if (!err && (typeof(ch) !== "undefined") && ch !== null) {
					this.hannel = ch;
					console.log("using Channel: "+ch);
					this.sendSlack(message, this.channel, callback);
				} else {
					console.log("Cannot Slack '" + "', no channel given.");
				}
			});
		} else {
			this.sendSlack(message, this.channel, callback);
		}
	}

};
