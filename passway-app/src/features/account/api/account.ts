import { callable } from '../../../firebase/client';
import type { ConfirmAgeRequest, ConfirmAgeResponse, Empty } from '../../../types/contracts';

export const confirmAge = callable<ConfirmAgeRequest, ConfirmAgeResponse>('confirmAge');
export const deleteAccount = callable<Empty, Empty>('deleteAccount');
