import { HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { assertAccountActive, assertSameTestCohort } from '../lib/accounts';
import { assertNotBlocked } from '../lib/blocks';
import { documentId } from '../lib/validation';
import { connectionRef, endConnectionAs } from '../services/connections';
import { runMaintenance } from '../services/cleanup';

export const respondToRequest = authedCallable(async (uid, data) => {
  const requestId = documentId(data.requestId, 'Request');
  if (typeof data.accept !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether to accept the request.');
  const requestRef = db.collection('connectionRequests').doc(requestId);
  const newConnectionRef = db.collection('connections').doc();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    const pending = snap.data();
    if (!snap.exists || pending?.generatorId !== uid) {
      throw new HttpsError('failed-precondition', 'This request is no longer available.');
    }
    // A lost HTTP acknowledgement must not create another connection. A replay
    // is allowed only for the same decision and an existing active pairing.
    if (pending.status === 'accepted' && data.accept && typeof pending.connectionId === 'string') {
      const existing = (await tx.get(connectionRef(pending.connectionId))).data();
      if (existing?.status !== 'active' || existing.userA !== uid || existing.userB !== pending.requesterId) {
        throw new HttpsError('failed-precondition', 'This request is no longer available.');
      }
      const generator = await assertAccountActive(uid, tx);
      const requester = await assertAccountActive(pending.requesterId, tx);
      assertSameTestCohort(generator, requester);
      await assertNotBlocked(tx, uid, pending.requesterId);
      return { connectionId: pending.connectionId };
    }
    if (pending.status === 'declined' && !data.accept) return {};
    if (pending.status !== 'pending') throw new HttpsError('failed-precondition', 'This request is no longer available.');
    const tidRef = db.collection('tids').doc(pending.tid);
    const codeSnap = await tx.get(tidRef);
    const code = codeSnap.data();
    if (!codeSnap.exists || code?.status !== 'pending' || code.requestId !== requestId || code.createdAt !== pending.tidCreatedAt) {
      throw new HttpsError('failed-precondition', 'This request is no longer available.');
    }
    if (data.accept) {
      const now = Date.now();
      if (pending.expiresAt <= now || code.expiresAt <= now) throw new HttpsError('failed-precondition', 'This request has expired.');
      if (pending.requesterId === uid) throw new HttpsError('failed-precondition', 'A connection needs two different people.');
      const generator = await assertAccountActive(uid, tx);
      const requester = await assertAccountActive(pending.requesterId, tx);
      assertSameTestCohort(generator, requester);
      await assertNotBlocked(tx, uid, pending.requesterId);
      tx.create(newConnectionRef, { connectionId: newConnectionRef.id, userA: uid, userAName: pending.generatorName, userB: pending.requesterId, userBName: pending.requesterName, status: 'active', createdAt: now, lastActivityAt: now });
      tx.update(requestRef, { status: 'accepted', connectionId: newConnectionRef.id });
      tx.update(tidRef, { status: 'connected' });
      return { connectionId: newConnectionRef.id };
    }
    tx.update(requestRef, { status: 'declined' });
    tx.update(tidRef, { status: 'expired' });
    return {};
  });
});

export const endConnection = authedCallable(async (uid, data) => {
  await endConnectionAs(connectionRef(documentId(data.connectionId, 'Connection')), uid);
  return {};
});

export const closeIdleConnectionsJob = onSchedule({ schedule: 'every 60 minutes', retryCount: 1 }, async () => {
  await runMaintenance();
});
