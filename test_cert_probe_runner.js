#!/usr/bin/env node

/**
 * Standalone test runner for ZZ-CertProbeSpec.js
 * This runs the cert-probe security tests independently
 */

const path = require('path');

// Load the module under test
const certProbe = require('./lib/thinx/cert-probe');

// Simple test framework
let passed = 0;
let failed = 0;
const tests = [];

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
  }
}

function assertContains(str, substring, message) {
  if (!str || !str.includes(substring)) {
    throw new Error(`${message}\n  Expected "${str}" to contain "${substring}"`);
  }
}

function test(name, fn) {
  tests.push({ name, fn });
}

// Define test fixtures
const FIXTURES = path.resolve(__dirname, 'spec/fixtures/cert-probe');
const R10_LEAF = path.join(FIXTURES, 'R10-leaf.pem');
const R10_CA = path.join(FIXTURES, 'R10-ca.pem');
const R13_LEAF = path.join(FIXTURES, 'R13-leaf.pem');
const R13_CA = path.join(FIXTURES, 'R13-ca.pem');

// ========================================================================
// EXISTING TESTS (baseline functionality)
// ========================================================================

test('should return ok:true for R10 leaf + R10 ca (matching intermediate)', () => {
  const result = certProbe.probeCaFreshness(R10_LEAF, R10_CA);
  assertEquals(result.ok, true, 'ok should be true');
  assertEquals(result.leafIssuer, 'R10', 'leafIssuer should be R10');
  assertEquals(result.message, null, 'message should be null');
});

test('should return ok:true for R13 leaf + R13 ca (matching intermediate)', () => {
  const result = certProbe.probeCaFreshness(R13_LEAF, R13_CA);
  assertEquals(result.ok, true, 'ok should be true');
  assertEquals(result.leafIssuer, 'R13', 'leafIssuer should be R13');
  assertEquals(result.message, null, 'message should be null');
});

test('should handle missing leaf cert gracefully (no throw, returns ok:false)', () => {
  const missingPath = `/tmp/does-not-exist-${Date.now()}-${process.pid}.pem`;
  let result;
  let threw = null;
  try {
    result = certProbe.probeCaFreshness(missingPath, R13_CA);
  } catch (e) {
    threw = e;
  }
  assertEquals(threw, null, 'probe must not throw on missing leaf cert');
  assertEquals(result.ok, false, 'ok should be false');
  assertEquals(result.leafIssuer, null, 'leafIssuer should be null');
  assertContains(result.message.toLowerCase(), 'leaf', 'message should mention leaf');
});

// ========================================================================
// PATH TRAVERSAL SECURITY TESTS
// ========================================================================

test('should reject path traversal in certPath using ".." (security)', () => {
  const traversalPath = '../../../etc/passwd';
  const result = certProbe.probeCaFreshness(traversalPath, R13_CA);
  assertEquals(result.ok, false, 'ok should be false');
  assertEquals(result.leafIssuer, null, 'leafIssuer should be null');
  assertEquals(result.caContains, [], 'caContains should be empty');
  assertEquals(result.message, 'invalid cert path', 'message should indicate invalid cert path');
});

test('should reject path traversal in caPath using ".." (security)', () => {
  const traversalPath = '../../sensitive/file.pem';
  const result = certProbe.probeCaFreshness(R10_LEAF, traversalPath);
  assertEquals(result.ok, false, 'ok should be false');
  assertEquals(result.leafIssuer, null, 'leafIssuer should be null');
  assertEquals(result.caContains, [], 'caContains should be empty');
  assertEquals(result.message, 'invalid ca path', 'message should indicate invalid ca path');
});

test('should reject absolute path in certPath (security)', () => {
  const absolutePath = '/etc/shadow';
  const result = certProbe.probeCaFreshness(absolutePath, R13_CA);
  assertEquals(result.ok, false, 'ok should be false');
  assertEquals(result.leafIssuer, null, 'leafIssuer should be null');
  assertEquals(result.caContains, [], 'caContains should be empty');
  assertEquals(result.message, 'invalid cert path', 'message should indicate invalid cert path');
});

test('should reject absolute path in caPath (security)', () => {
  const absolutePath = '/var/secrets/private.key';
  const result = certProbe.probeCaFreshness(R10_LEAF, absolutePath);
  assertEquals(result.ok, false, 'ok should be false');
  assertEquals(result.leafIssuer, null, 'leafIssuer should be null');
  assertEquals(result.caContains, [], 'caContains should be empty');
  assertEquals(result.message, 'invalid ca path', 'message should indicate invalid ca path');
});

test('should reject encoded path traversal attempts in certPath (security)', () => {
  // Test URL-encoded '..' sequences
  const encodedPath = '..%2F..%2Fetc%2Fpasswd';
  const result = certProbe.probeCaFreshness(encodedPath, R13_CA);
  assertEquals(result.ok, false, 'ok should be false');
  assertEquals(result.message, 'invalid cert path', 'message should indicate invalid cert path');
});

// ========================================================================
// RUN TESTS
// ========================================================================

console.log('🚸 [standalone] >>> running CertProbe security tests\n');

tests.forEach(({ name, fn }) => {
  const startTime = Date.now();
  try {
    fn();
    const duration = Date.now() - startTime;
    console.log(`  ✓ ${name} (${duration}ms)`);
    passed++;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`  ✗ ${name} (${duration}ms)`);
    console.log(`    ${error.message}`);
    failed++;
  }
});

console.log(`\n🚸 [standalone] <<< completed CertProbe security tests`);
console.log(`\nResults: ${passed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
