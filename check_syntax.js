#!/usr/bin/env node

// Syntax check for SecretsSpec.js
try {
  require('./spec/jasmine/SecretsSpec.js');
  console.log('✓ SecretsSpec.js syntax is valid');
  process.exit(0);
} catch (error) {
  console.error('✗ SecretsSpec.js has syntax errors:');
  console.error(error.message);
  process.exit(1);
}
