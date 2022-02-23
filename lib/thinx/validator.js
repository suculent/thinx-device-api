module.exports = class Validator {

	static udid(udid) {

		const regex = /([A-Fa-f0-9-]+)/gm;

		if ((typeof (udid) === "undefined") || (udid === null)) return false;
		if (udid.length > 36) {
			console.log(`[warning] UDID ${udid} too long`);
			return false;
		}
	
		let isUDIDValid = false;
		let m;
		while ((m = regex.exec(udid)) !== null) {
			// This is necessary to avoid infinite loops with zero-width matches
			if (m.index === regex.lastIndex) {
				regex.lastIndex++;
			}
			// The result can be accessed through the `m`-variable.
			m.forEach((/* match, groupIndex */) => {
				isUDIDValid = true;
			});
		}
	
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
