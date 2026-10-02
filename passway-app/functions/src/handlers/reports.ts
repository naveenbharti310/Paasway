import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { recordBlock } from '../lib/blocks';
import { withinRateLimit } from '../lib/rateLimits';
import { documentId, text } from '../lib/validation';
import { retentionDate, applyMessageRetention } from '../lib/retention';
import { connectionRef, loadParticipantConnection, markEnded } from '../services/connections';
import { REPORTED_RETENTION_MS, MAX_SAFETY_ACTIONS_PER_HOUR, MAX_REASON_LENGTH } from '../constants';

async function safetyRateLimit(uid: string): Promise<void> {
  if (!await withinRateLimit(uid, 'safety', MAX_SAFETY_ACTIONS_PER_HOUR)) throw new HttpsError('resource-exhausted', 'Too many attempts. Try again shortly.');
}

export const fileReport = authedCallable(async (uid, data) => {
  const connectionId = documentId(data.connectionId, 'Connection');
  const reportedId = documentId(data.reportedId, 'Reported user');
  const reason = text(data.reason, 'Reason', MAX_REASON_LENGTH);
  await safetyRateLimit(uid);
  const ref = connectionRef(connectionId);
  const reportId = createHash('sha256').update(JSON.stringify([connectionId, uid])).digest('hex');
  const reportRef = db.collection('reports').doc(reportId);
  await db.runTransaction(async (tx) => {
    const { connection, otherId } = await loadParticipantConnection(tx, ref, uid);
    if (reportedId !== otherId) throw new HttpsError('invalid-argument', 'Only the other participant can be reported.');
    const existing = await tx.get(reportRef);
    const reportedRef = db.collection('users').doc(reportedId);
    const reported = await tx.get(reportedRef);
    if (existing.exists) return;
    const now = Date.now();
    const hold = retentionDate(connection.deleteAt, new Date(now + REPORTED_RETENTION_MS));
    tx.create(reportRef, { reportId, reporterId: uid, reportedId, connectionId, reason, status: 'open', createdAt: now, deleteAt: hold });
    markEnded(tx, ref, connection, uid, now, { reportedAt: now, reportedBy: uid }, hold);
    recordBlock(tx, uid, reportedId, connectionId, now);
    if (reported.exists && reported.data()?.status === 'active') tx.update(reportedRef, { status: 'reported' });
  });
  await applyMessageRetention(ref);
  return { reportId };
});

export const blockUser = authedCallable(async (uid, data) => {
  const connectionId = documentId(data.connectionId, 'Connection');
  await safetyRateLimit(uid);
  const ref = connectionRef(connectionId);
  await db.runTransaction(async (tx) => {
    const { connection, otherId } = await loadParticipantConnection(tx, ref, uid);
    const now = Date.now();
    markEnded(tx, ref, connection, uid, now, { blockedBy: uid });
    recordBlock(tx, uid, otherId, connectionId, now);
  });
  await applyMessageRetention(ref);
  return {};
});
