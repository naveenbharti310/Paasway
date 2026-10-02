const CONTACT_INFO_PATTERN = /\b\d{10}\b|\bwhatsapp\b|\binstagram\b|\btelegram\b/i;
const EARLY_CONNECTION_WINDOW_SECONDS = 180;

export interface ModerationResult {
  flag: 'none' | 'scam_suspected' | 'harassment_suspected';
  earlyContactShare: boolean;
}

export async function screenMessage(content: string, connectionAgeSeconds: number): Promise<ModerationResult> {
  // Scam and harassment classification is not connected yet.
  const flag: ModerationResult['flag'] = 'none';

  const mentionsContactInfo = CONTACT_INFO_PATTERN.test(content);
  const earlyContactShare = mentionsContactInfo && connectionAgeSeconds < EARLY_CONNECTION_WINDOW_SECONDS;

  return { flag, earlyContactShare };
}
