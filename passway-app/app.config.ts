import type { ExpoConfig } from 'expo/config';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

// The app icon is stored as SVG artwork in assets/src. Make the PNG files
// the build needs if they are not there yet (for example on Expo's servers).
if (!existsSync('./assets/icon.png')) execSync('node scripts/make-icons.cjs', { stdio: 'inherit' });

// Firebase native config files are not committed. Point these variables at
// the files, or place them in this folder, before running a native build.
const googleServicesJson = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const googleServicesPlist = process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist';
// The Expo project that builds the app. Override with EXPO_PUBLIC_EAS_PROJECT_ID
// to build under a different Expo account.
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'd21f83c5-5e34-4a1c-9dea-346885668a27';
const easOwner = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? undefined : 'naveenbharti310s-team';

const config: ExpoConfig = {
  name: 'Passway',
  slug: 'passway',
  ...(easOwner ? { owner: easOwner } : {}),
  version: '0.2.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  icon: './assets/icon.png',
  web: { favicon: './assets/favicon.png' },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.passway.app',
    googleServicesFile: googleServicesPlist,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'com.passway.app',
    googleServicesFile: googleServicesJson,
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#000000' },
  },
  plugins: [
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    ['expo-location', { locationWhenInUsePermission: 'Passway checks that you are near the person you are connecting with. Your exact location is never shared.' }],
    'expo-notifications',
    './plugins/withFirebaseNoSpm',
    ['expo-splash-screen', { backgroundColor: '#000000', image: './assets/splash-icon.png', imageWidth: 96 }],
    ['expo-system-ui'],
  ],
  extra: { eas: { projectId: easProjectId } },
};

export default config;
