export async function sendPushNotification(pushToken: string | undefined, title: string, body: string): Promise<void> {
  if (!pushToken || !/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(pushToken)) return;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: pushToken, title, body }) });
    const ticket = await response.json() as { data?: { status?: string } };
    if (!response.ok || ticket.data?.status === 'error') console.warn('Expo rejected a connection notification.');
  } catch {
    console.warn('Connection notification could not be sent.');
  }
}
