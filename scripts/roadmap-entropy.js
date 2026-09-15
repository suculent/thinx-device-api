#!/usr/bin/env node
/**
 * Roadmap Entropy Detector
 *
 * Statically analyzes the GSD planning artifacts under .planning/ to detect
 * roadmap scope creep and drift:
 *   - Traceability drift   — requirements with no mapped phase; phases citing
 *                            requirement IDs that don't exist in REQUIREMENTS.md
 *   - Coverage drift       — traceability REQ→Phase entries that disagree with
 *                            the phases actually declared in ROADMAP.md
 *   - Scope creep          — requirement IDs / phases missing from the
 *                            traceability table; "Out of Scope" features
 *                            re-surfacing as active (unchecked) requirements
 *   - Staleness            — unchecked items under ✅ shipped milestones;
 *                            all-checked items under a 🔄 in-progress milestone
 *
 * Each finding carries a category, severity and human-readable message. An
 * aggregate "entropy score" is the sum of severity weights; --threshold gates
 * CI on it.
 *
 * Usage: node scripts/roadmap-entropy.js [--json] [--verbose] [--threshold=N] [--strict]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLANNING_DIR = path.join(ROOT, '.planning');

const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 };

// A requirement ID: an uppercase prefix followed by one or more -SEGMENT groups,
// e.g. SEC-CSP-01, AUTH-API-01, GH-02, REFACTOR-06.
const REQ_ID = '[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse REQUIREMENTS.md into requirements, out-of-scope features and the
 * traceability table.
 */
function parseRequirements(text) {
    const requirements = [];   // { id, checked, deferred }
    const outOfScope = [];     // { feature, reason }
    const traceability = [];   // { req, phase, status }

    if (!text) return { requirements, outOfScope, traceability };

    const lines = text.split(/\r?\n/);
    let section = null; // null | 'out-of-scope' | 'traceability'

    // Checkbox requirement: - [x] **SEC-CSP-01**: ...
    const checkboxRe = new RegExp(`^\\s*[-*]\\s*\\[([ xX])\\]\\s*\\*{0,2}(${REQ_ID})\\*{0,2}`);
    // Deferred/future requirement without a checkbox: - **SEC-CSP-02 (...)**: ...
    const deferredRe = new RegExp(`^\\s*[-*]\\s*\\*{2}(${REQ_ID})`);

    for (const line of lines) {
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
            const title = heading[1].toLowerCase();
            if (title.includes('out of scope')) section = 'out-of-scope';
            else if (title.includes('traceability')) section = 'traceability';
            else section = null;
            continue;
        }

        if (section === 'out-of-scope') {
            // Table row: | Feature | Reason |
            const row = line.match(/^\s*\|(.+)\|(.+)\|\s*$/);
            if (row) {
                const feature = row[1].trim();
                const reason = row[2].trim();
                if (feature && !/^-+$/.test(feature) && feature.toLowerCase() !== 'feature') {
                    outOfScope.push({ feature, reason });
                }
            }
            continue;
        }

        if (section === 'traceability') {
            // Table row: | SEC-CSP-01 | Phase 21 | Complete |
            const row = line.match(/^\s*\|(.+?)\|(.+?)\|(.+)\|\s*$/);
            if (row) {
                const reqCell = row[1].trim().replace(/\*/g, '');
                const idMatch = reqCell.match(new RegExp(`^(${REQ_ID})$`));
                if (idMatch && reqCell !== 'REQ-ID') {
                    const phaseCell = row[2].trim();
                    const phaseNum = phaseCell.match(/Phase\s+(\d+)/i);
                    traceability.push({
                        req: idMatch[1],
                        phase: phaseNum ? `Phase ${phaseNum[1]}` : phaseCell,
                        phaseNum: phaseNum ? parseInt(phaseNum[1], 10) : null,
                        status: row[3].trim(),
                    });
                }
            }
            continue;
        }

        // Requirement definitions (any non-scope/trace section: current + future)
        const cb = line.match(checkboxRe);
        if (cb) {
            requirements.push({
                id: cb[2],
                checked: cb[1].toLowerCase() === 'x',
                deferred: false,
            });
            continue;
        }
        const df = line.match(deferredRe);
        if (df) {
            requirements.push({ id: df[1], checked: false, deferred: true });
        }
    }

    return { requirements, outOfScope, traceability };
}

/**
 * Parse ROADMAP.md into milestones, phase declarations (checkbox items) and
 * per-phase requirement mappings from the Phase Details section.
 */
function parseRoadmap(text) {
    const milestones = [];     // { label, status, phaseStart, phaseEnd }
    const phaseItems = [];     // { num, checked, milestone }
    const phaseRequirements = {}; // { [num]: [reqId, ...] }

    if (!text) return { milestones, phaseItems, phaseRequirements };

    const lines = text.split(/\r?\n/);
    let section = null; // null | 'milestones' | 'phase-details'
    let currentPhaseDetail = null;

    // Milestone bullet: - ✅ **v1.0 — ...** — Phases 1–4 (shipped ...)
    //                   - 🔄 **v1.13 — ...** — Phase 21 (in progress)
    const milestoneRe = /^\s*[-*]\s*(✅|🔄|⏳|🚧|❌)\s*\*{2}([^*]+)\*{2}.*?Phases?\s+(\d+)(?:\s*[–—-]\s*(\d+))?/u;
    // Phase checkbox item: - [x] Phase 12: ... OR - [ ] **Phase 21: ...**
    const phaseItemRe = /^\s*[-*]\s*\[([ xX])\]\s*\*{0,2}Phase\s+(\d+)/;
    // Phase detail heading: ### Phase 21: Title
    const phaseHeadingRe = /^#{2,4}\s+Phase\s+(\d+)\s*:/i;
    const reqLineRe = new RegExp(`^\\s*\\*{2}Requirements\\*{2}\\s*:\\s*(.+)$`);

    for (const line of lines) {
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
            const title = heading[1].toLowerCase();
            const ph = line.match(phaseHeadingRe);
            if (ph) {
                section = 'phase-details';
                currentPhaseDetail = parseInt(ph[1], 10);
                continue;
            }
            if (title.includes('milestone')) section = 'milestones';
            else if (title.includes('phase details')) { section = 'phase-details'; currentPhaseDetail = null; }
            else section = null;
            continue;
        }

        const ms = line.match(milestoneRe);
        if (ms) {
            const emoji = ms[1];
            const status = emoji === '✅' ? 'shipped'
                : emoji === '🔄' || emoji === '🚧' ? 'in-progress'
                    : 'planned';
            milestones.push({
                label: ms[2].trim(),
                status,
                phaseStart: parseInt(ms[3], 10),
                phaseEnd: ms[4] ? parseInt(ms[4], 10) : parseInt(ms[3], 10),
            });
            continue;
        }

        const pi = line.match(phaseItemRe);
        if (pi) {
            phaseItems.push({ num: parseInt(pi[2], 10), checked: pi[1].toLowerCase() === 'x' });
        }

        if (section === 'phase-details' && currentPhaseDetail !== null) {
            const rl = line.match(reqLineRe);
            if (rl) {
                const ids = rl[1].match(new RegExp(REQ_ID, 'g')) || [];
                if (ids.length) {
                    phaseRequirements[currentPhaseDetail] =
                        (phaseRequirements[currentPhaseDetail] || []).concat(ids);
                }
            }
        }
    }

    // Attach each phase item to the milestone whose range contains it.
    for (const item of phaseItems) {
        const owner = milestones.find(m => item.num >= m.phaseStart && item.num <= m.phaseEnd);
        item.milestone = owner ? owner.label : null;
        item.milestoneStatus = owner ? owner.status : null;
    }

    return { milestones, phaseItems, phaseRequirements };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Run the entropy analysis over already-parsed / raw planning artifacts.
 * @param {{requirementsText?:string, roadmapText?:string, milestonesText?:string}} input
 */
function analyze(input) {
    const req = parseRequirements(input.requirementsText || '');
    const road = parseRoadmap(input.roadmapText || '');

    const findings = [];
    const add = (category, severity, message, detail) =>
        findings.push({ category, severity, message, detail: detail || null });

    const reqById = new Map(req.requirements.map(r => [r.id, r]));
    const tracedReqs = new Set(req.traceability.map(t => t.req));

    // Requirements for shipped milestones are archived in milestone-specific
    // files (.planning/milestones/vX-REQUIREMENTS.md), not the active
    // REQUIREMENTS.md. Cross-checks against REQUIREMENTS.md therefore only
    // apply to phases in the active (non-shipped) milestone range.
    const milestoneStatusForPhase = (num) => {
        const m = road.milestones.find(x => num >= x.phaseStart && num <= x.phaseEnd);
        return m ? m.status : null; // null (no milestone info) is treated as active
    };
    const isArchivedPhase = (num) => milestoneStatusForPhase(num) === 'shipped';
    const definedPhaseNums = new Set([
        ...road.phaseItems.map(p => p.num),
        ...Object.keys(road.phaseRequirements).map(n => parseInt(n, 10)),
    ]);

    // (a) Traceability drift ------------------------------------------------
    // Active requirements (not deferred) with no traceability entry.
    for (const r of req.requirements) {
        if (r.deferred) continue;
        if (!tracedReqs.has(r.id)) {
            add('traceability-drift', 'high',
                `Requirement ${r.id} has no mapped phase in the traceability table`, r.id);
        }
    }
    // Phases in Phase Details referencing requirement IDs absent from REQUIREMENTS.md.
    // Skip archived (shipped-milestone) phases — their requirements live in
    // milestone-specific files, not the active REQUIREMENTS.md.
    for (const [num, ids] of Object.entries(road.phaseRequirements)) {
        if (isArchivedPhase(parseInt(num, 10))) continue;
        for (const id of [...new Set(ids)]) {
            if (!reqById.has(id)) {
                add('traceability-drift', 'high',
                    `Phase ${num} references requirement ${id} which is not defined in REQUIREMENTS.md`,
                    `Phase ${num}:${id}`);
            }
        }
    }

    // (b) Coverage drift ----------------------------------------------------
    // Traceability says REQ→Phase N, but Phase N's declared Requirements omit it.
    for (const t of req.traceability) {
        if (t.phaseNum == null) continue;
        const declared = road.phaseRequirements[t.phaseNum];
        if (declared && !declared.includes(t.req)) {
            add('coverage-drift', 'medium',
                `Traceability maps ${t.req} to ${t.phase}, but ${t.phase} declares [${[...new Set(declared)].join(', ')}]`,
                `${t.req}->${t.phase}`);
        } else if (declared === undefined && definedPhaseNums.size > 0 && !definedPhaseNums.has(t.phaseNum)) {
            add('coverage-drift', 'medium',
                `Traceability maps ${t.req} to ${t.phase}, but no such phase is declared in ROADMAP.md`,
                `${t.req}->${t.phase}`);
        }
    }

    // (c) Scope creep -------------------------------------------------------
    // Traceability entries for requirement IDs that are never defined.
    for (const t of req.traceability) {
        if (!reqById.has(t.req)) {
            add('scope-creep', 'medium',
                `Traceability tracks ${t.req}, but it is not defined as a requirement`, t.req);
        }
    }
    // Out-of-Scope features re-surfacing as active (unchecked) requirements.
    const activeReqIds = req.requirements.filter(r => !r.checked && !r.deferred).map(r => r.id);
    for (const oos of req.outOfScope) {
        const keywords = extractKeywords(oos.feature);
        for (const id of activeReqIds) {
            const r = reqById.get(id);
            // Match an out-of-scope keyword against the requirement id tokens.
            if (keywords.some(k => idMatchesKeyword(id, k))) {
                add('scope-creep', 'medium',
                    `Out-of-scope feature "${oos.feature}" may resurface as active requirement ${id} (keyword overlap — verify)`,
                    id);
                break;
            }
            void r;
        }
    }

    // (d) Staleness ---------------------------------------------------------
    for (const item of road.phaseItems) {
        if (item.milestoneStatus === 'shipped' && !item.checked) {
            add('staleness', 'high',
                `Phase ${item.num} is unchecked but its milestone "${item.milestone}" is marked ✅ shipped`,
                `Phase ${item.num}`);
        }
    }
    for (const m of road.milestones) {
        if (m.status !== 'in-progress') continue;
        const items = road.phaseItems.filter(p => p.milestone === m.label);
        if (items.length > 0 && items.every(p => p.checked)) {
            add('staleness', 'low',
                `Milestone "${m.label}" is marked 🔄 in-progress but all its phases are checked`, m.label);
        }
    }

    const score = findings.reduce((s, f) => s + (SEVERITY_WEIGHT[f.severity] || 0), 0);
    const bySeverity = { high: 0, medium: 0, low: 0 };
    const byCategory = {};
    for (const f of findings) {
        bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
        byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    }

    return {
        summary: {
            entropy_score: score,
            findings: findings.length,
            by_severity: bySeverity,
            by_category: byCategory,
            requirements: req.requirements.length,
            traced_requirements: tracedReqs.size,
            out_of_scope: req.outOfScope.length,
            milestones: road.milestones.length,
            phases: definedPhaseNums.size,
        },
        findings,
        parsed: {
            requirements: req.requirements,
            outOfScope: req.outOfScope,
            traceability: req.traceability,
            milestones: road.milestones,
            phaseItems: road.phaseItems,
            phaseRequirements: road.phaseRequirements,
        },
    };
}

/**
 * Extract meaningful keywords from an out-of-scope feature description,
 * dropping stop-words and short tokens.
 */
function extractKeywords(feature) {
    const STOP = new Set([
        'the', 'and', 'for', 'from', 'with', 'into', 'off', 'of', 'to', 'a', 'an',
        'removing', 'remove', 'removal', 'features', 'feature', 'api', 'side', 'or',
    ]);
    return feature
        .replace(/[`'"()/]/g, ' ')
        .split(/[\s,]+/)
        .map(w => w.trim())
        .filter(w => w.length >= 3 && !STOP.has(w.toLowerCase()));
}

/** Does a requirement ID's token set intersect an out-of-scope keyword? */
function idMatchesKeyword(id, keyword) {
    const kw = keyword.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (kw.length < 3) return false;
    return id.split('-').some(tok => tok === kw);
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function loadFromDir(planningDir) {
    const read = (name) => {
        const p = path.join(planningDir, name);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    };
    return {
        requirementsText: read('REQUIREMENTS.md'),
        roadmapText: read('ROADMAP.md'),
        milestonesText: read('MILESTONES.md'),
    };
}

function printReport(report, verbose) {
    const s = report.summary;
    console.log('\n=== Roadmap Entropy Detector ===\n');
    console.log(`  Requirements       : ${s.requirements} (${s.traced_requirements} traced)`);
    console.log(`  Phases declared    : ${s.phases}`);
    console.log(`  Milestones         : ${s.milestones}`);
    console.log(`  Out-of-scope items : ${s.out_of_scope}`);
    console.log(`\n  Entropy score      : ${s.entropy_score}`);
    console.log(`  Findings           : ${s.findings}  (high ${s.by_severity.high}, medium ${s.by_severity.medium}, low ${s.by_severity.low})\n`);

    if (report.findings.length === 0) {
        console.log('  ✓ No roadmap drift or scope creep detected.\n');
        return;
    }

    const icon = { high: '✗', medium: '!', low: '·' };
    const byCat = {};
    for (const f of report.findings) (byCat[f.category] = byCat[f.category] || []).push(f);
    for (const cat of Object.keys(byCat).sort()) {
        console.log(`--- ${cat} (${byCat[cat].length}) ---`);
        for (const f of byCat[cat]) {
            console.log(`  ${icon[f.severity] || '-'}  [${f.severity}] ${f.message}`);
            if (verbose && f.detail) console.log(`        ↳ ${f.detail}`);
        }
        console.log('');
    }
}

function main() {
    const args = process.argv.slice(2);
    const jsonMode = args.includes('--json');
    const verbose = args.includes('--verbose') || args.includes('-v');
    const strict = args.includes('--strict');
    // --threshold=N: fail (exit 1) when entropy_score exceeds N. Default: no gate
    // unless --strict, which gates on any finding (threshold 0).
    const thrArg = args.find(a => a.startsWith('--threshold='));
    let threshold = thrArg ? parseInt(thrArg.split('=')[1], 10) : (strict ? 0 : null);
    if (Number.isNaN(threshold)) threshold = null;

    const report = analyze(loadFromDir(PLANNING_DIR));

    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printReport(report, verbose);
    }

    if (threshold !== null && report.summary.entropy_score > threshold) {
        if (!jsonMode) {
            console.error(`FAIL: entropy score ${report.summary.entropy_score} exceeds threshold ${threshold}`);
        }
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    parseRequirements,
    parseRoadmap,
    analyze,
    loadFromDir,
    extractKeywords,
};
