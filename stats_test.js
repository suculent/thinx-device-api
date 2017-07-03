var stats = require("./lib/thinx/statistics");

var owner = "18ea285983df355f3024e412fb46ad6cbd98a7ffe6872e26612e35f38aa39c41";

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
