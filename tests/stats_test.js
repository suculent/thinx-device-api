var stats = require("./lib/thinx/statistics");

var owner = "cedc16bb6bb06daaa3ff6d30666d91aacd6e3efbf9abbc151b4dcade59af7c12";

stats.today(owner, function(success, body) {

  // console.log("✅ [spec] [info] result of stats.today callback: " + body);

  if (success) {
    console.log("✅ [spec] success:", success);
  }

  if (!body) {
    console.log("⛔️ [spec] Statistics for owner " + owner + " not found.");
  }
  
});
