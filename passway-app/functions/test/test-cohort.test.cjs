const {test} = require('node:test');
const assert = require('node:assert/strict');
const {assertSameTestCohort} = require('../lib/lib/accounts');
test('automated profiles are isolated from normal profiles in either direction', () => {
  assert.throws(() => assertSameTestCohort({automatedTest:true}, {}), {code:'not-found'});
  assert.throws(() => assertSameTestCohort({}, {automatedTest:true}), {code:'not-found'});
  assert.doesNotThrow(() => assertSameTestCohort({}, {}));
  assert.doesNotThrow(() => assertSameTestCohort({automatedTest:true}, {automatedTest:true}));
});
