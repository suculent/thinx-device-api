var sha256 = require("sha256");
var prefix = "<prefix>";
var pass = "<password>";
var password = sha256(prefix + pass);
console.log(password);