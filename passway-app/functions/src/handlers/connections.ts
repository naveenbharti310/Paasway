import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { MESSAGE_RETENTION_HOURS } from '../constants';

export const respondToRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { requestId, accept } = request.data;

  const requestRef = db.collection('connectionRequests').doc(requestId);
  const connectionRef = db.collection('connections').doc();

  const result = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    const requestData = requestSnap.data();
    if (!requestSnap.exists || requestData?.generatorId !== uid || requestData.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This request is no longer available.');
    }

    if (!accept) {
      tx.update(requestRef, { status: 'declined' });
      tx.update(db.collection('tids').doc(requestData.tid), { status: 'expired' });
      return {};
    }

    tx.set(connectionRef, {
      connectionId: connectionRef.id,
      userA: requestData.generatorId,
      userAName: requestData.generatorName,
      userB: requestData.requesterId,
      userBName: requestData.requesterName,
      originTid: requestData.tid,
      status: 'active',
      createdAt: Date.now(),
    });
    tx.update(requestRef, { status: 'accepted', connectionId: connectionRef.id });
    tx.update(db.collection('tids').doc(requestData.tid), { status: 'connected' });
    return { connectionId: connectionRef.id };
  });

  return result;
});

// Either participant can end a connection at any time. Messages are
// marked for deletion 72 hours out, matching the retention window in
// the architecture doc, via a deleteAt field a Firestore TTL policy
// watches. fileReport pushes that date out to 30 days if a
// report comes in before the window closes.
export const endConnection = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { connectionId } = request.data;

  const connectionRef = db.collection('connections').doc(connectionId);
  const connectionSnap = await connectionRef.get();
  const connectionData = connectionSnap.data();
  if (!connectionSnap.exists) throw new HttpsError('not-found', 'Connection not found.');
  if (![connectionData?.userA, connectionData?.userB].includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a participant in this connection.');
  }

  const deleteAt = new Date(Date.now() + MESSAGE_RETENTION_HOURS * 60 * 60 * 1000);
  await connectionRef.update({ status: 'ended', endedBy: uid, endedAt: Date.now(), deleteAt });

  const messages = await connectionRef.collection('messages').get();
  const batch = db.batch();
  messages.forEach((m) => batch.update(m.ref, { deleteAt }));
  await batch.commit();

  return {};
});
