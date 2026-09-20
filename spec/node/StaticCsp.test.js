const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const staticRoot = path.join(__dirname, "../../static");

function htmlFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? htmlFiles(filename) : /\.html?$/i.test(entry.name) ? [filename] : [];
    });
}

test("API static HTML does not require executable inline JavaScript", () => {
    const files = htmlFiles(staticRoot);
    assert.ok(files.length > 0, "expected API-served HTML to audit");
    for (const filename of files) {
        const html = fs.readFileSync(filename, "utf8").replace(/<!--[\s\S]*?-->/g, "");
        for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
            const type = /\btype\s*=\s*["']([^"']*)["']/i.exec(script[1]);
            if (type && /^(application\/(ld\+)?json|text\/ng-template)$/i.test(type[1])) continue;
            assert.equal(script[2].trim(), "", `${filename}: executable inline script`);
        }
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${filename}: inline event handler`);
        assert.doesNotMatch(html, /\b(?:href|src|action)\s*=\s*["']?\s*javascript\s*:/i,
            `${filename}: JavaScript URL`);
    }
});

test("the API GDPR information page needs no scripts or embedded tracking frames", () => {
    const html = fs.readFileSync(path.join(staticRoot, "gdpr.html"), "utf8");
    // This is an informational placeholder, not the console's interactive consent page.
    // Its old GTM bootstrap was blocked by Helmet; its jQuery/Bootstrap URLs were absent.
    assert.match(html, /GDPR Consent/);
    assert.match(html, /Consent body\./);
    assert.doesNotMatch(html, /<(?:script|iframe)\b/i);
});
