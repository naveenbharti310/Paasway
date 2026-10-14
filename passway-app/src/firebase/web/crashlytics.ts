// Crashlytics is native-only. Web previews must not load its native module.
export const getCrashlytics = () => ({});
export const log = () => {};
export const recordError = () => {};
export const setAttribute = async () => {};
export const setCrashlyticsCollectionEnabled = async () => {};