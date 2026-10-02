import { callable } from '../../../firebase/client';
import type { SendMessageRequest, SendMessageResponse } from '../../../types/contracts';

export const sendMessage = callable<SendMessageRequest, SendMessageResponse>('sendMessage');
