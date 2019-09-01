/** This THiNX-RTM API module is responsible for input value sanitation. */

var Sanitize = (function() {

	var _public = {

		branch: function(input) {
			var sanitized_branch = input.replace(/{/g, "");
			sanitized_branch = sanitized_branch.replace(/}/g, "");
			sanitized_branch = sanitized_branch.replace(/\\/g, "");
			sanitized_branch = sanitized_branch.replace(/"/g, "");
			sanitized_branch = sanitized_branch.replace(/;/g, "");
			sanitized_branch = sanitized_branch.replace(/&/g, "");
			return sanitized_branch;
		},

    url: function(input) {
      var output = _public.branch(input);
          output = output.replace(/'/g, "");
      return output;
    }

	};

	return _public;

})();

exports.branch = Sanitize.branch;
exports.url = Sanitize.url;
