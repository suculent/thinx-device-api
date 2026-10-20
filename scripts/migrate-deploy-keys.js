#!/usr/bin/env node
/*
 * scripts/migrate-deploy-keys.js
 *
 * Deploy-key maintenance on app_config.ssh_keys (/mnt/data/ssh_keys) through OpenBao
 * Transit (Phase 41, KEYMIG-03, D-12, D-14).
 *
 * The legacy migration (KEYMIG-01) moved every PEM deploy key to Transit ciphertext
 * in Phase 41 and is retired (KEYMIG-02): the script holds no conversion code and no
 * passphrase. --dry-run and --migrate exit 2. A legacy file found now (restored from
 * an old backup, say) is counted by --report and never opened as a key or changed;
 * its owner regenerates the key (D-07, D-09).
 *
 * A rewritten file is one `vault:vN:` line under the same name, mode 0600. The replace
 * is atomic: an exclusive-create temp file `.<name>.<12 hex>.keymig.tmp` in the key
 * directory (fsync), renamed over the original only when the original still holds the
 * bytes it held when it was read.
 *
 * Modes (exactly one; none means --report):
 *   --report          Read-only (DEFAULT). Counts files by kind and Transit version
 *                     (`transit`: vN -> count, ascending N); legacy files by their
 *                     first-line kind.
 *   --dry-run, --migrate
 *                     Retired (KEYMIG-02). Print one line on stderr and exit 2.
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
 * aborts a rewrap: nothing more is written and every untried file counts as failed.
 * Exit 0 = success, 1 = failed > 0 or aborted (or a fetch-check that failed),
 * 2 = usage or a retired mode, 3 = --canary-check refused (any Transit reason class).
 *
 * Output rule: owner ids, key timestamps, cause classes and counts only. Never
 * PEM, ciphertext (outside --canary-capture's one line), a Transit error text, a
 * token or a path.
 *
 * Usage (inside the API container):
 *   node scripts/migrate-deploy-keys.js --report
 *   node scripts/migrate-deploy-keys.js --report --json
 *   node scripts/migrate-deploy-keys.js --rewrap --json
 *   node scripts/migrate-deploy-keys.js --canary-capture > canary   # host side: 0600 file
 *   node scripts/migrate-deploy-keys.js --canary-check < canary
 *   node scripts/migrate-deploy-keys.js --fetch-check <owner> <git url> <branch>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const keyformat = require('../lib/thinx/keyformat.js');

const MODES = ['--report', '--dry-run', '--migrate', '--rewrap', '--canary-capture', '--canary-check', '--fetch-check'];

// The legacy migration modes (KEYMIG-01) ran in Phase 41 and are retired (KEYMIG-02).
const RETIRED_MODES = new Set(['--dry-run', '--migrate']);
const RETIRED_LINE = '[migrate-deploy-keys] legacy migration retired (KEYMIG-02); use --report';

// Exactly the temp files this script writes, and nothing else (Pattern 2 step 6).
const LEFTOVER_TMP = /^\.[0-9a-f]{64}-[0-9]+\.[0-9a-f]{12}\.keymig\.tmp$/;
const KEY_NAME = /^([0-9a-f]{64})-([0-9]+)$/;
const TRANSIT_VERSION = /^vault:v([1-9][0-9]*):/;

// Service-level Transit classes (Pitfall 7): asking again with the next key cannot help.
const ABORT_CLASSES = new Set(['unreachable', 'sealed', 'tls', 'not_configured', 'denied']);

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

// The kind of a legacy file, from its first line only (report counts, KEYMIG-02).
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
	const width = Math.max(0, ...labels.map((k) => k.length), 'failures'.length);
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
		'  --rewrap                    WRITES. Rewraps every Transit file below the latest version.',
		'  --canary-capture            Prints one ciphertext of 32 random bytes (redirect it to a 0600 file).',
		'  --canary-check              Reads one ciphertext on stdin, prints CANARY result=<class> version=<vN>.',
		'  --fetch-check OWNER URL BRANCH',
		'                              One keyed fetch with the owner\'s keys into a temp dir, prints FETCH_CHECK.',
		'  --json                      One compact JSON line, the last line on stdout (report modes).',
		'',
		'  --dry-run, --migrate        Retired (KEYMIG-02): the legacy migration ran in Phase 41. Exit 2.',
		'',
		'Exit 0 = success, 1 = failed > 0 or aborted (or fetch not ok), 2 = usage or retired mode,',
		'3 = canary refused.'
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
	const rsakey = new RSAKey();
	let git = null;
	return {
		sshKeysDir: rsakey.ssh_keys,
		transit: Transit.shared(),
		rsakey,
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
	if (RETIRED_MODES.has(parsed.mode)) {
		console.error(RETIRED_LINE);
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
	const rep = (parsed.mode === '--rewrap') ? await rewrap(env) : report(env);
	emit(rep, parsed.json);
	return exitCode(rep);
}

module.exports = {
	report,
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
