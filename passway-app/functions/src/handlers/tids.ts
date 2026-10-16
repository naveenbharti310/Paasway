import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { assertAccountActive, assertSameTestCohort } from '../lib/accounts';
import { assertNotBlocked } from '../lib/blocks';
import { withinRateLimit } from '../lib/rateLimits';
import { randomTid } from '../lib/tid';
import { coordinates, text, tidCode, isUnexpiredMillis } from '../lib/validation';
import { encodeGeohash, cellAndNeighbors } from '../geo';
import { notifyUser } from '../push';
import { TID_TTL_MS, MESSAGE_RETENTION_MS, MAX_TID_GENERATIONS_PER_HOUR, MAX_REDEMPTION_ATTEMPTS_PER_HOUR, MAX_NAME_LENGTH } from '../constants';

const INACTIVE_CODE = 'That code is not active. Ask them to generate a new one.';

export const generateTid = authedCallable(async (uid, data) => {
  const { lat, lng } = coordinates(data.lat, data.lng);
  const displayName = text(data.displayName, 'Name', MAX_NAME_LENGTH);
  if (!await withinRateLimit(uid, 'generate', MAX_TID_GENERATIONS_PER_HOUR)) {
    throw new HttpsError('resource-exhausted', 'Too many codes generated recently. Try again shortly.');
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const tid = randomTid();
    const ref = db.collection('tids').doc(tid);
    const result = await db.runTransaction(async (tx) => {
      await assertAccountActive(uid, tx);
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

export const redeemTid = authedCallable(async (uid, data) => {
  const tid = tidCode(data.tid);
  const { lat, lng } = coordinates(data.lat, data.lng);
  const displayName = text(data.displayName, 'Name', MAX_NAME_LENGTH);
  if (!await withinRateLimit(uid, 'redeem_attempt', MAX_REDEMPTION_ATTEMPTS_PER_HOUR)) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Take a short break and try again.');
  }
  const tidRef = db.collection('tids').doc(tid);
  const requestRef = db.collection('connectionRequests').doc();
  const result = await db.runTransaction(async (tx) => {
    const requester = await assertAccountActive(uid, tx);
    const snap = await tx.get(tidRef);
    const code = snap.data();
    if (!snap.exists || code?.status !== 'active' || !isUnexpiredMillis(code.expiresAt, Date.now())) throw new HttpsError('not-found', INACTIVE_CODE);
    if (code.generatorId === uid) throw new HttpsError('invalid-argument', 'You cannot use your own code.');
    const generator = await assertAccountActive(code.generatorId, tx);
    assertSameTestCohort(requester, generator);
    await assertNotBlocked(tx, uid, code.generatorId);
    // The proximity failure uses the same wording as an inactive code so that
    // a remote guess cannot learn that the code exists.
    if (!cellAndNeighbors(code.geoHash).includes(encodeGeohash(lat, lng))) throw new HttpsError('not-found', INACTIVE_CODE);
    const now = Date.now();
    tx.update(tidRef, { status: 'pending', requestId: requestRef.id });
    tx.create(requestRef, { requestId: requestRef.id, tid, tidCreatedAt: code.createdAt, expiresAt: code.expiresAt, requesterId: uid, requesterName: displayName, generatorId: code.generatorId, generatorName: code.generatorName, status: 'pending', createdAt: now, deleteAt: new Date(now + MESSAGE_RETENTION_MS) });
    return { generatorId: code.generatorId as string, expiresAt: code.expiresAt as number };
  });
  await notifyUser(result.generatorId, 'Passway', 'Someone nearby wants to connect', { type: 'request', requestId: requestRef.id });
  return { requestId: requestRef.id, expiresAt: result.expiresAt };
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
