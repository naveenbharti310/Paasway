import { withDeadline } from './withDeadline';

export const SUPPORT_EMAIL = 'Limerencetechnologies@gmail.com';
export const SUPPORT_URI = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Passway support')}`;
export const PHONE_USE_DISCLOSURE = 'Your phone number is used to sign in and help prevent abuse. It is not shown to people you connect with.';

type SupportResult = { opened: true } | { opened: false; message: string };

// Do not attach account identifiers, messages or logs to an external email
// application. The person chooses what to send.
export async function openSupportEmail(openURL: (uri: string) => Promise<unknown>): Promise<SupportResult> {
  try {
    await withDeadline(() => openURL(SUPPORT_URI), 10000);
    return { opened: true };
  } catch {
    return { opened: false, message: `Email support at ${SUPPORT_EMAIL}.` };
  }
}