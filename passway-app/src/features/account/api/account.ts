import { withDeadline } from '../../../services/withDeadline';
import { callable } from '../../../firebase/client';
import type { ConfirmAgeRequest, ConfirmAgeResponse, Empty } from '../../../types/contracts';

export const acceptContentPolicy = callable<{ version: string; accept: true }, { accepted: boolean; version: string }>('acceptContentPolicy');
export const confirmAge = callable<ConfirmAgeRequest, ConfirmAgeResponse>('confirmAge');
const deleteStep = callable<Empty, { pending?: boolean }>('deleteAccount');
// Bounded client recovery. The durable server job continues through maintenance
// if the app closes or this budget expires; no fresh sign-in/SMS is required.
export async function deleteAccount(data: Empty): Promise<void> {
  return withDeadline(async (signal) => {
    for (let step = 0; step < 20; step++) {
      if (signal.aborted) throw new Error('Deletion is continuing on the server.');
      if (!(await deleteStep(data)).pending) return;
    }
    throw new Error('Account deletion is still in progress. Try again shortly.');
  }, 30000);
}
