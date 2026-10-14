import { RecaptchaVerifier, signInWithPhoneNumber as webSignIn, type Auth, type ConfirmationResult } from 'firebase/auth';

export { getAuth, onAuthStateChanged, signOut, signInWithCustomToken } from 'firebase/auth';
export type { ConfirmationResult, User } from 'firebase/auth';

let verifier: RecaptchaVerifier | undefined;

// A browser has to pass a reCAPTCHA check before a code is sent. The invisible
// version usually passes without showing anything.
export async function signInWithPhoneNumber(auth: Auth, phoneNumber: string): Promise<ConfirmationResult> {
  // Automated tests build with this flag so the check is skipped. It only
  // works with the test numbers set up in Firebase, never with real numbers.
  if (process.env.EXPO_PUBLIC_WEB_TEST_MODE === '1') auth.settings.appVerificationDisabledForTesting = true;
  verifier?.clear();
  let holder = document.getElementById('recaptcha-holder');
  holder?.remove();
  holder = document.createElement('div');
  holder.id = 'recaptcha-holder';
  document.body.appendChild(holder);
  verifier = new RecaptchaVerifier(auth, holder, { size: 'invisible' });
  return webSignIn(auth, phoneNumber, verifier);
}
