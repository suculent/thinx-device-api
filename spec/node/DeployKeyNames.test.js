const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
    for (const name of ['', '  ', 'key\nother', 'key\u0000', 'x'.repeat(121), {}, [], 'a\tb', 'a\rb', 'a\u001fb', 'a\u007fb']) {
      key.create(OWNER,(success,response)=>{assert.equal(success,false);assert.equal(response,'invalid_key_name');},name);
    }
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
