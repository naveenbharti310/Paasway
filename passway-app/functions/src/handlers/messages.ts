import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { assertAccountActive, userRef } from '../lib/accounts';
import { assertContentPolicyConsent } from '../lib/contentPolicy';
import { assertNotBlocked } from '../lib/blocks';
import { withinRateLimit } from '../lib/rateLimits';
import { documentId, text, otherParticipant, type Participants } from '../lib/validation';
import { screenMessage, type ModerationResult } from '../moderation';
import { notifyUser } from '../push';
import { MESSAGE_RETENTION_MS, MAX_MESSAGES_PER_MINUTE, MAX_MESSAGE_LENGTH, FLAGS_BEFORE_REVIEW } from '../constants';

const ENDED = 'This connection has ended.';

export const sendMessage = authedCallable(async (uid, data, caller) => {
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
  // Reject an unauthorized conversation before moderation can transmit text.
  // In particular, another connection between these participants may already
  // carry a person-level block while this connection still says "active".
  // Keep the complete authorization recheck in the commit transaction too.
  const initialData = await db.runTransaction(async (tx) => {
    assertContentPolicyConsent(await assertAccountActive(uid, tx, caller));
    const snap = await tx.get(ref);
    const connection = snap.data();
    if (!snap.exists || !connection || connection.status !== 'active') throw new HttpsError('failed-precondition', ENDED);
    const recipient = otherParticipant(connection as Participants, uid);
    await assertAccountActive(recipient, tx);
    await assertNotBlocked(tx, uid, recipient);
    return connection;
  });
  const existing = key === undefined ? undefined : (await messageRef.get()).data();
  if (!existing && !await withinRateLimit(uid, 'message', MAX_MESSAGES_PER_MINUTE, 60 * 1000)) throw new HttpsError('resource-exhausted', 'You are sending messages too quickly. Try again shortly.');
  const result = existing ? replay(existing) : await screenMessage(content, Math.max(0, (Date.now() - initialData.createdAt) / 1000));
  const committed = await db.runTransaction(async (tx) => {
    const sender = await assertAccountActive(uid, tx, caller);
    assertContentPolicyConsent(sender);
    const snap = await tx.get(ref);
    const connection = snap.data();
    if (!snap.exists || !connection || connection.status !== 'active') throw new HttpsError('failed-precondition', ENDED);
    const recipient = otherParticipant(connection as Participants, uid);
    await assertAccountActive(recipient, tx);
    // A pair may already have more than one active conversation. Enforce
    // the person-level block transactionally, including retry acknowledgements.
    await assertNotBlocked(tx, uid, recipient);
    if (key !== undefined) {
      const previous = (await tx.get(messageRef)).data();
      if (previous) return { recipient, created: false, result: replay(previous) };
    }
    if (replyTo) {
      const quoted = await tx.get(ref.collection('messages').doc(replyTo));
      const deleteAt = quoted.data()?.deleteAt as { toMillis?: () => number } | undefined;
      const quotedAt = quoted.data()?.sentAt;
      const checkedAt = Date.now();
      if (
        !quoted.exists || typeof quotedAt !== 'number' || !Number.isFinite(quotedAt) ||
        quotedAt > checkedAt || quotedAt <= checkedAt - MESSAGE_RETENTION_MS ||
        (deleteAt?.toMillis && deleteAt.toMillis() <= checkedAt)
      ) {
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

// Message bodies are served only here, never through direct client Firestore
// reads. Safety-evidence retention must not extend participant read access.
export const getMessages = authedCallable(async (uid, data, caller) => {
  const connectionId = documentId(data.connectionId, 'Connection');
  if (data.latest !== undefined && typeof data.latest !== 'boolean') throw new HttpsError('invalid-argument', 'Latest must be a boolean.');
  const ref = db.collection('connections').doc(connectionId);
  if (!await withinRateLimit(uid, 'message_read', 240, 60000)) throw new HttpsError('resource-exhausted', 'Messages are refreshing too quickly. Try again shortly.');
  const messages = await db.runTransaction(async (tx) => {
    await assertAccountActive(uid, tx, caller);
    const connection = (await tx.get(ref)).data();
    if (!connection || connection.status !== 'active') throw new HttpsError('failed-precondition', ENDED);
    const other = otherParticipant(connection as Participants, uid);
    await assertAccountActive(other, tx);
    await assertNotBlocked(tx, uid, other);
    // Apply both visibility bounds before the limit: discarding future rows
    // afterwards could hide the genuine latest message or starve a whole page.
    const readAt = Date.now();
    const rows = await tx.get(ref.collection('messages')
      .where('sentAt', '>', readAt - MESSAGE_RETENTION_MS)
      .where('sentAt', '<=', readAt)
      .orderBy('sentAt', 'desc')
      .limit(data.latest ? 1 : 200));
    return rows.docs.map((row) => {
      const m = row.data();
      return { messageId: row.id, connectionId, senderId: m.senderId, content: m.content, sentAt: m.sentAt, moderationFlag: m.moderationFlag, ...(typeof m.replyTo === 'string' ? { replyTo: m.replyTo } : {}) };
    });
  });
  const servedAt = Date.now();
  // Recheck after the query/transaction: a message can expire while awaiting IO.
  return { servedAt, messages: messages.filter((m) => typeof m.sentAt === 'number' && Number.isFinite(m.sentAt) && m.sentAt > servedAt - MESSAGE_RETENTION_MS && m.sentAt <= servedAt).reverse() };
});
