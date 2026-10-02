import { log } from './lib/logger';
import { db } from './lib/firebase';

const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

export async function sendPushNotification(pushToken: unknown, title: string, body: string, data: Record<string, string> = {}): Promise<void> {
  if (typeof pushToken !== 'string' || !EXPO_TOKEN.test(pushToken)) return;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, data, sound: 'default' }),
    });
    const ticket = await response.json() as { data?: { status?: string; details?: { error?: string } } };
    if (!response.ok || ticket.data?.status === 'error') log.warn('Expo rejected a notification.', { error: ticket.data?.details?.error });
  } catch {
    log.warn('Notification could not be sent.');
  }
}

// Notifications never carry message text or names, only the fact that
// something happened, so a locked screen does not reveal the conversation.
export async function notifyUser(uid: string, title: string, body: string, data: Record<string, string> = {}): Promise<void> {
  try {
    const user = await db.collection('users').doc(uid).get();
    await sendPushNotification(user.data()?.pushToken, title, body, data);
  } catch {
    log.warn('Notification recipient could not be loaded.');
  }
}
