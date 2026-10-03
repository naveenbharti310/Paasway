import AsyncStorage from '@react-native-async-storage/async-storage';

// Remembers on this phone that the welcome pages were already seen, so
// signing out later goes straight to the phone number screen.
const KEY = 'passway.welcomeSeen';
let seen = false;

export async function hasSeenWelcome(): Promise<boolean> {
  if (seen) return true;
  try { seen = (await AsyncStorage.getItem(KEY)) === '1'; } catch { /* keep false */ }
  return seen;
}

export function welcomeSeenNow(): boolean {
  return seen;
}

export function markWelcomeSeen(): void {
  seen = true;
  void AsyncStorage.setItem(KEY, '1').catch(() => undefined);
}
