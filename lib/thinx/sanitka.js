/** This THiNX-RTM API module is responsible for input value sanitation. */

module.exports = class Sanitka {

	branch(input) {
		if (typeof (input) === "undefined") return "main";
		var sanitized_branch = input.replace(/{/g, "");
		sanitized_branch = sanitized_branch.replace(/}/g, "");
		sanitized_branch = sanitized_branch.replace(/\\/g, "");
		sanitized_branch = sanitized_branch.replace(/'/g, "");
		sanitized_branch = sanitized_branch.replace(/"/g, "");
		sanitized_branch = sanitized_branch.replace(/;/g, "");
		sanitized_branch = sanitized_branch.replace(/&/g, "");
		if (input !== sanitized_branch) {
			console.log(`[error] sanitizing branch failed because ${input} does not match ${sanitized_branch}`);
			return null;
		}
		sanitized_branch = sanitized_branch.replace("origin/", "");
		return sanitized_branch;
	}

	url(input) {
		if (typeof (input) === "undefined") return null;
		var output = input;
		output = output.replace(/'/g, "");
		output = output.replace(/{/g, "");
		output = output.replace(/}/g, "");
		output = output.replace(/\\/g, "");
		output = output.replace(/"/g, "");
		output = output.replace(/;/g, "");
		output = output.replace(/&/g, "");
		if (input === output) return output;
		console.log("URL not sanitized, because", input, "is not equal to", output);
		return null;
	}

	udid(input) {
		if (typeof (input) !== "string") return null;
		if (input.length !== 36) return null;
		var sanitized_branch = input.replace(/{/g, "");
		sanitized_branch = sanitized_branch.replace(/}/g, "");
		sanitized_branch = sanitized_branch.replace(/\./g, "");
		sanitized_branch = sanitized_branch.replace(/\//g, "");
		sanitized_branch = sanitized_branch.replace(/'/g, "");
		sanitized_branch = sanitized_branch.replace(/\\/g, "");
		sanitized_branch = sanitized_branch.replace(/"/g, "");
		sanitized_branch = sanitized_branch.replace(/;/g, "");
		sanitized_branch = sanitized_branch.replace(/&/g, "");
		let valid_udid = /^([a-zA-Z0-9-]{36,})$/.test(input);
		if (valid_udid && (input === sanitized_branch)) {
			return sanitized_branch;
		} else {
			console.log("UDID RegEx and replace failed:", input, sanitized_branch);
		}
		return null;
	}

	username(input) {
		if (typeof (input) === "undefined") return null;
		var sanitized_username = input.replace(/{/g, "");
		sanitized_username = sanitized_username.replace(/}/g, "");
		sanitized_username = sanitized_username.replace(/\\/g, "");
		sanitized_username = sanitized_username.replace(/"/g, "");
		sanitized_username = sanitized_username.replace(/;/g, "");
		sanitized_username = sanitized_username.replace(/&/g, "");
		sanitized_username = sanitized_username.replace(/@/g, "");
		if (input === sanitized_username) return sanitized_username;
		return null;
	}

	// should allow only a-z0-9 in length of exactly 64 characters
	owner(input) {
		if (typeof (input) === "undefined") {
			throw new Error("☣️  [error] Input owner undefined in sanitizer!"); // should throw to debug the stack
		}
		var sanitized_owner = input.replace(/{/g, "");
		sanitized_owner = sanitized_owner.replace(/}/g, "");
		sanitized_owner = sanitized_owner.replace(/\\/g, "");
		sanitized_owner = sanitized_owner.replace(/"/g, "");
		sanitized_owner = sanitized_owner.replace(/;/g, "");
		sanitized_owner = sanitized_owner.replace(/&/g, "");
		let valid = /^([a-z0-9]{64,})$/.test(input);
		if (valid) {
			return sanitized_owner;
		} else {
			console.log("owner invalid", { input });
			return false;
		}
	}

	// remove posible shell escapes to make git work
	deescape(url) {
		if (typeof (url) === "undefined") return null;
		let sanitized_url = url.replace(/'/g, "");
		sanitized_url = sanitized_url.replace(/"/g, "");
		sanitized_url = sanitized_url.replace(/;/g, "");
		if (url === sanitized_url) return sanitized_url;
		return null;
	}

	// should support both Android and iOS push tokens
	pushToken(token) {
		if (typeof (token) !== "string") return null;
		let sanitized_token = token.replace(/"/g, "");
		sanitized_token = sanitized_token.replace(/'/g, "");
		sanitized_token = sanitized_token.replace(/\s/g, "");

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

	// should support own api keys
	apiKey(token) {
		if (typeof (token) === "undefined") return null;
		let sanitized_token = token.replace(/"/g, "");
		sanitized_token = sanitized_token.replace(/'/g, "");
		sanitized_token = sanitized_token.replace(/\s/g, "");
		let valid = /^([a-z0-9]{64,})$/.test(sanitized_token);
		if (valid) {
			if (token === sanitized_token) return sanitized_token;
		}
		return null;
	}

};
