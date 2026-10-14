const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The native Firebase packages do not run in a browser. For the web preview
// each one is swapped for a small file in src/firebase/web that uses the
// Firebase JavaScript SDK, which has the same functions.
const webShims = {
  '@react-native-firebase/app': 'app.ts',
  '@react-native-firebase/app-check': 'app-check.ts',
  '@react-native-firebase/auth': 'auth.ts',
  '@react-native-firebase/firestore': 'firestore.ts',
  '@react-native-firebase/functions': 'functions.ts',
  '@react-native-firebase/crashlytics': 'crashlytics.ts',
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webShims[moduleName]) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src/firebase/web', webShims[moduleName]) };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
