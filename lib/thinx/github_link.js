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
function oldestKey(list) {
	let best;
	let bestTs = Infinity;
	for (const entry of list) {
		if (!entry || typeof entry.pubkey !== "string" || entry.pubkey.length === 0) continue;
		if (typeof entry.fingerprint !== "string" || entry.fingerprint.length === 0) continue;
		let ts = Infinity;
		if (typeof entry.filename === "string") {
			const digits = entry.filename.slice(entry.filename.lastIndexOf("-") + 1);
			if (/^\d+$/.test(digits)) ts = Number(digits);
		}
		if (best === undefined || ts < bestTs) {
			best = entry;
			bestTs = ts;
		}
	}
	return best;
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
				const push = (pubkey, created) => {
					GitHub.addPublicKey(token, pubkey, (pushed, outcome) => {
						const present = pushed === true ||
							(!!outcome && outcome.result === "already_in_use" && onAccount(accountKeys, pubkey));
						callback({
							status: 200,
							success: true,
							response: { key_pushed: present, created_key: created }
						});
					});
				};

				// 3. Push the owner's OLDEST key by filename timestamp, whatever order
				//    list() returns (newest first). A newer repository-specific key
				//    therefore never becomes the account-wide key (Phase 45 D-13).
				//    With no usable key, one is created and pushed.
				rsakey.list(owner_id, (lsuccess, list) => {
					const oldest = (lsuccess && Array.isArray(list)) ? oldestKey(list) : undefined;
					if (oldest) {
						push(oldest.pubkey, false);
					} else {
						rsakey.create(owner_id, (csuccess, info) => {
							if (!csuccess || !info || !info.pubkey) {
								return callback({ status: 500, success: false, response: "rsa_key_creation_failed" });
							}
							push(info.pubkey, true);
						});
					}
				});
			});
		});
	}
};
