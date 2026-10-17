import { withDeadline } from './withDeadline';

export const PUBLIC_DOCUMENTS = Object.freeze({
  privacy: 'https://naveenbharti310.github.io/Paasway/privacy.html',
  deletion: 'https://naveenbharti310.github.io/Paasway/delete-account.html',
});
export type PublicDocument = keyof typeof PUBLIC_DOCUMENTS;
type DocumentResult = { opened: true } | { opened: false; message: string };

// The destination is an allowlisted public page, never a URL supplied by a
// caller, and contains no account identifier, location, message or auth token.
export async function openPublicDocument(document: PublicDocument, openURL: (url: string) => Promise<unknown>): Promise<DocumentResult> {
  if (document !== 'privacy' && document !== 'deletion') {
    return { opened: false, message: 'This document is not available.' };
  }
  const url = PUBLIC_DOCUMENTS[document];
  try {
    await withDeadline(() => openURL(url), 10000);
    return { opened: true };
  } catch {
    return { opened: false, message: `Open this page in your browser: ${url}` };
  }
}
