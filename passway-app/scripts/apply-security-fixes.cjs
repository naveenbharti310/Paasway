'use strict';
// Apply only reviewed, hash-bound build-tool fixes; never edit package versions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const defaultVendor = path.join(__dirname, 'security-fixes');
function verifyOrApply(root, { checkOnly = false, vendor = defaultVendor } = {}) {
  root = path.resolve(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(vendor, 'manifest.json')));
  if (manifest.schema !== 1) throw new Error('Unsupported security-fix manifest');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  if (!lock.packages) throw new Error('A package-lock with exact package instances is required');
  const writes = [], reports = [];
  for (const fix of manifest.patches) {
    const locations = Object.keys(lock.packages).filter(p => p === `node_modules/${fix.package}` || p.endsWith(`/node_modules/${fix.package}`));
    if (!locations.length) throw new Error(`Missing locked security-fix target: ${fix.package}`);
    for (const location of locations) {
      if (path.isAbsolute(location) || location.split('/').includes('..')) throw new Error('Unsafe package location');
      const dir = path.join(root, location);
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
      if (pkg.name !== fix.package || pkg.version !== fix.version || lock.packages[location].version !== fix.version) throw new Error(`Security fix requires review for changed package: ${fix.package}`);
      for (const file of fix.files) {
        if (!/^lib\/[a-z-]+\.js$/.test(file.path)) throw new Error('Unsafe security-fix path');
        const replacement = fs.readFileSync(path.join(vendor, fix.package, file.path));
        if (sha(replacement) !== file.afterSha256) throw new Error(`Security replacement integrity failure: ${fix.package}`);
        const target = path.join(dir, file.path);
        const originalHash = fs.existsSync(target) ? sha(fs.readFileSync(target)) : null;
        if (originalHash === file.afterSha256) continue;
        if (checkOnly || originalHash !== file.beforeSha256) throw new Error(`Unverified or unapplied security fix: ${fix.package}/${file.path}`);
        writes.push({ target, replacement });
      }
      reports.push({ package: fix.package, version: fix.version, advisory: fix.advisory, registryAdvisory: fix.registryAdvisory, location });
    }
  }
  // Validate every target and replacement BEFORE changing any installed file.
  for (const { target, replacement } of writes) {
    const temp = target + '.passway-security-tmp';
    fs.writeFileSync(temp, replacement, { mode: 0o644 });
    fs.renameSync(temp, target);
  }
  if (!checkOnly) return verifyOrApply(root, { checkOnly: true, vendor });
  return reports;
}
module.exports = { verifyOrApply };
if (require.main === module) {
  try {
    console.log(JSON.stringify({ securityFixesVerified: verifyOrApply(process.cwd(), { checkOnly: process.argv.includes('--check') }) }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
