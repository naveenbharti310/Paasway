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
test('real transactions enforce an under-minimum phone hold over stale adult metadata', async () => {
  await seedConnection();
  await collection('accountHolds').doc('held-phone').set({ status: 'under_minimum' });
  await collection('users').doc('alice').update({ phoneHash: 'held-phone' });
  await assert.rejects(call(generateTid, { lat: 28.6, lng: 77.2, displayName: 'Alice' }), { code: 'failed-precondition' });
  await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Denied held account' }), { code: 'failed-precondition' });
  await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Denied held recipient' }, 'bob'), { code: 'failed-precondition' });
  assert.equal((await collection('tids').get()).size, 0);
  assert.equal((await collection('connections').doc('chat1').collection('messages').get()).size, 0);
});
test('real transactions deny unknown phone-hold policy without partial effects', async () => {
  await seedConnection();
  await collection('accountHolds').doc('unknown-hold').set({ status: 'suspended' });
  await collection('users').doc('alice').update({ phoneHash: 'unknown-hold' });
  await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Denied unknown hold' }), { code: 'permission-denied' });
  assert.equal((await collection('connections').doc('chat1').collection('messages').get()).size, 0);
});
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

test('message read API excludes expired text even while evidence is retained',async()=>{
 await seedConnection();const ref=collection('connections').doc('chat1').collection('messages');const now=Date.now();await ref.doc('old').set({messageId:'old',connectionId:'chat1',senderId:'alice',content:'expired evidence',sentAt:now-72*3600000-1000,deleteAt:new Date(now+90*86400000)});await ref.doc('fresh').set({messageId:'fresh',connectionId:'chat1',senderId:'bob',content:'visible',sentAt:now,moderationFlag:'none'});
 const result=await call(require('../lib/handlers/messages').getMessages,{connectionId:'chat1'});assert.deepEqual(result.messages.map(m=>m.messageId),['fresh']);assert.equal(JSON.stringify(result).includes('expired evidence'),false);
});
test('message read API refuses outsiders and ended chats',async()=>{
 await seedConnection();const fn=require('../lib/handlers/messages').getMessages;await assert.rejects(call(fn,{connectionId:'chat1'},'carol'),{code:'permission-denied'});await call(endConnection,{connectionId:'chat1'});await assert.rejects(call(fn,{connectionId:'chat1'}),{code:'failed-precondition'});
});
test('Auth deletion failure preserves a durable deleting tombstone and can recover',async()=>{
 const firebase=require('../lib/lib/firebase'),original=firebase.auth;let fail=true;firebase.auth={deleteUser:async()=>{if(fail)throw new Error('simulated auth outage')}};
 try{await seedConnection();const fn=require('../lib/handlers/accounts').deleteAccount;await assert.rejects(call(fn,{}));assert.equal((await collection('users').doc('alice').get()).data()?.status,'deleting');assert.equal((await collection('accountDeletions').doc('alice').get()).data()?.status,'pending');await assert.rejects(call(generateTid,{lat:28.6,lng:77.2,displayName:'Alice'}),{code:'failed-precondition'});fail=false;await call(fn,{});assert.equal((await collection('users').doc('alice').get()).exists,false);assert.equal((await collection('accountDeletions').doc('alice').get()).data()?.status,'complete');}finally{firebase.auth=original;}
});
test('message API bounds history to 200 and latest preview to one',async()=>{
 await seedConnection();const ref=collection('connections').doc('chat1').collection('messages'),batch=db.batch(),now=Date.now();for(let i=0;i<205;i++)batch.set(ref.doc('m'+i),{senderId:'alice',content:String(i),sentAt:now-i-1,moderationFlag:'none'});await batch.commit();const fn=require('../lib/handlers/messages').getMessages;const all=await call(fn,{connectionId:'chat1'});assert.equal(all.messages.length,200);assert.equal(all.messages[199].content,'0');assert.equal((await call(fn,{connectionId:'chat1',latest:true})).messages.length,1);await assert.rejects(call(fn,{connectionId:'chat1',latest:'yes'}),{code:'invalid-argument'});
});
test('a deleting account cannot read message bodies, send, confirm age, or accept a pairing',async()=>{
 await seedConnection();await collection('users').doc('alice').update({status:'deleting'});await assert.rejects(call(require('../lib/handlers/messages').getMessages,{connectionId:'chat1'}),{code:'failed-precondition'});await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'blocked'}),{code:'failed-precondition'});await assert.rejects(call(require('../lib/handlers/accounts').confirmAge,{birthDate:'1990-01-01'}),{code:'failed-precondition'});
});
test('expired safety evidence cannot be targeted by a new reply',async()=>{
 await seedConnection();await collection('connections').doc('chat1').collection('messages').doc('old').set({sentAt:Date.now()-73*3600000,deleteAt:new Date(Date.now()+90*86400000)});await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'reply',replyTo:'old'}),{code:'failed-precondition'});
});
test('deletion worker resumes a failed external Auth operation without client login',async()=>{
 const firebase=require('../lib/lib/firebase'),original=firebase.auth;firebase.auth={deleteUser:async()=>{throw Error('outage')}};try{await assert.rejects(call(require('../lib/handlers/accounts').deleteAccount,{}));firebase.auth={deleteUser:async()=>{}};assert.equal(await require('../lib/services/accountDeletion').resumePendingAccountDeletions(),1);assert.equal((await collection('users').doc('alice').get()).exists,false);assert.equal((await collection('accountDeletions').doc('alice').get()).data().status,'complete');}finally{firebase.auth=original;}
});
test('bounded account deletion drains more than one page without leaving open chats or notes',async()=>{
 const firebase=require('../lib/lib/firebase'),original=firebase.auth;firebase.auth={deleteUser:async()=>{}};try{const batch=db.batch();for(let i=0;i<26;i++)batch.set(collection('connections').doc('c'+i),{userA:'alice',userB:'bob',status:'active'});for(let i=0;i<101;i++)batch.set(collection('users').doc('alice').collection('notes').doc('n'+i),{note:'private'});await batch.commit();const fn=require('../lib/handlers/accounts').deleteAccount;assert.equal((await call(fn,{})).pending,true);assert.equal((await collection('users').doc('alice').get()).data().status,'deleting');assert.equal((await call(fn,{})).pending,false);assert.equal((await collection('connections').where('status','==','active').get()).size,0);assert.equal((await collection('users').doc('alice').collection('notes').get()).size,0);}finally{firebase.auth=original;}
});
test('late report after completed deletion preserves the phone safety hold',async()=>{
 const firebase=require('../lib/lib/firebase'),original=firebase.auth;firebase.auth={deleteUser:async()=>{}};try{await seedConnection();await collection('users').doc('alice').update({phoneHash:'private-test-hash'});await call(require('../lib/handlers/accounts').deleteAccount,{});await call(fileReport,{connectionId:'chat1',reportedId:'alice',reason:'Unsafe'},'bob');assert.equal((await collection('accountHolds').doc('private-test-hash').get()).data().status,'reported');}finally{firebase.auth=original;}
});
test('message API blocks the other participant immediately after deletion is claimed',async()=>{await seedConnection();await require('../lib/services/accountDeletion').requestAccountDeletion('alice');await assert.rejects(call(require('../lib/handlers/messages').getMessages,{connectionId:'chat1'},'bob'),{code:'failed-precondition'});});
test('message read budget rejects excess refreshes before loading a chat',async()=>{const now=Date.now();await collection('rateLimits').doc('alice_message_read').set({events:Array(240).fill(now)});await assert.rejects(call(require('../lib/handlers/messages').getMessages,{connectionId:'chat1'}),{code:'resource-exhausted'});});

test('blocking a person prevents sends through another active pairing in either direction',async()=>{
 await seedConnection();await collection('connections').doc('chat2').set({connectionId:'chat2',userA:'alice',userB:'bob',status:'active',createdAt:Date.now()});
 await call(blockUser,{connectionId:'chat1'},'bob');
 for(const uid of ['alice','bob'])await assert.rejects(call(sendMessage,{connectionId:'chat2',content:'alternate channel bypass'},uid),{code:'not-found'});
 assert.equal((await collection('connections').doc('chat2').collection('messages').get()).size,0);
});
test('blocking a person prevents reading another active pairing',async()=>{
 await seedConnection();const c=collection('connections').doc('chat2');await c.set({connectionId:'chat2',userA:'alice',userB:'bob',status:'active',createdAt:Date.now()});await c.collection('messages').doc('m').set({senderId:'alice',content:'private',sentAt:Date.now(),moderationFlag:'none'});
 await call(blockUser,{connectionId:'chat1'},'bob');
 for(const uid of ['alice','bob'])await assert.rejects(call(require('../lib/handlers/messages').getMessages,{connectionId:'chat2'},uid),{code:'not-found'});
});
test('report-created blocks also deny alternate pairing sends and reads',async()=>{
 await seedConnection();await collection('connections').doc('chat2').set({connectionId:'chat2',userA:'alice',userB:'bob',status:'active',createdAt:Date.now()});await call(fileReport,{connectionId:'chat1',reportedId:'alice',reason:'Unsafe'},'bob');
 await assert.rejects(call(sendMessage,{connectionId:'chat2',content:'report bypass'},'alice'),{code:'not-found'});
 await assert.rejects(call(require('../lib/handlers/messages').getMessages,{connectionId:'chat2'},'alice'),{code:'not-found'});
});
test('a committed message retry cannot bypass a later person-level block',async()=>{
 await seedConnection();await collection('connections').doc('chat2').set({connectionId:'chat2',userA:'alice',userB:'bob',status:'active',createdAt:Date.now()});const data={connectionId:'chat2',content:'original',clientMessageId:'blocked-replay-key-0001'};await call(sendMessage,data,'alice');await call(blockUser,{connectionId:'chat1'},'bob');await assert.rejects(call(sendMessage,data,'alice'),{code:'not-found'});assert.equal((await collection('connections').doc('chat2').collection('messages').get()).size,1);
});
test('a person-level block leaves unrelated participant pairs usable',async()=>{
 await seedConnection();await collection('connections').doc('chat-ac').set({connectionId:'chat-ac',userA:'alice',userB:'carol',status:'active',createdAt:Date.now()});await call(blockUser,{connectionId:'chat1'},'bob');await call(sendMessage,{connectionId:'chat-ac',content:'unrelated pair works'},'alice');const result=await call(require('../lib/handlers/messages').getMessages,{connectionId:'chat-ac'},'carol');assert.equal(result.messages.length,1);assert.equal(result.messages[0].content,'unrelated pair works');
});
test('malformed message read selectors fail before creating rate-limit state',async()=>{
 const fn=require('../lib/handlers/messages').getMessages;
 for(const connectionId of [null,undefined,{},[],0,NaN,Infinity,'',' ','../chat1','chat1/child','x'.repeat(129)])await assert.rejects(call(fn,{connectionId}),{code:'invalid-argument'});
 await assert.rejects(call(fn,{connectionId:'chat1',latest:'true'}),{code:'invalid-argument'});
 assert.equal((await collection('rateLimits').get()).size,0);assert.equal((await collection('connections').get()).size,0);
});
test('a block racing with an alternate-chat send remains authoritative after commit', {timeout:60000},async()=>{
 // Repeat fresh channels, not repeated reads of one already-blocked channel.
 for(let round=0;round<10;round++){
  await Promise.all([collection('blocks').doc('alice:bob').delete(),collection('blocks').doc('bob:alice').delete()]);
  await seedConnection();const connectionId='race-'+round,c=collection('connections').doc(connectionId);await c.set({connectionId,userA:'alice',userB:'bob',status:'active',createdAt:Date.now()});
  const [sent,blocked]=await Promise.allSettled([call(sendMessage,{connectionId,content:'racing send'},'alice'),call(blockUser,{connectionId:'chat1'},'bob')]);
  assert.equal(blocked.status,'fulfilled');if(sent.status==='rejected')assert.equal(sent.reason.code,'not-found');
  await assert.rejects(call(sendMessage,{connectionId,content:'after block commit'},'alice'),{code:'not-found'});
  await assert.rejects(call(require('../lib/handlers/messages').getMessages,{connectionId},'alice'),{code:'not-found'});
  assert.equal((await c.collection('messages').get()).size,sent.status==='fulfilled'?1:0);
 }
});

test('unknown recipient states deny real transaction reads and writes',async()=>{await seedConnection();await collection('users').doc('bob').update({status:'suspended'});await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'Must not send'}),{code:'permission-denied'});await assert.rejects(call(require('../lib/handlers/messages').getMessages,{connectionId:'chat1'}),{code:'permission-denied'});assert.equal((await collection('connections').doc('chat1').collection('messages').get()).size,0);});
test('stale under-minimum metadata and malformed age confirmation cannot authorize real transactions',async()=>{await seedConnection();for(const patch of [{ageConfirmedAt:NaN},{ageConfirmedAt:Infinity},{ageConfirmedAt:0},{ageConfirmedAt:1,ageCheck:'under_minimum'}]){await collection('users').doc('alice').update(patch);await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'Must not send'}),{code:'failed-precondition'});}assert.equal((await collection('connections').doc('chat1').collection('messages').get()).size,0);});

test('a reviewed under-age phone stays restricted across real account deletion and recreation', async () => {
  const firebase = require('../lib/lib/firebase');
  const { confirmAge, deleteAccount } = require('../lib/handlers/accounts');
  const { phoneHash } = require('../lib/lib/accounts');
  const phone = '+919876543210', hash = phoneHash(phone);
  const originalAuth = firebase.auth;
  firebase.auth = { deleteUser: async () => {} };
  const confirm = (uid, birthDate) => confirmAge.run({ auth: { uid, token: { phone_number: phone } }, data: { birthDate } });
  try {
    await collection('users').doc('bob').set({ status: 'reported' });
    await collection('accountHolds').doc(hash).set({ status: 'reported', deleteAt: new Date(Date.now() + 86400000) });
    assert.deepEqual(await confirm('bob', `${new Date().getUTCFullYear() - 15}-01-01`), { confirmed: false });
    assert.equal((await collection('accountHolds').doc(hash).get()).data().status, 'under_minimum');
    await call(deleteAccount, {}, 'bob');
    await collection('users').doc('recreated-bob').set({ status: 'active' });
    assert.deepEqual(await confirm('recreated-bob', '1990-01-01'), { confirmed: false });
    assert.equal((await collection('accountHolds').doc(hash).get()).data().status, 'under_minimum');
  } finally { firebase.auth = originalAuth; }
});

for (const status of ['under_minimum', 'suspended']) {
  test(`real reporting preserves the ${status} phone restriction`, async () => {
    await seedConnection();
    const hold = { status, updatedAt: 123, deleteAt: new Date(Date.now() + 10 * 86400000) };
    await collection('users').doc('bob').update({ phoneHash: 'held-bob' });
    await collection('accountHolds').doc('held-bob').set(hold);
    await call(fileReport, { connectionId: 'chat1', reportedId: 'bob', reason: 'Unsafe' });
    const saved = (await collection('accountHolds').doc('held-bob').get()).data();
    assert.equal(saved.status, status);
    assert.equal(saved.updatedAt, hold.updatedAt);
    assert.equal(saved.deleteAt.toMillis(), hold.deleteAt.getTime());
    assert.equal((await collection('reports').get()).size, 1);
  });

  test(`real deletion preserves the ${status} phone restriction`, async () => {
    const firebase = require('../lib/lib/firebase');
    const originalAuth = firebase.auth;
    firebase.auth = { deleteUser: async () => {} };
    const hold = { status, updatedAt: 123, deleteAt: new Date(Date.now() + 10 * 86400000) };
    try {
      await collection('users').doc('bob').update({ status: 'reported', phoneHash: 'held-bob' });
      await collection('accountHolds').doc('held-bob').set(hold);
      await call(require('../lib/handlers/accounts').deleteAccount, {}, 'bob');
      const saved = (await collection('accountHolds').doc('held-bob').get()).data();
      assert.equal(saved.status, status);
      assert.equal(saved.updatedAt, hold.updatedAt);
      assert.equal(saved.deleteAt.toMillis(), hold.deleteAt.getTime());
      assert.equal((await collection('users').doc('bob').get()).exists, false);
    } finally { firebase.auth = originalAuth; }
  });
}

test('a concurrent rate-limit burst cannot exceed its committed budget', { timeout: 60000 }, async () => {
  const { withinRateLimit } = require('../lib/lib/rateLimits');
  const results = await Promise.all(Array.from({ length: 12 }, () => withinRateLimit('alice', 'burst_probe', 4, 60000)));
  assert.equal(results.filter(Boolean).length, 4);
  assert.equal(results.filter(value => value === false).length, 8);
  const events = (await collection('rateLimits').doc('alice_burst_probe').get()).data().events;
  assert.equal(events.length, 4);
});

test('a failed deletion job rotates behind another pending account instead of starving it', { timeout: 60000 }, async () => {
  const firebase = require('../lib/lib/firebase');
  const originalAuth = firebase.auth;
  const { requestAccountDeletion, resumePendingAccountDeletions } = require('../lib/services/accountDeletion');
  const attempts = [];
  firebase.auth = { deleteUser: async uid => { attempts.push(uid); if (uid === 'alice') throw new Error('Injected Auth outage'); } };
  try {
    await requestAccountDeletion('alice');
    await requestAccountDeletion('bob');
    await collection('accountDeletions').doc('alice').update({ lastAttemptAt: 1 });
    await collection('accountDeletions').doc('bob').update({ lastAttemptAt: 2 });
    assert.equal(await resumePendingAccountDeletions(), 0);
    assert.equal(await resumePendingAccountDeletions(), 1);
    assert.deepEqual(attempts, ['alice', 'bob']);
    assert.equal((await collection('accountDeletions').doc('alice').get()).data().status, 'pending');
    assert.equal((await collection('accountDeletions').doc('bob').get()).data().status, 'complete');
  } finally { firebase.auth = originalAuth; }
});

for (const [label, timestamp] of [['NaN', () => NaN], ['positive infinity', () => Infinity], ['future', () => Date.now() + 3600000]]) {
  test(`real transactions reject replies to an unavailable ${label} target`, async () => {
    await seedConnection();
    const messages = collection('connections').doc('chat1').collection('messages');
    await messages.doc('target').set({ senderId: 'bob', content: 'Unavailable target', sentAt: timestamp() });
    await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Must not be committed', replyTo: 'target' }), { code: 'failed-precondition' });
    assert.equal((await messages.get()).size, 1);
    assert.equal((await collection('connections').doc('chat1').get()).data().lastActivityAt, undefined);
  });
}
test('real latest-message query excludes future rows before applying its limit', async () => {
  await seedConnection();const messages = collection('connections').doc('chat1').collection('messages'), now = Date.now();
  await messages.doc('future').set({ senderId: 'bob', content: 'Future', sentAt: now + 3600000 });
  await messages.doc('visible').set({ senderId: 'bob', content: 'Visible', sentAt: now - 1000 });
  const result = await call(require('../lib/handlers/messages').getMessages, { connectionId: 'chat1', latest: true });
  assert.deepEqual(result.messages.map(message => message.content), ['Visible']);
});
test('real bounded history is not starved by more than 200 future rows', async () => {
  await seedConnection();const messages = collection('connections').doc('chat1').collection('messages'), batch = db.batch(), now = Date.now();
  for (let index = 0; index < 201; index++) batch.set(messages.doc(`future-${index}`), { senderId: 'bob', content: 'Future', sentAt: now + 3600000 + index });
  batch.set(messages.doc('visible'), { senderId: 'bob', content: 'Visible', sentAt: now - 1000 });await batch.commit();
  const result = await call(require('../lib/handlers/messages').getMessages, { connectionId: 'chat1' });
  assert.deepEqual(result.messages.map(message => message.content), ['Visible']);
});

for (const [label, invalidExpiry] of [
  ['NaN', NaN], ['infinite', Infinity], ['missing', undefined],
  ['numeric string', String(Date.now() + 86400000)], ['object', {}],
]) {
  async function malformedExpiry(ref) {
    const value = invalidExpiry === undefined ? require('firebase-admin/firestore').FieldValue.delete() : invalidExpiry;
    await ref.update({ expiresAt: value });
  }
  test(`real malformed ${label} code expiry cannot be redeemed`, async () => {
    await seedCode(); await malformedExpiry(collection('tids').doc('AB12'));
    await assert.rejects(call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, 'bob'), { code: 'not-found' });
    assert.equal((await collection('tids').doc('AB12').get()).data().status, 'active');
    assert.equal((await collection('connectionRequests').get()).size, 0);
  });
  test(`real malformed ${label} request expiry cannot create a connection`, async () => {
    await seedCode(); const result = await call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, 'bob');
    await malformedExpiry(collection('connectionRequests').doc(result.requestId));
    await assert.rejects(call(respondToRequest, { requestId: result.requestId, accept: true }), { code: 'failed-precondition' });
    assert.equal((await collection('connectionRequests').doc(result.requestId).get()).data().status, 'pending');
    assert.equal((await collection('connections').get()).size, 0);
  });
  test(`real malformed ${label} claimed code expiry cannot create a connection`, async () => {
    await seedCode(); const result = await call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, 'bob');
    await malformedExpiry(collection('tids').doc('AB12'));
    await assert.rejects(call(respondToRequest, { requestId: result.requestId, accept: true }), { code: 'failed-precondition' });
    assert.equal((await collection('tids').doc('AB12').get()).data().status, 'pending');
    assert.equal((await collection('connections').get()).size, 0);
  });
}

for (const deletingUid of ['alice', 'bob']) {
 test(`real deletion resolves a pending pairing when ${deletingUid} leaves before acceptance`, async () => {
  await seedCode();
  const pending = await call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, 'bob');
  const firebase = require('../lib/lib/firebase'), oldAuth = firebase.auth;
  firebase.auth = { deleteUser: async () => {} };
  try { assert.deepEqual(await call(require('../lib/handlers/accounts').deleteAccount, {}, deletingUid), { pending: false }); }
  finally { firebase.auth = oldAuth; }
  assert.equal((await collection('connectionRequests').doc(pending.requestId).get()).data().status, 'declined');
  assert.equal((await collection('tids').doc('AB12').get()).data().status, 'expired');
  await assert.rejects(call(respondToRequest, { requestId: pending.requestId, accept: true }));
  assert.equal((await collection('connections').get()).size, 0);
 });
}
test('real accept/delete race leaves no live connection or unresolved pending request', { timeout: 60000 }, async () => {
 await seedCode(); const pending = await call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, 'bob');
 const firebase = require('../lib/lib/firebase'), oldAuth = firebase.auth; firebase.auth = { deleteUser: async () => {} };
 try {
  const outcomes = await Promise.allSettled([call(respondToRequest, { requestId: pending.requestId, accept: true }), call(require('../lib/handlers/accounts').deleteAccount, {}, 'bob')]);
  assert.equal(outcomes[1].status, 'fulfilled'); assert.deepEqual(outcomes[1].value, { pending: false });
 } finally { firebase.auth = oldAuth; }
 assert.notEqual((await collection('connectionRequests').doc(pending.requestId).get()).data().status, 'pending');
 assert.equal((await collection('connections').where('status', '==', 'active').get()).size, 0);
 assert.equal((await collection('accountDeletions').doc('bob').get()).data().status, 'complete');
});

test('real transactions: concurrent same-intent redemption converges and lost ACK recovers', {timeout:60000}, async()=>{
  await seedCode();
  const data={tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob',redemptionId:'real-firestore-intent-0001'};
  const results=await Promise.all([call(redeemTid,data,'bob'),call(redeemTid,data,'bob'),call(redeemTid,data,'bob')]);
  assert.equal(new Set(results.map(r=>r.requestId)).size,1);
  assert.equal((await collection('connectionRequests').get()).size,1);
  const recovered=await call(redeemTid,data,'bob');
  assert.equal(recovered.requestId,results[0].requestId);assert.equal(recovered.expiresAt,results[0].expiresAt);
});
test('real transactions: a committed acceptance before redemption retry is recovered once',async()=>{
  await seedCode();const data={tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob',redemptionId:'real-firestore-intent-0002'};
  const first=await call(redeemTid,data,'bob');
  const accepted=await call(respondToRequest,{requestId:first.requestId,accept:true});
  assert.equal((await call(redeemTid,data,'bob')).requestId,first.requestId);
  assert.equal((await collection('connections').get()).size,1);
  await call(endConnection,{connectionId:accepted.connectionId},'bob');
  await assert.rejects(call(redeemTid,data,'bob'),{code:'not-found'});
});
test('real transactions: requester identity, blocks, and diagnostic cohort remain enforced on replay',async()=>{
  await seedCode();const data={tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob',redemptionId:'real-firestore-intent-0003'};
  await call(redeemTid,data,'bob');
  await assert.rejects(call(redeemTid,data,'carol'),{code:'not-found'});
  await collection('users').doc('alice').update({automatedTest:true});
  await assert.rejects(call(redeemTid,data,'bob'),{code:'not-found'});
  await collection('users').doc('alice').update({automatedTest:false});
  await collection('blocks').doc('alice:bob').set({createdAt:Date.now()});
  await assert.rejects(call(redeemTid,data,'bob'),{code:'not-found'});
  assert.equal((await collection('connectionRequests').get()).size,1);
});
test('real transactions: old intent cannot claim a recycled code incarnation',async()=>{
  await seedCode();const data={tid:'AB12',lat:28.6,lng:77.2,displayName:'Bob',redemptionId:'real-firestore-intent-0004'};
  const first=await call(redeemTid,data,'bob');const original=(await collection('tids').doc('AB12').get()).data();
  await collection('tids').doc('AB12').set({...original,status:'active',createdAt:original.createdAt+1});
  await assert.rejects(call(redeemTid,data,'bob'),{code:'not-found'});
  const next=await call(redeemTid,{...data,redemptionId:'real-firestore-intent-0005'},'bob');
  assert.notEqual(first.requestId,next.requestId);
  assert.equal((await collection('connectionRequests').get()).size,2);
});

test('real maintenance lease releases failures for immediate retry', { timeout: 60000 }, async () => {
  const { withMaintenanceLease } = require('../lib/services/maintenanceLease');
  const now = Date.now();
  await assert.rejects(withMaintenanceLease(async () => { throw Error('injected outage'); }, { now: () => now }), /injected outage/);
  const failed = (await collection('system').doc('maintenance').get()).data();
  assert.equal(failed.lastRunAt, undefined);
  assert.equal(failed.leaseOwner, undefined);
  assert.equal((await withMaintenanceLease(async () => 'retried', { now: () => now + 1 })).result, 'retried');
});
test('real maintenance transactions serialize simultaneous forced claimants', { timeout: 60000 }, async () => {
  const { withMaintenanceLease } = require('../lib/services/maintenanceLease');
  let release;
  const first = withMaintenanceLease(() => new Promise(resolve => { release = resolve; }));
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  const contenders = await Promise.all(Array.from({ length: 6 }, () => withMaintenanceLease(async () => assert.fail('lease was bypassed'), { force: true })));
  assert.equal(contenders.filter(result => result.ran).length, 0);
  release(1);
  await first;
});
for (const fails of [false, true]) test(`real expired maintenance ${fails ? 'failure' : 'completion'} preserves replacement ownership`, { timeout: 60000 }, async () => {
  const { withMaintenanceLease, MAINTENANCE_LEASE_MS } = require('../lib/services/maintenanceLease');
  let clock = Date.now(), release;
  const first = withMaintenanceLease(() => new Promise((resolve, reject) => { release = () => fails ? reject(Error('old worker failed')) : resolve(1); }), { now: () => clock });
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  clock += MAINTENANCE_LEASE_MS;
  let releaseReplacement;
  const replacement = withMaintenanceLease(() => new Promise(resolve => { releaseReplacement = resolve; }), { now: () => clock });
  while (!releaseReplacement) await new Promise(resolve => setTimeout(resolve, 5));
  const claim = (await collection('system').doc('maintenance').get()).data();
  release();
  if (fails) await assert.rejects(first, /old worker failed/); else await first;
  assert.deepEqual((await collection('system').doc('maintenance').get()).data(), claim);
  releaseReplacement(2);
  await replacement;
  assert.equal((await collection('system').doc('maintenance').get()).data().lastRunAt, clock);
});
test('real legacy maintenance success timestamp and expired completion remain safe', { timeout: 60000 }, async () => {
  const { withMaintenanceLease, MAINTENANCE_LEASE_MS } = require('../lib/services/maintenanceLease');
  let clock = Date.now();
  const ref = collection('system').doc('maintenance');
  await ref.set({ lastRunAt: clock });
  assert.equal((await withMaintenanceLease(async () => assert.fail(), { now: () => clock })).ran, false);
  await withMaintenanceLease(async () => { clock += MAINTENANCE_LEASE_MS; }, { now: () => clock, force: true });
  assert.ok((await ref.get()).data().lastRunAt < clock);
  assert.equal((await ref.get()).data().leaseOwner, undefined);
});
