import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import { db, auth } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { userRef, holdRef, phoneHash, ageOn, validBirthDate, MINIMUM_AGE } from '../lib/accounts';
import { applyMessageRetention } from '../lib/retention';
import { log } from '../lib/logger';
import { markEnded } from '../services/connections';
import { REPORTED_HOLD_MS } from '../constants';

type HoldStatus = 'banned' | 'reported' | 'under_minimum';
const SEVERITY: Record<HoldStatus, number> = { under_minimum: 1, reported: 2, banned: 3 };
const UNDER_MINIMUM = `Passway is only for people aged ${MINIMUM_AGE} and over.`;

function strongerHold(current: DocumentData | undefined, next: HoldStatus): boolean {
  const existing = current?.status as HoldStatus | undefined;
  return !existing || SEVERITY[next] > SEVERITY[existing];
}

// Asks for a date of birth once. Only the result is stored, never the date.
// An under age answer is held against the phone number until that person turns
// the minimum age, so deleting the account and answering again does not help.
export const confirmAge = authedCallable(async (uid, data, caller) => {
  const today = new Date();
  const birthDate = validBirthDate(data.birthDate, today);
  const adult = ageOn(birthDate, today) >= MINIMUM_AGE;
  const hash = caller.phoneNumber ? phoneHash(caller.phoneNumber) : undefined;
  const ref = userRef(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const user = snap.data();
    if (!snap.exists || !user) throw new HttpsError('failed-precondition', 'Your account is not ready. Sign in again.');
    const hold = hash ? (await tx.get(holdRef(hash))).data() : undefined;
    const now = Date.now();
    if (user.ageCheck === 'under_minimum') throw new HttpsError('failed-precondition', UNDER_MINIMUM);
    if (typeof user.ageConfirmedAt === 'number') return { confirmed: true };
    if (!adult || hold?.status === 'under_minimum') {
      tx.update(ref, { ageCheck: 'under_minimum', ageCheckedAt: now, ...(hash ? { phoneHash: hash } : {}) });
      if (hash && !adult && strongerHold(hold, 'under_minimum')) {
        const [year, month, day] = birthDate.split('-').map(Number);
        tx.set(holdRef(hash), { status: 'under_minimum', updatedAt: now, deleteAt: new Date(Date.UTC(year + MINIMUM_AGE, month - 1, day)) });
      }
      return { confirmed: false };
    }
    // A new account on a phone number with a ban or review hold inherits it.
    let status = user.status;
    if (hold?.status === 'banned') status = 'banned';
    else if (hold?.status === 'reported' && status === 'active') status = 'reported';
    tx.update(ref, { ageConfirmedAt: now, ageCheck: 'adult', status, ...(hash ? { phoneHash: hash } : {}) });
    return { confirmed: true };
  });
});

// Deletes the account as the app stores require. Open conversations are ended
// and keep their normal retention, so the other person is not left with an open
// chat and any report hold still applies. The sign in record is removed last.
export const deleteAccount = authedCallable(async (uid, _data, caller) => {
  const ref = userRef(uid);
  const user = (await ref.get()).data();
  const now = Date.now();

  const open = await Promise.all((['userA', 'userB'] as const).map((field) =>
    db.collection('connections').where(field, '==', uid).where('status', '==', 'active').get()));
  for (const doc of open.flatMap((result) => result.docs)) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const connection = snap.data();
      if (!snap.exists || !connection || connection.status !== 'active') return;
      markEnded(tx, doc.ref, connection, uid, now, { endReason: 'account_deleted' });
    });
    await applyMessageRetention(doc.ref);
  }

  const codes = await db.collection('tids').where('generatorId', '==', uid).where('status', '==', 'active').get();
  await Promise.all(codes.docs.map((doc) => db.runTransaction(async (tx) => {
    const snap = await tx.get(doc.ref);
    if (snap.data()?.status === 'active') tx.update(doc.ref, { status: 'deactivated' });
  })));

  const hash = typeof user?.phoneHash === 'string' ? user.phoneHash : caller.phoneNumber ? phoneHash(caller.phoneNumber) : undefined;
  const reportedAgainst = await db.collection('reports').where('reportedId', '==', uid).limit(1).get();
  const holdStatus: HoldStatus | null = user?.status === 'banned' ? 'banned'
    : user?.status === 'reported' || !reportedAgainst.empty ? 'reported'
      : user?.ageCheck === 'under_minimum' ? 'under_minimum' : null;
  if (hash && holdStatus && holdStatus !== 'under_minimum') {
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(holdRef(hash))).data();
      if (!strongerHold(current, holdStatus)) return;
      tx.set(holdRef(hash), { status: holdStatus, updatedAt: now, ...(holdStatus === 'reported' ? { deleteAt: new Date(now + REPORTED_HOLD_MS) } : {}) });
    });
  }

  await Promise.all(['generate', 'redeem_attempt', 'message', 'safety'].map((name) => db.collection('rateLimits').doc(`${uid}_${name}`).delete()));
  await ref.delete();
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') {
      log.error('Sign in record could not be deleted.', { uid });
      throw new HttpsError('internal', 'Your account was removed but sign in could not be cleared. Try again.');
    }
  }
  return {};
});
