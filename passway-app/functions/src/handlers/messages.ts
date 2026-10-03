import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { assertAccountActive, userRef } from '../lib/accounts';
import { withinRateLimit } from '../lib/rateLimits';
import { documentId, text, otherParticipant, type Participants } from '../lib/validation';
import { screenMessage } from '../moderation';
import { notifyUser } from '../push';
import { MESSAGE_RETENTION_MS, MAX_MESSAGES_PER_MINUTE, MAX_MESSAGE_LENGTH, FLAGS_BEFORE_REVIEW } from '../constants';

const ENDED = 'This connection has ended.';

export const sendMessage = authedCallable(async (uid, data) => {
  const connectionId = documentId(data.connectionId, 'Connection');
  const content = text(data.content, 'Message', MAX_MESSAGE_LENGTH);
  // A reply only stores the ID of the earlier message, never a copy of its
  // text, so the quoted words are still deleted on the original's schedule.
  const replyTo = data.replyTo === undefined || data.replyTo === null ? undefined : documentId(data.replyTo, 'Reply');
  const ref = db.collection('connections').doc(connectionId);
  const initial = await ref.get();
  const initialData = initial.data();
  if (!initial.exists || !initialData || initialData.status !== 'active') throw new HttpsError('failed-precondition', ENDED);
  otherParticipant(initialData as Participants, uid);
  if (!await withinRateLimit(uid, 'message', MAX_MESSAGES_PER_MINUTE, 60 * 1000)) throw new HttpsError('resource-exhausted', 'You are sending messages too quickly. Try again shortly.');
  const result = await screenMessage(content, Math.max(0, (Date.now() - initialData.createdAt) / 1000));
  const messageRef = ref.collection('messages').doc();
  const otherId = await db.runTransaction(async (tx) => {
    const sender = await assertAccountActive(uid, tx);
    const snap = await tx.get(ref);
    const connection = snap.data();
    if (!snap.exists || !connection || connection.status !== 'active') throw new HttpsError('failed-precondition', ENDED);
    const recipient = otherParticipant(connection as Participants, uid);
    await assertAccountActive(recipient, tx);
    if (replyTo) {
      const quoted = await tx.get(ref.collection('messages').doc(replyTo));
      const deleteAt = quoted.data()?.deleteAt as { toMillis?: () => number } | undefined;
      if (!quoted.exists || (deleteAt?.toMillis && deleteAt.toMillis() <= Date.now())) {
        throw new HttpsError('failed-precondition', 'The message you replied to is no longer available.');
      }
    }
    const sentAt = Date.now();
    // Every message carries its own expiry from the moment it is written, so
    // retention holds even if a connection is never ended.
    tx.create(messageRef, { messageId: messageRef.id, connectionId, senderId: uid, content, sentAt, moderationFlag: result.flag, deleteAt: new Date(sentAt + MESSAGE_RETENTION_MS), ...(replyTo ? { replyTo } : {}) });
    tx.update(ref, { lastActivityAt: sentAt });
    if (result.flag !== 'none') {
      // Repeated flagged messages put the sender in the review queue, the
      // same state a report produces. A ban is never lowered.
      const flagCount = (typeof sender.flagCount === 'number' ? sender.flagCount : 0) + 1;
      const review = flagCount >= FLAGS_BEFORE_REVIEW && sender.status === 'active';
      tx.update(userRef(uid), { flagCount, lastFlaggedAt: sentAt, ...(review ? { status: 'reported' } : {}) });
    }
    return recipient;
  });
  await notifyUser(otherId, 'Passway', 'You have a new message', { type: 'message', connectionId });
  return result;
});
