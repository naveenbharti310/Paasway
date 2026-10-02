import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../../firebase/config';

export async function ensureUserDoc(uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { userId: uid, status: 'active', createdAt: Date.now() });
    } else if (snap.data().status === 'banned') {
      throw new Error('This account cannot use Passway right now.');
    }
  });
}
