import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from '@react-native-firebase/firestore';
import { db, auth } from '../../../firebase/client';
import { AppState } from 'react-native';
import { withDeadline } from '../../../services/withDeadline';
import { getMessages } from './messages';
import { useVisibleMessages, type MessageClock } from '../messageVisibility';
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

// Connection metadata is only an invalidation signal. Message bodies always
// pass through the server-clock expiry endpoint, never a raw Firestore listener.
function useServerMessages(connectionId: string, uid: string, latest: boolean): { messages: Message[]; error: boolean } {
  const [state, setState] = useState<{ scope: string; messages: Message[]; error: boolean; clock?: MessageClock }>({ scope: '', messages: [], error: false });
  const scope = JSON.stringify([uid, connectionId, latest]);
  useEffect(() => {
    if (!uid || !connectionId) return;
    let active = true, running = false, dirty = false, generation = 0;
    async function refresh() {
      if (!active) return;
      dirty = true; generation++;
      if (running) return;
      running = true;
      try {
        while (active && dirty) {
          dirty = false;
          const version = generation;
          try {
            // Anchor before the request: response transit must consume (not
            // extend) the remaining visibility window. This is conservative
            // by up to the request duration, without trusting device wall time.
            const requestedAt = performance.now();
            const result = await withDeadline(() => getMessages({ connectionId, latest }), 15000);
            if (active && version === generation) setState({ scope, messages: result.messages, error: false, clock: { at: result.servedAt, receivedAt: requestedAt } });
          } catch {
            if (active && version === generation) setState({ scope, messages: [], error: true });
            // No automatic failure retry loop or offline body fallback.
            if (version === generation) dirty = false;
          }
        }
      } finally { running = false; }
    }
    const stop = onSnapshot(doc(db, 'connections', connectionId), (snapshot) => {
      if (snapshot.data()?.status !== 'active') { generation++; dirty = false; if (active) setState({ scope, messages: [], error: false }); return; }
      void refresh();
    }, () => {
      generation++; dirty = false;
      if (active) setState({ scope, messages: [], error: true });
    });
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { active = false; stop(); foreground.remove(); };
  }, [scope, uid, connectionId, latest]);
  return { messages: useVisibleMessages(state.scope === scope ? state.messages : [], state.scope === scope ? state.clock : undefined), error: state.scope === scope && state.error };
}

export function useLastMessage(connectionId: string, uid = auth.currentUser?.uid ?? ''): Message | null {
  return useServerMessages(connectionId, uid, true).messages[0] ?? null;
}

export function useChatMessages(connectionId: string, uid: string): { messages: Message[]; error: boolean } {
  return useServerMessages(connectionId, uid, false);
}
