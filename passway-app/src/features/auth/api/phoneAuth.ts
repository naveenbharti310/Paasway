import { signInWithPhoneNumber, signInWithCustomToken } from '@react-native-firebase/auth';
import { getToken } from '@react-native-firebase/app-check';
import { auth, appCheck } from '../../../firebase/client';

export interface PhoneConfirmation { confirm(code: string): Promise<unknown> }
export const usesTwoFactorSms = process.env.EXPO_PUBLIC_OTP_PROVIDER === '2factor';

async function otpRequest<T>(name: string, data: unknown): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('SMS server is not configured.');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.EXPO_PUBLIC_APP_CHECK !== 'off') {
    if (!appCheck) throw new Error('Device verification is not ready. Restart the app and try again.');
    headers['x-firebase-appcheck'] = (await getToken(appCheck)).token;
  }
  const response = await fetch(`${base}/api/${name}`, { method: 'POST', headers, body: JSON.stringify(data) });
  const body = await response.json();
  if (!response.ok || !body.result) throw new Error(body.error?.message || 'Could not complete sign-in. Try again.');
  return body.result as T;
}

export async function beginPhoneSignIn(phone: string): Promise<PhoneConfirmation> {
  // Provider is selected per build. Switching later retains the phone-based UID.
  // Firebase remains the fallback for an unset build setting, not provider errors.
  if (!usesTwoFactorSms) return signInWithPhoneNumber(auth, phone);
  const { challengeId } = await otpRequest<{ challengeId: string }>('otpSend', { phone });
  return { confirm: async (code: string) => {
    const { token } = await otpRequest<{ token: string }>('otpVerify', { challengeId, code });
    return signInWithCustomToken(auth, token);
  } };
}
