#!/usr/bin/env bash
set -euo pipefail
root="$(pwd)"
results="${PASSWAY_SECURITY_OUTPUT:-$root/security-results}"
mkdir -p "$results"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
node scripts/apply-security-fixes.cjs --check > "$results/installed-hashes.json"
npm ci --prefix scripts/security-fixes/conformance-tools --ignore-scripts --no-audit --no-fund > "$results/conformance-tool-install.log" 2>&1
for spec in 'forge digitalbazaar/forge ceba34402e329f0365134f23fe19898756527d65 d9e7aa7bafbc830604302c43b02cb4e20958078df2fb1f6507e511d6f95f40e0' 'braces micromatch/braces a795ee83ecd011131b2d618fe754ac5a8e124dae 418a5a3146b3b761492a7858b194e11d406305fc755daa0be0a2724a53a02f17'; do
  read -r name repo revision hash <<< "$spec"
  curl --fail --location --retry 2 --max-time 120 --silent --show-error "https://codeload.github.com/$repo/legacy.tar.gz/$revision" -o "$work/$name.tar.gz"
  echo "$hash  $work/$name.tar.gz" | sha256sum -c -
  mkdir "$work/$name"
  tar -xzf "$work/$name.tar.gz" --strip-components=1 -C "$work/$name"
done
# Exercise the INSTALLED patched libraries, not merely a remote PR checkout.
rm -rf "$work/forge/lib" "$work/braces/lib"
cp -R node_modules/node-forge/lib "$work/forge/lib"
cp -R node_modules/braces/lib "$work/braces/lib"
node - "$work" <<'JS'
const fs = require('node:fs'), path = require('node:path');
const file = path.join(process.argv[2], 'forge/tests/unit/jsbn.js');
const source = fs.readFileSync(file, 'utf8');
if (source.split('describe.only(').length !== 2) throw new Error('Upstream focused-test layout changed; review required');
fs.writeFileSync(file, source.replace('describe.only(', 'describe('));
console.log('Removed exactly one pre-existing describe.only in an isolated upstream TEST copy. --forbid-only remains enforced.');
JS
export NODE_PATH="$root/scripts/security-fixes/conformance-tools/node_modules:$root/node_modules"
mocha="$root/scripts/security-fixes/conformance-tools/node_modules/.bin/mocha"
"$mocha" --no-config --no-package --forbid-only -t 30000 --reporter json "$work/forge/tests/unit/index.js" > "$results/forge-conformance.json"
"$mocha" --no-config --no-package --forbid-only --reporter json --require "$work/braces/test/mocha-initialization.js" "$work/braces/test/"'*.js' > "$results/braces-conformance.json"
node - "$results" <<'JS'
const fs = require('node:fs'), path = require('node:path');
const output = {};
for (const [name, count] of [['forge', 829], ['braces', 899]]) {
  const report = JSON.parse(fs.readFileSync(path.join(process.argv[2], `${name}-conformance.json`)));
  if (report.stats.failures !== 0 || report.stats.passes !== count || (name === 'forge' && report.stats.pending !== 4)) throw new Error(`Unexpected ${name} conformance coverage`);
  output[name] = { passed: report.stats.passes, failed: report.stats.failures, pending: report.stats.pending };
}
fs.writeFileSync(path.join(process.argv[2], 'upstream-conformance-summary.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
JS
