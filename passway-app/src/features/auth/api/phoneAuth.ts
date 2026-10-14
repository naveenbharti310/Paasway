import { signInWithPhoneNumber, signInWithCustomToken } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';

export interface PhoneConfirmation { confirm(code: string): Promise<unknown> }
export const usesTestSms = process.env.EXPO_PUBLIC_OTP_PROVIDER === '2factor';

async function testRequest<T>(name: string, data: unknown): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('Test SMS server is not configured.');
  const response = await fetch(`${base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const body = await response.json();
  if (!response.ok || !body.result) throw new Error(body.error?.message || 'Could not complete sign-in. Try again.');
  return body.result as T;
}

export async function beginPhoneSignIn(phone: string): Promise<PhoneConfirmation> {
  // Firebase is the default. There is no automatic cross-provider fallback.
  if (!usesTestSms) return signInWithPhoneNumber(auth, phone);
  const { challengeId } = await testRequest<{ challengeId: string }>('testOtpSend', { phone });
  return { confirm: async (code: string) => {
    const { token } = await testRequest<{ token: string }>('testOtpVerify', { challengeId, code });
    return signInWithCustomToken(auth, token);
  } };
}
