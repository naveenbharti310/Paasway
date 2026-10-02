import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from './firebase';

export function blockRef(blockerId: string, blockedId: string) {
  return db.collection('blocks').doc(`${blockerId}:${blockedId}`);
}

// Blocks apply in both directions. The message matches the one for an inactive
// code so the person who was blocked cannot tell that a block exists.
export async function assertNotBlocked(tx: Transaction, a: string, b: string): Promise<void> {
  const [ab, ba] = await Promise.all([tx.get(blockRef(a, b)), tx.get(blockRef(b, a))]);
  if (ab.exists || ba.exists) throw new HttpsError('not-found', 'That code is not active. Ask them to generate a new one.');
}

export function recordBlock(tx: Transaction, blockerId: string, blockedId: string, connectionId: string, now: number): void {
  tx.set(blockRef(blockerId, blockedId), { blockerId, blockedId, connectionId, createdAt: now });
}
