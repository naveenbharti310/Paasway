import { httpsCallableFromURL } from 'firebase/functions';

export { getFunctions, httpsCallable } from 'firebase/functions';

// The native package spells this name with "Url", the web SDK with "URL".
export const httpsCallableFromUrl = httpsCallableFromURL;
