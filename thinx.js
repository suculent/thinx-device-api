const THiNX = require("./thinx-core.js");

let thx = new THiNX();

// todo: could just await and thus allow using async anywhere
thx.init(() => {
  console.log("init complete");
});
