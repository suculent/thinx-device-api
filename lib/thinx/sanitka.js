/** This THiNX-RTM API module is responsible for input value sanitation. */

module.exports = class Sanitize {

		// static
		branch(input) {
			var sanitized_branch = input.replace(/{/g, "");
			sanitized_branch = sanitized_branch.replace(/}/g, "");
			sanitized_branch = sanitized_branch.replace(/\\/g, "");
			sanitized_branch = sanitized_branch.replace(/"/g, "");
			sanitized_branch = sanitized_branch.replace(/;/g, "");
			sanitized_branch = sanitized_branch.replace(/&/g, "");
			sanitized_branch = sanitized_branch.replace("origin/", "");
			return sanitized_branch;
		}

		// static
    url(input) {
      var output = _public.branch(input);
          output = output.replace(/'/g, "");
      return output;
    }

};
