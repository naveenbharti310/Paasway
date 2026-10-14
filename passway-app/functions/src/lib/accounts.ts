import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { db } from './firebase';

export const MINIMUM_AGE = 18;

export function userRef(uid: string) {
  return db.collection('users').doc(uid);
}

// Phone numbers are stored only as a salted hash, and only so that a banned or
// reported person cannot clear that status by deleting and recreating an account.
export function phoneHash(phoneNumber: string): string {
  return createHash('sha256').update(`passway:phone:${phoneNumber}`).digest('hex');
}

export function holdRef(hash: string) {
  return db.collection('accountHolds').doc(hash);
}

// Confirms an account can take part in connections: it exists, it has passed
// the age check, it is not banned, and its phone number is not under a ban hold.
export async function assertAccountActive(uid: string, tx: Transaction): Promise<DocumentData> {
  const snap = await tx.get(userRef(uid));
  const user = snap.data();
  if (!snap.exists || !user) throw new HttpsError('failed-precondition', 'Your account is not ready. Sign in again.');
  if (user.status === 'banned') throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
  if (typeof user.ageConfirmedAt !== 'number') throw new HttpsError('failed-precondition', 'Confirm your age before connecting.');
  if (typeof user.phoneHash === 'string') {
    const hold = await tx.get(holdRef(user.phoneHash));
    if (hold.data()?.status === 'banned') throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
  }
  return user;
}

// Server-controlled profile metadata: clients cannot create or change this
// field under Firestore rules. Automated accounts cannot connect to real users.
export function assertSameTestCohort(a: DocumentData, b: DocumentData): void {
  if ((a.automatedTest === true) !== (b.automatedTest === true)) {
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
