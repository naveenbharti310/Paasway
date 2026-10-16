'use strict';
// npm's registry audit cannot see patched installed files. Retain its raw report
// and permit ONLY the two exact advisories with verified installed remediation.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyOrApply } = require('./apply-security-fixes.cjs');
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
function assess(report, fixes) {
  if (!report || report.error || report.auditReportVersion !== 2 || !report.vulnerabilities || !report.metadata) throw new Error('Invalid or unavailable registry audit');
  const known = new Map(fixes.map(f => [`https://github.com/advisories/${f.advisory}`, f]));
  const found = new Set(), unexpected = new Set();
  const high = s => ['high', 'critical'].includes(s);
  function roots(name, visiting = new Set()) {
    if (visiting.has(name)) return [];
    const v = report.vulnerabilities[name];
    if (!v || !Array.isArray(v.via)) throw new Error('Unresolved audit dependency chain');
    const next = new Set(visiting); next.add(name);
    return v.via.flatMap(via => typeof via === 'string' ? roots(via, next) : [via]);
  }
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!high(vulnerability.severity)) continue;
    const advisories = roots(name);
    if (!advisories.some(a => a && high(a.severity))) throw new Error('Unresolved high severity audit finding');
    for (const advisory of advisories) {
      if (!advisory || typeof advisory !== 'object' || typeof advisory.url !== 'string') throw new Error('Malformed audit advisory');
      if (!high(advisory.severity)) continue;
      const fix = known.get(advisory.url);
      if (!fix || fix.package !== advisory.name || !fix.registryAdvisory || canonical(fix.registryAdvisory) !== canonical(advisory)) unexpected.add(advisory.url);
      else found.add(advisory.url);
    }
  }
  const counts = report.metadata.vulnerabilities;
  if (!counts || !Number.isInteger(counts.high) || !Number.isInteger(counts.critical) || ((counts.high + counts.critical) > 0 && !Object.values(report.vulnerabilities).some(v => high(v.severity)))) throw new Error('Inconsistent audit finding counts');
  if (unexpected.size) throw new Error('New high/critical advisories require review: ' + [...unexpected].join(', '));
  return { status: found.size ? 'locally-remediated-build-tools; registry audit is NOT clean' : 'registry-clean-at-high-threshold', remediatedAdvisories: [...found].sort(), registryVulnerabilityCounts: report.metadata.vulnerabilities };
}
module.exports = { assess };
if (require.main === module) {
  const root = process.cwd(), output = path.resolve(process.env.PASSWAY_SECURITY_OUTPUT || 'security-results');
  fs.mkdirSync(output, { recursive: true });
  try {
    const fixes = verifyOrApply(root, { checkOnly: true });
    const audit = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--package-lock-only', '--json', '--audit-level=high'], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    if (audit.error || ![0, 1].includes(audit.status)) throw new Error('Registry audit failed to execute');
    fs.writeFileSync(path.join(output, 'npm-audit-raw.json'), audit.stdout);
    const decision = assess(JSON.parse(audit.stdout), fixes);
    const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/dependency-security.test.cjs', 'test/security-remediation.test.cjs'], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    fs.writeFileSync(path.join(output, 'remediation-tests.log'), tests.stdout + tests.stderr);
    if (tests.error || tests.status !== 0) throw new Error('Installed security-remediation regressions failed');
    const report = { ...decision, installedFileHashesVerified: true, exploitRegressionsPassed: true, dependencyVersionsRewritten: false, fixes };
    fs.writeFileSync(path.join(output, 'remediation-verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'remediation-verification.json'), JSON.stringify({ status: 'FAILED', error: error.message }, null, 2) + '\n');
    console.error(error.message); process.exitCode = 1;
  }
}
