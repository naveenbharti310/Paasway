import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable, httpsCallableFromUrl } from '@react-native-firebase/functions';
import { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } from '@react-native-firebase/app-check';
import { normalizeCallableError } from '../services/errors';

// Must match FUNCTIONS_REGION in functions/src/constants.ts.
export const FUNCTIONS_REGION = 'asia-south1';

const app = getApp();
export let appCheck: ReturnType<typeof initializeAppCheck> | undefined;

// App Check proves calls come from a genuine install of this app. Debug builds
// use a debug token registered in the Firebase console. Play Integrity only
// works for apps installed from Google Play, so builds shared by link set
// EXPO_PUBLIC_APP_CHECK=off until the app is on the store.
if (process.env.EXPO_PUBLIC_APP_CHECK !== 'off') {
  const appCheckProvider = new ReactNativeFirebaseAppCheckProvider();
  const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined;
  appCheckProvider.configure({
    android: { provider: __DEV__ ? 'debug' : 'playIntegrity', debugToken },
    apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback', debugToken },
  });
  appCheck = initializeAppCheck(app, { provider: appCheckProvider, isTokenAutoRefreshEnabled: true });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = getFunctions(app, FUNCTIONS_REGION);

// When EXPO_PUBLIC_API_URL is set, callables go to that server (for example
// the free Vercel deployment) instead of Cloud Functions.
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

export function callable<Request, Response>(name: string): (data: Request) => Promise<Response> {
  const fn = apiUrl
    ? httpsCallableFromUrl<Request, Response>(functions, `${apiUrl}/api/${name}`)
    : httpsCallable<Request, Response>(functions, name);
  return async (data) => {
    try { return (await fn(data)).data; }
    catch (error) { throw normalizeCallableError(error); }
  };
}
