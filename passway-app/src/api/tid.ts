// Thin client wrappers around the callable Cloud Functions in
// functions/src/index.ts. Screens should call these, not Firestore
// directly, for anything that writes data, so every write goes through
// the checks defined server side.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/config';

const functions = getFunctions(app);

export async function generateTid(lat: number, lng: number, displayName: string): Promise<{ tid: string; expiresAt: number }> {
  const call = httpsCallable(functions, 'generateTid');
  const result = await call({ lat, lng, displayName });
  return result.data as { tid: string; expiresAt: number };
}

export async function redeemTid(tid: string, lat: number, lng: number, displayName: string): Promise<{ requestId: string }> {
  const call = httpsCallable(functions, 'redeemTid');
  const result = await call({ tid, lat, lng, displayName });
  return result.data as { requestId: string };
}

export async function respondToRequest(requestId: string, accept: boolean): Promise<{ connectionId?: string }> {
  const call = httpsCallable(functions, 'respondToRequest');
  const result = await call({ requestId, accept });
  return result.data as { connectionId?: string };
}

export async function deactivateTid(tid: string): Promise<void> {
  const call = httpsCallable(functions, 'deactivateTid');
  await call({ tid });
}

export async function sendMessage(connectionId: string, content: string): Promise<{ flag: string; earlyContactShare: boolean }> {
  const call = httpsCallable(functions, 'sendMessage');
  const result = await call({ connectionId, content });
  return result.data as { flag: string; earlyContactShare: boolean };
}

export async function endConnection(connectionId: string): Promise<void> {
  const call = httpsCallable(functions, 'endConnection');
  await call({ connectionId });
}

export async function fileReport(connectionId: string, reportedId: string, reason: string): Promise<void> {
  const call = httpsCallable(functions, 'fileReport');
  await call({ connectionId, reportedId, reason });
}
