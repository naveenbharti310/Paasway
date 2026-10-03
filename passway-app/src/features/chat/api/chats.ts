import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, setDoc, where } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';
import type { Connection, Message } from '../../../types/models';

// Every open chat the person is in, newest activity first.
export function useActiveChats(uid: string): { chats: Connection[]; loading: boolean } {
  const [byField, setByField] = useState<{ userA?: Connection[]; userB?: Connection[] }>({});
  useEffect(() => {
    if (!uid) return;
    const stops = (['userA', 'userB'] as const).map((field) => onSnapshot(
      query(collection(db, 'connections'), where(field, '==', uid), where('status', '==', 'active')),
      (snap) => setByField((current) => ({ ...current, [field]: snap.docs.map((d) => d.data() as Connection) })),
      () => setByField((current) => ({ ...current, [field]: current[field] ?? [] })),
    ));
    return () => stops.forEach((stop) => stop());
  }, [uid]);
  const chats = [...(byField.userA ?? []), ...(byField.userB ?? [])]
    .sort((a, b) => (b.lastActivityAt ?? b.createdAt) - (a.lastActivityAt ?? a.createdAt));
  return { chats, loading: !byField.userA || !byField.userB };
}

// Private notes such as "Ravi from the gym". Only the person who wrote a note can see it.
export function useNotes(uid: string): Record<string, string> {
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users', uid, 'notes'), (snap) => {
      const next: Record<string, string> = {};
      snap.docs.forEach((d) => { const note = d.data()?.note; if (typeof note === 'string') next[d.id] = note; });
      setNotes(next);
    }, () => setNotes({}));
  }, [uid]);
  return notes;
}

export async function saveNote(uid: string, connectionId: string, note: string): Promise<void> {
  const value = note.trim().slice(0, 40);
  const ref = doc(db, 'users', uid, 'notes', connectionId);
  if (!value) await deleteDoc(ref);
  else await setDoc(ref, { note: value, updatedAt: Date.now() });
}

// The newest message in a chat, shown under the name in the chats list.
export function useLastMessage(connectionId: string): Message | null {
  const [last, setLast] = useState<Message | null>(null);
  useEffect(() => onSnapshot(
    query(collection(db, 'connections', connectionId, 'messages'), orderBy('sentAt', 'desc'), limit(1)),
    (snap) => setLast(snap.docs[0] ? (snap.docs[0].data() as Message) : null),
    () => setLast(null),
  ), [connectionId]);
  return last;
}
