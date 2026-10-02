import type { DocumentReference, DocumentData, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { otherParticipant, type Participants } from '../lib/validation';
import { retentionDate, applyMessageRetention } from '../lib/retention';
import { MESSAGE_RETENTION_MS, IDLE_CONNECTION_MS, IDLE_SWEEP_BATCH } from '../constants';

export const SYSTEM_ACTOR = 'system';

export function connectionRef(connectionId: string): DocumentReference {
  return db.collection('connections').doc(connectionId);
}

// Loads a connection inside a transaction and confirms the caller takes part in it.
export async function loadParticipantConnection(tx: Transaction, ref: DocumentReference, uid: string): Promise<{ connection: DocumentData; otherId: string }> {
  const snap = await tx.get(ref);
  const connection = snap.data();
  if (!snap.exists || !connection) throw new HttpsError('not-found', 'Connection not found.');
  return { connection, otherId: otherParticipant(connection as Participants, uid) };
}

// Marks a connection as ended without shortening any retention already in place.
// Repeated calls keep the first end time and the first person who ended it.
export function markEnded(tx: Transaction, ref: DocumentReference, connection: DocumentData, endedBy: string, now: number, extra: Record<string, unknown> = {}, minimumDeleteAt?: Date): void {
  const endedAt = connection.endedAt ?? now;
  let deleteAt = retentionDate(connection.deleteAt, new Date(endedAt + MESSAGE_RETENTION_MS));
  if (minimumDeleteAt) deleteAt = retentionDate(deleteAt, minimumDeleteAt);
  tx.update(ref, { status: 'ended', endedBy: connection.endedBy ?? endedBy, endedAt, deleteAt, ...extra });
}

export async function endConnectionAs(ref: DocumentReference, uid: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const { connection } = await loadParticipantConnection(tx, ref, uid);
    markEnded(tx, ref, connection, uid, Date.now());
  });
  await applyMessageRetention(ref);
}

// Closes connections that have had no messages for the idle window, so a
// connection that nobody ended does not stay open and keep data forever.
export async function closeIdleConnections(now = Date.now()): Promise<number> {
  const cutoff = now - IDLE_CONNECTION_MS;
  const idle = await db.collection('connections').where('status', '==', 'active').where('lastActivityAt', '<', cutoff).limit(IDLE_SWEEP_BATCH).get();
  let closed = 0;
  for (const doc of idle.docs) {
    const ended = await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const connection = snap.data();
      if (!snap.exists || !connection || connection.status !== 'active' || !(connection.lastActivityAt < cutoff)) return false;
      markEnded(tx, doc.ref, connection, SYSTEM_ACTOR, now, { endReason: 'idle' });
      return true;
    });
    if (ended) {
      await applyMessageRetention(doc.ref);
      closed++;
    }
  }
  return closed;
}
