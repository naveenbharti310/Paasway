// Sends a push notification through Expo's push service. This does not
// need separate FCM or APNs credentials configured by hand, Expo's
// service handles delivery to both platforms from the one call.
export async function sendPushNotification(pushToken: string | undefined, title: string, body: string): Promise<void> {
  if (!pushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body }),
    });
  } catch (err) {
    // A failed push should never block the request itself from succeeding.
    console.warn('Push notification failed', err);
  }
}
