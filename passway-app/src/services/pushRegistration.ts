// Keep the native token callback separate from token acquisition. Fetching a
// device token inside that callback emits the callback again in Expo Android.
export interface RegistrationDependencies<Token> {
  prepare: () => Promise<boolean>;
  hasPermission: () => Promise<boolean>;
  getExpoToken: (deviceToken?: Token) => Promise<string>;
  save: (uid: string, expoToken: string) => Promise<void>;
}

export function createPushRegistration<Token>(dependencies: RegistrationDependencies<Token>) {
  const initial = new Map<string, Promise<void>>();
  const refreshing = new Map<string, Promise<void>>();
  const saved = new Map<string, string>();
  const revisions = new Map<string, number>();
  const writes = new Map<string, Promise<void>>();
  function nextRevision(uid: string) { const revision = (revisions.get(uid) ?? 0) + 1; revisions.set(uid, revision); return revision; }

  function persist(uid: string, token: string, revision: number): Promise<void> {
    // Serialize writes so an older slow registration cannot overwrite a newer
    // token rotation. Stale results are discarded before entering Firestore.
    const task = (writes.get(uid) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (revisions.get(uid) !== revision || saved.get(uid) === token) return;
      await dependencies.save(uid, token);
      saved.set(uid, token);
    });
    writes.set(uid, task);
    void task.finally(() => { if (writes.get(uid) === task) writes.delete(uid); }).catch(() => {});
    return task;
  }

  function register(uid: string): Promise<void> {
    const existing = initial.get(uid);
    if (existing) return existing;
    const revision = nextRevision(uid);
    const task = (async () => {
      if (!await dependencies.prepare()) return;
      await persist(uid, await dependencies.getExpoToken(), revision);
    })();
    initial.set(uid, task);
    void task.finally(() => { if (initial.get(uid) === task) initial.delete(uid); }).catch(() => {});
    return task;
  }

  function refresh(uid: string, deviceToken: Token): Promise<void> {
    const key = JSON.stringify([uid, deviceToken]);
    const existing = refreshing.get(key);
    if (existing) return existing;
    const revision = nextRevision(uid);
    const task = (async () => {
      // A token refresh must never open a permission prompt or acquire a new
      // device token. The supplied token is passed straight to the Expo API.
      if (!await dependencies.hasPermission()) return;
      await persist(uid, await dependencies.getExpoToken(deviceToken), revision);
    })();
    refreshing.set(key, task);
    void task.finally(() => { if (refreshing.get(key) === task) refreshing.delete(key); }).catch(() => {});
    return task;
  }

  return { register, refresh };
}
