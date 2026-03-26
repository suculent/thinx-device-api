#!/usr/bin/env node
/**
 * normalize-commit-msg.js
 *
 * Normalizes a git commit message to conventional commit format.
 * Can be used as a prepare-commit-msg hook or run standalone.
 *
 * Usage (standalone):
 *   node scripts/normalize-commit-msg.js <commit-msg-file>
 *
 * Usage (prepare-commit-msg hook):
 *   node scripts/normalize-commit-msg.js "$1" "$2"
 */

const fs = require('fs');
const path = require('path');

const CONVENTIONAL_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor',
  'perf', 'test', 'chore', 'ci', 'revert', 'audit',
];

// Regex: matches "type(scope): subject" or "type: subject"
const CONVENTIONAL_PATTERN = /^([a-z]+)(\([^)]*\))?!?:\s+.+/;

// Keyword map for inferring type from free-form messages
const KEYWORD_TYPE_MAP = [
  { pattern: /^(fix|fixes|fixed|bug|bugfix|hotfix)\b/i, type: 'fix' },
  { pattern: /^(feat|feature|add|added|adds|new|implement|implement)\b/i, type: 'feat' },
  { pattern: /^(doc|docs|document|documentation)\b/i, type: 'docs' },
  { pattern: /^(test|tests|testing|spec|specs)\b/i, type: 'test' },
  { pattern: /^(refactor|refactoring|cleanup|clean up|reorganize)\b/i, type: 'refactor' },
  { pattern: /^(perf|performance|optimize|optimise|speed)\b/i, type: 'perf' },
  { pattern: /^(style|format|formatting|lint|linting)\b/i, type: 'style' },
  { pattern: /^(ci|build|pipeline|deploy)\b/i, type: 'ci' },
  { pattern: /^(revert|rollback)\b/i, type: 'revert' },
  { pattern: /^(audit|security|sec)\b/i, type: 'audit' },
  { pattern: /^(chore|update|updates|bump|upgrade|downgrade)\b/i, type: 'chore' },
];

/**
 * Normalize a single commit message line.
 * @param {string} msg - Raw commit message
 * @returns {string} - Normalized commit message
 */
function normalizeMessage(msg) {
  const trimmed = msg.trim();

  // Skip empty messages and merge/fixup/squash commits
  if (!trimmed || /^(Merge|Revert|fixup!|squash!|WIP)/i.test(trimmed)) {
    return trimmed;
  }

  // Already in conventional format — just normalize whitespace and type case
  const match = trimmed.match(/^([A-Za-z]+)(\([^)]*\))?(!)?\s*:\s*(.*)/s);
  if (match) {
    const rawType = match[1];
    const scope = match[2] || '';
    const breaking = match[3] || '';
    const subject = match[4].trim();
    const normalizedType = rawType.toLowerCase();

    // Keep type as-is if it's already valid (even if not in our list)
    return `${normalizedType}${scope}${breaking}: ${subject}`;
  }

  // Free-form message — try to infer type from keywords
  for (const { pattern, type } of KEYWORD_TYPE_MAP) {
    if (pattern.test(trimmed)) {
      // Remove the leading keyword and colon/dash if present
      const cleaned = trimmed
        .replace(/^[a-z]+[\s\-:]+/i, '')
        .replace(/^:\s*/, '')
        .trim();
      const subject = cleaned || trimmed;
      return `${type}: ${subject}`;
    }
  }

  // No keyword match — default to 'chore'
  return `chore: ${trimmed}`;
}

function main() {
  const commitMsgFile = process.argv[2];
  const commitSource = process.argv[3]; // 'message', 'template', 'merge', 'squash', 'commit'

  if (!commitMsgFile) {
    console.error('Usage: normalize-commit-msg.js <commit-msg-file> [source]');
    process.exit(1);
  }

  // Don't modify merge commits or commits created with -m flag
  if (commitSource === 'merge' || commitSource === 'commit') {
    process.exit(0);
  }

  const filePath = path.resolve(commitMsgFile);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const lines = original.split('\n');

  // Only normalize the subject line (first non-empty, non-comment line)
  let subjectIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#')) {
      subjectIndex = i;
      break;
    }
  }

  if (subjectIndex === -1) {
    // No subject line found (all comments or empty), nothing to do
    process.exit(0);
  }

  const normalizedSubject = normalizeMessage(lines[subjectIndex]);
  if (normalizedSubject === lines[subjectIndex]) {
    // No change needed
    process.exit(0);
  }

  lines[subjectIndex] = normalizedSubject;
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  process.exit(0);
}

main();
