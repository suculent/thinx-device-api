#!/usr/bin/env node
/**
 * Metrics Coverage Analyzer
 * Scans lib/ files to report InfluxConnector.statsLog instrumentation coverage.
 * Usage: node scripts/metrics-coverage.js [--json] [--verbose]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'lib');

// Files that are infrastructure/utilities and not expected to emit metrics
const EXCLUDED_FILES = new Set([
    'influx.js',       // the metrics connector itself
    'globals.js',      // global config
    'util.js',         // pure utilities
    'sanitka.js',      // input sanitization
    'validator.js',    // data validation
    'json2h.js',       // format converter
    'database.js',     // db connection
    'router.js',       // main router bootstrap (no business logic)
    'acl.js',          // access control list data
    'platform.js',     // platform definitions
    'plugins.js',      // plugin loader
    'coap.js',         // CoAP protocol handler (low-level)
]);

// Patterns indicating metrics instrumentation
const INSTRUMENTATION_PATTERNS = [
    /InfluxConnector\.statsLog\s*\(/,
    /statsLog\s*\(/,
    /influx\.statsLog\s*\(/,
];

// Patterns for metrics events to extract
const EVENT_PATTERN = /statsLog\s*\([^,]+,\s*["']([A-Z_]+)["']/g;

/**
 * Collect all .js files recursively under a directory.
 * Skips plugin subdirectories which are platform adapters.
 */
function collectFiles(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip plugins dir - those are build-system adapters, not API logic
            if (entry.name !== 'plugins') {
                collectFiles(full, files);
            }
        } else if (entry.name.endsWith('.js')) {
            files.push(full);
        }
    }
    return files;
}

/**
 * Analyze a single file for metrics instrumentation.
 */
function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(ROOT, filePath);
    const basename = path.basename(filePath);

    const isExcluded = EXCLUDED_FILES.has(basename);
    const hasInstrumentation = !isExcluded && INSTRUMENTATION_PATTERNS.some(p => p.test(content));

    const events = [];
    if (hasInstrumentation) {
        let match;
        const re = new RegExp(EVENT_PATTERN.source, 'g');
        while ((match = re.exec(content)) !== null) {
            if (!events.includes(match[1])) {
                events.push(match[1]);
            }
        }
    }

    // Classify file type
    let type;
    if (basename.startsWith('router.')) {
        type = 'router';
    } else if (relPath.startsWith('lib/thinx/')) {
        type = 'service';
    } else {
        type = 'other';
    }

    return { relPath, basename, type, isExcluded, hasInstrumentation, events };
}

/**
 * Group results and compute coverage metrics.
 */
function buildReport(results) {
    const instrumented = results.filter(r => !r.isExcluded && r.hasInstrumentation);
    const uninstrumented = results.filter(r => !r.isExcluded && !r.hasInstrumentation);
    const excluded = results.filter(r => r.isExcluded);
    const total = instrumented.length + uninstrumented.length;
    const pct = total > 0 ? Math.round((instrumented.length / total) * 100) : 0;

    // Collect all unique event types across instrumented files
    const allEvents = [...new Set(instrumented.flatMap(r => r.events))].sort();

    return {
        summary: {
            total_files: results.length,
            excluded_files: excluded.length,
            eligible_files: total,
            instrumented_files: instrumented.length,
            uninstrumented_files: uninstrumented.length,
            coverage_pct: pct,
            tracked_events: allEvents,
        },
        instrumented: instrumented.map(r => ({ file: r.relPath, type: r.type, events: r.events })),
        uninstrumented: uninstrumented.map(r => ({ file: r.relPath, type: r.type })),
        excluded: excluded.map(r => ({ file: r.relPath, type: r.type })),
    };
}

function printReport(report, verbose) {
    const s = report.summary;
    const bar = (n, total) => {
        const filled = Math.round((n / Math.max(total, 1)) * 20);
        return '[' + '█'.repeat(filled) + '░'.repeat(20 - filled) + ']';
    };

    console.log('\n=== Metrics Instrumentation Coverage ===\n');
    console.log(`  Eligible files : ${s.eligible_files}`);
    console.log(`  Instrumented   : ${s.instrumented_files}`);
    console.log(`  Missing        : ${s.uninstrumented_files}`);
    console.log(`  Excluded       : ${s.excluded_files} (infrastructure/utilities)`);
    console.log(`\n  Coverage       : ${bar(s.instrumented_files, s.eligible_files)} ${s.coverage_pct}%\n`);

    console.log(`  Tracked events (${s.tracked_events.length}): ${s.tracked_events.join(', ')}\n`);

    console.log('--- Instrumented Files ---');
    for (const f of report.instrumented) {
        const evtStr = f.events.length ? `  [${f.events.join(', ')}]` : '';
        console.log(`  ✓  ${f.file}${evtStr}`);
    }

    console.log('\n--- Files Missing Instrumentation ---');
    const byType = {};
    for (const f of report.uninstrumented) {
        (byType[f.type] = byType[f.type] || []).push(f);
    }
    for (const type of Object.keys(byType).sort()) {
        console.log(`\n  [${type}]`);
        for (const f of byType[type]) {
            console.log(`  ✗  ${f.file}`);
        }
    }

    if (verbose) {
        console.log('\n--- Excluded (infrastructure/utilities) ---');
        for (const f of report.excluded) {
            console.log(`  –  ${f.file}`);
        }
    }

    console.log('');
}

function main() {
    const args = process.argv.slice(2);
    const jsonMode = args.includes('--json');
    const verbose = args.includes('--verbose') || args.includes('-v');

    const files = collectFiles(LIB_DIR);
    const results = files.map(analyzeFile);
    const report = buildReport(results);

    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printReport(report, verbose);
    }

    // Exit with non-zero if coverage is below threshold (default 0 = no gate)
    const threshold = parseInt(args.find(a => a.startsWith('--threshold='))?.split('=')[1] ?? '0', 10);
    if (report.summary.coverage_pct < threshold) {
        if (!jsonMode) {
            console.error(`\nFAIL: coverage ${report.summary.coverage_pct}% is below threshold ${threshold}%`);
        }
        process.exit(1);
    }
}

main();
