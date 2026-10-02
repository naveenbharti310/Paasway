import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { screenMessage } from '../moderation';

export const sendMessage = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { connectionId, content } = request.data;
  if (typeof content !== 'string' || !content.trim()) {
    throw new HttpsError('invalid-argument', 'Message cannot be empty.');
  }

  const connectionRef = db.collection('connections').doc(connectionId);
  const connectionSnap = await connectionRef.get();
  const connectionData = connectionSnap.data();
  if (!connectionSnap.exists || connectionData?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'This connection has ended.');
  }
  if (![connectionData.userA, connectionData.userB].includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a participant in this connection.');
  }

  const ageSeconds = (Date.now() - connectionData.createdAt) / 1000;
  const { flag, earlyContactShare } = await screenMessage(content, ageSeconds);

  const messageRef = connectionRef.collection('messages').doc();
  await messageRef.set({
    messageId: messageRef.id,
    connectionId,
    senderId: uid,
    content,
    sentAt: Date.now(),
    moderationFlag: flag,
  });

  // Messages are still delivered even when flagged. Blocking them
  // outright is a worse experience and tips off anyone probing the
  // filter for what it catches. Flags get reviewed from the moderation
  // log instead. earlyContactShare drives the one time safety nudge on
  // the client, it is not itself a moderation action.
  return { flag, earlyContactShare };
});
