import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// A light tap of feedback on key actions. Does nothing in a browser.
export function tap(): void {
  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function success(): void {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
