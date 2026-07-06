#!/usr/bin/env node
/**
 * Logging Quality Auditor
 *
 * Scans backend/API logging for structured logger adoption, tracked statistics
 * events, sensitive logging patterns, severity-string mismatches, and useful
 * operational context.
 *
 * Usage:
 *   node scripts/logging-quality-audit.js [--json]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROOT_FILES = ['thinx-core.js', 'thinx.js'];
const SERVICE_ENTRYPOINTS = [
  'services/worker/worker.js',
  'services/transformer/index.js',
  'services/transformer/app.js',
  'services/transformer/transformer.js',
];

const CONSOLE_CALL_RE = /\bconsole\.(log|warn|error|info|debug)\s*\(/g;
const LOGGER_CALL_RE = /\blogger\.(warn|error|info|debug)\s*\(/g;
const OID_EVENT_RE = /\[OID:[^\]]+\]\s*\[([A-Z_]+)\]/g;
const STATS_LOG_RE = /(?:InfluxConnector\.)?statsLog\s*\([^,]+,\s*["']([A-Z_]+)["']/g;
const STATS_EVENT_WRAPPER_RE = /recordStatsEvent\s*\([^,]+,\s*["']([A-Z_]+)["']/g;
const COMMENT_RE = /^\s*(?:\/\/|\/\*|\*)/;

const SEVERITY_TAGS = [
  { name: 'critical', re: /\[(?:critical|CRITICAL)\]|critical/i, expected: ['error'] },
  { name: 'error', re: /\[(?:error|ERROR)\]|error/i, expected: ['error'] },
  { name: 'warning', re: /\[(?:warning|WARN|warn)\]|warning/i, expected: ['warn', 'error'] },
  { name: 'info', re: /\[(?:info|INFO)\]|info/i, expected: ['info', 'warn', 'error'] },
  { name: 'debug', re: /\[(?:debug|DEBUG)\]|debug/i, expected: ['debug', 'info', 'warn', 'error'] },
];

const SENSITIVE_PATTERNS = [
  {
    id: 'raw_cookie_header',
    severity: 'high',
    description: 'Raw Cookie header or cookie string is logged without redaction.',
    test: line => (
      isLogLine(line) &&
      /(?:headers\.cookie|JSON\.stringify\s*\(\s*cookies\s*\)|,\s*cookies\s*\)|\+\s*cookies\b)/.test(line) &&
      !/redactCookieHeader/.test(line)
    ),
  },
  {
    id: 'oauth_access_token',
    severity: 'high',
    description: 'OAuth access token variable is logged without redaction.',
    test: line => (
      isLogLine(line) &&
      /\b(?:access_token|accessToken)\b/.test(line) &&
      !/redactToken/.test(line) &&
      !/Signing JWT access\+refresh tokens/.test(line)
    ),
  },
  {
    id: 'oauth_handoff_token',
    severity: 'high',
    description: 'One-shot OAuth/GDPR handoff token or redirect URL is logged without redaction.',
    test: line => (
      isLogLine(line) &&
      /(?:\{\s*token\s*\}|for token",?\s*token|for token',?\s*token|\b(?:courl|ourl|redirectURL)\b|auth\.html\?t=)/.test(line) &&
      !/redactToken/.test(line)
    ),
  },
  {
    id: 'full_user_wrapper',
    severity: 'high',
    description: 'Full OAuth userWrapper payload is logged.',
    test: line => (
      isLogLine(line) &&
      /(?:\{\s*userWrapper\s*\}|JSON\.stringify\s*\(\s*userWrapper\s*\)|,\s*userWrapper\b|\buserWrapper\s*\))/.test(line) &&
      !/redact/.test(line)
    ),
  },
  {
    id: 'full_hdata',
    severity: 'high',
    description: 'Full GitHub hdata payload is logged.',
    test: line => (
      isLogLine(line) &&
      /(?:\{\s*hdata\s*\}|JSON\.stringify\s*\(\s*hdata\s*\)|,\s*hdata\b|\bhdata\s*\))/.test(line) &&
      !/redact/.test(line)
    ),
  },
  {
    id: 'invalid_login_username',
    severity: 'high',
    description: 'Invalid login event logs the submitted username.',
    test: line => (
      isLogLine(line) &&
      /LOGIN_INVALID/.test(line) &&
      /\busername\b/.test(line)
    ),
  },
  {
    id: 'possible_secret_payload',
    severity: 'medium',
    description: 'Log line includes likely secret-bearing request or response payload.',
    test: line => (
      isLogLine(line) &&
      /(?:JSON\.stringify\s*\(\s*(?:req\.body|reg|device|doc|response)\s*\)|\{\s*(?:req|reg|device|doc|response)\s*\})/.test(line) &&
      !/redact|mask|delete/.test(line)
    ),
  },
];

function isLogLine(line) {
  return /\b(?:console|logger)\.(?:log|warn|error|info|debug)\s*\(/.test(line);
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function collectFiles() {
  const files = [];
  for (const f of ROOT_FILES) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) files.push(full);
  }
  files.push(...walk(path.join(ROOT, 'lib')));
  for (const f of SERVICE_ENTRYPOINTS) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) files.push(full);
  }
  return [...new Set(files)].sort();
}

function loadStatisticsEvents() {
  const statisticsPath = path.join(ROOT, 'lib/thinx/statistics.js');
  if (!fs.existsSync(statisticsPath)) return [];

  const content = fs.readFileSync(statisticsPath, 'utf8');
  const templateMatch = content.match(/const\s+owner_template\s*=\s*\{([\s\S]*?)\};/);
  if (!templateMatch) return [];

  const events = [];
  const keyRe = /^\s*([A-Z_]+)\s*:/gm;
  let match;
  while ((match = keyRe.exec(templateMatch[1])) !== null) {
    events.push(match[1]);
  }
  return [...new Set(events)].sort();
}

function emptyCounts() {
  return {
    log: 0,
    warn: 0,
    error: 0,
    info: 0,
    debug: 0,
    total: 0,
  };
}

function increment(counts, key) {
  counts[key] += 1;
  counts.total += 1;
}

function logCallLevel(line) {
  let match = line.match(/\blogger\.(warn|error|info|debug)\s*\(/);
  if (match) return { sink: 'logger', level: match[1] };

  match = line.match(/\bconsole\.(log|warn|error|info|debug)\s*\(/);
  if (match) return { sink: 'console', level: match[1] };

  return { sink: 'unknown', level: 'unknown' };
}

function normalizedLevel(sink, level) {
  if (sink === 'logger') return level;
  if (sink === 'console' && level === 'warn') return 'warn';
  if (sink === 'console' && level === 'error') return 'error';
  if (sink === 'console' && level === 'info') return 'info';
  if (sink === 'console' && level === 'debug') return 'debug';
  return 'log';
}

function excerpt(line) {
  return line.trim().replace(/\s+/g, ' ').slice(0, 240);
}

function detectSeverityMismatch(line, lineNumber) {
  if (!isLogLine(line)) return null;

  const call = logCallLevel(line);
  const actual = normalizedLevel(call.sink, call.level);

  for (const tag of SEVERITY_TAGS) {
    if (!tag.re.test(line)) continue;
    if (tag.expected.includes(actual)) return null;
    return {
      line: lineNumber,
      sink: call.sink,
      level: call.level,
      message_severity: tag.name,
      excerpt: excerpt(line),
    };
  }

  return null;
}

function analyzeFile(filePath, statisticsEvents) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const consoleCounts = emptyCounts();
  const loggerCounts = emptyCounts();
  const trackedEvents = [];
  const suspiciousSensitive = [];
  const severityMismatches = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (COMMENT_RE.test(trimmed)) return;

    let match;
    const consoleRe = new RegExp(CONSOLE_CALL_RE.source, 'g');
    while ((match = consoleRe.exec(line)) !== null) {
      increment(consoleCounts, match[1]);
    }

    const loggerRe = new RegExp(LOGGER_CALL_RE.source, 'g');
    while ((match = loggerRe.exec(line)) !== null) {
      increment(loggerCounts, match[1]);
    }

    const oidRe = new RegExp(OID_EVENT_RE.source, 'g');
    while ((match = oidRe.exec(line)) !== null) {
      const call = logCallLevel(line);
      const event = match[1];
      const trackedByStatistics = statisticsEvents.includes(event);
      const compliant = !trackedByStatistics || (call.sink === 'logger' && call.level === 'warn');
      trackedEvents.push({
        event,
        line: lineNumber,
        sink: call.sink,
        level: call.level,
        source: 'oid_log',
        tracked_by_statistics: trackedByStatistics,
        compliant,
        excerpt: excerpt(line),
      });
    }

    const statsRe = new RegExp(STATS_LOG_RE.source, 'g');
    while ((match = statsRe.exec(line)) !== null) {
      const event = match[1];
      trackedEvents.push({
        event,
        line: lineNumber,
        sink: 'metrics',
        level: 'statsLog',
        source: 'InfluxConnector.statsLog',
        tracked_by_statistics: statisticsEvents.includes(event),
        compliant: true,
        excerpt: excerpt(line),
      });
    }

    const wrapperRe = new RegExp(STATS_EVENT_WRAPPER_RE.source, 'g');
    while ((match = wrapperRe.exec(line)) !== null) {
      const event = match[1];
      trackedEvents.push({
        event,
        line: lineNumber,
        sink: 'logger',
        level: 'warn',
        source: 'recordStatsEvent',
        tracked_by_statistics: statisticsEvents.includes(event),
        compliant: true,
        excerpt: excerpt(line),
      });
    }

    for (const pattern of SENSITIVE_PATTERNS) {
      if (!pattern.test(line)) continue;
      suspiciousSensitive.push({
        id: pattern.id,
        severity: pattern.severity,
        description: pattern.description,
        line: lineNumber,
        excerpt: excerpt(line),
      });
    }

    const mismatch = detectSeverityMismatch(line, lineNumber);
    if (mismatch) severityMismatches.push(mismatch);
  });

  return {
    file: rel(filePath),
    console: consoleCounts,
    logger: loggerCounts,
    tracked_events: trackedEvents,
    suspicious_sensitive: suspiciousSensitive,
    severity_mismatches: severityMismatches,
  };
}

function sum(files, selector) {
  return files.reduce((acc, f) => acc + selector(f), 0);
}

function buildReport(files, statisticsEvents) {
  const trackedEvents = files.flatMap(f => f.tracked_events.map(e => ({ file: f.file, ...e })));
  const sensitiveFindings = files.flatMap(f => f.suspicious_sensitive.map(e => ({ file: f.file, ...e })));
  const severityMismatches = files.flatMap(f => f.severity_mismatches.map(e => ({ file: f.file, ...e })));
  const trackedEventQualityGaps = trackedEvents.filter(e => e.tracked_by_statistics && !e.compliant);
  const eventNames = [...new Set(trackedEvents.map(e => e.event))].sort();

  return {
    scope: {
      root_files: ROOT_FILES,
      lib_glob: 'lib/**/*.js',
      service_entrypoints: SERVICE_ENTRYPOINTS,
      statistics_events: statisticsEvents,
    },
    summary: {
      files_scanned: files.length,
      console_calls: sum(files, f => f.console.total),
      logger_calls: sum(files, f => f.logger.total),
      tracked_event_occurrences: trackedEvents.length,
      tracked_events: eventNames,
      sensitive_findings: sensitiveFindings.length,
      high_risk_sensitive_findings: sensitiveFindings.filter(f => f.severity === 'high').length,
      severity_mismatches: severityMismatches.length,
      tracked_event_quality_gaps: trackedEventQualityGaps.length,
    },
    files,
    tracked_events: trackedEvents,
    suspicious_sensitive: sensitiveFindings,
    severity_mismatches: severityMismatches,
    tracked_event_quality_gaps: trackedEventQualityGaps,
  };
}

function printReport(report) {
  const s = report.summary;

  console.log('\n=== Logging Quality Audit ===\n');
  console.log(`Files scanned                 : ${s.files_scanned}`);
  console.log(`console.* calls               : ${s.console_calls}`);
  console.log(`logger.* calls                : ${s.logger_calls}`);
  console.log(`Tracked event occurrences     : ${s.tracked_event_occurrences}`);
  console.log(`Sensitive findings            : ${s.sensitive_findings} (${s.high_risk_sensitive_findings} high risk)`);
  console.log(`Severity-string mismatches    : ${s.severity_mismatches}`);
  console.log(`Tracked event quality gaps    : ${s.tracked_event_quality_gaps}`);
  console.log(`Tracked events                : ${s.tracked_events.join(', ') || '(none)'}`);

  console.log('\n--- Files With Logging Calls ---');
  for (const file of report.files.filter(f => f.console.total > 0 || f.logger.total > 0)) {
    console.log(`${file.file}: console=${file.console.total}, logger=${file.logger.total}, events=${file.tracked_events.length}`);
  }

  if (report.suspicious_sensitive.length > 0) {
    console.log('\n--- Sensitive Findings ---');
    for (const finding of report.suspicious_sensitive) {
      console.log(`${finding.severity.toUpperCase()} ${finding.id} ${finding.file}:${finding.line} ${finding.excerpt}`);
    }
  }

  if (report.tracked_event_quality_gaps.length > 0) {
    console.log('\n--- Tracked Event Quality Gaps ---');
    for (const gap of report.tracked_event_quality_gaps) {
      console.log(`${gap.file}:${gap.line} ${gap.event} via ${gap.sink}.${gap.level}`);
    }
  }

  console.log('');
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const statisticsEvents = loadStatisticsEvents();
  const files = collectFiles().map(file => analyzeFile(file, statisticsEvents));
  const report = buildReport(files, statisticsEvents);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

main();
