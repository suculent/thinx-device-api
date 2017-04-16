var repo = require("./lib/thinx/repository");

// One-time check

console.log("One-time check:");
var result1 = repo.repositoryChanged(".", false);
console.log(result1);

console.log("Async watch:");
var update_callback = function(result) {
  console.log("Watch complete callback with result:");
  console.log(result);
};

var result2 = repo.watchRepository(".", update_callback);
console.log(result2);

var terminate = function() {
  console.log("Async watch end:");
  var result = repo.unwatchRepository(".");
  console.log(result);
};

setTimeout(30000, terminate);
