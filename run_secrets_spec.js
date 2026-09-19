#!/usr/bin/env node

// Minimal test runner to verify SecretsSpec.js
const path = require('path');

// Set up the environment
process.chdir(path.join(__dirname, '..'));

// Load and run jasmine
const Jasmine = require('jasmine');
const jasmine = new Jasmine();

// Configure jasmine to run only SecretsSpec
jasmine.loadConfig({
  spec_dir: 'spec',
  spec_files: ['jasmine/SecretsSpec.js'],
  random: false,
  stopSpecOnExpectationFailure: false,
  timeout: 10000
});

// Add a reporter to capture results
const results = {
  passed: [],
  failed: [],
  pending: []
};

jasmine.env.clearReporters();
jasmine.env.addReporter({
  specDone: function(result) {
    if (result.status === 'passed') {
      results.passed.push(result);
    } else if (result.status === 'failed') {
      results.failed.push(result);
    } else if (result.status === 'pending') {
      results.pending.push(result);
    }
  },
  jasmineDone: function() {
    console.log('\n=== Test Results ===');
    console.log(`Passed: ${results.passed.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Pending: ${results.pending.length}`);
    
    if (results.failed.length > 0) {
      console.log('\nFailed tests:');
      results.failed.forEach(r => {
        console.log(`  - ${r.fullName}`);
        r.failedExpectations.forEach(e => {
          console.log(`    ${e.message}`);
        });
      });
    }
    
    process.exit(results.failed.length > 0 ? 1 : 0);
  }
});

// Run the tests
jasmine.execute();
