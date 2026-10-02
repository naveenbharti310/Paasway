import { db } from './firebase';

export async function withinRateLimit(uid: string, counterName: string, max: number, windowMs = 60 * 60 * 1000): Promise<boolean> {
  const ref = db.collection('rateLimits').doc(`${uid}_${counterName}`);
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const snap = await tx.get(ref);
    const stored = snap.data()?.events;
    const events: number[] = Array.isArray(stored) ? stored.filter((t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t > now - windowMs) : [];
    if (events.length >= max) return false;
    events.push(now);
    tx.set(ref, { events, deleteAt: new Date(now + windowMs) });
    return true;
  });
}
