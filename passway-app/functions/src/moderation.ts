// Message screening. This calls out to a third party moderation or LLM
// endpoint rather than a custom trained model, per the plan: start with
// an existing classifier, only consider a custom model once there is
// enough flagged data from real user reports to train one on.

const CONTACT_INFO_PATTERN = /\b\d{10}\b|\bwhatsapp\b|\binstagram\b|\btelegram\b/i;
const EARLY_CONNECTION_WINDOW_SECONDS = 180;

export interface ModerationResult {
  flag: 'none' | 'scam_suspected' | 'harassment_suspected';
  earlyContactShare: boolean;
}

export async function screenMessage(content: string, connectionAgeSeconds: number): Promise<ModerationResult> {
  // TODO wire this up to a real moderation API or an LLM prompt that
  // returns a flag for scam or harassment patterns before this ships.
  const flag: ModerationResult['flag'] = 'none';

  // This half is a plain pattern match, not machine learning. It
  // covers the early exit safety nudge: a phone number or a mention of
  // another messaging app inside the first few minutes of a brand new
  // connection.
  const mentionsContactInfo = CONTACT_INFO_PATTERN.test(content);
  const earlyContactShare = mentionsContactInfo && connectionAgeSeconds < EARLY_CONNECTION_WINDOW_SECONDS;

  return { flag, earlyContactShare };
}
