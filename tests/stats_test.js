var stats = require("./lib/thinx/statistics");

var owner = "cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12";

stats.today(owner, function(success, body) {

  if (success) {
    console.log("[TEST] success:", success);
    return;
  }

  if (!body) {
    console.log("[TEST] Statistics for owner " + owner + " not found.");
    return;
  }

  console.log("[TEST] result of stats.today callback: " + body);
});
