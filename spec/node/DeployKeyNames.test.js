const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const url = require('node:url');
// 34-REVIEW WR-05 / Phase 45: in development Globals.app_config().ssh_keys resolves to
// $HOME/.ssh, the developer's real key directory, and lib/router.rsakey.js builds its RSAKey
// when it is required. HOME points at a throwaway directory before any lib/ module loads, so
// no test here can list, write or delete a real key.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'thinx-home-'));
fs.mkdirSync(path.join(TEST_HOME, '.ssh'), { mode: 0o700 });
process.env.HOME = TEST_HOME;
test.after(() => fs.rmSync(TEST_HOME, { recursive: true, force: true }));
process.env.ENVIRONMENT = 'development';
const RSAKey = require('../../lib/thinx/rsakey');
const Util = require('../../lib/thinx/util');
const OWNER = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thinx-keys-'));
  const key = Object.create(RSAKey.prototype);
  key.ssh_keys = dir;
  return {dir, key};
}
test('tests run against a temporary HOME, never the real ~/.ssh (34-REVIEW WR-05)', () => {
  assert.equal(new RSAKey().ssh_keys, path.join(TEST_HOME, '.ssh'));
});
function writePair(dir, owner, time, name) {
  const filename = owner + '-' + time;
  fs.writeFileSync(path.join(dir, filename), 'synthetic-private-fixture');
  fs.writeFileSync(path.join(dir, filename + '.pub'), 'ssh-rsa synthetic-public-fixture ' + name);
  return filename;
}
test('names persist in public comments; old keys retain their dates; newest first', () => {
  const {dir,key}=fixture();
  try {
    writePair(dir,OWNER,1000,'thinx-1000');
    writePair(dir,OWNER,2000,'Firmware Repository');
    writePair(dir,OTHER,3000,'Other owner');
    const listed=key.exportKeysForList(key.getKeyPathsForOwner(OWNER),OWNER);
    assert.equal(listed.length,2);
    assert.equal(listed[0].name,'Firmware Repository');
    assert.equal(new Date(listed[0].date).getTime(),2000);
    assert.equal(listed[1].name,new Date(1000).toString());
    assert.equal(listed[0].pubkey,'ssh-rsa synthetic-public-fixture Firmware Repository');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('generation receives a trimmed display name and returns the same name and date', async () => {
  const {dir,key}=fixture();
  try {
    key.newUniqueIdentifier=()=>12345;
    key.generate=(owner,date,cb,name)=>{assert.equal(owner,OWNER); assert.equal(name,'Firmware'); cb(null,'ssh-rsa fixture '+name);};
    const result=await new Promise(resolve=>key.create(OWNER,(success,response)=>resolve({success,response}),'  Firmware  '));
    assert.equal(result.success,true); assert.equal(result.response.name,'Firmware');
    assert.equal(result.response.created,12345);
    assert.equal(result.response.date,new Date(12345).toString(),'date has the same format as list()');
    assert.equal(result.response.pubkey,'ssh-rsa fixture Firmware');
    assert.equal(result.response.filename,OWNER+'-12345','filename is the bare list/revoke name, not a server path (38 WR-06)');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('legacy create(owner, callback) remains valid; invalid names never generate', () => {
  const {dir,key}=fixture();
  try {
    let generated=0;
    key.generate=(owner,date,cb,name)=>{generated++;assert.equal(name,undefined);cb(null,'ssh-rsa fixture thinx-'+date);};
    key.create(OWNER,success=>assert.equal(success,true));
    // 38 IN-06: the asserts below sit inside callbacks, so count the callbacks too; a
    // create that never calls back would otherwise pass silently.
    const invalidNames=['', '  ', 'key\nother', 'key\u0000', 'x'.repeat(121), {}, [], 'a\tb', 'a\rb', 'a\u001fb', 'a\u007fb'];
    let refused=0;
    for (const name of invalidNames) {
      key.create(OWNER,(success,response)=>{refused++;assert.equal(success,false);assert.equal(response,'invalid_key_name');},name);
    }
    assert.equal(refused,invalidNames.length,'exactly one callback per invalid name');
    assert.equal(generated,1);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('hasControlChars matches the old key-name character class on every UTF-16 code unit (Codacy no-control-regex)', () => {
  // The pre-change character class from lib/thinx/rsakey.js create(), kept here as the oracle.
  const oracle = /[\r\n\x00-\x1f\x7f]/;
  for (let c = 0; c <= 0xFFFF; c++) {
    const s = String.fromCharCode(c);
    assert.equal(Util.hasControlChars(s), oracle.test(s), 'code unit 0x' + c.toString(16).padStart(4, '0'));
  }
  for (const s of ['\t', '\r', '\n', '\u0000', '\u001f', '\u007f']) assert.equal(Util.hasControlChars(s), true);
  for (const s of [' ', '~', '\u0080', '\u00a0', '\u00ed', '\ud83d', '\udd11']) assert.equal(Util.hasControlChars(s), false);
  assert.equal(Util.hasControlChars('Firmware Repository'), false);
  assert.equal(Util.hasControlChars('a\tb'), true);
  assert.equal(Util.hasControlChars('end\x7f'), true);
  assert.equal(Util.hasControlChars('Klíč ✓ 🔑'), false);
  assert.equal(Util.hasControlChars(''), false);
  for (const v of [{}, [], undefined, 42]) assert.equal(Util.hasControlChars(v), false);
});
test('names at the 120-char limit and non-ASCII names are accepted', async () => {
  const {dir,key}=fixture();
  try {
    key.newUniqueIdentifier=()=>12345;
    key.generate=(owner,date,cb,name)=>cb(null,'ssh-rsa fixture '+name);
    for (const name of ['x'.repeat(120), 'Klíč ✓ 🔑']) {
      const result=await new Promise(resolve=>key.create(OWNER,(success,response)=>resolve({success,response}),name));
      assert.equal(result.success,true,'accepted: '+name.slice(0,16));
      assert.equal(result.response.name,name);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('deletion follows the selected filename, not its position or another owner', () => {
  const {dir,key}=fixture();
  try {
    const first=writePair(dir,OWNER,1000,'First');
    const selected=writePair(dir,OWNER,2000,'Second');
    const other=writePair(dir,OTHER,3000,'Other');
    assert.deepEqual(key.revokeUserKeys([selected,other,'../outside'],OWNER),[selected]);
    assert.equal(fs.existsSync(path.join(dir,first)),true);
    assert.equal(fs.existsSync(path.join(dir,selected)),false);
    assert.equal(fs.existsSync(path.join(dir,selected+'.pub')),false);
    assert.equal(fs.existsSync(path.join(dir,other)),true);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('two creates in the same millisecond get distinct names and neither key is overwritten (34-REVIEW IN-08)', async () => {
  const {dir,key}=fixture();
  const saved=process.env.GIT_KEY_PASSPHRASE;
  process.env.GIT_KEY_PASSPHRASE='synthetic-test-passphrase';
  require('../../lib/thinx/secrets')._resetCacheForTests();
  try {
    key.newUniqueIdentifier=()=>12345; // force the clash the wall clock only produces sometimes
    const create=()=>new Promise(resolve=>key.create(OWNER,(success,response)=>resolve({success,response})));
    const [a,b]=await Promise.all([create(),create()]);
    assert.equal(a.success,true); assert.equal(b.success,true);
    const names=[a,b].map(r=>path.basename(r.response.filename,'.pub'));
    assert.notEqual(names[0],names[1]);
    for (const name of names) assert.match(name,/^a{64}-\d+$/);
    assert.deepEqual(key.getKeyPathsForOwner(OWNER).sort(),names.slice().sort());
    for (const r of [a,b]) {
      const base=path.basename(r.response.filename,'.pub');
      assert.equal(fs.readFileSync(path.join(dir,base+'.pub'),'utf8'),r.response.pubkey);
      assert.match(fs.readFileSync(path.join(dir,base),'utf8'),/BEGIN ENCRYPTED PRIVATE KEY/);
      assert.equal(r.response.created,Number(base.split('-')[1]));
    }
    assert.notEqual(a.response.pubkey,b.response.pubkey);
  } finally {
    if (typeof saved==='undefined') delete process.env.GIT_KEY_PASSPHRASE; else process.env.GIT_KEY_PASSPHRASE=saved;
    require('../../lib/thinx/secrets')._resetCacheForTests();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('a failed generation releases the claimed name and leaves no file behind', async () => {
  const {dir,key}=fixture();
  try {
    key.newUniqueIdentifier=()=>777;
    key.generate=(owner,date,cb)=>cb(new Error('synthetic failure'));
    const ok=await new Promise(resolve=>key.create(OWNER,success=>resolve(success)));
    assert.equal(ok,false);
    assert.deepEqual(fs.readdirSync(dir),[]);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('keys created within the same second still list newest first (38 WR-01)', () => {
  const {dir,key}=fixture();
  try {
    writePair(dir,OWNER,1700000000000,'older');
    writePair(dir,OWNER,1700000000001,'newer');
    writePair(dir,OWNER,1700000000900,'newest');
    const listed=key.exportKeysForList(key.getKeyPathsForOwner(OWNER),OWNER);
    assert.deepEqual(listed.map(k=>k.name),['newest','newer','older']);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('a filesystem error after key generation fails the create instead of crashing, and leaves no key (38 WR-02)', async () => {
  const {dir,key}=fixture();
  const prevPass=process.env.GIT_KEY_PASSPHRASE;
  const fsx=require('fs-extra'); // rsakey.js writes through fs-extra
  const realChmod=fsx.chmodSync;
  process.env.GIT_KEY_PASSPHRASE='synthetic-test-passphrase';
  try {
    key.newUniqueIdentifier=()=>4242;
    const privatePath=path.join(dir,OWNER+'-4242');
    fsx.chmodSync=(p,mode)=>{ if (p===privatePath) { const e=new Error('synthetic EIO'); e.code='EIO'; throw e; } return realChmod(p,mode); };
    const ok=await new Promise(resolve=>key.create(OWNER,success=>resolve(success),'Broken disk'));
    assert.equal(ok,false,'create reports failure through the callback');
    assert.deepEqual(fs.readdirSync(dir),[],'no private key and no claimed .pub are left behind');
  } finally {
    fsx.chmodSync=realChmod;
    if (prevPass===undefined) delete process.env.GIT_KEY_PASSPHRASE; else process.env.GIT_KEY_PASSPHRASE=prevPass;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

async function withPassphrase(fn) {
  const saved=process.env.GIT_KEY_PASSPHRASE;
  process.env.GIT_KEY_PASSPHRASE='synthetic-test-passphrase';
  require('../../lib/thinx/secrets')._resetCacheForTests();
  try { return await fn(); } finally {
    if (typeof saved==='undefined') delete process.env.GIT_KEY_PASSPHRASE; else process.env.GIT_KEY_PASSPHRASE=saved;
    require('../../lib/thinx/secrets')._resetCacheForTests();
  }
}
test('an unnamed create returns the list() shape: date string name, bare filename (38 WR-06)', async () => {
  const {dir,key}=fixture();
  try {
    key.newUniqueIdentifier=()=>9000;
    key.generate=(owner,date,cb)=>cb(null,'ssh-rsa fixture thinx-'+date);
    const r=await new Promise(resolve=>key.create(OWNER,(success,response)=>resolve(response)));
    assert.equal(typeof r.name,'string'); assert.equal(r.name,new Date(9000).toString());
    assert.ok(!r.filename.includes('/'),'no server path');
    assert.ok(!r.filename.endsWith('.pub'));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('a failed private-key write leaves nothing listed and never touches an existing pair (38 WR-03)', async () => {
  const {dir,key}=fixture();
  const fsx=require('fs-extra');
  const realWrite=fsx.writeFileSync;
  try {
    await withPassphrase(async () => {
      key.newUniqueIdentifier=()=>5100;
      const privatePath=path.join(dir,OWNER+'-5100');
      // ENOSPC after open: the private file exists but is truncated.
      fsx.writeFileSync=(p,data,opts)=>{ if (p===privatePath) { realWrite(p,'trunc',opts); const e=new Error('synthetic ENOSPC'); e.code='ENOSPC'; throw e; } return realWrite(p,data,opts); };
      const ok=await new Promise(resolve=>key.create(OWNER,success=>resolve(success),'Full disk'));
      fsx.writeFileSync=realWrite;
      assert.equal(ok,false);
      assert.deepEqual(fs.readdirSync(dir),[],'truncated private key and claim are both removed');
      assert.deepEqual(key.exportKeysForList(key.getKeyPathsForOwner(OWNER),OWNER),[]);
    });
    // EEXIST: a private key already sits under the generated name; it and its .pub stay as they were.
    await withPassphrase(async () => {
      const existing=writePair(dir,OWNER,5200,'Existing key');
      fs.unlinkSync(path.join(dir,existing+'.pub')); // claim succeeds only when the .pub is absent
      key.newUniqueIdentifier=()=>5200;
      key.reserveIdentifier=function(owner){ fs.closeSync(fs.openSync(this.newNameWithOwner(owner,5200)+'.pub','wx')); return 5200; };
      const ok=await new Promise(resolve=>key.create(OWNER,success=>resolve(success)));
      assert.equal(ok,false);
      assert.equal(fs.readFileSync(path.join(dir,existing),'utf8'),'synthetic-private-fixture','existing private key untouched');
      assert.equal(fs.readFileSync(path.join(dir,existing+'.pub'),'utf8'),'','claimed .pub was never overwritten with a foreign public key');
    });
  } finally { fsx.writeFileSync=realWrite; fs.rmSync(dir,{recursive:true,force:true}); }
});
test('a private key whose .pub is still empty is not listed (38 WR-03)', () => {
  const {dir,key}=fixture();
  try {
    writePair(dir,OWNER,6000,'Done');
    fs.writeFileSync(path.join(dir,OWNER+'-6001'),'synthetic-private-fixture');
    fs.writeFileSync(path.join(dir,OWNER+'-6001.pub'),'');
    assert.deepEqual(key.exportKeysForList(key.getKeyPathsForOwner(OWNER),OWNER).map(k=>k.name),['Done']);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('account deletion removes lone .pub claims; stale empty claims are swept, fresh ones kept (38 WR-04)', () => {
  const {dir,key}=fixture();
  try {
    writePair(dir,OWNER,7000,'Key');
    fs.writeFileSync(path.join(dir,OWNER+'-7001.pub'),''); // stranded claim
    writePair(dir,OTHER,7002,'Other owner');
    key.revokeAllForOwner(OWNER);
    assert.deepEqual(fs.readdirSync(dir).filter(f=>f.startsWith(OWNER)),[],'no file of the deleted owner remains');
    assert.equal(fs.readdirSync(dir).filter(f=>f.startsWith(OTHER)).length,2,'other owner untouched');
    const stale=path.join(dir,OWNER+'-8000.pub'), fresh=path.join(dir,OWNER+'-8001.pub');
    fs.writeFileSync(stale,''); fs.writeFileSync(fresh,'');
    const old=new Date(Date.now()-60*60*1000); fs.utimesSync(stale,old,old);
    assert.equal(key.sweepStaleClaims(OWNER),1);
    assert.equal(fs.existsSync(stale),false); assert.equal(fs.existsSync(fresh),true,'an in-progress claim is kept');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('revoke ignores a non-array filenames value instead of throwing (38 WR-05)', () => {
  const {dir,key}=fixture();
  try {
    writePair(dir,OWNER,9100,'Key');
    for (const bad of [null, 5, {}, true, 'abc']) assert.deepEqual(key.revokeUserKeys(bad,OWNER),[]);
    assert.equal(fs.readdirSync(dir).length,2,'nothing deleted');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

// ---------------------------------------------------------------------------
// Phase 45: deploy-key rename (KEY-04), one name validator (FIX-04 IN-01/IN-02).
// ---------------------------------------------------------------------------

// GitHub's RSA host key: the `ssh-rsa` entry of `ssh_keys` in https://api.github.com/meta
// (unauthenticated GET, 2026-10-13). A real, parseable public key with a published
// fingerprint (`ssh_key_fingerprints.SHA256_RSA`); no network at test time.
const GITHUB_RSA = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=';
// Control, separator and direction characters are built from their code, so this file
// carries no escape sequence for them (Codacy no-control-regex, quick 261012-r9z).
const ch = (code) => String.fromCharCode(code);
const tokens = (text) => String(text).trim().split(/\s+/);

function writeKey(dir, owner, time, pubText, mode) {
  const filename = owner + '-' + time;
  fs.writeFileSync(path.join(dir, filename), 'synthetic-private-fixture', { mode: 0o600 });
  fs.writeFileSync(path.join(dir, filename + '.pub'), pubText);
  fs.chmodSync(path.join(dir, filename + '.pub'), typeof mode === 'number' ? mode : 0o644);
  return filename;
}
// Every file in the directory, by name, with its bytes (a leftover temp file shows up too).
function snapshot(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir).sort()) out[f] = fs.readFileSync(path.join(dir, f)).toString('base64');
  return out;
}
function renameKey(key, owner, filename, name) {
  return new Promise((resolve) => key.rename(owner, filename, name,
    (success, response, reason) => resolve({ success, response, reason })));
}
let PEM_CACHE = null;
function testPem() {
  if (PEM_CACHE === null) {
    PEM_CACHE = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    }).publicKey;
  }
  return PEM_CACHE;
}

// The contract shared with 45-02, 45-04 (Vue mirrors exactly these) and 45-05.
const NAME_CASES = [
  ['Firmware 🚀', null], ['Ünïcödé', null], ['مفتاح', null], ['Firmware Repository', null], ['x'.repeat(120), null],
  ['', 'empty'], ['   ', 'empty'], [{}, 'empty'], [[], 'empty'], [42, 'empty'], [null, 'empty'], [undefined, 'empty'],
  ['x'.repeat(121), 'too_long'],
  [ch(0x09), 'control_chars'], ['a' + ch(0x09) + 'b', 'control_chars'], ['a' + ch(0x7f) + 'b', 'control_chars'],
  ['a' + ch(0x85) + 'b', 'control_chars'], ['Firmware' + ch(0x0a), 'control_chars'],
  ['a' + ch(0x2028) + 'b', 'line_separator'], ['a' + ch(0x2029) + 'b', 'line_separator'], [ch(0x2028), 'line_separator'],
  ['a' + ch(0x202e) + 'b', 'bidi'], ['a' + ch(0x202a) + 'b', 'bidi'], ['a' + ch(0x2066) + 'b', 'bidi'],
  ['a' + ch(0x2069) + 'b', 'bidi'], ['a' + ch(0x200e) + 'b', 'bidi'], ['a' + ch(0x200f) + 'b', 'bidi'],
  // 45-REVIEW IN-01: U+061C ARABIC LETTER MARK is the third implicit mark next to LRM/RLM.
  ['a' + ch(0x061c) + 'b', 'bidi'],
  // ZWSP, word joiner and BOM are refused anywhere; ZWNJ/ZWJ are allowed (emoji ZWJ
  // sequences, Persian/Indic names, D-06), but a name made only of them is empty.
  ['a' + ch(0x200b) + 'b', 'invisible'], ['a' + ch(0x200c) + 'b', null], ['a' + ch(0x200d) + 'b', null],
  [ch(0x200c) + ch(0x200d), 'empty'],
  ['a' + ch(0x2060) + 'b', 'invisible'], [ch(0xfeff) + 'ab', 'invisible'], [ch(0x200b) + ch(0x2060), 'invisible'],
  [String.fromCodePoint(0x1f469) + ch(0x200d) + String.fromCodePoint(0x1f4bb), null], // emoji ZWJ sequence (D-06)
  // A name that shows nothing (only whitespace and default-ignorable characters) is empty.
  [ch(0x00ad), 'empty'], [ch(0x00ad) + ' ' + ch(0x3164), 'empty'], [ch(0xfe0f), 'empty'], [ch(0x034f) + ch(0x115f), 'empty'],
  [String.fromCodePoint(0xe0001) + String.fromCodePoint(0xe0041), 'empty'], [String.fromCodePoint(0x1d173), 'empty'],
  ['a' + ch(0x00ad) + 'b', null], ['x' + ch(0xfe0f), null],
  // A lone surrogate cannot be stored as sent (UTF-8 turns it into U+FFFD).
  ['ab' + ch(0xd800), 'control_chars'], [ch(0xdc00) + 'ab', 'control_chars'], ['a' + ch(0xdbff) + ch(0xdbff) + ch(0xdc00), 'control_chars'],
  [ch(0xd83d) + ch(0xde80), null]
];
test('validateKeyName returns the D-06 reason for every shared case (D-05, D-06, IN-02)', () => {
  for (const [name, reason] of NAME_CASES) {
    const label = JSON.stringify(name === undefined ? 'undefined' : name);
    const expected = reason === null ? { ok: true } : { ok: false, reason };
    assert.deepEqual(RSAKey.validateKeyName(name), expected, label);
  }
});
test('validateKeyName classifies every UTF-16 code unit between two letters', () => {
  const BIDI = new Set([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);
  const INVISIBLE = new Set([0x200b, 0x2060, 0xfeff]);
  for (let c = 0; c <= 0xffff; c++) {
    let expected = { ok: true };
    if (c < 0x20 || c === 0x7f || (c >= 0x80 && c <= 0x9f)) expected = { ok: false, reason: 'control_chars' };
    else if (c >= 0xd800 && c <= 0xdfff) expected = { ok: false, reason: 'control_chars' }; // lone surrogate
    else if (c === 0x2028 || c === 0x2029) expected = { ok: false, reason: 'line_separator' };
    else if (BIDI.has(c)) expected = { ok: false, reason: 'bidi' };
    else if (INVISIBLE.has(c)) expected = { ok: false, reason: 'invisible' };
    assert.deepEqual(RSAKey.validateKeyName('a' + ch(c) + 'b'), expected, 'code unit 0x' + c.toString(16).padStart(4, '0'));
  }
  // The first offending unit decides; the scan runs before trimming.
  assert.deepEqual(RSAKey.validateKeyName(ch(0x202e) + 'a' + ch(0x09)), { ok: false, reason: 'bidi' });
  assert.deepEqual(RSAKey.validateKeyName('  ' + 'x'.repeat(120) + '  '), { ok: true });
});

// The Vue mirror (services/console/vue/src/utils/keyNames.js) must agree with the server on
// every input (45-REVIEW IN-01; T-45-21). Skipped when the console submodule is not checked out.
const VUE_KEY_NAMES = path.join(__dirname, '..', '..', 'services', 'console', 'vue', 'src', 'utils', 'keyNames.js');
test('the Vue keyNames.js validator agrees with RSAKey.validateKeyName on every UTF-16 unit', { skip: !fs.existsSync(VUE_KEY_NAMES) && 'console submodule not checked out' }, () => {
  const source = fs.readFileSync(VUE_KEY_NAMES, 'utf8').replace(/^export /gm, '');
  const client = new Function(source + '\nreturn { validateKeyName, KEY_NAME_MAX };')();
  const same = (name, label) => assert.deepEqual(client.validateKeyName(name), RSAKey.validateKeyName(name), label);
  for (let c = 0; c <= 0xffff; c++) {
    const u = ch(c);
    const label = 'unit 0x' + c.toString(16).padStart(4, '0');
    for (const name of [u, 'a' + u + 'b', u + 'a', 'a' + u, u + u, ' ' + u + ' ']) same(name, label);
  }
  for (let h = 0xd800; h <= 0xdbff; h++) same(ch(h) + ch(0xdc00), 'high 0x' + h.toString(16));
  for (let l = 0xdc00; l <= 0xdfff; l++) same(ch(0xdb40) + ch(l), 'low 0x' + l.toString(16));
  for (const [name] of NAME_CASES) same(name, JSON.stringify(name === undefined ? 'undefined' : name));
  for (let n = 118; n <= 122; n++) same('x'.repeat(n), 'length ' + n);
  assert.equal(client.KEY_NAME_MAX, 120);
});

test('rename rewrites only the .pub comment, keeps the key tokens and the file mode (KEY-04, D-02, D-04)', async () => {
  const {dir, key} = fixture();
  try {
    const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n', 0o640);
    const r = await renameKey(key, OWNER, filename, '  New name  ');
    assert.equal(r.success, true);
    assert.deepEqual(Object.keys(r.response).sort(), ['date', 'filename', 'fingerprint', 'name', 'pubkey']);
    assert.equal(r.response.name, 'New name');
    assert.equal(r.response.filename, filename);
    const [type, blob] = tokens(GITHUB_RSA);
    assert.equal(fs.readFileSync(path.join(dir, filename + '.pub'), 'utf8'), type + ' ' + blob + ' New name\n');
    assert.equal(fs.statSync(path.join(dir, filename + '.pub')).mode & 0o777, 0o640, 'mode preserved');
    assert.deepEqual(fs.readdirSync(dir).sort(), [filename, filename + '.pub'].sort(), 'no temp file left');
    assert.equal(fs.readFileSync(path.join(dir, filename), 'utf8'), 'synthetic-private-fixture');
    assert.equal(key.exportKeysForList([filename], OWNER)[0].name, 'New name');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('rename converts a PEM .pub to one OpenSSH line with the same key material (D-03)', async () => {
  const {dir, key} = fixture();
  try {
    const pem = testPem();
    const filename = writeKey(dir, OWNER, 1100, pem, 0o644);
    const r = await renameKey(key, OWNER, filename, 'New name');
    assert.equal(r.success, true);
    const text = fs.readFileSync(path.join(dir, filename + '.pub'), 'utf8');
    assert.match(text, /^ssh-rsa [A-Za-z0-9+/]+=* New name\n$/);
    assert.deepEqual(tokens(text).slice(0, 2), tokens(RSAKey.toOpenSSH(pem)).slice(0, 2));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('rename refuses foreign, traversing, absolute, .pub, unknown and claim-only names; no file changes (T-45-01/02)', async () => {
  const {dir, key} = fixture();
  try {
    const mine = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Mine\n');
    const theirs = writeKey(dir, OTHER, 2000, GITHUB_RSA + ' Theirs\n');
    fs.writeFileSync(path.join(dir, OWNER + '-3000.pub'), ''); // a name claim, no private half
    const pending = writeKey(dir, OWNER, 4000, ''); // private written, .pub still empty
    const broken = writeKey(dir, OWNER, 5000, 'ssh-rsa not*base64 Broken\n');
    const before = snapshot(dir);
    const cases = [
      [theirs, 'key_not_found'], ['../' + mine, 'key_not_found'], [path.join(dir, mine), 'key_not_found'],
      [mine + '.pub', 'key_not_found'], [OWNER + '-999', 'key_not_found'], [5, 'key_not_found'],
      [null, 'key_not_found'], [OWNER + '-3000', 'key_not_found'], [pending, 'key_not_found'],
      [broken, 'rename_failed']
    ];
    for (const [filename, expected] of cases) {
      const r = await renameKey(key, OWNER, filename, 'New name');
      assert.deepEqual([r.success, r.response], [false, expected], String(filename));
      assert.deepEqual(snapshot(dir), before, 'nothing changed for ' + String(filename));
    }
    const r = await renameKey(key, OWNER, mine, 'a' + ch(0x202e) + 'b');
    assert.deepEqual([r.success, r.response, r.reason], [false, 'invalid_key_name', 'bidi']);
    assert.deepEqual(snapshot(dir), before);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// Every fs / fs-extra function that could open, read, write, chmod, move or remove a file.
const SPIED = ['open', 'openSync', 'readFile', 'readFileSync', 'writeFile', 'writeFileSync', 'appendFileSync',
  'copyFile', 'copyFileSync', 'rename', 'renameSync', 'chmod', 'chmodSync', 'chown', 'chownSync', 'unlink',
  'unlinkSync', 'truncate', 'truncateSync', 'rm', 'rmSync', 'utimes', 'utimesSync', 'createReadStream',
  'createWriteStream', 'remove', 'removeSync', 'move', 'moveSync', 'copy', 'copySync', 'outputFile', 'outputFileSync'];
const TWO_PATHS = new Set(['copyFile', 'copyFileSync', 'rename', 'renameSync', 'move', 'moveSync', 'copy', 'copySync']);
function spyOnPath(target) {
  const calls = [];
  const restorers = [];
  const asPath = (a) => {
    if (typeof a === 'string') return path.resolve(a);
    if (Buffer.isBuffer(a)) return path.resolve(a.toString());
    if (a instanceof URL) return path.resolve(url.fileURLToPath(a));
    return null;
  };
  for (const mod of [require('fs'), require('fs-extra')]) {
    for (const name of SPIED) {
      const real = mod[name];
      if (typeof real !== 'function') continue;
      mod[name] = function (...args) {
        const paths = TWO_PATHS.has(name) ? [args[0], args[1]] : [args[0]];
        if (paths.some((a) => asPath(a) === target)) calls.push(name);
        return real.apply(this, args);
      };
      restorers.push(() => { mod[name] = real; });
    }
  }
  return { calls, restore: () => restorers.forEach((r) => r()) };
}
test('rename never opens, reads, writes, chmods or removes the private key (D-04, T-45-05)', async () => {
  const {dir, key} = fixture();
  const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
  const privatePath = path.resolve(dir, filename);
  try {
    // The spy itself works: a deliberate read of the private file is recorded.
    const probe = spyOnPath(privatePath);
    try { require('fs-extra').readFileSync(privatePath); } finally { probe.restore(); }
    assert.ok(probe.calls.includes('readFileSync'), 'spy records ' + JSON.stringify(probe.calls));

    const bytes = fs.readFileSync(privatePath);
    const mtimeMs = fs.statSync(privatePath).mtimeMs;
    const locked = (typeof process.getuid === 'function' && process.getuid() !== 0) ? 0o000 : 0o600;
    fs.chmodSync(privatePath, locked); // any read attempt now fails (unless root)
    const spy = spyOnPath(privatePath);
    let r;
    try { r = await renameKey(key, OWNER, filename, 'New name'); } finally { spy.restore(); }
    assert.equal(r.success, true);
    assert.deepEqual(spy.calls, [], 'no fs call on the private key path');
    const stat = fs.statSync(privatePath);
    assert.equal(stat.mode & 0o777, locked, 'private mode unchanged');
    assert.equal(stat.mtimeMs, mtimeMs, 'private mtime unchanged');
    fs.chmodSync(privatePath, 0o600);
    assert.deepEqual(fs.readFileSync(privatePath), bytes, 'private bytes unchanged');
  } finally {
    try { fs.chmodSync(privatePath, 0o600); } catch { /* already removed */ }
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
test('a failed .pub replace reports rename_failed, keeps the old .pub and leaves no temp file (T-45-06)', async () => {
  const {dir, key} = fixture();
  const fsx = require('fs-extra'); // rsakey.js writes through fs-extra
  const realRename = fsx.renameSync;
  try {
    const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    const before = snapshot(dir);
    fsx.renameSync = () => { const e = new Error('synthetic EIO'); e.code = 'EIO'; throw e; };
    let r;
    try { r = await renameKey(key, OWNER, filename, 'New name'); } finally { fsx.renameSync = realRename; }
    assert.deepEqual([r.success, r.response], [false, 'rename_failed']);
    assert.deepEqual(snapshot(dir), before, 'old .pub kept, no dot-prefixed temp file left');
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith('.')), []);
  } finally { fsx.renameSync = realRename; fs.rmSync(dir, {recursive: true, force: true}); }
});
// 45-REVIEW IN-04: rename() is synchronous, so only another API process on the shared key
// volume can revoke the pair mid-rename. These tests play that process from inside the fs
// calls rename makes. Either way the answer is key_not_found and no orphan .pub, no temp
// file and no other file of that key is left behind.
function revokeOnDisk(dir, filename) {
  fs.rmSync(path.join(dir, filename), { force: true });
  fs.rmSync(path.join(dir, filename + '.pub'), { force: true });
}
test('a key revoked before the .pub replace is not recreated (IN-04)', async () => {
  const {dir, key} = fixture();
  const fsx = require('fs-extra');
  const realChmod = fsx.chmodSync;
  try {
    const keep = writeKey(dir, OWNER, 2000, GITHUB_RSA + ' Keep me\n');
    const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    // The temp file's chmod is the last step before the check and the final renameSync.
    fsx.chmodSync = (p, mode) => { const r = realChmod(p, mode); if (String(p).endsWith('.tmp')) revokeOnDisk(dir, filename); return r; };
    let r;
    try { r = await renameKey(key, OWNER, filename, 'New name'); } finally { fsx.chmodSync = realChmod; }
    assert.deepEqual([r.success, r.response], [false, 'key_not_found']);
    assert.deepEqual(fs.readdirSync(dir).sort(), [keep, keep + '.pub'], 'no orphan .pub, no temp file');
  } finally { fsx.chmodSync = realChmod; fs.rmSync(dir, {recursive: true, force: true}); }
});
test('a key revoked between the check and the final rename leaves no orphan .pub (IN-04)', async () => {
  const {dir, key} = fixture();
  const fsx = require('fs-extra');
  const realRename = fsx.renameSync;
  try {
    const keep = writeKey(dir, OWNER, 2000, GITHUB_RSA + ' Keep me\n');
    const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    fsx.renameSync = (from, to) => { revokeOnDisk(dir, filename); return realRename(from, to); };
    let r;
    try { r = await renameKey(key, OWNER, filename, 'New name'); } finally { fsx.renameSync = realRename; }
    assert.deepEqual([r.success, r.response], [false, 'key_not_found']);
    assert.deepEqual(fs.readdirSync(dir).sort(), [keep, keep + '.pub'], 'the orphan .pub the rename wrote is removed');
  } finally { fsx.renameSync = realRename; fs.rmSync(dir, {recursive: true, force: true}); }
});
function failListingFrom(key, callNumber) {
  const real = key.getKeyPathsForOwner.bind(key);
  let calls = 0;
  key.getKeyPathsForOwner = (owner) => {
    calls += 1;
    if (calls >= callNumber) throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' });
    return real(owner);
  };
}
test('a failed key listing after the .pub replace keeps the key (45-VERIFICATION warning)', async () => {
  const {dir, key} = fixture();
  try {
    const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    failListingFrom(key, 3); // ownership check, pre-rename check pass; the post-rename check fails
    const r = await renameKey(key, OWNER, filename, 'New name');
    assert.deepEqual([r.success, r.response], [false, 'rename_failed']);
    assert.deepEqual(fs.readdirSync(dir).sort(), [filename, filename + '.pub'], 'private key and .pub both stay');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('a failed key listing before the .pub replace leaves the old .pub unchanged', async () => {
  const {dir, key} = fixture();
  try {
    const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    failListingFrom(key, 2); // ownership check passes; the pre-rename check fails
    const r = await renameKey(key, OWNER, filename, 'New name');
    assert.deepEqual([r.success, r.response], [false, 'rename_failed']);
    assert.deepEqual(fs.readdirSync(dir).sort(), [filename, filename + '.pub'], 'no temp file left');
    assert.match(fs.readFileSync(path.join(dir, filename + '.pub'), 'utf8'), / Old name\n$/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('account deletion also removes the owner\'s leftover rename temp files (T-45-06)', () => {
  const {dir, key} = fixture();
  try {
    writeKey(dir, OWNER, 7000, GITHUB_RSA + ' Key\n');
    fs.writeFileSync(path.join(dir, '.' + OWNER + '-7000.pub.0123456789ab.tmp'), 'partial');
    writeKey(dir, OTHER, 7001, GITHUB_RSA + ' Other\n');
    fs.writeFileSync(path.join(dir, '.' + OTHER + '-7001.pub.ba9876543210.tmp'), 'partial');
    key.revokeAllForOwner(OWNER);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes(OWNER)), [], 'no file of the deleted owner remains');
    assert.equal(fs.readdirSync(dir).filter((f) => f.includes(OTHER)).length, 3, 'other owner untouched');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// Router harness: a fake app records every registration; handlers run without Express.
let ROUTES = null;
function loadRouter() {
  if (ROUTES !== null) return ROUTES;
  const routes = {};
  const app = {};
  for (const method of ['get', 'put', 'post', 'delete', 'patch']) {
    app[method] = (route, ...handlers) => { routes[method.toUpperCase() + ' ' + route] = handlers; };
  }
  require('../../lib/router.rsakey.js')(app);
  ROUTES = routes;
  return ROUTES;
}
function fakeRes(resolve) {
  const res = {
    statusCode: 200,
    status(code) { res.statusCode = code; return res; },
    header() { return res; },
    end(text) { resolve({ status: res.statusCode, body: text ? JSON.parse(text) : undefined }); }
  };
  return res;
}
function callRoute(routeKey, req) {
  const handlers = loadRouter()[routeKey];
  assert.ok(Array.isArray(handlers), routeKey + ' is registered');
  return new Promise((resolve) => handlers[handlers.length - 1](Object.assign({ query: {} }, req), fakeRes(resolve)));
}
function clearRouterKeys() {
  const dir = path.join(TEST_HOME, '.ssh');
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
}
test('PATCH /api/v2/rsakey: CSRF first, session, body, filename, name reason, owner-bound key (KEY-04, D-02, D-07)', async () => {
  const handlers = loadRouter()['PATCH /api/v2/rsakey'];
  assert.ok(Array.isArray(handlers), 'PATCH /api/v2/rsakey is registered');
  assert.equal(handlers.length, 2);
  assert.equal(handlers[0].name, 'verifyCsrfToken');
  const dir = path.join(TEST_HOME, '.ssh');
  try {
    const mine = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    const theirs = writeKey(dir, OTHER, 2000, GITHUB_RSA + ' Theirs\n');
    const theirsBefore = fs.readFileSync(path.join(dir, theirs + '.pub'), 'utf8');
    const patch = (session, body) => callRoute('PATCH /api/v2/rsakey', { method: 'PATCH', session, body });
    assert.equal((await patch(undefined, { filename: mine, name: 'New name' })).status, 401);
    assert.deepEqual(await patch({ owner: OWNER }, undefined),
      { status: 400, body: { success: false, response: 'invalid_body' } });
    assert.deepEqual(await patch({ owner: OWNER }, [mine]),
      { status: 400, body: { success: false, response: 'invalid_body' } });
    assert.deepEqual(await patch({ owner: OWNER }, { filename: 5, name: 'New name' }),
      { status: 400, body: { success: false, response: 'invalid_filename' } });
    assert.deepEqual(await patch({ owner: OWNER }, { filename: mine, name: 'a' + ch(0x202e) + 'b' }),
      { status: 400, body: { success: false, response: 'invalid_key_name', reason: 'bidi' } });
    assert.deepEqual(await patch({ owner: OWNER }, { filename: theirs, name: 'New name' }),
      { status: 404, body: { success: false, response: 'key_not_found' } });
    assert.equal(fs.readFileSync(path.join(dir, mine + '.pub'), 'utf8'), GITHUB_RSA + ' Old name\n', 'refusals change nothing');
    const ok = await patch({ owner: OWNER }, { filename: mine, name: 'New name' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);
    assert.equal(ok.body.response.name, 'New name');
    assert.equal(ok.body.response.filename, mine);
    assert.equal(fs.readFileSync(path.join(dir, mine + '.pub'), 'utf8'), GITHUB_RSA + ' New name\n');
    assert.equal(fs.readFileSync(path.join(dir, theirs + '.pub'), 'utf8'), theirsBefore, 'other owner untouched');
  } finally { clearRouterKeys(); }
});

// ---------------------------------------------------------------------------
// Phase 45: OpenSSH fingerprints (D-01), safe display names (D-08, IN-03),
// one validator for create (D-05, IN-01).
// ---------------------------------------------------------------------------

// GitHub's published fingerprint for GITHUB_RSA (`ssh_key_fingerprints.SHA256_RSA`).
const GITHUB_RSA_SHA256 = 'SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s';
const DAMAGED_PEM = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\nAAAAnotakey\n-----END PUBLIC KEY-----\n';

test('fingerprint is the OpenSSH SHA256 of the decoded key blob; the comment never matters (D-01)', () => {
  assert.equal(RSAKey.fingerprint(GITHUB_RSA), GITHUB_RSA_SHA256);
  assert.equal(RSAKey.fingerprint(GITHUB_RSA + ' Another name'), GITHUB_RSA_SHA256);
  assert.equal(RSAKey.fingerprint(GITHUB_RSA + ' thinx-1000\n'), GITHUB_RSA_SHA256);
  const blob = tokens(GITHUB_RSA)[1];
  const bad = ['', 'ssh-rsa', 'ssh-rsa not*base64 x', testPem(), GITHUB_RSA + ' One' + ch(0x0a) + GITHUB_RSA + ' Two',
    42, null, undefined, {}, 'ssh-ed25519 ' + blob + ' type mismatch', 'ssh-rsa AAAA', 'ssh-rsa ' + blob.slice(0, 40)];
  for (const value of bad) assert.equal(RSAKey.fingerprint(value), null, String(value).slice(0, 40));
});
test('fingerprint equals ssh-keygen -lf for a freshly generated key (D-01)', (t) => {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thinx-fp-'));
  try {
    const line = RSAKey.toOpenSSH(testPem(), 'p45');
    const file = path.join(dir, 'key.pub');
    fs.writeFileSync(file, line + '\n');
    const out = spawnSync('ssh-keygen', ['-l', '-f', file], { encoding: 'utf8' });
    if (out.error || out.status !== 0) { t.skip('ssh-keygen is not runnable here'); return; }
    const printed = out.stdout.trim().split(/\s+/)[1];
    assert.match(printed, /^SHA256:[A-Za-z0-9+/]{43}$/);
    assert.equal(RSAKey.fingerprint(line), printed);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('list() fingerprints: GitHub vector, PEM via its OpenSSH form, kept across a rename, null when unparseable (D-01)', async () => {
  const {dir, key} = fixture();
  try {
    const github = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    const pem = writeKey(dir, OWNER, 2000, testPem());
    const junk = writeKey(dir, OWNER, 3000, 'ssh-rsa synthetic-public-fixture Junk\n');
    const byName = () => Object.fromEntries(key.exportKeysForList(key.getKeyPathsForOwner(OWNER), OWNER)
      .map((k) => [k.filename, k.fingerprint]));
    const before = byName();
    assert.equal(before[github], GITHUB_RSA_SHA256);
    assert.equal(before[pem], RSAKey.fingerprint(RSAKey.toOpenSSH(testPem())));
    assert.match(before[pem], /^SHA256:[A-Za-z0-9+/]{43}$/);
    assert.equal(before[junk], null);
    for (const filename of [github, pem]) {
      const r = await renameKey(key, OWNER, filename, 'Renamed ' + filename.slice(-4));
      assert.equal(r.success, true);
      assert.equal(r.response.fingerprint, before[filename], 'rename keeps the fingerprint');
    }
    assert.deepEqual(byName(), before);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('list() shows a stored comment only when it is a safe name on a single-line ssh- key (D-08, IN-03)', () => {
  const {dir, key} = fixture();
  try {
    const cases = [
      [1001, GITHUB_RSA + ' Firmware\n', 'Firmware'],
      [1002, GITHUB_RSA + ' thinx-1002\n', null],
      [1003, GITHUB_RSA + '\n', null],
      [1004, GITHUB_RSA + ' a' + ch(0x202e) + 'b\n', null],
      [1005, GITHUB_RSA + ' a' + ch(0x09) + 'b\n', null],
      [1006, testPem(), null],
      [1007, DAMAGED_PEM, null],
      [1008, GITHUB_RSA + ' One\n' + GITHUB_RSA + ' Two\n', null]
    ];
    for (const [time, text] of cases) writeKey(dir, OWNER, time, text);
    const listed = Object.fromEntries(key.exportKeysForList(key.getKeyPathsForOwner(OWNER), OWNER)
      .map((k) => [k.filename, k]));
    for (const [time, , name] of cases) {
      const entry = listed[OWNER + '-' + time];
      assert.equal(entry.name, name === null ? new Date(time).toString() : name, 'key ' + time);
      assert.ok(!entry.name.startsWith('KEY-----'), 'never a PEM fragment');
    }
    assert.equal(listed[OWNER + '-1007'].pubkey, DAMAGED_PEM, 'a damaged PEM keeps its raw text');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
test('create refuses invalid names with a reason before generating; routers answer 400 with it (D-05, D-07, IN-01)', async () => {
  const realCreate = RSAKey.prototype.create;
  const seen = [];
  try {
    loadRouter(); // registers with the real prototype; the recorder replaces it below
    RSAKey.prototype.create = function (owner, cb, name) { seen.push(name); cb(true, { name: name }); };
    const session = { owner: OWNER };
    assert.deepEqual(await callRoute('PUT /api/v2/rsakey', { method: 'PUT', session, body: { name: 'a' + ch(0x2028) + 'b' } }),
      { status: 400, body: { success: false, response: 'invalid_key_name', reason: 'line_separator' } });
    assert.deepEqual(await callRoute('GET /api/user/rsakey/create', { method: 'GET', session, query: { name: 'x'.repeat(121) } }),
      { status: 400, body: { success: false, response: 'invalid_key_name', reason: 'too_long' } });
    assert.deepEqual(seen, [], 'neither request reached create');
    // The name still comes from the query for GET and from the body otherwise.
    await callRoute('PUT /api/v2/rsakey', { method: 'PUT', session, body: { name: 'From body' }, query: { name: 'From query' } });
    await callRoute('GET /api/user/rsakey/create', { method: 'GET', session, query: { name: 'From query' }, body: { name: 'From body' } });
    assert.deepEqual(seen, ['From body', 'From query']);
  } finally { RSAKey.prototype.create = realCreate; }
  const {dir, key} = fixture();
  try {
    let generated = 0;
    key.generate = (owner, date, cb) => { generated++; cb(null, 'ssh-rsa fixture x'); };
    const r = await new Promise((resolve) => key.create(OWNER,
      (success, response, reason) => resolve({ success, response, reason }), 'a' + ch(0x202e) + 'b'));
    assert.deepEqual([r.success, r.response, r.reason], [false, 'invalid_key_name', 'bidi']);
    assert.equal(generated, 0);
    assert.deepEqual(fs.readdirSync(dir), [], 'no name claimed');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// 45-REVIEW IN-02: list() hides a comment equal to thinx-<timestamp> (the generated default)
// and shows the date instead. A rename or create to exactly that name reported success while
// the list kept showing the date, so both refuse it with the reason `reserved`.
test('rename and create refuse the key\'s own generated default name thinx-<timestamp> (IN-02)', async () => {
  const {dir, key} = fixture();
  try {
    const filename = writeKey(dir, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    const before = snapshot(dir);
    for (const name of ['thinx-1000', '  thinx-1000 ']) {
      const r = await renameKey(key, OWNER, filename, name);
      assert.deepEqual([r.success, r.response, r.reason], [false, 'invalid_key_name', 'reserved'], JSON.stringify(name));
    }
    assert.deepEqual(snapshot(dir), before, 'a refused rename changes nothing');
    // Another key's default is an ordinary name: stored, answered and listed as sent.
    const r = await renameKey(key, OWNER, filename, 'thinx-2000');
    assert.equal(r.success, true);
    assert.equal(r.response.name, 'thinx-2000');
    const listed = await new Promise((resolve) => key.list(OWNER, (ok, list) => resolve(list)));
    assert.equal(listed[0].name, 'thinx-2000');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  const created = fixture();
  try {
    let generated = 0;
    created.key.newUniqueIdentifier = () => 5000;
    created.key.generate = (owner, date, cb) => { generated++; cb(null, 'ssh-rsa fixture x'); };
    const r = await new Promise((resolve) => created.key.create(OWNER,
      (success, response, reason) => resolve({ success, response, reason }), 'thinx-5000'));
    assert.deepEqual([r.success, r.response, r.reason], [false, 'invalid_key_name', 'reserved']);
    assert.equal(generated, 0, 'nothing generated');
    assert.deepEqual(fs.readdirSync(created.dir), [], 'the claimed name is released');
  } finally { fs.rmSync(created.dir, {recursive: true, force: true}); }
  const dirOfRouter = path.join(TEST_HOME, '.ssh');
  const realId = RSAKey.prototype.newUniqueIdentifier;
  try {
    const mine = writeKey(dirOfRouter, OWNER, 1000, GITHUB_RSA + ' Old name\n');
    const session = { owner: OWNER };
    assert.deepEqual(await callRoute('PATCH /api/v2/rsakey', { method: 'PATCH', session, body: { filename: mine, name: 'thinx-1000' } }),
      { status: 400, body: { success: false, response: 'invalid_key_name', reason: 'reserved' } });
    RSAKey.prototype.newUniqueIdentifier = () => 6000;
    assert.deepEqual(await callRoute('PUT /api/v2/rsakey', { method: 'PUT', session, body: { name: 'thinx-6000' } }),
      { status: 400, body: { success: false, response: 'invalid_key_name', reason: 'reserved' } });
    assert.deepEqual(fs.readdirSync(dirOfRouter).sort(), [mine, mine + '.pub']);
  } finally { RSAKey.prototype.newUniqueIdentifier = realId; clearRouterKeys(); }
});

// ---------------------------------------------------------------------------
// Phase 45: revoke duplicates (D-14, 38 IN-04) and the remaining 38 IN-06 gaps (D-16).
// The other two IN-06 gaps are covered above: keys 1 ms apart list newest first
// ('keys created within the same second still list newest first (38 WR-01)') and the
// library ignores a non-array `filenames` ('revoke ignores a non-array filenames value ...').
// ---------------------------------------------------------------------------

test('D1 revoke handles and reports a filename named twice once; a foreign key is never deleted (D-14, IN-04)', () => {
  const {dir, key} = fixture();
  try {
    const f = writePair(dir, OWNER, 1000, 'Twice');
    const kept = writePair(dir, OWNER, 2000, 'Kept');
    const other = writePair(dir, OTHER, 3000, 'Other owner');
    assert.deepEqual(key.revokeUserKeys([f, f, other], OWNER), [f]);
    assert.equal(fs.existsSync(path.join(dir, f)), false);
    assert.equal(fs.existsSync(path.join(dir, f + '.pub')), false);
    assert.equal(fs.existsSync(path.join(dir, kept)), true, 'unselected key kept');
    assert.equal(fs.existsSync(path.join(dir, other)), true, 'other owner untouched');
    assert.equal(fs.existsSync(path.join(dir, other + '.pub')), true);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('D2 router revoke: duplicates reported once on v2 and v1; null, 5 and {} answer 400 invalid_filenames (D-14, IN-04, IN-06)', async () => {
  const dir = path.join(TEST_HOME, '.ssh');
  const session = { owner: OWNER };
  try {
    const kept = writePair(dir, OWNER, 1000, 'Kept');
    for (const filenames of [null, 5, {}]) {
      for (const [routeKey, method] of [['DELETE /api/v2/rsakey', 'DELETE'], ['POST /api/user/rsakey/revoke', 'POST']]) {
        assert.deepEqual(await callRoute(routeKey, { method, session, body: { filenames } }),
          { status: 400, body: { success: false, response: 'invalid_filenames' } }, routeKey + ' ' + JSON.stringify(filenames));
      }
    }
    assert.deepEqual(fs.readdirSync(dir).sort(), [kept, kept + '.pub'].sort(), 'a refused body deletes nothing');
    const f = writePair(dir, OWNER, 2000, 'Twice v2');
    assert.deepEqual(await callRoute('DELETE /api/v2/rsakey', { method: 'DELETE', session, body: { filenames: [f, f] } }),
      { status: 200, body: { success: true, response: [f] } });
    const g = writePair(dir, OWNER, 3000, 'Twice v1');
    assert.deepEqual(await callRoute('POST /api/user/rsakey/revoke', { method: 'POST', session, body: { filenames: [g, g] } }),
      { status: 200, body: { success: true, response: [g] } });
    assert.deepEqual(fs.readdirSync(dir).sort(), [kept, kept + '.pub'].sort(), 'only the named keys are gone');
  } finally { clearRouterKeys(); }
});

test('S1 router create takes the name from req.query for GET and req.body otherwise; a bad name is 400 with its reason (IN-06)', async () => {
  const realCreate = RSAKey.prototype.create;
  const seen = [];
  try {
    loadRouter(); // registers with the real prototype; the recorder replaces it below
    RSAKey.prototype.create = function (owner, cb, name) { seen.push(name); cb(true, { name: name || 'unnamed' }); };
    const session = { owner: OWNER };
    const both = { query: { name: 'From query' }, body: { name: 'From body' } };
    assert.deepEqual(await callRoute('GET /api/user/rsakey/create', Object.assign({ method: 'GET', session }, both)),
      { status: 200, body: { success: true, response: { name: 'From query' } } });
    assert.deepEqual(await callRoute('PUT /api/v2/rsakey', Object.assign({ method: 'PUT', session }, both)),
      { status: 200, body: { success: true, response: { name: 'From body' } } });
    assert.deepEqual(seen, ['From query', 'From body']);
    // Without a name the key is unnamed: create gets undefined, not the other source's name.
    await callRoute('GET /api/user/rsakey/create', { method: 'GET', session, query: {}, body: { name: 'From body' } });
    await callRoute('PUT /api/v2/rsakey', { method: 'PUT', session, query: { name: 'From query' }, body: {} });
    assert.deepEqual(seen, ['From query', 'From body', undefined, undefined]);
    assert.deepEqual(await callRoute('GET /api/user/rsakey/create', { method: 'GET', session, query: { name: '  ' } }),
      { status: 400, body: { success: false, response: 'invalid_key_name', reason: 'empty' } });
    assert.deepEqual(await callRoute('PUT /api/v2/rsakey', { method: 'PUT', session, body: { name: 'a' + ch(0x202e) + 'b' } }),
      { status: 400, body: { success: false, response: 'invalid_key_name', reason: 'bidi' } });
    assert.equal(seen.length, 4, 'a bad name never reaches create');
  } finally { RSAKey.prototype.create = realCreate; }
});

test('G1 a named real generate lists that name and an OpenSSH SHA256 fingerprint (IN-06)', async () => {
  const {dir, key} = fixture();
  try {
    await withPassphrase(async () => {
      const r = await new Promise((resolve) => key.create(OWNER,
        (success, response) => resolve({ success, response }), '  Firmware Repository  '));
      assert.equal(r.success, true);
      assert.equal(r.response.name, 'Firmware Repository');
      const pub = fs.readFileSync(path.join(dir, r.response.filename + '.pub'), 'utf8');
      const parts = tokens(pub);
      assert.equal(parts[0], 'ssh-rsa');
      assert.equal(parts.slice(2).join(' '), 'Firmware Repository', 'the trimmed name is the .pub comment');
      const listed = key.exportKeysForList(key.getKeyPathsForOwner(OWNER), OWNER);
      assert.equal(listed.length, 1);
      assert.equal(listed[0].filename, r.response.filename);
      assert.equal(listed[0].name, 'Firmware Repository');
      assert.match(listed[0].fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
      assert.equal(listed[0].fingerprint, RSAKey.fingerprint(pub.trim()));
    });
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
