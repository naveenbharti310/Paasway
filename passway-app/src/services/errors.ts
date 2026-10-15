// Native Firebase errors carry codes such as "functions/unavailable" or
// "auth/too-many-requests". The service prefix is dropped before matching.
const MESSAGES: Record<string, string> = {
  'network-request-failed': 'Could not connect. Check your internet connection and try again.',
  unavailable: 'Could not connect. Check your internet connection and try again.',
  'deadline-exceeded': 'This is taking too long. Check your connection and try again.',
  'too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'resource-exhausted': 'Too many attempts. Wait a moment and try again.',
  'invalid-verification-code': 'That code did not match. Try again.',
  'session-expired': 'The verification code has expired. Request a new one.',
  'code-expired': 'The verification code has expired. Request a new one.',
  'invalid-phone-number': 'That phone number is not valid. Check it and try again.',
  'permission-denied': 'This action is not available for your account.',
  unauthenticated: 'Your session has ended. Sign in again.',
  // Firebase only sends real text messages on a paid plan.
  'billing-not-enabled': 'Text-message sign-in is not available right now. Please try again later.',
};

export function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = String((error as { code: unknown }).code);
  return code.includes('/') ? code.slice(code.indexOf('/') + 1) : code;
}

const TRANSPORT = new Set(['network-request-failed', 'unavailable', 'deadline-exceeded', 'internal', 'unknown']);

// The web SDK adds the HTTP status to the end, for example "... [404]".
const clean = (message: string) => message.replace(/^\[[^\]]+\]\s*/, '').replace(/\s*\[\d{3}\]$/, '');

export function errorMessage(error: unknown, fallback: string): string {
  const code = errorCode(error);
  const raw = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  // Cloud Functions send messages written for people, so those are shown as is.
  if (raw.startsWith('functions/') && !TRANSPORT.has(code) && error instanceof Error && error.message) return clean(error.message);
  if (MESSAGES[code]) return MESSAGES[code];
  if (code === 'internal' || code === 'unknown') return fallback;
  // Other Firebase codes come with technical text such as
  // "Firebase: Error (auth/missing-project-id)". Never show that to people.
  if (raw) return 'Something went wrong. Try again.';
  if (error instanceof Error && error.message && !/firebase|\(auth\/|\(firestore\//i.test(error.message)) return clean(error.message);
  return fallback;
}
