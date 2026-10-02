import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

export async function generateTid(lat: number, lng: number, displayName: string): Promise<{ tid: string; expiresAt: number }> {
  const call = httpsCallable<{ lat: number; lng: number; displayName: string }, { tid: string; expiresAt: number }>(functions, 'generateTid');
  const result = await call({ lat, lng, displayName });
  return result.data;
}

export async function redeemTid(tid: string, lat: number, lng: number, displayName: string): Promise<{ requestId: string; expiresAt: number }> {
  const call = httpsCallable<{ tid: string; lat: number; lng: number; displayName: string }, { requestId: string; expiresAt: number }>(functions, 'redeemTid');
  const result = await call({ tid, lat, lng, displayName });
  return result.data;
}

export async function respondToRequest(requestId: string, accept: boolean): Promise<{ connectionId?: string }> {
  const call = httpsCallable<{ requestId: string; accept: boolean }, { connectionId?: string }>(functions, 'respondToRequest');
  const result = await call({ requestId, accept });
  return result.data;
}

export async function deactivateTid(tid: string): Promise<void> {
  const call = httpsCallable<{ tid: string }, Record<string, never>>(functions, 'deactivateTid');
  await call({ tid });
}

export async function endConnection(connectionId: string): Promise<void> {
  const call = httpsCallable<{ connectionId: string }, Record<string, never>>(functions, 'endConnection');
  await call({ connectionId });
}
