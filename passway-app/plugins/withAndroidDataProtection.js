const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// Android 12+ device-to-device transfers can be independent of allowBackup.
// Explicit exclusions protect native auth persistence and any local app caches
// on both the legacy backup path and modern cloud/device transfer paths.
const domains = [
  'root', 'file', 'database', 'sharedpref', 'external',
  'device_root', 'device_file', 'device_database', 'device_sharedpref',
];
const exclusions = domains.map(domain => `    <exclude domain="${domain}" path="." />`).join('\n');
const legacyRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${exclusions}
</full-backup-content>
`;
const modernRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup disableIfNoEncryptionCapabilities="true">
${exclusions}
  </cloud-backup>
  <device-transfer>
${exclusions}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withAndroidDataProtection(config) {
  config = withAndroidManifest(config, mod => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application?.$) throw new Error('Android application manifest is required for data protection.');
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = '@xml/passway_backup_rules';
    application.$['android:dataExtractionRules'] = '@xml/passway_data_extraction_rules';
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'passway_backup_rules.xml'), legacyRules);
    fs.writeFileSync(path.join(dir, 'passway_data_extraction_rules.xml'), modernRules);
    return mod;
  }]);
};