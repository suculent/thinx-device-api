// v1.18 Phase 42 (CI-04, CI-05): offline checks of the parent CircleCI gates in .circleci/config.yml
// and of the rules in scripts/check-ci-gates.js. The live compiler run is
// `node scripts/check-ci-gates.js compile`; this spec needs no network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");

const gates = require(path.join(__dirname, "../../scripts/check-ci-gates.js"));
const { selectJobs, evaluateJobs, evaluateCompiled, PARAM, LEGACY_WORKFLOW, LEGACY_JOBS } = gates;

const CONFIG_FILE = path.join(__dirname, "../../.circleci/config.yml");
const config = YAML.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

const BRANCHES = ["thinx-staging", "main", "thinx-console", "base"];
const VALUES = [false, true];
const GATE_WHEN = "<< pipeline.parameters." + PARAM + " >>";

function names(branch, value) {
    return selectJobs(config, branch, { [PARAM]: value }).map((job) => job.name);
}

function workflowEntries() {
    return Object.entries(config.workflows || {}).filter(([, w]) => w && typeof w === "object" && !Array.isArray(w));
}

function jobsOf(workflow) {
    return (workflow.jobs || []).map((entry) => {
        if (typeof entry === "string") return { jobKey: entry, name: entry, cfg: {} };
        const jobKey = Object.keys(entry)[0];
        const cfg = entry[jobKey] || {};
        return { jobKey, name: cfg.name || jobKey, cfg };
    });
}

// What CircleCI's compiler returns: gated-off workflows dropped, `when` resolved, job entries
// keyed by their final name.
function simulateCompile(value) {
    const workflows = { version: 2 };
    for (const [name, workflow] of workflowEntries()) {
        if (workflow.when !== undefined && !(workflow.when === GATE_WHEN && value === true)) continue;
        workflows[name] = {
            jobs: jobsOf(workflow).map((job) => {
                const cfg = Object.assign({}, job.cfg);
                delete cfg.name;
                return { [job.name]: cfg };
            })
        };
    }
    return { valid: true, errors: null, "output-yaml": YAML.stringify({ version: 2, workflows }) };
}

test("build_legacy_console is a boolean pipeline parameter with a boolean default", () => {
    const param = config.parameters && config.parameters[PARAM];
    assert.ok(param, "parameters." + PARAM + " is declared");
    assert.equal(param.type, "boolean");
    // The value is not asserted: Phase 48 (CI-06) flips it in one line and must not need a test edit.
    assert.equal(typeof param.default, "boolean");
});

test("exactly one workflow, legacy-console, is gated on build_legacy_console and holds exactly the legacy jobs", () => {
    const gated = workflowEntries().filter(([, w]) => typeof w.when === "string" && w.when.includes("pipeline.parameters." + PARAM));
    assert.deepEqual(gated.map(([name]) => name), [LEGACY_WORKFLOW]);
    assert.equal(gated[0][1].when, GATE_WHEN);
    assert.deepEqual(jobsOf(gated[0][1]).map((job) => job.name).sort(), LEGACY_JOBS.slice().sort());
});

test("no workflow other than legacy-console builds or monitors the legacy console image", () => {
    for (const [name, workflow] of workflowEntries()) {
        if (name === LEGACY_WORKFLOW) continue;
        for (const job of jobsOf(workflow)) {
            assert.notEqual(job.jobKey, "build-console-classic", name + " contains build-console-classic");
            assert.ok(!job.name.startsWith("console-classic-"), name + " contains " + job.name);
            assert.notEqual(job.name, "snyk-monitor-console-classic", name + " contains snyk-monitor-console-classic");
        }
    }
});

test("thinx-staging with the gate closed runs test, api-registry, vue-console-registry and no legacy job", () => {
    const ran = names("thinx-staging", false);
    for (const job of ["test", "api-registry", "vue-console-registry"]) assert.ok(ran.includes(job), job + " runs");
    assert.deepEqual(ran.filter((job) => job.startsWith("console-classic-")), []);
});

test("thinx-staging with the gate open also runs console-classic-registry", () => {
    const ran = names("thinx-staging", true);
    assert.ok(ran.includes("console-classic-registry"));
    for (const job of ["test", "api-registry", "vue-console-registry"]) assert.ok(ran.includes(job), job + " runs");
});

test("main runs no legacy job with the gate closed, console-classic-hub with it open", () => {
    const closed = names("main", false);
    assert.ok(!closed.includes("console-classic-hub"));
    assert.ok(!closed.includes("snyk-monitor-console-classic"));
    assert.ok(names("main", true).includes("console-classic-hub"));
});

test("with the gate closed no branch runs any legacy job; with it open snyk-monitor-console-classic runs somewhere", () => {
    for (const branch of BRANCHES) {
        const ran = names(branch, false);
        for (const job of LEGACY_JOBS) assert.ok(!ran.includes(job), job + " runs on " + branch + " with the gate closed");
    }
    assert.ok(BRANCHES.some((branch) => names(branch, true).includes("snyk-monitor-console-classic")));
});

test("every requires entry names a job selected in the same workflow on every branch where its dependant runs", () => {
    for (const branch of BRANCHES) {
        for (const value of VALUES) {
            const selected = selectJobs(config, branch, { [PARAM]: value });
            for (const job of selected) {
                for (const needed of job.cfg.requires || []) {
                    const found = selected.some((other) => other.workflow === job.workflow && other.name === needed);
                    assert.ok(found, branch + "/" + value + ": " + job.workflow + "/" + job.name + " requires " + needed + ", which is not selected there");
                }
            }
        }
    }
});

test("evaluateJobs flags a legacy build on thinx-staging with the gate closed", () => {
    const problems = evaluateJobs(["test", "api-registry", "vue-console-registry", "console-classic-registry"], { branch: "thinx-staging", legacy: false });
    assert.ok(problems.some((p) => p.includes("console-classic-registry") && p.includes("CI-05")), problems.join("\n"));
});

test("evaluateJobs requires the production deploy jobs on thinx-staging", () => {
    const problems = evaluateJobs(["test", "vue-console-registry"], { branch: "thinx-staging", legacy: false });
    assert.ok(problems.some((p) => p.includes("api-registry")), problems.join("\n"));
});

test("selectJobs: regex and ignore filters, explicit names, and unsupported when shapes", () => {
    const synthetic = {
        parameters: { flag: { type: "boolean", default: false } },
        workflows: {
            version: 2,
            a: {
                jobs: [
                    "plain",
                    { build: { name: "regex-job", filters: { branches: { only: ["/thinx-.*/"] } } } },
                    { build: { name: "ignored", filters: { branches: { ignore: "thinx-staging" } } } }
                ]
            },
            b: { when: "<< pipeline.parameters.flag >>", jobs: ["gated"] }
        }
    };
    assert.deepEqual(selectJobs(synthetic, "thinx-staging", {}).map((j) => j.name), ["plain", "regex-job"]);
    assert.deepEqual(selectJobs(synthetic, "main", {}).map((j) => j.name), ["plain", "ignored"]);
    assert.deepEqual(selectJobs(synthetic, "main", { flag: true }).map((j) => j.name), ["plain", "ignored", "gated"]);
    synthetic.workflows.b.when = { equal: ["x", "y"] };
    assert.throws(() => selectJobs(synthetic, "main", {}), /unsupported when/);
});

test("compile evaluation: legacy-console appears only in the compile with the parameter true", () => {
    const off = evaluateCompiled(false, simulateCompile(false));
    assert.deepEqual(off.problems, []);
    const on = evaluateCompiled(true, simulateCompile(true));
    assert.deepEqual(on.problems, []);
    // An invalid compile or a gate that leaks into the false compile is a problem.
    assert.ok(evaluateCompiled(false, { valid: false, errors: [{ message: "boom" }] }).problems.some((p) => p.includes("boom")));
    assert.ok(evaluateCompiled(false, simulateCompile(true)).problems.some((p) => p.includes("compiled workflows")));
});

// ---------------------------------------------------------------------------
// CI-04: Snyk monitors on main only, console monitors on the Docker Hub images
// ---------------------------------------------------------------------------

function findJob(name) {
    const found = [];
    for (const [workflowName, workflow] of workflowEntries()) {
        for (const job of jobsOf(workflow)) if (job.name === name) found.push(Object.assign({ workflow: workflowName }, job));
    }
    assert.equal(found.length, 1, name + " is defined exactly once");
    return found[0];
}

test("every snyk-* job except snyk-monitor-base filters main only; snyk-monitor-base stays on base", () => {
    let count = 0;
    for (const [, workflow] of workflowEntries()) {
        for (const job of jobsOf(workflow)) {
            if (!job.name.startsWith("snyk-")) continue;
            count++;
            const only = job.cfg.filters && job.cfg.filters.branches && job.cfg.filters.branches.only;
            if (job.name === "snyk-monitor-base") {
                assert.deepEqual(only, ["base"]);
                assert.deepEqual(job.cfg.requires, ["build-base"]);
            } else {
                assert.deepEqual(only, ["main"], job.name + " filters main only");
            }
        }
    }
    assert.equal(count, 6, "six Snyk monitors stay defined");
});

function assertHubMonitor(name, expected) {
    const job = findJob(name);
    assert.equal(job.workflow, expected.workflow, name + " workflow");
    assert.equal(job.jobKey, "snyk-container-monitor");
    assert.equal(job.cfg.image, "thinxcloud/console");
    assert.equal(job.cfg.tag, expected.tag);
    assert.ok(!Object.prototype.hasOwnProperty.call(job.cfg, "registry"), name + " pulls from docker.io (no registry key)");
    assert.deepEqual(job.cfg.requires, [expected.requires]);
    assert.deepEqual(job.cfg.filters, { branches: { only: ["main"] } });
    assert.ok(job.cfg.context.includes("dockerhub"), name + " keeps dockerhub (SNYK_TOKEN, docker.io login)");
    assert.ok(!job.cfg.context.includes("thinx-docker-repo"), name + " drops thinx-docker-repo");
    assert.equal(job.cfg.dockerfile, expected.dockerfile);
    assert.equal(job.cfg.submodules, true);
}

test("snyk-monitor-console-vue scans thinxcloud/console:vue after vue-console-hub (D-06)", () => {
    assertHubMonitor("snyk-monitor-console-vue", {
        workflow: "main",
        tag: "vue",
        requires: "vue-console-hub",
        dockerfile: "services/console/vue/Dockerfile"
    });
});

test("snyk-monitor-console-classic scans thinxcloud/console:latest after console-classic-hub, inside the gate (D-07)", () => {
    assertHubMonitor("snyk-monitor-console-classic", {
        workflow: LEGACY_WORKFLOW,
        tag: "latest",
        requires: "console-classic-hub",
        dockerfile: "services/console/src/Dockerfile"
    });
});

test("thinx-staging and thinx-console run no snyk-* job with the gate closed or open", () => {
    for (const branch of ["thinx-staging", "thinx-console"]) {
        for (const value of VALUES) {
            assert.deepEqual(names(branch, value).filter((job) => job.startsWith("snyk-")), [], branch + "/" + value);
        }
    }
});

test("main runs every monitor; the gate adds the legacy hub build and its monitor", () => {
    const closed = names("main", false);
    for (const job of ["test", "api-hub", "vue-console-hub", "snyk-code-monitor", "snyk-oss-monitor", "snyk-monitor-api", "snyk-monitor-console-vue"]) {
        assert.ok(closed.includes(job), job + " runs on main");
    }
    const open = names("main", true);
    for (const job of closed) assert.ok(open.includes(job), job + " still runs on main with the gate open");
    assert.ok(open.includes("console-classic-hub"));
    assert.ok(open.includes("snyk-monitor-console-classic"));
    assert.deepEqual(evaluateJobs(closed, { branch: "main", legacy: false }), []);
    assert.deepEqual(evaluateJobs(open, { branch: "main", legacy: true }), []);
});

test("evaluateJobs flags a Snyk job on thinx-staging", () => {
    const problems = evaluateJobs(["test", "api-registry", "vue-console-registry", "snyk-code-monitor"], { branch: "thinx-staging", legacy: false });
    assert.ok(problems.some((p) => p.includes("snyk-code-monitor") && p.includes("CI-04")), problems.join("\n"));
});

test("evaluateJobs requires the main monitors", () => {
    const problems = evaluateJobs(["test", "api-hub", "vue-console-hub", "snyk-code-monitor", "snyk-oss-monitor", "snyk-monitor-api"], { branch: "main", legacy: false });
    assert.ok(problems.some((p) => p.includes("snyk-monitor-console-vue") && p.includes("CI-04")), problems.join("\n"));
});
