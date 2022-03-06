module.exports = class Validator {

	static udid(udid) {

		const regex = /([A-Fa-f0-9-]+)/gm;

		if ((typeof (udid) === "undefined") || (udid === null)) return false;
		if (udid.length != 36) {
			console.log(`⚠️ [warning] UDID ${udid} too long`);
			return false;
		}
	
		let isUDIDValid = false;
		let m;
		while ((m = regex.exec(udid)) !== null) {
			// This is necessary to avoid infinite loops with zero-width matches
			if (m.index === regex.lastIndex) {
				regex.lastIndex++;
			}
			isUDIDValid = true;
		}
	
		return (isUDIDValid) ? udid : false;
	}

	static owner(owner) {

		const regex = /([A-Za-z0-9]+)/gm;

		console.log("🔨 [debug] owner: '%s'", owner);
		
		if (typeof (owner) === "undefined") {
			console.log("🔨 [debug] validation failed, owner undefined");
			return false;
		}
		if (typeof (owner) !== "string") {
			console.log("🔨 [debug] validation failed, owner is not a string");
			return false;
		}
		if (owner.length != 64) {
			console.log("🔨 [debug] validation failed, invalid owner length");
			return false;
		}

		var sanitized_owner = owner.replace(/{/g, "");
		sanitized_owner = sanitized_owner.replace(/}/g, "");
		sanitized_owner = sanitized_owner.replace(/\\/g, "");
		sanitized_owner = sanitized_owner.replace(/"/g, "");
		sanitized_owner = sanitized_owner.replace(/;/g, "");
		sanitized_owner = sanitized_owner.replace(/&/g, "");
		
		if (regex.exec(owner) !== null) {
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
