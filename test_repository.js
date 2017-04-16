var repo = require("./lib/thinx/repository");

// One-time check

console.log("One-time check:");
var result1 = repo.repositoryChanged(".", false);
console.log(result1);

console.log("Async watch:");
var result2 = repo.watchRepository(".");
console.log(result2);

setTimeout(30000, function() {
  console.log("Async watch end:");
  var result = repo.unwatchRepository(".");
  console.log(result);
});
