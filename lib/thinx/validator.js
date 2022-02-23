module.exports = class Validator {

	static udid(udid) {

		if ((typeof (udid) === "undefined") || (udid === null)) return false;
		if (udid.length > 36) return false;

		let isUDIDValid = /^([A-Fa-f0-9-]+)$/.test(udid);
		console.log(`[warning] UDID ${udid} considered invalid in RegEx test`);
		return (isUDIDValid) ? udid : false;
	}

	static owner(owner) {
		
		if (typeof (owner) === "undefined") return false;
		if (owner.length > 64) return false;

		var sanitized_owner = owner.replace(/{/g, "");
		sanitized_owner = sanitized_owner.replace(/}/g, "");
		sanitized_owner = sanitized_owner.replace(/\\/g, "");
		sanitized_owner = sanitized_owner.replace(/"/g, "");
		sanitized_owner = sanitized_owner.replace(/;/g, "");
		sanitized_owner = sanitized_owner.replace(/&/g, "");
		let valid = /^([a-z0-9]+)$/.test(owner);
		if (valid) {
			return sanitized_owner;
		} else {
			console.log("owner invalid", { owner });
			return false;
		}

	}

	static isJSON(json) {
		try {
			JSON.parse(json);
		} catch (e) {
			return false;
		}
		return true;
	}
};
