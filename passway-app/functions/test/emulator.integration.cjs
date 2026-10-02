const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('These tests require the local Firestore emulator.');
process.env.GCLOUD_PROJECT = 'demo-passway';
const { db } = require('../lib/lib/firebase');
const { getApps } = require('firebase-admin/app');
const codeGenerator = require('../lib/lib/tid');
const originalRandom = codeGenerator.randomTid;
const { generateTid, redeemTid } = require('../lib/handlers/tids');
const { respondToRequest, endConnection } = require('../lib/handlers/connections');
const { sendMessage } = require('../lib/handlers/messages');
const { fileReport, blockUser } = require('../lib/handlers/reports');
const { closeIdleConnections } = require('../lib/services/connections');
const { encodeGeohash } = require('../lib/geo');
const call = (fn, data, uid = 'alice') => fn.run({ auth: { uid }, data });
const collection = (name) => db.collection(name);
beforeEach(async () => {
  const response = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-passway/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(response.ok, true);
  await Promise.all(['alice', 'bob', 'carol'].map((uid) => collection('users').doc(uid).set({ userId: uid, status: 'active', createdAt: Date.now() })));
});
afterEach(() => { codeGenerator.randomTid = originalRandom; });
after(async () => { await db.terminate(); await Promise.all(getApps().map((app) => app.delete())); });
async function seedCode() {
  await collection('tids').doc('AB12').set({ tid: 'AB12', generatorId: 'alice', generatorName: 'Alice', status: 'active', geoHash: encodeGeohash(28.6, 77.2), createdAt: Date.now(), expiresAt: Date.now() + 300000 });
}
async function seedConnection() {
  await collection('connections').doc('chat1').set({ connectionId: 'chat1', userA: 'alice', userB: 'bob', userAName: 'Alice', userBName: 'Bob', status: 'active', createdAt: Date.now() });
}
test('concurrent redemption creates only one request', { timeout: 60000 }, async () => {
  await seedCode();
  const results = await Promise.allSettled(['bob', 'carol'].map((uid) => call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: uid }, uid)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await collection('connectionRequests').get()).size, 1);
});
test('concurrent allocation cannot overwrite an occupied code', { timeout: 60000 }, async () => {
  codeGenerator.randomTid = () => 'AB12';
  const results = await Promise.allSettled(['alice', 'bob'].map((uid) => call(generateTid, { lat: 28.6, lng: 77.2, displayName: uid }, uid)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await collection('tids').get()).size, 1);
});
test('redeem and accept complete using real Firestore transactions', async () => {
  await seedCode();
  const request = await call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, 'bob');
  const result = await call(respondToRequest, { requestId: request.requestId, accept: true });
  assert.equal((await collection('connections').doc(result.connectionId).get()).data().status, 'active');
});
test('a message racing with end is rejected or receives retention', { timeout: 60000 }, async () => {
  await seedConnection();
  await Promise.allSettled([call(sendMessage, { connectionId: 'chat1', content: 'Hello' }), call(endConnection, { connectionId: 'chat1' }, 'bob')]);
  assert.equal((await collection('connections').doc('chat1').get()).data().status, 'ended');
  const messages = await collection('connections').doc('chat1').collection('messages').get();
  messages.docs.forEach((message) => assert.ok(message.data().deleteAt));
});
test('report hold survives concurrent end across more than 500 messages', { timeout: 60000 }, async () => {
  await seedConnection();
  for (let offset = 0; offset < 601; offset += 200) {
    const batch = db.batch();
    for (let i = offset; i < Math.min(offset + 200, 601); i++) batch.set(collection('connections').doc('chat1').collection('messages').doc(`m${String(i).padStart(4, '0')}`), { content: 'Hello' });
    await batch.commit();
  }
  const results = await Promise.allSettled([call(endConnection, { connectionId: 'chat1' }), call(fileReport, { connectionId: 'chat1', reportedId: 'alice', reason: 'Spam' }, 'bob')]);
  results.forEach((result) => assert.equal(result.status, 'fulfilled'));
  const connection = (await collection('connections').doc('chat1').get()).data();
  const messages = await collection('connections').doc('chat1').collection('messages').get();
  assert.ok(connection.deleteAt.toMillis() > Date.now() + 29 * 86400000);
  assert.equal(messages.size, 601);
  messages.docs.forEach((message) => assert.equal(message.data().deleteAt.toMillis(), connection.deleteAt.toMillis()));
});
test('a forged report has no partial database effects', async () => {
  await seedConnection();
  await assert.rejects(call(fileReport, { connectionId: 'chat1', reportedId: 'carol', reason: 'Spam' }), { code: 'invalid-argument' });
  assert.equal((await collection('reports').get()).size, 0);
  assert.equal((await collection('connections').doc('chat1').get()).data().status, 'active');
  assert.equal((await collection('users').doc('carol').get()).data().status, 'active');
});
test('a block stops a later redemption between the same people', async () => {
  await seedConnection();
  await call(blockUser, { connectionId: 'chat1' }, 'bob');
  await seedCode();
  await assert.rejects(call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, 'bob'), { code: 'not-found' });
  assert.equal((await collection('tids').doc('AB12').get()).data().status, 'active');
  assert.equal((await collection('connectionRequests').get()).size, 0);
});
test('the idle sweep uses the composite query and closes only idle connections', async () => {
  const now = Date.now();
  await collection('connections').doc('old').set({ connectionId: 'old', userA: 'alice', userB: 'bob', status: 'active', createdAt: now - 4 * 86400000, lastActivityAt: now - 4 * 86400000 });
  await collection('connections').doc('fresh').set({ connectionId: 'fresh', userA: 'alice', userB: 'carol', status: 'active', createdAt: now, lastActivityAt: now });
  await collection('connections').doc('old').collection('messages').doc('m1').set({ content: 'x', sentAt: now - 4 * 86400000 });
  assert.equal(await closeIdleConnections(now), 1);
  assert.equal((await collection('connections').doc('old').get()).data().status, 'ended');
  assert.equal((await collection('connections').doc('fresh').get()).data().status, 'active');
  assert.ok((await collection('connections').doc('old').collection('messages').doc('m1').get()).data().deleteAt);
});
