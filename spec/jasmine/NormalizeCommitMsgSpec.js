const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/normalize-commit-msg.js');

function runNormalizer(msgContent, source) {
  const tmpFile = path.join(os.tmpdir(), `commit-msg-test-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, msgContent, 'utf8');
  try {
    const args = [SCRIPT, tmpFile];
    if (source) args.push(source);
    execFileSync(process.execPath, args, { encoding: 'utf8' });
    return fs.readFileSync(tmpFile, 'utf8');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

describe("Commit Message Normalizer", function () {

  it("should leave an already-conventional message unchanged", function () {
    const result = runNormalizer("fix: correct login bug\n");
    expect(result).toBe("fix: correct login bug\n");
  });

  it("should lowercase the type in a conventional message", function () {
    const result = runNormalizer("FIX: correct login bug\n");
    expect(result).toBe("fix: correct login bug\n");
  });

  it("should preserve scope in conventional messages", function () {
    const result = runNormalizer("feat(auth): add OAuth support\n");
    expect(result).toBe("feat(auth): add OAuth support\n");
  });

  it("should normalize free-form 'Fix ...' to fix type", function () {
    const result = runNormalizer("Fix broken login\n");
    expect(result.startsWith("fix: ")).toBe(true);
  });

  it("should normalize free-form 'Add ...' to feat type", function () {
    const result = runNormalizer("Add new user endpoint\n");
    expect(result.startsWith("feat: ")).toBe(true);
  });

  it("should normalize free-form 'Update ...' to chore type", function () {
    const result = runNormalizer("Update dependencies\n");
    expect(result.startsWith("chore: ")).toBe(true);
  });

  it("should normalize free-form 'Docs ...' to docs type", function () {
    const result = runNormalizer("Docs update README\n");
    expect(result.startsWith("docs: ")).toBe(true);
  });

  it("should normalize unrecognized message to chore type", function () {
    const result = runNormalizer("some unrecognized commit message\n");
    expect(result.startsWith("chore: ")).toBe(true);
  });

  it("should preserve comment lines in commit message file", function () {
    const msg = "Fix the bug\n\n# Please enter the commit message\n# Changes:\n#   file.js\n";
    const result = runNormalizer(msg);
    expect(result).toContain("# Please enter the commit message");
    expect(result.split('\n')[0]).toMatch(/^fix:/);
  });

  it("should skip normalization for merge commits", function () {
    const msg = "Merge branch 'main' into feature/foo\n";
    const result = runNormalizer(msg);
    expect(result).toBe(msg);
  });

  it("should skip normalization when source is 'merge'", function () {
    const msg = "Fix something\n";
    // With source='merge', script should exit without modifying
    const tmpFile = path.join(os.tmpdir(), `commit-msg-test-merge-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, msg, 'utf8');
    try {
      execFileSync(process.execPath, [SCRIPT, tmpFile, 'merge'], { encoding: 'utf8' });
      const result = fs.readFileSync(tmpFile, 'utf8');
      expect(result).toBe(msg);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it("should handle the audit type", function () {
    const result = runNormalizer("audit: check security\n");
    expect(result).toBe("audit: check security\n");
  });

  it("should handle breaking change marker", function () {
    const result = runNormalizer("feat!: remove deprecated API\n");
    expect(result).toBe("feat!: remove deprecated API\n");
  });
});
