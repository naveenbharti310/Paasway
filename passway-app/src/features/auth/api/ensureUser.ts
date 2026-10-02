import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

// Called once right after a successful sign in. Firebase Auth already
// holds the verified phone number, this Firestore doc is only for the
// app specific fields Auth does not track: moderation status and the
// push token registerForPush fills in.
export async function ensureUserDoc(uid: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { userId: uid, status: 'active', createdAt: Date.now() });
  }
}
