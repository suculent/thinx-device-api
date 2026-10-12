#!/usr/bin/env node
/**
 * Traefik edge-config mirror generator (dependency-free). EDGE-RECON-01, Phase 29 D-02 / D-03 / D-12.
 *
 * The committed source of truth for the Traefik edge is the private `thinx-swarm` repo
 * (`traefik.yml`). This repository (`thinx-device-api`) keeps a GENERATED, read-only MIRROR of
 * that file so the edge config is visible here without being a second deploy source. The mirror
 * REPLACES the dead `docker-compose.traefik.yml` (the old `traefik:v2.6.1` v1-syntax file that
 * cannot boot and has no `:7442`).
 *
 * This generator reads `<swarm-repo>/traefik.yml` and writes `docker-compose.traefik.yml` as a
 * structurally-faithful copy with two guarantees (D-10 / D-12):
 *   - every inline secret is masked to `<redacted>` (the cleartext `--pilot.token=<UUID>` is the
 *     first such secret; Traefik Pilot is discontinued and the token is inert, but a committed
 *     cleartext credential must never reach this less-private repo);
 *   - every `${VAR}` interpolation is left TEMPLATED, never resolved (`${USERNAME}`,
 *     `${HASHED_PASSWORD}`, `${EMAIL}`, `${DOMAIN}`, `${CONFIG}`).
 *
 * The mirror carries a two-line header (the anti-drift banner, D-03):
 *   line 1  # GENERATED — do not edit. source: thinx-swarm@<40-hex-sha> generated:<ISO-UTC> by scripts/generate-traefik-mirror.js
 *   line 2  # mirror-sha256:<sha256 of the body below the header>
 * `scripts/check-traefik-mirror.js` recomputes the body sha256 and compares it to the recorded
 * banner SHA + `mirror-sha256`, so any hand-edit (MIRROR-EDITED) or staleness (MIRROR-STALE) is
 * caught; CI runs the check as a fail-the-build step.
 *
 * Usage:
 *   node scripts/generate-traefik-mirror.js                       # default swarm repo ($HOME/Repositories/thinx-swarm)
 *   node scripts/generate-traefik-mirror.js --swarm-repo PATH     # another thinx-swarm checkout
 *   const { generate } = require('./scripts/generate-traefik-mirror');
 *
 * Output: `MIRROR-GENERATED ok source=thinx-swarm@<sha> -> <mirror path>` (exit 0),
 * or a `generate-traefik-mirror: <reason>` line on a usage/IO error (exit 2).
 * Only node built-ins are used (fs, path, crypto, child_process for git).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const MIRROR_PATH = path.join(REPO_ROOT, "docker-compose.traefik.yml");
const DEFAULT_SWARM_REPO = path.join(process.env.HOME || "", "Repositories", "thinx-swarm");
const SOURCE_RELATIVE = "traefik.yml";

const GENERATOR = "scripts/generate-traefik-mirror.js";
// Line 1 begins with this exact prefix; check-traefik-mirror.js matches it verbatim (em dash included).
const BANNER_PREFIX = "# GENERATED — do not edit. source: thinx-swarm@";
const SHA256_PREFIX = "# mirror-sha256:";

// RFC4122-style UUID (the cleartext pilot-token value is one); masked wherever it appears.
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const REDACTED = "<redacted>";

/**
 * Masks every inline secret in the source body while leaving `${VAR}` interpolation templated and
 * the rest of the file byte-for-byte intact. Returns the redacted body string.
 *
 * Rules (D-12):
 *   - any RFC4122 UUID → <redacted> (covers the cleartext --pilot.token UUID);
 *   - the value of a secret-bearing flag (--pilot.token=, --*.token=) → <redacted>, UNLESS it is a
 *     ${...} template (which stays templated);
 *   - a resolved basicauth htpasswd value (apr1/bcrypt hash) → <redacted>, UNLESS it is templated.
 */
function redactSecrets(body) {
    let out = String(body);
    // Secret-bearing flag values: mask unless the value is a ${...} template.
    out = out.replace(/(--[A-Za-z0-9_.]*token=)(?!\$\{)(\S+)/g, "$1" + REDACTED);
    // basicauth users: user:HASH — mask a resolved hash, keep ${...} templates.
    out = out.replace(/(basicauth\.users=[^\s:]*:)(?!\$\{)(\$?[^\s]+)/g, "$1" + REDACTED);
    // Catch-all: any remaining RFC4122 UUID is treated as a secret.
    out = out.replace(UUID_RE, REDACTED);
    return out;
}

function sha256(text) {
    return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function resolveSourceSha(swarmRepo) {
    const sha = execFileSync("git", ["-C", swarmRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("source SHA is not a 40-hex commit: " + sha);
    return sha;
}

/**
 * Builds the mirror file content from a source body + source SHA. Pure; no IO.
 * Returns the full file string (two header lines + redacted body).
 */
function buildMirror(sourceBody, sourceSha, nowIso) {
    const body = redactSecrets(sourceBody);
    const line1 = BANNER_PREFIX + sourceSha + " generated:" + nowIso + " by " + GENERATOR;
    const line2 = SHA256_PREFIX + sha256(body);
    return line1 + "\n" + line2 + "\n" + body;
}

/**
 * Reads <swarmRepo>/traefik.yml, resolves the swarm HEAD, and writes the mirror.
 * Returns { mirrorPath, sourceSha, mirrorSha }.
 */
function generate(options) {
    const swarmRepo = path.resolve((options && options.swarmRepo) || DEFAULT_SWARM_REPO);
    const sourcePath = path.join(swarmRepo, SOURCE_RELATIVE);
    const sourceBody = fs.readFileSync(sourcePath, "utf8");
    const sourceSha = resolveSourceSha(swarmRepo);
    const nowIso = (options && options.nowIso) || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const content = buildMirror(sourceBody, sourceSha, nowIso);
    fs.writeFileSync(MIRROR_PATH, content);
    return { mirrorPath: MIRROR_PATH, sourceSha, mirrorSha: sha256(redactSecrets(sourceBody)) };
}

function parseArgs(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        let flag = arg;
        let value;
        const eq = arg.indexOf("=");
        if (arg.startsWith("--") && eq !== -1) {
            flag = arg.slice(0, eq);
            value = arg.slice(eq + 1);
        }
        if (flag !== "--swarm-repo") throw new Error("unknown argument: " + arg);
        if (value === undefined) {
            value = argv[++i];
            if (value === undefined || value.startsWith("--")) throw new Error(flag + " requires a path");
        }
        if (!value) throw new Error(flag + " requires a path");
        options.swarmRepo = value;
    }
    return options;
}

function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error("generate-traefik-mirror: " + error.message);
        console.error("usage: node scripts/generate-traefik-mirror.js [--swarm-repo PATH]");
        return 2;
    }
    let result;
    try {
        result = generate(options);
    } catch (error) {
        console.error("generate-traefik-mirror: " + error.message);
        return 2;
    }
    console.log("MIRROR-GENERATED ok source=thinx-swarm@" + result.sourceSha + " -> " + path.relative(REPO_ROOT, result.mirrorPath));
    return 0;
}

module.exports = { redactSecrets, buildMirror, sha256, generate, parseArgs, MIRROR_PATH, BANNER_PREFIX, SHA256_PREFIX };

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}
