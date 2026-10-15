import type { ExpoConfig } from 'expo/config';
// Node helpers, loaded this way so the app's type check does not need Node types.
declare const require: (name: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
const { existsSync } = require('fs');
const { execSync } = require('child_process');

// The app icon is stored as SVG artwork in assets/src. Make the PNG files
// the build needs if they are not there yet (for example on Expo's servers).
if (!existsSync('./assets/icon.png')) execSync('node scripts/make-icons.cjs', { stdio: 'ignore' });

// Firebase native config files are not committed. Point these variables at
// the files, or place them in this folder, before running a native build.
const googleServicesJson = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
const googleServicesPlist = process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist';
// The Expo project that builds the app. Override with EXPO_PUBLIC_EAS_PROJECT_ID
// to build under a different Expo account.
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'd21f83c5-5e34-4a1c-9dea-346885668a27';
const easOwner = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? undefined : 'naveenbharti310s-team';

// Both supported providers may be used in release builds. Reject typos instead
// of silently choosing an unexpected SMS provider.
const otpProvider = process.env.EXPO_PUBLIC_OTP_PROVIDER;
if (otpProvider && !['firebase', '2factor'].includes(otpProvider)) {
  throw new Error('EXPO_PUBLIC_OTP_PROVIDER must be firebase or 2factor.');
}
if (process.env.EXPO_PUBLIC_DIAGNOSTICS === '1' && process.env.EAS_BUILD_PROFILE !== 'play-diagnostics') {
  throw new Error('Diagnostics and fictional test login are restricted to the play-diagnostics build profile.');
}

const appCheckSetting = process.env.EXPO_PUBLIC_APP_CHECK;
if (appCheckSetting && !['on', 'off'].includes(appCheckSetting)) {
  throw new Error('App Check setting must be on or off.');
}
// Store-attestation builds must exercise the same verification policy as
// production, not inherit the internal diagnostic APK's bypass or credentials.
const verifiedRelease = ['production', 'play-attestation'].includes(process.env.EAS_BUILD_PROFILE ?? '');
if (verifiedRelease && appCheckSetting === 'off') {
  throw new Error('Production builds must not disable App Check. Use an internal testing profile instead.');
}
if (verifiedRelease && process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN) {
  throw new Error('Release builds must not bundle an App Check debug token.');
}
if (verifiedRelease && process.env.EXPO_PUBLIC_SHOW_TEST_NUMBERS === '1') {
  throw new Error('Release builds must not show fictional test numbers.');
}

const config: ExpoConfig = {
  name: 'Passway',
  slug: 'passway',
  ...(easOwner ? { owner: easOwner } : {}),
  version: '0.3.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0D11',
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
    versionCode: 6,
    allowBackup: false,
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    softwareKeyboardLayoutMode: 'resize',
    googleServicesFile: googleServicesJson,
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B0D11' },
  },
  plugins: [
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/app-check',
    '@react-native-firebase/crashlytics',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    ['expo-location', { locationWhenInUsePermission: 'Passway checks that you are near the person you are connecting with. Your exact location is never shared.' }],
    'expo-notifications',
    './plugins/withFirebaseNoSpm',
    './plugins/withTestLabDetection',
    './plugins/withAndroidDataProtection',
    ['expo-splash-screen', { backgroundColor: '#0B0D11', image: './assets/splash-icon.png', imageWidth: 96 }],
    ['expo-system-ui'],
  ],
  extra: { eas: { projectId: easProjectId } },
};

export default config;
