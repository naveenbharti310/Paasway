import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { assertNotBanned } from '../lib/accounts';
import { withinRateLimit } from '../lib/rateLimits';
import { randomTid } from '../lib/tid';
import { payload, coordinates, text, tidCode } from '../lib/validation';
import { encodeGeohash, cellAndNeighbors } from '../geo';
import { sendPushNotification } from '../push';
import { TID_TTL_MS, MESSAGE_RETENTION_HOURS, MAX_TID_GENERATIONS_PER_HOUR, MAX_FAILED_REDEMPTIONS_PER_HOUR } from '../constants';

export const generateTid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = payload(request.data);
  const { lat, lng } = coordinates(data.lat, data.lng);
  const displayName = text(data.displayName, 'Name', 30);
  if (!await withinRateLimit(uid, 'generate', MAX_TID_GENERATIONS_PER_HOUR)) {
    throw new HttpsError('resource-exhausted', 'Too many codes generated recently. Try again shortly.');
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const tid = randomTid();
    const ref = db.collection('tids').doc(tid);
    const result = await db.runTransaction(async (tx) => {
      await assertNotBanned(uid, tx);
      const existing = await tx.get(ref);
      if (existing.exists) return null;
      const now = Date.now();
      const expiresAt = now + TID_TTL_MS;
      tx.create(ref, { tid, generatorId: uid, generatorName: displayName, status: 'active', geoHash: encodeGeohash(lat, lng), createdAt: now, expiresAt, deleteAt: new Date(expiresAt) });
      return { tid, expiresAt };
    });
    if (result) return result;
  }
  throw new HttpsError('resource-exhausted', 'Could not allocate a code. Try again.');
});

export const redeemTid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const data = payload(request.data);
  const tid = tidCode(data.tid);
  const { lat, lng } = coordinates(data.lat, data.lng);
  const displayName = text(data.displayName, 'Name', 30);
  if (!await withinRateLimit(uid, 'redeem_attempt', MAX_FAILED_REDEMPTIONS_PER_HOUR)) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Take a short break and try again.');
  }
  const tidRef = db.collection('tids').doc(tid);
  const requestRef = db.collection('connectionRequests').doc();
  const result = await db.runTransaction(async (tx) => {
    await assertNotBanned(uid, tx);
    const snap = await tx.get(tidRef);
    const code = snap.data();
    if (!snap.exists || code?.status !== 'active' || code.expiresAt <= Date.now()) {
      throw new HttpsError('not-found', 'That code is not active. Ask them to generate a new one.');
    }
    if (code.generatorId === uid) throw new HttpsError('invalid-argument', 'You cannot use your own code.');
    await assertNotBanned(code.generatorId, tx);
    if (!cellAndNeighbors(code.geoHash).includes(encodeGeohash(lat, lng))) {
      throw new HttpsError('permission-denied', 'That code is not active. Ask them to generate a new one.');
    }
    const now = Date.now();
    tx.update(tidRef, { status: 'pending', requestId: requestRef.id });
    tx.create(requestRef, { requestId: requestRef.id, tid, tidCreatedAt: code.createdAt, expiresAt: code.expiresAt, requesterId: uid, requesterName: displayName, generatorId: code.generatorId, generatorName: code.generatorName, status: 'pending', createdAt: now, deleteAt: new Date(now + MESSAGE_RETENTION_HOURS * 60 * 60 * 1000) });
    return { generatorId: code.generatorId as string, expiresAt: code.expiresAt as number };
  });
  try {
    const generator = await db.collection('users').doc(result.generatorId).get();
    await sendPushNotification(generator.data()?.pushToken, 'Passway', 'Someone nearby wants to connect');
  } catch {
    console.warn('Connection request saved, but its notification could not be sent.');
  }
  return { requestId: requestRef.id, expiresAt: result.expiresAt };
});

export const deactivateTid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const tid = tidCode(payload(request.data).tid);
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
