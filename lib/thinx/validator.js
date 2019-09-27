module.exports = class Validator {

		static udid(udid) {
			if (udid.length > 40) return "<udid-invalid>";
			const regex = /[!@#$%&*()_\+={[}\]|\:;"'<,>.?\/\\~`]/g;
			return udid.replace(regex, "");
		}

    static owner(owner) {
			if (owner.length > 64) return "<owner-invalid>";
			const regex = /[!@#$%&*()_\-+={[}\]|\:;"'<,>.?\/\\~`]/g;
			return owner.replace(regex, "");
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
