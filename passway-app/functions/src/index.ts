import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { encodeGeohash, cellAndNeighbors } from './geo';
import { screenMessage } from './moderation';
import { sendPushNotification } from './push';
import {
  TID_TTL_MS,
  MESSAGE_RETENTION_HOURS,
  REPORTED_MESSAGE_RETENTION_DAYS,
  MAX_TID_GENERATIONS_PER_HOUR,
  MAX_FAILED_REDEMPTIONS_PER_HOUR,
  TID_CHARSET,
} from './constants';

initializeApp();
const db = getFirestore();

// Checked at the top of generateTid and redeemTid so a banned account
// cannot keep using the app just because it can still authenticate.
async function assertNotBanned(uid: string): Promise<void> {
  const snap = await db.collection('users').doc(uid).get();
  if (snap.exists && snap.data()?.status === 'banned') {
    throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
  }
}

function randomTid(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += TID_CHARSET[Math.floor(Math.random() * TID_CHARSET.length)];
  }
  return out;
}

// A rolling window counter stored per user per action, wrapped in a
// transaction. Read-then-write without one would let a burst of
// concurrent calls all read the same count before any of them writes,
// quietly defeating the limit under load.
async function withinRateLimit(uid: string, counterName: string, max: number): Promise<boolean> {
  const ref = db.collection('rateLimits').doc(`${uid}_${counterName}`);
  const hourAgo = Date.now() - 60 * 60 * 1000;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const events: number[] = (snap.data()?.events ?? []).filter((t: number) => t > hourAgo);
    if (events.length >= max) return false;
    events.push(Date.now());
    tx.set(ref, { events });
    return true;
  });
}

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

export const respondToRequest = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { requestId, accept } = request.data;

  const requestRef = db.collection('connectionRequests').doc(requestId);
  const connectionRef = db.collection('connections').doc();

  const result = await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    const requestData = requestSnap.data();
    if (!requestSnap.exists || requestData?.generatorId !== uid || requestData.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This request is no longer available.');
    }

    if (!accept) {
      tx.update(requestRef, { status: 'declined' });
      tx.update(db.collection('tids').doc(requestData.tid), { status: 'expired' });
      return {};
    }

    tx.set(connectionRef, {
      connectionId: connectionRef.id,
      userA: requestData.generatorId,
      userAName: requestData.generatorName,
      userB: requestData.requesterId,
      userBName: requestData.requesterName,
      originTid: requestData.tid,
      status: 'active',
      createdAt: Date.now(),
    });
    tx.update(requestRef, { status: 'accepted', connectionId: connectionRef.id });
    tx.update(db.collection('tids').doc(requestData.tid), { status: 'connected' });
    return { connectionId: connectionRef.id };
  });

  return result;
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

// Either participant can end a connection at any time. Messages are
// marked for deletion 72 hours out, matching the retention window in
// the architecture doc, via a deleteAt field a Firestore TTL policy
// watches. fileReport, below, pushes that date out to 30 days if a
// report comes in before the window closes.
export const endConnection = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { connectionId } = request.data;

  const connectionRef = db.collection('connections').doc(connectionId);
  const connectionSnap = await connectionRef.get();
  const connectionData = connectionSnap.data();
  if (!connectionSnap.exists) throw new HttpsError('not-found', 'Connection not found.');
  if (![connectionData?.userA, connectionData?.userB].includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a participant in this connection.');
  }

  const deleteAt = new Date(Date.now() + MESSAGE_RETENTION_HOURS * 60 * 60 * 1000);
  await connectionRef.update({ status: 'ended', endedBy: uid, endedAt: Date.now(), deleteAt });

  const messages = await connectionRef.collection('messages').get();
  const batch = db.batch();
  messages.forEach((m) => batch.update(m.ref, { deleteAt }));
  await batch.commit();

  return {};
});

export const fileReport = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { connectionId, reportedId, reason } = request.data;
  if (typeof connectionId !== 'string' || typeof reportedId !== 'string' || typeof reason !== 'string' || !reason.trim()) {
    throw new HttpsError('invalid-argument', 'Connection, reported user, and a reason are required.');
  }

  const connectionRef = db.collection('connections').doc(connectionId);
  const connectionSnap = await connectionRef.get();
  const connectionData = connectionSnap.data();
  if (!connectionSnap.exists) throw new HttpsError('not-found', 'Connection not found.');
  if (![connectionData?.userA, connectionData?.userB].includes(uid)) {
    throw new HttpsError('permission-denied', 'Not a participant in this connection.');
  }

  const reportRef = db.collection('reports').doc();
  await reportRef.set({
    reportId: reportRef.id,
    reporterId: uid,
    reportedId,
    connectionId,
    reason: reason.trim().slice(0, 200),
    createdAt: Date.now(),
  });

  // Filing a report always ends the connection in the same step,
  // reporting someone and continuing to chat with them is not a state
  // this app allows. Extends retention so there is time to review it,
  // instead of the usual 72 hour window.
  const holdUntil = new Date(Date.now() + REPORTED_MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const wasActive = connectionData?.status === 'active';
  await connectionRef.update({
    deleteAt: holdUntil,
    status: 'ended',
    ...(wasActive ? { endedBy: uid, endedAt: Date.now() } : {}),
  });
  const messages = await connectionRef.collection('messages').get();
  const batch = db.batch();
  messages.forEach((m) => batch.update(m.ref, { deleteAt: holdUntil }));
  await batch.commit();

  // Marks the account as reported so it is visible for review, without
  // auto banning off a single report, that would make the report button
  // itself a way to grief someone. Never downgrades an existing ban.
  const reportedRef = db.collection('users').doc(reportedId);
  const reportedSnap = await reportedRef.get();
  if (reportedSnap.exists && reportedSnap.data()?.status === 'active') {
    await reportedRef.update({ status: 'reported' });
  }

  return { reportId: reportRef.id };
});
