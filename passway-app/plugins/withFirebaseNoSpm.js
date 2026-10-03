const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

// React Native Firebase cannot use Swift packages together with the static
// frameworks Firebase needs on iOS, so CocoaPods is used for Firebase instead.
module.exports = function withFirebaseNoSpm(config) {
  return withDangerousMod(config, ['ios', async (cfg) => {
    const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
    const contents = fs.readFileSync(podfile, 'utf8');
    if (!contents.includes('$RNFirebaseDisableSPM')) {
      fs.writeFileSync(podfile, `$RNFirebaseDisableSPM = true\n${contents}`);
    }
    return cfg;
  }]);
};
