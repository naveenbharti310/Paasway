import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { assertAccountActive, userRef } from '../lib/accounts';
import { withinRateLimit } from '../lib/rateLimits';
import { documentId, text, otherParticipant, type Participants } from '../lib/validation';
import { screenMessage, type ModerationResult } from '../moderation';
import { notifyUser } from '../push';
import { MESSAGE_RETENTION_MS, MAX_MESSAGES_PER_MINUTE, MAX_MESSAGE_LENGTH, FLAGS_BEFORE_REVIEW } from '../constants';

const ENDED = 'This connection has ended.';

export const sendMessage = authedCallable(async (uid, data) => {
  const connectionId = documentId(data.connectionId, 'Connection');
  const content = text(data.content, 'Message', MAX_MESSAGE_LENGTH);
  // A reply only stores the ID of the earlier message, never a copy of its
  // text, so the quoted words are still deleted on the original's schedule.
  const replyTo = data.replyTo === undefined || data.replyTo === null ? undefined : documentId(data.replyTo, 'Reply');
  const key = data.clientMessageId;
  if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(key))) {
    throw new HttpsError('invalid-argument', 'Message retry key is not valid.');
  }
  const ref = db.collection('connections').doc(connectionId);
  // Sender-scoped: another participant cannot claim or overwrite this key.
  const messageRef = key === undefined ? ref.collection('messages').doc()
    : ref.collection('messages').doc(createHash('sha256').update(JSON.stringify([uid, key])).digest('hex'));
  const replay = (message: FirebaseFirestore.DocumentData): ModerationResult => {
    if (message.senderId !== uid || message.content !== content || (message.replyTo ?? null) !== (replyTo ?? null)) {
      throw new HttpsError('failed-precondition', 'This retry does not match the original message.');
    }
    return { flag: message.moderationFlag, earlyContactShare: message.earlyContactShare === true };
  };
  const initial = await ref.get();
  const initialData = initial.data();
  if (!initial.exists || !initialData || initialData.status !== 'active') throw new HttpsError('failed-precondition', ENDED);
  otherParticipant(initialData as Participants, uid);
  const existing = key === undefined ? undefined : (await messageRef.get()).data();
  if (!existing && !await withinRateLimit(uid, 'message', MAX_MESSAGES_PER_MINUTE, 60 * 1000)) throw new HttpsError('resource-exhausted', 'You are sending messages too quickly. Try again shortly.');
  const result = existing ? replay(existing) : await screenMessage(content, Math.max(0, (Date.now() - initialData.createdAt) / 1000));
  const committed = await db.runTransaction(async (tx) => {
    const sender = await assertAccountActive(uid, tx);
    const snap = await tx.get(ref);
    const connection = snap.data();
    if (!snap.exists || !connection || connection.status !== 'active') throw new HttpsError('failed-precondition', ENDED);
    const recipient = otherParticipant(connection as Participants, uid);
    await assertAccountActive(recipient, tx);
    if (key !== undefined) {
      const previous = (await tx.get(messageRef)).data();
      if (previous) return { recipient, created: false, result: replay(previous) };
    }
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
    tx.create(messageRef, { messageId: messageRef.id, connectionId, senderId: uid, content, sentAt, moderationFlag: result.flag, earlyContactShare: result.earlyContactShare, deleteAt: new Date(sentAt + MESSAGE_RETENTION_MS), ...(replyTo ? { replyTo } : {}) });
    tx.update(ref, { lastActivityAt: sentAt });
    if (result.flag !== 'none') {
      // Repeated flagged messages put the sender in the review queue, the
      // same state a report produces. A ban is never lowered.
      const flagCount = (typeof sender.flagCount === 'number' ? sender.flagCount : 0) + 1;
      const review = flagCount >= FLAGS_BEFORE_REVIEW && sender.status === 'active';
      tx.update(userRef(uid), { flagCount, lastFlaggedAt: sentAt, ...(review ? { status: 'reported' } : {}) });
    }
    return { recipient, created: true, result };
  });
  if (committed.created) await notifyUser(committed.recipient, 'Passway', 'You have a new message', { type: 'message', connectionId });
  return committed.result;
});
