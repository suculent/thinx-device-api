// Static retirement gate (Phase 41, KEYMIG-02, RESEARCH Open Question 3).
//
// The deploy-key passphrase and the askpass read path are gone from the code,
// the Dockerfiles and the root compose files, and this spec keeps them gone: it
// runs in every CI jasmine run (spec/support/jasmine.json picks it up) and fails
// on any occurrence, naming the file and line number only.
//
// It walks the tree with fs from the repo root and needs no .git, because the
// CI test image has none. In that image CircleCI has already moved
// Dockerfile.test over Dockerfile and docker-compose.test.yml over
// docker-compose.yml, so Dockerfile.test may be absent there; Dockerfile and at
// least one root compose file must exist. Negative assertions under spec/ and
// history under .planning/ are allowed and not scanned. Plan 41-05 adds
// docker-swarm.yml to the file set.

const fs = require("fs");
const path = require("path");
const expect = require("chai").expect;

const ROOT = path.resolve(__dirname, "../..");

// The one token list (this file is under spec/, which the gate does not scan).
const RETIRED = {
    // In lib/ and scripts/ .js files, the Dockerfiles and the root compose files.
    everywhere: [
        "GIT_KEY_PASSPHRASE",
        "create_askfile",
        "delete_askfile",
        "keyPassphrase",
        "sshEnv(",
        "thinx-askpass-",
        "Git.SSH_COMMAND",
        "static get SSH_COMMAND"
    ],
    // In scripts/migrate-deploy-keys.js only: the retired legacy conversion.
    migration: [
        "createPrivateKey",
        "ssh-keygen",
        "historic_literal"
    ]
};

const MIGRATION_SCRIPT = "scripts/migrate-deploy-keys.js";
const COMPOSE_NAME = /^docker-compose.*\.ya?ml$/;

// Every .js file under dir (repo-relative), skipping node_modules and symlinks.
function jsFiles(rel) {
    const out = [];
    const pending = [rel];
    while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(path.join(ROOT, current), { withFileTypes: true })) {
            const child = path.join(current, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (entry.name !== "node_modules") pending.push(child);
            } else if (entry.isFile() && entry.name.endsWith(".js")) {
                out.push(child);
            }
        }
    }
    return out.sort();
}

function fileSet() {
    const files = jsFiles("lib").concat(jsFiles("scripts"));
    files.push("Dockerfile");
    if (fs.existsSync(path.join(ROOT, "Dockerfile.test"))) files.push("Dockerfile.test");
    const compose = fs.readdirSync(ROOT).filter((name) => COMPOSE_NAME.test(name)).sort();
    return { files: files.concat(compose), compose };
}

// "file:line token" for every line of `rel` that holds one of `tokens`.
function hits(rel, tokens) {
    const found = [];
    const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
        for (const token of tokens) {
            if (line.includes(token)) found.push(rel + ":" + (i + 1) + " " + token);
        }
    });
    return found;
}

describe("Passphrase retirement gate (KEYMIG-02)", function () {

    it("scans lib/ and scripts/ .js files, Dockerfile and at least one root compose file", function () {
        const set = fileSet();
        expect(set.files.filter((f) => f.startsWith("lib" + path.sep)).length).to.be.above(10);
        expect(set.files).to.include(MIGRATION_SCRIPT.split("/").join(path.sep));
        expect(set.compose.length).to.be.at.least(1);
        for (const rel of set.files) expect(fs.statSync(path.join(ROOT, rel)).isFile(), rel).to.equal(true);
    });

    it("finds no passphrase variable, askpass helper or askpass SSH command anywhere in the file set", function () {
        const found = [];
        for (const rel of fileSet().files) found.push(...hits(rel, RETIRED.everywhere));
        expect(found, "retired tokens (file:line token)").to.deep.equal([]);
    });

    it("finds no legacy conversion in the migration script", function () {
        expect(hits(MIGRATION_SCRIPT, RETIRED.migration), "retired tokens (file:line token)").to.deep.equal([]);
    });

    it("still finds the D-09 legacy skip in git.js, so the gate cannot pass on an empty tree", function () {
        expect(fs.readFileSync(path.join(ROOT, "lib/thinx/git.js"), "utf8")).to.include("legacy_format_unsupported");
    });
});
