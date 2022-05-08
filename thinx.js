let Sqreen;

const Globals = require("./lib/thinx/globals.js"); // static only!
if (Globals.use_sqreen()) {
  try {
    Sqreen = require('sqreen');
  } catch (s) {
    console.log(s);
  }
}

const THiNX = require("./thinx-core.js");

let thx = new THiNX(Sqreen);

thx.on('workerReady', () => {
  console.log('workerReady event occurred!');
});

// todo: could just await and thus allow using async anywhere
thx.init(() => {
  console.log("ℹ️ [info] THiNX Core Initialization complete.");
});
