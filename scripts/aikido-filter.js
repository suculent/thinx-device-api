#!/usr/bin/env node
//
// Filters known false positives out of an `aikido_scan_paths` result.
//
// Aikido's Code Quality product is not part of the free plan, so its issue feed
// and dashboard are unavailable and there is no way to mark a finding as a false
// positive on their side: every scan re-reports the same noise. Verified noise
// therefore lives in scripts/aikido-known-false-positives.json, and this filter
// removes it so a routine scan shows only what is new.
//
//   node scripts/aikido-filter.js scan.json
//   <scan json on stdin> | node scripts/aikido-filter.js
//
// Exit 0 when nothing unknown remains, 1 when it does (so it can gate a hook or
// a CI step). Entries that matched nothing are reported as stale — that is how a
// fix, or a refactor that moved the code, stops an entry from silently hiding a
// later finding in the same file.

const fs = require("fs");
const path = require("path");

const LIST = path.join(__dirname, "aikido-known-false-positives.json");

function normalise(text) {
  return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
}

function read(source) {
  const raw = source ? fs.readFileSync(source, "utf8") : fs.readFileSync(0, "utf8");
  if (!raw.trim()) throw new Error("no scan JSON given (pass a file or pipe it in)");
  return JSON.parse(raw);
}

function main() {
  const known = JSON.parse(fs.readFileSync(LIST, "utf8")).entries;
  const scan = read(process.argv[2]);
  const issues = Array.isArray(scan) ? scan : (scan.issues || []);

  const used = new Set();

  const remaining = issues.filter((issue) => {
    const rule = normalise(issue.issue_rule_id);
    const file = normalise(issue.issue_file);
    const snippet = normalise(issue.issue_snippet);

    const hit = known.findIndex((entry) =>
      normalise(entry.rule) === rule &&
      normalise(entry.file) === file &&
      snippet.includes(normalise(entry.snippet)));

    if (hit === -1) return true;
    used.add(hit);
    return false;
  });

  const stale = known
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !used.has(index));

  console.log(`scanned issues: ${issues.length}  known-noise suppressed: ${issues.length - remaining.length}  remaining: ${remaining.length}`);

  for (const issue of remaining) {
    console.log(`\n  ${issue.issue_rule_id}  ${issue.issue_file}:${issue.issue_start_line}  (severity ${issue.issue_severity})`);
    console.log(`    ${issue.issue_title}`);
    console.log(`    ${normalise(issue.issue_snippet).slice(0, 160)}`);
  }

  if (stale.length) {
    console.log(`\nstale entries — matched nothing in this scan, so they are either fixed or have moved:`);
    for (const { entry } of stale) console.log(`  - ${entry.rule}  ${entry.file}  "${normalise(entry.snippet).slice(0, 70)}"`);
    console.log(`  (only meaningful when the scan covered those files; delete an entry once its finding is genuinely gone)`);
  }

  process.exit(remaining.length ? 1 : 0);
}

try {
  main();
} catch (e) {
  console.error("aikido-filter:", e.message);
  process.exit(2);
}
