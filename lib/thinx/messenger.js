/** This THiNX-RTM API module is responsible for managing MQTT communication. */

var GRQ = require('get-random-quote');
var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();
var db = app_config.database_uri;
var dateFormat = require("dateformat");
var mqtt = require("mqtt");

var devicelib = require("nano")(db).use(prefix + "managed_devices");

var base64 = require("base-64");

var ApiKey = require("./apikey"); var akey = new ApiKey();
var Device = require("./device"); var device = new Device();
var Owner = require("./owner");

var bluebird = require("bluebird");

const { RTMClient } = require('@slack/rtm-api');
const { WebClient } = require('@slack/web-api');

module.exports = class Messenger {

	//
	// • Sends a message to device using MQTT, internally provides path and authentication.
	// • Each user should use own MQTT password/apikey.
	// • ACLs/role needs to be adjusted for messenger to work globally.
	// • There should be one Messenger instance per owner.
	// • Messenger fetches device list based on the owner.
	// • Provides topic-based (should support regex) subscription callback.
	//

	createInstance() {

		var redis = require("redis");
		bluebird.promisifyAll(redis.RedisClient.prototype);

		this.client = redis.createClient(Globals.redis_options());
		try {
			this.client.bgsave();
		} catch (e) {}

		this.master = null;
		this.socket = null;
		this.channel = null;
		this.clients = {};
		this.web = null;
		this.rtm = null;
		this.once = false;
		this.user = new Owner();

		this._private = {
			_owner: null,
			_devices: null,
			_socket: null
		};

		this.instance = null;
		this.initialized = false;

		this.init();
		this.initSlack();
		return this;
	}

	getInstance() {
		if (!this.instance) {
			this.instance = this.createInstance();
		}
		return this.instance;
	}

	constructor() {
		this.getInstance();
	}

	sendRandomQuote() {

		new GRQ().then((quote) => {
			var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;

			if (this.web) {
				this.web.chat.postMessage({ channel: this.channel, text: message })
				.catch(console.error);
			}
		});

	}

	sendQuote(quote) {

		if (this.once == true) {
			return;
		}

		this.once = true;

		console.log("Posting to conversation...");

		// do not send Slack quotes on localhost (non-FQDN) setup
		if (Globals.app_config().public_url.indexOf("localhost") !== -1) {
			return;
		}

		var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;
		if (this.web) {
			this.web.chat.postMessage({ channel: this.channel, text: message })
			.catch(console.error);
		}
	}

	async getBotToken() {

		var bot_token;

		// Default built-in startup token
		if ((typeof (process.env.SLACK_BOT_TOKEN) === "undefined") || (process.env.SLACK_BOT_TOKEN !== null)) {
			bot_token = app_config.slack_bot_token;
		} else {
			bot_token = process.env.SLACK_BOT_TOKEN;
		}

		if (typeof (bot_token) === "undefined") {
			console.log("» Slack bot token not found in config.json!");
		}

		// Fetch Slack bot token from runtime environment (e.g. from recent run)
		this.client.getAsync("__SLACK_BOT_TOKEN__")
			.catch((err) => { 
				// console.log("catcher: ", err); 
				// returns error often when Redis is closed
			})
			.then((token) => {
				if ((typeof (token) === "undefined") || token === null) {
					console.log("» Using initial Slack token from configuration...");
					return Promise.resolve(bot_token);
				} else {
					console.log("» Fetched Redis token for Slack...", token);
					return Promise.resolve(token);
				}
			});

	}

	async initSlack() {

		let bot_token = await this.getBotToken();

		// Fetch Slack bot token from runtime environment (e.g. from recent run)
		this.client.get("__SLACK_BOT_TOKEN__", (err, token) => {

			if (!err && (typeof (token) !== "undefined") && token !== null) {
				console.log("» Fetched Redis token for Slack...");
				bot_token = token;
			}

			if (typeof (bot_token) === "undefined" || bot_token == null || bot_token == "") {
				//console.log("Skipping Slack RTM, no bot token available.");
				return;
			}

			this.rtm = new RTMClient(bot_token, {
				useRtmConnect: true,
				debug: false,
				dataStore: false
			});

			this.web = new WebClient(bot_token);
			this.attachCallback(this.rtm);
			this.rtm.start();
		});
	}

	publish(owner, udid, message) {
		if (typeof (this.clients[owner]) === "undefined") {
			this.user.mqtt_key(owner, (success, apikey) => {
				if (success) {
					//console.log("On success fetched ", { apikey });
					if (typeof (this.clients[owner]) === "undefined" || this.clients[owner] === null) {
						this.clients[owner] = mqtt.connect(app_config.mqtt.server, {
							host: app_config.mqtt.server,
							port: app_config.mqtt.port,
							username: owner,
							password: apikey.key
						});
						console.log("[publish] Created new MQTT client for owner:", owner, "message:", message);

					}
					console.log("[publish] Calling recursively after fetching API Key and setting new client...");
					this.publish(owner, udid, message);
					return;
				} else {
					console.log("[pubish] API Key fetch failed, not possible to create custom owner's MQTT client...");
				}
			});
			return;
		} else {
			console.log("[publish] using custom owner client...");
		}

		var mqtt_topic = "/" + owner + "/" + udid;

		// Check for actionable notifications and pick up transaction from Redis
		// In case the notification contains 'nid'; send only 'reply' and delete this nid from redis.
		if (typeof (message.nid) !== "undefined") {
			var nid = "nid:" + message.nid;
			message.topic = mqtt_topic;
			message.done = true; // user already responded; never notify again...
			this.client.set(nid, JSON.stringify(message), (err) => {
				if (err) {
					console.log(err);
				}
			});
		}
		this.clients[owner].publish(mqtt_topic, message);
	}

	attachCallback(rtm, err_callback) {

		if (this.rtm == null) {
			console.log("ERROR, Slack initialized to late or attachCallback called too soon...");
			return;
		}

		this.rtm.on('message', (data) => {
			console.log(`Message from ${data.user}: ${data.text}`);
			if (typeof (this._socket) !== "undefined" && this._socket !== null) {
				try {
					this._socket.send(JSON.stringify(data.text));
				} catch (e) {
					console.log("Attach callback exception: " + e);
				}
			} else {
				console.log("[messenger] CLIENT_EVENTS forwarder has no websocket");
				if (typeof (err_callback) !== "undefined") {
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
							// console.log("» [slack:rtm::ready] Last Slack conversation ID:", this.channel);
							return;
						}
					}
					console.log("» [slack:rtm::ready] No Slack conversation ID in channels", response.channels);
					// this.channel = response.channels[0].id; // using zero channel in case of issues? just a workaround and UX/Sec issue.
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
		} catch (parser_error) {
			try {
				message = JSON.parse(message);
			} catch (parser_err) {
				// if not JSON it's just a message so we can ignore this
			}
		}

		// more information about additional params https://api.slack.com/methods/chat.postMessage

		// define channel, where bot exist. You can adjust it there https://my.slack.com/services
		if ((typeof (bot) !== "undefined") &&
			(typeof (message.notification) === "undefined") &&
			(typeof (this.channel) !== "undefined")) {
			this.rtm.sendMessage(message, this.channel);
		}

		var origins = topic.split("/");
		var oid = origins[1];
		var did = origins[2];

		// pre-parse status for possible registration...
		if ((topic.indexOf("/status") !== -1) &&
			(typeof (message.registration) !== "undefined") &&
			(message.registration !== null)) {
			console.log("MQTT Registration NOT IMPLEMENTED in messenger...: " + JSON.stringify(message, null, 4));
			const _ws = null;
			akey.get_first_apikey(oid, (success, apikey) => {
				const _auth = apikey.key;
				device.register(message.registration, _auth, _ws, (reg_success, registration_response) => {
					console.log("TODO: Device registration response from MQTT (unfinished call):");
					// Append timestamp inside as library is not parsing HTTP response JSON properly
					// when it ends with anything else than }}
					if (reg_success && typeof (registration_response.registration) !== "undefined") {
						registration_response.registration.timestamp = Math.floor(new Date() / 1000);
					}
					if (reg_success === false) {
						console.log("Device registration over MQTT failed with response: " + JSON.stringify(registration_response, null, 4));
					} else {
						console.log("Device registration over MQTT response: " + JSON.stringify(registration_response, null, 4));
					}
					// send the response to device topic (without status)
					// WARNING: the UDID parameter is a reflection here, should be validated instead!
					this.publish(oid, message.registration.udid, registration_response);
				}, null);
			});
		}

		if (typeof (socket) === "undefined") {
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
				device.edit(oid, changes, (success, a_message) => {
					if (!success) {
						console.log("MQTT Device Edit Failed with status:", a_message);
					}
				});
				device.runDeviceTransformers(body, null, null);
			}
		});

		// Match by message.status (should be optional)

		if (typeof (message.status) !== "undefined") {

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

		} else if (typeof (message.connected) !== "undefined") {

			// console.log("Message is kind of Connected.");
			//var status = message.connected ? "Connected" : "Disconnected";

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

		} else if (typeof (message.notification) !== "undefined") {

			//console.log("Message is kind of Notification.");

			var notification = message.notification;

			// In case the message has "response", it is for device
			// otherwise it is from device.

			var messageFromDevice = (typeof (notification.response) ===
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
						if ((typeof (actionable.done) !== "undefined") ||
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
					this.client.set("nid:" + did, not, (set_err) => {
						if (set_err) {
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
					this.client.set("nid:" + did, JSON.stringify(nid_data), (nid_err) => {
						if (nid_err) {
							console.log("MQTT Action Save Error: " + nid_err);
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

		if (typeof (this.channel) === "undefined") {
			console.log("Cannot post without Slack channel.");
			return;
		}

		if (this.web) {
			this.web.chat.postMessage({ channel: this.channel, text: message })
				.then((res) => {
					// `res` contains information about the posted message
					console.log('Slack Message sent: ', res.ts);
				})
				.catch(console.error);
		}
	}

	setupMqttClient(owner, apikey, mqtt_options, callback) {

		this.clients[owner] = mqtt.connect(app_config.mqtt.server, mqtt_options);

		this.clients[owner].on("connect", (error) => {

			console.log("Messenger #1 connected.");

			// console.log("SECDEBUG! Connected, subscribing owner channel with options " + JSON.stringify(mqtt_options));

			this.clients[owner].subscribe("/" + owner + "#");

			if (typeof (callback) === "function") {
				if (error.returnCode !== 0) {
					console.log("Messeger using callback with result FALSE.");
					if (typeof (callback) !== "undefined") {
						callback(false, error);
					}
					return;
				} else {
					if (typeof (callback) !== "undefined") {
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
			//console.log("[messenger] SECDEBUG! reconnected with options: "+JSON.stringify(mqtt_options));
		});

		this.clients[owner].on("error", (error) => {
			console.log("MQTT: error " + error);
			// MQTT: error Error: Connection refused: Not authorized
			if (error.toString().indexOf("Not authorized") != -1) {
				// console.log("Valid MQTT connection required. Without that, this app is useless..."); // restart might fix this
				console.log("Owner", owner, "not authorized to access using apikey", apikey);
			}
		});

		this.clients[owner].on('close', () => {
			console.log('[mqtt] Connection closed.');
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
			if (typeof (callback) !== "undefined") {
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

		this.initialized = true;

		var mqtt_password;
		var mqtt_username = "thinx";

		// console.log("[messenger::init]()");

		if (typeof (app_config.mqtt.username) !== "undefined") {
			mqtt_username = app_config.mqtt.username;
			//console.log("[messenger::init] Setting mosquitto username from configuration file.");
		} else {
			if (typeof (process.env.MOSQUITTO_PASSWORD) !== "undefined") {
				mqtt_password = process.env.MOSQUITTO_PASSWORD;
				console.log("[messenger::init] Overriding mosquitto password by environment variable.");
			}
		}

		if (typeof (app_config.mqtt.password) !== "undefined") {
			mqtt_password = app_config.mqtt.password;
			//console.log("[messenger::init] Setting mosquitto password from configuration file.");
		} else {
			if (typeof (process.env.MOSQUITTO_USERNAME) !== "undefined") {
				mqtt_username = process.env.MOSQUITTO_USERNAME;
				console.log("[messenger::init] Overriding mosquitto username by environment variable.");
			}
		}

		var mqtt_config = {
			clientId: 'THiNX-API-' + Math.random().toString(16).substr(2, 8),
			host: app_config.mqtt.server,
			port: app_config.mqtt.port,
			username: mqtt_username,
			password: mqtt_password
		};

		this.master = mqtt.connect(app_config.mqtt.server, mqtt_config);

		this.clients = {
			master: this.master
		};

		this.master.on("connect", (error) => {
			if (error) {
				console.log(error);
			} else {
				//console.log("[OID:MASTER] MQTT listener connected, subscribing all topics:", mqtt_username);
				this.master.subscribe("#");
			}
		});

		this.master.on("reconnect", () => {
			console.log("[OID:MASTER] MQTT reconnect warning: Please check ACL file and inital username/password. Broker is probably rejecting current credentials/ACL.");
		});

		this.master.on("error", (error) => {
			console.log("[OID:MASTER] MQTT: error '" + error);
		});

		this.master.on("message", (topic, message) => {

			if (message.toString().length === 0) return;

			const enc_message = base64.encode(message); // prevent attacks on Redis
			const iso_date = dateFormat(new Date(), "isoDate");

			this.client.get(topic + "@" + iso_date, (err, json_keys) => {

				var keys = json_keys;

				try {
					keys = JSON.parse(json_keys);
				} catch (e) {
					console.log("error parsing redis keys for client.get: " + e);
				}

				if ((keys === null) || (typeof (keys) === "undefined")) {
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

				this.client.set(topic + "@" + iso_date, JSON.stringify(newkeys), (set_err) => {
					if (set_err) console.log("MQTT/Redis Action Save Error: " + set_err);
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
				if ((typeof (keys) !== "undefined") && keys !== null) {
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
		if ((typeof (websocket) === "undefined") || websocket === null) {
			console.log("[messenger] init without socket for owner " + owner);
			if (typeof (callback) !== "undefined") {
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
				callback(false, "err_messenger_init");
				return;
			}

			this._devices = devices; // use to fetch aliases by device id!

			// Fetch MQTT authentication for owner
			this.user.mqtt_key(owner, (key_success, apikey) => {

				if (!key_success) {
					console.log("MQTT: API key fetch failed (may happen for new owner, trying to generate some...) " + owner);
					this.user.create_default_mqtt_apikey(owner, (result) => {
						if (result === false) {
							console.log("err_apikey_fetch_generate_failed");
							callback(false, "err_apikey_fetch_generate_failed");
							return;
						}
					});
				}

				// Happens in case there is freshly created user.
				if ((typeof (apikey) === "undefined") || (typeof (apikey.hash) === "undefined")) {
					console.log("MQTT: No API keys found in Redis for this owner. Database persistency not enabled?");
				}

				if ((typeof (this.clients[owner]) !== "undefined") && (this.clients[owner] !== null)) {
					// console.log("MQTT/WS client already exists for this owner.");
					callback(false, "err_client_exists");
					return;
				}

				let api_key = null;
				if (typeof (apikey) !== "undefined") {
					api_key = apikey.key;
				}

				if (api_key == null) {
					if (typeof (callback) == "function") {
						if (typeof (callback) !== "undefined") {
							callback(false, "messenger_init_failed_no_apikey");
						}
					}
					return;
				}

				// Connect and set callbacks (should use QoS 2 but that's not supported to all client
				const mqtt_options = {
					host: app_config.mqtt.server,
					port: app_config.mqtt.port,
					username: owner,
					password: api_key
				};

				// console.log("Setting per-owner MQTT client up with (owner, key options)", owner, apikey.key, {mqtt_options});

				// Setup per-owner MQTT client
				this.setupMqttClient(owner, apikey.key, mqtt_options, callback);
				/* for tests?
				if (typeof (callback) == "function") {
					if (typeof (callback) !== "undefined") {
						callback(true, "messenger_init_success");
					}
				}*/
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
						if (typeof (callback) == "function") {
							if (typeof (callback) !== "undefined") {
								callback(false, "no_such_owner_device");
							}
						}
					}
					console.log("/api/user/devices: Error: " + err.toString());

					if (err.toString().indexOf("No DB shards could be opened") !== -1) {
						let that = this;
						console.log("Will retry in 5s...");
						setTimeout(() => {
							that.list(owner, callback);
						}, 5000);
					}
					
					return;
				}

				var rows = body.rows; // devices returned
				var devices = [];
				for (var row in rows) {
					var rowData = rows[row];
					var a_device = rowData.value;
					var topic = "/" + owner + "/" + a_device.udid;
					devices.push(topic);
				}
				if (typeof (callback) == "function") {
					if (typeof (callback) !== "undefined") {
						callback(true, devices);
					}
				}
			});
	}

	// Receive a WS chat message and slack it...
	slack(owner, message, callback) {
		// define global channel, where bot exist. You can adjust it there https://my.slack.com/services
		if ((typeof (this.channel) === "undefined") || (this.channel === null)) {
			this.client.get("__SLACK_CHANNEL_ID__", (err, ch) => {
				if (!err && (typeof (ch) !== "undefined") && ch !== null) {
					this.hannel = ch;
					console.log("using Channel: " + ch);
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
