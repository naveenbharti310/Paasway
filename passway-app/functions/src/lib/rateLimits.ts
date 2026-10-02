import { db } from './firebase';

// A rolling window counter stored per user per action, wrapped in a
// transaction. Read-then-write without one would let a burst of
// concurrent calls all read the same count before any of them writes,
// quietly defeating the limit under load.
export async function withinRateLimit(uid: string, counterName: string, max: number): Promise<boolean> {
  const ref = db.collection('rateLimits').doc(`${uid}_${counterName}`);
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const events: number[] = (snap.data()?.events ?? []).filter((t: number) => t > hourAgo);
    if (events.length >= max) return false;
    events.push(Date.now());
    tx.set(ref, { events });
    return true;
  });
}
