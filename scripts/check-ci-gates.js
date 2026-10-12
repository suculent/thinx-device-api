#!/usr/bin/env node
/**
 * CircleCI gate checker for the parent pipeline. v1.18 Phase 42: CI-04 (Snyk monitors on main
 * only) and CI-05 (legacy console image builds behind the `build_legacy_console` pipeline
 * parameter).
 *
 * The rules live in evaluateJobs(): given the job names a pipeline runs on a branch, it lists
 * every job that must not run there and every job that must.
 *   CI-05  gate closed: no console-classic-registry / console-classic-hub /
 *          snyk-monitor-console-classic on any branch. thinx-staging always needs test,
 *          api-registry and vue-console-registry, plus console-classic-registry with the gate open.
 *   CI-04  no snyk-* job outside main and base. main needs test, api-hub, vue-console-hub,
 *          snyk-code-monitor, snyk-oss-monitor, snyk-monitor-api and snyk-monitor-console-vue,
 *          plus console-classic-hub and snyk-monitor-console-classic with the gate open.
 *
 * Usage:
 *   node scripts/check-ci-gates.js compile
 *       Sends .circleci/config.yml (resolved from this script's directory, never the cwd) to
 *       CircleCI's own compiler (POST https://circleci.com/api/v2/compile-config-with-defaults,
 *       no auth) twice, with options.pipeline_parameters.build_legacy_console false and true.
 *       Each compile must be valid; the workflows must be exactly `main` (false) or `main` plus
 *       `legacy-console` (true). For thinx-staging and main the compiled job selection is checked
 *       with evaluateJobs().
 *   node scripts/check-ci-gates.js pipeline --revision <sha> [--branch thinx-staging]
 *                                           [--expect legacy-off|legacy-on] [--wait] [--timeout-min 30]
 *   node scripts/check-ci-gates.js pipeline --pipeline-id <uuid> [--expect ...] [--wait] [--timeout-min 30]
 *       Reads a real pipeline's job list through the public CircleCI API v2 (unauthenticated GETs,
 *       project gh/suculent/thinx-device-api) and checks it with evaluateJobs(); --expect legacy-on
 *       means the CI-05 gate was open for that pipeline (default legacy-off).
 *       --revision finds the newest push (trigger webhook) pipeline on --branch whose revision
 *       starts with <sha> (at least 7 hex characters), polling every 15 s until it appears.
 *       --pipeline-id addresses one pipeline directly (e.g. the API-triggered Phase 43 bypass);
 *       the branch is the pipeline's own.
 *       --wait keeps polling until every required job has finished and fails each required job
 *       that did not end in `success`. --timeout-min bounds every wait (default 30).
 *   const { selectJobs, evaluateJobs, parseArgs } = require('./scripts/check-ci-gates');
 *
 * Output:
 *   compile   `<false|true>/<branch>: job,job,...` lines, then `CI-GATES COMPILE OK` or
 *             `CI-GATES COMPILE FAIL <n> problems` followed by one line per problem.
 *   pipeline  `pipeline <number> <id> branch=<branch> revision=<sha7>`, one `workflow: job (status)`
 *             line per job, then `CI-GATES PIPELINE OK <number>` or
 *             `CI-GATES PIPELINE FAIL <number> <n> problems` followed by one line per problem.
 *
 * Exit codes: 0 = OK, 1 = gate problems, 2 = usage error, network failure (`CI-GATES NETWORK ...`),
 * timeout (`CI-GATES TIMEOUT ...`), or an API answer of 401/403/404 (`CI-GATES ACCESS ...`: the
 * project is no longer publicly readable; the CircleCI MCP chain list_runs -> list_run_workflows ->
 * list_workflow_jobs gives the same job list).
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
const SNYK_BRANCHES = ["main", "base"];
const MAIN_REQUIRED = ["test", "api-hub", "vue-console-hub", "snyk-code-monitor", "snyk-oss-monitor", "snyk-monitor-api", "snyk-monitor-console-vue"];
const MAIN_LEGACY_REQUIRED = ["console-classic-hub", "snyk-monitor-console-classic"];

// Verified 2026-10-12: GET /api/v2/project/gh/suculent/thinx-device-api returns this slug.
const API_BASE = "https://circleci.com/api/v2";
const PROJECT_SLUG = "gh/suculent/thinx-device-api";
const MAX_PIPELINE_PAGES = 5;
const POLL_MS = 15000;
const NON_TERMINAL = new Set(["running", "queued", "not_running", "blocked", "on_hold"]);

const RETRIES = 3;
const BACKOFF_MS = 5000;

class UsageError extends Error {}
class NetworkError extends Error {}
class AccessError extends Error {}
class HttpError extends Error {}
class GateTimeoutError extends Error {}

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

// The jobs a pipeline on `branch` must run, each with the requirement that demands it.
function requiredJobs(branch, legacy) {
    const required = [];
    // CI-05: trimming CI must never stop production deploys.
    if (branch === "thinx-staging") {
        for (const job of STAGING_REQUIRED) required.push({ job, req: "CI-05" });
        if (legacy) required.push({ job: "console-classic-registry", req: "CI-05" });
    }
    if (branch === "main") {
        for (const job of MAIN_REQUIRED) required.push({ job, req: "CI-04" });
        if (legacy) for (const job of MAIN_LEGACY_REQUIRED) required.push({ job, req: "CI-04" });
    }
    return required;
}

function evaluateJobs(names, options) {
    const { branch, legacy } = options || {};
    const ran = new Set(names);
    const problems = [];

    // CI-05: no legacy console image build while the gate is closed.
    if (!legacy) {
        for (const job of LEGACY_JOBS) {
            if (ran.has(job)) problems.push("CI-05: " + job + " ran on " + branch + " with build_legacy_console closed");
        }
    }
    // CI-04: Snyk monitors run on main only (snyk-monitor-base stays on base); thinx-staging and
    // the thinx-console dev branch run none.
    if (!SNYK_BRANCHES.includes(branch)) {
        for (const job of names) {
            if (String(job).startsWith("snyk-")) problems.push("CI-04: " + job + " ran on " + branch + " (Snyk monitors run on main only)");
        }
    }
    for (const { job, req } of requiredJobs(branch, legacy)) {
        if (!ran.has(job)) problems.push(req + ": required job " + job + " did not run on " + branch);
    }
    return problems;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = [
    "usage: node scripts/check-ci-gates.js compile",
    "       node scripts/check-ci-gates.js pipeline (--revision <sha> [--branch <name>] | --pipeline-id <uuid>)",
    "                                      [--expect legacy-off|legacy-on] [--wait] [--timeout-min <n>]"
].join("\n");

const PIPELINE_VALUE_FLAGS = new Set(["--revision", "--branch", "--pipeline-id", "--expect", "--timeout-min"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ASCII digits, optionally one dot and more ASCII digits. Each dot-separated part is checked on its
// own, so no regex here nests a quantifier (Codacy security/detect-unsafe-regex).
function isPlainDecimal(text) {
    const parts = text.split(".");
    return parts.length <= 2 && parts.every((part) => /^\d+$/.test(part));
}

function parsePipelineArgs(args) {
    const seen = {};
    let wait = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        let flag = arg;
        let value;
        const eq = arg.indexOf("=");
        if (arg.startsWith("--") && eq !== -1) {
            flag = arg.slice(0, eq);
            value = arg.slice(eq + 1);
        }
        if (flag === "--wait" && value === undefined) {
            wait = true;
            continue;
        }
        if (!PIPELINE_VALUE_FLAGS.has(flag)) throw new UsageError("unknown argument: " + arg);
        if (value === undefined) {
            value = args[++i];
            if (value === undefined || value.startsWith("--")) throw new UsageError(flag + " requires a value");
        }
        if (!value) throw new UsageError(flag + " requires a value");
        if (Object.prototype.hasOwnProperty.call(seen, flag)) throw new UsageError(flag + " given twice");
        seen[flag] = value;
    }

    const revision = seen["--revision"];
    const pipelineId = seen["--pipeline-id"];
    if ((revision === undefined) === (pipelineId === undefined)) {
        throw new UsageError("pipeline needs exactly one of --revision or --pipeline-id");
    }
    if (revision !== undefined && !/^[0-9a-f]{7,40}$/i.test(revision)) {
        throw new UsageError("--revision must be 7 to 40 hex characters");
    }
    if (pipelineId !== undefined && !UUID.test(pipelineId)) throw new UsageError("--pipeline-id must be a UUID");
    if (pipelineId !== undefined && seen["--branch"] !== undefined) {
        throw new UsageError("--branch goes with --revision; --pipeline-id uses the pipeline's own branch");
    }
    const branch = seen["--branch"] === undefined ? "thinx-staging" : seen["--branch"];
    if (!/^[A-Za-z0-9._/-]+$/.test(branch)) throw new UsageError("--branch has unexpected characters");
    const expect = seen["--expect"] === undefined ? "legacy-off" : seen["--expect"];
    if (expect !== "legacy-off" && expect !== "legacy-on") throw new UsageError("--expect must be legacy-off or legacy-on");
    const timeoutText = seen["--timeout-min"] === undefined ? "30" : seen["--timeout-min"];
    const timeoutMin = Number(timeoutText);
    if (!isPlainDecimal(timeoutText) || !(timeoutMin > 0)) throw new UsageError("--timeout-min must be a positive number");

    return {
        command: "pipeline",
        revision: revision === undefined ? undefined : revision.toLowerCase(),
        branch: pipelineId === undefined ? branch : undefined,
        pipelineId: pipelineId === undefined ? undefined : pipelineId.toLowerCase(),
        expect,
        wait,
        timeoutMin
    };
}

function parseArgs(argv) {
    const args = Array.from(argv || []);
    const command = args.shift();
    if (command === "compile") {
        if (args.length) throw new UsageError("compile takes no arguments, got " + args[0]);
        return { command };
    }
    if (command === "pipeline") return parsePipelineArgs(args);
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
        if (response.status === 401 || response.status === 403 || response.status === 404) {
            throw new AccessError("HTTP " + response.status + " from " + url);
        }
        if (response.status < 200 || response.status > 299) {
            throw new HttpError("HTTP " + response.status + " from " + url);
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

// ---------------------------------------------------------------------------
// pipeline: a real pipeline's job list (public API, no token)
// ---------------------------------------------------------------------------

function apiGet(pathAndQuery) {
    return requestJson(API_BASE + pathAndQuery, { headers: { Accept: "application/json" } }).then((r) => r.body);
}

async function untilDeadline(deadline, what, attempt) {
    for (;;) {
        const result = await attempt();
        if (result !== undefined) return result;
        if (Date.now() + POLL_MS > deadline) throw new GateTimeoutError(what);
        await sleep(POLL_MS);
    }
}

async function listAll(pathPrefix) {
    const items = [];
    let token;
    do {
        const body = await apiGet(pathPrefix + (token ? "?page-token=" + encodeURIComponent(token) : ""));
        items.push(...asList(body.items));
        token = body.next_page_token;
    } while (token);
    return items;
}

async function findPushPipeline(branch, revision) {
    let token;
    for (let page = 0; page < MAX_PIPELINE_PAGES; page++) {
        const query = "?branch=" + encodeURIComponent(branch) + (token ? "&page-token=" + encodeURIComponent(token) : "");
        const body = await apiGet("/project/" + PROJECT_SLUG + "/pipeline" + query);
        for (const item of asList(body.items)) {
            const itemRevision = String((item.vcs && item.vcs.revision) || "").toLowerCase();
            if (itemRevision.startsWith(revision) && item.trigger && item.trigger.type === "webhook") return item;
        }
        token = body.next_page_token;
        if (!token) break;
    }
    return undefined;
}

async function listJobs(workflows) {
    const jobs = [];
    for (const workflow of workflows) {
        for (const job of await listAll("/workflow/" + workflow.id + "/job")) {
            jobs.push({ workflow: workflow.name, name: job.name, status: job.status });
        }
    }
    return jobs;
}

async function runPipeline(args) {
    const deadline = Date.now() + args.timeoutMin * 60000;
    const legacy = args.expect === "legacy-on";

    let pipeline;
    if (args.pipelineId) {
        pipeline = await apiGet("/pipeline/" + args.pipelineId);
    } else {
        pipeline = await untilDeadline(deadline, "no push pipeline on " + args.branch + " for revision " + args.revision + " within " + args.timeoutMin + " min",
            () => findPushPipeline(args.branch, args.revision));
    }
    const branch = (pipeline.vcs && pipeline.vcs.branch) || args.branch;
    const revision = String((pipeline.vcs && pipeline.vcs.revision) || "").slice(0, 7);
    console.log("pipeline " + pipeline.number + " " + pipeline.id + " branch=" + branch + " revision=" + revision);

    const problems = [];
    if (pipeline.state === "errored") {
        problems.push("pipeline errored (CircleCI could not run the config)");
        for (const error of asList(pipeline.errors)) problems.push("pipeline error: " + ((error && error.message) || JSON.stringify(error)));
    } else {
        const workflows = await untilDeadline(deadline, "pipeline " + pipeline.number + " has no workflow after " + args.timeoutMin + " min", async () => {
            const items = await listAll("/pipeline/" + pipeline.id + "/workflow");
            return items.length ? items : undefined;
        });

        const required = requiredJobs(branch, legacy);
        let jobs = await listJobs(workflows);
        if (args.wait) {
            const pending = (list) => required.filter(({ job }) => list.some((j) => j.name === job && NON_TERMINAL.has(j.status)));
            while (pending(jobs).length) {
                if (Date.now() + POLL_MS > deadline) {
                    throw new GateTimeoutError("pipeline " + pipeline.number + ": " + pending(jobs).map((r) => r.job).join(",") + " still unfinished after " + args.timeoutMin + " min");
                }
                await sleep(POLL_MS);
                jobs = await listJobs(workflows);
            }
        }

        for (const job of jobs) console.log(job.workflow + ": " + job.name + " (" + job.status + ")");
        problems.push(...evaluateJobs(jobs.map((job) => job.name), { branch, legacy }));
        if (args.wait) {
            for (const { job, req } of required) {
                const found = jobs.find((j) => j.name === job);
                if (found && found.status !== "success") problems.push(req + ": required job " + job + " ended " + found.status);
            }
        }
    }

    if (!problems.length) {
        console.log("CI-GATES PIPELINE OK " + pipeline.number);
        return 0;
    }
    console.log("CI-GATES PIPELINE FAIL " + pipeline.number + " " + problems.length + " problems");
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
        if (args.command === "pipeline") return await runPipeline(args);
    } catch (error) {
        if (error instanceof NetworkError) {
            console.log("CI-GATES NETWORK " + error.message);
            return 2;
        }
        if (error instanceof GateTimeoutError) {
            console.log("CI-GATES TIMEOUT " + error.message);
            return 2;
        }
        if (error instanceof AccessError) {
            console.log("CI-GATES ACCESS " + error.message + ": the project " + PROJECT_SLUG + " (or this pipeline) is no longer publicly readable."
                + " The CircleCI MCP chain list_runs -> list_run_workflows -> list_workflow_jobs gives the same job list.");
            return 2;
        }
        if (error instanceof HttpError) {
            console.log("CI-GATES HTTP " + error.message);
            return 2;
        }
        throw error;
    }
    return 2;
}

module.exports = {
    selectJobs,
    evaluateJobs,
    requiredJobs,
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
