var repo = require("./lib/thinx/repository");

// One-time check

console.log("One-time check:");
var result1 = repo.checkRepositoryChange(".", false);
console.log(result1);

console.log("Async watch:");

var update_callback = function(changed) {
  console.log("Watch complete callback with result:");
  console.log(changed);
};

repo.watchRepository(".", update_callback);
