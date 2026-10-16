import { randomUUID } from 'node:crypto';
import { db } from '../lib/firebase';
import { CLEANUP_INTERVAL_MS } from '../constants';

// Longer than the HTTP host's 60 second limit. An abandoned claim expires.
// Cleanup remains idempotent; a lease does not guarantee exactly-once work.
export const MAINTENANCE_LEASE_MS = 120_000;
type Outcome<T> = { ran: false } | { ran: true; result: T };
export async function withMaintenanceLease<T>(
  operation: () => Promise<T>,
  options: { now?: () => number; force?: boolean } = {},
): Promise<Outcome<T>> {
  const now = options.now ?? Date.now;
  const owner = randomUUID();
  const ref = db.collection('system').doc('maintenance');
  const claimed = await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() ?? {};
    const at = now();
    if (typeof data.leaseUntil === 'number' && data.leaseUntil > at) return false;
    if (!options.force && typeof data.lastRunAt === 'number' && at - data.lastRunAt < CLEANUP_INTERVAL_MS) return false;
    tx.set(ref, { ...data, leaseOwner: owner, leaseUntil: at + MAINTENANCE_LEASE_MS });
    return true;
  });
  if (!claimed) return { ran: false };
  const finish = async (success: boolean): Promise<void> => {
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() ?? {};
      if (data.leaseOwner !== owner) return;
      const at = now();
      const valid = typeof data.leaseUntil === 'number' && data.leaseUntil > at;
      delete data.leaseOwner;
      delete data.leaseUntil;
      if (success && valid) data.lastRunAt = at;
      else data.lastFailedAt = at;
      tx.set(ref, data);
    });
  };
  let result: T;
  try { result = await operation(); }
  catch (error) {
    // Preserve the operation failure if release also fails; expiry recovers it.
    try { await finish(false); } catch { /* bounded lease expires */ }
    throw error;
  }
  await finish(true);
  return { ran: true, result };
}
