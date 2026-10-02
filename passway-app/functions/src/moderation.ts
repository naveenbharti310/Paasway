const EARLY_CONNECTION_WINDOW_SECONDS = 180;

// Signals that someone is trying to move the conversation off Passway quickly,
// which is a common first step in romance and investment scams.
const CONTACT_PATTERNS: RegExp[] = [
  /(?:\+?\d[\s().-]*){10,}/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(?:whats\s?app|wa\.me|insta(?:gram)?|telegram|t\.me|snap(?:chat)?|signal|wechat|line\s?id|facebook|messenger)\b/i,
  /(?:^|\s)@[A-Z0-9_.]{3,}/i,
];

export type ModerationFlag = 'none' | 'scam_suspected' | 'harassment_suspected';

export interface ModerationResult {
  flag: ModerationFlag;
  earlyContactShare: boolean;
}

export function mentionsContactInfo(content: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(content));
}

export async function screenMessage(content: string, connectionAgeSeconds: number): Promise<ModerationResult> {
  // Scam and harassment classification is not connected yet. A classifier
  // should replace this constant and keep the same result shape.
  const flag: ModerationFlag = 'none';
  const earlyContactShare = connectionAgeSeconds < EARLY_CONNECTION_WINDOW_SECONDS && mentionsContactInfo(content);
  return { flag, earlyContactShare };
}
