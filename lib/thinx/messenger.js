/** This THiNX Device Management API module is responsible for managing MQTT communication. */

// specific imports
const base64 = require("base-64");
const GRQ = require('get-random-quote');
const dateFormat = require("dateformat");

const { RTMClient, LogLevel } = require('@slack/rtm-api');
const { WebClient } = require('@slack/web-api');

// generic imports
const Globals = require("./globals.js");
const app_config = Globals.app_config();
const prefix = Globals.prefix();

// uses message queue
const mqtt = require("mqtt");

const Database = require("./database.js");

// core imports
const Auth = require("./auth");
const ApiKey = require("./apikey"); 
const Device = require("./device");
const Owner = require("./owner");
const Util = require("./util.js");

module.exports = class Messenger {

	//
	// • Sends a message to device using MQTT, internally provides path and authentication.
	// • Each user should use own MQTT password/apikey.
	// • ACLs/role needs to be adjusted for messenger to work globally.
	// • There should be one Messenger instance per owner.
	// • Messenger fetches device list based on the owner.
	// • Provides topic-based (should support regex) subscription callback.
	//

	createInstance(redis, password) {

		if (typeof(redis) === "undefined") throw new Error("Messenger now requires connected Redis.");

		this.akey = new ApiKey(redis);

		this.devicelib = require("nano")(new Database().uri()).use(prefix + "managed_devices");

		this.redis = redis;

		this.password = password; // dynamic password for Mosquitto Broker

		this.master = null;
		this.socket = null;
		this.channel = null;
		this.clients = {};
		this.web = null;
		this.rtm = null;
		this.once = false;
		this.instance = null;
		this.user = new Owner(redis);
		this.device = new Device(redis);
		this.auth = new Auth(redis);

		this._private = {
			_owner: null,
			_devices: null,
			_socket: null
		};

		this.DISABLE_SLACK = true;

		this.init(password);

		//this.initSlack(); must be done later, not in constructor


		return this;
	}

	getInstance(redis, password) {
		if (!this.instance) {
			this.instance = this.createInstance(redis, password);
		}
		return this.instance;
	}

	constructor(redis, password) {
		this.getInstance(redis, password);
	}

	sendRandomQuote(opt_callback) {

		if (this.DISABLE_SLACK) {
			if (typeof (opt_callback) !== "undefined") return opt_callback();
		}

		new GRQ().then((quote) => {
			var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;

			if (this.web) {
				console.log("SLACK DEBUG: Sending random quote", message, "to channel", this.channel);
				this.web.chat.postMessage({ channel: this.channel, text: message })
					.catch("☣️ [error] " + console.error);
			}

			if (typeof (opt_callback) !== "undefined") opt_callback();

		}).catch((err) => {
			console.log("☣️ [error] Random quote error", err);
		});

	}

	async getBotToken() {

		var bot_token = null;

		// Default built-in startup token
		if ((typeof (process.env.SLACK_BOT_TOKEN) !== "undefined") && (process.env.SLACK_BOT_TOKEN !== null)) {
			bot_token = process.env.SLACK_BOT_TOKEN;
		}

		let saved_token = await this.redis.get("__SLACK_BOT_TOKEN__");

		if ((typeof (saved_token) === "undefined") || saved_token === null) {
			return Promise.resolve(bot_token);
		} else {
			return Promise.resolve(saved_token);
		}
	}

	async initSlack(callback) {

		if (this.DISABLE_SLACK) return callback(true);

		let bot_token = await this.getBotToken();

		if ((typeof (process.env.SLACK_BOT_TOKEN) !== "undefined") && (process.env.SLACK_BOT_TOKEN !== null)) {
			bot_token = process.env.SLACK_BOT_TOKEN;
		}

		if ((typeof (bot_token) === "undefined") || (bot_token == null) || (bot_token == "")) {
			console.log("☣️ [error] Skipping Slack RTM, no bot token available.");
			return callback(false);
		}

		console.log("✅ [info] Creating Slack RTM client...");

		this.rtm = new RTMClient(bot_token, {
			logLevel: LogLevel.DEBUG
		});

		console.log("✅ [info] Creating Slack WEB client...");

		this.attachCallbacks(); // expects this.rtm and this.web to exist		

		/* Inline variant:
(async () => {
	// Connect to Slack
	const { self, team } = await rtm.start();
  })();
  */
		this.rtm.start().then((self, team) => {
			console.log("✅ [info] Slack RTM started...", { self }, { team });
			callback(true);
		}).catch(s => {
			console.log("!!! initSlack error", s);
		});

		console.log("✅ [info] Creating Slack WEB client completed.");
	}

	fetchKeyAndPublish(owner, udid, message) {
		this.user.mqtt_key(owner, (success, apikey) => {
			if (!success) {
				console.log("☣️ [error] [publish] API Key fetch failed, not possible to create custom owner's MQTT client...");
				return;
			}
			this.clients[owner] = mqtt.connect(app_config.mqtt.server, {
				host: app_config.mqtt.server,
				port: app_config.mqtt.port,
				username: owner,
				password: apikey.key
			});
			console.log(`✅ [info] [publish] Created new MQTT client for owner ${owner}`);
			if (typeof (message) === "object") message = JSON.stringify(message);
			this.publish(owner, udid, message);
		});
	}

	publish(owner, udid, message) {

		if (this.DISABLE_SLACK) return callback(true);

		// Calls itself recursively in case there is no client ready
		if (typeof (this.clients[owner]) === "undefined" || this.clients[owner] === null) {
			this.fetchKeyAndPublish(owner, udid, message);
			return;
		}

		var mqtt_topic = "/" + owner + "/" + udid;

		// Check for actionable notifications and pick up transaction from Redis
		// In case the notification contains 'nid'; send only 'reply' and delete this nid from redis.
		if (typeof (message.nid) !== "undefined") {
			var nid = "nid:" + message.nid;
			message.topic = mqtt_topic;
			message.done = true; // user already responded; never notify again...
			this.redis.set(nid, JSON.stringify(message));
		}
		this.clients[owner].publish(mqtt_topic, JSON.stringify(message));
	}

	fetchAndUpdateChannel(token) {

		if (this.DISABLE_SLACK) return;

		let web = new WebClient(token, {
			rejectRateLimitedCalls: true
		});

		web.conversations.list({ limit: 20 })
			.then((response) => {
				for (var c in response.channels) {
					const conversation = response.channels[c];
					if (conversation.name == app_config.slack.bot_topic) {
						console.log("🔨 [debug] [slack] Conversation found...");
						this.channel = conversation.id;
						this.redis.set("slack-conversation-id", conversation.id);
						return;
					}
				}
				console.log("☣️ [error] [slack:rtm::ready] No Slack conversation ID in channels, taking first from:", response.channels);
				this.channels = response.channels[0].id;
			})
			.catch((error) => {
				// Error :/
				console.log('☣️ [error] [slack:rtm::ready] Conversations list error:');
				console.log(error);
			});

	}

	attachCallbacks() {

		if (this.rtm === null) {
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
			}
		});

		this.rtm.on('ready', async (rtmStartData) => {
			// This logging is probably deprecated. The 'ready' event returns nothing.
			if (rtmStartData) {
				console.log("RTM Ready with data: ", rtmStartData);
			}
			let result = await this.redis.get("slack-conversation_id");
			if (result) {
				this.channels = result;
				return;
			}
			this.getBotToken().then((token) => {
				this.fetchAndUpdateChannel(token);
			});
		});
	}

	registerDevice(_registration, _auth, _res, oid) {
		this.device.register(
			_registration,
			_auth,
			_res,
			(_r, reg_success, registration_response) => {
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
				this.publish(oid, registration_response.registration.udid, JSON.stringify(registration_response));
			}, null);
	}

	sendWithValidSocket(notif) {
		if ((this._socket !== null) && (this._socket.readyState === this.socket.OPEN)) {
			this._socket.send(JSON.stringify(notif));
		}
	}

	ensureJSON(message) {
		try {
			message = JSON.parse(message.toString());
		} catch (parser_error) {
			try {
				message = JSON.parse(message);
			} catch (parser_err) { /* if not JSON it's just a message so we can ignore this */ }
		}
		return message;
	}

	forwardNonNotification(message) {

		if ((typeof (this.rtm) !== "undefined") &&
			(typeof (message.notification) === "undefined") &&
			(typeof (this.channel) !== "undefined")) {
			// FIXME: Not testable on CircleCI
			if (process.env.ENVIRONMENT !== "test") {
				this.rtm.sendMessage(message, this.channel);
			}
		}
	}

	mqttDeviceRegistration(topic, message, oid) {
		if ((topic.indexOf("/status") !== -1) &&
			(typeof (message.registration) !== "undefined") &&
			(message.registration !== null)) {
			console.log("🚫 [critical] MQTT Registration NOT IMPLEMENTED in messenger...: " + JSON.stringify(message, null, 4));
			const _ws = null;
			this.akey.get_first_apikey(oid, (success, apikey) => {
				if (!success) {
					this.user.create_default_mqtt_apikey(oid, (result) => {
						let _auth = result.key;
						this.registerDevice(message.registration, _auth, _ws, oid);
					});
				} else {
					let _auth = apikey.key;
					this.registerDevice(message.registration, _auth, _ws, oid);
				}
			});
		}
	}

	updateAndTransformDeviceStatus(oid, did, message, topic) {
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
				this.device.edit(changes, (success, a_message) => {
					if (!success) {
						console.log("☣️ [error] MQTT Device Edit Failed with status:", JSON.stringify(a_message));
					}
				});

				this.user.profile(oid, (profile) => {
					this.device.runDeviceTransformers(profile, body, null, null, null);
				});
			}
		});
	}

	processStatus(did, message) {
		this.devicelib.get(did, (error, body) => {
			if (error) {
				console.log(error);
				return;
			}

			if (message.status == "connected") {
				this.sendWithValidSocket({
					notification: {
						title: "Check-in",
						body: "Device " + body.alias + " checked-in.",
						type: "info",
						udid: did
					}
				});
			} else if (message.status == "disconnected") {
				this.sendWithValidSocket({
					notification: {
						title: "Check-out",
						body: "Device " + body.alias + " disconnected.",
						type: "warning",
						udid: did
					}
				});
			}
		});
	}

	processConnectionChange(oid, did, message) {
		if (message.connected === true) {
			this.sendWithValidSocket({
				notification: {
					title: "Device Connected",
					body: oid,
					type: "info",
					udid: did
				}
			});
		} else {
			this.sendWithValidSocket({
				notification: {
					title: "Device Disconnected",
					body: oid,
					type: "warning",
					udid: did
				}
			});
		}
	}

	processActionableNotification(did, topic, message) {

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

			this.redis.get(nid).then((result) => {

				if (result) {
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
				if ((this._socket !== null) && (this._socket.readyState === this.socket.OPEN)) {
					this._socket.send(JSON.stringify(actionable));
				} else {
					console.log("☣️ [error] Socket not ready.");
				}

				// Attach reply-to topic and store to Redis
				actionable.topic = topic; // reply-to
				actionable.done = false; // user did not respond yet
				var not = JSON.stringify(actionable);
				console.log("ℹ️ [info] Saving actionable: " + not);
				this.redis.set("nid:" + did, not);
			});

		} else {

			var notification_to = message.notification;

			// Message for device

			console.log("NID message for device :" + notification_to.nid +
				" : " +
				JSON.stringify(message));

			// Search existing transaction
			this.redis.get("nid:" + notification_to.nid).then((json_keys) => {
				var nid_data = JSON.parse(json_keys);
				if (!err) {
					// NID transaction already exists, update data...
					if (!Util.isDefined(nid_data)) nid_data = {};
					nid_data.done = true;
					nid_data.response = notification_to.response;
					nid_data.response_type = notification_to.response_type;
				} // if err this is new transaction
				this.redis.set("nid:" + did, JSON.stringify(nid_data));
			});
		}

		// Debug unknown notifications (will deprecate)
	}

	processUnknownNotification(message) {
		var notification_unknown = {
			notification: {
				title: "☣️ [error] [DEBUG] Generic Message",
				body: message.toString(),
				type: "success"
			}
		};
		if ((this._socket !== null) && (this._socket.readyState === this.socket.OPEN)) {
			this._socket.send(JSON.stringify(notification_unknown));
		}
	}

	processActionableMessages(message, oid, did, topic) {

		// Status message
		if (Util.isDefined(message.status)) {
			this.processStatus(did, message);

			// Match by message.connected (should be optional)
		} else if (Util.isDefined(message.connected)) {
			this.processConnectionChange(oid, did, message);

			// Match by Actionability
		} else if (Util.isDefined(message.notification)) {
			this.processActionableNotification(did, topic, message);

		} else {
			this.processUnknownNotification(message);
		}
	}

	messageResponder(topic, message) {

		// Validation
		if (!Util.isDefined(message)) return;
		if (!Util.isDefined(topic)) return;

		message = this.ensureJSON(message);

		// Forward bare message (if it is not an actionable "".notification")
		// more information about additional params https://api.slack.com/methods/chat.postMessage
		// define channel, where bot exist. You can adjust it there https://my.slack.com/services
		this.forwardNonNotification(message);

		// Extract owner-id and device-id
		var origins = topic.split("/");
		var oid = origins[1];
		var did = origins[2];

		// MQTT Registration suport
		this.mqttDeviceRegistration(topic, message, oid);

		// Update device status and run Transformers on it
		this.updateAndTransformDeviceStatus(oid, did, message, topic);

		// Process other well-known mesages
		// Match by message.status (should be optional)
		this.processActionableMessages(message, oid, did, topic);
	}

	postRandomQuote(quote, opt_callback) {
		var message = "*" + Globals.app_config().public_url + "* : " + quote.text + " – " + quote.author;

		if (typeof (this.channel) === "undefined") {
			console.log("☣️ [error] Cannot post without Slack channel.");
			return;
		}

		if (this.web) {
			this.web.chat.postMessage({ channel: this.channel, text: message })
				.then((res) => {
					console.log(`ℹ️ [info] Slack Message sent: ${res.ts}`);
				})
				.catch(console.error);
		}
		if (typeof (opt_callback) !== "undefined") opt_callback();
	}

	setupMqttClient(owner, mqtt_options, callback) {

		try {
			this.clients[owner] = mqtt.connect(app_config.mqtt.server, mqtt_options);
		} catch (e) {
			return callback(false, e);
		}

		if (typeof (this.clients[owner]) === "undefined") {
			console.log("DEVELOPER/TEST ERROR – MQTT CONNECT FAILED, probably invalid mock.");
			return callback(false, "mqtt_connect_failed");

		}

		this.clients[owner].on("connect", (error) => {
			console.log(`ℹ️ [info] Messenger ${owner} connected, subscribing with result ${JSON.stringify(error)}`);
			if (typeof (this.clients[owner]) !== "undefined") {
				this.clients[owner].subscribe("/" + owner + "/#");
			} else {
				console.log(`[debug] this.clients[owner] undefined in connect with error ${error.toString()}`);
			}
		});

		this.clients[owner].on("error", (error) => {
			if (error.toString().indexOf("Not authorized") != -1) {
				console.log(`[error] MQTT Owner ${owner} not authorized to access using apikey [redacted], stopping...`);
				if (typeof (this.clients[owner]) !== "undefined") {
					if (typeof (this.clients[owner].end) === "function") {
						this.clients[owner].end();
						return;
					}
				}
			}
			console.log("MQTT: error " + error);
		});

		this.clients[owner].on('close', () => {
			if (process.env.ENVIRONMENT !== "test") { // spams rollbar
				console.log(`ℹ️ [info] [mqtt] Connection closed for ${owner}`);
			}
		});

		// Message Responder
		this.clients[owner].on("message", (topic, message) => {
			this.messageResponder(topic, message);
		});

		// Successful initialization is enough in test to prevent hang
		if (process.env.ENVIRONMENT == "test") {
			console.log("MQTT: callback in test...");
			callback(true);
		}
	}

	sendSlack(message, chan, callback) {

		if (typeof (message) == "undefined") return callback(true, message);
		if (message === null) return callback(true, message);

		// do not spam Slack by tests
		if (process.env.ENVIRONMENT == "test") return callback(true, message);

		if (this.DISABLE_SLACK) return callback(true, message);

		this.rtm.sendMessage(message, chan, (/* err, response */) => {
			callback(false /*error*/, "message_sent");
		}).catch((e) => {
			// Slack API May throw
			console.log("🔆 [audit] Slack API Exception: ", chan, message, e);
			callback(true, e);
		});
	}

	inject_password(password, callback) {

		const account = "thinx";

		this.auth.add_mqtt_credentials(account, password, () => {
			const ACL = require('./acl.js');
			let acl = new ACL(this.redis, account);
			acl.load(() => {
				acl.addTopic(account, "readwrite", "/#");
				acl.commit();
				callback();
			});
		});
	}

	connect_callback(packet) {
		if (packet.returnCode != 0) {
			console.log("[error] connect_callback", packet);
		} else {
			console.log("[info] subscribing all channels");
			if (this.master) {
				this.master.subscribe("#");
			}
		}
	}

	error_callback(error) {
		if (error.toString().indexOf("Not authorized") !== -1) {
			console.log(`🚫 [critical] MQTT connection not authorized with password`, error);
		} else {
			console.log("☣️ [error] MQTT error:", error);
		}
	}

	message_callback(topic, message) {
		if (message.toString().length === 0) return;

		const enc_message = base64.encode(message); // prevent attacks on Redis
		const iso_date = dateFormat(new Date(), "isoDate");

		this.redis.get(topic + "@" + iso_date).then((json_keys) => {

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

			this.redis.set(topic + "@" + iso_date, JSON.stringify(newkeys));
		});

		// Keeps MQTT Data for 24 hours only
		this.redis.expire(topic, 3 * 86400);
	}

	attach_callbacks() {
		this.master.on("connect", this.connect_callback);
		this.master.on("error", this.error_callback);
		this.master.on("message", this.message_callback);
	}

	init(password) {

		var mqtt_password = password;

		console.debug("ℹ️ [info] Process environment: %s, latest git tag: %s", process.env.ENVIRONMENT, process.env.REVISION);

		this.inject_password(mqtt_password, () => {

			console.log("ℹ️ [info] in Messenger.init: MQTT credentials refresh complete, initializing Messenger...");

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
		this.redis.get(reply).then((json_keys) => {
			var keys = {};
			try {
				keys = JSON.parse(json_keys);
			} catch (e) {
				console.log("☣️ [error] [messenger] reply_parser_exception " + e);
			}
			if (err) {
				return callback(false, "[]");
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
		console.log("[info] Getting messenger data for owner: " + owner + "and udid: " + udid);
		let replies = this.redis.sendCommand(["KEYS", "/*" + owner + "/" + udid + "*"]);
		console.log("[info] Getting messenger data for owner:", { _err }, { replies });
		//if ((_err !== null) || (replies.length == 0)) return callback(false, "no_data");
		var results = {};
		replies.forEach((reply, i) => {
			console.log("[messenger data]:    " + i + ": " + reply);
			this.get_result_or_callback(reply, i, callback, results, replies);
		});
	}

	initWithOwner(owner, websocket, callback) {

		if ((typeof (websocket) === "undefined") || websocket === null) {
			console.log("[messenger] init without socket for owner " + owner);
			if (process.env.ENVIRONMENT !== "test") {
				callback(false, "init_without_socket_error");
				return;
			}
		}

		this._socket = websocket;

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
						console.log("🔨 [debug] MQTT: create_default_mqtt_apikey result", result);
						if (result === false) {
							console.log("🔨 [debug] MQTT: err_apikey_fetch_generate_failed");
							callback(false, "err_apikey_fetch_generate_failed");
						}
					});
				}

				// Happens in case there is freshly created user.
				if ((typeof (apikey) === "undefined") || (typeof (apikey.hash) === "undefined")) {
					console.log(`☣️ [error] MQTT: No API keys ${apikey} found in Redis for this owner. Database persistency not enabled?`);
				}

				if ((typeof (this.clients[owner]) !== "undefined") && (this.clients[owner] !== null)) {
					callback(true, "client_already_exists");
					return;
				}

				let api_key = null;
				if (typeof (apikey) !== "undefined") {
					api_key = apikey.key;
				}

				if (api_key == null) {
					callback(false, "messenger_init_failed_no_apikey_for_owner" + owner);
					return;
				}

				// Connect and set callbacks (should use QoS 2 but that's not supported to all client
				let mqtt_options = {
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
		}, (err, body) => {
			if (err) {
				console.log("☣️ [error] /api/user/devices: Error: " + err.toString());
				return callback(false, "no_such_owner_device");
			}

			var rows = body.rows; // devices returned
			var devices = [];
			for (var row in rows) {
				var rowData = rows[row];
				var a_device = rowData.value;
				var topic = "/" + owner + "/" + a_device.udid;
				devices.push(topic);
			}
			if ((typeof (callback) == "function") && (typeof (callback) !== "undefined")) {
				callback(true, devices);
			}
		});
	}

	// Receive a WS chat message and slack it...
	slack(_owner, message, callback) {
		// define global channel, where bot exist. You can adjust it there https://my.slack.com/services
		if ((typeof (this.channel) === "undefined") || (this.channel === null)) {
			console.log("☣️ [error] Cannot Slack '" + this.channel + "', no channel given.");
			callback(false, "no_slack_channel");
		} else {
			this.sendSlack(message, this.channel, callback);
		}
	}

	push(owner, body, callback) {
		if ((typeof (body.udid) === "undefined") && (typeof (body.udids) === "undefined")) {
			return callback(false, "missing_udids");
		}
		var udids = [];
		if (typeof (body.udid) === "string") {
			udids = [body.udid];
		}
		if (typeof (body.udids) === "object") {
			udids = body.udids;
		}
		for (var dindex in udids) {
			this.publish(owner, udids[dindex], JSON.stringify({ configuration: body.enviros }));
		}
		callback(true, "pushing_configuration");
	}
};
