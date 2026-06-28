'use strict';

/**
 * spec/jasmine/FinderSpec.js
 *
 * Behavior-locking spec for lib/thinx/finder.js.
 * Self-contained: uses only Node core (os, fs, path) + chai.
 * No Redis, no network, no Messenger. Uses a temp-dir fixture tree.
 *
 * Fixture layout created in beforeAll:
 *   root/
 *     alpha.ino
 *     bravo.zip
 *     thinx.yml
 *     environment.json
 *     environment.h
 *     sub/
 *       deep.ino
 *       deeper/
 *         deepest.ino          (two levels below root/sub — exercises manual walk depth)
 *         .git/                (hidden dir — found by findDirsSync with includeDotfiles=true)
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;

const { findFilesSync, findDirsSync } = require('../../lib/thinx/finder');

describe("Finder", function () {

  let tmpRoot;

  beforeAll(function () {
    console.log('🚸 [chai] >>> running Finder spec');

    // Create a fresh temp directory for this spec run.
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thinx-finder-spec-'));

    // Build fixture tree.
    // root-level files
    fs.writeFileSync(path.join(tmpRoot, 'alpha.ino'), '// alpha sketch');
    fs.writeFileSync(path.join(tmpRoot, 'bravo.zip'), 'PK');
    fs.writeFileSync(path.join(tmpRoot, 'thinx.yml'), 'version: 1');
    fs.writeFileSync(path.join(tmpRoot, 'environment.json'), '{}');
    fs.writeFileSync(path.join(tmpRoot, 'environment.h'), '#pragma once');

    // sub/
    fs.mkdirSync(path.join(tmpRoot, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'sub', 'deep.ino'), '// deep sketch');

    // sub/deeper/  (two levels below root, one below sub)
    fs.mkdirSync(path.join(tmpRoot, 'sub', 'deeper'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'sub', 'deeper', 'deepest.ino'), '// deepest sketch');

    // sub/deeper/.git/  (hidden directory — for dotfile test cases)
    fs.mkdirSync(path.join(tmpRoot, 'sub', 'deeper', '.git'), { recursive: true });
  });

  afterAll(function () {
    console.log('🚸 [chai] <<< completed Finder spec');
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // Case 1: non-recursive *.ino — only root-level alpha.ino returned
  it("should find *.ino files non-recursively (root only)", function () {
    const result = findFilesSync(tmpRoot, '*.ino', false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.equal(path.join(tmpRoot, 'alpha.ino'));
  });

  // Case 2: recursive *.ino — alpha.ino + sub/deep.ino + sub/deeper/deepest.ino
  it("should find *.ino files recursively including sub/deeper/deepest.ino", function () {
    const result = findFilesSync(tmpRoot, '*.ino', true);
    expect(result).to.be.an('array');
    expect(result).to.deep.include(path.join(tmpRoot, 'alpha.ino'));
    expect(result).to.deep.include(path.join(tmpRoot, 'sub', 'deep.ino'));
    expect(result).to.deep.include(path.join(tmpRoot, 'sub', 'deeper', 'deepest.ino'));
  });

  // Case 3: non-recursive *.zip — bravo.zip
  it("should find *.zip files non-recursively", function () {
    const result = findFilesSync(tmpRoot, '*.zip', false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.equal(path.join(tmpRoot, 'bravo.zip'));
  });

  // Case 4: exact name thinx.yml
  it("should find thinx.yml by exact name non-recursively", function () {
    const result = findFilesSync(tmpRoot, 'thinx.yml', false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.equal(path.join(tmpRoot, 'thinx.yml'));
  });

  // Case 5: exact name environment.json
  it("should find environment.json by exact name non-recursively", function () {
    const result = findFilesSync(tmpRoot, 'environment.json', false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.equal(path.join(tmpRoot, 'environment.json'));
  });

  // Case 6: exact name environment.h
  it("should find environment.h by exact name non-recursively", function () {
    const result = findFilesSync(tmpRoot, 'environment.h', false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.equal(path.join(tmpRoot, 'environment.h'));
  });

  // Case 7: recursive findDirsSync for .git with includeDotfiles=true
  it("should find .git directory recursively when includeDotfiles=true", function () {
    const result = findDirsSync(tmpRoot, '.git', true, true);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.equal(path.join(tmpRoot, 'sub', 'deeper', '.git'));
  });

  // Case 8: recursive findDirsSync for .git with includeDotfiles=false — returns []
  it("should NOT find .git directory when includeDotfiles=false", function () {
    const result = findDirsSync(tmpRoot, '.git', true, false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(0);
  });

  // Case 9: non-existent root returns [] without throwing
  it("should return [] for a non-existent root without throwing", function () {
    const result = findFilesSync('/nonexistent/path', '*.ino', false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(0);
  });

  // Case 10: no match returns []
  it("should return [] when no files match the mask", function () {
    const result = findFilesSync(tmpRoot, '*.nomatch', false);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(0);
  });

  // Case 11: multi-level depth assertion — recursive *.ino must return exactly 3
  it("should return exactly 3 *.ino files recursively (multi-level walk depth)", function () {
    const result = findFilesSync(tmpRoot, '*.ino', true);
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(3);
    // All returned paths must be absolute
    for (const p of result) {
      expect(p).to.match(/^\//);
    }
  });

});
