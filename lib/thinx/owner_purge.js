/**
 * Owner purge orchestrator (GDPR #353 / SEC-PII-03).
 *
 * Removes EVERY owner-scoped artifact across all stores in one place, reused by
 * both the on-demand `DELETE /api/v2/gdpr` endpoint and the scheduled expiry
 * sweep. Each step is isolated (one failing step does not abort the rest), the
 * run is idempotent (missing artifacts are not errors), and a per-step audit
 * line is emitted so deletion is provable.
 *
 * Safety: every filesystem delete target passes through `safeOwnerPath()`, a
 * pure gate that rejects any owner id that is not a sanitised `[a-z0-9]{64,}`
 * document id and asserts the resolved path cannot escape `data_root`.
 */

const path = require("path");
const fs = require("fs-extra");
const Sanitka = require("./sanitka");

module.exports = class OwnerPurge {

	/**
	 * Pure, dependency-light path-safety gate.
	 * @returns {string|null} absolute path `data_root/<base>/<owner>`, or null if unsafe.
	 */
	static safeOwnerPath(data_root, base_segment, owner) {
		const safe_owner = Sanitka.document_id(owner); // ^[a-z0-9]{64,}$ or null
		if (!safe_owner) return null;
		if (safe_owner !== owner) return null; // refuse silently-normalised input
		const target = path.join(data_root, base_segment, safe_owner);
		const root = path.resolve(data_root) + path.sep;
		const resolved = path.resolve(target);
		if (!resolved.startsWith(root)) return null; // escaped data_root
		if (path.basename(resolved) !== safe_owner) return null; // not the owner leaf
		return target;
	}

	constructor(redis, devices, deps) {
		this.redis = redis;
		this.devices = devices; // optional injected Devices instance

		// Collaborators are injectable for testing; in production they are built
		// from the live modules. `deps` lets a spec exercise the orchestration
		// (step order, del-not-expire, idempotency) with fakes and no services.
		deps = deps || {};

		if (deps.app_config) {
			this.app_config = deps.app_config;
		} else {
			const Globals = require("./globals.js");
			this.app_config = Globals.app_config();
		}

		if (deps.userlib) {
			this.userlib = deps.userlib;
		} else {
			const Globals = require("./globals.js");
			const Database = require("./database.js");
			const db_uri = new Database().uri();
			this.userlib = require("nano")(db_uri).use(Globals.prefix() + "managed_users");
		}

		if (deps.rsakey) {
			this.rsakey = deps.rsakey;
		} else {
			const RSAKey = require("./rsakey.js");
			this.rsakey = new RSAKey();
		}

		if (deps.buildlog) {
			this.buildlog = deps.buildlog;
		} else {
			const Buildlog = require("./buildlog.js");
			this.buildlog = new Buildlog();
		}

		if (deps.alog) {
			this.alog = deps.alog;
		} else {
			const AuditLog = require("./audit.js");
			this.alog = new AuditLog();
		}
	}

	// --- small promise wrappers around the callback-based collaborators ---

	_removeTree(absPath) {
		return fs.remove(absPath); // fs-extra: no-op if path is missing (idempotent)
	}

	_redisDel(key) {
		return new Promise((resolve) => {
			this.redis.del(key, () => resolve());
		});
	}

	_redisKeys(pattern) {
		return new Promise((resolve) => {
			this.redis.keys(pattern, (_err, keys) => resolve(Array.isArray(keys) ? keys : []));
		});
	}

	_purgeBuilds(owner) {
		return new Promise((resolve) => {
			this.buildlog.purgeOwner(owner, (_err, destroyed) => resolve(destroyed || 0));
		});
	}

	_revokeDevices(owner) {
		return new Promise((resolve) => {
			if (!this.devices || typeof this.devices.list !== "function") return resolve("no_devices_instance");
			this.devices.list(owner, (success, body) => {
				if (!success || !body || !Array.isArray(body.response) || body.response.length === 0) {
					return resolve(0);
				}
				const udids = body.response.map((d) => d && d.udid).filter(Boolean);
				if (udids.length === 0) return resolve(0);
				this.devices.revoke(owner, { udids: udids }, () => resolve(udids.length));
			});
		});
	}

	_destroyUserDoc(owner) {
		return new Promise((resolve, reject) => {
			this.userlib.get(owner, (gerr, udoc) => {
				if (gerr || !udoc) return resolve("user_doc_absent"); // already gone — idempotent
				this.userlib.destroy(udoc._id, udoc._rev, (derr) => {
					if (derr) return reject(derr);
					resolve("destroyed");
				});
			});
		});
	}

	/**
	 * Purge every artifact owned by `owner`.
	 * Order: devices+MQTT → builds → RSA keys → filesystem trees → Redis → user doc (last).
	 * @param {string} owner - owner._id
	 * @param {function} callback(success, report)
	 */
	async purge(owner, callback) {
		const report = { owner: owner, steps: {}, ok: true };

		const safe_owner = Sanitka.document_id(owner);
		if (!safe_owner || safe_owner !== owner) {
			report.ok = false;
			report.error = "invalid_owner";
			if (typeof callback === "function") callback(false, report);
			return report;
		}

		const run = async (name, fn) => {
			try {
				report.steps[name] = { ok: true, result: await fn() };
			} catch (e) {
				report.ok = false;
				report.steps[name] = { ok: false, error: (e && e.message) ? e.message : String(e) };
			}
			this.alog.log(owner, `GDPR purge step '${name}': ${report.steps[name].ok ? "ok" : "FAILED"}`, report.steps[name].ok ? "info" : "error");
		};

		await run("devices", () => this._revokeDevices(owner));
		await run("builds", () => this._purgeBuilds(owner));
		await run("rsa_keys", () => this.rsakey.revokeAllForOwner(owner));

		const deployPath = OwnerPurge.safeOwnerPath(this.app_config.data_root, this.app_config.deploy_root, owner);
		const repoPath = OwnerPurge.safeOwnerPath(this.app_config.data_root, this.app_config.build_root, owner);
		await run("deploy_tree", () => (deployPath ? this._removeTree(deployPath) : Promise.reject(new Error("unsafe_deploy_path"))));
		await run("repo_tree", () => (repoPath ? this._removeTree(repoPath) : Promise.reject(new Error("unsafe_repo_path"))));

		await run("redis", async () => {
			await this._redisDel("ak:" + owner);
			const keys = await this._redisKeys("/" + owner + "/*");
			for (const key of keys) await this._redisDel(key);
			return keys.length + 1;
		});

		// User document destroyed LAST: if an earlier step fails the account is
		// still discoverable for a safe re-run.
		await run("user_doc", () => this._destroyUserDoc(owner));

		if (typeof callback === "function") callback(report.ok, report);
		return report;
	}
};
