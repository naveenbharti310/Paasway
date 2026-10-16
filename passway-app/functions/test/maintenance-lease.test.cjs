const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {MemoryFirestore}=require('./support.cjs');
const firebase=require('../lib/lib/firebase');
const {withMaintenanceLease,MAINTENANCE_LEASE_MS}=require('../lib/services/maintenanceLease');
let original,db,clock;
const run=(operation,force=false)=>withMaintenanceLease(operation,{now:()=>clock,force});
beforeEach(()=>{original=firebase.db;db=new MemoryFirestore();firebase.db=db;clock=1_000_000;});
afterEach(()=>{firebase.db=original;});
test('success stamps completion and throttles successful runs',async()=>{
 assert.deepEqual(await run(async()=>{clock+=10;return 7;}),{ran:true,result:7});
 assert.equal(db.read('system/maintenance').lastRunAt,clock);
 assert.equal((await run(async()=>assert.fail())).ran,false);
 clock+=16*60*1000;assert.equal((await run(async()=>8)).ran,true);
});
test('failure immediately retries without success timestamp',async()=>{
 await assert.rejects(run(async()=>{throw Error('outage');}),/outage/);
 assert.equal(db.read('system/maintenance').lastRunAt,undefined);
 assert.equal(db.read('system/maintenance').leaseOwner,undefined);
 assert.equal((await run(async()=>1)).ran,true);
});
test('concurrent forced run cannot bypass active lease',async()=>{
 let release;const pending=run(()=>new Promise(r=>{release=r;}));
 while(!release)await new Promise(r=>setImmediate(r));
 assert.equal((await run(async()=>assert.fail(),true)).ran,false);
 release(3);assert.equal((await pending).result,3);
});
test('abandoned leases expire and legacy timestamps still throttle',async()=>{
 db.seed('system/maintenance',{leaseOwner:'abandoned',leaseUntil:clock+100});
 assert.equal((await run(async()=>1)).ran,false);clock+=100;
 assert.equal((await run(async()=>1)).ran,true);
 db.seed('system/maintenance',{lastRunAt:clock});
 assert.equal((await run(async()=>1)).ran,false);
 assert.equal((await run(async()=>1,true)).ran,true);
});
for(const fails of [false,true])test(`stale worker ${fails?'failure':'completion'} preserves replacement`,async()=>{
 let release;const pending=run(()=>new Promise((resolve,reject)=>{release=()=>fails?reject(Error('old failure')):resolve(1);}));
 while(!release)await new Promise(r=>setImmediate(r));clock+=MAINTENANCE_LEASE_MS;
 const replacement={leaseOwner:'replacement',leaseUntil:clock+MAINTENANCE_LEASE_MS,lastRunAt:7};
 db.seed('system/maintenance',replacement);release();
 if(fails)await assert.rejects(pending,/old failure/);else await pending;
 assert.deepEqual(db.read('system/maintenance'),replacement);
});
test('expired completion cannot certify success',async()=>{
 await run(async()=>{clock+=MAINTENANCE_LEASE_MS;});
 assert.equal(db.read('system/maintenance').lastRunAt,undefined);
 assert.equal((await run(async()=>1)).ran,true);
});
