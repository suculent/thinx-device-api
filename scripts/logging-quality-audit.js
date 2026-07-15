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

const LOG_CALL_RE = /\b(console|logger)\.(log|warn|error|info|debug)\s*\(/g;
const STATS_CALL_RE = /\b(?:InfluxConnector\.)?statsLog\s*\(/g;
const RECORD_STATS_CALL_RE = /\brecordStatsEvent\s*\(/g;
const OID_EVENT_RE = /\[OID:[^\]]+\]\s*\[([A-Z_]+)\]/g;

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
    test: call => (
      /(?:headers\.cookie|JSON\.stringify\s*\(\s*cookies\s*\)|\bcookies\b)/.test(call.text) &&
      !/redactCookieHeader/.test(call.text)
    ),
  },
  {
    id: 'oauth_access_token',
    severity: 'high',
    description: 'OAuth access token variable is logged without redaction.',
    test: call => (
      /\b(?:access_token|accessToken)\b/.test(call.text) &&
      !/redactToken/.test(call.text) &&
      !/Signing JWT access\+refresh tokens/.test(call.text)
    ),
  },
  {
    id: 'oauth_handoff_token',
    severity: 'high',
    description: 'One-shot OAuth/GDPR handoff token or redirect URL is logged without redaction.',
    test: call => (
      /(?:\{\s*token\s*\}|(?:^|[,(+])\s*token\s*(?:[),+]|\r?\n|$)|for token",?\s*token|for token',?\s*token|\b(?:courl|ourl|redirectURL)\b|auth\.html\?t=)/.test(call.text) &&
      !/redactToken/.test(call.text)
    ),
  },
  {
    id: 'full_user_wrapper',
    severity: 'high',
    description: 'Full OAuth userWrapper payload is logged.',
    test: call => (
      /\buserWrapper\b/.test(call.text) &&
      !/redact/.test(call.text)
    ),
  },
  {
    id: 'full_hdata',
    severity: 'high',
    description: 'Full GitHub hdata payload is logged.',
    test: call => (
      /\bhdata\b/.test(call.text) &&
      !/redact/.test(call.text)
    ),
  },
  {
    id: 'invalid_login_username',
    severity: 'high',
    description: 'Invalid login event logs the submitted username.',
    test: call => (
      /LOGIN_INVALID/.test(call.text) &&
      /\busername\b/.test(call.text)
    ),
  },
  {
    id: 'possible_secret_payload',
    severity: 'medium',
    description: 'Log call includes likely secret-bearing request or response payload.',
    test: call => (
      /(?:JSON\.stringify\s*\(\s*(?:req\.body|reg|device|doc|response)\s*\)|\{\s*(?:req|reg|device|doc|response)\s*\})/.test(call.text) &&
      !/redact|mask|delete/.test(call.text)
    ),
  },
];

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
  const scannedRootFiles = [];
  const missingRootFiles = [];
  const scannedServiceEntrypoints = [];
  const missingServiceEntrypoints = [];

  for (const f of ROOT_FILES) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) {
      files.push(full);
      scannedRootFiles.push(f);
    } else {
      missingRootFiles.push(f);
    }
  }

  files.push(...walk(path.join(ROOT, 'lib')));

  for (const f of SERVICE_ENTRYPOINTS) {
    const full = path.join(ROOT, f);
    if (fs.existsSync(full)) {
      files.push(full);
      scannedServiceEntrypoints.push(f);
    } else {
      missingServiceEntrypoints.push(f);
    }
  }

  return {
    files: [...new Set(files)].sort(),
    scanned_root_files: scannedRootFiles.sort(),
    missing_root_files: missingRootFiles.sort(),
    scanned_service_entrypoints: scannedServiceEntrypoints.sort(),
    missing_service_entrypoints: missingServiceEntrypoints.sort(),
  };
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

function buildLineStarts(content) {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineNumberAt(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

function isCommentedLineStart(content, lineStarts, index) {
  const line = lineNumberAt(lineStarts, index);
  const lineStart = lineStarts[line - 1];
  const before = content.slice(lineStart, index).trim();
  return before.startsWith('//') || before.startsWith('/*') || before.startsWith('*');
}

function findCallEnd(content, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(') {
      depth += 1;
      continue;
    }

    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        let end = i + 1;
        while (end < content.length && /\s|;/.test(content[end])) end += 1;
        return end;
      }
    }
  }

  const lineEnd = content.indexOf('\n', openIndex);
  return lineEnd === -1 ? content.length : lineEnd;
}

function extractCalls(content, re, decorate) {
  const calls = [];
  const lineStarts = buildLineStarts(content);
  const callRe = new RegExp(re.source, 'g');
  let match;

  while ((match = callRe.exec(content)) !== null) {
    if (isCommentedLineStart(content, lineStarts, match.index)) continue;

    const openIndex = content.indexOf('(', match.index);
    if (openIndex === -1) continue;

    const endIndex = findCallEnd(content, openIndex);
    const text = content.slice(match.index, endIndex);
    const line = lineNumberAt(lineStarts, match.index);
    const endLine = lineNumberAt(lineStarts, Math.max(match.index, endIndex - 1));

    calls.push({
      ...decorate(match),
      text,
      line,
      end_line: endLine,
      excerpt: excerpt(text),
    });

    callRe.lastIndex = Math.max(callRe.lastIndex, endIndex);
  }

  return calls;
}

function extractLogCalls(content) {
  return extractCalls(content, LOG_CALL_RE, match => ({
    sink: match[1],
    level: match[2],
  }));
}

function extractStatsCalls(content) {
  return extractCalls(content, STATS_CALL_RE, () => ({
    sink: 'metrics',
    level: 'statsLog',
  }));
}

function extractRecordStatsCalls(content) {
  return extractCalls(content, RECORD_STATS_CALL_RE, () => ({
    sink: 'logger',
    level: 'warn',
  }));
}

function normalizedLevel(sink, level) {
  if (sink === 'logger') return level;
  if (sink === 'console' && level === 'warn') return 'warn';
  if (sink === 'console' && level === 'error') return 'error';
  if (sink === 'console' && level === 'info') return 'info';
  if (sink === 'console' && level === 'debug') return 'debug';
  return 'log';
}

function excerpt(text) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 240);
}

function detectSeverityMismatch(call) {
  const actual = normalizedLevel(call.sink, call.level);

  for (const tag of SEVERITY_TAGS) {
    if (!tag.re.test(call.text)) continue;
    if (tag.expected.includes(actual)) return null;
    return {
      line: call.line,
      end_line: call.end_line,
      sink: call.sink,
      level: call.level,
      message_severity: tag.name,
      excerpt: call.excerpt,
    };
  }

  return null;
}

function eventFromStatsCall(call) {
  const match = call.text.match(/\(\s*[\s\S]*?,\s*["']([A-Z_]+)["']/);
  return match ? match[1] : null;
}

function analyzeContent(fileName, content, statisticsEvents) {
  const consoleCounts = emptyCounts();
  const loggerCounts = emptyCounts();
  const trackedEvents = [];
  const suspiciousSensitive = [];
  const severityMismatches = [];

  const logCalls = extractLogCalls(content);
  for (const call of logCalls) {
    if (call.sink === 'console') {
      increment(consoleCounts, call.level);
    } else if (call.sink === 'logger') {
      increment(loggerCounts, call.level);
    }

    const oidRe = new RegExp(OID_EVENT_RE.source, 'g');
    let match;
    while ((match = oidRe.exec(call.text)) !== null) {
      const event = match[1];
      const trackedByStatistics = statisticsEvents.includes(event);
      const compliant = !trackedByStatistics || (call.sink === 'logger' && call.level === 'warn');
      trackedEvents.push({
        event,
        line: call.line,
        end_line: call.end_line,
        sink: call.sink,
        level: call.level,
        source: 'oid_log',
        tracked_by_statistics: trackedByStatistics,
        compliant,
        excerpt: call.excerpt,
      });
    }

    for (const pattern of SENSITIVE_PATTERNS) {
      if (!pattern.test(call)) continue;
      suspiciousSensitive.push({
        id: pattern.id,
        severity: pattern.severity,
        description: pattern.description,
        line: call.line,
        end_line: call.end_line,
        excerpt: call.excerpt,
      });
    }

    const mismatch = detectSeverityMismatch(call);
    if (mismatch) severityMismatches.push(mismatch);
  }

  for (const call of extractStatsCalls(content)) {
    const event = eventFromStatsCall(call);
    if (!event) continue;
    trackedEvents.push({
      event,
      line: call.line,
      end_line: call.end_line,
      sink: 'metrics',
      level: 'statsLog',
      source: 'InfluxConnector.statsLog',
      tracked_by_statistics: statisticsEvents.includes(event),
      compliant: true,
      excerpt: call.excerpt,
    });
  }

  for (const call of extractRecordStatsCalls(content)) {
    const event = eventFromStatsCall(call);
    if (!event) continue;
    trackedEvents.push({
      event,
      line: call.line,
      end_line: call.end_line,
      sink: 'logger',
      level: 'warn',
      source: 'recordStatsEvent',
      tracked_by_statistics: statisticsEvents.includes(event),
      compliant: true,
      excerpt: call.excerpt,
    });
  }

  return {
    file: fileName,
    console: consoleCounts,
    logger: loggerCounts,
    tracked_events: trackedEvents,
    suspicious_sensitive: suspiciousSensitive,
    severity_mismatches: severityMismatches,
  };
}

function analyzeFile(filePath, statisticsEvents) {
  return analyzeContent(rel(filePath), fs.readFileSync(filePath, 'utf8'), statisticsEvents);
}

function sum(files, selector) {
  return files.reduce((acc, f) => acc + selector(f), 0);
}

function emptyScope() {
  return {
    scanned_root_files: [],
    missing_root_files: [],
    scanned_service_entrypoints: [],
    missing_service_entrypoints: [],
  };
}

function buildReport(files, statisticsEvents, scopeState = emptyScope()) {
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
      scanned_root_files: scopeState.scanned_root_files || [],
      missing_root_files: scopeState.missing_root_files || [],
      scanned_service_entrypoints: scopeState.scanned_service_entrypoints || [],
      missing_service_entrypoints: scopeState.missing_service_entrypoints || [],
      statistics_events: statisticsEvents,
    },
    summary: {
      files_scanned: files.length,
      files_missing_from_scope: (scopeState.missing_root_files || []).length + (scopeState.missing_service_entrypoints || []).length,
      service_entrypoints_scanned: (scopeState.scanned_service_entrypoints || []).length,
      service_entrypoints_missing: (scopeState.missing_service_entrypoints || []).length,
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
  console.log(`Missing scoped files          : ${s.files_missing_from_scope}`);
  console.log(`Service entrypoints scanned   : ${s.service_entrypoints_scanned}`);
  console.log(`Service entrypoints missing   : ${s.service_entrypoints_missing}`);
  console.log(`console.* calls               : ${s.console_calls}`);
  console.log(`logger.* calls                : ${s.logger_calls}`);
  console.log(`Tracked event occurrences     : ${s.tracked_event_occurrences}`);
  console.log(`Sensitive findings            : ${s.sensitive_findings} (${s.high_risk_sensitive_findings} high risk)`);
  console.log(`Severity-string mismatches    : ${s.severity_mismatches}`);
  console.log(`Tracked event quality gaps    : ${s.tracked_event_quality_gaps}`);
  console.log(`Tracked events                : ${s.tracked_events.join(', ') || '(none)'}`);

  if (report.scope.missing_service_entrypoints.length > 0) {
    console.log('\n--- Missing Service Entrypoints ---');
    for (const f of report.scope.missing_service_entrypoints) {
      console.log(f);
    }
  }

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
  const scopeState = collectFiles();
  const files = scopeState.files.map(file => analyzeFile(file, statisticsEvents));
  const report = buildReport(files, statisticsEvents, scopeState);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeContent,
  analyzeFile,
  buildReport,
  collectFiles,
  extractLogCalls,
  loadStatisticsEvents,
};
