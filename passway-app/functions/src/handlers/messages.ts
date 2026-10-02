import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { assertNotBanned } from '../lib/accounts';
import { withinRateLimit } from '../lib/rateLimits';
import { documentId, payload, text, otherParticipant } from '../lib/validation';
import { screenMessage } from '../moderation';

export const sendMessage = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = payload(request.data);
  const connectionId = documentId(data.connectionId, 'Connection');
  const content = text(data.content, 'Message', 2000);
  const connectionRef = db.collection('connections').doc(connectionId);
  const initial = await connectionRef.get();
  const initialData = initial.data();
  if (!initial.exists || !initialData || initialData.status !== 'active') throw new HttpsError('failed-precondition', 'This connection has ended.');
  otherParticipant(initialData as { userA: string; userB: string }, uid);
  if (!await withinRateLimit(uid, 'message', 60, 60 * 1000)) throw new HttpsError('resource-exhausted', 'You are sending messages too quickly. Try again shortly.');
  const result = await screenMessage(content, Math.max(0, (Date.now() - initialData.createdAt) / 1000));
  const messageRef = connectionRef.collection('messages').doc();
  await db.runTransaction(async (tx) => {
    await assertNotBanned(uid, tx);
    const snap = await tx.get(connectionRef);
    const connection = snap.data();
    if (!snap.exists || !connection || connection.status !== 'active') throw new HttpsError('failed-precondition', 'This connection has ended.');
    const otherId = otherParticipant(connection as { userA: string; userB: string }, uid);
    await assertNotBanned(otherId, tx);
    tx.create(messageRef, { messageId: messageRef.id, connectionId, senderId: uid, content, sentAt: Date.now(), moderationFlag: result.flag });
  });
  return result;
});
