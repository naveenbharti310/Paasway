import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Cloud Functions supplies credentials automatically. Other hosts pass the
// service account JSON in FIREBASE_SERVICE_ACCOUNT.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (getApps().length === 0) initializeApp(serviceAccount ? { credential: cert(JSON.parse(serviceAccount)) } : undefined);

export const db = getFirestore();
if (serviceAccount) db.settings({ preferRest: true });
export const auth = getAuth();
