/**
 * Per-user GitHub access token linking (#392 / GH-01 + GH-02).
 *
 * Validates a user's GitHub access token, stores it on their user document,
 * ensures they have an RSA key (creating one if absent), and pushes the public
 * key to their GitHub account. Collaborators are injected so the flow is
 * unit-testable without live GitHub / CouchDB / filesystem.
 *
 * The result object carries an HTTP `status` so the route stays a thin wrapper.
 * The token itself is never placed in the result.
 */

/**
 * The owner's oldest usable deploy key, by the millisecond timestamp after the last "-"
 * of its filename (`<owner>-<ms>`). A missing, non-string or non-integer timestamp sorts
 * last; ties keep list order. Usable means a non-empty string pubkey AND a fingerprint:
 * list() keeps an unparseable (often PEM-era) .pub as stored with fingerprint null, and
 * pinning that one would send GitHub garbage on every link (45-REVIEW WR-01).
 * Returns undefined when no entry is usable.
 */
function keyTimestamp(entry) {
	if (typeof entry.filename !== "string") return Infinity;
	const digits = entry.filename.slice(entry.filename.lastIndexOf("-") + 1);
	return /^\d+$/.test(digits) ? Number(digits) : Infinity;
}

function isUsable(entry) {
	return !!entry && typeof entry.pubkey === "string" && entry.pubkey.length > 0 &&
		typeof entry.fingerprint === "string" && entry.fingerprint.length > 0;
}

// The usable keys, oldest first (stable for equal timestamps).
function usableKeysOldestFirst(list) {
	return list.filter(isUsable)
		.map((entry, index) => ({ entry, index, ts: keyTimestamp(entry) }))
		.sort((a, b) => (a.ts - b.ts) || (a.index - b.index))
		.map((item) => item.entry);
}


// `type base64` of an OpenSSH line, without the comment, or null.
function keyBlob(line) {
	if (typeof line !== "string") return null;
	const parts = line.trim().split(/\s+/);
	return parts.length >= 2 ? parts[0] + " " + parts[1] : null;
}

// True when the GitHub account's own key list (GET /user/keys) holds this public key.
function onAccount(accountKeys, pubkey) {
	const blob = keyBlob(pubkey);
	if (blob === null || !Array.isArray(accountKeys)) return false;
	return accountKeys.some((k) => k && keyBlob(k.key) === blob);
}

module.exports = class GitHubLink {

	/**
	 * @param {object} deps - { GitHub, rsakey, user }
	 * @param {string} owner_id - sanitised session owner
	 * @param {string} token - GitHub access token
	 * @param {function} callback({ status, success, response })
	 */
	static link(deps, owner_id, token, callback) {
		const GitHub = deps.GitHub;
		const rsakey = deps.rsakey;
		const user = deps.user;

		if (!token) {
			return callback({ status: 400, success: false, response: "missing_token" });
		}

		// 1. Validate the token with GitHub BEFORE storing anything.
		GitHub.validateAccessToken(token, (valid, accountKeys) => {
			if (!valid) {
				// 403: GitHub accepted the token but it may not read SSH keys
				// (admin:public_key, or read:public_key + write:public_key; fine-grained:
				// "Git SSH keys" read and write). Anything else: the token is not valid.
				if (accountKeys && accountKeys.status === 403) {
					return callback({ status: 403, success: false, response: "github_token_missing_scope" });
				}
				return callback({ status: 401, success: false, response: "github_token_invalid" });
			}

			// 2. Persist the token on the caller's user document.
			user.addGitHubAccessToken(owner_id, token, (stored) => {
				if (!stored) {
					return callback({ status: 500, success: false, response: "token_store_failed" });
				}

				// key_pushed is true only when the key is on the account afterwards: GitHub
				// created it (201), or answered "key is already in use" and the account's own
				// key list, read at validation, holds it. GitHub says "in use" for a key on
				// another account or a repository too, and 422 for an invalid key (WR-01).
				const finish = (present, created, skipped) => callback({
					status: 200,
					success: true,
					response: { key_pushed: present, created_key: created, keys_in_use_elsewhere: skipped }
				});

				// Pushes one key. done(present, inUseElsewhere): GitHub answers "key is already
				// in use" for a key on this account, on another account or as a repository
				// deploy key; only the first counts as present (key list read at validation).
				const push = (pubkey, done) => {
					GitHub.addPublicKey(token, pubkey, (pushed, outcome) => {
						if (pushed === true) return done(true, false);
						const inUse = !!outcome && outcome.result === "already_in_use";
						if (inUse && onAccount(accountKeys, pubkey)) return done(true, false);
						done(false, inUse);
					});
				};

				const createAndPush = (skipped) => {
					rsakey.create(owner_id, (csuccess, info) => {
						// Phase 40 D-03: OpenBao unavailable or THINX_DEPLOY_KEYGEN off. The same
						// fixed code the rsakey routes give; nothing is pushed.
						if (!csuccess && info === "key_service_unavailable") {
							return callback({ status: 503, success: false, response: "key_service_unavailable" });
						}
						if (!csuccess || !info || !info.pubkey) {
							return callback({ status: 500, success: false, response: "rsa_key_creation_failed" });
						}
						push(info.pubkey, (present) => finish(present, true, skipped));
					});
				};

				// 3. Push the owner's OLDEST usable key by filename timestamp (Phase 45 D-13).
				//    A key GitHub reports in use elsewhere (another account or a repository
				//    deploy key) can never be added here, so the next-oldest is tried, and when
				//    every key is taken a fresh key is created and pushed. Any other refusal
				//    (invalid key, auth, 5xx) stops at once. With no usable key, one is created.
				rsakey.list(owner_id, (lsuccess, list) => {
					const keys = (lsuccess && Array.isArray(list)) ? usableKeysOldestFirst(list) : [];
					if (keys.length === 0) return createAndPush(0);
					const tryKey = (index, skipped) => {
						if (index >= keys.length) return createAndPush(skipped);
						push(keys[index].pubkey, (present, inUseElsewhere) => {
							if (present) return finish(true, false, skipped);
							if (inUseElsewhere) return tryKey(index + 1, skipped + 1);
							finish(false, false, skipped);
						});
					};
					tryKey(0, 0);
				});
			});
		});
	}
};
