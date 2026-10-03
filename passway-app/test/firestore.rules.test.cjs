const { test, before, beforeEach, after } = require('node:test');
const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, deleteDoc, getDocs, query, collection, where } = require('firebase/firestore');
let environment;
const user = (uid = 'alice') => environment.authenticatedContext(uid).firestore();
const profile = { userId: 'alice', status: 'active', createdAt: 1 };
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-passway', firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/alice'), profile),
      setDoc(doc(db, 'users/bob'), { userId: 'bob', status: 'active', createdAt: 1 }),
      setDoc(doc(db, 'connectionRequests/req1'), { generatorId: 'alice', requesterId: 'bob', tid: 'AB12', tidCreatedAt: 1, status: 'pending' }),
      setDoc(doc(db, 'connections/chat1'), { userA: 'alice', userB: 'bob', status: 'active' }),
      setDoc(doc(db, 'connections/chat1/messages/msg1'), { content: 'Hello' }),
      setDoc(doc(db, 'tids/AB12'), { generatorId: 'alice' }),
    ]);
  });
});
test('read only your own profile', async () => { await assertSucceeds(getDoc(doc(user(), 'users/alice'))); await assertFails(getDoc(doc(user(), 'users/bob'))); });
test('create a valid own profile', async () => { await assertSucceeds(setDoc(doc(user('carol'), 'users/carol'), { userId: 'carol', status: 'active', createdAt: 1 })); });
test('reject a forged profile identity', async () => { await assertFails(setDoc(doc(user('carol'), 'users/carol'), { userId: 'alice', status: 'active', createdAt: 1 })); });
test('reject unknown profile fields', async () => { await assertFails(setDoc(doc(user('carol'), 'users/carol'), { userId: 'carol', status: 'active', createdAt: 1, isAdmin: true })); });
test('allow a bounded name and push token update', async () => { await assertSucceeds(updateDoc(doc(user(), 'users/alice'), { displayName: 'Alice', pushToken: 'ExpoPushToken[test]' })); });
test('reject changing moderation status', async () => { await assertFails(updateDoc(doc(user(), 'users/alice'), { status: 'banned' })); });
test('reject changing account identity or creation time', async () => { await assertFails(updateDoc(doc(user(), 'users/alice'), { userId: 'bob' })); await assertFails(updateDoc(doc(user(), 'users/alice'), { createdAt: 2 })); });
test('reject oversized names and nonstring push tokens', async () => { await assertFails(updateDoc(doc(user(), 'users/alice'), { displayName: 'x'.repeat(31) })); await assertFails(updateDoc(doc(user(), 'users/alice'), { pushToken: 1 })); });
test('a banned profile cannot update itself', async () => { await environment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'users/alice'), { status: 'banned' })); await assertFails(updateDoc(doc(user(), 'users/alice'), { displayName: 'Alice' })); });
test('clients cannot delete their moderation profile', async () => { await assertFails(deleteDoc(doc(user(), 'users/alice'))); });
test('generator scoped pending request query is allowed', async () => { await assertSucceeds(getDocs(query(collection(user(), 'connectionRequests'), where('generatorId', '==', 'alice'), where('tid', '==', 'AB12'), where('tidCreatedAt', '==', 1), where('status', '==', 'pending')))); });
test('the old unscoped request query is denied', async () => { await assertFails(getDocs(query(collection(user(), 'connectionRequests'), where('tid', '==', 'AB12'), where('status', '==', 'pending')))); });
test('only participants can read a request', async () => { await assertSucceeds(getDoc(doc(user('bob'), 'connectionRequests/req1'))); await assertFails(getDoc(doc(user('carol'), 'connectionRequests/req1'))); });
test('only participants can read messages', async () => { await assertSucceeds(getDoc(doc(user('bob'), 'connections/chat1/messages/msg1'))); await assertFails(getDoc(doc(user('carol'), 'connections/chat1/messages/msg1'))); });
test('clients cannot write messages or connections', async () => { await assertFails(setDoc(doc(user(), 'connections/chat1/messages/msg2'), { content: 'Bypass' })); await assertFails(updateDoc(doc(user(), 'connections/chat1'), { status: 'ended' })); });
test('clients cannot read or write temporary code documents', async () => { await assertFails(getDoc(doc(user(), 'tids/AB12'))); await assertFails(setDoc(doc(user(), 'tids/CD34'), { generatorId: 'alice' })); });
test('clients cannot bypass report validation', async () => { await assertFails(setDoc(doc(user(), 'reports/forged'), { reporterId: 'alice', reportedId: 'carol' })); });
test('clients cannot change rate limits', async () => { await assertFails(setDoc(doc(user(), 'rateLimits/alice_generate'), { events: [] })); });
test('signed out requests are denied', async () => { await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'users/alice'))); });
test('clients cannot read or write blocks', async () => { await assertFails(getDoc(doc(user(), 'blocks/alice:bob'))); await assertFails(setDoc(doc(user('bob'), 'blocks/bob:alice'), { blockerId: 'bob' })); });
test('a participant can find their active connection', async () => { await assertSucceeds(getDocs(query(collection(user('bob'), 'connections'), where('userB', '==', 'bob'), where('status', '==', 'active')))); await assertSucceeds(getDocs(query(collection(user(), 'connections'), where('userA', '==', 'alice'), where('status', '==', 'active')))); });
test('an unscoped connection query is denied', async () => { await assertFails(getDocs(query(collection(user('carol'), 'connections'), where('status', '==', 'active')))); });
test('clients cannot read account holds', async () => { await assertFails(getDoc(doc(user(), 'accountHolds/any'))); });
test('clients cannot read or write maintenance records', async () => { await assertFails(getDoc(doc(user(), 'system/maintenance'))); await assertFails(setDoc(doc(user(), 'system/maintenance'), { lastRunAt: 0 })); });
test('clients cannot mark their own age as confirmed or clear moderation flags', async () => {
  await assertFails(updateDoc(doc(user(), 'users/alice'), { ageConfirmedAt: 1 }));
  await assertFails(updateDoc(doc(user(), 'users/alice'), { flagCount: 0 }));
  await assertFails(setDoc(doc(user('carol'), 'users/carol'), { userId: 'carol', status: 'active', createdAt: 1, ageConfirmedAt: 1 }));
});
test('you can keep a private note about someone in your chat', async () => {
  await assertSucceeds(setDoc(doc(user(), 'users/alice/notes/chat1'), { note: 'Bob from the gym', updatedAt: 1 }));
  await assertSucceeds(getDoc(doc(user(), 'users/alice/notes/chat1')));
  await assertSucceeds(deleteDoc(doc(user(), 'users/alice/notes/chat1')));
});
test('nobody else can read or write your notes', async () => {
  await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'users/alice/notes/chat1'), { note: 'Bob from the gym', updatedAt: 1 }));
  await assertFails(getDoc(doc(user('bob'), 'users/alice/notes/chat1')));
  await assertFails(setDoc(doc(user('bob'), 'users/alice/notes/chat1'), { note: 'x', updatedAt: 1 }));
});
test('notes must be short, about your own active chat, and have no extra fields', async () => {
  await assertFails(setDoc(doc(user(), 'users/alice/notes/chat1'), { note: 'x'.repeat(41), updatedAt: 1 }));
  await assertFails(setDoc(doc(user(), 'users/alice/notes/chat1'), { note: '', updatedAt: 1 }));
  await assertFails(setDoc(doc(user(), 'users/alice/notes/chat1'), { note: 'ok', updatedAt: 1, extra: true }));
  await assertFails(setDoc(doc(user(), 'users/alice/notes/nochat'), { note: 'ok', updatedAt: 1 }));
  await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'connections/chat2'), { userA: 'bob', userB: 'carol', status: 'active' }));
  await assertFails(setDoc(doc(user(), 'users/alice/notes/chat2'), { note: 'ok', updatedAt: 1 }));
  await environment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), 'connections/chat1'), { status: 'ended' }));
  await assertFails(setDoc(doc(user(), 'users/alice/notes/chat1'), { note: 'ok', updatedAt: 1 }));
});
