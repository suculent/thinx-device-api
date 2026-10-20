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
 * Legacy kinds: passphrase PKCS#8 (and Proc-Type PKCS#1) are opened with the
 * candidates in order (the GIT_KEY_PASSPHRASE secret, then the historic literal);
 * unencrypted PKCS#1 / PKCS#8 are parsed directly; an unencrypted OpenSSH key is
 * converted with `ssh-keygen -p -m PKCS8` on a 0600 copy in a 0700 directory under
 * /dev/shm (tmpfs), removed at once. A file that cannot be converted
 * (wrong_passphrase, unparseable, unsupported_type, conversion_failed) is
 * quarantined (D-02): its pair is removed through RSAKey#revokeUserKeys and its
 * owner gets one audit-log warning naming only the key's creation date (D-03).
 *
 * Modes (exactly one; none means --report):
 *   --report          Read-only (DEFAULT). Counts files by kind and Transit version
 *                     (`transit`: vN -> count, ascending N).
 *   --dry-run         Converts in memory only. Zero Transit requests, no file
 *                     changes; predicts how many files migrate or are quarantined.
 *   --migrate         WRITES. Encrypts each legacy key through Transit, verifies the
 *                     round trip and replaces the file atomically.
 *   --rewrap          WRITES (KEYMIG-03, D-12). Learns the latest key version from one
 *                     encrypt of random bytes, rewraps every Transit file below it,
 *                     checks old and new decrypt to the same bytes, replaces atomically.
 *   --canary-capture  Prints exactly one line: a ciphertext of 32 random bytes whose
 *                     plaintext is discarded (D-14). Redirect it into a 0600 file.
 *   --canary-check    Reads one ciphertext on stdin and prints exactly
 *                     `CANARY result=<ok|reason class> version=v<N>` (Slack disabled).
 *   --fetch-check OWNER URL BRANCH
 *                     Runs the production keyed fetch (Git#fetchDetailed) into a fresh
 *                     temp directory it removes, and prints exactly `FETCH_CHECK ok=<..>
 *                     key_unavailable=<reason|none> keys=<n> transit=<n> legacy=<n> other=<n>`.
 *
 * Flags:
 *   --json      Report modes: one compact JSON line, always the last line on stdout.
 *   --help, -h  Print usage and exit 0.
 *
 * A Transit failure of class unreachable, sealed, tls, not_configured or denied
 * aborts the run: nothing more is written and every untried file counts as failed.
 * Exit 0 = success, 1 = failed > 0 or aborted (or a fetch-check that failed),
 * 2 = usage, 3 = --canary-check refused (any Transit reason class).
 *
 * Output rule: owner ids, key timestamps, cause classes and counts only. Never
 * PEM, a passphrase candidate, ciphertext (outside --canary-capture's one line),
 * a Transit error text, a token or a path.
 *
 * Usage (inside the API container):
 *   node scripts/migrate-deploy-keys.js --report
 *   node scripts/migrate-deploy-keys.js --dry-run --json
 *   node scripts/migrate-deploy-keys.js --migrate --json
 *   node scripts/migrate-deploy-keys.js --rewrap --json
 *   node scripts/migrate-deploy-keys.js --canary-capture > canary   # host side: 0600 file
 *   node scripts/migrate-deploy-keys.js --canary-check < canary
 *   node scripts/migrate-deploy-keys.js --fetch-check <owner> <git url> <branch>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const exec = require('child_process');
const keyformat = require('../lib/thinx/keyformat.js');

const MODES = ['--report', '--dry-run', '--migrate', '--rewrap', '--canary-capture', '--canary-check', '--fetch-check'];

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

// File-level causes (D-02): the file itself cannot become a key, so it is quarantined.
// Any other cause (no_scratch_tmpfs, a Transit class, write_failed) leaves the file.
const QUARANTINE_CAUSES = new Set(['wrong_passphrase', 'unparseable', 'unsupported_type', 'conversion_failed']);

const SSH_KEYGEN_TIMEOUT_MS = 10000;
const AUDIT_TIMEOUT_MS = 10000;

// A legacy file's bytes -> { pem: Buffer (unencrypted PKCS#8), spki: Buffer, spkiPem, via }
// or { cause }. Never throws, never logs; the caller zeroes `data` and `pem`.
//   ENCRYPTED PRIVATE KEY or a Proc-Type 4,ENCRYPTED header: the candidates in order
//   OPENSSH PRIVATE KEY: ssh-keygen -p -m PKCS8 on a copy in the scratch tmpfs
//   anything else PEM: parsed directly (unencrypted PKCS#1 / PKCS#8)
function convertLegacy(entry, data, env) {
	if (entry.legacyKind === 'openssh') return convertOpenSSH(data, env);
	const text = data.toString('utf8');
	const encrypted = entry.legacyKind === 'encrypted_pkcs8' || /^Proc-Type:[ \t]*4,ENCRYPTED[ \t]*\r?$/m.test(text);
	if (!encrypted) {
		let keyObject;
		try {
			keyObject = crypto.createPrivateKey({ key: data, format: 'pem' });
		} catch (_e) {
			return { cause: 'unparseable' };
		}
		return exportPkcs8(keyObject, 'unencrypted');
	}
	const candidates = Array.isArray(env.candidates) ? env.candidates : [];
	// Every candidate is tried on any error: a wrong passphrase leaves valid CBC padding
	// about 1 time in 256, and OpenSSL then reports a decoder error, not BAD_DECRYPT.
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
	return { cause: (sawBadDecrypt || candidates.length === 0) ? 'wrong_passphrase' : 'unparseable' };
}

function exportPkcs8(keyObject, via) {
	if (keyObject.asymmetricKeyType !== 'rsa') return { cause: 'unsupported_type' };
	const pem = Buffer.from(keyObject.export({ type: 'pkcs8', format: 'pem' }), 'utf8');
	const publicKey = crypto.createPublicKey(keyObject);
	return {
		pem,
		spki: publicKey.export({ type: 'spki', format: 'der' }),
		spkiPem: publicKey.export({ type: 'spki', format: 'pem' }),
		via
	};
}

// The key type named in the public half of an openssh-key-v1 blob ("ssh-rsa", ...),
// or null when the blob is not one. Reads length-prefixed fields only; the private
// section is never parsed, and the decoded buffer is zeroed.
function opensshKeyType(data) {
	const lines = data.toString('utf8').split(/\r?\n/).map((l) => l.trim());
	const begin = lines.indexOf('-----BEGIN OPENSSH PRIVATE KEY-----');
	const end = lines.indexOf('-----END OPENSSH PRIVATE KEY-----');
	if (begin !== 0 || end <= begin) return null;
	const body = lines.slice(begin + 1, end).join('');
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
	const blob = Buffer.from(body, 'base64');
	try {
		const MAGIC = 'openssh-key-v1\0';
		if (blob.length < MAGIC.length || blob.toString('latin1', 0, MAGIC.length) !== MAGIC) return null;
		let off = MAGIC.length;
		const field = () => {
			if (off + 4 > blob.length) return null;
			const n = blob.readUInt32BE(off);
			if (off + 4 + n > blob.length) return null;
			const value = blob.subarray(off + 4, off + 4 + n);
			off += 4 + n;
			return value;
		};
		if (field() === null || field() === null || field() === null) return null; // cipher, kdf, kdf options
		if (off + 4 > blob.length || blob.readUInt32BE(off) !== 1) return null;    // exactly one key
		off += 4;
		const pub = field();
		if (pub === null || pub.length < 4) return null;
		const n = pub.readUInt32BE(0);
		if (4 + n > pub.length) return null;
		return pub.toString('latin1', 4, 4 + n);
	} finally {
		blob.fill(0);
	}
}

// Node cannot parse openssh-key-v1, and withAgent needs a key createPublicKey reads
// (Pitfall 1). The copy lives only in a 0700 mkdtemp directory under the scratch
// tmpfs (/dev/shm in the container), overwritten and removed in finally.
function convertOpenSSH(data, env) {
	const type = opensshKeyType(data);
	if (type === null) return { cause: 'unparseable' };
	if (type !== 'ssh-rsa') return { cause: 'unsupported_type' };
	let scratchOk = false;
	try { scratchOk = typeof env.scratchDir === 'string' && fs.statSync(env.scratchDir).isDirectory(); } catch (_e) { scratchOk = false; }
	if (!scratchOk) return { cause: 'no_scratch_tmpfs' };
	let dir = null;
	let out = null;
	try {
		try {
			dir = fs.mkdtempSync(path.join(env.scratchDir, 'keymig-'));
			fs.chmodSync(dir, 0o700);
		} catch (_e) {
			return { cause: 'no_scratch_tmpfs' };
		}
		const copy = path.join(dir, 'key');
		const fd = fs.openSync(copy, 'wx', 0o600);
		try {
			fs.writeSync(fd, data);
		} finally {
			fs.closeSync(fd);
		}
		try {
			exec.execFileSync('ssh-keygen', ['-q', '-p', '-m', 'PKCS8', '-N', '', '-P', '', '-f', copy], {
				env: { PATH: process.env.PATH || '/usr/bin:/bin' },
				stdio: 'ignore',
				timeout: SSH_KEYGEN_TIMEOUT_MS,
				shell: false
			});
		} catch (_e) {
			return { cause: 'conversion_failed' };
		}
		const read = readFileBounded(copy);
		if (!read.ok) return { cause: 'conversion_failed' };
		out = read.data;
		let keyObject;
		try {
			keyObject = crypto.createPrivateKey({ key: out, format: 'pem' });
		} catch (_e) {
			return { cause: 'conversion_failed' };
		}
		return exportPkcs8(keyObject, 'unencrypted');
	} catch (_e) {
		return { cause: 'conversion_failed' };
	} finally {
		if (out !== null) out.fill(0);
		if (dir !== null) removeScratch(dir);
	}
}

function removeScratch(dir) {
	try {
		for (const name of fs.readdirSync(dir)) {
			const p = path.join(dir, name);
			try {
				const size = fs.statSync(p).size;
				if (size > 0) fs.writeFileSync(p, Buffer.alloc(size));
			} catch (_e) { /* removed below */ }
		}
	} catch (_e) { /* removed below */ }
	try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
}

// Information only (never blocks): the .pub next to a key names a different key.
function pubMismatch(entry, converted) {
	if (!entry.pubExisted) return false;
	const read = readFileBounded(entry.pubPath);
	if (!read.ok) return false;
	try {
		const RSAKey = require('../lib/thinx/rsakey.js');
		const stored = RSAKey.fingerprint(RSAKey.toOpenSSH(read.data, 'x'));
		const own = RSAKey.fingerprint(RSAKey.toOpenSSH(converted.spkiPem, 'x'));
		return stored !== null && own !== null && stored !== own;
	} catch (_e) {
		return false;
	} finally {
		read.data.fill(0);
	}
}

// --- quarantine (D-02, D-03) ---------------------------------------------------

function noticeFor(key) {
	const d = new Date(Number(key));
	const date = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'on an unknown date';
	return 'A deploy key created ' + date + ' could not be moved to the key service and was removed. ' +
		'Create a new deploy key and add it to your repository.';
}

// Resolves true only when the audit callback answered true within the bound.
function notifyOwner(env, owner, message) {
	const timeoutMs = (typeof env.auditTimeoutMs === 'number') ? env.auditTimeoutMs : AUDIT_TIMEOUT_MS;
	return new Promise((resolve) => {
		let settled = false;
		let timer = null;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			if (timer !== null) clearTimeout(timer);
			resolve(value);
		};
		timer = setTimeout(() => finish(false), timeoutMs);
		try {
			env.audit.log(owner, message, 'warning', (result) => finish(result === true));
		} catch (_e) {
			finish(false);
		}
	});
}

// --- atomic replace ------------------------------------------------------------

function tempPathFor(entry, env) {
	return path.join(env.sshKeysDir, '.' + entry.name + '.' + crypto.randomBytes(6).toString('hex') + '.keymig.tmp');
}

function sameBytes(entry) {
	const now = readFileBounded(entry.path);
	if (!now.ok) return false;
	now.data.fill(0);
	return now.sha256 === entry.sha256;
}

// True when the target still is listed, still has the .pub state it had at scan time
// and still holds the same bytes. The content check runs last, closest to the rename.
function unchangedSinceScan(entry, env) {
	if (entry.pubExisted && env.rsakey.keyStillListed(entry.owner, entry.name, entry.pubPath) !== true) return false;
	if (fs.existsSync(entry.pubPath) !== entry.pubExisted) return false;
	return sameBytes(entry);
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
			if (!QUARANTINE_CAUSES.has(converted.cause)) {
				fail(entry, converted.cause);
				continue;
			}
			const item = { owner: entry.owner, key: entry.key, cause: converted.cause };
			if (dryRun) {
				rep.predicted.quarantine += 1;
				rep.quarantine.push(item);
				continue;
			}
			// Remove only what was judged: a file rewritten since the read is left alone.
			if (!sameBytes(entry)) {
				rep.changed_during_run += 1;
				continue;
			}
			const revoked = env.rsakey.revokeUserKeys([entry.name], entry.owner);
			if (!Array.isArray(revoked) || !revoked.includes(entry.name)) {
				rep.changed_during_run += 1;
				continue;
			}
			rep.quarantined += 1;
			rep.writes += 1;
			rep.quarantine.push(item);
			if (await notifyOwner(env, entry.owner, noticeFor(entry.key))) rep.notified += 1;
			continue;
		}
		const pem = converted.pem;
		let back = null;
		try {
			if (Object.prototype.hasOwnProperty.call(rep.decrypted_with, converted.via)) rep.decrypted_with[converted.via] += 1;
			if (pubMismatch(entry, converted)) rep.pub_mismatch += 1;
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

// --- rewrap (KEYMIG-03, D-12) ----------------------------------------------------

// The latest key version, learned from one encrypt of 32 random bytes (the AppRole may
// encrypt but not read the key, and its policy is not widened). The bytes and the
// ciphertext are discarded.
async function latestVersion(env) {
	const probe = crypto.randomBytes(32);
	try {
		const ct = await env.transit.encryptKey(probe);
		const m = (typeof ct === 'string') ? TRANSIT_VERSION.exec(ct) : null;
		if (!m) throw Object.assign(new Error('transit_server_error'), { reason: 'server_error' });
		return Number(m[1]);
	} finally {
		probe.fill(0);
	}
}

async function rewrap(env) {
	const scanned = scan(env);
	const rep = baseReport('rewrap', scanned);
	Object.assign(rep, {
		latest: null,
		versions_before: versionMap(scanned.entries),
		versions_after: {},
		rewrapped: 0,
		at_latest: 0,
		failed: 0,
		changed_during_run: 0,
		failures: [],
		writes: 0,
		transit_requests: 0,
		aborted: null
	});
	const fail = (entry, cause) => {
		rep.failed += 1;
		rep.failures.push({ owner: entry.owner, key: entry.key, cause });
	};
	const transitEntries = scanned.entries.filter((e) => e.kind === 'transit');
	if (transitEntries.length > 0) {
		rep.writes += removeLeftoverTemps(env);
		let latest = null;
		try {
			rep.transit_requests += 1;
			latest = await latestVersion(env);
			rep.latest = 'v' + latest;
		} catch (e) {
			rep.aborted = transitReason(e);
		}
		for (const entry of transitEntries) {
			if (rep.aborted !== null) {
				fail(entry, 'not_attempted');
				continue;
			}
			if (entry.version >= latest) {
				rep.at_latest += 1;
				continue;
			}
			let fresh;
			let before = null;
			let after = null;
			try {
				try {
					rep.transit_requests += 1;
					fresh = await env.transit.rewrapKey(entry.ciphertext);
					if (!fresh || fresh.version !== latest || typeof fresh.ciphertext !== 'string' ||
						fresh.ciphertext.indexOf('vault:v' + latest + ':') !== 0) {
						fail(entry, 'verify_mismatch');
						continue;
					}
					rep.transit_requests += 2;
					before = await env.transit.decryptKey(entry.ciphertext);
					after = await env.transit.decryptKey(fresh.ciphertext);
				} catch (e) {
					const reason = transitReason(e);
					fail(entry, reason);
					if (ABORT_CLASSES.has(reason)) rep.aborted = reason;
					continue;
				}
				if (!equalBuffers(before, after)) {
					fail(entry, 'verify_mismatch');
					continue;
				}
			} finally {
				if (Buffer.isBuffer(before)) before.fill(0);
				if (Buffer.isBuffer(after)) after.fill(0);
			}
			const outcome = replaceFile(entry, fresh.ciphertext, env);
			if (outcome === 'replaced') {
				rep.rewrapped += 1;
				rep.writes += 1;
			} else if (outcome === 'changed') {
				rep.changed_during_run += 1;
			} else {
				fail(entry, 'write_failed');
			}
		}
	}
	rep.versions_after = versionMap(scan(env).entries);
	return rep;
}

// --- canary (D-14) and fetch-check (D-10, D-14) ----------------------------------------

// A client that never posts to Slack: a refused canary is the expected outcome of the
// D-14 proof, not an incident. Its failure line goes to stderr, so stdout carries only
// the one canary line. Requires transit.js alone, which prints nothing on load (rsakey.js
// and git.js load globals.js, which does).
function canaryTransit() {
	const Transit = require('../lib/thinx/transit.js');
	return new Transit({ webhook: null, log: (line) => console.error(line) });
}

// One ciphertext of 32 random bytes; the plaintext is zeroed and never needed again.
async function canaryCapture(env) {
	const junk = crypto.randomBytes(32);
	try {
		return await env.transit.encryptKey(junk);
	} finally {
		junk.fill(0);
	}
}

// Resolves { line: "CANARY result=<ok|class> version=v<N>|none", code: 0 | 3 }.
async function canaryCheck(env, ciphertext) {
	const ct = (typeof ciphertext === 'string') ? ciphertext.trim() : '';
	const m = TRANSIT_VERSION.exec(ct);
	const version = m ? 'v' + m[1] : 'none';
	let result = 'ok';
	let plain = null;
	try {
		plain = await env.transit.decryptKey(ct);
	} catch (e) {
		result = transitReason(e);
	} finally {
		if (Buffer.isBuffer(plain)) plain.fill(0);
	}
	if (!/^[a-z_]+$/.test(result)) result = 'server_error';
	return { line: 'CANARY result=' + result + ' version=' + version, code: result === 'ok' ? 0 : 3 };
}

// The production keyed fetch (Git#fetchDetailed) for one owner into a fresh temp
// directory, removed in finally. Resolves { line, code }: code 0 ok, 1 not ok, 2 usage.
async function fetchCheck(env, owner, url, branch) {
	if (typeof owner !== 'string' || !/^[0-9a-f]{64}$/.test(owner) ||
		typeof url !== 'string' || url.length === 0 || typeof branch !== 'string' || branch.length === 0) {
		return { line: null, code: 2 };
	}
	const counts = { keys: 0, transit: 0, legacy: 0, other: 0 };
	let files = [];
	try { files = env.rsakey.getKeyPathsForOwner(owner); } catch (_e) { files = []; }
	for (const name of (Array.isArray(files) ? files : [])) {
		counts.keys += 1;
		const read = readFileBounded(path.join(env.sshKeysDir, name));
		let kind = 'other';
		if (read.ok) {
			kind = keyformat.detect(read.data.toString('utf8'));
			read.data.fill(0);
		}
		if (kind === 'transit') counts.transit += 1;
		else if (kind === 'legacy') counts.legacy += 1;
		else counts.other += 1;
	}
	const os = require('os');
	let dir = null;
	let result = { ok: false, keyUnavailable: null };
	try {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p41-fetch-'));
		const r = await env.git.fetchDetailed(owner, url, branch, dir);
		if (r && typeof r === 'object') result = r;
	} catch (_e) {
		result = { ok: false, keyUnavailable: null };
	} finally {
		if (dir !== null) {
			try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
		}
	}
	const ok = result.ok === true;
	const unavailable = (typeof result.keyUnavailable === 'string' && /^[a-z_]+$/.test(result.keyUnavailable)) ? result.keyUnavailable : 'none';
	return {
		line: 'FETCH_CHECK ok=' + ok + ' key_unavailable=' + unavailable + ' keys=' + counts.keys +
			' transit=' + counts.transit + ' legacy=' + counts.legacy + ' other=' + counts.other,
		code: ok ? 0 : 1
	};
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
		'Usage: node scripts/migrate-deploy-keys.js [MODE] [--json]',
		'',
		'  --report                    Read-only (default). Counts key files by kind and version.',
		'  --dry-run                   Converts legacy keys in memory; no Transit request, no write.',
		'  --migrate                   WRITES. Moves every legacy key to Transit ciphertext.',
		'  --rewrap                    WRITES. Rewraps every Transit file below the latest version.',
		'  --canary-capture            Prints one ciphertext of 32 random bytes (redirect it to a 0600 file).',
		'  --canary-check              Reads one ciphertext on stdin, prints CANARY result=<class> version=<vN>.',
		'  --fetch-check OWNER URL BRANCH',
		'                              One keyed fetch with the owner\'s keys into a temp dir, prints FETCH_CHECK.',
		'  --json                      One compact JSON line, the last line on stdout (report modes).',
		'',
		'Exit 0 = success, 1 = failed > 0 or aborted (or fetch not ok), 2 = usage, 3 = canary refused.'
	].join('\n');
}

function parseArgs(argv) {
	const args = argv.slice();
	if (args.includes('--help') || args.includes('-h')) return { help: true };
	const json = args.includes('--json');
	const rest = args.filter((a) => a !== '--json');
	const modes = rest.filter((a) => MODES.includes(a));
	if (modes.length > 1) return { error: true };
	const mode = modes[0] || '--report';
	if (mode === '--fetch-check') {
		if (rest.length !== 4 || rest[0] !== '--fetch-check') return { error: true };
		return { mode, json, owner: rest[1], url: rest[2], branch: rest[3] };
	}
	if (rest.some((a) => !MODES.includes(a))) return { error: true };
	return { mode, json };
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
	let git = null;
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
		scratchDir: '/dev/shm',
		// Lazy: the production fetch path, used by --fetch-check only.
		get git() {
			if (git === null) {
				const Git = require('../lib/thinx/git.js');
				git = new Git(null);
			}
			return git;
		}
	};
}

// stdin, at most MAX_KEY_FILE_BYTES; a longer input is cut and then fails the check.
function readStdinBounded() {
	return new Promise((resolve) => {
		const chunks = [];
		let size = 0;
		process.stdin.on('data', (c) => {
			if (size > keyformat.MAX_KEY_FILE_BYTES) return;
			size += c.length;
			chunks.push(c);
		});
		process.stdin.on('end', () => resolve(Buffer.concat(chunks).subarray(0, keyformat.MAX_KEY_FILE_BYTES + 1).toString('utf8')));
		process.stdin.on('error', () => resolve(''));
	});
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
	if (parsed.mode === '--fetch-check' && !/^[0-9a-f]{64}$/.test(parsed.owner)) {
		console.error(usage());
		return 2;
	}
	// The canary modes build no RSAKey and load no globals: stdout is exactly one line.
	if (parsed.mode === '--canary-capture') {
		let ct;
		try {
			ct = await canaryCapture({ transit: canaryTransit() });
		} catch (e) {
			console.error('[migrate-deploy-keys] canary capture failed: ' + transitReason(e));
			return 1;
		}
		console.log(ct);
		return 0;
	}
	if (parsed.mode === '--canary-check') {
		const input = await readStdinBounded();
		const r = await canaryCheck({ transit: canaryTransit() }, input.length > keyformat.MAX_KEY_FILE_BYTES ? '' : input);
		console.log(r.line);
		return r.code;
	}
	const env = cliEnv();
	if (parsed.mode === '--fetch-check') {
		const r = await fetchCheck(env, parsed.owner, parsed.url, parsed.branch);
		if (r.line !== null) console.log(r.line);
		return r.code;
	}
	let rep;
	if (parsed.mode === '--report') rep = report(env);
	else if (parsed.mode === '--rewrap') rep = await rewrap(env);
	else rep = await migrate(env, { dryRun: parsed.mode === '--dry-run' });
	emit(rep, parsed.json);
	return exitCode(rep);
}

module.exports = {
	report,
	migrate,
	rewrap,
	canaryCapture,
	canaryCheck,
	canaryTransit,
	fetchCheck,
	formatText,
	exitCode,
	LEFTOVER_TMP
};

if (require.main === module) {
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(e) => {
			console.error('[migrate-deploy-keys] aborted: ' + ((e && typeof e.code === 'string') ? e.code : 'internal_error'));
			process.exit(1);
		}
	);
}
