import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { enforceAppCheck } from '../config';
import { payload } from './validation';

export interface CallerContext {
  phoneNumber?: string;
}

export type CallableHandler<T> = (uid: string, data: Record<string, unknown>, caller: CallerContext) => Promise<T>;

// Every client action goes through this wrapper so that sign in, App Check and
// payload shape are checked the same way before any handler logic runs.
export function authedCallable<T>(handler: CallableHandler<T>) {
  return onCall({ enforceAppCheck }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const phone = request.auth?.token?.phone_number;
    return handler(uid, payload(request.data), { phoneNumber: typeof phone === 'string' ? phone : undefined });
  });
}
