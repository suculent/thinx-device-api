'use strict';

/**
 * lib/thinx/log_retention.js
 *
 * One retention job for audit docs (managed_logs) and build records
 * (managed_builds) plus the build folders on both artifact roots
 * (Phase 26, LOG-04; D-07..D-11, D-16, D-17).
 *
 *   plan()   reads everything and decides what would go. It never deletes.
 *   apply()  deletes what plan() selected, folder first, record afterwards.
 *   formatReport() prints aggregates only (counts, bytes, YYYY-MM-DD dates).
 *
 * Inputs from CouchDB are untrusted path material. A build folder is only
 * ever a candidate when it is exactly <root>/<owner>/<udid>/<build_id> with
 *   owner     Sanitka.strictOwner (exactly 64 [a-z0-9]),
 *   udid      strict UUID,
 *   build_id  strict UUID,
 * and safepath.resolveInside(root, rel) returns ok for a real directory
 * (lstat, never a symlink). Nothing at any other depth is ever a candidate,
 * so udid-level OTA files (build.json, <uuid>.zip, firmware.bin,
 * basename.json), owner-level avatar.json and repo-name dirs survive.
 *
 * The orphan sweep (folders with no record) runs only when both record reads
 * succeeded and returned at least one row: a CouchDB outage must never turn
 * every old folder into an orphan (Pitfall 6). Directory mtime understates
 * activity, so a folder's age is the newest mtime of the directory and its
 * direct children (lstat). Only depths 1-3 are listed; a candidate is walked
 * fully only to size it (Pitfall 10).
 *
 * Real paths and ids are held inside the report object; formatReport never
 * prints them.
 *
 * Requires only fs, path, ./safepath and ./sanitka: no app config, no
 * globals.js, no database.js, so it runs in a one-shot container.
 */

const nodeFs = require('fs');
const path = require('path');
const safepath = require('./safepath');
const Sanitka = require('./sanitka');

const DAY_MS = 86400000;
const ROOT_NAMES = ['deploy', 'repos'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH = 2000;

class RetentionError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.retentionReason = reason;
    this.cause = cause;
  }
}

function isUuid(v) {
  return (typeof v === 'string') && UUID_RE.test(v);
}

function day(ms) {
  return (typeof ms === 'number' && Number.isFinite(ms)) ? new Date(ms).toISOString().slice(0, 10) : 'none';
}

function minMax(acc, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return;
  if (acc.oldest === null || v < acc.oldest) acc.oldest = v;
  if (acc.newest === null || v > acc.newest) acc.newest = v;
}

// Identity of a build doc, by the same rule as the builds_by_time map:
// root fields when the root has a string owner, else log[0]; build_id falls
// back to the doc _id; a non-string udid is null.
function identityOfDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  let r = doc;
  if (typeof doc.owner !== 'string' && Array.isArray(doc.log) && doc.log.length > 0 &&
      doc.log[0] && typeof doc.log[0].owner === 'string') {
    r = doc.log[0];
  }
  if (typeof r.owner !== 'string') return null;
  return {
    owner: r.owner,
    udid: (typeof r.udid === 'string') ? r.udid : null,
    build_id: (typeof r.build_id === 'string') ? r.build_id : doc._id
  };
}

// owner/udid/build_id when all three segments pass the strict gates, else null.
function relOf(ident) {
  if (!ident) return null;
  if (Sanitka.strictOwner(ident.owner) === null) return null;
  if (!isUuid(ident.udid) || !isUuid(ident.build_id)) return null;
  return ident.owner + '/' + ident.udid + '/' + ident.build_id;
}

function keyOf(rel) {
  return rel.toLowerCase();
}

class LogRetention {

  /**
   * @param {object} deps
   * @param {object} deps.logsDb    couch-like db with view(ddoc, view, params) and bulk({docs})
   * @param {object} deps.buildsDb  same
   * @param {{deploy: string, repos: string}} deps.roots  absolute root directories
   * @param {number|Date|function} [deps.now]  clock (ms), default Date.now
   * @param {object} [deps.fs]       fs implementation (specs inject failures)
   * @param {number} [deps.maxAgeDays=365]
   * @param {number} [deps.batchSize=500]
   */
  constructor(deps) {
    deps = deps || {};
    this.logsDb = deps.logsDb;
    this.buildsDb = deps.buildsDb;
    this.roots = deps.roots || {};
    this.fs = deps.fs || nodeFs;
    this.maxAgeDays = Number.isInteger(deps.maxAgeDays) && deps.maxAgeDays > 0 ? deps.maxAgeDays : 365;
    const b = deps.batchSize;
    this.batchSize = (Number.isInteger(b) && b > 0 && b <= MAX_BATCH) ? b : 500;
    this._now = deps.now;
  }

  now() {
    const n = this._now;
    if (typeof n === 'function') return Number(n());
    if (n instanceof Date) return n.getTime();
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    return Date.now();
  }

  // Pages a view with limit batch+1; the extra row is the next
  // startkey/startkey_docid. Never uses skip.
  async _readView(db, view, baseParams, onRow) {
    const batch = this.batchSize;
    let next = null;
    for (;;) {
      const params = Object.assign({}, baseParams, { limit: batch + 1 });
      if (next) {
        params.startkey = next.key;
        params.startkey_docid = next.id;
      }
      const page = await db.view('paging', view, params);
      const rows = (page && Array.isArray(page.rows)) ? page.rows : [];
      for (const row of rows.slice(0, batch)) onRow(row);
      if (rows.length <= batch) return;
      const last = rows[batch];
      if (!last || typeof last.id !== 'string') return;
      next = { key: last.key, id: last.id };
    }
  }

  _checkRoots() {
    const out = {};
    for (const name of ROOT_NAMES) {
      const root = this.roots[name];
      let ok = false;
      if (typeof root === 'string' && path.isAbsolute(root)) {
        try {
          ok = this.fs.statSync(root).isDirectory();
        } catch (_e) {
          ok = false;
        }
      }
      if (!ok) throw new RetentionError('root_missing:' + name);
      out[name] = root;
    }
    return out;
  }

  _lstat(p) {
    try {
      return this.fs.lstatSync(p);
    } catch (_e) {
      return null;
    }
  }

  _isRealDir(p) {
    const st = this._lstat(p);
    return !!st && st.isDirectory() && !st.isSymbolicLink();
  }

  _list(dir) {
    try {
      return this.fs.readdirSync(dir);
    } catch (_e) {
      return [];
    }
  }

  // Sum of regular-file sizes below dir; symlinks are counted as nothing and
  // never followed.
  _sizeOf(dir) {
    let total = 0;
    const stack = [dir];
    while (stack.length > 0) {
      const d = stack.pop();
      for (const name of this._list(d)) {
        const p = path.join(d, name);
        const st = this._lstat(p);
        if (!st || st.isSymbolicLink()) continue;
        if (st.isDirectory()) stack.push(p);
        else if (st.isFile()) total += st.size;
      }
    }
    return total;
  }

  // Newest mtime of the directory and its direct children (lstat).
  _newestMtime(dir) {
    const st = this._lstat(dir);
    if (!st) return null;
    let newest = st.mtimeMs;
    for (const name of this._list(dir)) {
      const c = this._lstat(path.join(dir, name));
      if (c && c.mtimeMs > newest) newest = c.mtimeMs;
    }
    return newest;
  }

  // The containment gate used at plan time and again right before rm:
  // resolveInside ok, then lstat must show a real directory.
  _gate(root, rel) {
    const r = safepath.resolveInside(root, rel);
    if (!r.ok) return { ok: false, reason: r.reason || 'refused' };
    if (!this._isRealDir(r.path)) return { ok: false, reason: 'not_a_directory' };
    return { ok: true, path: r.path };
  }

  /**
   * Reads both databases and both roots and returns a report. Deletes nothing.
   * Throws a RetentionError (retentionReason) on a fatal condition:
   * root_missing:<name>, audit_read_failed, record_read_failed.
   */
  async plan() {
    const nowMs = this.now();
    const cutoffMs = nowMs - this.maxAgeDays * DAY_MS;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const roots = this._checkRoots();

    // (b) Audit docs dated before the cutoff (exclusive).
    const audit = [];
    try {
      await this._readView(this.logsDb, 'audit_by_date',
        { endkey: cutoffIso, inclusive_end: false },
        (row) => {
          if (!row || typeof row.id !== 'string' || row.id.indexOf('_design/') === 0) return;
          audit.push({ id: row.id, rev: row.value, date: row.key });
        });
    } catch (e) {
      throw new RetentionError('audit_read_failed', e);
    }

    // (c) Build records: builds_by_time (expiry) and builds_by_owner_time
    // with include_docs (protect set completion). Either failing is fatal.
    const docIds = new Set();
    const protect = new Set();
    const expired = [];
    let rowsTotal = 0;
    try {
      await this._readView(this.buildsDb, 'builds_by_time', {}, (row) => {
        if (!row || typeof row.id !== 'string') return;
        rowsTotal += 1;
        docIds.add(row.id);
        const v = (row.value && typeof row.value === 'object') ? row.value : {};
        const ident = {
          owner: v.owner,
          udid: (typeof v.udid === 'string') ? v.udid : null,
          build_id: (typeof v.build_id === 'string') ? v.build_id : row.id
        };
        const rel = relOf(ident);
        if (rel !== null) protect.add(keyOf(rel));
        if (typeof row.key === 'number' && Number.isFinite(row.key) && row.key < cutoffMs) {
          expired.push({ id: row.id, rev: v.rev, time: row.key, rel });
        }
      });
      await this._readView(this.buildsDb, 'builds_by_owner_time', { include_docs: true }, (row) => {
        if (!row || typeof row.id !== 'string') return;
        rowsTotal += 1;
        docIds.add(row.id);
        const rel = relOf(identityOfDoc(row.doc));
        if (rel !== null) protect.add(keyOf(rel));
      });
    } catch (e) {
      throw new RetentionError('record_read_failed', e);
    }

    const auditDates = { oldest: null, newest: null };
    for (const a of audit) minMax(auditDates, Date.parse(a.date));
    const recordDates = { oldest: null, newest: null };
    for (const r of expired) minMax(recordDates, r.time);

    // (d) Record folders per root.
    const perRoot = {};
    for (const name of ROOT_NAMES) {
      const root = roots[name];
      const info = {
        root,
        candidates: new Map(),   // record id -> {rel, path, bytes}
        refused: new Set(),      // record ids refused in this root
        missing: 0,
        orphans: [],             // {rel, path, bytes, newest}
        orphanDates: { oldest: null, newest: null }
      };
      for (const rec of expired) {
        if (rec.rel === null) continue;
        const g = this._gate(root, rec.rel);
        if (g.ok) {
          info.candidates.set(rec.id, { rel: rec.rel, path: g.path, bytes: this._sizeOf(g.path) });
        } else if (g.reason === 'missing') {
          info.missing += 1;
        } else {
          info.refused.add(rec.id);
        }
      }
      perRoot[name] = info;
    }

    // (e) Orphan sweep, only with a non-empty, successfully read record set.
    let sweep = 'ran';
    if (rowsTotal === 0) {
      sweep = 'aborted:record_set_empty';
    } else {
      for (const name of ROOT_NAMES) this._sweep(perRoot[name], protect, cutoffMs);
    }

    return {
      nowMs, cutoffMs, cutoffIso,
      audit, auditDates,
      buildRecords: docIds.size,
      expired, recordDates,
      invalidIdentity: expired.filter((r) => r.rel === null).length,
      perRoot,
      sweep
    };
  }

  _sweep(info, protect, cutoffMs) {
    const root = info.root;
    for (const owner of this._list(root)) {
      if (Sanitka.strictOwner(owner) === null) continue;
      const ownerDir = path.join(root, owner);
      if (!this._isRealDir(ownerDir)) continue;
      for (const udid of this._list(ownerDir)) {
        if (!isUuid(udid)) continue;
        const udidDir = path.join(ownerDir, udid);
        if (!this._isRealDir(udidDir)) continue;
        for (const build of this._list(udidDir)) {
          if (!isUuid(build)) continue;
          const buildDir = path.join(udidDir, build);
          if (!this._isRealDir(buildDir)) continue;
          const rel = owner + '/' + udid + '/' + build;
          if (protect.has(keyOf(rel))) continue;
          const newest = this._newestMtime(buildDir);
          if (newest === null || !(newest < cutoffMs)) continue;
          const g = this._gate(root, rel);
          if (!g.ok) continue;
          info.orphans.push({ rel, path: g.path, bytes: this._sizeOf(g.path), newest });
          minMax(info.orphanDates, newest);
        }
      }
    }
  }

  // Deletes one depth-3 build directory after re-running the containment
  // gate immediately before the rm. Returns deleted | missing | refused | failed.
  // fs.rmSync removes a symlink inside the tree as a link; it never follows it.
  _rmDir(root, rel) {
    const r = safepath.resolveInside(root, rel);
    if (!r.ok) return (r.reason === 'missing') ? 'missing' : 'refused';
    if (!this._isRealDir(r.path)) return 'refused';
    try {
      this.fs.rmSync(r.path, { recursive: true, force: false });
      return 'deleted';
    } catch (_e) {
      return 'failed';
    }
  }

  // _bulk_docs `_deleted` in batches. Per-doc conflict and error results are
  // counted; a rejected call counts its whole batch as failed.
  async _bulkDelete(db, docs) {
    const out = { deleted: 0, conflicts: 0, failed: 0, deletedIds: new Set() };
    for (let i = 0; i < docs.length; i += this.batchSize) {
      const batch = docs.slice(i, i + this.batchSize).map((d) => ({ _id: d.id, _rev: d.rev, _deleted: true }));
      let results;
      try {
        results = await db.bulk({ docs: batch });
      } catch (_e) {
        out.failed += batch.length;
        continue;
      }
      const list = Array.isArray(results) ? results : [];
      for (const r of list.slice(0, batch.length)) {
        if (r && r.error === 'conflict') out.conflicts += 1;
        else if (!r || r.error) out.failed += 1;
        else {
          out.deleted += 1;
          if (typeof r.id === 'string') out.deletedIds.add(r.id);
        }
      }
      // A short response leaves docs unaccounted for: count them as failed.
      if (list.length < batch.length) out.failed += batch.length - list.length;
    }
    return out;
  }

  /**
   * Deletes what plan() selected (D-09, D-11, D-16, D-17).
   *
   * Audit: expired audit docs when opts.audit is true.
   * Builds, only when opts.roots is non-empty (an empty list means "none"):
   *   1. per expired record, the folder in every applied root (re-checked
   *      right before rm); the record joins the bulk delete only when every
   *      applied root's folder is gone or was missing and no applied root
   *      refused it; invalid-identity records join directly;
   *   2. the records, by _bulk_docs `_deleted`, AFTER their folders;
   *   3. the applied roots' orphan folders, through the same re-check.
   * A crash between 1 and 2 leaves an orphan record, never an untracked folder.
   *
   * @param {object} report  from plan()
   * @param {{roots: string[], audit: boolean}} opts
   * @returns {Promise<object>} counters plus `complete`
   */
  async apply(report, opts) {
    opts = opts || {};
    const wanted = Array.isArray(opts.roots) ? opts.roots : [];
    const applied = ROOT_NAMES.filter((n) => wanted.indexOf(n) !== -1);
    const result = {
      roots: applied,
      audit: opts.audit === true,
      audit_deleted: 0, audit_conflicts: 0, audit_failed: 0,
      build_records_deleted: 0, build_records_kept: 0,
      perRoot: {},
      complete: false
    };
    for (const name of ROOT_NAMES) {
      result.perRoot[name] = { folders_deleted: 0, orphans_deleted: 0, delete_failed: 0, untracked_after: 0 };
    }
    let problems = false;

    if (result.audit && report.audit.length > 0) {
      const b = await this._bulkDelete(this.logsDb, report.audit);
      result.audit_deleted = b.deleted;
      result.audit_conflicts = b.conflicts;
      result.audit_failed = b.failed;
      if (b.conflicts > 0 || b.failed > 0) problems = true;
    }

    if (applied.length > 0) {
      const toDelete = [];
      let kept = 0;
      for (const rec of report.expired) {
        if (rec.rel === null) {
          toDelete.push(rec);
          continue;
        }
        let ok = true;
        for (const name of applied) {
          const info = report.perRoot[name];
          const pr = result.perRoot[name];
          if (info.refused.has(rec.id)) {
            ok = false;
            continue;
          }
          if (!info.candidates.has(rec.id)) continue;   // missing at plan time
          const outcome = this._rmDir(info.root, rec.rel);
          if (outcome === 'deleted') {
            pr.folders_deleted += 1;
          } else if (outcome !== 'missing') {
            pr.delete_failed += 1;
            ok = false;
            problems = true;
          }
        }
        if (ok) toDelete.push(rec);
        else kept += 1;
      }

      const b = await this._bulkDelete(this.buildsDb, toDelete);
      result.build_records_deleted = b.deleted;
      result.build_records_kept = kept + b.conflicts + b.failed;
      if (b.conflicts > 0 || b.failed > 0) problems = true;

      for (const name of applied) {
        const info = report.perRoot[name];
        const pr = result.perRoot[name];
        for (const o of info.orphans) {
          const outcome = this._rmDir(info.root, o.rel);
          if (outcome === 'deleted') {
            pr.orphans_deleted += 1;
          } else if (outcome !== 'missing') {
            pr.delete_failed += 1;
            problems = true;
          }
        }
      }

      // Record folders left behind in roots the operator did not approve.
      for (const name of ROOT_NAMES) {
        if (applied.indexOf(name) !== -1) continue;
        for (const id of report.perRoot[name].candidates.keys()) {
          if (b.deletedIds.has(id)) result.perRoot[name].untracked_after += 1;
        }
      }
    }

    result.complete = !problems;
    return result;
  }

  /**
   * Formats a report (and an apply result) as `key=value` lines plus the final
   * LOG-RETENTION line. Prints counts, byte totals and YYYY-MM-DD dates only.
   *
   * @param {object} report  from plan()
   * @param {string} mode    "dry-run" or "apply"
   * @param {object} [result] from apply()
   * @returns {string[]}
   */
  static formatReport(report, mode, result) {
    const isApply = (mode === 'apply');
    const lines = [];
    const put = (k, v) => lines.push(k + '=' + v);
    put('mode', isApply ? 'apply' : 'dry-run');
    put('cutoff', day(report.cutoffMs));
    put('audit_expired', report.audit.length);
    put('audit_oldest', day(report.auditDates.oldest));
    put('audit_newest', day(report.auditDates.newest));
    put('build_records', report.buildRecords);
    put('build_records_expired', report.expired.length);
    put('build_records_invalid_identity', report.invalidIdentity);
    put('build_record_oldest', day(report.recordDates.oldest));
    put('build_record_newest', day(report.recordDates.newest));
    for (const name of ROOT_NAMES) {
      const info = report.perRoot[name];
      let bytes = 0;
      for (const c of info.candidates.values()) bytes += c.bytes;
      let orphanBytes = 0;
      for (const o of info.orphans) orphanBytes += o.bytes;
      put(name + '_record_folders', info.candidates.size);
      put(name + '_record_bytes', bytes);
      put(name + '_record_missing', info.missing);
      put(name + '_refused', info.refused.size);
      put(name + '_orphans', info.orphans.length);
      put(name + '_orphan_bytes', orphanBytes);
      put(name + '_orphan_oldest', day(info.orphanDates.oldest));
      put(name + '_orphan_newest', day(info.orphanDates.newest));
    }
    put('orphan_sweep', report.sweep);
    if (!isApply) {
      lines.push('LOG-RETENTION DRY-RUN OK');
      return lines;
    }
    const r = result || {};
    put('roots', (Array.isArray(r.roots) && r.roots.length > 0) ? r.roots.join(',') : 'none');
    put('audit', r.audit ? 'on' : 'off');
    put('audit_deleted', r.audit_deleted || 0);
    put('audit_conflicts', r.audit_conflicts || 0);
    put('audit_failed', r.audit_failed || 0);
    put('build_records_deleted', r.build_records_deleted || 0);
    put('build_records_kept', r.build_records_kept || 0);
    for (const name of ROOT_NAMES) {
      const pr = (r.perRoot && r.perRoot[name]) || {};
      put(name + '_folders_deleted', pr.folders_deleted || 0);
      put(name + '_orphans_deleted', pr.orphans_deleted || 0);
      put(name + '_delete_failed', pr.delete_failed || 0);
      put(name + '_untracked_after', pr.untracked_after || 0);
    }
    lines.push(r.complete ? 'LOG-RETENTION APPLY OK' : 'LOG-RETENTION APPLY INCOMPLETE');
    return lines;
  }
}

LogRetention.RetentionError = RetentionError;
LogRetention.ROOT_NAMES = ROOT_NAMES;
LogRetention.UUID_RE = UUID_RE;
LogRetention.identityOfDoc = identityOfDoc;
LogRetention.relOf = relOf;

module.exports = LogRetention;
