import type { ExpoConfig } from 'expo/config';

// Firebase native config files are not committed. Point these variables at
// the files, or place them in this folder, before running a native build.
const googleServicesJson = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const googleServicesPlist = process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist';
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: 'Passway',
  slug: 'passway',
  version: '0.2.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
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
  },
  plugins: [
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    ['expo-location', { locationWhenInUsePermission: 'Passway checks that you are near the person you are connecting with. Your exact location is never shared.' }],
    'expo-notifications',
  ],
  extra: easProjectId ? { eas: { projectId: easProjectId } } : {},
};

export default config;
