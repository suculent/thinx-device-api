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

				// 3. Ensure an RSA key exists, creating one if the user has none.
				rsakey.list(owner_id, (lsuccess, list) => {
					if (lsuccess && Array.isArray(list) && list.length > 0 && list[0].pubkey) {
						push(list[0].pubkey, false);
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
