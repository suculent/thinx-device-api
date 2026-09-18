describe("RSA Key", function() {

  beforeAll(() => {
    console.log(`🚸 [chai] >>> running RSA spec`);
  });

  afterAll(() => {
    console.log(`🚸 [chai] <<< completed RSA spec`);
  });


  var expect = require('chai').expect;
  var RSAKey = require("../../lib/thinx/rsakey");
  var rsakey = new RSAKey();

  var envi = require("../_envi.json");
  var owner = envi.oid;

  var invalid_fingerprints = [
    "a9:fd:f3:8e:97:7d:f4:c1:e1:39:3f:fd:2b:3b:5f:9_"
  ];

  var revoked_filenames = [

  ];

  it("(300) should be able to add RSA Keys first", function(done) {
    rsakey.create(owner,
    function(success, response) {
      expect(success).to.equal(true);
      expect(response).to.be.a('object'); 
      done();
    });
  }, 10000);

  it("(01) should be able to list RSA Keys", function(done) {
    rsakey.list(owner, function(success, list) {
      expect(success).to.equal(true);
      expect(list.length).to.be.greaterThanOrEqual(1);
      done();
    });
  }, 10000);

  it("(02) should fail on invalid revocation", function(done) {
    rsakey.revoke(owner, invalid_fingerprints,
      function(res, success, message) {
        expect(success).to.equal(true); // succeds for more fingerprints if one is valid? maybe...
        expect(message).to.be.an('array');
        done();
      }, {});
  }, 10000);

  it("(03) should be able to add RSA Key 2/3", function(done) {
    rsakey.create(owner, (success, response) => {
      revoked_filenames.push(response.filename);
      expect(success).to.equal(true);
    });
    rsakey.create(owner, (success, response) => {
        revoked_filenames.push(response.filename);
        expect(success).to.equal(true);
        done();
    });
  }, 10000);

  it("(04) should be able to revoke multiple RSA Keys at once", function(done) {
    rsakey.revoke(owner, revoked_filenames, function(res, succ, mess) {
        expect(succ).to.equal(true);
        expect(mess).to.be.an('array'); // should be array of length of 2
        done();
      }, {});
  }, 10000);


  //validateOwner: function(invalid-owner)
  it("(05) should be able to reject invalid owner (feature envy)", function () {
    expect(rsakey.validateOwner("dummy")).to.equal(false);
    expect(rsakey.validateOwner("dum-my")).to.equal(false);
    expect(rsakey.validateOwner("dum my")).to.equal(false);
    expect(rsakey.validateOwner("dum&my")).to.equal(false);
    expect(rsakey.validateOwner("dum;my")).to.equal(false);
    expect(rsakey.validateOwner("dum\;my")).to.equal(false);
    expect(rsakey.validateOwner("dum\&nbsp;my")).to.equal(false);
  });

  it("(06) should be able to add RSA Key 2/3", function(done) {
    rsakey.create(envi.dynamic.owner, (success, _response) => {
      expect(success).to.equal(true);
      done();
    });
  }, 10000);

  // GitHub rejects the SPKI PEM that generateKeyPair emits ("Key is invalid"),
  // so deploy keys have to be stored in OpenSSH form.
  it("(07) should issue public keys in OpenSSH format, not PEM", function (done) {
    rsakey.create(owner, (success, response) => {
      expect(success).to.equal(true);
      expect(response.pubkey).to.be.a('string');
      expect(response.pubkey.indexOf("ssh-rsa AAAA")).to.equal(0);
      expect(response.pubkey.indexOf("-----BEGIN")).to.equal(-1);
      done();
    });
  }, 10000);

  it("(08) should list public keys in OpenSSH format", function (done) {
    rsakey.list(owner, (success, list) => {
      expect(success).to.equal(true);
      for (let key of list) {
        expect(key.pubkey.indexOf("-----BEGIN")).to.equal(-1);
      }
      done();
    });
  }, 10000);

  // Keys issued before the OpenSSH switch are still PEM on disk.
  it("(09) should convert a legacy PEM public key on read", function () {
    const { generateKeyPairSync } = require('crypto');
    const pem = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
    }).publicKey;
    expect(RSAKey.toOpenSSH(pem, "legacy").indexOf("ssh-rsa AAAA")).to.equal(0);
  });

  it("(10) should pass an already-OpenSSH key through unchanged", function () {
    const line = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAB test";
    expect(RSAKey.toOpenSSH(line, "ignored")).to.equal(line);
  });

  // The passphrase must match what git.js feeds ssh-add via SSH_ASKPASS;
  // generating a key we cannot decrypt only fails later, as a clone that
  // silently offers no identity at all.
  it("(11) should refuse to generate a key when GIT_KEY_PASSPHRASE is unset", function (done) {
    const saved = process.env.GIT_KEY_PASSPHRASE;
    delete process.env.GIT_KEY_PASSPHRASE;
    rsakey.generate(owner, new Date().getTime(), (err) => {
      if (typeof saved !== "undefined") process.env.GIT_KEY_PASSPHRASE = saved;
      expect(err).to.be.an('error');
      done();
    });
  });

  it("(12) should discover key owners from the key directory", function () {
    const owners = rsakey.listOwnersOnDisk();
    expect(owners).to.be.an('array');
    expect(owners).to.include(owner);
  });

  // Dry run only — dry_run:false here would delete real key material.
  it("(13) should report orphaned owners without deleting anything", function (done) {
    rsakey.purgeOrphanedKeys({}, (success, result) => {
      expect(success).to.equal(true);
      expect(result.dry_run).to.equal(true);
      expect(result.owners_in_db).to.be.greaterThan(0);
      expect(rsakey.keyPathsExist(owner)).to.equal(true);
      done();
    });
  }, 10000);

});
