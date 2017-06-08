/** This THiNX-RTM API module is responsible for managing Sources. */

var Sources = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var userlib = require("nano")(db).use("managed_users");
	var devicelib = require("nano")(db).use("managed_devices");

	var uuidV1 = require("uuid/v1");

	// public
	var _public = {

		/**
		 * Revoke Source for owner
		 * @param {string} owner - owner._id
		 * @param {string} sources - array of source_ids to be revoked
		 * @param {function} callback(success, message) - operation result callback
		 */

		remove: function(owner, removed_sources, callback) {

			userlib.get(owner, function(err, user) {

				if (err) {
					console.log(err);
					return;
				}

				var doc = user;

				if (!doc) {
					console.log("Owner " + owner + " not found.");
					callback(false, "user_not_found");
					return;
				}

				var sources = doc.repos;

				for (var source_id in sources) {
					delete sources[source_id];
				}

				// Update user with new repos
				userlib.destroy(doc._id, doc._rev, function(err) {
					doc.repos = sources;
					delete doc._rev;
					userlib.insert(doc, doc._id, function(err, body, header) {
						if (err) {
							console.log("/api/user/source ERROR:" + err);
							callback(false, "source_not_removed");
							return;
						} else {
							callback(true, {
								success: true,
								source: doc
							});
						}
					});
				}); // userlib

				devicelib.view("devicelib", "devices_by_owner", {
						key: owner,
						include_docs: true
					},

					function(err, body) {

						if (err) {
							console.log(err);
							// no devices to be detached
						}

						if (body.rows.length === 0) {
							console.log("no-devices to be detached; body: " +
								JSON.stringify(body));
							// no devices to be detached
						}

						// Warning, may not restore device if called without device parameter!
						var insert_on_success = function(err, device) {
							var newdevice = device;
							delete newdevice._rev;
							delete newdevice._deleted_conflicts;
							devicelib.insert(newdevice, newdevice._id, function(
								err) {
								if (err) {
									console.log(
										"(3) repo_revoke_pre-insert err:" + err
									);
								}
							});
						};

						function insert(err, device) {
							delete device._rev;
							insert_on_success(err, device);
						}

						function callback(err, device) {
							delete device._rev;
							if (err) insert(err, device);
						}

						for (var rindex in body.rows) {

							if (!body.rows.hasOwnProperty(rindex)) continue;

							var device;
							if (!body.rows[rindex].hasOwnProperty("value")) {
								continue;
							} else {
								if (body.rows[rindex].value !== null) {
									device = body.rows[rindex].value;
								}
							}

							if ((typeof(device) === "undefined")) return;
							if (device === null) return;

							if (device.source == source_id) {
								console.log(
									"repo_revoke alias equal: Will destroy/insert device."
								);
								device.source = null;

								devicelib.insert(device,
									device._rev,
									callback(err, device)
								);
							}
						}

					}); // devicelib

			});
		},

		add: function(owner, alias, url, branch, callback) {

			var source_id = uuidV1();

			userlib.get(owner, function(err, body) {

				if (err) {
					console.log(err);
					return;
				}

				var doc = body;

				if (!doc) {
					console.log("User " + owner + " not found.");
					callback(false, "key-user_not_found-added");
					return;
				}

				var new_source = {
					alias: alias,
					url: url,
					branch: branch
				};

				if (typeof(doc.repos) === "undefined") {
					doc.repos = {};
				}

				doc.repos[source_id] = new_source;
				userlib.destroy(doc._id, doc._rev, function(err) {
					delete doc._rev;
					userlib.insert(doc, doc._id, function(err, body, header) {
						if (err) {
							console.log("/api/user/source ERROR:" + err);
							callback(false, "key-not-added");
							return;
						} else {
							callback(true, {
								success: true,
								source: new_source,
								source_id: source_id
							});
						}
					});
				});
			});
		},

		list: function(owner, callback) {
			userlib.get(owner, function(err, user) {
				if (err) {
					console.log(err);
					callback(false, "api-user-apikey-list_error");
				} else {
					console.log("sources list for user: " + JSON.stringify(user));
					callback(true, user.repos);
				}
			});
		}

	};

	return _public;

})();

exports.list = Sources.list;
exports.add = Sources.add;
exports.remove = Sources.remove;
