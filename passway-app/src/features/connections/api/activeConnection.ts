import { collection, getDocs, limit, query, where } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';

// Finds a conversation that is still open so the app can return to it after a restart.
export async function findActiveConnection(uid: string): Promise<string | null> {
  const lookups = (['userA', 'userB'] as const).map((field) =>
    getDocs(query(collection(db, 'connections'), where(field, '==', uid), where('status', '==', 'active'), limit(1))));
  for (const snapshot of await Promise.all(lookups)) {
    const first = snapshot.docs[0];
    if (first) return first.id;
  }
  return null;
}
