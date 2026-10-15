import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, limit, limitToLast, onSnapshot, orderBy, query, setDoc, where } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';
import { useVisibleMessages } from '../messageVisibility';
import type { Connection, Message } from '../../../types/models';

// Every open chat the person is in, newest activity first.
export function useActiveChats(uid: string): { chats: Connection[]; loading: boolean; error: boolean } {
  type Rows = { userA?: Connection[]; userB?: Connection[] };
  const [state, setState] = useState<{ uid: string; rows: Rows; error: boolean }>({ uid: '', rows: {}, error: false });
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const stops = (['userA', 'userB'] as const).map((field) => onSnapshot(
      query(collection(db, 'connections'), where(field, '==', uid), where('status', '==', 'active')),
      (snap) => { if (active) setState((current) => ({ uid, error: current.uid === uid && current.error, rows: { ...(current.uid === uid ? current.rows : {}), [field]: snap.docs.map((d) => d.data() as Connection) } })); },
      () => { if (active) setState((current) => ({ uid, error: true, rows: { ...(current.uid === uid ? current.rows : {}), [field]: [] } })); },
    ));
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [uid]);
  const rows = state.uid === uid && uid ? state.rows : {};
  const chats = [...(rows.userA ?? []), ...(rows.userB ?? [])]
    .sort((a, b) => (b.lastActivityAt ?? b.createdAt) - (a.lastActivityAt ?? a.createdAt));
  return { chats, loading: !!uid && (!rows.userA || !rows.userB), error: state.uid === uid && state.error };
}

// Private notes such as "Ravi from the gym". Only the person who wrote a note can see it.
export function useNotes(uid: string): Record<string, string> {
  const [state, setState] = useState<{ uid: string; notes: Record<string, string> }>({ uid: '', notes: {} });
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const stop = onSnapshot(collection(db, 'users', uid, 'notes'), (snap) => {
      if (!active) return;
      const next: Record<string, string> = {};
      snap.docs.forEach((d) => { const note = d.data()?.note; if (typeof note === 'string') next[d.id] = note; });
      setState({ uid, notes: next });
    }, () => { if (active) setState({ uid, notes: {} }); });
    return () => { active = false; stop(); };
  }, [uid]);
  return uid && state.uid === uid ? state.notes : {};
}

export async function saveNote(uid: string, connectionId: string, note: string): Promise<void> {
  const value = note.trim().slice(0, 40);
  const ref = doc(db, 'users', uid, 'notes', connectionId);
  if (!value) await deleteDoc(ref);
  else await setDoc(ref, { note: value, updatedAt: Date.now() });
}

// The newest message in a chat, shown under the name in the chats list.
export function useLastMessage(connectionId: string): Message | null {
  const [state, setState] = useState<{ id: string; last: Message | null }>({ id: '', last: null });
  useEffect(() => {
    if (!connectionId) return;
    let active = true;
    const stop = onSnapshot(
      query(collection(db, 'connections', connectionId, 'messages'), orderBy('sentAt', 'desc'), limit(1)),
      (snap) => { if (active) setState({ id: connectionId, last: snap.docs[0] ? (snap.docs[0].data() as Message) : null }); },
      () => { if (active) setState({ id: connectionId, last: null }); },
    );
    return () => { active = false; stop(); };
  }, [connectionId]);
  const last = state.id === connectionId ? state.last : null;
  return useVisibleMessages(last ? [last] : [])[0] ?? null;
}

// Scope message data to the route and current account before rendering. Never
// rely on unsubscribe alone to prevent an already queued callback from winning.
export function useChatMessages(connectionId: string, uid: string): { messages: Message[]; error: boolean } {
  const [state, setState] = useState<{ scope: string; messages: Message[]; error: boolean }>({ scope: '', messages: [], error: false });
  const scope = JSON.stringify([uid, connectionId]);
  useEffect(() => {
    if (!uid || !connectionId) return;
    let active = true;
    const stop = onSnapshot(
      query(collection(db, 'connections', connectionId, 'messages'), orderBy('sentAt', 'asc'), limitToLast(200)),
      (snap) => { if (active) setState({ scope, messages: snap.docs.map((d) => d.data() as Message), error: false }); },
      () => { if (active) setState({ scope, messages: [], error: true }); },
    );
    return () => { active = false; stop(); };
  }, [scope, uid, connectionId]);
  return { messages: useVisibleMessages(state.scope === scope ? state.messages : []), error: state.scope === scope && state.error };
}
