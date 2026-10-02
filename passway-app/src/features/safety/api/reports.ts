import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

export async function fileReport(connectionId: string, reportedId: string, reason: string): Promise<{ reportId: string }> {
  const call = httpsCallable<{ connectionId: string; reportedId: string; reason: string }, { reportId: string }>(functions, 'fileReport');
  const result = await call({ connectionId, reportedId, reason });
  return result.data;
}
