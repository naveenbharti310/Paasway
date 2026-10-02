import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebase';

// Checked at the top of generateTid and redeemTid so a banned account
// cannot keep using the app just because it can still authenticate.
export async function assertNotBanned(uid: string): Promise<void> {
  const snap = await db.collection('users').doc(uid).get();
  if (snap.exists && snap.data()?.status === 'banned') {
    throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
  }
}
