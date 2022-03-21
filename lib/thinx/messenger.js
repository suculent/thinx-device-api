/** This THiNX-RTM API module is responsible for managing MQTT communication. */

// specific imports
const base64 = require("base-64");
var GRQ = require('get-random-quote');
var dateFormat = require("dateformat");
var bluebird = require("bluebird");

const { RTMClient } = require('@slack/rtm-api');
const { WebClient } = require('@slack/web-api');

// generic imports
var Globals = require("./globals.js");
var app_config = Globals.app_config();
var prefix = Globals.prefix();

// uses message queue
var mqtt = require("mqtt");

const Database = require("./database.js");

// core imports
var Auth = require("./auth");
var ApiKey = require("./apikey"); var akey = new ApiKey();
var Device = require("./device"); var device = new Device();
var Owner = require("./owner");

module.exports = class Messenger {

	//
	// • Sends a message to device using MQTT, internally provides path and authentication.
	// • Each user should use own MQTT password/apikey.
	// • ACLs/role needs to be adjusted for messenger to work globally.
	// • There should be one Messenger instance per owner.
	// • Messenger fetches device list based on the owner.
	// • Provides topic-based (should support regex) subscription callback.
	//

	createInstance(password) {

		var redis = require("redis");
		bluebird.promisifyAll(redis.RedisClient.prototype);

		this.devicelib = require("nano")(new Database().uri()).use(prefix + "managed_devices");

		this.client = redis.createClient(Globals.redis_options());

		this.password = password; // dynamic password for Mosquitto Broker

		this.master = null;
		this.socket = null;
		this.channel = null;
		this.clients = {};
		this.web = null;
		this.rtm = null;
		this.once = false;
		this.instance = null;
		this.user = new Owner();

		this._private = {
			_owner: null,
			_devices: null,
			_socket: null
		};

		this.init(password);

		//this.initSlack(); must be done later, not in constructor

		console.log("✅ [info] Loaded module: Messenger");
		return this;
	}

	getInstance(password) {
		if (!this.instance) {
			this.instance = this.createInstance(password);
		}
		return this.instance;
	}

	constructor(password) {
		this.getInstance(password);
	}

	sendRandomQuote() {

		new GRQ().then((quote) => {
			var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;

			if (this.web) {
				this.web.chat.postMessage({ channel: this.channel, text: message })
					.catch("☣️ [error] " + console.error);
			}
		}).catch((err) => {
			console.log("☣️ [error] Random quote error", err);
		});

	}

	sendQuote(quote) {

		if (this.once) return;

		this.once = true;

		console.log("Posting to conversation...");

		// do not send Slack quotes on localhost (non-FQDN) setup
		if (Globals.app_config().public_url.indexOf("localhost") !== -1) {
			return;
		}

		var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;
		if (this.web) {
			this.web.chat.postMessage({ channel: this.channel, text: message })
				.catch("☣️ [error] sendquote" + console.error);
		}
	}

	async getBotToken() {

		var bot_token;

		// Default built-in startup token
		if ((typeof (process.env.SLACK_BOT_TOKEN) === "undefined") || (process.env.SLACK_BOT_TOKEN !== null)) {
			bot_token = app_config.slack.bot_token;
		} else {
			bot_token = process.env.SLACK_BOT_TOKEN;
		}

		if (typeof (bot_token) === "undefined") {
			console.log("» Slack bot token not found in config.json!");
		}

		// Fetch Slack bot token from runtime environment (e.g. from recent run)
		this.client.getAsync("__SLACK_BOT_TOKEN__")
			.catch((err) => {
				console.log("☣️ [error] Error fatching Slack bot token: ", err);
				return Promise.resolve(bot_token);
			})
			.then((token) => {
				if ((typeof (token) === "undefined") || token === null) {
					return Promise.resolve(bot_token);
				} else {
					console.log("» Fetched Redis token for Slack...", token);
					return Promise.resolve(token);
				}
			});

	}

	async initSlack(callback) {

		let bot_token = await this.getBotToken();

		// Fetch Slack bot token from runtime environment (e.g. from recent run)
		this.client.get("__SLACK_BOT_TOKEN__", (err, token) => {

			if (!err && (typeof (token) !== "undefined") && token !== null) {
				console.log("✅ [info] Fetched Redis token for Slack...");
				bot_token = token;
			}

			if (typeof (bot_token) === "undefined" || bot_token == null || bot_token == "") {
				console.log("☣️ [error] Skipping Slack RTM, no bot token available.");
				callback();
				return;
			}

			console.log("✅ [info] Creating Slack RTM client...");

			this.rtm = new RTMClient(bot_token, {
				useRtmConnect: true,
				debug: false,
				dataStore: false
			});

			if (this.rtm) {
				this.attachCallback(this.rtm);
				this.rtm.start();
			}

			console.log("✅ [info] Creating Slack WEB client...");

			this.web = new WebClient(bot_token);

			if (typeof(callback) !== "undefined") {
				callback(this.rtm);
			}
		});
	}

	publish(owner, udid, message) {

		if (typeof (this.clients[owner]) === "undefined") {

			this.user.mqtt_key(owner, (success, apikey) => {
				if (success) {
					if (typeof (this.clients[owner]) === "undefined" || this.clients[owner] === null) {
						this.clients[owner] = mqtt.connect(app_config.mqtt.server, {
							host: app_config.mqtt.server,
							port: app_config.mqtt.port,
							username: owner,
							password: apikey.key
						});
						console.log(`✅ [info] [publish] Created new MQTT client for owner ${owner}`);
					} else {
						console.log(`✅ [info] [publish] Using existing MQTT client to publish with owner ${owner} and ${udid}`);
					}
					this.publish(owner, udid, message);
				} else {
					console.log("☣️ [error] [publish] API Key fetch failed, not possible to create custom owner's MQTT client...");
				}
			});

			return;
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
					console.log("☣️ [error] " + err);
				}
			});
		}
		this.clients[owner].publish(mqtt_topic, message);
	}

	attachCallback(rtm, err_callback) {

		if (this.rtm == null) {
			console.log("☣️ [error] Slack not initialized, or attachCallback called too soon, no RTM...");
			return;
		}

		this.rtm.on('message', (data) => {
			console.log(`Message from ${data.user}: ${data.text}`);
			if (typeof (this._socket) !== "undefined" && this._socket !== null) {
				try {
					this._socket.send(JSON.stringify(data.text));
				} catch (e) {
					console.log("☣️ [error] Attach callback exception: " + e);
				}
			} else {
				console.log("☣️ [error] [messenger] CLIENT_EVENTS forwarder has no websocket");
				if (typeof (err_callback) !== "undefined") {
					err_callback("[messenger] no socket");
				}
			}
		});

		this.rtm.on('ready', (/* rtmStartData */) => {
			this.web.conversations.list({ limit: 20 })
				.then((response) => {
					for (var c in response.channels) {
						const conversation = response.channels[c];
						if (conversation.name == app_config.slack.bot_topic) {
							this.channel = conversation.id;
							return;
						}
					}
					console.log("☣️ [error] [slack:rtm::ready] No Slack conversation ID in channels", response.channels);
				})
				.catch((error) => {
					// Error :/
					console.log('☣️ [error] [slack:rtm::ready] Conversations list error:');
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
			console.log("🚫 [critical] MQTT Registration NOT IMPLEMENTED in messenger...: " + JSON.stringify(message, null, 4));
			const _ws = null;
			akey.get_first_apikey(oid, (success, apikey) => {
				const _auth = apikey.key;
				device.register(
					{}, /* req */
					message.registration,
					_auth,
					_ws,
					(reg_success, registration_response) => {
						// TODO (17): Device registration response from MQTT (unfinished call)
						// https://github.com/suculent/thinx-device-api/issues/310

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
						this.publish(oid, registration_response.registration.udid, registration_response);
					}, null);
			});
		}

		if (typeof (socket) === "undefined") {
			console.log("Forwarding websocket is undefined, exiting messageResponder, no socket to send to...");
			return;
		}

		this.devicelib.get(did, (error, body) => {
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
						console.log("☣️ [error] MQTT Device Edit Failed with status:", a_message);
					}
				});
				device.runDeviceTransformers(body, null, null);
			}
		});

		// Match by message.status (should be optional)

		if (typeof (message.status) !== "undefined") {

			this.devicelib.get(did, (error, body) => {
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

				this.client.get(nid, (err, /* json_keys */) => {

					if (!err) {
						// nid should have not existed.
						console.log("⚠️ [warning] Actionable notification " + nid +
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
						console.log("☣️ [error] Socket not ready.");
					}

					// Attach reply-to topic and store to Redis
					actionable.topic = topic; // reply-to
					actionable.done = false; // user did not respond yet
					var not = JSON.stringify(actionable);
					console.log("ℹ️ [info] Saving actionable: " + not);
					this.client.set("nid:" + did, not, (set_err) => {
						if (set_err) {
							console.log("☣️ [error] MQTT Action Save Error: " + err);
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
							console.log("☣️ [error] MQTT Action Save Error: " + nid_err);
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
					title: "☣️ [error] [DEBUG] Generic Message",
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
			console.log("☣️ [error] Cannot post without Slack channel.");
			return;
		}

		if (this.web) {
			this.web.chat.postMessage({ channel: this.channel, text: message })
				.then((res) => {
					// `res` contains information about the posted message
					console.log('[info] Slack Message sent: ', res.ts);
				})
				.catch(console.error);
		}
	}

	setupMqttClient(owner, mqtt_options, callback) {

		try {
			this.clients[owner] = mqtt.connect(app_config.mqtt.server, mqtt_options);
		} catch (e) {
			callback(false, e);
			return;
		}
		
		if (typeof(this.clients[owner]) === "undefined") {
			console.log("DEVELOPER/TEST ERROR – MQTT CONNECT FAILED, probably invalid mock.");
			callback(false, "mqtt_connect_failed");
			return;
		}

		this.clients[owner].on("connect", (error) => {

			console.log(`ℹ️ [info] Messenger ${owner} connected, subscribing...`);

			this.clients[owner].subscribe("/" + owner + "/#");

			if (typeof (callback) === "function") {
				if (error.returnCode !== 0) {
					console.log("☣️ [error] Messeger using callback with result FALSE.");
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
				console.log("⚠️ [warning] No callback in messenger.js:578");
			}
		});
		this.clients[owner].on("error", (error) => {
			if (error.toString().indexOf("Not authorized") != -1) {
				console.log(`[error] Owner ${owner} not authorized to access using apikey [redacted], stopping...`);
				if (typeof(this.clients[owner]) !== "undefined") {
					if ( typeof(this.clients[owner].end) === "function" ) {
						this.clients[owner].end();
						return;
					}
				}
			}
			console.log("MQTT: error " + error);
		});

		this.clients[owner].on('close', () => {
			console.log(`[info] [mqtt] Connection closed for ${owner}`);
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

	inject_password(password, callback) {

		let auth = new Auth(this.client);
		const account = "thinx";

		auth.add_mqtt_credentials(account, password, () => {
			const ACL = require('./acl.js');
			let acl = new ACL(account);
			acl.load(() => {
				acl.addTopic(account, "readwrite", "/#");
				acl.commit();
				callback();
			});

		});
	}

	connect_callback(error) {
		if (error) {
			console.log(error);
		} else {
			this.master.subscribe("#");
		}
	}

	error_callback(error) {
		if (error.toString().indexOf("Not authorized") !== -1) {
			console.log(`🚫 [critical] MQTT connection not authorized`);
		} else {
			console.log("☣️ [error] MQTT error:", error);
		}
	}

	message_callback(topic, message) {
		if (message.toString().length === 0) return;

		const enc_message = base64.encode(message); // prevent attacks on Redis
		const iso_date = dateFormat(new Date(), "isoDate");

		this.client.get(topic + "@" + iso_date, (err, json_keys) => {

			var keys = json_keys;

			try {
				keys = JSON.parse(json_keys);
			} catch (e) {
				console.log("☣️ [error] parsing redis keys for client.get: " + e);
			}

			if ((keys === null) || (typeof (keys) === "undefined")) {
				keys = {};
			}

			const now = new Date().getTime();
			var newkeys = {};
			for (const key in keys) {
				let timestamp = parseInt(key, 10);
				if (timestamp > (now - 86400000)) {
					newkeys[key] = keys[key];
				}
			}

			newkeys[now.toString()] = enc_message;

			this.client.set(topic + "@" + iso_date, JSON.stringify(newkeys), (set_err) => {
				if (set_err) console.log("☣️ [error] MQTT/Redis Action Save Error: " + set_err);
			});
		});

		// Keeps MQTT Data for 24 hours only
		this.client.expire(topic, 3 * 86400);
	}

	attach_callbacks() {
		this.master.on("connect", this.connect_callback);
		this.master.on("error", this.error_callback);
		this.master.on("message", this.message_callback);
	}

	init(password) {

		var mqtt_password = password;

		console.debug("ℹ️ [info] Process environment: %s, revision: %s", process.env.ENVIRONMENT, process.env.REVISION);

		this.inject_password(mqtt_password, () => {

			console.log("ℹ️ [info] MQTT credentials refresh complete, initializing Messenger...");

			var mqtt_config = {
				clientId: 'THiNX-API-' + Math.random().toString(16).substr(2, 8),
				host: app_config.mqtt.server,
				port: app_config.mqtt.port,
				username: "thinx",
				password: mqtt_password
			};

			this.master = mqtt.connect(app_config.mqtt.server, mqtt_config);

			this.clients = {
				master: this.master
			};

			this.attach_callbacks();

		});
	}

	get_result_or_callback(reply, i, callback, results, replies) {
		this.client.get(reply, (err, json_keys) => {
			var keys = {};
			try {
				keys = JSON.parse(json_keys);
			} catch (e) {
				console.log("☣️ [error] [messenger] reply_parser_exception " + e);
			}
			if (err) {
				return;
			}
			if ((typeof (keys) === "undefined") || keys === null) {
				if (i === replies.length - 1) {
					callback(false, "[]");
				}
				return;
			}
			
			var ks = Object.keys(keys);
			const keycount = ks.length;
			console.log("🔨 [debug] Decoding " + keycount + " Keys: ");
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
			if (i === replies.length - 1) {
				callback(true, results);
				console.log("🔨 [debug] [messenger] Returning results: " + JSON.stringify(results));
			} else {
				console.log("Warning, edge case #762.");
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

		if ((typeof (websocket) === "undefined") || websocket === null) {
			console.log("[messenger] init without socket for owner " + owner);
			if (typeof (callback) !== "undefined") {
				callback(false, "init_without_socket_error");
			}
			return;
		}

		this._socket = websocket;

		this.attachCallback(this.rtm, callback);

		// Fetch all devices for owner
		this.getDevices(owner, (success, devices) => {

			if (!success) {
				console.log("☣️ [error] initializing messenger when getting devices for owner " + owner);
				callback(false, "err_messenger_init");
				return;
			}

			this._devices = devices; // use to fetch aliases by device id!

			// Fetch MQTT authentication for owner
			this.user.mqtt_key(owner, (key_success, apikey) => {

				if (!key_success) {
					console.log("⚠️ [warning] MQTT: API key fetch failed (may happen for new owner, trying to generate some...) " + owner);
					this.user.create_default_mqtt_apikey(owner, (result) => {
						console.log("create_default_mqtt_apikey result", result);
						if (result === false) {
							console.log("err_apikey_fetch_generate_failed");
							callback(false, "err_apikey_fetch_generate_failed");
						}
					});
				}

				// Happens in case there is freshly created user.
				if ((typeof (apikey) === "undefined") || (typeof (apikey.hash) === "undefined")) {
					console.log(`☣️ [error] MQTT: No API keys ${apikey} found in Redis for this owner. Database persistency not enabled?`);
				}

				if ((typeof (this.clients[owner]) !== "undefined") && (this.clients[owner] !== null)) {
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
							callback(false, "messenger_init_failed_no_apikey_for_owner"+owner);
						}
					}
					return;
				}

				// Connect and set callbacks (should use QoS 2 but that's not supported to all client
				const mqtt_options = {
					host: app_config.mqtt.server,
					port: app_config.mqtt.port,
					username: owner,
					password: api_key,
					reconnectPeriod: 30000
				};

				// Setup per-owner MQTT client
				this.setupMqttClient(owner, mqtt_options, callback);

			});
		});
	}

	getDevices(owner, callback) {
		this.devicelib.view("devices", "devices_by_owner", {
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
					console.log("☣️ [error] /api/user/devices: Error: " + err.toString());

					if (err.toString().indexOf("No DB shards could be opened") !== -1) {
						let that = this;
						console.log("ℹ️ [info] Will retry in 5s...");
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
					console.log("ℹ️ [info] using Channel: " + ch);
					this.sendSlack(message, this.channel, callback);
				} else {
					console.log("☣️ [error] Cannot Slack '" + "', no channel given.");
				}
			});
		} else {
			this.sendSlack(message, this.channel, callback);
		}
	}

};
