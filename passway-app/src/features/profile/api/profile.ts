import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase/config';

// The saved default name pre-fills the field on Generate and EnterCode
// so it is not retyped every time. It is not a page anyone else can
// browse, it only ever surfaces attached to a specific TID or request
// the person themselves chose to share.
export async function getSavedName(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.data()?.displayName ?? '';
}

export async function saveDefaultName(uid: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { displayName: name });
}
