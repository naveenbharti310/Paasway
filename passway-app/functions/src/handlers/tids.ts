import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { assertAccountActive, assertSameTestCohort } from '../lib/accounts';
import { assertContentPolicyConsent } from '../lib/contentPolicy';
import { assertNotBlocked } from '../lib/blocks';
import { withinRateLimit } from '../lib/rateLimits';
import { randomTid } from '../lib/tid';
import { coordinates, text, tidCode, isUnexpiredMillis, documentId } from '../lib/validation';
import { encodeGeohash, cellAndNeighbors } from '../geo';
import { notifyUser } from '../push';
import { TID_TTL_MS, MESSAGE_RETENTION_MS, MAX_TID_GENERATIONS_PER_HOUR, MAX_REDEMPTION_ATTEMPTS_PER_HOUR, MAX_NAME_LENGTH } from '../constants';

const INACTIVE_CODE = 'That code is not active. Ask them to generate a new one.';

export const generateTid = authedCallable(async (uid, data, caller) => {
  const { lat, lng } = coordinates(data.lat, data.lng);
  const displayName = text(data.displayName, 'Name', MAX_NAME_LENGTH);
  if (!await withinRateLimit(uid, 'generate', MAX_TID_GENERATIONS_PER_HOUR)) {
    throw new HttpsError('resource-exhausted', 'Too many codes generated recently. Try again shortly.');
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const tid = randomTid();
    const ref = db.collection('tids').doc(tid);
    const result = await db.runTransaction(async (tx) => {
      assertContentPolicyConsent(await assertAccountActive(uid, tx, caller));
      const existing = await tx.get(ref);
      if (existing.exists) return null;
      const createdAt = Date.now();
      const expiresAt = createdAt + TID_TTL_MS;
      tx.create(ref, { tid, generatorId: uid, generatorName: displayName, status: 'active', geoHash: encodeGeohash(lat, lng), createdAt, expiresAt, deleteAt: new Date(expiresAt) });
      return { tid, createdAt, expiresAt };
    });
    if (result) return result;
  }
  throw new HttpsError('resource-exhausted', 'Could not allocate a code. Try again.');
});

export const redeemTid = authedCallable(async (uid, data, caller) => {
  const tid = tidCode(data.tid);
  const { lat, lng } = coordinates(data.lat, data.lng);
  const displayName = text(data.displayName, 'Name', MAX_NAME_LENGTH);
  // Optional for backward compatibility. A new client retains this random key
  // for the same explicit intent after a lost response, not for a new pairing.
  const redemptionId = data.redemptionId;
  if (redemptionId !== undefined && (typeof redemptionId !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(redemptionId))) {
    throw new HttpsError('invalid-argument', 'Invalid connection attempt. Start again.');
  }
  if (!await withinRateLimit(uid, 'redeem_attempt', MAX_REDEMPTION_ATTEMPTS_PER_HOUR)) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Take a short break and try again.');
  }
  const tidRef = db.collection('tids').doc(tid);
  // Bind the recovery identity to the authenticated principal, never a caller-
  // supplied UID. Legacy clients still use strictly single-use random requests.
  const requestRef = redemptionId === undefined ? db.collection('connectionRequests').doc()
    : db.collection('connectionRequests').doc(createHash('sha256').update(`${uid}\0${redemptionId}`).digest('hex'));
  const result = await db.runTransaction(async (tx) => {
    const requester = await assertAccountActive(uid, tx, caller);
    assertContentPolicyConsent(requester);
    const prior = redemptionId === undefined ? undefined : (await tx.get(requestRef)).data();
    const code = (await tx.get(tidRef)).data();
    const now = Date.now();
    if (prior) {
      // Recovery cannot change names, claim a new code incarnation, reverse a
      // decline, extend expiry, or revive an ended/blocked connection.
      if (prior.requesterId !== uid || prior.requesterName !== displayName || prior.tid !== tid
        || !code || code.createdAt !== prior.tidCreatedAt || code.generatorId !== prior.generatorId
        || code.requestId !== requestRef.id || code.expiresAt !== prior.expiresAt
        || !isUnexpiredMillis(prior.expiresAt, now) || !isUnexpiredMillis(code.expiresAt, now)
        || !((prior.status === 'pending' && code.status === 'pending') || (prior.status === 'accepted' && code.status === 'connected'))) {
        throw new HttpsError('not-found', INACTIVE_CODE);
      }
    } else if (!code || code.status !== 'active' || !isUnexpiredMillis(code.expiresAt, now)) {
      throw new HttpsError('not-found', INACTIVE_CODE);
    }
    if (code.generatorId === uid) throw new HttpsError('invalid-argument', 'You cannot use your own code.');
    const generator = await assertAccountActive(code.generatorId, tx);
    assertSameTestCohort(requester, generator);
    await assertNotBlocked(tx, uid, code.generatorId);
    if (!cellAndNeighbors(code.geoHash).includes(encodeGeohash(lat, lng))) throw new HttpsError('not-found', INACTIVE_CODE);
    if (prior) {
      if (prior.status === 'accepted') {
        const connectionId = documentId(prior.connectionId, 'Connection');
        const connection = (await tx.get(db.collection('connections').doc(connectionId))).data();
        if (connection?.status !== 'active' || connection.userA !== code.generatorId || connection.userB !== uid) {
          throw new HttpsError('not-found', INACTIVE_CODE);
        }
      }
      const servedAt = Date.now();
      if (!isUnexpiredMillis(code.expiresAt, servedAt)) throw new HttpsError('not-found', INACTIVE_CODE);
      return { requestId: requestRef.id, generatorId: code.generatorId as string, expiresAt: prior.expiresAt as number, servedAt, fresh: false };
    }
    const servedAt = Date.now();
    if (!isUnexpiredMillis(code.expiresAt, servedAt)) throw new HttpsError('not-found', INACTIVE_CODE);
    tx.update(tidRef, { status: 'pending', requestId: requestRef.id });
    tx.create(requestRef, { requestId: requestRef.id, tid, tidCreatedAt: code.createdAt, expiresAt: code.expiresAt, requesterId: uid, requesterName: displayName, generatorId: code.generatorId, generatorName: code.generatorName, status: 'pending', createdAt: servedAt, deleteAt: new Date(servedAt + MESSAGE_RETENTION_MS) });
    return { requestId: requestRef.id, generatorId: code.generatorId as string, expiresAt: code.expiresAt as number, servedAt, fresh: true };
  });
  if (result.fresh) await notifyUser(result.generatorId, 'Passway', 'Someone nearby wants to connect', { type: 'request', requestId: result.requestId });
  return { requestId: result.requestId, expiresAt: result.expiresAt, servedAt: result.servedAt };
});

export const deactivateTid = authedCallable(async (uid, data) => {
  const tid = tidCode(data.tid);
  const ref = db.collection('tids').doc(tid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.generatorId !== uid) {
      throw new HttpsError('permission-denied', 'You can only deactivate a code you generated.');
    }
    if (snap.data()?.status === 'deactivated') return;
    if (snap.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'This code has already been used or has expired.');
    tx.update(ref, { status: 'deactivated' });
  });
  return {};
});
