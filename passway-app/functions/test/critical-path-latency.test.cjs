process.env.MODERATION_PROVIDER = 'rules';
const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {MemoryFirestore}=require('./support.cjs');
const firebase=require('../lib/lib/firebase');
const push=require('../lib/push');
const {sendMessage,getMessages}=require('../lib/handlers/messages');
const tick=()=>new Promise(r=>setImmediate(r));
const originalNotify=push.notifyUser;
let db;
beforeEach(()=>{db=new MemoryFirestore();firebase.db=db;push.notifyUser=async()=>{};
 for(const uid of ['alice','bob']) db.seed('users/'+uid,{status:'active',ageConfirmedAt:1,contentPolicyVersion:'2026-10-17.1',contentPolicyAcceptedAt:1});
 db.seed('connections/chat',{connectionId:'chat',userA:'alice',userB:'bob',status:'active',createdAt:Date.now()});
});
afterEach(()=>{push.notifyUser=originalNotify;});
for(const [name,handler,data] of [['send',sendMessage,{connectionId:'chat',content:'synthetic performance fixture',clientMessageId:'parallel-message-key-0001'}],['read',getMessages,{connectionId:'chat'}]]) {
 for(const [heldPath,independentPath] of [['users/alice','connections/chat'],['users/bob','blocks/alice:bob']]) {
  test(name+' starts independent '+independentPath+' read while '+heldPath+' is pending',async()=>{
   const base=db.runTransaction.bind(db);const reads=[];let release;const held=new Promise(r=>release=r);
   db.runTransaction=cb=>base(tx=>cb({...tx,get:async ref=>{reads.push(ref.path);if(ref.path===heldPath)await held;return tx.get(ref);}}));
   let completed=false;const work=handler.handler('alice',data,{phoneNumber:'+919876543210'}).then(()=>{completed=true;});
   try {await tick();await tick();assert.ok(reads.includes(heldPath));assert.ok(reads.includes(independentPath),'independent IO must not be serialized');assert.equal(completed,false,'no success before authorization completes');assert.equal([...db.values.keys()].filter(k=>k.includes('/messages/')).length,0);}
   finally {release();await work;}
  });
 }
 test(name+' fails closed when a parallel account check fails',async()=>{
  db.seed('users/bob',{status:'banned',ageConfirmedAt:1});
  await assert.rejects(handler.handler('alice',data,{phoneNumber:'+919876543210'}),e=>e.code==='permission-denied');
  assert.equal([...db.values.keys()].filter(k=>k.includes('/messages/')).length,0);
 });
}

const {redeemTid}=require('../lib/handlers/tids');
const {respondToRequest}=require('../lib/handlers/connections');
const {encodeGeohash}=require('../lib/geo');
for(const [name,handler,uid,data,heldPath,independentPath] of [
 ['redeem',redeemTid,'bob',{tid:'AB12',displayName:'Bob',lat:28.6,lng:77.2,redemptionId:'parallel-redemption-key-001'},'users/bob','tids/AB12'],
 ['accept',respondToRequest,'alice',{requestId:'pending',accept:true},'users/alice','users/bob'],
 ['accept',respondToRequest,'alice',{requestId:'pending',accept:true},'users/bob','blocks/alice:bob'],
]) test(name+' starts independent '+independentPath+' while '+heldPath+' is pending',async()=>{
 const now=Date.now();
 db.seed('tids/AB12',{tid:'AB12',generatorId:'alice',generatorName:'Alice',status:name==='redeem'?'active':'pending',geoHash:encodeGeohash(28.6,77.2),createdAt:now,expiresAt:now+300000,requestId:'pending'});
 db.seed('connectionRequests/pending',{requestId:'pending',tid:'AB12',tidCreatedAt:now,expiresAt:now+300000,generatorId:'alice',generatorName:'Alice',requesterId:'bob',requesterName:'Bob',status:'pending'});
 const base=db.runTransaction.bind(db),reads=[];let release;const held=new Promise(r=>release=r);
 db.runTransaction=cb=>base(tx=>cb({...tx,get:async ref=>{reads.push(ref.path);if(ref.path===heldPath)await held;return tx.get(ref);}}));
 let completed=false;const work=handler.handler(uid,data,{phoneNumber:'+919876543210'}).then(()=>{completed=true;});
 try {await tick();await tick();assert.ok(reads.includes(heldPath));assert.ok(reads.includes(independentPath),'independent pairing checks must overlap');assert.equal(completed,false);assert.equal(db.read('connectionRequests/pending').status,'pending');assert.equal(db.read('tids/AB12').status,name==='redeem'?'active':'pending');}
 finally {release();await work;}
});

test('accept cannot commit a code that expires during account or block IO',async()=>{
 const realNow=Date.now;let clock=1900000000000;Date.now=()=>clock;
 try{
  db.seed('tids/AB12',{tid:'AB12',generatorId:'alice',status:'pending',createdAt:clock,expiresAt:clock+100,requestId:'pending'});
  db.seed('connectionRequests/pending',{requestId:'pending',tid:'AB12',tidCreatedAt:clock,expiresAt:clock+100,generatorId:'alice',requesterId:'bob',status:'pending'});
  const base=db.runTransaction.bind(db);
  db.runTransaction=cb=>base(tx=>cb({...tx,get:async ref=>{const snap=await tx.get(ref);if(ref.path==='users/bob')clock+=101;return snap;}}));
  await assert.rejects(respondToRequest.handler('alice',{requestId:'pending',accept:true},{phoneNumber:'+919876543210'}),e=>e.code==='failed-precondition');
  assert.equal(db.read('connectionRequests/pending').status,'pending');assert.equal(db.read('tids/AB12').status,'pending');
  assert.equal([...db.values.keys()].filter(k=>k.startsWith('connections/')).length,1);
 }finally{Date.now=realNow;}
});
