describe("RSA Key", function() {

  var expect = require('chai').expect;
  var fs = require("fs");
  var os = require("os");
  var path = require("path");
  var RSAKey = require("../../lib/thinx/rsakey");
  var rsakey = new RSAKey();

  // 34-REVIEW WR-05: every key this spec creates goes into a per-run temp
  // directory, never into Globals.app_config().ssh_keys (in development that
  // is the developer's real ~/.ssh, on CI /mnt/data/ssh_keys). The directory
  // and all key material in it are removed after the spec.
  beforeAll(() => {
    console.log(`🚸 [chai] >>> running RSA spec`);
    rsakey.ssh_keys = fs.mkdtempSync(path.join(os.tmpdir(), "rsakey-spec-"));
  });

  afterAll(() => {
    fs.rmSync(rsakey.ssh_keys, { recursive: true, force: true });
    console.log(`🚸 [chai] <<< completed RSA spec`);
  });

  var envi = require("../_envi.json");
  var owner = envi.oid;

  var invalid_fingerprints = [
    "a9:fd:f3:8e:97:7d:f4:c1:e1:39:3f:fd:2b:3b:5f:9_"
  ];

  // Keys are revoked by the `filename` that list() returns (<owner>-<timestamp>,
  // no directory, no .pub). Both consoles send exactly that. create() reports
  // the .pub path instead, so these specs strip it back to the list() form.
  function listFilename(created) {
    return path.basename(created.filename, ".pub");
  }

  var first_key = null; // created in (300); must survive every revocation below

  var revoked_filenames = [

  ];

  it("(300) should be able to add RSA Keys first", function(done) {
    rsakey.create(owner,
    function(success, response) {
      expect(success).to.equal(true);
      expect(response).to.be.a('object');
      first_key = listFilename(response);
      done();
    });
  }, 10000);

  it("(01) should be able to list RSA Keys", function(done) {
    rsakey.list(owner, function(success, list) {
      expect(success).to.equal(true);
      expect(list.length).to.be.greaterThanOrEqual(1);
      expect(list.map(key => key.filename)).to.include(first_key);
      done();
    });
  }, 10000);

  // Nothing here names a key in list() form, so nothing may be deleted and the
  // call must report failure. Revocation used to work by position: it deleted
  // the owner's first N keys for any N identifiers, valid or not.
  it("(02) should fail on invalid revocation", function(done) {
    const before = rsakey.getKeyPathsForOwner(owner);
    const not_list_filenames = invalid_fingerprints.concat([
      first_key + ".pub",                          // the public half, not the key
      rsakey.ssh_keys + "/" + first_key + ".pub"   // what create() reports
    ]);
    rsakey.revoke(owner, not_list_filenames,
      function(res, success, message) {
        expect(success).to.equal(false);
        expect(message).to.be.an('array').that.is.empty;
        expect(rsakey.getKeyPathsForOwner(owner)).to.deep.equal(before);
        done();
      }, {});
  }, 10000);

  // Sequential, so done() cannot race the pushes. Concurrent creates are
  // covered separately in (03b).
  it("(03) should be able to add RSA Key 2/3", function(done) {
    rsakey.create(owner, (success, response) => {
      expect(success).to.equal(true);
      revoked_filenames.push(listFilename(response));
      rsakey.create(owner, (success2, response2) => {
        expect(success2).to.equal(true);
        revoked_filenames.push(listFilename(response2));
        expect(revoked_filenames[0]).to.not.equal(revoked_filenames[1]);
        done();
      });
    });
  }, 30000);

  it("(04) should be able to revoke multiple RSA Keys at once", function(done) {
    rsakey.list(owner, function(_success, list) {
      expect(list.map(key => key.filename)).to.include.members(revoked_filenames);
      rsakey.revoke(owner, revoked_filenames, function(res, succ, mess) {
        expect(succ).to.equal(true);
        expect(mess).to.have.members(revoked_filenames);
        const remaining = rsakey.getKeyPathsForOwner(owner);
        for (const filename of revoked_filenames) {
          expect(remaining).to.not.include(filename);
          expect(fs.existsSync(rsakey.ssh_keys + "/" + filename + ".pub")).to.equal(false);
        }
        expect(remaining).to.include(first_key); // not selected, not deleted
        done();
      }, {});
    });
  }, 10000);

  // Phase 45 D-14 (38 IN-04): a filename named twice in one request is deleted once
  // and reported once.
  it("(04b) should report a key named twice in one revoke only once", function(done) {
    rsakey.create(owner, (success, response) => {
      expect(success).to.equal(true);
      var k = listFilename(response);
      rsakey.revoke(owner, [k, k], function(_res, succ, mess) {
        expect(succ).to.equal(true);
        expect(mess).to.deep.equal([k]);
        expect(rsakey.getKeyPathsForOwner(owner)).to.not.include(k);
        expect(fs.existsSync(rsakey.ssh_keys + "/" + k + ".pub")).to.equal(false);
        expect(rsakey.getKeyPathsForOwner(owner)).to.include(first_key);
        done();
      }, {});
    });
  }, 30000);


  // 34-REVIEW IN-08: keys are named <owner>-<timestamp>; two concurrent
  // create() calls (a double-clicked console button) usually land in the same
  // millisecond and used to share one name, the second key silently replacing
  // the first. Each must get its own name and keep its own key material.
  it("(03b) concurrent creates for one owner never share a key file", function(done) {
    var results = [];
    var finish = function(success, response) {
      expect(success).to.equal(true);
      results.push(response);
      if (results.length < 2) return;
      var names = results.map(listFilename);
      expect(names[0]).to.not.equal(names[1]);
      for (var i = 0; i < 2; i++) {
        expect(fs.readFileSync(rsakey.ssh_keys + "/" + names[i] + ".pub", "utf8")).to.equal(results[i].pubkey);
        expect(fs.existsSync(rsakey.ssh_keys + "/" + names[i])).to.equal(true);
      }
      rsakey.revoke(owner, names, function(_res, succ, mess) {
        expect(succ).to.equal(true);
        expect(mess).to.have.members(names);
        expect(rsakey.getKeyPathsForOwner(owner)).to.include(first_key);
        done();
      }, {});
    };
    rsakey.create(owner, finish);
    rsakey.create(owner, finish);
  }, 30000);

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
    // keyPassphrase() reads through readSecret (D-04), which caches per name.
    const { _resetCacheForTests } = require("../../lib/thinx/secrets");
    const saved = process.env.GIT_KEY_PASSPHRASE;
    delete process.env.GIT_KEY_PASSPHRASE;
    _resetCacheForTests();
    rsakey.generate(owner, new Date().getTime(), (err) => {
      if (typeof saved !== "undefined") process.env.GIT_KEY_PASSPHRASE = saved;
      _resetCacheForTests();
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

  // Phase 45 (KEY-04, D-01): a rename changes the name only. The fingerprint is the
  // OpenSSH SHA256 of the key blob, so it survives the rename, and the private key
  // file is never touched (vault-transit Phase 40 safety).
  it("(14) should rename a key without changing its fingerprint, key material or private file", function (done) {
    rsakey.create(owner, (success, created) => {
      expect(success).to.equal(true);
      const filename = listFilename(created);
      const privatePath = rsakey.ssh_keys + "/" + filename;
      const privateBefore = fs.readFileSync(privatePath);
      const find = (list) => list.find(key => key.filename === filename);
      rsakey.list(owner, (_ok, before) => {
        const original = find(before);
        expect(original.name).to.equal("P45 original");
        expect(original.fingerprint).to.match(/^SHA256:[A-Za-z0-9+/]{43}$/);
        rsakey.rename(owner, filename, "P45 renamed", (renamedOk, renamed) => {
          expect(renamedOk).to.equal(true);
          expect(renamed.filename).to.equal(filename);
          rsakey.list(owner, (_ok2, after) => {
            const entry = find(after);
            expect(entry.name).to.equal("P45 renamed");
            expect(entry.fingerprint).to.equal(original.fingerprint);
            expect(entry.pubkey.split(" ").slice(0, 2)).to.deep.equal(original.pubkey.split(" ").slice(0, 2));
            expect(fs.readFileSync(privatePath).equals(privateBefore)).to.equal(true);
            rsakey.revoke(owner, [filename], (_res, revokedOk, revoked) => {
              expect(revokedOk).to.equal(true);
              expect(revoked).to.deep.equal([filename]);
              done();
            }, {});
          });
        });
      });
    }, "P45 original");
  }, 15000);

  // GitHub's RSA host key, the `ssh-rsa` entry of `ssh_keys` in https://api.github.com/meta
  // (fetched 2026-10-13), and its published `ssh_key_fingerprints.SHA256_RSA`.
  const GITHUB_RSA = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=";

  it("(15) should fingerprint the GitHub RSA host key as GitHub publishes it", function () {
    expect(RSAKey.fingerprint(GITHUB_RSA)).to.equal("SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s");
  });

});
