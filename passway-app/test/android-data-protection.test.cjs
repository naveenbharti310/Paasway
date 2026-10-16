const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const callbacks = {};
  const files = new Map();
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins/withAndroidDataProtection.js'), 'utf8'), {
    module,
    require(name) {
      if (name === '@expo/config-plugins') return {
        withAndroidManifest(config, callback) { callbacks.manifest = callback; return config; },
        withDangerousMod(config, [platform, callback]) {
          assert.equal(platform, 'android'); callbacks.files = callback; return config;
        },
      };
      if (name === 'node:fs') return {
        mkdirSync() {},
        writeFileSync(name, contents) { files.set(name, contents); },
      };
      if (name === 'node:path') return path;
      throw new Error('Unexpected plugin dependency');
    },
  });
  module.exports({});
  return { callbacks, files };
}

test('Android privacy plugin disables backup and references explicit extraction policies', () => {
  const { callbacks } = harness();
  const mod = { modResults: { manifest: { application: [{ $: {} }] } } };
  callbacks.manifest(mod);
  const attributes = mod.modResults.manifest.application[0].$;
  assert.equal(attributes['android:allowBackup'], 'false');
  assert.equal(attributes['android:fullBackupContent'], '@xml/passway_backup_rules');
  assert.equal(attributes['android:dataExtractionRules'], '@xml/passway_data_extraction_rules');
});

test('missing Android application manifest cannot silently skip privacy hardening', () => {
  const { callbacks } = harness();
  assert.throws(() => callbacks.manifest({ modResults: { manifest: {} } }), /required for data protection/);
});

test('legacy backup, modern cloud backup and device transfer exclude every app data domain', async () => {
  const { callbacks, files } = harness();
  await callbacks.files({ modRequest: { platformProjectRoot: '/isolated-android' } });
  const legacy = files.get('/isolated-android/app/src/main/res/xml/passway_backup_rules.xml');
  const modern = files.get('/isolated-android/app/src/main/res/xml/passway_data_extraction_rules.xml');
  assert.ok(legacy && modern);
  const cloud = modern.match(/<cloud-backup[^>]*>([\s\S]*?)<\/cloud-backup>/)[1];
  const transfer = modern.match(/<device-transfer>([\s\S]*?)<\/device-transfer>/)[1];
  for (const section of [legacy, cloud, transfer]) {
    for (const domain of [
      'root', 'file', 'database', 'sharedpref', 'external',
      'device_root', 'device_file', 'device_database', 'device_sharedpref',
    ]) assert.ok(section.includes(`<exclude domain="${domain}" path="." />`));
    assert.doesNotMatch(section, /<include\b/);
  }
});