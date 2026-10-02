import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { applyMessageRetention, retentionDate } from '../lib/retention';

export const syncConnectionRetention = onDocumentUpdated({ document: 'connections/{connectionId}', retry: true }, async (event) => {
  if (!event.data) return;
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (after.status !== 'ended') return;
  const previousDate = retentionDate(before.deleteAt, new Date(0)).getTime();
  const currentDate = retentionDate(after.deleteAt, new Date(0)).getTime();
  if (before.status !== 'ended' || previousDate !== currentDate) {
    await applyMessageRetention(event.data.after.ref);
  }
});
