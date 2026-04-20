module.exports = class Validator {
	static isJSON(json) {
		try {
			JSON.parse(json);
		} catch (_e) {
			return false;
		}
		return true;
	}
};
