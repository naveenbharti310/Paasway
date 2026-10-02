import { FieldPath } from 'firebase-admin/firestore';
import type { DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from './firebase';

export function retentionDate(current: unknown, proposed: Date): Date {
  let millis = 0;
  if (current instanceof Date) millis = current.getTime();
  else if (current && typeof current === 'object' && 'toMillis' in current && typeof current.toMillis === 'function') millis = current.toMillis();
  return new Date(Math.max(Number.isFinite(millis) ? millis : 0, proposed.getTime()));
}

export async function applyMessageRetention(connectionRef: DocumentReference): Promise<void> {
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    let query = connectionRef.collection('messages').orderBy(FieldPath.documentId()).limit(200);
    if (cursor) query = query.startAfter(cursor);
    const page = await db.runTransaction(async (tx) => {
      const connection = await tx.get(connectionRef);
      if (!connection.exists || connection.data()?.status !== 'ended') return [];
      const deleteAt = connection.data()?.deleteAt;
      if (!deleteAt) throw new Error('Connection retention date is missing.');
      const messages = await tx.get(query);
      // Reading the connection in each transaction protects a report hold
      // from an older end request that is still updating message pages.
      messages.docs.forEach((message) => {
        tx.update(message.ref, { deleteAt: retentionDate(message.data().deleteAt, retentionDate(deleteAt, new Date(0))) });
      });
      return messages.docs;
    });
    if (page.length < 200) return;
    cursor = page[page.length - 1];
  }
}
