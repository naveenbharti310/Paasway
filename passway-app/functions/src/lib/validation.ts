import { HttpsError } from 'firebase-functions/v2/https';

export function payload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'Request data is required.');
  }
  return value as Record<string, unknown>;
}

export function documentId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || value.includes('/') || value === '.' || value === '..' || value.trim() !== value) {
    throw new HttpsError('invalid-argument', `${label} is not valid.`);
  }
  return value;
}

export function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpsError('invalid-argument', `${label} must contain 1 to ${maxLength} characters.`);
  }
  return value.trim();
}

export function tidCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z0-9]{4}$/.test(value.trim().toUpperCase())) {
    throw new HttpsError('invalid-argument', 'Enter a four character code.');
  }
  return value.trim().toUpperCase();
}

export function coordinates(lat: unknown, lng: unknown): { lat: number; lng: number } {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpsError('invalid-argument', 'A valid location is required.');
  }
  return { lat, lng };
}

export function otherParticipant(data: { userA: string; userB: string }, uid: string): string {
  if (data.userA === uid && data.userB !== uid) return data.userB;
  if (data.userB === uid && data.userA !== uid) return data.userA;
  throw new HttpsError('permission-denied', 'Not a participant in this connection.');
}
