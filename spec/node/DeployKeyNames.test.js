const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.ENVIRONMENT = 'development';
const RSAKey = require('../../lib/thinx/rsakey');
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
    assert.equal(new Date(result.response.date).getTime(),12345);
    assert.equal(result.response.pubkey,'ssh-rsa fixture Firmware');
    assert.equal(path.basename(result.response.filename),OWNER+'-12345.pub');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('legacy create(owner, callback) remains valid; invalid names never generate', () => {
  const {dir,key}=fixture();
  try {
    let generated=0;
    key.generate=(owner,date,cb,name)=>{generated++;assert.equal(name,undefined);cb(null,'ssh-rsa fixture thinx-'+date);};
    key.create(OWNER,success=>assert.equal(success,true));
    for (const name of ['', '  ', 'key\nother', 'key\u0000', 'x'.repeat(121), {}, []]) {
      key.create(OWNER,(success,response)=>{assert.equal(success,false);assert.equal(response,'invalid_key_name');},name);
    }
    assert.equal(generated,1);
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
      assert.equal(new Date(r.response.date).getTime(),Number(base.split('-')[1]));
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
