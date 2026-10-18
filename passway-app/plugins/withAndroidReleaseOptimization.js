const { withAppBuildGradle } = require('@expo/config-plugins');

// Expo's template uses the legacy non-optimizing default ProGuard file. Keep
// dependency-owned reflection/JNI consumer rules, but select Android's R8
// optimization rules and retain symbol tables for release crash diagnosis.
function optimizeReleaseGradle(contents) {
  const legacy = 'getDefaultProguardFile("proguard-android.txt")';
  const optimized = 'getDefaultProguardFile("proguard-android-optimize.txt")';
  const count = (value) => contents.split(value).length - 1;
  if (count(legacy) === 1 && count(optimized) === 0) contents = contents.replace(legacy, optimized);
  else if (count(legacy) !== 0 || count(optimized) !== 1) throw new Error('Review changed Android ProGuard template before building a release.');
  const marker = '// PASSWAY_RELEASE_SYMBOL_TABLE';
  if (!contents.includes(marker)) {
    const blocks = [...contents.matchAll(/\brelease\s*\{/g)];
    if (blocks.length !== 1) throw new Error('Expected exactly one Android release build type.');
    contents = contents.replace(/\brelease\s*\{/, (block) => `${block}\n            ${marker}\n            ndk { debugSymbolLevel 'SYMBOL_TABLE' }`);
  }
  return contents;
}

module.exports = function withAndroidReleaseOptimization(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Review Android release optimization for this Gradle language.');
    mod.modResults.contents = optimizeReleaseGradle(mod.modResults.contents);
    return mod;
  });
};
module.exports.optimizeReleaseGradle = optimizeReleaseGradle;
