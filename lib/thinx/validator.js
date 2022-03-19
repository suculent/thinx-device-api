module.exports = class Validator {
	static isJSON(json) {
		try {
			JSON.parse(json);
		} catch (e) {
			return false;
		}
		return true;
	}
};
