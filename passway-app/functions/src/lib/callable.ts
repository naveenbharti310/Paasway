import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { enforceAppCheck } from '../config';
import { payload } from './validation';

export interface CallerContext {
  phoneNumber?: string;
}

export interface CallerAuth {
  uid?: string;
  token?: { phone_number?: unknown };
}

export type CallableHandler<T> = (uid: string, data: Record<string, unknown>, caller: CallerContext) => Promise<T>;

// Runs a handler after the shared sign in and payload checks. Both the Cloud
// Functions entry point and the web server in api/ call this.
export function runCallable<T>(handler: CallableHandler<T>, auth: CallerAuth | undefined, data: unknown): Promise<T> {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const phone = auth?.token?.phone_number;
  return handler(uid, payload(data), { phoneNumber: typeof phone === 'string' ? phone : undefined });
}

// Every client action goes through this wrapper so that sign in, App Check and
// payload shape are checked the same way before any handler logic runs.
export function authedCallable<T>(handler: CallableHandler<T>) {
  const fn = onCall({ enforceAppCheck }, async (request) => runCallable(handler, request.auth, request.data));
  return Object.assign(fn, { handler });
}
