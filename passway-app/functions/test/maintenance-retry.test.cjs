process.env.MODERATION_PROVIDER='rules';
const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {MemoryFirestore}=require('./support.cjs');
const firebase=require('../lib/lib/firebase');
const {maybeRunMaintenance}=require('../lib/services/cleanup');
let original,db,attempts;
beforeEach(()=>{original=firebase.db;db=new MemoryFirestore();firebase.db=db;attempts=0;db.collectionGroup=()=>{attempts++;throw new Error('synthetic infrastructure outage');};});
afterEach(()=>{firebase.db=original;});
test('failed maintenance does not suppress the next eligible retry for fifteen minutes',async()=>{
 const now=Date.now();
 await assert.rejects(maybeRunMaintenance(now),/synthetic infrastructure outage/);
 await assert.rejects(maybeRunMaintenance(now+1),/synthetic infrastructure outage/);
 assert.equal(attempts,2);
 assert.equal(db.read('system/maintenance')?.lastRunAt,undefined,'no successful sweep was completed');
});
