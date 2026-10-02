import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/config';

export async function fileReport(connectionId: string, reportedId: string, reason: string): Promise<void> {
  const call = httpsCallable(functions, 'fileReport');
  await call({ connectionId, reportedId, reason });
}
