/*
 * Deploy-key file format detection (Phase 40, KEYENC-06; reused by Phase 41).
 *
 * A private-key file in ssh_keys is classified by its content, never by its
 * name:
 *   transit  one line `vault:v<N>:<base64>` (Transit ciphertext, KEYENC-01)
 *   legacy   a PEM-armored private key: the passphrase PKCS#8 written since
 *            2022-05-17 (ENCRYPTED PRIVATE KEY) and the unencrypted
 *            `ssh-keygen -N ""` keys from before (RSA / OPENSSH / bare)
 *   unknown  anything else, including non-strings
 *
 * The file content is untrusted input (shared, historically world-writable
 * volume). Nothing returned here ever carries file content other than the
 * trimmed Transit ciphertext, and no error message is ever returned or logged.
 */

const fs = require("fs");

const MAX_KEY_FILE_BYTES = 65536;

const TRANSIT = /^vault:v[1-9][0-9]*:[A-Za-z0-9+/]+={0,2}$/;
const PEM_PRIVATE = /^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----$/;

function detect(text) {
	if (typeof text !== "string") return "unknown";
	const t = text.trim();
	if (TRANSIT.test(t)) return "transit";
	const first = t.split(/\r?\n/, 1)[0];
	if (PEM_PRIVATE.test(first)) return "legacy";
	return "unknown";
}

// Reads at most MAX_KEY_FILE_BYTES + 1 bytes from an open descriptor.
function readBounded(fd) {
	const buf = Buffer.alloc(MAX_KEY_FILE_BYTES + 1);
	let total = 0;
	while (total < buf.length) {
		const n = fs.readSync(fd, buf, total, buf.length - total, null);
		if (n === 0) break;
		total += n;
	}
	return { buf, total };
}

// Returns {kind, text, cause}; never throws.
//   kind  transit | legacy | unknown | unreadable
//   text  the trimmed ciphertext for transit, otherwise null
//   cause null | not_regular | too_large | unknown_key_format | read_error
// openSync follows a symlink, exactly as `ssh -i` does for legacy keys; the
// fstat on the opened descriptor is what decides "regular file".
function readKey(filePath) {
	let fd = null;
	let buf = null;
	try {
		try {
			fd = fs.openSync(String(filePath), "r");
		} catch (_e) {
			return { kind: "unreadable", text: null, cause: "read_error" };
		}
		const stat = fs.fstatSync(fd);
		if (!stat.isFile()) return { kind: "unreadable", text: null, cause: "not_regular" };
		if (stat.size > MAX_KEY_FILE_BYTES) return { kind: "unreadable", text: null, cause: "too_large" };
		const read = readBounded(fd);
		buf = read.buf;
		if (read.total > MAX_KEY_FILE_BYTES) return { kind: "unreadable", text: null, cause: "too_large" };
		const text = buf.toString("utf8", 0, read.total);
		const kind = detect(text);
		if (kind === "transit") return { kind, text: text.trim(), cause: null };
		if (kind === "legacy") return { kind, text: null, cause: null };
		return { kind: "unknown", text: null, cause: "unknown_key_format" };
	} catch (_e) {
		return { kind: "unreadable", text: null, cause: "read_error" };
	} finally {
		if (buf !== null) buf.fill(0); // a legacy file may hold an unencrypted key
		if (fd !== null) {
			try { fs.closeSync(fd); } catch (_e) { /* already closed */ }
		}
	}
}

module.exports = { detect, readKey, MAX_KEY_FILE_BYTES };
