/** This THiNX-RTM API module is responsible for input value sanitation. */

module.exports = class Sanitka {

	branch(input) {
		if (typeof (input) === "undefined") return "master";
		var sanitized_branch = input.replace(/{/g, "");
		sanitized_branch = sanitized_branch.replace(/}/g, "");
		sanitized_branch = sanitized_branch.replace(/\\/g, "");
		sanitized_branch = sanitized_branch.replace(/"/g, "");
		sanitized_branch = sanitized_branch.replace(/;/g, "");
		sanitized_branch = sanitized_branch.replace(/&/g, "");
		sanitized_branch = sanitized_branch.replace("origin/", "");
		return sanitized_branch;
	}

	url(input) {
		if (typeof (input) === "undefined") return "";
		var output = input;
		output = output.replace(/'/g, "");
		output = output.replace(/{/g, "");
		output = output.replace(/}/g, "");
		output = output.replace(/\\/g, "");
		output = output.replace(/"/g, "");
		output = output.replace(/;/g, "");
		output = output.replace(/&/g, "");
		return output;
	}

	udid(input) {
		if (typeof (input) === "undefined") return "";
		var sanitized_branch = input.replace(/{/g, "");
		sanitized_branch = sanitized_branch.replace(/}/g, "");
		sanitized_branch = sanitized_branch.replace(/\\/g, "");
		sanitized_branch = sanitized_branch.replace(/"/g, "");
		sanitized_branch = sanitized_branch.replace(/;/g, "");
		sanitized_branch = sanitized_branch.replace(/&/g, "");
		return sanitized_branch;
	}

	// should allow only a-z0-9 in length of exactly 64 characters
	owner(input) {
		if (typeof (input) === "undefined") return null;
		var sanitized_owner = input.replace(/{/g, "");
		sanitized_owner = sanitized_owner.replace(/}/g, "");
		sanitized_owner = sanitized_owner.replace(/\\/g, "");
		sanitized_owner = sanitized_owner.replace(/"/g, "");
		sanitized_owner = sanitized_owner.replace(/;/g, "");
		sanitized_owner = sanitized_owner.replace(/&/g, "");
		let valid = /^([a-z0-9]{64,})$/.test(input);
		if (valid) {
			console.log("owner sane", sanitized_owner);
			return sanitized_owner;
		} else {
			console.log("owner invalid", { input });
			return false;
		}
	}

	// remove posible shell escapes to make git work
	deescape(sanitized_url) {
		if (typeof (sanitized_url) === "undefined") return "";
		sanitized_url = sanitized_url.replace(/'/g, "");
		sanitized_url = sanitized_url.replace(/"/g, "");
		sanitized_url = sanitized_url.replace(/;/g, "");
		return sanitized_url;
	}

};
