//
// REFACTOR: Move to vault.js
//

console.log("Initializing vault...");

/*

// Vault server must be started, initialized and root token to unseal key must be known

// Database access
// ./vault write secret/password value=13fd9bae19f4daffa17b34f05dbd9eb8281dce90 owner=test revoked=false
// Vault init & unseal:

var options = {
	apiVersion: 'v1', // default
	endpoint: 'http://127.0.0.1:8200', // default
	token: 'b7fbc90b-6ae2-bbb8-ff0b-1a7e353b8641' // optional client token; can be fetched after valid initialization of the server
};


// get new instance of the client
var vault = require("node-vault")(options);

// init vault server and use it to store secret information (user password or similar key, and/or device location)
vault.init({
		secret_shares: 1,
		secret_threshold: 1
	})
	.then((result) => {
		var keys = result.keys;
		// set token for all following requests
		vault.token = result.root_token;
		// unseal vault server
		return vault.unseal({
			secret_shares: 1,
			key: keys[0]
		})
	})
	.catch(console.error);

vault.write('secret/hello', { value: 'world', lease: '1s' })
  .then( () => vault.read('secret/hello'))
  .then( () => vault.delete('secret/hello'))
  .catch(console.error);

*/

//
// <<<
//
