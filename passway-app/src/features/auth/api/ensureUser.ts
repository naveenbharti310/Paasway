import { doc, runTransaction } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';

export type AccountStage = 'needs_age' | 'under_minimum' | 'deleting' | 'ready';

// Creates the profile on first sign in and reports which step the account is at.
// The transaction needs a connection, so a brief network drop when the app
// comes back to the foreground is retried before showing an error.
export async function ensureUserDoc(uid: string): Promise<AccountStage> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await loadStage(uid);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? '';
      if (attempt >= 3 || !/unavailable|deadline-exceeded|aborted/.test(code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
}

function loadStage(uid: string): Promise<AccountStage> {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', uid);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { userId: uid, status: 'active', createdAt: Date.now() });
      return 'needs_age' as const;
    }
    const data = snap.data() ?? {};
    if (data.status === 'deleting') return 'deleting' as const;
    if (data.status === 'banned') throw new Error('This account cannot use Passway right now.');
    if (data.ageCheck === 'under_minimum') return 'under_minimum' as const;
    return typeof data.ageConfirmedAt === 'number' ? 'ready' as const : 'needs_age' as const;
  });
}
