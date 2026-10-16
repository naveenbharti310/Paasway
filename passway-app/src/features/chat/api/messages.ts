import { collection, doc } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';
import { callable } from '../../../firebase/client';
import type { Message } from '../../../types/models';
import type { SendMessageRequest, SendMessageResponse } from '../../../types/contracts';

export const sendMessage = callable<SendMessageRequest, SendMessageResponse>('sendMessage');

// Firestore generates a secure random ID locally; this creates no document.
export const newMessageId = () => doc(collection(db, 'messageIds')).id;

export const getMessages = callable<{ connectionId: string; latest?: boolean }, { messages: Message[]; servedAt: number }>('getMessages');
