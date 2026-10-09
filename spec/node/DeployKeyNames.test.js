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
