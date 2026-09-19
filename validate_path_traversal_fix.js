#!/usr/bin/env node

/**
 * Manual validation script for path traversal protection in secrets.js
 * This script manually tests the security fix without running the full test suite
 */

const { readSecret, _resetCacheForTests } = require('./lib/thinx/secrets');
const fs = require('fs');

console.log('=== Manual Path Traversal Security Validation ===\n');

// Save original fs functions
const origExists = fs.existsSync;
const origRead = fs.readFileSync;

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    _resetCacheForTests();
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    testsFailed++;
  } finally {
    // Restore fs functions
    fs.existsSync = origExists;
    fs.readFileSync = origRead;
    _resetCacheForTests();
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

// Test 1: Path traversal with ../
test('Rejects path traversal with ../', () => {
  fs.existsSync = () => true;
  fs.readFileSync = () => 'leaked_secret';
  process.env['../etc/passwd'] = 'fallback';
  
  const result = readSecret('../etc/passwd', 'default');
  assertEqual(result, 'fallback', 'Should fall back to env, not read traversed path');
  
  delete process.env['../etc/passwd'];
});

// Test 2: Multiple levels of path traversal
test('Rejects multiple levels of path traversal', () => {
  fs.existsSync = () => true;
  fs.readFileSync = () => 'leaked_secret';
  process.env['../../etc/shadow'] = 'fallback';
  
  const result = readSecret('../../etc/shadow', 'default');
  assertEqual(result, 'fallback', 'Should fall back to env');
  
  delete process.env['../../etc/shadow'];
});

// Test 3: Absolute paths
test('Rejects absolute paths', () => {
  fs.existsSync = () => true;
  fs.readFileSync = () => 'leaked_secret';
  process.env['/etc/passwd'] = 'fallback';
  
  const result = readSecret('/etc/passwd', 'default');
  assertEqual(result, 'fallback', 'Should fall back to env');
  
  delete process.env['/etc/passwd'];
});

// Test 4: Encoded path traversal
test('Rejects path traversal with encoded characters', () => {
  fs.existsSync = () => true;
  fs.readFileSync = () => 'leaked_secret';
  const traversalName = '..%2F..%2Fetc%2Fpasswd';
  process.env[traversalName] = 'fallback';
  
  const result = readSecret(traversalName, 'default');
  assertEqual(result, 'fallback', 'Should fall back to env');
  
  delete process.env[traversalName];
});

// Test 5: Valid secret names work correctly
test('Allows valid secret names without path components', () => {
  const validName = 'VALID_SECRET_NAME';
  fs.existsSync = (p) => p === '/run/secrets/' + validName;
  fs.readFileSync = () => '  valid_secret_value\n';
  
  const result = readSecret(validName);
  assertEqual(result, 'valid_secret_value', 'Should read and trim valid secret');
});

// Test 6: Normal functionality still works
test('Normal secret reading still works', () => {
  fs.existsSync = (p) => p === '/run/secrets/TEST_SECRET';
  fs.readFileSync = () => '  test_value  \n';
  
  const result = readSecret('TEST_SECRET');
  assertEqual(result, 'test_value', 'Should read and trim normal secret');
});

// Restore fs functions
fs.existsSync = origExists;
fs.readFileSync = origRead;

console.log(`\n=== Results ===`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);

process.exit(testsFailed > 0 ? 1 : 0);
