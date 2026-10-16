process.env.MODERATION_PROVIDER = 'rules';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./support.cjs');
const firebase = require('../lib/lib/firebase');
const { requestAccountDeletion, resumeAccountDeletion } = require('../lib/services/accountDeletion');
let db, oldAuth, deleted;
beforeEach(() => { db = new MemoryFirestore(); firebase.db = db; oldAuth = firebase.auth; deleted = []; firebase.auth = { deleteUser: async uid => { deleted.push(uid); } }; db.seed('users/alice', { status: 'active', ageConfirmedAt: 1 }); });
afterEach(() => { firebase.auth = oldAuth; });
function pending(id, role = 'generatorId', extra = {}, codeExtra = {}) {
 const generatorId = role === 'generatorId' ? 'alice' : 'bob';
 const requesterId = role === 'requesterId' ? 'alice' : 'bob';
 const tid = ('0000'+id).slice(-4).toUpperCase();
 db.seed(`connectionRequests/${id}`, { requestId: id, tid, tidCreatedAt: 100, generatorId, requesterId, status: 'pending', ...extra });
 db.seed(`tids/${tid}`, { tid, generatorId, status: 'pending', requestId: id, createdAt: 100, ...codeExtra });
 return tid;
}
for (const role of ['generatorId', 'requesterId']) {
 test(`deletion resolves ${role} pending request and its exact code before completing Auth deletion`, async () => {
  const tid = pending('r1', role); await requestAccountDeletion('alice');
  assert.deepEqual(await resumeAccountDeletion('alice'), { pending: false });
  assert.equal(db.read('connectionRequests/r1').status, 'declined'); assert.equal(db.read(`tids/${tid}`).status, 'expired');
  assert.equal(db.read('accountDeletions/alice').status, 'complete'); assert.deepEqual(deleted, ['alice']);
 });
}
for (const [label, mutation] of [['reallocated generation', { createdAt: 200 }], ['different request', { requestId: 'another-request' }], ['different generator', { generatorId: 'carol' }]]) {
 test(`deletion never modifies a pending code belonging to ${label}`, async () => {
  const tid = pending('r1', 'requesterId', {}, mutation); const before = db.read(`tids/${tid}`);
  await requestAccountDeletion('alice'); await resumeAccountDeletion('alice');
  assert.equal(db.read('connectionRequests/r1').status, 'declined'); assert.deepEqual(db.read(`tids/${tid}`), before);
 });
}
test('bounded pending-request pages keep the deletion job resumable until all requests resolve', async () => {
 for (let i = 0; i < 26; i++) pending('r'+String(i).padStart(3, '0'));
 await requestAccountDeletion('alice'); assert.deepEqual(await resumeAccountDeletion('alice'), { pending: true });
 assert.equal([...db.values].filter(([k,v])=>k.startsWith('connectionRequests/') && v.status==='declined').length, 25);
 assert.equal(deleted.length, 0); assert.equal(db.read('users/alice').status, 'deleting');
 assert.deepEqual(await resumeAccountDeletion('alice'), { pending: false });
 assert.equal([...db.values].filter(([k,v])=>k.startsWith('connectionRequests/') && v.status==='pending').length, 0);
 assert.deepEqual(deleted, ['alice']); assert.ok(db.pageWrites.every(n => n <= 500));
});
test('a request changing to accepted after selection is never overwritten by cancellation', async () => {
 const tid = pending('r1'); const originalCollection = db.collection.bind(db); let fired = false;
 function wrap(q) { const where = q.where.bind(q); q.where = (...args) => wrap(where(...args)); const limit = q.limit.bind(q); q.limit = (...args) => wrap(limit(...args)); const get = q.get.bind(q); q.get = async () => { const result = await get(); if (!fired && result.docs.some(d=>d.id==='r1')) { fired=true; db.seed('connectionRequests/r1',{...db.read('connectionRequests/r1'),status:'accepted',connectionId:'already-committed'}); db.seed(`tids/${tid}`,{...db.read(`tids/${tid}`),status:'connected'}); } return result; }; return q; }
 db.collection = name => name === 'connectionRequests' ? wrap(originalCollection(name)) : originalCollection(name);
 await requestAccountDeletion('alice'); await resumeAccountDeletion('alice');
 assert.equal(fired, true, 'exercise the actual pending-query/transaction boundary');
 assert.equal(db.read('connectionRequests/r1').status, 'accepted'); assert.equal(db.read(`tids/${tid}`).status, 'connected');
});
test('malformed legacy request references cannot wedge account deletion or expire unrelated codes', async () => {
 pending('r1', 'requesterId', { tid: '../not-a-code', tidCreatedAt: undefined });
 await requestAccountDeletion('alice'); assert.deepEqual(await resumeAccountDeletion('alice'), { pending: false });
 assert.equal(db.read('connectionRequests/r1').status, 'declined'); assert.deepEqual(deleted, ['alice']);
});
