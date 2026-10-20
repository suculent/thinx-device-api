#!/usr/bin/env node
/*
 * scripts/migrate-deploy-keys.js
 *
 * Moves every legacy deploy private key in app_config.ssh_keys (/mnt/data/ssh_keys)
 * to OpenBao Transit ciphertext (Phase 41, KEYMIG-01, D-04).
 *
 * A legacy file is re-encrypted as exactly the plaintext generate() sends today,
 * unencrypted PKCS#8 PEM, and written as one `vault:vN:` line under the same name,
 * mode 0600. The replace is atomic: an exclusive-create temp file
 * `.<name>.<12 hex>.keymig.tmp` in the key directory (fsync), renamed over the
 * original only when the original still holds the bytes it held when it was read.
 *
 * Modes (exactly one; none means --report):
 *   --report    Read-only (DEFAULT). Counts files by kind and Transit version.
 *   --dry-run   Converts in memory only. Zero Transit requests, no file changes;
 *               predicts how many files would migrate.
 *   --migrate   WRITES. Encrypts each legacy key through Transit, verifies the
 *               round trip and replaces the file atomically.
 *
 * Flags:
 *   --json      One compact JSON line, always the last line on stdout.
 *   --help, -h  Print usage and exit 0.
 *
 * A Transit failure of class unreachable, sealed, tls, not_configured or denied
 * aborts the run: nothing more is written and every untried legacy file counts
 * as failed. Exit 0 = success, 1 = failed > 0 or aborted, 2 = usage.
 *
 * Output rule: owner ids, key timestamps, cause classes and counts only. Never
 * PEM, a passphrase candidate, ciphertext, a Transit error text, a token or a path.
 *
 * Usage (inside the API container):
 *   node scripts/migrate-deploy-keys.js --report
 *   node scripts/migrate-deploy-keys.js --dry-run --json
 *   node scripts/migrate-deploy-keys.js --migrate --json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const keyformat = require('../lib/thinx/keyformat.js');

const MODES = ['--report', '--dry-run', '--migrate'];
const FLAGS = ['--json', '--help', '-h'];

// Exactly the temp files this script writes, and nothing else (Pattern 2 step 6).
const LEFTOVER_TMP = /^\.[0-9a-f]{64}-[0-9]+\.[0-9a-f]{12}\.keymig\.tmp$/;
const KEY_NAME = /^([0-9a-f]{64})-([0-9]+)$/;
const TRANSIT_VERSION = /^vault:v([1-9][0-9]*):/;

// Service-level Transit classes (Pitfall 7): asking again with the next key cannot help.
const ABORT_CLASSES = new Set(['unreachable', 'sealed', 'tls', 'not_configured', 'denied']);

// generate() used this literal from 2023-01-14 to 2026-09-18 (RESEARCH Pattern 1).
const HISTORIC_LITERAL = 'thinx';

const OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0);

const byteOrder = (a, b) => Buffer.compare(Buffer.from(String(a)), Buffer.from(String(b)));

// --- bounded read ---------------------------------------------------------------

// Mirrors keyformat.readKey (O_NONBLOCK, fstat isFile, the 64 KiB cap), but hands the
// caller a copy of the bytes, which the caller zeroes. Never throws.
//   { ok: true, data: Buffer, sha256 } | { ok: false, cause }
function readFileBounded(filePath) {
	let fd = null;
	let buf = null;
	try {
		try {
			fd = fs.openSync(String(filePath), OPEN_FLAGS);
		} catch (e) {
			return { ok: false, cause: (e && e.code === 'ENOENT') ? 'missing' : 'read_error' };
		}
		const stat = fs.fstatSync(fd);
		if (!stat.isFile()) return { ok: false, cause: 'not_regular' };
		if (stat.size > keyformat.MAX_KEY_FILE_BYTES) return { ok: false, cause: 'too_large' };
		buf = Buffer.alloc(keyformat.MAX_KEY_FILE_BYTES + 1);
		let total = 0;
		while (total < buf.length) {
			const n = fs.readSync(fd, buf, total, buf.length - total, null);
			if (n === 0) break;
			total += n;
		}
		if (total > keyformat.MAX_KEY_FILE_BYTES) return { ok: false, cause: 'too_large' };
		const data = Buffer.alloc(total);
		buf.copy(data, 0, 0, total);
		const sha256 = crypto.createHash('sha256').update(data).digest('hex');
		return { ok: true, data, sha256 };
	} catch (_e) {
		return { ok: false, cause: 'read_error' };
	} finally {
		if (buf !== null) buf.fill(0);
		if (fd !== null) {
			try { fs.closeSync(fd); } catch (_e) { /* already closed */ }
		}
	}
}

function legacyKind(firstLine) {
	if (/^-----BEGIN ENCRYPTED PRIVATE KEY-----$/.test(firstLine)) return 'encrypted_pkcs8';
	if (/^-----BEGIN RSA PRIVATE KEY-----$/.test(firstLine)) return 'pkcs1';
	if (/^-----BEGIN OPENSSH PRIVATE KEY-----$/.test(firstLine)) return 'openssh';
	return 'other';
}

// --- scan ----------------------------------------------------------------------

// One entry per private file, in byte order of the file name (owner, then name: every
// name starts with its 64-hex owner, so this is byte order of the name overall).
function scan(env) {
	const dir = env.sshKeysDir;
	let names = [];
	try { names = fs.readdirSync(dir); } catch (_e) { names = []; }
	const strayAskfiles = names.filter((n) => n.endsWith('.sh')).length;
	const leftoverTmp = names.filter((n) => LEFTOVER_TMP.test(n)).length;

	const entries = [];
	const owners = env.rsakey.listOwnersOnDisk().slice().sort(byteOrder);
	for (const owner of owners) {
		let files = [];
		try { files = env.rsakey.getKeyPathsForOwner(owner); } catch (_e) { files = []; }
		if (!Array.isArray(files)) files = [];
		for (const name of files.slice().sort(byteOrder)) {
			const m = KEY_NAME.exec(name);
			const filePath = path.join(dir, name);
			const pubPath = filePath + '.pub';
			const entry = {
				owner,
				name,
				key: m ? m[2] : name.slice(owner.length + 1),
				path: filePath,
				pubPath,
				pubExisted: fs.existsSync(pubPath),
				kind: 'unknown',
				legacyKind: null,
				version: null,
				sha256: null,
				cause: null
			};
			const read = readFileBounded(filePath);
			if (!read.ok) {
				entry.kind = 'unreadable';
				entry.cause = read.cause;
			} else {
				try {
					const text = read.data.toString('utf8');
					entry.sha256 = read.sha256;
					entry.kind = keyformat.detect(text);
					if (entry.kind === 'transit') {
						entry.version = Number(TRANSIT_VERSION.exec(text.trim())[1]);
						entry.ciphertext = text.trim();
					} else if (entry.kind === 'legacy') {
						entry.legacyKind = legacyKind(text.trim().split(/\r?\n/, 1)[0]);
					}
				} finally {
					read.data.fill(0);
				}
			}
			entries.push(entry);
		}
	}
	return { entries, strayAskfiles, leftoverTmp };
}

// vN -> count, keys in ascending N.
function versionMap(entries) {
	const counts = new Map();
	for (const e of entries) {
		if (e.kind !== 'transit') continue;
		counts.set(e.version, (counts.get(e.version) || 0) + 1);
	}
	const out = {};
	for (const v of Array.from(counts.keys()).sort((a, b) => a - b)) out['v' + v] = counts.get(v);
	return out;
}

function baseReport(mode, scanned) {
	const entries = scanned.entries;
	const legacy = { encrypted_pkcs8: 0, pkcs1: 0, openssh: 0, other: 0 };
	let unknown = 0;
	let unreadable = 0;
	for (const e of entries) {
		if (e.kind === 'legacy') legacy[e.legacyKind] += 1;
		else if (e.kind === 'unknown') unknown += 1;
		else if (e.kind === 'unreadable') unreadable += 1;
	}
	return {
		mode,
		private_files: entries.length,
		transit_total: entries.filter((e) => e.kind === 'transit').length,
		transit: versionMap(entries),
		legacy_total: entries.filter((e) => e.kind === 'legacy').length,
		legacy,
		unknown,
		unreadable,
		stray_askfiles: scanned.strayAskfiles,
		leftover_tmp: scanned.leftoverTmp
	};
}

// --- conversion ----------------------------------------------------------------

// A legacy file's bytes -> { pem: Buffer (unencrypted PKCS#8), spki: Buffer, via } or
// { cause }. Never throws, never logs; the caller zeroes `data` and `pem`.
function convertLegacy(entry, data, env) {
	if (entry.legacyKind !== 'encrypted_pkcs8') return { cause: 'unsupported_kind' };
	const candidates = Array.isArray(env.candidates) ? env.candidates : [];
	let sawBadDecrypt = false;
	for (const candidate of candidates) {
		let keyObject;
		try {
			keyObject = crypto.createPrivateKey({ key: data, format: 'pem', passphrase: String(candidate.value) });
		} catch (e) {
			if (e && e.code === 'ERR_OSSL_BAD_DECRYPT') sawBadDecrypt = true;
			continue;
		}
		return exportPkcs8(keyObject, candidate.label);
	}
	return { cause: sawBadDecrypt || candidates.length === 0 ? 'wrong_passphrase' : 'unparseable' };
}

function exportPkcs8(keyObject, via) {
	if (keyObject.asymmetricKeyType !== 'rsa') return { cause: 'unsupported_type' };
	const pem = Buffer.from(keyObject.export({ type: 'pkcs8', format: 'pem' }), 'utf8');
	const spki = crypto.createPublicKey(keyObject).export({ type: 'spki', format: 'der' });
	return { pem, spki, via };
}

// --- atomic replace ------------------------------------------------------------

function tempPathFor(entry, env) {
	return path.join(env.sshKeysDir, '.' + entry.name + '.' + crypto.randomBytes(6).toString('hex') + '.keymig.tmp');
}

// True when the target still has the bytes and the .pub state it had at scan time.
function unchangedSinceScan(entry, env) {
	const now = readFileBounded(entry.path);
	if (!now.ok) return false;
	now.data.fill(0);
	if (now.sha256 !== entry.sha256) return false;
	const pubNow = fs.existsSync(entry.pubPath);
	if (pubNow !== entry.pubExisted) return false;
	if (entry.pubExisted) return env.rsakey.keyStillListed(entry.owner, entry.name, entry.pubPath) === true;
	return true;
}

// Writes `line` over entry.path. Resolves 'replaced' | 'changed' | 'write_failed'.
function replaceFile(entry, line, env) {
	const tmp = tempPathFor(entry, env);
	let fd = null;
	let created = false;
	try {
		fd = fs.openSync(tmp, 'wx', 0o600);
		created = true;
		fs.writeSync(fd, line + '\n');
		fs.fsyncSync(fd);
		fs.closeSync(fd);
		fd = null;
		fs.chmodSync(tmp, 0o600); // the umask may have narrowed the create mode
		if (!unchangedSinceScan(entry, env)) {
			fs.unlinkSync(tmp);
			created = false;
			return 'changed';
		}
		fs.renameSync(tmp, entry.path);
		created = false;
		// A revoke that landed during the rename: never resurrect a private key whose
		// .pub is gone (Pitfall 6).
		if (entry.pubExisted && !fs.existsSync(entry.pubPath)) {
			try { fs.unlinkSync(entry.path); } catch (_e) { /* revoked meanwhile */ }
			return 'changed';
		}
		return 'replaced';
	} catch (_e) {
		return 'write_failed';
	} finally {
		if (fd !== null) {
			try { fs.closeSync(fd); } catch (_e) { /* closed */ }
		}
		if (created) {
			try { fs.unlinkSync(tmp); } catch (_e) { /* never created */ }
		}
	}
}

function removeLeftoverTemps(env) {
	let removed = 0;
	let names = [];
	try { names = fs.readdirSync(env.sshKeysDir); } catch (_e) { return 0; }
	for (const name of names) {
		if (!LEFTOVER_TMP.test(name)) continue;
		try {
			fs.unlinkSync(path.join(env.sshKeysDir, name));
			removed += 1;
		} catch (_e) { /* gone */ }
	}
	return removed;
}

function transitReason(e) {
	return (e && typeof e.reason === 'string') ? e.reason : 'server_error';
}

function equalBuffers(a, b) {
	return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- modes ---------------------------------------------------------------------

function report(env) {
	return baseReport('report', scan(env));
}

async function migrate(env, opts) {
	const dryRun = !!(opts && opts.dryRun);
	const scanned = scan(env);
	const rep = baseReport(dryRun ? 'dry-run' : 'migrate', scanned);
	Object.assign(rep, {
		decrypted_with: { secret: 0, historic_literal: 0, unencrypted: 0 },
		migrated: 0,
		already_transit: scanned.entries.filter((e) => e.kind === 'transit').length,
		quarantined: 0,
		notified: 0,
		failed: 0,
		changed_during_run: 0,
		pub_mismatch: 0,
		quarantine: [],
		failures: [],
		writes: 0,
		transit_requests: 0,
		aborted: null
	});
	if (dryRun) rep.predicted = { migrate: 0, quarantine: 0 };
	if (!dryRun) rep.writes += removeLeftoverTemps(env);

	const fail = (entry, cause) => {
		rep.failed += 1;
		rep.failures.push({ owner: entry.owner, key: entry.key, cause });
	};

	for (const entry of scanned.entries) {
		if (entry.kind !== 'legacy') continue;
		if (rep.aborted !== null) {
			fail(entry, 'not_attempted');
			continue;
		}
		const read = readFileBounded(entry.path);
		if (!read.ok || read.sha256 !== entry.sha256) {
			if (read.ok) read.data.fill(0);
			rep.changed_during_run += 1;
			continue;
		}
		let converted;
		try {
			converted = convertLegacy(entry, read.data, env);
		} finally {
			read.data.fill(0);
		}
		if (!converted.pem) {
			fail(entry, converted.cause);
			continue;
		}
		const pem = converted.pem;
		let back = null;
		try {
			if (Object.prototype.hasOwnProperty.call(rep.decrypted_with, converted.via)) rep.decrypted_with[converted.via] += 1;
			if (dryRun) {
				rep.predicted.migrate += 1;
				continue;
			}
			let ciphertext;
			try {
				rep.transit_requests += 1;
				ciphertext = await env.transit.encryptKey(pem);
				rep.transit_requests += 1;
				back = await env.transit.decryptKey(ciphertext);
			} catch (e) {
				const reason = transitReason(e);
				fail(entry, reason);
				if (ABORT_CLASSES.has(reason)) rep.aborted = reason;
				continue;
			}
			let spkiBack = null;
			try { spkiBack = crypto.createPublicKey(back).export({ type: 'spki', format: 'der' }); } catch (_e) { spkiBack = null; }
			if (!equalBuffers(pem, back) || !equalBuffers(converted.spki, spkiBack)) {
				fail(entry, 'verify_mismatch');
				continue;
			}
			if (typeof ciphertext !== 'string' || !TRANSIT_VERSION.test(ciphertext)) {
				fail(entry, 'verify_mismatch');
				continue;
			}
			const outcome = replaceFile(entry, ciphertext, env);
			if (outcome === 'replaced') {
				rep.migrated += 1;
				rep.writes += 1;
			} else if (outcome === 'changed') {
				rep.changed_during_run += 1;
			} else {
				fail(entry, 'write_failed');
			}
		} finally {
			pem.fill(0);
			if (Buffer.isBuffer(back)) back.fill(0);
		}
	}
	return rep;
}

// --- output --------------------------------------------------------------------

function exitCode(rep) {
	if (rep && (rep.aborted || (typeof rep.failed === 'number' && rep.failed > 0))) return 1;
	return 0;
}

function formatValue(v) {
	if (v === null || typeof v !== 'object') return String(v);
	return JSON.stringify(v);
}

// Aligned `[migrate-deploy-keys] <label> : <value>` lines. List entries get one line
// each: owner, key timestamp and cause class only.
function formatText(rep) {
	const labels = Object.keys(rep).filter((k) => !Array.isArray(rep[k]));
	const width = Math.max(0, ...labels.map((k) => k.length), 'quarantine'.length, 'failures'.length);
	const lines = [];
	for (const k of Object.keys(rep)) {
		if (Array.isArray(rep[k])) {
			for (const item of rep[k]) {
				lines.push('[migrate-deploy-keys] ' + k.padEnd(width) + ' : ' + item.owner + ' ' + item.key + ' ' + item.cause);
			}
			continue;
		}
		lines.push('[migrate-deploy-keys] ' + k.padEnd(width) + ' : ' + formatValue(rep[k]));
	}
	return lines.join('\n');
}

// --- CLI -----------------------------------------------------------------------

function usage() {
	return [
		'Usage: node scripts/migrate-deploy-keys.js [--report|--dry-run|--migrate] [--json]',
		'',
		'  --report     Read-only (default). Counts key files by kind and version.',
		'  --dry-run    Converts legacy keys in memory; no Transit request, no write.',
		'  --migrate    WRITES. Moves every legacy key to Transit ciphertext.',
		'  --json       One compact JSON line, the last line on stdout.',
		'',
		'Exit 0 = success, 1 = failed > 0 or aborted, 2 = usage.'
	].join('\n');
}

function parseArgs(argv) {
	const args = argv.slice();
	if (args.includes('--help') || args.includes('-h')) return { help: true };
	const unknown = args.filter((a) => !MODES.includes(a) && !FLAGS.includes(a));
	const modes = args.filter((a) => MODES.includes(a));
	if (unknown.length > 0 || modes.length > 1) return { error: true };
	return { mode: modes[0] || '--report', json: args.includes('--json') };
}

function cliEnv() {
	const RSAKey = require('../lib/thinx/rsakey.js');
	const Transit = require('../lib/thinx/transit.js');
	const { readSecret } = require('../lib/thinx/secrets.js');
	const rsakey = new RSAKey();
	const candidates = [];
	const secret = readSecret('GIT_KEY_PASSPHRASE');
	if (typeof secret === 'string' && secret.length > 0) candidates.push({ label: 'secret', value: secret });
	candidates.push({ label: 'historic_literal', value: HISTORIC_LITERAL });
	let audit = null;
	return {
		sshKeysDir: rsakey.ssh_keys,
		transit: Transit.shared(),
		rsakey,
		// Lazy: Audit opens CouchDB, which only a quarantine needs.
		audit: {
			log: (...a) => {
				if (audit === null) {
					const Audit = require('../lib/thinx/audit.js');
					audit = new Audit();
				}
				return audit.log(...a);
			}
		},
		candidates,
		scratchDir: '/dev/shm'
	};
}

function emit(rep, json) {
	if (json) console.log(JSON.stringify(rep));
	else console.log(formatText(rep));
}

async function main(argv) {
	const parsed = parseArgs(argv);
	if (parsed.help) {
		console.log(usage());
		return 0;
	}
	if (parsed.error) {
		console.error(usage());
		return 2;
	}
	const env = cliEnv();
	let rep;
	if (parsed.mode === '--report') rep = report(env);
	else rep = await migrate(env, { dryRun: parsed.mode === '--dry-run' });
	emit(rep, parsed.json);
	return exitCode(rep);
}

module.exports = { report, migrate, formatText, exitCode, LEFTOVER_TMP };

if (require.main === module) {
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(e) => {
			console.error('[migrate-deploy-keys] aborted: ' + ((e && typeof e.code === 'string') ? e.code : 'internal_error'));
			process.exit(1);
		}
	);
}
