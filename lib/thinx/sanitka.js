/** This THiNX Device Management API module is responsible for input value sanitation. */

// Both branch() and url() feed values that end up inside shell command strings
// (sources.js, devices.js, builder.js -> git.js exec.execSync). A denylist of
// "dangerous" characters is not enough there: a backtick, $(...), a pipe or a
// newline all survive a blacklist and all execute inside double quotes. These
// are therefore ALLOWLISTS -- anything not explicitly permitted is rejected.
// The command builders escape these values with shell-escape on top of this.

const BRANCH_MAX_LENGTH = 255;

// git-check-ref-format(1) compatible subset: must start alphanumeric, may
// contain dot, underscore, dash and slash.
const BRANCH_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

const URL_MAX_LENGTH = 2048;

// No shell metacharacter is part of any of these classes -- no quote, backtick,
// dollar, semicolon, pipe, ampersand, parenthesis, brace, bracket, glob,
// whitespace or control character can pass.
// scheme://[user[:password]@]host[:port][/path]
const URL_SCHEME_FORM = /^(?:https|http|ssh|git):\/\/(?:[A-Za-z0-9._%+-]+(?::[A-Za-z0-9._%+-]*)?@)?[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._%+-]+)*\/?$/;

// scp-like short form: user@host:path (git@github.com:owner/repo.git)
const URL_SCP_FORM = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?:\/?[A-Za-z0-9._%+-]+(?:\/[A-Za-z0-9._%+-]+)*\/?$/;

module.exports = class Sanitka {

	// Returns "main" for undefined/null input, the branch name without a leading
	// "origin/" when it is safe, null when it is not.
	static branch(input) {
		if ((typeof (input) === "undefined") || (input === null)) return "main";

		if (typeof (input) !== "string") {
			console.log("⚠️ [warning] sanitizing branch failed, not a string");
			return null;
		}

		let candidate = input.startsWith("origin/") ? input.slice("origin/".length) : input;

		let rejected =
			(candidate.length < 1) ||
			(candidate.length > BRANCH_MAX_LENGTH) ||
			(!BRANCH_ALLOWED.test(candidate)) ||
			(candidate.indexOf("..") !== -1) ||
			(candidate.indexOf("@{") !== -1) ||
			(candidate.indexOf("//") !== -1) ||
			(candidate.indexOf("/.") !== -1) ||
			candidate.endsWith("/") ||
			candidate.endsWith(".") ||
			candidate.endsWith(".lock");

		if (rejected) {
			console.log(`⚠️ [warning] sanitizing branch failed because '${input}' is not a valid branch name`);
			return null;
		}

		return candidate;
	}

	branch(input) {
		return Sanitka.branch(input);
	}

	// Returns the input UNCHANGED when it is a valid git URL, null otherwise.
	// Callers (sources.js validateURL) compare the result against their own
	// input and reject any difference, so this must never rewrite the value.
	static url(input) {
		if ((typeof (input) === "undefined") || (input === null)) return null;

		if (typeof (input) !== "string") {
			console.log("⚠️ [warning] URL not sanitized, not a string.");
			return null;
		}

		if ((input.length < 1) || (input.length > URL_MAX_LENGTH)) {
			console.log("⚠️ [warning] URL not sanitized, invalid length.");
			return null;
		}

		if (URL_SCHEME_FORM.test(input) || URL_SCP_FORM.test(input)) return input;

		console.log("⚠️ [warning] URL not sanitized, contains invalid characters.");
		return null;
	}

	url(input) {
		return Sanitka.url(input);
	}

	static udid(input) {
		if (typeof (input) !== "string") return null;
		if (input.length !== 36) return null;
		var sanitized_branch = input.replace(/[\.{\/}\\"';&@]/g, "");
		let valid_udid = /^([a-fA-F0-9-]{36,})$/.test(input);
		if (valid_udid && (input === sanitized_branch)) {
			return sanitized_branch;
		} else {
			console.log("⚠️ [warning] UDID RegEx and replace failed:", input, sanitized_branch);
		}
		return null;
	}

	udid(input) {
		return Sanitka.udid(input);
	}

	static username(input) {
		if ((typeof (input) === "undefined") || (input == null)) return null;
		var sanitized_username = input.replace(/[{}\\"';&@]/g, "");
		if (input === sanitized_username) return sanitized_username;
		return null;
	}

	username(input) {
		return Sanitka.username(input);
	}

	static document_id(input) {
		if ((typeof (input) === "undefined") || (input == null)) return null;
		var sanitized_owner = input.replace(/[{}\\\/"';&@]/g, "");
		let valid = /^([a-z0-9]{64,})$/.test(input);
		if (valid) {
			return sanitized_owner;
		} else {
			console.log("⚠️ [warning] document identifier invalid", { input });
		}
		return null;
	}

	// should allow only a-z0-9 in length of exactly 64 characters
	static source(input) {
		return Sanitka.document_id(input);
	}

	source(input) {
		return Sanitka.source(input);
	}

	static owner(input) {
		return Sanitka.document_id(input);
	}

	owner(input) {
		return Sanitka.owner(input);
	}

	// remove posible shell escapes to make git work
	static deescape(url) {
		if ((typeof (url) === "undefined") || (url == null)) return null;
		let sanitized_url = url.replace(/['";]/g, "");
		if (url === sanitized_url) return sanitized_url;
		return null;
	}

	deescape(url) {
		return Sanitka.deescape(url);
	}

	// should support both Android and iOS push tokens
	static pushToken(token) {
		if (typeof (token) !== "string") return null;
		let sanitized_token = token.replace(/["'\s]/g, "");

		if (token.length == 64) {
			// 31b1f6bf498d7cec463ff2588aca59a52df6f880e60e8d4d6bcda0d8e6e87823
			let valid_ios = /^([a-fA-F0-9]{64,})$/.test(token);
			if (valid_ios) return sanitized_token;
		} else {
			let valid_android = /^([a-zA-Z0-9_:-]+)$/.test(token);
			// akO1-XdQYgk:APA91bHmgm_K500RVhexcxFVoczhp5RuMSKC07kOJB7T31xq2_a9tkUAFVGQNwtZ2JORj79lDRI0ow-nP17y82GD1zTWJTEnyjNMas_qNUKxBot1P-vM6v-BW7sqcISak8sXMK91WfmH
			if (valid_android) return sanitized_token;
		}
		
		return null;
	}

	// redirect to static method
	pushToken(token) {
		return Sanitka.pushToken(token);
	}

	// should support own api keys
	static apiKey(token) {
		if ((typeof (token) === "undefined") || (token == null)) return null;
		let sanitized_token = token.replace(/["\s]/g, "");
		let valid = /^([a-z0-9]{64,})$/.test(sanitized_token);
		if (valid) {
			if (token.indexOf(sanitized_token) == 0) return sanitized_token;
		}
		return null;
	}

	apiKey(token) {
		return Sanitka.apiKey(token);
	}

};
