import { doc, runTransaction } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';

export type AccountStage = 'needs_age' | 'under_minimum' | 'ready';

// Creates the profile on first sign in and reports which step the account is at.
export async function ensureUserDoc(uid: string): Promise<AccountStage> {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { userId: uid, status: 'active', createdAt: Date.now() });
      return 'needs_age' as const;
    }
    const data = snap.data() ?? {};
    if (data.status === 'banned') throw new Error('This account cannot use Passway right now.');
    if (data.ageCheck === 'under_minimum') return 'under_minimum' as const;
    return typeof data.ageConfirmedAt === 'number' ? 'ready' as const : 'needs_age' as const;
  });
}
