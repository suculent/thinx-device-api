#!/usr/bin/env node
/**
 * Traefik edge-config mirror staleness + integrity check (dependency-free). EDGE-RECON-01, Phase 29 D-03.
 *
 * The committed `docker-compose.traefik.yml` is a GENERATED, read-only MIRROR of the Traefik edge
 * config whose committed source of truth is `thinx-swarm/traefik.yml` (produced by
 * scripts/generate-traefik-mirror.js). This check is the anti-drift enforcement: it proves the
 * mirror was not hand-edited and — when a thinx-swarm checkout is available — that it is current
 * with that repo's HEAD. The whole reason Phase 29 exists is to kill edge-config drift, so the
 * second copy is enforced, not discipline-only.
 *
 * The CANONICAL inputs are the mirror's own two-line banner:
 *   line 1  # GENERATED — do not edit. source: thinx-swarm@<40-hex-sha> generated:<ISO-UTC> by scripts/generate-traefik-mirror.js
 *   line 2  # mirror-sha256:<sha256 of the body below the header>
 *
 * Default / CI mode (no thinx-swarm checkout needed — the private repo is not cloned in CI):
 *   - the mirror file exists                                  (else MISSING)
 *   - line 1 is the GENERATED banner with a 40-hex source SHA (else MISSING)
 *   - line 2 is a `mirror-sha256:<64-hex>` line               (else MISSING)
 *   - sha256(body below the header) equals the recorded hash  (else MIRROR-EDITED)
 *
 * Freshness mode (--swarm-repo PATH or $THINX_SWARM_REPO; used by the local npm target, not CI):
 *   - additionally `git -C PATH rev-parse HEAD` must equal the banner's source SHA (else MIRROR-STALE).
 *
 * Usage:
 *   node scripts/check-traefik-mirror.js                       # default / CI mode (integrity only)
 *   node scripts/check-traefik-mirror.js --swarm-repo PATH     # also check freshness vs thinx-swarm HEAD
 *   THINX_SWARM_REPO=PATH node scripts/check-traefik-mirror.js # freshness via env
 *   const { checkFiles } = require('./scripts/check-traefik-mirror');
 *
 * Output: one line per problem, then `MIRROR OK files=1` (exit 0) or
 * `MIRROR FAIL files=1 problems=M reason=<token>` (exit 1). Exit 2 on a usage error.
 * Problem tokens: MISSING, MIRROR-EDITED, MIRROR-STALE. Only node built-ins are used
 * (fs, path, crypto, child_process for git).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const MIRROR_PATH = path.join(REPO_ROOT, "docker-compose.traefik.yml");

const BANNER_PREFIX = "# GENERATED — do not edit. source: thinx-swarm@";
const SHA256_PREFIX = "# mirror-sha256:";
// line 1: banner prefix + 40-hex SHA + " generated:..." tail
const BANNER_RE = /^# GENERATED — do not edit\. source: thinx-swarm@([0-9a-f]{40})\b/;
const SHA256_RE = /^# mirror-sha256:([0-9a-f]{64})$/;

function sha256(text) {
    return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Splits mirror text into { line1, line2, body } using the first two newlines. body is everything
 * after the second newline (hashed exactly as generate-traefik-mirror.js wrote it).
 */
function splitMirror(text) {
    const first = text.indexOf("\n");
    if (first === -1) return { line1: text, line2: "", body: "" };
    const second = text.indexOf("\n", first + 1);
    if (second === -1) return { line1: text.slice(0, first), line2: text.slice(first + 1), body: "" };
    return { line1: text.slice(0, first), line2: text.slice(first + 1, second), body: text.slice(second + 1) };
}

function resolveSwarmHead(swarmRepo) {
    const sha = execFileSync("git", ["-C", swarmRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    return sha;
}

/**
 * Pure check of the mirror. Returns { ok, files, problems: [{ token, detail }] }.
 * @param {string} mirrorPath absolute path to the mirror
 * @param {string|null} swarmRepo absolute path to a thinx-swarm checkout, or null for integrity-only
 */
function checkFiles(mirrorPath, swarmRepo) {
    const problems = [];
    let text;
    try {
        text = fs.readFileSync(mirrorPath, "utf8");
    } catch (_error) {
        problems.push({ token: "MISSING", detail: "mirror not found: " + display(mirrorPath) });
        return { ok: false, files: 1, problems };
    }

    const { line1, line2, body } = splitMirror(text);
    const bannerMatch = BANNER_RE.exec(line1);
    const shaMatch = SHA256_RE.exec(line2);

    if (!bannerMatch) {
        problems.push({ token: "MISSING", detail: "line 1 is not the '" + BANNER_PREFIX + "<40-hex>' banner" });
    }
    if (!shaMatch) {
        problems.push({ token: "MISSING", detail: "line 2 is not a '" + SHA256_PREFIX + "<64-hex>' line" });
    }
    // Integrity: recompute the body hash and compare to the recorded one.
    if (shaMatch) {
        const recorded = shaMatch[1];
        const actual = sha256(body);
        if (actual !== recorded) {
            problems.push({ token: "MIRROR-EDITED", detail: "body sha256 " + actual + " != recorded " + recorded });
        }
    }
    // Freshness: compare the banner SHA to the live thinx-swarm HEAD.
    if (bannerMatch && swarmRepo) {
        const bannerSha = bannerMatch[1];
        let headSha;
        try {
            headSha = resolveSwarmHead(swarmRepo);
        } catch (error) {
            problems.push({ token: "MIRROR-STALE", detail: "cannot read thinx-swarm HEAD at " + swarmRepo + ": " + error.message });
            headSha = null;
        }
        if (headSha && headSha !== bannerSha) {
            problems.push({ token: "MIRROR-STALE", detail: "banner source " + bannerSha + " != thinx-swarm HEAD " + headSha });
        }
    }

    return { ok: problems.length === 0, files: 1, problems };
}

function display(file) {
    const relative = path.relative(REPO_ROOT, file);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}

function parseArgs(argv) {
    const options = { swarmRepo: process.env.THINX_SWARM_REPO || null };
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
    if (options.swarmRepo) options.swarmRepo = path.resolve(options.swarmRepo);
    return options;
}

function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error("check-traefik-mirror: " + error.message);
        console.error("usage: node scripts/check-traefik-mirror.js [--swarm-repo PATH]");
        return 2;
    }
    const report = checkFiles(MIRROR_PATH, options.swarmRepo);
    for (const problem of report.problems) {
        console.log(problem.token + " " + display(MIRROR_PATH) + " " + problem.detail);
    }
    if (report.ok) {
        console.log("MIRROR OK files=" + report.files);
        return 0;
    }
    console.log("MIRROR FAIL files=" + report.files + " problems=" + report.problems.length + " reason=" + report.problems[0].token);
    return 1;
}

module.exports = { checkFiles, splitMirror, sha256, parseArgs, MIRROR_PATH, BANNER_PREFIX, SHA256_PREFIX };

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}
