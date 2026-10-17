// Full callable and HTTP handler regressions. All identities and holds are synthetic.
process.env.MODERATION_PROVIDER = 'rules';
process.env.ENFORCE_APP_CHECK = 'false';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./support.cjs');
const firebase = require('../lib/lib/firebase');
const { phoneHash, assertAccountActive } = require('../lib/lib/accounts');
const { runCallable } = require('../lib/lib/callable');
const { generateTid, redeemTid } = require('../lib/handlers/tids');
const { respondToRequest, endConnection } = require('../lib/handlers/connections');
const { sendMessage, getMessages } = require('../lib/handlers/messages');
const { deleteAccount } = require('../lib/handlers/accounts');
const { handleCallable } = require('../lib/http/server');
const { encodeGeohash } = require('../lib/geo');
const phone = '+15555550123', hash = phoneHash(phone), oldHash = phoneHash('+15555550124');
const actor = 'phone-policy-actor', peer = 'phone-policy-peer';
const flows = {
 generateTid: [generateTid, {lat:0,lng:0,displayName:'Policy Test'}],
 redeemTid: [redeemTid, {tid:'AB12',lat:0,lng:0,displayName:'Policy Test'}],
 respondToRequest: [respondToRequest, {requestId:'request1',accept:true}],
 sendMessage: [sendMessage, {connectionId:'chat1',content:'Synthetic policy test'}],
 getMessages: [getMessages, {connectionId:'chat1'}],
};
let db, oldVerify, oldFetch;
beforeEach(() => {
 db = new MemoryFirestore(); firebase.db = db;
 oldVerify = firebase.auth.verifyIdToken; oldFetch = global.fetch;
 firebase.auth.verifyIdToken = async (_token, revoked) => { assert.equal(revoked,true); return {uid:actor,phone_number:phone}; };
 global.fetch = async () => { throw Error('No outbound calls permitted in synthetic policy tests'); };
});
afterEach(() => { firebase.auth.verifyIdToken=oldVerify; global.fetch=oldFetch; });
function seed(binding='legacy', status, flow='generateTid') {
 db.seed(`users/${actor}`, {status:'active',ageConfirmedAt: 1, contentPolicyVersion: '2026-10-17.1', contentPolicyAcceptedAt: 1,...(binding==='legacy'?{}:{phoneHash:binding==='matching'?hash:oldHash})});
 db.seed(`users/${peer}`, {status:'active',ageConfirmedAt: 1, contentPolicyVersion: '2026-10-17.1', contentPolicyAcceptedAt: 1});
 if (status!==undefined) db.seed(`accountHolds/${hash}`,{status});
 const createdAt=Date.now(), expiresAt=createdAt+300000;
 if(flow==='redeemTid') db.seed('tids/AB12',{tid:'AB12',status:'active',generatorId:peer,generatorName:'Peer',geoHash:encodeGeohash(0,0),createdAt,expiresAt});
 if(flow==='respondToRequest') {
  db.seed('tids/AB12',{tid:'AB12',status:'pending',generatorId:actor,requestId:'request1',createdAt,expiresAt});
  db.seed('connectionRequests/request1',{requestId:'request1',tid:'AB12',tidCreatedAt:createdAt,status:'pending',generatorId:actor,generatorName:'Actor',requesterId:peer,requesterName:'Peer',expiresAt});
 }
 if(['sendMessage','getMessages','endConnection'].includes(flow)) db.seed('connections/chat1',{connectionId:'chat1',status:'active',userA:actor,userB:peer,createdAt});
}
function effects() { return JSON.stringify([...db.values].filter(([p])=>/^(tids|connectionRequests|connections)\//.test(p)).sort(([a],[b])=>a.localeCompare(b))); }
const invoke=(flow,...args)=>runCallable(flows[flow][0].handler,{uid:actor,token:{phone_number:args.length?args[0]:phone}},{...flows[flow][1],...(args[1]??{})});
for(const binding of ['legacy','stale','matching']) {
 for(const status of ['banned','under_minimum','unknown_policy']) {
  for(const flow of Object.keys(flows)) test(`${flow}: ${binding} profile cannot bypass current ${status} phone policy`,async()=>{
   seed(binding,status,flow); const before=effects();
   await assert.rejects(invoke(flow),{code:status==='under_minimum'?'failed-precondition':'permission-denied'});
   assert.equal(effects(),before);
  });
 }
 for(const status of [undefined,'reported']) {
  for(const flow of Object.keys(flows)) test(`${flow}: ${binding} profile permits eligible current ${status??'unrestricted'} phone`,async()=>{
   seed(binding,status,flow); await invoke(flow);
  });
 }
}
for(const phoneClaim of [undefined,'','invalid','+0123',123]) {
 for(const flow of Object.keys(flows)) test(`${flow}: missing or malformed verified phone fails closed (${String(phoneClaim)})`,async()=>{
  seed('legacy',undefined,flow);const before=effects();
  // Request payload fields must not replace the verified Firebase token claim.
  await assert.rejects(invoke(flow,phoneClaim,{phoneNumber:phone,phone_number:phone,phoneHash:hash}),{code:'permission-denied'});
  assert.equal(effects(),before);
 });
}
for(const status of ['banned','under_minimum','unknown_policy']) test(`stored ${status} policy cannot be erased by a different unrestricted current phone`,async()=>{
 seed('stale');db.seed(`accountHolds/${oldHash}`,{status});
 await assert.rejects(invoke('generateTid'),{code:status==='under_minimum'?'failed-precondition':'permission-denied'});
});
test('matching current and stored phone policies are read only once inside the participation transaction',async()=>{
 seed('matching');const reads=[];
 await db.runTransaction(tx=>assertAccountActive(actor,{...tx,get:async ref=>{reads.push(ref.path);return tx.get(ref);}},{phoneNumber:phone}));
 assert.equal(reads.filter(p=>p===`accountHolds/${hash}`).length,1);
 assert.deepEqual(reads,[`users/${actor}`,`accountHolds/${hash}`]);
});
test('current phone hold installed during the participation transaction is enforced',async()=>{
 seed('legacy');const original=db.runTransaction.bind(db);let calls=0;
 db.runTransaction=fn=>original(async tx=>fn({...tx,get:async ref=>{
  // Emulate the authoritative hold snapshot becoming visible during validation.
  if(ref.path===`accountHolds/${hash}`) {calls++;return {exists:true,data:()=>({status:'banned'})};}
  return tx.get(ref);
 }}));
 await assert.rejects(invoke('generateTid'),{code:'permission-denied'});assert.equal(calls,1);
});
test('HTTP verified token current phone restriction matches callable enforcement',async()=>{
 seed('legacy','banned');const before=effects();
 const response=await handleCallable(new Request('https://example.invalid/api/generateTid',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({data:flows.generateTid[1]})}),'generateTid');
 assert.equal(response.status,403);assert.equal((await response.json()).error.status,'PERMISSION_DENIED');assert.equal(effects(),before);
});
test('denied pairing acceptance replays recheck the current verified phone',async()=>{
 seed('legacy','banned','respondToRequest');db.seed('connectionRequests/request1',{...db.read('connectionRequests/request1'),status:'accepted',connectionId:'chat1'});
 db.seed('connections/chat1',{status:'active',userA:actor,userB:peer});await assert.rejects(invoke('respondToRequest'),{code:'permission-denied'});
});
test('a restricted phone can still end an existing connection',async()=>{
 seed('legacy','banned','endConnection');await runCallable(endConnection.handler,{uid:actor,token:{phone_number:phone}},{connectionId:'chat1'});
 assert.equal(db.read('connections/chat1').status,'ended');
});
test('a restricted phone can still request account deletion',async()=>{
 seed('matching','banned');const originalDelete=firebase.auth.deleteUser;firebase.auth.deleteUser=async uid=>assert.equal(uid,actor);
 try {await runCallable(deleteAccount.handler,{uid:actor,token:{phone_number:phone}},{});assert.equal(db.read(`users/${actor}`),undefined);}
 finally {firebase.auth.deleteUser=originalDelete;}
});
