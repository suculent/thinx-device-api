'use strict';

/**
 * lib/thinx/finder.js
 *
 * Synchronous file-walk primitives to replace fs-finder call sites.
 * Exports two named functions: findFilesSync and findDirsSync.
 *
 * NOTE: Symlinks are NOT followed — Dirent.isDirectory() returns false for
 * symlinks to directories, so symlink traversal escape is not possible.
 * This preserves fs-finder's existing behaviour (T-15-02).
 */

const fs = require('fs');
const path = require('path');

/**
 * Returns true if the basename matches the mask.
 * Mask may contain a single '*' wildcard (prefix/suffix check) or be an
 * exact filename string. The '*' wildcard matches any sequence of characters
 * in the basename — consistent with fs-finder's simple glob behaviour.
 *
 * @param {string} name   - basename of the entry
 * @param {string} mask   - glob pattern (e.g. "*.ino", "*.zip") or exact name
 * @returns {boolean}
 */
function matchesMask(name, mask) {
  const star = mask.indexOf('*');
  if (star === -1) {
    // exact match
    return name === mask;
  }
  // glob: split on the first '*' only (consistent with fs-finder)
  const prefix = mask.slice(0, star);
  const suffix = mask.slice(star + 1);
  return name.startsWith(prefix) && name.endsWith(suffix);
}

/**
 * Synchronously find files matching `mask` under `root`.
 *
 * @param {string}  root            - Absolute path to the directory to search.
 * @param {string}  mask            - Glob pattern ("*.ino", "*.zip") or exact
 *                                    filename ("thinx.yml", "environment.json").
 *                                    Only the '*' wildcard is supported.
 * @param {boolean} [recursive=false] - If true, descend all subdirectories via
 *                                    a manual synchronous stack-walk that is
 *                                    version-independent (does NOT use
 *                                    fs.readdirSync({recursive:true})).
 * @param {boolean} [includeDotfiles=false] - If false (default), entries whose
 *                                    basename starts with '.' are skipped.
 *                                    Set to true when searching for .git etc.
 * @returns {string[]} Array of absolute file paths matching mask. Returns []
 *                     if root does not exist, is not a directory, or no files
 *                     match. Never throws.
 */
function findFilesSync(root, mask, recursive = false, includeDotfiles = false) {
  if (!fs.existsSync(root)) return [];
  try {
    if (!fs.statSync(root).isDirectory()) return [];
  } catch (_e) {
    return [];
  }

  const results = [];

  if (!recursive) {
    // Non-recursive: read only direct children of root.
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (_e) {
      return [];
    }
    for (const entry of entries) {
      if (!includeDotfiles && entry.name.startsWith('.')) continue;
      if (entry.isFile() && matchesMask(entry.name, mask)) {
        results.push(path.join(root, entry.name));
      }
    }
    return results;
  }

  // Recursive: manual synchronous stack-walk (version-independent).
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      continue; // unreadable directory — skip
    }
    for (const entry of entries) {
      if (!includeDotfiles && entry.name.startsWith('.')) continue;
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
      } else if (entry.isFile() && matchesMask(entry.name, mask)) {
        results.push(absPath);
      }
    }
  }
  return results;
}

/**
 * Synchronously find directories matching `mask` under `root`.
 *
 * @param {string}  root            - Absolute path to the directory to search.
 * @param {string}  mask            - Glob pattern or exact directory name
 *                                    (e.g. ".git", "*.d").
 * @param {boolean} [recursive=false] - If true, descend all subdirectories via
 *                                    a manual synchronous stack-walk.
 * @param {boolean} [includeDotfiles=false] - If false (default), entries whose
 *                                    basename starts with '.' are skipped.
 *                                    Set to true when searching for .git dirs.
 * @returns {string[]} Array of absolute directory paths matching mask. Returns
 *                     [] if root does not exist, is not a directory, or no
 *                     directories match. Never throws.
 */
function findDirsSync(root, mask, recursive = false, includeDotfiles = false) {
  if (!fs.existsSync(root)) return [];
  try {
    if (!fs.statSync(root).isDirectory()) return [];
  } catch (_e) {
    return [];
  }

  const results = [];

  if (!recursive) {
    // Non-recursive: read only direct children of root.
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (_e) {
      return [];
    }
    for (const entry of entries) {
      if (!includeDotfiles && entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && matchesMask(entry.name, mask)) {
        results.push(path.join(root, entry.name));
      }
    }
    return results;
  }

  // Recursive: manual synchronous stack-walk (version-independent).
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      continue; // unreadable directory — skip
    }
    for (const entry of entries) {
      // For dotfile-exclusion: skip this entry entirely (don't descend into
      // it either — consistent with fs-finder which skips hidden trees).
      if (!includeDotfiles && entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        const absPath = path.join(dir, entry.name);
        if (matchesMask(entry.name, mask)) {
          results.push(absPath);
        }
        // Always push to stack so we descend (even if it matched — children
        // might also match a different deeper directory with the same name).
        stack.push(absPath);
      }
    }
  }
  return results;
}

module.exports = { findFilesSync, findDirsSync };
