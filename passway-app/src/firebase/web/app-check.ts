// App Check is not used in the web preview. These stand ins keep the shared
// client code compiling; they are never called because the preview is built
// with EXPO_PUBLIC_APP_CHECK=off.
export class ReactNativeFirebaseAppCheckProvider {
  configure(_options: unknown): void {}
}

export function initializeAppCheck(_app: unknown, _options: unknown): void {}
