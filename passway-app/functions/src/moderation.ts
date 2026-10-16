import { applicationDefault, getApp } from 'firebase-admin/app';
import { log } from './lib/logger';

const EARLY_CONNECTION_WINDOW_SECONDS = 180;

export type ModerationFlag = 'none' | 'scam_suspected' | 'harassment_suspected';

export interface ModerationResult {
  flag: ModerationFlag;
  earlyContactShare: boolean;
}

// Signals that someone is trying to move the conversation off Passway quickly,
// which is a common first step in romance and investment scams.
const CONTACT_PATTERNS: RegExp[] = [
  /(?:\+?\d[\s().-]*){10,}/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(?:whats\s?app|wa\.me|insta(?:gram)?|telegram|t\.me|snap(?:chat)?|signal|wechat|line\s?id|facebook|messenger)\b/i,
  /(?:^|\s)@[A-Z0-9_.]{3,}/i,
];

export function mentionsContactInfo(content: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(content));
}

interface ScamRule { name: string; weight: number; pattern: RegExp }

// Patterns drawn from the common scripts used in impersonation, romance,
// investment and payment scams. Each match adds weight; a message is treated
// as a suspected scam at a combined weight of 2 or more.
const SCAM_RULES: ScamRule[] = [
  { name: 'one_time_code', weight: 2, pattern: /\b(?:otp|one[\s]?time (?:password|code)|verification code|(?:send|share|tell|forward)\b.{0,20}\b(?:pin|password|cvv))\b/i },
  { name: 'payment_request', weight: 1, pattern: /\b(?:send|transfer|pay|lend|loan|deposit|wire)\b.{0,30}\b(?:money|cash|rs\.?|rupees?|inr|usd|dollars?|upi|paytm|g\s?pay|phone\s?pe|bank|account|amount)\b/i },
  { name: 'currency_amount', weight: 1, pattern: /(?:₹|\$|€|£|\brs\.?\s?|\binr\s?)\s?\d[\d,]*|\b\d[\d,]*\s?(?:rupees|dollars|lakh|crore|k\b)/i },
  { name: 'investment', weight: 1, pattern: /\b(?:bitcoin|btc|crypto|usdt|ethereum|forex|trading (?:app|platform|account)|invest(?:ment|ing)?|guaranteed (?:returns?|profit)|double your|daily profit|passive income)\b/i },
  { name: 'returns_promise', weight: 1, pattern: /\b(?:guaranteed|assured|fixed|sure ?shot)\b.{0,25}\b(?:returns?|profits?|income)\b|\bdouble (?:your |the )?(?:money|investment|amount)\b|\b\d{1,3}\s?% (?:daily|weekly|monthly|returns?|profit)/i },
  // Common Hindi and Hinglish wording for asking for money or codes.
  { name: 'payment_request_hi', weight: 1, pattern: /\b(?:paise|paisa|paisay|rupaye|rupay|rupees)\b.{0,20}\b(?:bhejo|bhej do|bhejdo|transfer|chahiye|de do|dedo|udhaar|udhar)\b|\b(?:bhejo|bhej do|transfer karo|transfer kar do)\b.{0,20}\b(?:paise|paisa|upi|paytm|account)\b/i },
  { name: 'one_time_code_hi', weight: 2, pattern: /\b(?:code|pin|password)\b.{0,15}\b(?:batao|bata do|bhejo|bhej do|share karo)\b/i },
  { name: 'gift_card', weight: 2, pattern: /\b(?:gift ?cards?|google play cards?|itunes cards?|amazon (?:pay )?vouchers?|steam cards?)\b/i },
  { name: 'urgency', weight: 1, pattern: /\b(?:urgent(?:ly)?|emergency|right now|immediately|hospital|stuck at|customs|arrested|police case|account (?:blocked|suspended)|jaldi|abhi ke abhi)\b/i },
  { name: 'link', weight: 1, pattern: /\bhttps?:\/\/\S+|\bwww\.\S+|\b(?:bit\.ly|tinyurl\.com|t\.ly|cutt\.ly)\/\S+/i },
  { name: 'remote_access', weight: 2, pattern: /\b(?:anydesk|teamviewer|quick ?support|screen ?share)\b/i },
];

export function scamSignals(content: string): { score: number; matched: string[] } {
  const matched = SCAM_RULES.filter((rule) => rule.pattern.test(content));
  return { score: matched.reduce((sum, rule) => sum + rule.weight, 0), matched: matched.map((rule) => rule.name) };
}

// Strong abuse in English and Hindi. This is a fallback for when the Google
// classifier is off, so it only lists words that are almost never friendly.
const ABUSE_PATTERN = /\b(?:f+u+c+k+\s*(?:you|u|off)|bitch|slut|whore|cunt|retard|kill (?:you|u)|rape|send (?:me )?nudes?|nude (?:pics?|photos?)|madar ?chod|maa?der ?chod|behen ?chod|bhen ?chod|bc mc|chutiya|chutiye|randi|bhosdi\w*|bhosda|gaand\w*|harami|haramzad\w*)\b/i;

export function abusive(content: string): boolean {
  return ABUSE_PATTERN.test(content);
}

export interface ClassifierCategory { name: string; confidence: number }

const HARASSMENT_THRESHOLDS: Record<string, number> = {
  Toxic: 0.85,
  Insult: 0.85,
  Derogatory: 0.8,
  Violent: 0.8,
  'Death, Harm & Tragedy': 0.9,
  Sexual: 0.9,
};

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  // External hosts initialize Firebase with an explicit certificate. Reuse that
  // credential rather than probing for unrelated Application Default Credentials.
  const token = await (getApp().options.credential ?? applicationDefault()).getAccessToken();
  cachedToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return token.access_token;
}

// Google Cloud Natural Language text moderation. It runs as the function's
// own service account, so no API key is stored. Enable the Cloud Natural
// Language API in the project for it to work.
export async function googleModerate(content: string): Promise<ClassifierCategory[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Moderation deadline exceeded.'));
      controller.abort();
    }, 2500);
  });
  try {
    // One wall-clock budget covers credential lookup, network IO and parsing.
    // Credential providers are not abortable; check the signal after they finish
    // so a timed-out attempt cannot later send message content in the background.
    return await Promise.race([deadline, (async () => {
      const token = await accessToken();
      controller.signal.throwIfAborted();
      const response = await fetch('https://language.googleapis.com/v2/documents:moderateText', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ document: { type: 'PLAIN_TEXT', content } }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`Moderation request failed with status ${response.status}.`);
      const body = await response.json() as { moderationCategories?: ClassifierCategory[] };
      return body.moderationCategories ?? [];
    })()]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Replaceable in tests. Set MODERATION_PROVIDER=rules to skip the Google call.
export const moderationDeps = {
  classify: googleModerate,
  provider: () => process.env.MODERATION_PROVIDER ?? 'google',
};

export async function screenMessage(content: string, connectionAgeSeconds: number): Promise<ModerationResult> {
  const earlyContactShare = connectionAgeSeconds < EARLY_CONNECTION_WINDOW_SECONDS && mentionsContactInfo(content);
  let { score } = scamSignals(content);
  if (earlyContactShare) score += 1;
  let harassment = abusive(content);
  if (!harassment && moderationDeps.provider() === 'google') {
    try {
      const categories = await moderationDeps.classify(content);
      harassment = categories.some((c) => c.confidence >= (HARASSMENT_THRESHOLDS[c.name] ?? Infinity));
      if (categories.some((c) => c.name === 'Finance' && c.confidence >= 0.7) && score > 0) score += 1;
    } catch {
      // A failed classifier call never blocks a message. The rules above still apply.
      log.warn('Message classifier unavailable, using rules only.');
    }
  }
  const flag: ModerationFlag = harassment ? 'harassment_suspected' : score >= 2 ? 'scam_suspected' : 'none';
  return { flag, earlyContactShare };
}
