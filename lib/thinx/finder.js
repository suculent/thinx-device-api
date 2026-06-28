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
  // Guard against prefix/suffix overlap on short names (e.g. mask "a*a", name "a"):
  // startsWith + endsWith would both pass on the same characters. Require the name
  // to be long enough to hold prefix and suffix without overlap.
  if (name.length < prefix.length + suffix.length) return false;
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
  // Enforce the documented absolute-path contract regardless of caller input.
  root = path.resolve(root);
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

  // Recursive: pre-order DFS in readdir order. This matches fs-finder's traversal
  // exactly — fs-finder (base/node_modules/fs-finder/lib/Base.js getPathsSync) reads
  // each directory with fs.readdirSync and, in array order, pushes a matching entry
  // then immediately recurses into a subdirectory. Using the same syscall and the
  // same per-entry pre-order recursion preserves result ordering, which callers like
  // platform.js (`ymls[0]`) and builder.js (header file) depend on. Version-independent
  // (does NOT use fs.readdirSync({recursive:true})).
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return; // unreadable directory — skip
    }
    for (const entry of entries) {
      if (!includeDotfiles && entry.name.startsWith('.')) continue;
      const absPath = path.join(dir, entry.name);
      if (entry.isFile() && matchesMask(entry.name, mask)) {
        results.push(absPath);
      } else if (entry.isDirectory()) {
        walk(absPath);
      }
    }
  };
  walk(root);
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
  // Enforce the documented absolute-path contract regardless of caller input.
  root = path.resolve(root);
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

  // Recursive: pre-order DFS in readdir order — matches fs-finder's getPathsSync,
  // which pushes a matching directory then immediately recurses into it. Same syscall
  // (fs.readdirSync) and same per-entry pre-order recursion preserve result ordering.
  // For dotfile-exclusion we skip the entry entirely (don't descend) — consistent with
  // fs-finder skipping hidden trees. Version-independent (no {recursive:true}).
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return; // unreadable directory — skip
    }
    for (const entry of entries) {
      if (!includeDotfiles && entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        const absPath = path.join(dir, entry.name);
        if (matchesMask(entry.name, mask)) {
          results.push(absPath);
        }
        // Always descend (even if it matched — a deeper directory with the same
        // name might also match).
        walk(absPath);
      }
    }
  };
  walk(root);
  return results;
}

module.exports = { findFilesSync, findDirsSync };
