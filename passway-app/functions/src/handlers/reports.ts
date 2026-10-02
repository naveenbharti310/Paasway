import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { REPORTED_MESSAGE_RETENTION_DAYS } from '../constants';

export const fileReport = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { connectionId, reportedId, reason } = request.data;
  if (typeof connectionId !== 'string' || typeof reportedId !== 'string' || typeof reason !== 'string' || !reason.trim()) {
    throw new HttpsError('invalid-argument', 'Connection, reported user, and a reason are required.');
  }

  const connectionRef = db.collection('connections').doc(connectionId);
  const connectionSnap = await connectionRef.get();
  const connectionData = connectionSnap.data();
  if (!connectionSnap.exists) throw new HttpsError('not-found', 'Connection not found.');
  if (![connectionData?.userA, connectionData?.userB].includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a participant in this connection.');
  }

  const reportRef = db.collection('reports').doc();
  await reportRef.set({
    reportId: reportRef.id,
    reporterId: uid,
    reportedId,
    connectionId,
    reason: reason.trim().slice(0, 200),
    createdAt: Date.now(),
  });

  // Filing a report always ends the connection in the same step,
  // reporting someone and continuing to chat with them is not a state
  // this app allows. Extends retention so there is time to review it,
  // instead of the usual 72 hour window.
  const holdUntil = new Date(Date.now() + REPORTED_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const wasActive = connectionData?.status === 'active';
  await connectionRef.update({
    deleteAt: holdUntil,
    status: 'ended',
    ...(wasActive ? { endedBy: uid, endedAt: Date.now() } : {}),
  });
  const messages = await connectionRef.collection('messages').get();
  const batch = db.batch();
  messages.forEach((m) => batch.update(m.ref, { deleteAt: holdUntil }));
  await batch.commit();

  // Marks the account as reported so it is visible for review, without
  // auto banning off a single report, that would make the report button
  // itself a way to grief someone. Never downgrades an existing ban.
  const reportedRef = db.collection('users').doc(reportedId);
  const reportedSnap = await reportedRef.get();
  if (reportedSnap.exists && reportedSnap.data()?.status === 'active') {
    await reportedRef.update({ status: 'reported' });
  }

  return { reportId: reportRef.id };
});
