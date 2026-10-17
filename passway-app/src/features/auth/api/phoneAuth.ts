import { NativeModules } from 'react-native';
import { signInWithPhoneNumber, signInWithCustomToken } from '@react-native-firebase/auth';
import { getToken } from '@react-native-firebase/app-check';
import { withDeadline } from '../../../services/withDeadline';
import { auth, appCheck } from '../../../firebase/client';

export interface PhoneConfirmation { confirm(code: string): Promise<unknown> }
export const usesTwoFactorSms = process.env.EXPO_PUBLIC_OTP_PROVIDER === '2factor';
const diagnosticPhones = new Set(['+919999900001', '+919999900002']);

async function otpRequest<T>(name: string, data: unknown): Promise<T> {
  return withDeadline(async (signal) => {
    const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
    if (!base) throw new Error('SMS server is not configured.');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (process.env.EXPO_PUBLIC_APP_CHECK !== 'off') {
      if (!appCheck) throw new Error('Device verification is not ready. Restart the app and try again.');
      headers['x-firebase-appcheck'] = (await getToken(appCheck)).token;
    }
    if (signal.aborted) throw Object.assign(new Error('Sign-in request timed out.'), { code: 'functions/deadline-exceeded' });
    const response = await fetch(`${base}/api/${name}`, { method: 'POST', headers, body: JSON.stringify(data), signal });
    const body = await response.json();
    if (!response.ok || !body.result) throw new Error(body.error?.message || 'Could not complete sign-in. Try again.');
    return body.result as T;
  });
}

export async function beginPhoneSignIn(phone: string): Promise<PhoneConfirmation> {
  if (process.env.EXPO_PUBLIC_DIAGNOSTICS === '1' && NativeModules.PasswayDiagnostics?.isTestLab && !diagnosticPhones.has(phone)) {
    throw new Error('Automated device tests must use a configured fictional test number. No SMS was sent.');
  }
  // Only preconfigured Firebase fictional numbers in the internal diagnostic
  // build use Firebase's official no-SMS testing flow. Real phones still use
  // 2Factor. No locally generated token, fixed-code verifier, or auth bypass.
  if (process.env.EXPO_PUBLIC_DIAGNOSTICS === '1' && diagnosticPhones.has(phone)) {
    auth.settings.appVerificationDisabledForTesting = true;
    return signInWithPhoneNumber(auth, phone);
  }
  auth.settings.appVerificationDisabledForTesting = false;
  // These two reserved, preconfigured Firebase fictional numbers are also
  // dedicated Google Play reviewer accounts. Firebase validates their private
  // Console-configured credentials; no code or custom verifier is bundled.
  // Unlike diagnostics, release reviewers keep native app verification on.
  // Ordinary users still use the build-selected provider with no error fallback.
  if (diagnosticPhones.has(phone)) {
    return withDeadline(async () => {
      const confirmation = await signInWithPhoneNumber(auth, phone);
      return { confirm: (code: string) => withDeadline(async () => confirmation.confirm(code)) };
    });
  }
  // Provider is selected per build. Switching later retains the phone-based UID.
  // Firebase remains the fallback for an unset build setting, not provider errors.
  if (!usesTwoFactorSms) return signInWithPhoneNumber(auth, phone);
  const { challengeId } = await otpRequest<{ challengeId: string }>('otpSend', { phone });
  return { confirm: (code: string) => withDeadline(async (signal) => {
    const { token } = await otpRequest<{ token: string }>('otpVerify', { challengeId, code });
    if (signal.aborted) throw Object.assign(new Error('Sign-in request timed out.'), { code: 'functions/deadline-exceeded' });
    // The verification budget also covers the native Firebase token exchange.
    // An SDK exchange already in progress cannot be forcibly cancelled.
    return signInWithCustomToken(auth, token);
  }) };
}
