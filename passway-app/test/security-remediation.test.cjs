'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyOrApply } = require('../scripts/apply-security-fixes.cjs');
const { assess } = require('../scripts/security-audit.cjs');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function fixture(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'passway-security-'));
 t.after(() => fs.rmSync(root, { recursive: true, force: true }));
 const vendor = path.join(root, 'vendor'), dir = path.join(root, 'node_modules/braces');
 fs.mkdirSync(path.join(vendor, 'braces/lib'), { recursive: true }); fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
 fs.writeFileSync(path.join(vendor, 'braces/lib/parse.js'), 'reviewed'); fs.writeFileSync(path.join(dir, 'lib/parse.js'), 'original');
 fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'braces', version: '3.0.3' }));
 fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/braces': { version: '3.0.3' } } }));
 const manifest = { schema: 1, patches: [{ package: 'braces', version: '3.0.3', advisory: 'GHSA-vfj7-8cjw-p6xm', files: [{ path: 'lib/parse.js', beforeSha256: sha('original'), afterSha256: sha('reviewed') }] }] };
 fs.writeFileSync(path.join(vendor, 'manifest.json'), JSON.stringify(manifest));
 return { root, vendor, dir, manifest };
}
test('security patch applies only exact original bytes and is idempotent', t => {
 const f = fixture(t); verifyOrApply(f.root, f); verifyOrApply(f.root, f); verifyOrApply(f.root, { ...f, checkOnly: true });
 assert.equal(fs.readFileSync(path.join(f.dir, 'lib/parse.js'), 'utf8'), 'reviewed');
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'package.json'))).version, '3.0.3');
});
test('verification fails if install lifecycle was skipped', t => { const f = fixture(t); assert.throws(() => verifyOrApply(f.root, { ...f, checkOnly: true }), /Unverified/); });
test('unknown installed bytes fail without being overwritten', t => {
 const f = fixture(t); fs.writeFileSync(path.join(f.dir, 'lib/parse.js'), 'unexpected');
 assert.throws(() => verifyOrApply(f.root, f), /Unverified/); assert.equal(fs.readFileSync(path.join(f.dir, 'lib/parse.js'), 'utf8'), 'unexpected');
});
test('altered vendor payload fails integrity verification', t => {
 const f = fixture(t); fs.writeFileSync(path.join(f.vendor, 'braces/lib/parse.js'), 'tampered');
 assert.throws(() => verifyOrApply(f.root, f), /integrity/); assert.equal(fs.readFileSync(path.join(f.dir, 'lib/parse.js'), 'utf8'), 'original');
});
test('changed dependency versions require new security review', t => {
 const f = fixture(t); fs.writeFileSync(path.join(f.dir, 'package.json'), JSON.stringify({ name: 'braces', version: '3.0.4' }));
 assert.throws(() => verifyOrApply(f.root, f), /changed package/);
});
test('unsafe manifest file paths are rejected', t => {
 const f = fixture(t); f.manifest.patches[0].files[0].path = '../escape.js'; fs.writeFileSync(path.join(f.vendor, 'manifest.json'), JSON.stringify(f.manifest)); assert.throws(() => verifyOrApply(f.root, f), /Unsafe/);
});
const fixes = [{ package: 'braces', advisory: 'GHSA-vfj7-8cjw-p6xm' }, { package: 'node-forge', advisory: 'GHSA-86w9-cpqp-85rv' }];
function report() {return { auditReportVersion: 2, metadata: { vulnerabilities: { high: 2, critical: 0 } }, vulnerabilities: { braces: { severity: 'high', via: [{ name: 'braces', severity: 'high', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] }, micromatch: { severity: 'high', via: ['braces'] } } };}
fixes[0].registryAdvisory = report().vulnerabilities.braces.via[0];
test('known advisories remain visible as locally remediated, never audit-clean', () => { const r = assess(report(), fixes); assert.match(r.status, /NOT clean/); assert.equal(r.remediatedAdvisories.length, 1); });
test('new high advisory cannot be hidden behind a known dependency chain', () => {const r = report();r.vulnerabilities.braces.via.push({ name: 'braces', severity: 'high', url: 'https://github.com/advisories/GHSA-new' }); assert.throws(() => assess(r, fixes), /New high/);});
test('known advisory URL for a different package fails closed', () => {const r = report();r.vulnerabilities.braces.via[0].name = 'different';assert.throws(() => assess(r, fixes), /New high/);});
test('audit transport errors, malformed data and unresolved chains fail closed', () => {for(const r of [{}, {error: {}}, {...report(), vulnerabilities: {foo: {severity: 'critical',via:['missing']}}}, {...report(), vulnerabilities: {foo: {severity: 'critical',via:['foo']}}}]) assert.throws(() => assess(r,fixes));});

test('a changed advisory with the same URL requires re-review', () => {const r=report();r.vulnerabilities.braces.via[0].range='newly-expanded-range';assert.throws(()=>assess(r,fixes),/New high/);});
