module.exports = class Validator {

	static udid(udid) {
		if ((typeof (udid) === "undefined") || (udid === null)) {
			return "<udid-undefined>";
		}
		if (udid.length > 40) {
			return false;
		}

		const regex = /[!@#$%&*()_\+={[}\]|\:;"'<,>.?\/\\~`]/g;
		let valid_udid = udid;
		valid_udid.replace(regex, "");

		return (valid_udid == udid) ? udid : false;
	}

	static owner(owner) {
		if (typeof (owner) === "undefined") throw new Error("owner_undefined");
		if (owner.length > 64) return false;

		const regex = /[!@#$%&*()_\-+={[}\]|\:;"'<,>.?\/\\~`]/g;
		let valid_owner = owner;
		valid_owner.replace(regex, "");

		return (valid_owner == udid) ? udid : false;
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
