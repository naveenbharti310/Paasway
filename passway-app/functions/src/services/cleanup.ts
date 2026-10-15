import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { log } from '../lib/logger';
import { closeIdleConnections } from './connections';
import { CLEANUP_BATCH, CLEANUP_INTERVAL_MS } from '../constants';

const EXPIRING = ['tids', 'connectionRequests', 'connections', 'reports', 'rateLimits', 'accountHolds'];

// Candidate queries are hints, not authority: reports can extend retention
// after selection. Revalidate in bounded transactions before deleting anything.
const TRANSACTION_CHUNK = 25;
function expiryMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis();
  }
  return Number.POSITIVE_INFINITY;
}

export async function deleteExpired(now = Date.now()): Promise<number> {
  const cutoff = new Date(now);
  const queries = [
    db.collectionGroup('messages').where('deleteAt', '<=', cutoff).limit(CLEANUP_BATCH),
    ...EXPIRING.map((name) => db.collection(name).where('deleteAt', '<=', cutoff).limit(CLEANUP_BATCH)),
  ];
  let deleted = 0;
  for (const query of queries) {
    const candidates = (await query.get()).docs;
    for (let offset = 0; offset < candidates.length; offset += TRANSACTION_CHUNK) {
      deleted += await db.runTransaction(async (tx) => {
        const live = await Promise.all(candidates.slice(offset, offset + TRANSACTION_CHUNK).map((candidate) => tx.get(candidate.ref)));
        const parents = new Map<string, Promise<DocumentSnapshot>>();
        const plans = await Promise.all(live.map(async (snap) => {
          if (!snap.exists || expiryMillis(snap.data()?.deleteAt) > now) return null;
          const ref = snap.ref;
          if (ref.parent.id === 'messages' && ref.parent.parent) {
            const parentRef = ref.parent.parent;
            let read = parents.get(parentRef.path);
            if (!read) { read = tx.get(parentRef); parents.set(parentRef.path, read); }
            const parent = await read;
            const data = parent.data();
            if (data?.status === 'ended' && expiryMillis(data.deleteAt) > now && data.deleteAt) {
              return { ref, repair: data.deleteAt };
            }
          }
          if (ref.parent.id === 'connections') {
            if (snap.data()?.status !== 'ended') return null;
            // Firestore does not cascade subcollections. Keep the parent until
            // every child has drained, including children beyond this page.
            if ((await tx.get(ref.collection('messages').limit(1))).docs.length) return null;
          }
          return { ref, repair: null };
        }));
        let count = 0;
        // All transaction reads must finish before any write.
        for (const plan of plans) {
          if (!plan) continue;
          if (plan.repair) tx.update(plan.ref, { deleteAt: plan.repair });
          else { tx.delete(plan.ref); count++; }
        }
        return count;
      });
    }
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
