import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

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

export async function endConnection(connectionId: string): Promise<void> {
  const call = httpsCallable(functions, 'endConnection');
  await call({ connectionId });
}
