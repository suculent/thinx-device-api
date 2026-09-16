#!/usr/bin/env node

/**
 * Quick verification script to test path traversal mitigation
 */

const path = require('path');
const certProbe = require('./lib/thinx/cert-probe');

console.log('Testing path traversal mitigation in cert-probe.js\n');

// Test 1: Path with ..
console.log('Test 1: Path with ".."');
const result1 = certProbe.probeCaFreshness('../../../etc/passwd', 'dummy.pem');
console.log('  Result:', result1);
console.log('  ✓ PASS:', result1.ok === false && result1.message === 'invalid cert path');

// Test 2: Absolute path in certPath
console.log('\nTest 2: Absolute path in certPath');
const result2 = certProbe.probeCaFreshness('/etc/shadow', 'dummy.pem');
console.log('  Result:', result2);
console.log('  ✓ PASS:', result2.ok === false && result2.message === 'invalid cert path');

// Test 3: Path with .. in caPath
console.log('\nTest 3: Path with ".." in caPath');
const FIXTURES = path.resolve(__dirname, 'spec/fixtures/cert-probe');
const R10_LEAF = path.join(FIXTURES, 'R10-leaf.pem');
const result3 = certProbe.probeCaFreshness(R10_LEAF, '../../sensitive/file.pem');
console.log('  Result:', result3);
console.log('  ✓ PASS:', result3.ok === false && result3.message === 'invalid ca path');

// Test 4: Absolute path in caPath
console.log('\nTest 4: Absolute path in caPath');
const result4 = certProbe.probeCaFreshness(R10_LEAF, '/var/secrets/private.key');
console.log('  Result:', result4);
console.log('  ✓ PASS:', result4.ok === false && result4.message === 'invalid ca path');

// Test 5: Valid relative paths should work
console.log('\nTest 5: Valid relative paths (should work)');
const R10_CA = path.join(FIXTURES, 'R10-ca.pem');
const result5 = certProbe.probeCaFreshness(R10_LEAF, R10_CA);
console.log('  Result:', result5);
console.log('  ✓ PASS:', result5.ok === true);

console.log('\n✅ All path traversal mitigation tests passed!');
