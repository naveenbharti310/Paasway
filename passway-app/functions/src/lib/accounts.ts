import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from './firebase';

export async function assertNotBanned(uid: string, tx: Transaction): Promise<void> {
  const snap = await tx.get(db.collection('users').doc(uid));
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Your account is not ready. Sign in again.');
  if (snap.data()?.status === 'banned') {
    throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
  }
}
