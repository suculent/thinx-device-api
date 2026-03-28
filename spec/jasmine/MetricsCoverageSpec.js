const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../scripts/metrics-coverage.js');
const ROOT = path.resolve(__dirname, '../..');

describe("Metrics Coverage Analyzer", function () {

    let report;

    beforeAll(function () {
        const out = execFileSync(process.execPath, [SCRIPT, '--json'], {
            cwd: ROOT,
            encoding: 'utf8'
        });
        report = JSON.parse(out);
    });

    it("should return a valid report structure", function () {
        expect(report).toBeDefined();
        expect(report.summary).toBeDefined();
        expect(report.instrumented).toBeDefined();
        expect(report.uninstrumented).toBeDefined();
        expect(report.excluded).toBeDefined();
    });

    it("should report at least one instrumented file", function () {
        expect(report.summary.instrumented_files).toBeGreaterThan(0);
    });

    it("should identify the known-instrumented files", function () {
        const files = report.instrumented.map(f => f.file);
        expect(files.some(f => f.includes('router.auth.js'))).toBeTrue();
        expect(files.some(f => f.includes('apikey.js'))).toBeTrue();
        expect(files.some(f => f.includes('builder.js'))).toBeTrue();
        expect(files.some(f => f.includes('device.js'))).toBeTrue();
        expect(files.some(f => f.includes('devices.js'))).toBeTrue();
        expect(files.some(f => f.includes('notifier.js'))).toBeTrue();
    });

    it("should track the standard event types", function () {
        const events = report.summary.tracked_events;
        expect(events).toContain('APIKEY_INVALID');
        expect(events).toContain('LOGIN_INVALID');
        expect(events).toContain('DEVICE_NEW');
        expect(events).toContain('DEVICE_CHECKIN');
        expect(events).toContain('DEVICE_REVOCATION');
        expect(events).toContain('BUILD_STARTED');
        expect(events).toContain('BUILD_SUCCESS');
        expect(events).toContain('BUILD_FAILED');
    });

    it("should report coverage percentage between 0 and 100", function () {
        expect(report.summary.coverage_pct).toBeGreaterThanOrEqual(0);
        expect(report.summary.coverage_pct).toBeLessThanOrEqual(100);
    });

    it("should exclude infrastructure/utility files", function () {
        const excluded = report.excluded.map(f => path.basename(f.file));
        expect(excluded).toContain('influx.js');
        expect(excluded).toContain('globals.js');
        expect(excluded).toContain('util.js');
    });

    it("should not list influx.js as instrumented or uninstrumented", function () {
        const instrumented = report.instrumented.map(f => f.file);
        const uninstrumented = report.uninstrumented.map(f => f.file);
        expect(instrumented.some(f => f.includes('influx.js'))).toBeFalse();
        expect(uninstrumented.some(f => f.includes('influx.js'))).toBeFalse();
    });

    it("should classify router files correctly", function () {
        const routers = report.uninstrumented.filter(f => f.type === 'router');
        expect(routers.length).toBeGreaterThan(0);
        routers.forEach(r => {
            expect(path.basename(r.file)).toMatch(/^router\./);
        });
    });

    it("should classify service files correctly", function () {
        const services = report.uninstrumented.filter(f => f.type === 'service');
        expect(services.length).toBeGreaterThan(0);
        services.forEach(s => {
            expect(s.file).toContain('lib/thinx/');
        });
    });

    it("should exit 0 with no threshold set", function () {
        expect(() => {
            execFileSync(process.execPath, [SCRIPT, '--json'], {
                cwd: ROOT,
                encoding: 'utf8'
            });
        }).not.toThrow();
    });

    it("should exit non-zero when threshold exceeds coverage", function () {
        let threw = false;
        try {
            execFileSync(process.execPath, [SCRIPT, '--json', '--threshold=100'], {
                cwd: ROOT,
                encoding: 'utf8'
            });
        } catch (e) {
            threw = true;
            expect(e.status).toBeGreaterThan(0);
        }
        expect(threw).toBeTrue();
    });
});
