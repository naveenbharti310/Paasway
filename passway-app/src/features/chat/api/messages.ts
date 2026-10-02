import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

export async function sendMessage(connectionId: string, content: string): Promise<{ flag: string; earlyContactShare: boolean }> {
  const call = httpsCallable(functions, 'sendMessage');
  const result = await call({ connectionId, content });
  return result.data as { flag: string; earlyContactShare: boolean };
}
