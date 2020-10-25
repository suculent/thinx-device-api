const sha256 = require("sha256");
const fs = require("fs-extra");
const readline = require('readline');


var pfx_path = __dirname + '/conf/.thx_prefix'; // old
if (!fs.existsSync(pfx_path)) {
  pfx_path = app_config.data_root + '/.thx_prefix'; // new
  if (!fs.existsSync(pfx_path)) {
    console.log("Prefix file missing, clean install...");
  }
}
const prefix = fs.readFileSync(pfx_path);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter Password ', (password) => {

  const sha = sha256(prefix+password);
  console.log(sha);

  rl.close();
});
