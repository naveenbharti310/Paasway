import { FieldPath } from 'firebase-admin/firestore';
import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from './firebase';
import { RETENTION_PAGE_SIZE } from '../constants';

export function retentionDate(current: unknown, proposed: Date): Date {
  let millis = 0;
  if (current instanceof Date) millis = current.getTime();
  else if (current && typeof current === 'object' && 'toMillis' in current && typeof current.toMillis === 'function') millis = current.toMillis();
  return new Date(Math.max(Number.isFinite(millis) ? millis : 0, proposed.getTime()));
}

// Copies the connection's retention date onto every message, one page per
// transaction so large conversations stay under Firestore's write limit.
export async function applyMessageRetention(connectionRef: DocumentReference): Promise<void> {
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    let query = connectionRef.collection('messages').orderBy(FieldPath.documentId()).limit(RETENTION_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await db.runTransaction(async (tx) => {
      const connection = await tx.get(connectionRef);
      if (!connection.exists || connection.data()?.status !== 'ended') return [];
      const deleteAt = connection.data()?.deleteAt;
      if (!deleteAt) throw new Error('Connection retention date is missing.');
      const messages = await tx.get(query);
      // Reading the connection in each transaction protects a report hold
      // from an older end request that is still updating message pages.
      const target = retentionDate(deleteAt, new Date(0));
      messages.docs.forEach((message) => {
        tx.update(message.ref, { deleteAt: retentionDate(message.data().deleteAt, target) });
      });
      return messages.docs;
    });
    if (page.length < RETENTION_PAGE_SIZE) return;
    cursor = page[page.length - 1];
  }
}
