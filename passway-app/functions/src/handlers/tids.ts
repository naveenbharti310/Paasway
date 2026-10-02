import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { assertNotBanned } from '../lib/accounts';
import { withinRateLimit } from '../lib/rateLimits';
import { randomTid } from '../lib/tid';
import { encodeGeohash, cellAndNeighbors } from '../geo';
import { sendPushNotification } from '../push';
import { TID_TTL_MS, MAX_TID_GENERATIONS_PER_HOUR, MAX_FAILED_REDEMPTIONS_PER_HOUR } from '../constants';

// Creates a new TID document with a five minute expiry. The geohash is
// stored, not the raw coordinates, so the app never keeps a precise
// location on file longer than it needs to. deleteAt is meant to be
// picked up by a Firestore TTL policy on this collection, configured
// separately in the Firebase console, so unredeemed codes clean
// themselves up with no extra function needed.
export const generateTid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  await assertNotBanned(uid);
  const { lat, lng, displayName } = request.data;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new HttpsError('invalid-argument', 'Location is required to generate a TID.');
  }
  if (typeof displayName !== 'string' || !displayName.trim()) {
    throw new HttpsError('invalid-argument', 'A name is required to generate a TID.');
  }

  const allowed = await withinRateLimit(uid, 'generate', MAX_TID_GENERATIONS_PER_HOUR);
  if (!allowed) throw new HttpsError('resource-exhausted', 'Too many codes generated recently. Try again shortly.');

  for (let attempt = 0; attempt < 5; attempt++) {
    const tid = randomTid();
    const ref = db.collection('tids').doc(tid);
    const existing = await ref.get();
    if (existing.exists && existing.data()?.status === 'active') continue;

    const now = Date.now();
    const expiresAt = now + TID_TTL_MS;
    await ref.set({
      tid,
      generatorId: uid,
      generatorName: displayName.trim().slice(0, 30),
      status: 'active',
      geoHash: encodeGeohash(lat, lng),
      createdAt: now,
      expiresAt,
      deleteAt: new Date(expiresAt),
    });
    return { tid, expiresAt };
  }
  throw new HttpsError('resource-exhausted', 'Could not allocate a code. Try again.');
});

// Redeeming a TID is always a one time action. Once a code moves past
// active, whether to pending, connected, expired, or deactivated, there
// is no path back to active. The same code can never be redeemed twice,
// and two people who already connected once cannot revive an old code
// to reconnect later, they generate a fresh one in person, same as the
// first time. This is what keeps the proximity check meaningful.
export const redeemTid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  await assertNotBanned(uid);
  const { tid, lat, lng, displayName } = request.data;
  if (typeof tid !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') {
    throw new HttpsError('invalid-argument', 'Code and location are required.');
  }
  if (typeof displayName !== 'string' || !displayName.trim()) {
    throw new HttpsError('invalid-argument', 'A name is required to connect.');
  }

  const allowed = await withinRateLimit(uid, 'redeem_attempt', MAX_FAILED_REDEMPTIONS_PER_HOUR);
  if (!allowed) throw new HttpsError('resource-exhausted', 'Too many attempts. Take a short break and try again.');

  const tidRef = db.collection('tids').doc(tid.toUpperCase());
  const requestRef = db.collection('connectionRequests').doc();

  // The check and the claim happen inside one transaction. Reading the
  // status, deciding it is redeemable, and only then writing it to
  // pending as two separate steps is exactly the gap two people
  // redeeming the same code within the same instant could slip
  // through, both would read active before either write landed. A
  // transaction closes that gap, Firestore retries it automatically if
  // it detects a conflicting read.
  const generatorId: string = await db.runTransaction(async (tx) => {
    const snap = await tx.get(tidRef);
    const data = snap.data();
    if (!snap.exists || data?.status !== 'active' || data.expiresAt < Date.now()) {
      throw new HttpsError('not-found', 'That code is not active. Ask them to generate a new one.');
    }

    // Proximity check: the redeeming device's cell, or one of its eight
    // neighbors, has to match the generator's cell. A flat exact match
    // would fail people standing together on opposite sides of a cell
    // boundary, which is common with the degraded GPS you get indoors
    // or underground, a metro platform being the obvious case.
    const myHash = encodeGeohash(lat, lng);
    const acceptableCells = cellAndNeighbors(data.geoHash);
    if (!acceptableCells.includes(myHash)) {
      throw new HttpsError('permission-denied', 'That code is not active. Ask them to generate a new one.');
    }

    tx.update(tidRef, { status: 'pending' });
    tx.set(requestRef, {
      requestId: requestRef.id,
      tid: tid.toUpperCase(),
      requesterId: uid,
      requesterName: displayName.trim().slice(0, 30),
      generatorId: data.generatorId,
      generatorName: data.generatorName,
      status: 'pending',
      createdAt: Date.now(),
    });
    return data.generatorId;
  });

  const generatorSnap = await db.collection('users').doc(generatorId).get();
  await sendPushNotification(generatorSnap.data()?.pushToken, 'Passway', 'Someone nearby wants to connect');

  return { requestId: requestRef.id };
});

export const deactivateTid = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { tid } = request.data;
  const ref = db.collection('tids').doc(tid);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.generatorId !== uid) {
    throw new HttpsError('permission-denied', 'You can only deactivate a code you generated.');
  }
  await ref.update({ status: 'deactivated' });
  return {};
});
