#!/usr/bin/env node
/**
 * CircleCI gate checker for the parent pipeline. v1.18 Phase 42: CI-04 (Snyk monitors on main
 * only) and CI-05 (legacy console image builds behind the `build_legacy_console` pipeline
 * parameter).
 *
 * The rules live in evaluateJobs(): given the job names a pipeline runs on a branch, it lists
 * every job that must not run there and every job that must.
 *
 * Usage:
 *   node scripts/check-ci-gates.js compile
 *       Sends .circleci/config.yml (resolved from this script's directory, never the cwd) to
 *       CircleCI's own compiler (POST https://circleci.com/api/v2/compile-config-with-defaults,
 *       no auth) twice, with options.pipeline_parameters.build_legacy_console false and true.
 *       Each compile must be valid; the workflows must be exactly `main` (false) or `main` plus
 *       `legacy-console` (true). For thinx-staging and main the compiled job selection is checked
 *       with evaluateJobs().
 *   const { selectJobs, evaluateJobs, parseArgs } = require('./scripts/check-ci-gates');
 *
 * Output:
 *   compile   `<false|true>/<branch>: job,job,...` lines, then `CI-GATES COMPILE OK` or
 *             `CI-GATES COMPILE FAIL <n> problems` followed by one line per problem.
 *
 * Exit codes: 0 = OK, 1 = gate problems, 2 = usage error, network failure (`CI-GATES NETWORK ...`)
 * or timeout.
 *
 * Only node built-ins and the declared dependency `yaml` are used. No token is read or sent.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(REPO_ROOT, ".circleci", "config.yml");
const COMPILE_URL = "https://circleci.com/api/v2/compile-config-with-defaults";

const PARAM = "build_legacy_console";
const LEGACY_WORKFLOW = "legacy-console";
const LEGACY_JOBS = ["console-classic-registry", "console-classic-hub", "snyk-monitor-console-classic"];
const STAGING_REQUIRED = ["test", "api-registry", "vue-console-registry"];
const COMPILE_BRANCHES = ["thinx-staging", "main"];

const RETRIES = 3;
const BACKOFF_MS = 5000;

class UsageError extends Error {}
class NetworkError extends Error {}

// ---------------------------------------------------------------------------
// Job selection
// ---------------------------------------------------------------------------

function parameterValue(config, params, name, workflowName) {
    if (params && Object.prototype.hasOwnProperty.call(params, name)) return params[name];
    const declared = config && config.parameters && config.parameters[name];
    if (declared && Object.prototype.hasOwnProperty.call(declared, "default")) return declared.default;
    throw new Error("workflow " + workflowName + ": when names undeclared pipeline parameter " + name);
}

// true when the workflow runs. Only the shapes this config uses are understood; anything richer
// throws so a new condition fails loudly instead of being guessed.
function workflowEnabled(config, workflowName, workflow, params) {
    if (!Object.prototype.hasOwnProperty.call(workflow, "when")) return true;
    const when = workflow.when;
    if (when === true) return true;
    if (when === false) return false;
    if (typeof when === "string") {
        const match = /^<<\s*pipeline\.parameters\.([A-Za-z_][A-Za-z0-9_-]*)\s*>>$/.exec(when.trim());
        if (match) return parameterValue(config, params, match[1], workflowName) === true;
    }
    throw new Error("workflow " + workflowName + ": unsupported when " + JSON.stringify(when));
}

function asList(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

// CircleCI branch filters: plain names match exactly, /.../ entries are regexes that must match
// the whole branch name.
function patternMatches(pattern, branch) {
    const text = String(pattern);
    if (text.length >= 2 && text.startsWith("/") && text.endsWith("/")) {
        return new RegExp("^(?:" + text.slice(1, -1) + ")$").test(branch);
    }
    return text === branch;
}

function runsOnBranch(cfg, branch) {
    const branches = cfg && cfg.filters && cfg.filters.branches;
    if (!branches) return true;
    if (branches.only !== undefined && !asList(branches.only).some((p) => patternMatches(p, branch))) return false;
    if (asList(branches.ignore).some((p) => patternMatches(p, branch))) return false;
    return true;
}

function jobEntry(entry, workflowName) {
    if (typeof entry === "string") return { jobKey: entry, name: entry, cfg: {} };
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const keys = Object.keys(entry);
        if (keys.length !== 1) throw new Error("workflow " + workflowName + ": job entry with keys " + keys.join(","));
        const jobKey = keys[0];
        const cfg = entry[jobKey] || {};
        return { jobKey, name: cfg.name || jobKey, cfg };
    }
    throw new Error("workflow " + workflowName + ": unreadable job entry " + JSON.stringify(entry));
}

// Every job of every enabled workflow that runs on `branch`. Non-object entries of
// `config.workflows` (the compiled output carries `version`) are skipped.
function selectJobs(config, branch, params) {
    const selected = [];
    const workflows = (config && config.workflows) || {};
    for (const [workflowName, workflow] of Object.entries(workflows)) {
        if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) continue;
        if (!workflowEnabled(config, workflowName, workflow, params || {})) continue;
        for (const entry of asList(workflow.jobs)) {
            const job = jobEntry(entry, workflowName);
            if (runsOnBranch(job.cfg, branch)) selected.push({ workflow: workflowName, name: job.name, jobKey: job.jobKey, cfg: job.cfg });
        }
    }
    return selected;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function evaluateJobs(names, options) {
    const { branch, legacy } = options || {};
    const ran = new Set(names);
    const problems = [];
    const need = (job, why) => {
        if (!ran.has(job)) problems.push(why + ": required job " + job + " did not run on " + branch);
    };

    // CI-05: no legacy console image build while the gate is closed.
    if (!legacy) {
        for (const job of LEGACY_JOBS) {
            if (ran.has(job)) problems.push("CI-05: " + job + " ran on " + branch + " with build_legacy_console closed");
        }
    }
    // CI-05: trimming CI must never stop production deploys.
    if (branch === "thinx-staging") {
        for (const job of STAGING_REQUIRED) need(job, "CI-05");
        if (legacy) need("console-classic-registry", "CI-05");
    }
    return problems;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = "usage: node scripts/check-ci-gates.js compile";

function parseArgs(argv) {
    const args = Array.from(argv || []);
    const command = args.shift();
    if (command === "compile") {
        if (args.length) throw new UsageError("compile takes no arguments, got " + args[0]);
        return { command };
    }
    if (command === undefined) throw new UsageError("missing subcommand");
    throw new UsageError("unknown subcommand: " + command);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, init) {
    let lastError;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
        if (attempt > 0) await sleep(BACKOFF_MS);
        let response;
        try {
            response = await fetch(url, init);
        } catch (error) {
            lastError = (error && error.cause && error.cause.message) || error.message;
            continue;
        }
        if (response.status >= 500 || response.status === 429) {
            lastError = "HTTP " + response.status + " from " + url;
            continue;
        }
        const text = await response.text();
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            lastError = "non-JSON response (HTTP " + response.status + ") from " + url;
            continue;
        }
        return { status: response.status, body };
    }
    throw new NetworkError(lastError || "request failed: " + url);
}

function workflowNames(config) {
    return Object.entries((config && config.workflows) || {})
        .filter(([, w]) => w && typeof w === "object" && !Array.isArray(w))
        .map(([name]) => name)
        .sort();
}

// Offline half of `compile`: judge one compiler response for one parameter value.
function evaluateCompiled(value, response) {
    const label = String(value);
    const lines = [];
    const problems = [];
    if (!response || response.valid !== true) problems.push(label + ": CircleCI reports the config invalid");
    for (const error of asList(response && response.errors)) {
        problems.push(label + ": compile error: " + ((error && error.message) || JSON.stringify(error)));
    }
    if (problems.length) return { lines, problems };

    const compiled = YAML.parse(response["output-yaml"] || "");
    const expected = value ? ["main", LEGACY_WORKFLOW] : ["main"];
    const actual = workflowNames(compiled);
    if (JSON.stringify(actual) !== JSON.stringify(expected.slice().sort())) {
        problems.push("CI-05: " + label + ": compiled workflows are [" + actual.join(",") + "], expected [" + expected.join(",") + "]");
    }
    for (const branch of COMPILE_BRANCHES) {
        const names = selectJobs(compiled, branch, { [PARAM]: value }).map((job) => job.name);
        lines.push(label + "/" + branch + ": " + names.join(","));
        for (const problem of evaluateJobs(names, { branch, legacy: value })) problems.push(label + "/" + branch + ": " + problem);
    }
    return { lines, problems };
}

async function runCompile() {
    const configYaml = fs.readFileSync(CONFIG_PATH, "utf8");
    const lines = [];
    const problems = [];
    for (const value of [false, true]) {
        const { body } = await requestJson(COMPILE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ config_yaml: configYaml, settings: {}, options: { pipeline_parameters: { [PARAM]: value } } })
        });
        const result = evaluateCompiled(value, body);
        lines.push(...result.lines);
        problems.push(...result.problems);
    }
    for (const line of lines) console.log(line);
    if (!problems.length) {
        console.log("CI-GATES COMPILE OK");
        return 0;
    }
    console.log("CI-GATES COMPILE FAIL " + problems.length + " problems");
    for (const problem of problems) console.log(problem);
    return 1;
}

async function main(argv) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (error) {
        console.error("check-ci-gates: " + error.message);
        console.error(USAGE);
        return 2;
    }
    try {
        if (args.command === "compile") return await runCompile();
    } catch (error) {
        if (error instanceof NetworkError) {
            console.log("CI-GATES NETWORK " + error.message);
            return 2;
        }
        throw error;
    }
    return 2;
}

module.exports = {
    selectJobs,
    evaluateJobs,
    evaluateCompiled,
    parseArgs,
    runsOnBranch,
    UsageError,
    CONFIG_PATH,
    PARAM,
    LEGACY_WORKFLOW,
    LEGACY_JOBS
};

if (require.main === module) {
    main(process.argv.slice(2)).then(
        (code) => {
            process.exitCode = code;
        },
        (error) => {
            console.error("check-ci-gates: " + ((error && error.stack) || error));
            process.exitCode = 2;
        }
    );
}
