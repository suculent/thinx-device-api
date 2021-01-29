/* Use this script to generate new admin password when migrating between prefixes */

const sha256 = require('sha256');

const prefix = '';
const password = '';

let result = sha256(prefix + password);
console.log(result);