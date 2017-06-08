/** This THiNX-RTM API module is responsible for managing Sources. */

var Sources = (function() {

	var app_config = require("../../conf/config.json");
	var db = app_config.database_uri;
	var userlib = require("nano")(db).use("managed_users");
	var devicelib = require("nano")(db).use("managed_devices");

	var uuidV1 = require("uuid/v1");
	var sha256 = require("sha256");

	// public
	var _public = {

		/**
		 * List:
		 */

		list: function(owner, callback) {
			userlib.get(owner, function(err, doc) {

				if (err) {
					console.log(err);
					callback(false, err);
					return;
				}

				if (!doc) {
					console.log("Owner " + owner + " not found.");
					callback(false, "user_not_found");
					return;
				}

				callback(true, doc.repos);
			});
		},

		/**
		 * Add
		 */

		add: function(owner, alias, url, branch, callback) {

			var source = {
				alias: alias,
				url: url,
				branch: branch
			};

			userlib.get(owner, function(err, doc) {

				if (err) {
					console.log(err);
					callback(false, err);
					return;
				}

				if (!doc) {
					console.log("Owner " + owner + " not found.");
					callback(false, "user_not_found");
					return;
				}

				// Update user with new repos
				userlib.destroy(doc._id, doc._rev, function(err) {

					delete doc._rev;

					var sid = sha256(JSON.stringify(source));
					doc.repos[sid] = source;

					userlib.insert(doc, doc._id, function(err, body, header) {
						if (err) {
							console.log("/api/user/source ERROR:" + err);
							callback(false, "source_not_added");
							return;
						} else {
							callback(true, {
								success: true,
								source_id: sid
							});
						}
					});
				}); // userlib

			});
		},

		/**
		 * Revoke Source for owner
		 * @param {string} owner - owner._id
		 * @param {string} sources - array of source_ids to be revoked
		 * @param {function} callback(success, message) - operation result callback
		 */

		remove: function(owner, removed_sources, callback) {

			userlib.get(owner, function(err, doc) {

				if (err) {
					console.log(err);
					return;
				}

				if (!doc) {
					console.log("Owner " + owner + " not found.");
					callback(false, "user_not_found");
					return;
				}

				var sources = doc.repos;
				var source_ids = Object.keys(sources);
				var really_removed_repos = [];
				for (var source_id in removed_sources) {
					delete sources[source_id];
					really_removed_repos.push(source_ids[source_id]);
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
							callback(true, really_removed_repos);
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

						function upsert(device) {
							devicelib.destroy(device._id, device._rev, function(err) {
								delete device._rev;
								devicelib.insert(device,
									device._rev,
									function(err) {
										console.log(err);
									}
								);
							});
						}

						for (var rindex in body.rows) {
							//if (!body.rows.hasOwnProperty(rindex)) continue;

							var device;
							if (body.rows[rindex].value !== null) {
								device = body.rows[rindex].value;
							}

							if ((typeof(device) === "undefined")) continue;
							if (device === null) continue;
							if (device.source === null) continue;

							for (var sindex in removed_sources) {
								var removed_source_id = removed_sources[sindex];
								if (device.source == removed_source_id) {
									console.log(
										"repo_revoke alias equal: Will destroy/insert device: " +
										device.source + " to " + source_id
									);
									device.source = null;
									upsert(device);
								}
							}

						}
					});
			});
		}

	};

	return _public;

})();

exports.list = Sources.list;
exports.add = Sources.add;
exports.remove = Sources.remove;
