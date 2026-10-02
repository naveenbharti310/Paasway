import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { assertNotBanned } from '../lib/accounts';
import { payload, documentId, otherParticipant } from '../lib/validation';
import { retentionDate, applyMessageRetention } from '../lib/retention';
import { MESSAGE_RETENTION_HOURS } from '../constants';

export const respondToRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = payload(request.data);
  const requestId = documentId(data.requestId, 'Request');
  if (typeof data.accept !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether to accept the request.');
  const requestRef = db.collection('connectionRequests').doc(requestId);
  const connectionRef = db.collection('connections').doc();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    const pending = snap.data();
    if (!snap.exists || pending?.generatorId !== uid || pending.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This request is no longer available.');
    }
    const tidRef = db.collection('tids').doc(pending.tid);
    const codeSnap = await tx.get(tidRef);
    const code = codeSnap.data();
    if (!codeSnap.exists || code?.status !== 'pending' || code.requestId !== requestId || code.createdAt !== pending.tidCreatedAt) {
      throw new HttpsError('failed-precondition', 'This request is no longer available.');
    }
    if (data.accept) {
      if (pending.expiresAt <= Date.now() || code.expiresAt <= Date.now()) throw new HttpsError('failed-precondition', 'This request has expired.');
      await assertNotBanned(uid, tx);
      await assertNotBanned(pending.requesterId, tx);
      if (pending.requesterId === uid) throw new HttpsError('failed-precondition', 'A connection needs two different people.');
      tx.create(connectionRef, { connectionId: connectionRef.id, userA: uid, userAName: pending.generatorName, userB: pending.requesterId, userBName: pending.requesterName, originTid: pending.tid, status: 'active', createdAt: Date.now() });
      tx.update(requestRef, { status: 'accepted', connectionId: connectionRef.id });
      tx.update(tidRef, { status: 'connected' });
      return { connectionId: connectionRef.id };
    }
    tx.update(requestRef, { status: 'declined' });
    tx.update(tidRef, { status: 'expired' });
    return {};
  });
});

export const endConnection = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const connectionId = documentId(payload(request.data).connectionId, 'Connection');
  const connectionRef = db.collection('connections').doc(connectionId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(connectionRef);
    const connection = snap.data();
    if (!snap.exists || !connection) throw new HttpsError('not-found', 'Connection not found.');
    otherParticipant(connection as { userA: string; userB: string }, uid);
    const endedAt = connection.endedAt ?? Date.now();
    const deleteAt = retentionDate(connection.deleteAt, new Date(endedAt + MESSAGE_RETENTION_HOURS * 60 * 60 * 1000));
    tx.update(connectionRef, { status: 'ended', endedBy: connection.endedBy ?? uid, endedAt, deleteAt });
  });
  await applyMessageRetention(connectionRef);
  return {};
});
