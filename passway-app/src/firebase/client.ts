import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } from '@react-native-firebase/app-check';

// Must match FUNCTIONS_REGION in functions/src/constants.ts.
export const FUNCTIONS_REGION = 'asia-south1';

const app = getApp();

// App Check proves calls come from a genuine install of this app. Debug builds
// use a debug token registered in the Firebase console.
const appCheckProvider = new ReactNativeFirebaseAppCheckProvider();
const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined;
appCheckProvider.configure({
  android: { provider: __DEV__ ? 'debug' : 'playIntegrity', debugToken },
  apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback', debugToken },
});
initializeAppCheck(app, { provider: appCheckProvider, isTokenAutoRefreshEnabled: true });

export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = getFunctions(app, FUNCTIONS_REGION);

export function callable<Request, Response>(name: string): (data: Request) => Promise<Response> {
  const fn = httpsCallable<Request, Response>(functions, name);
  return async (data) => (await fn(data)).data;
}
