import { AppState, Keyboard, Platform } from 'react-native';
import { getCrashlytics, log, recordError, setAttribute, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics';

// Enabled only in the internal diagnostic build. Never record phone numbers,
// account IDs, input values, location, or chat content.
export const diagnosticsEnabled = process.env.EXPO_PUBLIC_DIAGNOSTICS === '1';
let currentScreen = 'Startup';

export function diagnosticScreen(name: string) {
  currentScreen = name;
  if (diagnosticsEnabled && Platform.OS !== 'web') {
    const instance = getCrashlytics();
    log(instance, `screen:${name}`);
    void setAttribute(instance, 'screen', name);
  }
}

export function startDiagnostics(): () => void {
  if (Platform.OS === 'web') return () => {};
  const instance = getCrashlytics();
  // Explicitly reset the persisted collection preference on non-test builds.
  void setCrashlyticsCollectionEnabled(instance, diagnosticsEnabled);
  if (!diagnosticsEnabled) return () => {};
  log(instance, 'Internal diagnostic session started');
  let active = AppState.currentState === 'active';
  let previous = Date.now();
  let lastReport = 0;
  const state = AppState.addEventListener('change', (next) => {
    active = next === 'active';
    previous = Date.now();
    log(instance, `app:${next}`);
  });
  const shown = Keyboard.addListener('keyboardDidShow', () => log(instance, `keyboard:shown:${currentScreen}`));
  const hidden = Keyboard.addListener('keyboardDidHide', () => log(instance, `keyboard:hidden:${currentScreen}`));
  const timer = setInterval(() => {
    const now = Date.now();
    const delay = now - previous - 1000;
    previous = now;
    // A JS stall is evidence, not a diagnosis of a native crash or ANR.
    if (active && delay > 2500 && now - lastReport > 60000) {
      lastReport = now;
      void setAttribute(instance, 'js_stall_ms', String(Math.round(delay)));
      recordError(instance, new Error('Diagnostic: foreground JavaScript event-loop stall'), 'ForegroundJsStall');
    }
  }, 1000);
  return () => { clearInterval(timer); state.remove(); shown.remove(); hidden.remove(); };
}