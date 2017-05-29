var stats = require("./lib/thinx/statistics");

var owner = "eaabae0d5165c5db4c46c3cb6f062938802f58d9b88a1b46ed69421809f0bf7f";

stats.today(owner, function(success, body) {

  if (success) {
    console.log("[TEST] success:", success);
    console.log("[TEST] body:", body);
    return;
  }

  if (!body) {
    console.log("[TEST] Statistics for owner " + owner + " not found.");
    return;
  }

  console.log("[TEST] result of stats.today callback: " + body);
});
