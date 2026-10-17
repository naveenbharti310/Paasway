import { HttpsError } from 'firebase-functions/v2/https';

// Increment only when the published rules change materially. Consent metadata
// is server-owned; Firestore clients cannot create or update these fields.
export const CONTENT_POLICY_VERSION = '2026-10-17.1';
export function hasContentPolicyConsent(profile: Record<string, unknown>): boolean {
  return profile.contentPolicyVersion === CONTENT_POLICY_VERSION &&
    typeof profile.contentPolicyAcceptedAt === 'number' &&
    Number.isFinite(profile.contentPolicyAcceptedAt) && profile.contentPolicyAcceptedAt > 0;
}
export function assertContentPolicyConsent(profile: Record<string, unknown>): void {
  if (!hasContentPolicyConsent(profile)) {
    throw new HttpsError('failed-precondition', 'Accept the current Passway use rules before connecting or sending messages.');
  }
}
