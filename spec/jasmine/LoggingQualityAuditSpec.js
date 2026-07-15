const path = require('path');
const { execFileSync } = require('child_process');
const audit = require('../../scripts/logging-quality-audit');

const SCRIPT = path.resolve(__dirname, '../../scripts/logging-quality-audit.js');
const ROOT = path.resolve(__dirname, '../..');

describe("Logging Quality Auditor", function () {

    let report;

    beforeAll(function () {
        const out = execFileSync(process.execPath, [SCRIPT, '--json'], {
            cwd: ROOT,
            encoding: 'utf8'
        });
        report = JSON.parse(out);
    });

    function fileReport(file) {
        return report.files.find(f => f.file === file);
    }

    function hasCompliantEvent(file, event) {
        return report.tracked_events.some(e =>
            e.file === file &&
            e.event === event &&
            (e.sink === 'metrics' || (e.sink === 'logger' && e.level === 'warn')) &&
            e.compliant === true
        );
    }

    it("should return a valid report structure", function () {
        expect(report).toBeDefined();
        expect(report.scope).toBeDefined();
        expect(report.summary).toBeDefined();
        expect(Array.isArray(report.files)).toBeTrue();
        expect(Array.isArray(report.tracked_events)).toBeTrue();
        expect(Array.isArray(report.suspicious_sensitive)).toBeTrue();
        expect(Array.isArray(report.severity_mismatches)).toBeTrue();
        expect(Array.isArray(report.tracked_event_quality_gaps)).toBeTrue();
    });

    it("should scan the backend/API logging scope", function () {
        expect(report.scope.root_files).toContain('thinx-core.js');
        expect(report.scope.root_files).toContain('thinx.js');
        expect(report.scope.lib_glob).toEqual('lib/**/*.js');
        expect(report.scope.service_entrypoints).toContain('services/worker/worker.js');
        expect(report.scope.service_entrypoints).toContain('services/transformer/app.js');
        expect(Array.isArray(report.scope.scanned_service_entrypoints)).toBeTrue();
        expect(Array.isArray(report.scope.missing_service_entrypoints)).toBeTrue();
        expect(report.summary.service_entrypoints_scanned + report.summary.service_entrypoints_missing)
            .toEqual(report.scope.service_entrypoints.length);
        expect(fileReport('thinx-core.js')).toBeDefined();
        expect(fileReport('lib/router.auth.js')).toBeDefined();
        expect(fileReport('lib/thinx/device.js')).toBeDefined();
    });

    it("should report the current lower-risk logging backlog", function () {
        expect(report.summary.files_scanned).toBeGreaterThan(0);
        expect(report.summary.console_calls).toBeGreaterThan(0);
        expect(report.summary.severity_mismatches).toBeGreaterThan(0);
        expect(report.summary.sensitive_findings).toBeGreaterThanOrEqual(report.summary.high_risk_sensitive_findings);
    });

    it("should identify statistics events from the statistics owner template", function () {
        const events = report.scope.statistics_events;
        expect(events).toContain('LOGIN_INVALID');
        expect(events).toContain('DEVICE_NEW');
        expect(events).toContain('DEVICE_CHECKIN');
        expect(events).toContain('BUILD_STARTED');
        expect(events).toContain('BUILD_SUCCESS');
        expect(events).toContain('BUILD_FAILED');
    });

    it("should gate high-risk sensitive logging regressions", function () {
        const blockedIds = [
            'raw_cookie_header',
            'oauth_access_token',
            'oauth_handoff_token',
            'full_user_wrapper',
            'full_hdata',
            'invalid_login_username'
        ];
        const highRisk = report.suspicious_sensitive.filter(f => blockedIds.includes(f.id));
        expect(highRisk).toEqual([]);
        expect(report.summary.high_risk_sensitive_findings).toEqual(0);
    });

    it("should detect high-risk sensitive payloads inside multi-line log calls", function () {
        const source = [
            'function bad(req, access_token, token, userWrapper, hdata) {',
            '  console.log(',
            '    "unsafe OAuth handoff",',
            '    { token },',
            '    access_token,',
            '    { userWrapper },',
            '    { hdata },',
            '    req.headers.cookie',
            '  );',
            '}'
        ].join('\n');
        const fixture = audit.buildReport(
            [audit.analyzeContent('lib/fixture-multiline-sensitive.js', source, report.scope.statistics_events)],
            report.scope.statistics_events
        );
        const ids = fixture.suspicious_sensitive.map(f => f.id);
        expect(ids).toContain('raw_cookie_header');
        expect(ids).toContain('oauth_access_token');
        expect(ids).toContain('oauth_handoff_token');
        expect(ids).toContain('full_user_wrapper');
        expect(ids).toContain('full_hdata');
        expect(fixture.summary.high_risk_sensitive_findings).toBeGreaterThanOrEqual(5);
    });

    it("should gate tracked statistics events that bypass logger.warn or metrics", function () {
        expect(report.tracked_event_quality_gaps).toEqual([]);
        expect(report.summary.tracked_event_quality_gaps).toEqual(0);
    });

    it("should detect tracked statistics events inside multi-line console calls", function () {
        const source = [
            'function bad(owner, username) {',
            '  console.log(',
            '    `[OID:${owner}] [LOGIN_INVALID] username ${username}`',
            '  );',
            '}'
        ].join('\n');
        const fixture = audit.buildReport(
            [audit.analyzeContent('lib/fixture-multiline-event.js', source, report.scope.statistics_events)],
            report.scope.statistics_events
        );
        expect(fixture.tracked_event_quality_gaps.length).toEqual(1);
        expect(fixture.tracked_event_quality_gaps[0].event).toEqual('LOGIN_INVALID');
        expect(fixture.suspicious_sensitive.some(f => f.id === 'invalid_login_username')).toBeTrue();
    });

    it("should show fixed high-value events as logger.warn or metrics backed", function () {
        expect(hasCompliantEvent('lib/router.auth.js', 'LOGIN_INVALID')).toBeTrue();
        expect(hasCompliantEvent('lib/thinx/builder.js', 'BUILD_STARTED')).toBeTrue();
        expect(hasCompliantEvent('lib/thinx/builder.js', 'BUILD_FAILED')).toBeTrue();
        expect(hasCompliantEvent('lib/thinx/builder.js', 'BUILD_SUCCESS')).toBeTrue();
        expect(hasCompliantEvent('lib/thinx/device.js', 'DEVICE_CHECKIN')).toBeTrue();
        expect(hasCompliantEvent('lib/thinx/device.js', 'DEVICE_NEW')).toBeTrue();
    });

    it("should support the npm logging-audit -- --json entrypoint", function () {
        const out = execFileSync('npm', ['run', '--silent', 'logging-audit', '--', '--json'], {
            cwd: ROOT,
            encoding: 'utf8'
        });
        const npmReport = JSON.parse(out);
        expect(npmReport.summary.files_scanned).toEqual(report.summary.files_scanned);
    });
});
