/*
 * AES passphrase encryption compatible with crypto-js / OpenSSL `enc -aes-256-cbc`.
 *
 * Format (base64):  "Salted__" (8 bytes) | salt (8 bytes) | AES-256-CBC ciphertext (PKCS#7)
 * Key derivation:   EVP_BytesToKey, MD5, 1 iteration -> 32-byte key + 16-byte IV
 *
 * This is what `CryptoJS.AES.encrypt(plaintext, passphrase)` produces, so
 * values encrypted by the console with a transmit key keep decrypting after
 * the backend dropped the crypto-js dependency in favour of node:crypto.
 */

"use strict";

const crypto = require("crypto");

const SALTED_PREFIX = Buffer.from("Salted__", "latin1");
const KEY_SIZE = 32; // AES-256
const IV_SIZE = 16;

/**
 * OpenSSL EVP_BytesToKey with MD5 and a single iteration.
 * @param {Buffer} passphrase
 * @param {Buffer|null} salt 8-byte salt, or null for the unsalted variant
 * @returns {{ key: Buffer, iv: Buffer }}
 */
function evpBytesToKey(passphrase, salt) {
	const derived = [];
	let previous = Buffer.alloc(0);
	let length = 0;
	while (length < KEY_SIZE + IV_SIZE) {
		const hash = crypto.createHash("md5");
		hash.update(previous);
		hash.update(passphrase);
		if (salt) hash.update(salt);
		previous = hash.digest();
		derived.push(previous);
		length += previous.length;
	}
	const material = Buffer.concat(derived);
	return {
		key: material.subarray(0, KEY_SIZE),
		iv: material.subarray(KEY_SIZE, KEY_SIZE + IV_SIZE)
	};
}

function isBlank(value) {
	return (typeof (value) === "undefined") || (value === null) || (value === "");
}

/**
 * Decrypts a crypto-js/OpenSSL "Salted__" base64 ciphertext.
 * Mirrors the old CryptoJS behaviour: any failure (bad key, bad padding,
 * malformed input) yields `undefined` rather than an exception.
 * @param {string} passphrase
 * @param {string} base64 ciphertext as produced by CryptoJS.AES.encrypt(...).toString()
 * @returns {string|undefined} UTF-8 plaintext
 */
function decrypt(passphrase, base64) {
	if (isBlank(passphrase) || isBlank(base64)) return undefined;
	try {
		const raw = Buffer.from(String(base64), "base64");
		let salt = null;
		let body = raw;
		if (raw.length >= 16 && raw.subarray(0, 8).equals(SALTED_PREFIX)) {
			salt = raw.subarray(8, 16);
			body = raw.subarray(16);
		}
		if (body.length === 0 || body.length % 16 !== 0) return undefined;
		const { key, iv } = evpBytesToKey(Buffer.from(String(passphrase), "utf8"), salt);
		const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
		const plain = Buffer.concat([decipher.update(body), decipher.final()]);
		return new TextDecoder("utf-8", { fatal: true }).decode(plain);
	} catch (_e) {
		return undefined;
	}
}

/**
 * Encrypts plaintext into the same "Salted__" base64 format (random salt).
 * @param {string} passphrase
 * @param {string} plaintext
 * @returns {string} base64 ciphertext
 */
function encrypt(passphrase, plaintext) {
	const salt = crypto.randomBytes(8);
	const { key, iv } = evpBytesToKey(Buffer.from(String(passphrase), "utf8"), salt);
	const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
	const body = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
	return Buffer.concat([SALTED_PREFIX, salt, body]).toString("base64");
}

module.exports = { decrypt, encrypt, evpBytesToKey };
