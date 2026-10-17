import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { db } from './firebase';
import type { CallerContext } from './callable';

export const MINIMUM_AGE = 18;

export function userRef(uid: string) {
  return db.collection('users').doc(uid);
}

// Holds use deterministic pseudonymous hashes, NOT a secret salt or anonymization.
// Changing this scheme requires a migration so existing bans cannot be bypassed.
export function phoneHash(phoneNumber: string): string {
  return createHash('sha256').update(`passway:phone:${phoneNumber}`).digest('hex');
}

export function holdRef(hash: string) {
  return db.collection('accountHolds').doc(hash);
}

export function hasAgeConfirmation(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Confirms an account can take part in connections: it exists, it has passed
// the age check, it is not banned, and its phone number is not under a ban hold.
export async function assertAccountActive(uid: string, tx: Transaction, caller?: CallerContext): Promise<DocumentData> {
  const snap = await tx.get(userRef(uid));
  const user = snap.data();
  if (!snap.exists || !user) throw new HttpsError('failed-precondition', 'Your account is not ready. Sign in again.');
  if (user.status === 'deleting') throw new HttpsError('failed-precondition', 'Account deletion is in progress.');
  // Allow known eligible states, rather than permitting any state that is
  // not explicitly banned. New administrative states must fail closed.
  if (user.status !== 'active' && user.status !== 'reported') throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
  if (user.ageCheck === 'under_minimum' || !hasAgeConfirmation(user.ageConfirmedAt)) {
    throw new HttpsError('failed-precondition', 'Confirm your age before connecting.');
  }
  // Acting callers must be checked against the verified token's current phone,
  // not only a potentially missing or stale profile binding. Peer checks still
  // use server-owned profile metadata; never accept a phone from request data.
  const hashes = new Set<string>();
  if (typeof user.phoneHash === 'string') hashes.add(user.phoneHash);
  if (caller !== undefined) {
    const phone = caller.phoneNumber;
    if (typeof phone !== 'string' || !/^\+[1-9]\d{1,14}$/.test(phone)) {
      throw new HttpsError('permission-denied', 'A verified phone number is required. Sign in again.');
    }
    hashes.add(phoneHash(phone));
  }
  // Deduplicate the usual matching binding. Reads remain in the participation
  // transaction so a concurrent hold change retries rather than authorizing
  // from a preflight check. No binding writes or global deletion gate here.
  for (const hash of hashes) {
    const policy = (await tx.get(holdRef(hash))).data();
    if (policy?.status === 'under_minimum') {
      throw new HttpsError('failed-precondition', 'Confirm your age before connecting.');
    }
    if (policy && policy.status !== 'reported') {
      throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
    }
  }
  return user;
}

// Both bindings are server-controlled under Firestore rules. A fictional
// reviewer may delete and recreate their Auth account, so an old UID's
// automatedTest flag alone cannot be the durable isolation boundary. confirmAge
// binds the verified token phone to phoneHash before participation is allowed.
// These two numbers are already reserved by the SMS provider boundary.
const reviewerPhoneHashes = new Set(['+919999900001', '+919999900002'].map(phoneHash));
function inTestCohort(profile: DocumentData): boolean {
  return profile.automatedTest === true ||
    (typeof profile.phoneHash === 'string' && reviewerPhoneHashes.has(profile.phoneHash));
}
export function assertSameTestCohort(a: DocumentData, b: DocumentData): void {
  if (inTestCohort(a) !== inTestCohort(b)) {
    throw new HttpsError('not-found', 'That code is not active. Ask them to generate a new one.');
  }
}

export function ageOn(birthDate: string, today: Date): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  let age = today.getUTCFullYear() - year;
  const beforeBirthday = today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
  if (beforeBirthday) age--;
  return age;
}

export function validBirthDate(value: unknown, today: Date): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpsError('invalid-argument', 'Enter your date of birth.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new HttpsError('invalid-argument', 'That date is not valid.');
  if (date.getTime() > today.getTime() || year < today.getUTCFullYear() - 120) throw new HttpsError('invalid-argument', 'That date is not valid.');
  return value;
}
