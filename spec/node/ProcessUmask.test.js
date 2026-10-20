const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// process.umask(mask) is process-wide and every git child of the API inherits
// it. buildlog.js used to set 0766 when it created a missing build.log and never
// restore it: from then on each fresh checkout came out with modes git reads as
// unstaged changes, and `git pull --rebase` refused every keyed and public
// prefetch until the API restarted. A file that needs a mode sets it with
// chmodSync, which the umask does not narrow.

const LIB = path.join(__dirname, '..', '..', 'lib');

function jsFiles(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return jsFiles(full);
		return entry.name.endsWith('.js') ? [full] : [];
	});
}

test('no lib module changes the process umask', () => {
	const offenders = [];
	for (const file of jsFiles(LIB)) {
		fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
			// process.umask() with no argument only reads the mask and is allowed.
			if (/process\.umask\(\s*[^)\s]/.test(line)) {
				offenders.push(`${path.relative(LIB, file)}:${index + 1}`);
			}
		});
	}
	assert.deepEqual(offenders, []);
});

test('buildlog creates a missing build.log with an explicit chmod, not a umask change', () => {
	const source = fs.readFileSync(path.join(LIB, 'thinx', 'buildlog.js'), 'utf8');
	assert.match(source, /fs\.chmodSync\(build_log_path, 0o665\)/);
	assert.doesNotMatch(source, /fchmodSync\(fs\.openSync\(/);
});
