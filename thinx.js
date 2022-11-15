const THiNX = require("./thinx-core.js");

let thx = new THiNX();

thx.on('workerReady', () => {
  console.log('workerReady event occurred!');
});

// todo: could just await and thus allow using async anywhere
thx.init(() => {
  console.log("ℹ️ [info] THiNX Core Initialization complete.");
});
