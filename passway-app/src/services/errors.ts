export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const code = 'code' in error ? String(error.code) : '';
  if (code === 'auth/network-request-failed' || code === 'unavailable' || code === 'functions/unavailable') return 'Could not connect. Check your internet connection and try again.';
  if (code === 'auth/too-many-requests' || code === 'functions/resource-exhausted') return 'Too many attempts. Wait a moment and try again.';
  if (code === 'auth/invalid-verification-code') return 'That code did not match. Try again.';
  if (code === 'auth/code-expired') return 'The verification code has expired. Request a new one.';
  if (code === 'permission-denied') return 'This action is not available for your account.';
  if (code === 'functions/internal' || code === 'internal') return fallback;
  return error.message || fallback;
}
