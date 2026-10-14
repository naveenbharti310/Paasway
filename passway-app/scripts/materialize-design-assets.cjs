// Text-safe, deterministic source assets. No network access or credentials.
// npm postinstall restores exact binary files before Metro or EAS bundles them.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = require('../assets/encoded/manifest.json');
for (const entry of manifest) {
  const bytes = Buffer.from(fs.readFileSync(path.join(root, entry.source), 'utf8').trim(), 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Asset checksum mismatch: ${entry.target}`);
  const target = path.resolve(root, entry.target);
  if (!target.startsWith(path.join(root, 'assets') + path.sep)) throw new Error('Invalid asset path');
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, bytes);
}
console.log(`Restored ${manifest.length} verified design assets.`);
