'use strict';

/**
 * lib/thinx/safepath.js
 *
 * Contained, no-follow access to files inside a directory whose contents are
 * not trusted -- a cloned firmware repository (Phase 23, SEC-PATH-01, D-11).
 * Every builder read and write of a repository-controlled file goes through
 * here: thinx.yml (including the decrypted Wi-Fi credential write-back),
 * environment.json, thinx_build.json, the generated header, the pine64
 * Makefile and the cleanupSecrets unlinks.
 *
 * Why this shape: a lexical path.resolve + startsWith check is not enough in a
 * checkout. The repository decides which names are symlinks, so a regular
 * looking `thinx.yml` can point at /run/secrets or at a sibling build dir.
 * This module therefore
 *   - realpaths the root AND the target (or the target's parent for a file
 *     that does not exist yet) and compares them with path.relative, which
 *     also separates `.../abc` from the prefix sibling `.../abc-evil`;
 *   - refuses a final component that lstat reports as a symlink;
 *   - opens with O_NOFOLLOW, so a symlink swapped in between the lstat check
 *     and the open is still refused by the kernel (closes the check-then-open
 *     window for the final component; parents are realpath-checked).
 *
 * Exports plain named functions. Uses only `fs` and `path`, no app config, so
 * it loads anywhere. Never throws: every failure is returned as a reason.
 *
 * Reasons: invalid_input, root_missing, missing, symlink, outside_root,
 * not_a_file, io_error.
 */

const fs = require('fs');
const path = require('path');

const O_NOFOLLOW = fs.constants.O_NOFOLLOW;

function isNonEmptyString(value) {
  return (typeof value === 'string') && (value.length > 0) && (value.indexOf('\0') === -1);
}

// True when `rel` (a path.relative result) names something strictly below its
// base: not the base itself, not a parent reference, not another drive/root.
// A name such as "..foo" is a legitimate child and is accepted.
function relativeIsInside(rel) {
  if (rel === '') return false;
  if (path.isAbsolute(rel)) return false;
  if ((rel === '..') || rel.startsWith('..' + path.sep)) return false;
  return true;
}

/**
 * Lexical containment check for paths that may not exist yet (BUILD_PATH).
 * `candidate` is resolved against `root`. Never throws.
 *
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean} true only when candidate is strictly inside root
 */
function isInside(root, candidate) {
  try {
    if (!isNonEmptyString(root) || !isNonEmptyString(candidate)) return false;
    const base = path.resolve(root);
    return relativeIsInside(path.relative(base, path.resolve(base, candidate)));
  } catch (_e) {
    return false;
  }
}

// Shared core of resolveInside/readFileInside/writeFileInside/unlinkInside.
// Returns { ok, path, reason, stat }; `stat` is the lstat of an existing,
// non-symlink target. Containment is decided before `missing`/`symlink`, so a
// path outside the root is always reported as outside_root.
function inspect(root, target, opts) {
  const allowMissing = !!(opts && opts.allowMissing === true);

  if (!isNonEmptyString(root) || !isNonEmptyString(target)) {
    return { ok: false, reason: 'invalid_input' };
  }

  let rootReal;
  try {
    rootReal = fs.realpathSync(root);
  } catch (_e) {
    return { ok: false, reason: 'root_missing' };
  }

  const abs = path.resolve(root, target);

  let lst = null;
  try {
    lst = fs.lstatSync(abs);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') return { ok: false, reason: 'io_error' };
  }

  let real;
  let kind;
  if ((lst === null) || lst.isSymbolicLink()) {
    // Missing file or symlink: locate the entry itself (never its link target)
    // through the realpath of its parent directory.
    let parentReal;
    try {
      parentReal = fs.realpathSync(path.dirname(abs));
    } catch (_e) {
      // Parent missing too: still refuse an escape lexically before saying "missing".
      const lexical = path.relative(path.resolve(root), abs);
      return { ok: false, reason: relativeIsInside(lexical) ? 'missing' : 'outside_root' };
    }
    real = path.join(parentReal, path.basename(abs));
    kind = (lst === null) ? 'missing' : 'symlink';
  } else {
    try {
      real = fs.realpathSync(abs);
    } catch (_e) {
      return { ok: false, reason: 'io_error' };
    }
    kind = 'present';
  }

  if (!relativeIsInside(path.relative(rootReal, real))) {
    return { ok: false, reason: 'outside_root' };
  }

  if (kind === 'symlink') return { ok: false, path: real, reason: 'symlink' };
  if (kind === 'missing') {
    return allowMissing ? { ok: true, path: real, missing: true } : { ok: false, path: real, reason: 'missing' };
  }
  return { ok: true, path: real, stat: lst };
}

/**
 * Resolves `target` (relative to `root`, or absolute) to a realpath strictly
 * inside `root`. Refuses symlinks on the final component. Never throws.
 *
 * @param {string} root
 * @param {string} target
 * @param {{allowMissing?: boolean}} [opts] - accept a not-yet-existing file
 *        whose parent is contained
 * @returns {{ok: boolean, path?: string, reason?: string}}
 */
function resolveInside(root, target, opts) {
  try {
    const r = inspect(root, target, opts);
    const out = { ok: r.ok };
    if (typeof r.path !== 'undefined') out.path = r.path;
    if (typeof r.reason !== 'undefined') out.reason = r.reason;
    return out;
  } catch (_e) {
    return { ok: false, reason: 'io_error' };
  }
}

function closeQuietly(fd) {
  if (fd === null) return;
  try { fs.closeSync(fd); } catch (_e) { /* nothing left to do */ }
}

/**
 * Reads a regular file contained in `root`, opened with O_NOFOLLOW.
 * Never throws.
 *
 * @param {string} root
 * @param {string} target
 * @param {string} [encoding] - e.g. "utf8"; Buffer when omitted
 * @returns {{ok: boolean, data?: (string|Buffer), reason?: string}}
 */
function readFileInside(root, target, encoding) {
  let fd = null;
  try {
    const r = inspect(root, target);
    if (!r.ok) return { ok: false, reason: r.reason };
    // Checked before open: opening a FIFO for reading would block.
    if (!r.stat.isFile()) return { ok: false, reason: 'not_a_file' };
    fd = fs.openSync(r.path, fs.constants.O_RDONLY | O_NOFOLLOW);
    if (!fs.fstatSync(fd).isFile()) return { ok: false, reason: 'not_a_file' };
    const data = (typeof encoding === 'string') ? fs.readFileSync(fd, encoding) : fs.readFileSync(fd);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: (e && e.code === 'ELOOP') ? 'symlink' : 'io_error' };
  } finally {
    closeQuietly(fd);
  }
}

/**
 * Creates or overwrites a regular file contained in `root`, opened with
 * O_NOFOLLOW (mode 0o666 before umask, the writeFileSync default).
 * Never throws.
 *
 * @param {string} root
 * @param {string} target
 * @param {(string|Buffer|Uint8Array)} data
 * @returns {{ok: boolean, reason?: string}}
 */
function writeFileInside(root, target, data) {
  let fd = null;
  try {
    // Checked before the open, because O_TRUNC would already empty the file.
    if ((typeof data !== 'string') && !(data instanceof Uint8Array)) {
      return { ok: false, reason: 'invalid_input' };
    }
    const r = inspect(root, target, { allowMissing: true });
    if (!r.ok) return { ok: false, reason: r.reason };
    if ((typeof r.stat !== 'undefined') && !r.stat.isFile()) return { ok: false, reason: 'not_a_file' };
    fd = fs.openSync(r.path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | O_NOFOLLOW, 0o666);
    if (!fs.fstatSync(fd).isFile()) return { ok: false, reason: 'not_a_file' };
    fs.writeFileSync(fd, data);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.code === 'ELOOP') ? 'symlink' : 'io_error' };
  } finally {
    closeQuietly(fd);
  }
}

/**
 * Removes a file contained in `root`. A symlink is removed itself -- unlink
 * never follows the link, so its target is left intact. Directories and
 * anything outside `root` are left alone. Never throws.
 *
 * @param {string} root
 * @param {string} target
 * @returns {boolean} true when an entry was removed
 */
function unlinkInside(root, target) {
  try {
    const r = inspect(root, target);
    if ((r.reason === 'symlink') || (r.ok && r.stat.isFile())) {
      fs.unlinkSync(r.path);
      return true;
    }
    return false;
  } catch (_e) {
    return false;
  }
}

module.exports = { isInside, resolveInside, readFileInside, writeFileInside, unlinkInside };
