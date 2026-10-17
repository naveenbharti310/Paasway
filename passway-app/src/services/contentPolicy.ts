// Must match the server policy and public use-rules page. No blanket consent
// to advertising, unrelated data processing, purchases or future terms.
export const CONTENT_POLICY_VERSION = '2026-10-17.1';
export const CONTENT_RULES = [
  'Passway is for adults aged 18 and over. Connect only with people you have met in person who want to connect with you.',
  'Do not send threats, harassment, bullying, hate, discriminatory abuse, sexually explicit content or non-consensual sexual content.',
  'Never create, request, share or promote child sexual abuse or exploitation, grooming, trafficking, or any sexual content involving minors.',
  'Do not impersonate people, scam others, request fraudulent payments, send spam, distribute malware, or promote unlawful activity.',
  'Respect privacy. Do not share another person’s private information without permission. Do not evade a block or an account restriction.',
  'Use the chat menu to report a conversation, block someone or end a connection. Reports close the chat and block that account. Passway may restrict accounts and preserve safety evidence as explained in the privacy notice.',
  'Automated screening is not a guarantee that content is safe. Support is not an emergency service. Contact local emergency services if there is immediate danger. For other safety concerns, contact Limerencetechnologies@gmail.com. Do not email illegal images or videos.',
] as const;
export function hasContentPolicyConsent(profile: Record<string, unknown>): boolean {
  return profile.contentPolicyVersion === CONTENT_POLICY_VERSION && typeof profile.contentPolicyAcceptedAt === 'number' &&
    Number.isFinite(profile.contentPolicyAcceptedAt) && profile.contentPolicyAcceptedAt > 0;
}
