import { db } from '../lib/firebase';
import { log } from '../lib/logger';
import { closeIdleConnections } from './connections';
import { CLEANUP_BATCH, CLEANUP_INTERVAL_MS } from '../constants';

const EXPIRING = ['tids', 'connectionRequests', 'connections', 'reports', 'rateLimits', 'accountHolds'];

// Deletes documents whose deleteAt has passed. Firestore TTL policies do this
// on paid plans. On the free plan this sweep is the only thing that deletes
// expired data, so it runs on a schedule and after client requests.
export async function deleteExpired(now = Date.now()): Promise<number> {
  const cutoff = new Date(now);
  const queries = [
    db.collectionGroup('messages').where('deleteAt', '<=', cutoff).limit(CLEANUP_BATCH),
    ...EXPIRING.map((name) => db.collection(name).where('deleteAt', '<=', cutoff).limit(CLEANUP_BATCH)),
  ];
  let deleted = 0;
  for (const query of queries) {
    const snap = await query.get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

export async function runMaintenance(now = Date.now()): Promise<{ closed: number; deleted: number }> {
  const closed = await closeIdleConnections(now);
  const deleted = await deleteExpired(now);
  if (closed || deleted) log.info('Maintenance finished', { closed, deleted });
  return { closed, deleted };
}

// Runs maintenance at most once per interval. The claim is taken in a
// transaction so parallel requests do not all start a sweep.
export async function maybeRunMaintenance(now = Date.now()): Promise<boolean> {
  const ref = db.collection('system').doc('maintenance');
  const claimed = await db.runTransaction(async (tx) => {
    const last = (await tx.get(ref)).data()?.lastRunAt;
    if (typeof last === 'number' && now - last < CLEANUP_INTERVAL_MS) return false;
    tx.set(ref, { lastRunAt: now });
    return true;
  });
  if (claimed) await runMaintenance(now);
  return claimed;
}
