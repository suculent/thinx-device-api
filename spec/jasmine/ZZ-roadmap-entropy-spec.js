const path = require('path');
const { execFileSync } = require('child_process');
const { analyze } = require('../../scripts/roadmap-entropy.js');

const SCRIPT = path.resolve(__dirname, '../../scripts/roadmap-entropy.js');
const ROOT = path.resolve(__dirname, '../..');

// A minimal roadmap+requirements sample exercising each drift signal.
const FIXTURE_REQUIREMENTS = `# Requirements: Sample

## Current Requirements

- [x] **REQ-A**: Alpha thing, shipped and mapped.
- [ ] **REQ-B**: Beta thing that is not mapped in the traceability table.
- [ ] **WIDGET-01**: Build the widget export that is out of scope.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Legacy WIDGET export module | Superseded, must not resurface. |

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| REQ-A | Phase 1 | Complete |
`;

const FIXTURE_ROADMAP = `# Roadmap: Sample

## Milestones

- ✅ **v1.0 — First** — Phase 1 (shipped 2026-01-01)
- 🔄 **v1.1 — Second** — Phase 2 (in progress)

## Phases

- [ ] Phase 1: Alpha work — REQ-A
- [ ] **Phase 2: Beta work** — REQ-B

## Phase Details

### Phase 1: Alpha work
**Requirements**: REQ-A

### Phase 2: Beta work
**Requirements**: REQ-B
`;

describe("Roadmap Entropy Detector", function () {

    describe("analyze() on a crafted fixture", function () {
        let report;

        beforeAll(function () {
            report = analyze({
                requirementsText: FIXTURE_REQUIREMENTS,
                roadmapText: FIXTURE_ROADMAP,
            });
        });

        it("returns a valid report structure", function () {
            expect(report).toBeDefined();
            expect(report.summary).toBeDefined();
            expect(Array.isArray(report.findings)).toBeTrue();
            expect(typeof report.summary.entropy_score).toBe('number');
        });

        it("flags a requirement with no mapped phase (traceability drift)", function () {
            const unmapped = report.findings.filter(f =>
                f.category === 'traceability-drift' && /no mapped phase/.test(f.message));
            const ids = unmapped.map(f => f.detail);
            expect(ids).toContain('REQ-B');
        });

        it("flags an out-of-scope feature resurfacing as an active requirement", function () {
            const leak = report.findings.filter(f =>
                f.category === 'scope-creep' && f.detail === 'WIDGET-01');
            expect(leak.length).toBeGreaterThan(0);
        });

        it("flags a stale unchecked item under a shipped milestone", function () {
            const stale = report.findings.filter(f =>
                f.category === 'staleness' && /Phase 1/.test(f.message) && /shipped/.test(f.message));
            expect(stale.length).toBe(1);
        });

        it("accumulates a positive entropy score with weighted severities", function () {
            expect(report.summary.entropy_score).toBeGreaterThan(0);
            const weighted =
                report.summary.by_severity.high * 3 +
                report.summary.by_severity.medium * 2 +
                report.summary.by_severity.low * 1;
            expect(report.summary.entropy_score).toBe(weighted);
        });

        it("does not flag a deferred requirement as unmapped", function () {
            // WIDGET-01 is unchecked+active so it IS flagged; a deferred item is not.
            const deferredReport = analyze({
                requirementsText: FIXTURE_REQUIREMENTS + '\n- **REQ-FUTURE-01 (deferred)**: later.\n',
                roadmapText: FIXTURE_ROADMAP,
            });
            const flagged = deferredReport.findings.some(f => f.detail === 'REQ-FUTURE-01');
            expect(flagged).toBeFalse();
        });
    });

    describe("CLI against the real .planning/ artifacts", function () {
        it("produces a JSON report without crashing", function () {
            const out = execFileSync(process.execPath, [SCRIPT, '--json'], {
                cwd: ROOT, encoding: 'utf8'
            });
            const report = JSON.parse(out);
            expect(report.summary).toBeDefined();
            expect(report.summary.requirements).toBeGreaterThanOrEqual(0);
        });

        it("exits 0 with no threshold set", function () {
            expect(() => {
                execFileSync(process.execPath, [SCRIPT, '--json'], { cwd: ROOT, encoding: 'utf8' });
            }).not.toThrow();
        });

        it("exits non-zero when entropy exceeds an explicit threshold", function () {
            let threw = false;
            try {
                // Threshold -1 is always exceeded by a non-negative score.
                execFileSync(process.execPath, [SCRIPT, '--json', '--threshold=-1'], {
                    cwd: ROOT, encoding: 'utf8'
                });
            } catch (e) {
                threw = true;
                expect(e.status).toBeGreaterThan(0);
            }
            expect(threw).toBeTrue();
        });
    });
});
