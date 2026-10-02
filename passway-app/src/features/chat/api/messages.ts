import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

export async function sendMessage(connectionId: string, content: string): Promise<{ flag: string; earlyContactShare: boolean }> {
  const call = httpsCallable<{ connectionId: string; content: string }, { flag: 'none' | 'scam_suspected' | 'harassment_suspected'; earlyContactShare: boolean }>(functions, 'sendMessage');
  const result = await call({ connectionId, content });
  return result.data;
}
