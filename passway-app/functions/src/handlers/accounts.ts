import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { userRef, holdRef, phoneHash, ageOn, validBirthDate, hasAgeConfirmation, MINIMUM_AGE } from '../lib/accounts';
import { requestAccountDeletion, resumeAccountDeletion } from '../services/accountDeletion';

type HoldStatus = 'banned' | 'reported' | 'under_minimum';
// Review permits participation after age confirmation; under-minimum does not.
// A review hold must never prevent persisting an age restriction for the phone,
// or deletion/recreation could turn an under-age answer into an adult account.
const SEVERITY: Record<HoldStatus, number> = { reported: 1, under_minimum: 2, banned: 3 };
const UNDER_MINIMUM = `Passway is only for people aged ${MINIMUM_AGE} and over.`;

function strongerHold(current: DocumentData | undefined, next: HoldStatus): boolean {
  const existing = current?.status as HoldStatus | undefined;
  return !existing || SEVERITY[next] > SEVERITY[existing];
}

// Confirm age once. Under-age phone holds also retain the eligibility expiry,
// which can reveal the supplied birth date; this is not anonymous metadata.
// Deletion/recreation must not bypass a phone-level eligibility restriction.
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
    if (user.status === 'deleting') throw new HttpsError('failed-precondition', 'Account deletion is in progress.');
    if (user.status !== 'active' && user.status !== 'reported') {
      throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
    }
    if (hold && !['banned', 'reported', 'under_minimum'].includes(hold.status)) {
      throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
    }
    if (user.ageCheck === 'under_minimum') throw new HttpsError('failed-precondition', UNDER_MINIMUM);
    // An idempotent age answer is not permission to skip current phone policy.
    // Legacy profiles may predate phoneHash; bind the verified caller before a
    // later authorization path can rely on that field to find restrictive holds.
    let status = user.status;
    if (hold?.status === 'banned') status = 'banned';
    else if (hold?.status === 'reported' && status === 'active') status = 'reported';
    if (hasAgeConfirmation(user.ageConfirmedAt) && hold?.status !== 'under_minimum') {
      if (status !== user.status || user.ageCheck !== 'adult' || (hash && user.phoneHash !== hash)) {
        tx.update(ref, { ageCheck: 'adult', status, ...(hash ? { phoneHash: hash } : {}) });
      }
      return { confirmed: true };
    }
    if (!adult || hold?.status === 'under_minimum') {
      tx.update(ref, { ageCheck: 'under_minimum', ageCheckedAt: now, ...(hash ? { phoneHash: hash } : {}) });
      if (hash && !adult && strongerHold(hold, 'under_minimum')) {
        const [year, month, day] = birthDate.split('-').map(Number);
        tx.set(holdRef(hash), { status: 'under_minimum', updatedAt: now, deleteAt: new Date(Date.UTC(year + MINIMUM_AGE, month - 1, day)) });
      }
      return { confirmed: false };
    }
    // A first confirmation inherits the same authoritative phone policy.
    tx.update(ref, { ageConfirmedAt: now, ageCheck: 'adult', status, ...(hash ? { phoneHash: hash } : {}) });
    return { confirmed: true };
  });
});

// Persist intent before any external operation; retries and existing maintenance
// resume the same bounded deletion workflow.
export const deleteAccount = authedCallable(async (uid, _data, caller) => {
  await requestAccountDeletion(uid, caller.phoneNumber ? phoneHash(caller.phoneNumber) : undefined);
  return resumeAccountDeletion(uid);
});
