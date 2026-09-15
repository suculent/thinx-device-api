// Unit tests for lib/thinx/aes.js — the crypto-js compatible AES passphrase
// decryptor. Reference vectors below were produced with crypto-js 4.2.0:
//   CryptoJS.AES.encrypt(plaintext, passphrase).toString()
// which yields the OpenSSL "Salted__" format (EVP_BytesToKey/MD5, AES-256-CBC).

const expect = require('chai').expect;
const aes = require('../../lib/thinx/aes');

describe("AES (crypto-js compatible passphrase decrypt)", function () {

    const KEY = "transmit-key-0123456789abcdef";

    it("decrypts a crypto-js 'Salted__' ciphertext with the right passphrase", function () {
        const ct = "U2FsdGVkX1/yDJF8FYifMghS8an11n4kLqf3Y0O6IxQMyzZlx31AYAdENNQmHWmr";
        expect(aes.decrypt(KEY, ct)).to.equal("MySecretWiFiPassword!");
    });

    it("decrypts multi-byte UTF-8 plaintext", function () {
        const ct = "U2FsdGVkX192m380gn3PR1mjeLp20a3WdRAm9KqNPwI=";
        expect(aes.decrypt(KEY, ct)).to.equal("héslo-ěščř");
    });

    it("round-trips through its own encrypt()", function () {
        const ct = aes.encrypt(KEY, "round trip ✓");
        expect(ct).to.match(/^U2FsdGVkX1/); // base64 of "Salted__"
        expect(aes.decrypt(KEY, ct)).to.equal("round trip ✓");
    });

    it("returns undefined for a wrong passphrase instead of throwing", function () {
        const ct = "U2FsdGVkX1/yDJF8FYifMghS8an11n4kLqf3Y0O6IxQMyzZlx31AYAdENNQmHWmr";
        expect(aes.decrypt("wrong-key", ct)).to.equal(undefined);
    });

    it("returns undefined for garbage input instead of throwing", function () {
        expect(aes.decrypt(KEY, "not base64 at all!!")).to.equal(undefined);
        expect(aes.decrypt(KEY, "")).to.equal(undefined);
    });

    it("returns undefined for missing arguments", function () {
        expect(aes.decrypt(undefined, "U2FsdGVkX1")).to.equal(undefined);
        expect(aes.decrypt(KEY, null)).to.equal(undefined);
    });
});
