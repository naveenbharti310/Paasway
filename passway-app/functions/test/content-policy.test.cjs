// Synthetic accounts only. Consent is deliberately absent unless explicitly accepted.
process.env.MODERATION_PROVIDER = 'rules';
const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {MemoryFirestore}=require('./support.cjs');
const firebase=require('../lib/lib/firebase');
const {acceptContentPolicy}=require('../lib/handlers/contentPolicy');
const {generateTid,redeemTid}=require('../lib/handlers/tids');
const {sendMessage,getMessages}=require('../lib/handlers/messages');
const {endConnection,respondToRequest}=require('../lib/handlers/connections');
const {encodeGeohash}=require('../lib/geo');
const {CONTENT_POLICY_VERSION:version,hasContentPolicyConsent}=require('../lib/lib/contentPolicy');
const {runCallable}=require('../lib/lib/callable');
const originalFetch=global.fetch;
const auth={uid:'alice',token:{phone_number:'+15555550123'}};
const call=(fn,data={})=>runCallable(fn.handler,auth,data);
let db;
beforeEach(()=>{db=new MemoryFirestore();firebase.db=db;db.seed('users/alice',{status:'active',ageConfirmedAt:1});db.seed('users/bob',{status:'active',ageConfirmedAt:1});db.seed('connections/chat1',{connectionId:'chat1',status:'active',userA:'alice',userB:'bob',createdAt:Date.now()});global.fetch=async()=>{throw Error('Unexpected external request before consent');};});
afterEach(()=>{global.fetch=originalFetch;});
const flows=[[generateTid,{lat:0,lng:0,displayName:'Alice'}],[redeemTid,{tid:'AB12',lat:0,lng:0,displayName:'Alice'}],[sendMessage,{connectionId:'chat1',content:'Synthetic text',clientMessageId:'consent-message-intent-0001'}]];
for(const profile of [{},{contentPolicyVersion:'old',contentPolicyAcceptedAt:1},{contentPolicyVersion:version,contentPolicyAcceptedAt:0},{contentPolicyVersion:version,contentPolicyAcceptedAt:Infinity},{contentPolicyVersion:version,contentPolicyAcceptedAt:'1'}])test(`unaccepted policy prevents content creation ${JSON.stringify(profile)}`,async()=>{
 db.seed('users/alice',{status:'active',ageConfirmedAt:1,...profile});for(const [fn,data]of flows)await assert.rejects(call(fn,data),{code:'failed-precondition'});
 assert.equal([...db.values.keys()].filter(p=>/^tids\/|^connectionRequests\/|\/messages\//.test(p)).length,0);
});
for(const data of [{},{version,accept:false},{version,accept:'true'},{version:'old',accept:true}])test(`consent rejects nonaffirmative or stale request ${JSON.stringify(data)}`,async()=>{await assert.rejects(call(acceptContentPolicy,data),{code:'invalid-argument'});assert.equal(hasContentPolicyConsent(db.read('users/alice')),false);});
test('acceptance is server timestamped and idempotent, never trusts supplied metadata',async()=>{
 const result=await call(acceptContentPolicy,{version,accept:true,contentPolicyAcceptedAt:1});assert.deepEqual(result,{accepted:true,version});
 const saved=db.read('users/alice');assert.ok(saved.contentPolicyAcceptedAt>1);assert.equal(hasContentPolicyConsent(saved),true);
 await call(acceptContentPolicy,{version,accept:true});assert.equal(db.read('users/alice').contentPolicyAcceptedAt,saved.contentPolicyAcceptedAt);
 await call(generateTid,{lat:0,lng:0,displayName:'Alice'});
});
for(const status of ['banned','deleting','unknown'])test(`consent cannot rehabilitate ${status} account`,async()=>{db.seed('users/alice',{status,ageConfirmedAt:1});await assert.rejects(call(acceptContentPolicy,{version,accept:true}));assert.equal(hasContentPolicyConsent(db.read('users/alice')),false);});
test('age confirmation cannot be replaced by accepting rules',async()=>{db.seed('users/alice',{status:'active'});await assert.rejects(call(acceptContentPolicy,{version,accept:true}),{code:'failed-precondition'});});
test('authentication and a verified phone remain required',async()=>{assert.throws(()=>runCallable(acceptContentPolicy.handler,undefined,{version,accept:true}),{code:'unauthenticated'});await assert.rejects(runCallable(acceptContentPolicy.handler,{uid:'alice',token:{}},{version,accept:true}),{code:'permission-denied'});});
test('existing content reads and ending a chat do not force agreement',async()=>{await call(getMessages,{connectionId:'chat1'});await call(endConnection,{connectionId:'chat1'});assert.equal(hasContentPolicyConsent(db.read('users/alice')),false);});
test('commit rechecks consent if policy changes during moderation',async()=>{
 const moderation=require('../lib/moderation'),original=moderation.screenMessage;
 await call(acceptContentPolicy,{version,accept:true});
 moderation.screenMessage=async()=>{db.seed('users/alice',{...db.read('users/alice'),contentPolicyVersion:'stale'});return {flag:'none',earlyContactShare:false};};
 try {await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'Synthetic text',clientMessageId:'consent-recheck-intent-0001'}),{code:'failed-precondition'});assert.equal([...db.values.keys()].filter(p=>/\/messages\//.test(p)).length,0);}finally{moderation.screenMessage=original;}
});
function accepted(uid) {
 db.seed(`users/${uid}`,{status:'active',ageConfirmedAt:1,contentPolicyVersion:version,contentPolicyAcceptedAt:1});
}
function pending() {
 const createdAt=Date.now(),expiresAt=createdAt+300000;
 db.seed('tids/AB12',{tid:'AB12',generatorId:'alice',generatorName:'Alice',geoHash:encodeGeohash(0,0),status:'pending',requestId:'request1',createdAt,expiresAt});
 db.seed('connectionRequests/request1',{requestId:'request1',tid:'AB12',tidCreatedAt:createdAt,generatorId:'alice',generatorName:'Alice',requesterId:'bob',requesterName:'Bob',status:'pending',expiresAt});
}
for(const uid of ['alice','bob'])for(const stale of [false,true])test(`pairing commit rechecks ${uid} ${stale?'stale':'missing'} consent after redemption`,async()=>{
 accepted('alice');accepted('bob');pending();
 db.seed(`users/${uid}`,{status:'active',ageConfirmedAt:1,...(stale?{contentPolicyVersion:'old',contentPolicyAcceptedAt:1}:{})});
 await assert.rejects(call(respondToRequest,{requestId:'request1',accept:true}),{code:'failed-precondition'});
 assert.equal(db.read('connectionRequests/request1').status,'pending');assert.equal(db.read('tids/AB12').status,'pending');
 assert.equal([...db.values.keys()].filter(p=>p.startsWith('connections/')).length,1);
});
for(const uid of ['alice','bob'])test(`accepted-decision recovery rejects stale ${uid} consent without changing connection`,async()=>{
 accepted('alice');accepted('bob');pending();
 db.seed('connectionRequests/request1',{...db.read('connectionRequests/request1'),status:'accepted',connectionId:'chat1'});
 db.seed(`users/${uid}`,{...db.read(`users/${uid}`),contentPolicyVersion:'old'});
 await assert.rejects(call(respondToRequest,{requestId:'request1',accept:true}),{code:'failed-precondition'});
 assert.equal(db.read('connections/chat1').status,'active');
});
test('missing consent never blocks declining a pending request',async()=>{
 pending();await call(respondToRequest,{requestId:'request1',accept:false});
 assert.equal(db.read('connectionRequests/request1').status,'declined');
});
test('redemption rechecks the generators consent, not just the requester',async()=>{
 accepted('bob');pending();db.seed('tids/AB12',{...db.read('tids/AB12'),status:'active'});
 await assert.rejects(runCallable(redeemTid.handler,{uid:'bob',token:{phone_number:'+15555550124'}},{tid:'AB12',lat:0,lng:0,displayName:'Bob'}),{code:'failed-precondition'});
 assert.equal(db.read('tids/AB12').status,'active');
});
for(const restriction of ['banned','deleting','under_minimum','block-alice','block-bob'])test(`ineligible recipient ${restriction} is rejected before external moderation`,async()=>{
 accepted('alice');accepted('bob');
 if(restriction==='under_minimum')db.seed('users/bob',{...db.read('users/bob'),ageCheck:'under_minimum'});
 else if(restriction.startsWith('block-')) {
  const blocker=restriction.slice(6),blocked=blocker==='alice'?'bob':'alice';
  db.seed(`blocks/${blocker}:${blocked}`,{blockerId:blocker,blockedId:blocked});
 }else db.seed('users/bob',{...db.read('users/bob'),status:restriction});
 const moderation=require('../lib/moderation'),original=moderation.screenMessage;let calls=0;
 moderation.screenMessage=async()=>{calls++;return {flag:'none',earlyContactShare:false};};
 try{
  await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'Do not transmit unauthorized content',clientMessageId:'preflight-recipient-intent-0001'}));
  assert.equal(calls,0,'A denied recipient or person-level block must be checked before a provider sees text');
  assert.equal([...db.values.keys()].filter(p=>p.includes('/messages/')).length,0);
 }finally{moderation.screenMessage=original;}
});
for(const change of ['block','ban'])test(`message commit rechecks a recipient ${change} added during moderation`,async()=>{
 accepted('alice');accepted('bob');
 const moderation=require('../lib/moderation'),original=moderation.screenMessage;let calls=0;
 moderation.screenMessage=async()=>{
  calls++;
  if(change==='block')db.seed('blocks/bob:alice',{blockerId:'bob',blockedId:'alice'});
  else db.seed('users/bob',{...db.read('users/bob'),status:'banned'});
  return {flag:'none',earlyContactShare:false};
 };
 try{
  await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'Authorization changed during moderation',clientMessageId:'commit-recipient-intent-0001'}));
  assert.equal(calls,1);assert.equal([...db.values.keys()].filter(p=>p.includes('/messages/')).length,0);
 }finally{moderation.screenMessage=original;}
});
