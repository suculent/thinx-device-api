const sha256 = require("sha256");
const fs = require("fs-extra");
const readline = require('readline');
// const prefix = fs.readFileSync("./conf/.thx_prefix");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter Password ', (password) => {

  rl.question('Enter Prefix ', (prefix) => {

  const sha = sha256(prefix+password);
  console.log(sha);


  rl.close();
});
});
