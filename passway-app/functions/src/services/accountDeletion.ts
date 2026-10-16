import { HttpsError } from 'firebase-functions/v2/https';
import { db, auth } from '../lib/firebase';
import { userRef, holdRef } from '../lib/accounts';
import { markEnded } from './connections';
import { REPORTED_HOLD_MS } from '../constants';
import { log } from '../lib/logger';

export async function requestAccountDeletion(uid: string, phoneHash?: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ref = userRef(uid), jobRef = db.collection('accountDeletions').doc(uid);
    const [profile, job] = await Promise.all([tx.get(ref), tx.get(jobRef)]);
    if (job.exists) return;
    const user = profile.data();
    const hash = typeof user?.phoneHash === 'string' ? user.phoneHash : phoneHash;
    tx.create(jobRef, { uid, status: 'pending', lastAttemptAt: 0, attempts: 0, requestedAt: Date.now(), previousStatus: user?.status ?? 'active', ...(hash ? { phoneHash: hash } : {}) });
    // Every connection/message writer reads this document in its transaction.
    if (profile.exists) tx.update(ref, { status: 'deleting' });
  });
}

// Each invocation makes bounded, idempotent progress. The pending job survives
// process death, client disconnects and Firebase Auth outages. No new queue.
export async function resumeAccountDeletion(uid: string): Promise<{ pending: boolean }> {
  const ref = userRef(uid), jobRef = db.collection('accountDeletions').doc(uid);
  const job = (await jobRef.get()).data();
  if (!job || job.status !== 'pending') return { pending: false };
  await db.runTransaction(async (tx) => { const current = (await tx.get(jobRef)).data(); if (current?.status === 'pending') tx.update(jobRef, { lastAttemptAt: Date.now(), attempts: (current.attempts ?? 0) + 1 }); });
  let more = false;
  for (const field of ['userA', 'userB'] as const) {
    const open = await db.collection('connections').where(field, '==', uid).where('status', '==', 'active').limit(25).get();
    for (const doc of open.docs) await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref), connection = snap.data();
      if (connection?.status === 'active') markEnded(tx, doc.ref, connection, uid, Date.now(), { endReason: 'account_deleted' });
    });
    more ||= open.size === 25;
  }
  // Account guards already prevent acceptance after deletion intent, but peers
  // must not remain waiting on a request whose account has finished deleting.
  // Bound both directions and re-read the request/code before any writes: a
  // selection may be stale, and a four-character code may have been reallocated.
  for (const field of ['generatorId', 'requesterId'] as const) {
    const pending = await db.collection('connectionRequests').where(field, '==', uid).where('status', '==', 'pending').limit(25).get();
    for (const doc of pending.docs) await db.runTransaction(async (tx) => {
      const request = (await tx.get(doc.ref)).data();
      if (request?.status !== 'pending' || (request.generatorId !== uid && request.requesterId !== uid)) return;
      const tidRef = typeof request.tid === 'string' && /^[A-Z0-9]{4}$/.test(request.tid)
        ? db.collection('tids').doc(request.tid) : undefined;
      const code = tidRef ? (await tx.get(tidRef)).data() : undefined;
      tx.update(doc.ref, { status: 'declined' });
      if (tidRef && code?.status === 'pending' && code.requestId === doc.id &&
        code.generatorId === request.generatorId && typeof request.tidCreatedAt === 'number' &&
        Number.isFinite(request.tidCreatedAt) && code.createdAt === request.tidCreatedAt) {
        tx.update(tidRef, { status: 'expired' });
      }
    });
    more ||= pending.size === 25;
  }
  // Parent retention is authoritative to transactional cleanup; do not fan out
  // through an unbounded number of child message pages inside account deletion.
  const codes = await db.collection('tids').where('generatorId', '==', uid).where('status', '==', 'active').limit(100).get();
  for (const doc of codes.docs) await db.runTransaction(async (tx) => {
    const snap = await tx.get(doc.ref);
    if (snap.data()?.status === 'active') tx.update(doc.ref, { status: 'deactivated' });
  });
  more ||= codes.size === 100;
  const notes = await ref.collection('notes').limit(100).get();
  await Promise.all(notes.docs.map((doc) => doc.ref.delete()));
  more ||= notes.size === 100;
  if (more) return { pending: true };
  await Promise.all(['generate', 'redeem_attempt', 'message', 'message_read', 'safety'].map((name) => db.collection('rateLimits').doc(`${uid}_${name}`).delete()));
  await db.runTransaction(async (tx) => {
    const [current, reported] = await Promise.all([tx.get(ref), tx.get(db.collection('reports').where('reportedId', '==', uid).limit(1))]);
    if (typeof job.phoneHash !== 'string') return;
    const heldRef = holdRef(job.phoneHash), hold = (await tx.get(heldRef)).data();
    const banned = job.previousStatus === 'banned' || current.data()?.status === 'banned';
    const reviewed = job.previousStatus === 'reported' || current.data()?.status === 'reported' || reported.docs.length > 0;
    if (hold?.status === 'banned' || (!banned && !reviewed)) return;
    // Deletion must not replace a restrictive/unknown phone policy with the
    // weaker review state. A permanent ban may still strengthen any hold.
    if (!banned && hold) return;
    tx.set(heldRef, { status: banned ? 'banned' : 'reported', updatedAt: Date.now(), ...(!banned ? { deleteAt: new Date(Date.now() + REPORTED_HOLD_MS) } : {}) });
  });
  // Keep the deleting profile until this external operation succeeds. A crash
  // after Auth deletion is harmless: user-not-found is success on the next run.
  try { await auth.deleteUser(uid); }
  catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') {
      log.error('Account deletion will retry', { uid });
      throw new HttpsError('unavailable', 'Account deletion is in progress. Try again shortly.');
    }
  }
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(jobRef)).data();
    if (current?.status !== 'pending') return;
    tx.delete(ref);
    // Seven-day old-UID tombstone prevents a cached ID token recreating the
    // profile. New sign-ins receive a new Firebase UID. Never store raw phones.
    tx.set(jobRef, { uid, status: 'complete', completedAt: Date.now(), deleteAt: new Date(Date.now() + 7 * 86400000), ...(job.phoneHash ? { phoneHash: job.phoneHash } : {}) });
  });
  return { pending: false };
}

export async function resumePendingAccountDeletions(): Promise<number> {
  const jobs = await db.collection('accountDeletions').where('status', '==', 'pending').orderBy('lastAttemptAt', 'asc').limit(1).get();
  let completed = 0;
  for (const job of jobs.docs) {
    try { if (!(await resumeAccountDeletion(job.id)).pending) completed++; }
    catch { log.error('Pending account deletion did not finish', { uid: job.id }); }
  }
  return completed;
}
