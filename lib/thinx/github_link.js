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
 * The owner's oldest deploy key that has a public key, by the millisecond
 * timestamp after the last "-" of its filename (`<owner>-<ms>`). A missing,
 * non-string or non-integer timestamp sorts last; ties keep list order.
 * Returns undefined when no entry has a non-empty string pubkey.
 */
function oldestKey(list) {
	let best;
	let bestTs = Infinity;
	for (const entry of list) {
		if (!entry || typeof entry.pubkey !== "string" || entry.pubkey.length === 0) continue;
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
		GitHub.validateAccessToken(token, (valid) => {
			if (!valid) {
				return callback({ status: 401, success: false, response: "github_token_invalid" });
			}

			// 2. Persist the token on the caller's user document.
			user.addGitHubAccessToken(owner_id, token, (stored) => {
				if (!stored) {
					return callback({ status: 500, success: false, response: "token_store_failed" });
				}

				const push = (pubkey, created) => {
					GitHub.addPublicKey(token, pubkey, (pushed) => {
						callback({
							status: 200,
							success: true,
							response: { key_pushed: pushed === true, created_key: created }
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
