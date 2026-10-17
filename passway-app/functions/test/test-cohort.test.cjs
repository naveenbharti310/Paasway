const {test} = require('node:test');
const assert = require('node:assert/strict');
const {assertSameTestCohort} = require('../lib/lib/accounts');
test('automated profiles are isolated from normal profiles in either direction', () => {
  assert.throws(() => assertSameTestCohort({automatedTest:true}, {}), {code:'not-found'});
  assert.throws(() => assertSameTestCohort({}, {automatedTest:true}), {code:'not-found'});
  assert.doesNotThrow(() => assertSameTestCohort({}, {}));
  assert.doesNotThrow(() => assertSameTestCohort({automatedTest:true}, {automatedTest:true}));
});

const {phoneHash}=require('../lib/lib/accounts');
for(const phone of ['+919999900001','+919999900002'])test('reserved reviewer identity stays isolated after profile recreation: '+phone.slice(-1),()=>{
 const recreated={userId:'a-new-firebase-uid',status:'active',ageConfirmedAt:1,phoneHash:phoneHash(phone)};
 assert.throws(()=>assertSameTestCohort(recreated,{status:'active'}),{code:'not-found'});
 assert.throws(()=>assertSameTestCohort({status:'active'},recreated),{code:'not-found'});
 assert.throws(()=>assertSameTestCohort({...recreated,automatedTest:false},{}),{code:'not-found'});
 assert.doesNotThrow(()=>assertSameTestCohort(recreated,{automatedTest:true}));
});
test('both recreated reviewer identities can pair without a UID-bound flag',()=>{
 assert.doesNotThrow(()=>assertSameTestCohort({phoneHash:phoneHash('+919999900001')},{phoneHash:phoneHash('+919999900002')}));
});
test('ordinary verified phone bindings retain their existing cohort behavior',()=>{
 const normal={phoneHash:phoneHash('+919876543210')};
 assert.doesNotThrow(()=>assertSameTestCohort(normal,{}));
 assert.throws(()=>assertSameTestCohort(normal,{automatedTest:true}),{code:'not-found'});
});
