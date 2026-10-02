import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { documentId, payload, text, otherParticipant } from '../lib/validation';
import { retentionDate, applyMessageRetention } from '../lib/retention';
import { REPORTED_MESSAGE_RETENTION_DAYS } from '../constants';

export const fileReport = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = payload(request.data);
  const connectionId = documentId(data.connectionId, 'Connection');
  const reportedId = documentId(data.reportedId, 'Reported user');
  const reason = text(data.reason, 'Reason', 200);
  const connectionRef = db.collection('connections').doc(connectionId);
  const reportId = createHash('sha256').update(JSON.stringify([connectionId, uid])).digest('hex');
  const reportRef = db.collection('reports').doc(reportId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(connectionRef);
    const connection = snap.data();
    if (!snap.exists || !connection) throw new HttpsError('not-found', 'Connection not found.');
    const otherId = otherParticipant(connection as { userA: string; userB: string }, uid);
    if (reportedId !== otherId) throw new HttpsError('invalid-argument', 'Only the other participant can be reported.');
    const existing = await tx.get(reportRef);
    const reportedRef = db.collection('users').doc(reportedId);
    const reported = await tx.get(reportedRef);
    if (existing.exists) return;
    const now = Date.now();
    const deleteAt = retentionDate(connection.deleteAt, new Date(now + REPORTED_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
    tx.create(reportRef, { reportId, reporterId: uid, reportedId, connectionId, reason, createdAt: now, deleteAt });
    tx.update(connectionRef, { status: 'ended', endedBy: connection.endedBy ?? uid, endedAt: connection.endedAt ?? now, reportedAt: now, reportedBy: uid, deleteAt });
    if (reported.exists && reported.data()?.status === 'active') tx.update(reportedRef, { status: 'reported' });
  });
  await applyMessageRetention(connectionRef);
  return { reportId };
});
