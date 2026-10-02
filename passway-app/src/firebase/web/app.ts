import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';

// Web settings for the Firebase project. These values are public by design;
// access is controlled by sign in and the database rules.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_WEB_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_WEB_APP_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
};

export function getApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}
