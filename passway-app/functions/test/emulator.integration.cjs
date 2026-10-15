process.env.MODERATION_PROVIDER = 'rules';
const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('These tests require the local Firestore emulator.');
process.env.GCLOUD_PROJECT = 'demo-passway';
// Supported gcp-metadata setting, after the strict localhost guard above.
// Local emulator tests must not wait for a cloud metadata-service probe.
process.env.METADATA_SERVER_DETECTION = 'none';
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
  await Promise.all(['alice', 'bob', 'carol'].map((uid) => collection('users').doc(uid).set({ userId: uid, status: 'active', createdAt: Date.now(), ageConfirmedAt: Date.now() })));
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
test('account deletion ends open chats using real queries', async () => {
  const firebase = require('../lib/lib/firebase');
  const { deleteAccount } = require('../lib/handlers/accounts');
  const original = firebase.auth;
  firebase.auth = { deleteUser: async () => {} };
  try {
    await seedConnection();
    await seedCode();
    await call(deleteAccount, {}, 'alice');
    assert.equal((await collection('users').doc('alice').get()).exists, false);
    assert.equal((await collection('connections').doc('chat1').get()).data().status, 'ended');
    assert.equal((await collection('tids').doc('AB12').get()).data().status, 'deactivated');
  } finally { firebase.auth = original; }
});
test('the cleanup sweep deletes only expired documents, including messages', { timeout: 60000 }, async () => {
  const { deleteExpired } = require('../lib/services/cleanup');
  const past = new Date(Date.now() - 1000);
  const future = new Date(Date.now() + 3600000);
  await seedConnection();
  await collection('connections').doc('chat1').collection('messages').doc('old').set({ content: 'old', deleteAt: past });
  await collection('connections').doc('chat1').collection('messages').doc('new').set({ content: 'new', deleteAt: future });
  await collection('tids').doc('OLD1').set({ status: 'expired', deleteAt: past });
  await collection('tids').doc('NEW1').set({ status: 'active', deleteAt: future });
  await collection('rateLimits').doc('alice_x').set({ events: [], deleteAt: past });
  await collection('accountHolds').doc('banned').set({ status: 'banned' });
  const deleted = await deleteExpired();
  assert.equal(deleted, 3);
  const messages = await collection('connections').doc('chat1').collection('messages').get();
  assert.deepEqual(messages.docs.map((doc) => doc.id), ['new']);
  assert.equal((await collection('tids').doc('NEW1').get()).exists, true);
  assert.equal((await collection('tids').doc('OLD1').get()).exists, false);
  assert.equal((await collection('accountHolds').doc('banned').get()).exists, true);
  assert.equal((await collection('connections').doc('chat1').get()).exists, true);
});
test('maintenance runs at most once per interval even when called in parallel', { timeout: 60000 }, async () => {
  const { maybeRunMaintenance } = require('../lib/services/cleanup');
  const now = Date.now();
  const runs = await Promise.all([maybeRunMaintenance(now), maybeRunMaintenance(now), maybeRunMaintenance(now)]);
  assert.equal(runs.filter(Boolean).length, 1);
  assert.equal(await maybeRunMaintenance(now + 60000), false);
  assert.equal(await maybeRunMaintenance(now + 16 * 60000), true);
});
test('automated profile cannot redeem a normal code and vice versa', async () => {
  await seedCode();
  await collection('users').doc('bob').update({ automatedTest: true });
  await assert.rejects(call(redeemTid, {tid:'AB12',lat:28.6,lng:77.2,displayName:'Test'}, 'bob'), {code:'not-found'});
  assert.equal((await collection('connectionRequests').get()).size, 0);
  await collection('users').doc('bob').update({ automatedTest: false });
  await collection('users').doc('alice').update({ automatedTest: true });
  await assert.rejects(call(redeemTid, {tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'}, 'bob'), {code:'not-found'});
  assert.equal((await collection('tids').doc('AB12').get()).data().status, 'active');
});
test('two automated profiles can pair using the real handler and transaction', async () => {
  await Promise.all(['alice','bob'].map(uid => collection('users').doc(uid).update({automatedTest:true})));
  await seedCode();
  const request = await call(redeemTid, {tid:'AB12',lat:28.6,lng:77.2,displayName:'Test B'}, 'bob');
  const result = await call(respondToRequest, {requestId:request.requestId,accept:true});
  assert.equal((await collection('connections').doc(result.connectionId).get()).data().status, 'active');
});
test('pending cross-cohort request cannot be accepted', async () => {
  await seedCode();
  const request = await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');
  await collection('users').doc('bob').update({automatedTest:true});
  await assert.rejects(call(respondToRequest,{requestId:request.requestId,accept:true}),{code:'not-found'});
  assert.equal((await collection('connections').get()).size,0);
});

test('real concurrent message retries create one message and one moderation flag', {timeout:60000}, async()=>{
 await seedConnection();const data={connectionId:'chat1',content:'share the OTP',clientMessageId:'concurrent-key-000001'};
 const results=await Promise.all([call(sendMessage,data),call(sendMessage,data),call(sendMessage,data)]);
 assert.deepEqual(results[0],results[1]);assert.equal((await collection('connections').doc('chat1').collection('messages').get()).size,1);assert.equal((await collection('users').doc('alice').get()).data().flagCount,1);
});
test('real message retry key conflicts cannot alter committed text',async()=>{
 await seedConnection();const data={connectionId:'chat1',content:'Original',clientMessageId:'immutable-key-000001'};await call(sendMessage,data);
 await assert.rejects(call(sendMessage,{...data,content:'Altered'}),{code:'failed-precondition'});
 const docs=(await collection('connections').doc('chat1').collection('messages').get()).docs;assert.equal(docs.length,1);assert.equal(docs[0].data().content,'Original');
});
test('real sender-scoped retry keys permit both participants independently',async()=>{
 await seedConnection();const data={connectionId:'chat1',content:'Hello',clientMessageId:'sender-scope-000001'};await Promise.all([call(sendMessage,data,'alice'),call(sendMessage,data,'bob')]);assert.equal((await collection('connections').doc('chat1').collection('messages').get()).size,2);
});

test('cleanup cannot delete a message after a report hold commits during candidate selection', {timeout:60000}, async()=>{
 await seedConnection();const m=collection('connections').doc('chat1').collection('messages').doc('held');await m.set({content:'evidence',sentAt:Date.now()-4*86400000,deleteAt:new Date(Date.now()-1000)});
 const original=db.collectionGroup;let fired=false;
 function wrap(q){return new Proxy(q,{get(target,key){if(key==='get')return async()=>{const snap=await target.get();if(!fired){fired=true;await call(fileReport,{connectionId:'chat1',reportedId:'alice',reason:'Unsafe'},'bob');}return snap;};const value=Reflect.get(target,key,target);if(typeof value==='function'&&['where','limit'].includes(key))return (...args)=>wrap(value.apply(target,args));return typeof value==='function'?value.bind(target):value;}});}
 db.collectionGroup=function(name){const q=original.call(this,name);return name==='messages'?wrap(q):q;};
 try{await require('../lib/services/cleanup').deleteExpired();}finally{db.collectionGroup=original;}
 assert.equal(fired,true);assert.equal((await m.get()).exists,true,'cleanup must recheck the newly committed safety hold');
});
test('cleanup protects and repairs messages while parent report retention has not propagated',async()=>{
 await seedConnection();const future=new Date(Date.now()+90*86400000);await collection('connections').doc('chat1').update({status:'ended',deleteAt:future});const m=collection('connections').doc('chat1').collection('messages').doc('unrepaired');await m.set({content:'evidence',deleteAt:new Date(Date.now()-1000)});
 await require('../lib/services/cleanup').deleteExpired();const snap=await m.get();assert.equal(snap.exists,true);assert.equal(snap.data().deleteAt.toMillis(),future.getTime());
});
test('cleanup drains expired children before removing their parent connection', {timeout:60000},async()=>{
 await seedConnection();const ref=collection('connections').doc('chat1'),past=new Date(Date.now()-1000);await ref.update({status:'ended',deleteAt:past});const batch=db.batch();for(let i=0;i<301;i++)batch.set(ref.collection('messages').doc('m'+i),{content:'expired',deleteAt:past});await batch.commit();
 const {deleteExpired}=require('../lib/services/cleanup');await deleteExpired();assert.equal((await ref.get()).exists,true,'a bounded message batch must not orphan remaining children');await deleteExpired();assert.equal((await ref.collection('messages').get()).size,0);assert.equal((await ref.get()).exists,false);
});
test('a block created after redemption prevents acceptance of the pending request',async()=>{
 await seedConnection();await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');await call(blockUser,{connectionId:'chat1'},'bob');
 await assert.rejects(call(respondToRequest,{requestId:pending.requestId,accept:true}),{code:'not-found'});assert.equal((await collection('connections').where('status','==','active').get()).size,0);
});
test('lost acceptance acknowledgements can be replayed without a second connection',async()=>{
 await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');const data={requestId:pending.requestId,accept:true};const first=await call(respondToRequest,data);const replay=await call(respondToRequest,data);assert.deepEqual(replay,first);assert.equal((await collection('connections').get()).size,1);
});

test('concurrent acceptance retries converge to one active connection', {timeout:60000},async()=>{
 await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');const data={requestId:pending.requestId,accept:true};const results=await Promise.all([call(respondToRequest,data),call(respondToRequest,data),call(respondToRequest,data)]);assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);assert.equal((await collection('connections').get()).size,1);
});
test('acceptance replays cannot reopen ended connections or reverse a decision',async()=>{
 await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');const data={requestId:pending.requestId,accept:true};const accepted=await call(respondToRequest,data);await assert.rejects(call(respondToRequest,{...data,accept:false}),{code:'failed-precondition'});await call(endConnection,{connectionId:accepted.connectionId});await assert.rejects(call(respondToRequest,data),{code:'failed-precondition'});assert.equal((await collection('connections').get()).size,1);
});
test('acceptance replay is restricted to its generator',async()=>{
 await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');const data={requestId:pending.requestId,accept:true};await call(respondToRequest,data);await assert.rejects(call(respondToRequest,data,'bob'),{code:'failed-precondition'});await assert.rejects(call(respondToRequest,data,'carol'),{code:'failed-precondition'});
});
test('decline is retryable but cannot subsequently be accepted',async()=>{
 await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');const data={requestId:pending.requestId,accept:false};assert.deepEqual(await call(respondToRequest,data),{});assert.deepEqual(await call(respondToRequest,data),{});await assert.rejects(call(respondToRequest,{...data,accept:true}),{code:'failed-precondition'});assert.equal((await collection('connections').get()).size,0);
});
test('cleanup never deletes an active parent with an erroneous expired marker',async()=>{
 await seedConnection();await collection('connections').doc('chat1').update({deleteAt:new Date(Date.now()-1000)});await require('../lib/services/cleanup').deleteExpired();assert.equal((await collection('connections').doc('chat1').get()).exists,true);
});
test('cleanup does not orphan nonexpired evidence under an expired parent',async()=>{
 await seedConnection();const ref=collection('connections').doc('chat1');await ref.update({status:'ended',deleteAt:new Date(Date.now()-1000)});await ref.collection('messages').doc('evidence').set({deleteAt:new Date(Date.now()+3600000)});await require('../lib/services/cleanup').deleteExpired();assert.equal((await ref.get()).exists,true);assert.equal((await ref.collection('messages').doc('evidence').get()).exists,true);
});
test('accepted-request replay survives code cleanup without allocating again',async()=>{
 await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');const data={requestId:pending.requestId,accept:true};const result=await call(respondToRequest,data);await collection('tids').doc('AB12').delete();assert.deepEqual(await call(respondToRequest,data),result);assert.equal((await collection('connections').get()).size,1);
});
test('accepted-request replay does not bypass a newly banned account',async()=>{
 await seedCode();const pending=await call(redeemTid,{tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob'},'bob');const data={requestId:pending.requestId,accept:true};await call(respondToRequest,data);await collection('users').doc('bob').update({status:'banned'});await assert.rejects(call(respondToRequest,data),{code:'permission-denied'});
});
test('cleanup rechecks account hold extensions after the expiry query',async()=>{
 const ref=collection('accountHolds').doc('held-phone');await ref.set({status:'reported',deleteAt:new Date(Date.now()-1000)});const future=new Date(Date.now()+3600000);const original=db.collection;let fired=false;
 function wrap(q){return new Proxy(q,{get(target,key){if(key==='get')return async()=>{const result=await target.get();if(!fired){fired=true;await ref.update({deleteAt:future});}return result;};const value=Reflect.get(target,key,target);if(typeof value==='function'&&['where','limit'].includes(key))return(...args)=>wrap(value.apply(target,args));return typeof value==='function'?value.bind(target):value;}});}
 db.collection=function(name){const q=original.call(this,name);return name==='accountHolds'?wrap(q):q;};try{await require('../lib/services/cleanup').deleteExpired();}finally{db.collection=original;}assert.equal(fired,true);assert.equal((await ref.get()).exists,true);assert.equal((await ref.get()).data().deleteAt.toMillis(),future.getTime());
});
