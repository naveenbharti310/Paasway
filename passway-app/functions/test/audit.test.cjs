process.env.MODERATION_PROVIDER = 'rules';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./support.cjs');
const firebase = require('../lib/lib/firebase');
const codeGenerator = require('../lib/lib/tid');
const originalRandomTid = codeGenerator.randomTid;
const { generateTid, redeemTid, deactivateTid } = require('../lib/handlers/tids');
const { respondToRequest, endConnection } = require('../lib/handlers/connections');
const { sendMessage, getMessages } = require('../lib/handlers/messages');
const { fileReport, blockUser } = require('../lib/handlers/reports');
const { closeIdleConnections } = require('../lib/services/connections');
const validation = require('../lib/lib/validation');
const { retentionDate } = require('../lib/lib/retention');
const { withinRateLimit } = require('../lib/lib/rateLimits');
const { encodeGeohash } = require('../lib/geo');
const { screenMessage, mentionsContactInfo } = require('../lib/moderation');
const { sendPushNotification } = require('../lib/push');
const originalFetch = global.fetch;
let db;
const uid = 'alice', other = 'bob';
const call = (handler, data, user = uid) => handler.run({ auth: user ? { uid: user } : undefined, data });
function connection(status = 'active', extras = {}) {
  db.seed('connections/chat1', { connectionId: 'chat1', userA: uid, userB: other, userAName: 'Alice', userBName: 'Bob', status, createdAt: Date.now(), ...extras });
}
function code(status = 'active', extras = {}) {
  db.seed('tids/AB12', { tid: 'AB12', generatorId: uid, generatorName: 'Alice', geoHash: encodeGeohash(28.6, 77.2), status, createdAt: Date.now(), expiresAt: Date.now() + 300000, ...extras });
}
function pending(extras = {}) {
  const createdAt = Date.now();
  code('pending', { requestId: 'req1', createdAt });
  db.seed('connectionRequests/req1', { requestId: 'req1', tid: 'AB12', tidCreatedAt: createdAt, expiresAt: Date.now() + 300000, status: 'pending', generatorId: uid, generatorName: 'Alice', requesterId: other, requesterName: 'Bob', ...extras });
}
beforeEach(() => {
  db = new MemoryFirestore().seed('users/alice', { status: 'active', ageConfirmedAt: 1 }).seed('users/bob', { status: 'active', ageConfirmedAt: 1 });
  firebase.db = db;
});
afterEach(() => { codeGenerator.randomTid = originalRandomTid; global.fetch = originalFetch; });

for (const value of [null, undefined, [], 'bad', 12]) {
  test(`reject invalid request payload ${JSON.stringify(value)}`, () => assert.throws(() => validation.payload(value), { code: 'invalid-argument' }));
}
for (const value of ['', '.', '..', 'one/two', ' id ', 'x'.repeat(129)]) {
  test(`reject unsafe document id ${value.slice(0, 12)}`, () => assert.throws(() => validation.documentId(value, 'Id'), { code: 'invalid-argument' }));
}
for (const [lat, lng] of [[NaN, 1], [Infinity, 1], [91, 1], [1, -181], ['1', 1]]) {
  test(`reject invalid location ${lat},${lng}`, () => assert.throws(() => validation.coordinates(lat, lng), { code: 'invalid-argument' }));
}
test('normalise code and name', () => { assert.equal(validation.tidCode(' ab12 '), 'AB12'); assert.equal(validation.text(' Alice ', 'Name', 30), 'Alice'); });
test('reject invalid code characters', () => assert.throws(() => validation.tidCode('A/B1'), { code: 'invalid-argument' }));
test('reject oversized and blank messages', () => { assert.throws(() => validation.text(' ', 'Message', 2000)); assert.throws(() => validation.text('x'.repeat(2001), 'Message', 2000)); });
test('require two distinct participants', () => assert.throws(() => validation.otherParticipant({ userA: uid, userB: uid }, uid)));
test('generate cryptographically random four character codes', () => { for (let i = 0; i < 100; i++) assert.match(originalRandomTid(), /^[A-Z0-9]{4}$/); });
test('preserve a longer retention hold', () => assert.equal(retentionDate(new Date(9000), new Date(1000)).getTime(), 9000));
test('read Firestore timestamp retention values', () => assert.equal(retentionDate({ toMillis: () => 9000 }, new Date(1000)).getTime(), 9000));

for (const handler of [generateTid, redeemTid, deactivateTid, respondToRequest, endConnection, sendMessage, getMessages, fileReport, blockUser]) {
  test(`authentication required for ${handler.name || 'callable'}`, async () => assert.rejects(call(handler, {}, null), { code: 'unauthenticated' }));
}
test('allocate a code without overwriting an existing pending code', async () => {
  code('pending'); let attempt = 0; codeGenerator.randomTid = () => ++attempt === 1 ? 'AB12' : 'CD34';
  const result = await call(generateTid, { lat: 28.6, lng: 77.2, displayName: 'Alice' });
  assert.equal(result.tid, 'CD34'); assert.equal(db.read('tids/AB12').status, 'pending');
});
test('reject code generation by a banned account', async () => {
  db.seed('users/alice', { status: 'banned' });
  await assert.rejects(call(generateTid, { lat: 28.6, lng: 77.2, displayName: 'Alice' }), { code: 'permission-denied' });
});
test('reject redemption of your own code', async () => { code(); await assert.rejects(call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Alice' }), { code: 'invalid-argument' }); });
test('reject a remote redemption with the inactive code message', async () => { code(); await assert.rejects(call(redeemTid, { tid: 'AB12', lat: 0, lng: 0, displayName: 'Bob' }, other), { code: 'not-found' }); });
test('reject an expired code', async () => { code('active', { expiresAt: Date.now() }); await assert.rejects(call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, other), { code: 'not-found' }); });
test('claim a code only once and return request expiry', async () => {
  code(); const first = await call(redeemTid, { tid: 'ab12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, other);
  assert.equal(typeof first.expiresAt, 'number'); assert.equal(db.read(`connectionRequests/${first.requestId}`).tidCreatedAt, db.read('tids/AB12').createdAt);
  await assert.rejects(call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, other), { code: 'not-found' });
});
test('do not cancel a claimed code', async () => { code('pending'); await assert.rejects(call(deactivateTid, { tid: 'AB12' }), { code: 'failed-precondition' }); });
test('reject a nonboolean request decision', async () => { pending(); await assert.rejects(call(respondToRequest, { requestId: 'req1', accept: 'yes' }), { code: 'invalid-argument' }); });
test('reject an expired request', async () => { pending({ expiresAt: Date.now() - 1 }); await assert.rejects(call(respondToRequest, { requestId: 'req1', accept: true }), { code: 'failed-precondition' }); });
test('reject a request for a different code generation', async () => { pending({ tidCreatedAt: 1 }); await assert.rejects(call(respondToRequest, { requestId: 'req1', accept: true }), { code: 'failed-precondition' }); });
test('accept a request and create one connection', async () => { pending(); const result = await call(respondToRequest, { requestId: 'req1', accept: true }); assert.equal(db.read(`connections/${result.connectionId}`).userB, other); assert.equal(db.read('tids/AB12').status, 'connected'); });
test('decline without creating a connection', async () => { pending(); await call(respondToRequest, { requestId: 'req1', accept: false }); assert.equal(db.read('connectionRequests/req1').status, 'declined'); assert.equal([...db.values.keys()].filter((key) => key.startsWith('connections/')).length, 0); });
test('reject acceptance when either account is banned', async () => { pending(); db.seed('users/bob', { status: 'banned' }); await assert.rejects(call(respondToRequest, { requestId: 'req1', accept: true }), { code: 'permission-denied' }); });
test('send a bounded message to an active connection', async () => { connection(); const result = await call(sendMessage, { connectionId: 'chat1', content: ' Hello ' }); assert.equal(result.flag, 'none'); assert.equal([...db.values.values()].find((value) => value.messageId)?.content, 'Hello'); });
test('recheck connection status after the initial message read', async () => {
  connection(); db.afterRead = (path) => { if (path === 'connections/chat1') db.seed(path, { ...db.read(path), status: 'ended' }); };
  await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Hello' }), { code: 'failed-precondition' });
  assert.equal([...db.values.values()].filter((value) => value.messageId).length, 0);
});
test('reject messages from banned accounts', async () => { connection(); db.seed('users/alice', { status: 'banned' }); await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Hello' }), { code: 'permission-denied' }); });
test('reject reporting an unrelated account', async () => { connection(); await assert.rejects(call(fileReport, { connectionId: 'chat1', reportedId: 'charlie', reason: 'Spam' }), { code: 'invalid-argument' }); });
test('reject reporting yourself', async () => { connection(); await assert.rejects(call(fileReport, { connectionId: 'chat1', reportedId: uid, reason: 'Spam' }), { code: 'invalid-argument' }); });
test('report, close and flag atomically without downgrading a ban', async () => { connection(); db.seed('users/bob', { status: 'banned' }); const result = await call(fileReport, { connectionId: 'chat1', reportedId: other, reason: 'Spam' }); assert.ok(db.read(`reports/${result.reportId}`)); assert.equal(db.read('connections/chat1').status, 'ended'); assert.equal(db.read('users/bob').status, 'banned'); });
test('retry a report without duplicates or extending the hold', async () => { connection(); const data = { connectionId: 'chat1', reportedId: other, reason: 'Spam' }; const first = await call(fileReport, data); const hold = db.read('connections/chat1').deleteAt; const second = await call(fileReport, data); assert.equal(first.reportId, second.reportId); assert.deepEqual(db.read('connections/chat1').deleteAt, hold); });
test('end a reported conversation without shortening its retention', async () => { connection(); await call(fileReport, { connectionId: 'chat1', reportedId: other, reason: 'Spam' }); const hold = db.read('connections/chat1').deleteAt; await call(endConnection, { connectionId: 'chat1' }); assert.deepEqual(db.read('connections/chat1').deleteAt, hold); });
test('repeat end without moving the deletion date', async () => { connection(); await call(endConnection, { connectionId: 'chat1' }); const first = db.read('connections/chat1'); await call(endConnection, { connectionId: 'chat1' }); assert.deepEqual(db.read('connections/chat1'), first); });
test('retain more than 500 messages using bounded transactions', async () => { connection(); for (let i = 0; i < 601; i++) db.seed(`connections/chat1/messages/m${String(i).padStart(4, '0')}`, { content: 'hello' }); await call(endConnection, { connectionId: 'chat1' }); assert.ok(db.read('connections/chat1/messages/m0600').deleteAt instanceof Date); assert.ok(db.pageWrites.every((writes) => writes <= 200)); });
test('allow only the configured number of rate limited requests', async () => { assert.equal(await withinRateLimit(uid, 'test', 2), true); assert.equal(await withinRateLimit(uid, 'test', 2), true); assert.equal(await withinRateLimit(uid, 'test', 2), false); });
test('ignore old and malformed rate limit events', async () => { db.seed('rateLimits/alice_test', { events: [Date.now() - 3600001, 'bad', null] }); assert.equal(await withinRateLimit(uid, 'test', 1), true); assert.equal(db.read('rateLimits/alice_test').events.length, 1); });
test('detect early contact sharing without claiming real moderation', async () => { assert.deepEqual(await screenMessage('Use WhatsApp', 10), { flag: 'none', earlyContactShare: true }); assert.equal((await screenMessage('Use WhatsApp', 181)).earlyContactShare, false); });
test('notification failures do not reject the connection flow', async () => { global.fetch = async () => { throw new Error('offline'); }; await sendPushNotification('ExpoPushToken[example]', 'Passway', 'Hello'); });

test('retention repair ignores a deleted connection', async () => {
  const { applyMessageRetention } = require('../lib/lib/retention');
  await applyMessageRetention(db.collection('connections').doc('missing'));
});
test('background retention repair uses the latest report hold', async () => {
  const { syncConnectionRetention } = require('../lib/handlers/retention');
  const hold = new Date(Date.now() + 30 * 86400000);
  connection('ended', { deleteAt: hold });
  db.seed('connections/chat1/messages/m1', { content: 'Hello' });
  await syncConnectionRetention.run({ data: { before: { data: () => ({ status: 'active' }) }, after: { data: () => ({ status: 'ended', deleteAt: new Date(Date.now() + 72 * 3600000) }), ref: db.collection('connections').doc('chat1') } } });
  assert.deepEqual(db.read('connections/chat1/messages/m1').deleteAt, hold);
});
test('background retention repair ignores unrelated active updates', async () => {
  const { syncConnectionRetention } = require('../lib/handlers/retention');
  connection();
  db.seed('connections/chat1/messages/m1', { content: 'Hello' });
  await syncConnectionRetention.run({ data: { before: { data: () => ({ status: 'active' }) }, after: { data: () => ({ status: 'active' }), ref: db.collection('connections').doc('chat1') } } });
  assert.equal(db.read('connections/chat1/messages/m1').deleteAt, undefined);
});

const redeemAsBob = () => call(redeemTid, { tid: 'AB12', lat: 28.6, lng: 77.2, displayName: 'Bob' }, other);
test('return the code creation time with a generated code', async () => {
  const result = await call(generateTid, { lat: 28.6, lng: 77.2, displayName: 'Alice' });
  assert.equal(result.expiresAt - result.createdAt, 300000);
  assert.equal(db.read(`tids/${result.tid}`).createdAt, result.createdAt);
});
test('a report blocks the reported person from redeeming future codes', async () => {
  connection();
  await call(fileReport, { connectionId: 'chat1', reportedId: other, reason: 'Spam' });
  assert.equal(db.read('blocks/alice:bob').blockedId, other);
  code();
  await assert.rejects(redeemAsBob(), { code: 'not-found' });
  assert.equal(db.read('tids/AB12').status, 'active');
});
test('a block applies in both directions', async () => {
  connection();
  await call(blockUser, { connectionId: 'chat1' }, other);
  assert.equal(db.read('connections/chat1').status, 'ended');
  assert.equal(db.read('connections/chat1').blockedBy, other);
  code();
  await assert.rejects(redeemAsBob(), { code: 'not-found' });
});
test('only a participant can block through a connection', async () => {
  connection();
  await assert.rejects(call(blockUser, { connectionId: 'chat1' }, 'charlie'), { code: 'permission-denied' });
  assert.equal(db.read('blocks/charlie:alice'), undefined);
});
test('blocking keeps an existing report hold', async () => {
  connection();
  await call(fileReport, { connectionId: 'chat1', reportedId: other, reason: 'Spam' });
  const held = db.read('connections/chat1').deleteAt.getTime();
  await call(blockUser, { connectionId: 'chat1' });
  assert.equal(db.read('connections/chat1').deleteAt.getTime(), held);
});
test('messages expire on their own and record connection activity', async () => {
  connection('active', { lastActivityAt: 1 });
  const before = Date.now();
  await call(sendMessage, { connectionId: 'chat1', content: 'Hi' });
  const [message] = [...db.values.entries()].filter(([path]) => path.startsWith('connections/chat1/messages/')).map(([, value]) => value);
  assert.ok(message.deleteAt.getTime() >= message.sentAt + 72 * 3600000);
  assert.ok(db.read('connections/chat1').lastActivityAt >= before);
});
test('a message notifies the other participant without its content', async () => {
  connection();
  db.seed('users/bob', { status: 'active', ageConfirmedAt: 1, pushToken: 'ExponentPushToken[bob]' });
  const sent = [];
  global.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ data: { status: 'ok' } }) }; };
  await call(sendMessage, { connectionId: 'chat1', content: 'Secret plan' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ExponentPushToken[bob]');
  assert.equal(JSON.stringify(sent[0]).includes('Secret plan'), false);
});
test('close connections idle beyond the retention window', async () => {
  const now = Date.now();
  connection('active', { lastActivityAt: now - 73 * 3600000 });
  db.seed('connections/chat2', { connectionId: 'chat2', userA: uid, userB: other, status: 'active', createdAt: now, lastActivityAt: now });
  db.seed('connections/chat1/messages/m1', { content: 'old', sentAt: now - 73 * 3600000 });
  assert.equal(await closeIdleConnections(now), 1);
  const closed = db.read('connections/chat1');
  assert.equal(closed.status, 'ended');
  assert.equal(closed.endedBy, 'system');
  assert.equal(closed.endReason, 'idle');
  assert.ok(db.read('connections/chat1/messages/m1').deleteAt instanceof Date);
  assert.equal(db.read('connections/chat2').status, 'active');
});
for (const sample of ['call me on +91 98765 43210', 'mail me at a.b@example.com', 'add me on insta', 'my snap is @night_owl', 'wa.me/123', 'find me on Telegram']) {
  test(`detect contact details in "${sample}"`, () => assert.equal(mentionsContactInfo(sample), true));
}
for (const sample of ['see you at 5', 'the cafe was lovely', 'meet @ 6 near gate 2', 'I have 2 dogs']) {
  test(`ignore ordinary text "${sample}"`, () => assert.equal(mentionsContactInfo(sample), false));
}

const { confirmAge, deleteAccount } = require('../lib/handlers/accounts');
const accounts = require('../lib/lib/accounts');
const moderation = require('../lib/moderation');
const callWithPhone = (handler, data, user, phone = '+919876543210') => handler.run({ auth: { uid: user, token: { phone_number: phone } }, data });
const adultBirth = '1990-05-01';
const childBirth = `${new Date().getUTCFullYear() - 15}-01-01`;

test('calculate age around a birthday', () => {
  assert.equal(accounts.ageOn('2000-06-15', new Date(Date.UTC(2018, 5, 14))), 17);
  assert.equal(accounts.ageOn('2000-06-15', new Date(Date.UTC(2018, 5, 15))), 18);
});
for (const value of ['1990-02-30', '1990/01/01', '', 12, '3000-01-01', '1800-01-01']) {
  test(`reject invalid birth date ${JSON.stringify(value)}`, () => assert.throws(() => accounts.validBirthDate(value, new Date()), { code: 'invalid-argument' }));
}
test('an account must confirm its age before generating a code', async () => {
  db.seed('users/alice', { status: 'active' });
  await assert.rejects(call(generateTid, { lat: 28.6, lng: 77.2, displayName: 'Alice' }), { code: 'failed-precondition' });
});
test('an adult confirmation is stored without the birth date', async () => {
  db.seed('users/carol', { status: 'active' });
  assert.deepEqual(await callWithPhone(confirmAge, { birthDate: adultBirth }, 'carol'), { confirmed: true });
  const carol = db.read('users/carol');
  assert.equal(typeof carol.ageConfirmedAt, 'number');
  assert.equal(carol.phoneHash, accounts.phoneHash('+919876543210'));
  assert.equal(JSON.stringify(carol).includes('1990'), false);
});
test('an under age answer cannot be changed by answering again', async () => {
  db.seed('users/carol', { status: 'active' });
  assert.deepEqual(await callWithPhone(confirmAge, { birthDate: childBirth }, 'carol'), { confirmed: false });
  await assert.rejects(callWithPhone(confirmAge, { birthDate: adultBirth }, 'carol'), { code: 'failed-precondition' });
  assert.equal(db.read(`accountHolds/${accounts.phoneHash('+919876543210')}`).status, 'under_minimum');
});
test('a new account on the same phone keeps an under age hold', async () => {
  db.seed('users/carol', { status: 'active' });
  await callWithPhone(confirmAge, { birthDate: childBirth }, 'carol');
  db.seed('users/carol2', { status: 'active' });
  assert.deepEqual(await callWithPhone(confirmAge, { birthDate: adultBirth }, 'carol2'), { confirmed: false });
});
test('a new account on a banned phone is banned', async () => {
  db.seed(`accountHolds/${accounts.phoneHash('+919876543210')}`, { status: 'banned' });
  db.seed('users/carol', { status: 'active' });
  await callWithPhone(confirmAge, { birthDate: adultBirth }, 'carol');
  assert.equal(db.read('users/carol').status, 'banned');
});
test('a ban hold on the phone stops an account even if its status was not copied', async () => {
  db.seed('accountHolds/h1', { status: 'banned' });
  db.seed('users/alice', { status: 'active', ageConfirmedAt: 1, phoneHash: 'h1' });
  await assert.rejects(call(generateTid, { lat: 28.6, lng: 77.2, displayName: 'Alice' }), { code: 'permission-denied' });
});

function fakeAuth() { const deleted = []; firebase.auth = { deleteUser: async (id) => { deleted.push(id); } }; return deleted; }
test('delete an account, end its chats and deactivate its codes', async () => {
  const deleted = fakeAuth();
  connection();
  code();
  db.seed('rateLimits/alice_generate', { events: [] });
  await callWithPhone(deleteAccount, {}, uid);
  assert.equal(db.read('users/alice'), undefined);
  assert.equal(db.read('rateLimits/alice_generate'), undefined);
  assert.equal(db.read('connections/chat1').status, 'ended');
  assert.equal(db.read('connections/chat1').endReason, 'account_deleted');
  assert.equal(db.read('tids/AB12').status, 'deactivated');
  assert.deepEqual(deleted, [uid]);
});
test('deleting a reported account leaves a review hold on the phone', async () => {
  fakeAuth();
  db.seed('users/alice', { status: 'reported', ageConfirmedAt: 1 });
  await callWithPhone(deleteAccount, {}, uid);
  assert.equal(db.read(`accountHolds/${accounts.phoneHash('+919876543210')}`).status, 'reported');
});
test('deleting an account never lowers a ban hold', async () => {
  fakeAuth();
  const hash = accounts.phoneHash('+919876543210');
  db.seed(`accountHolds/${hash}`, { status: 'banned' });
  db.seed('users/alice', { status: 'reported', ageConfirmedAt: 1, phoneHash: hash });
  await callWithPhone(deleteAccount, {}, uid);
  assert.equal(db.read(`accountHolds/${hash}`).status, 'banned');
});
test('deleting an account in good standing leaves no hold', async () => {
  fakeAuth();
  await callWithPhone(deleteAccount, {}, uid);
  assert.equal([...db.values.keys()].some((path) => path.startsWith('accountHolds/')), false);
});
test('repeat deletion succeeds after the sign in record is gone', async () => {
  firebase.auth = { deleteUser: async () => { const error = new Error('gone'); error.code = 'auth/user-not-found'; throw error; } };
  await call(deleteAccount, {});
  assert.equal(db.read('users/alice'), undefined);
});

for (const sample of ['Please share the OTP you just got', 'Send 5000 rupees to my UPI urgently', 'Buy me google play cards and send the numbers', 'Guaranteed returns on this crypto trading platform https://x.example', 'Install AnyDesk so I can help you']) {
  test(`flag a scam message "${sample}"`, async () => assert.equal((await screenMessage(sample, 9999)).flag, 'scam_suspected'));
}
for (const sample of ['Can you send the photo from the park?', 'Lunch was 300 rupees, not bad', 'I work in investment banking', 'Running late, see you in 10']) {
  test(`allow an ordinary message "${sample}"`, async () => assert.equal((await screenMessage(sample, 9999)).flag, 'none'));
}
test('the classifier flags harassment', async () => {
  const original = { ...moderation.moderationDeps };
  moderation.moderationDeps.provider = () => 'google';
  moderation.moderationDeps.classify = async () => [{ name: 'Insult', confidence: 0.93 }];
  try { assert.equal((await screenMessage('you are awful', 9999)).flag, 'harassment_suspected'); } finally { Object.assign(moderation.moderationDeps, original); }
});
test('a classifier failure falls back to the rules', async () => {
  const original = { ...moderation.moderationDeps };
  moderation.moderationDeps.provider = () => 'google';
  moderation.moderationDeps.classify = async () => { throw new Error('down'); };
  try {
    assert.equal((await screenMessage('Hello there', 9999)).flag, 'none');
    assert.equal((await screenMessage('Share your OTP and send money to my bank account', 9999)).flag, 'scam_suspected');
  } finally { Object.assign(moderation.moderationDeps, original); }
});
test('three flagged messages put the sender under review', async () => {
  connection();
  for (let i = 0; i < 3; i++) await call(sendMessage, { connectionId: 'chat1', content: 'Share the OTP and send money to my UPI' });
  const alice = db.read('users/alice');
  assert.equal(alice.flagCount, 3);
  assert.equal(alice.status, 'reported');
  const flags = [...db.values.entries()].filter(([path]) => path.startsWith('connections/chat1/messages/')).map(([, m]) => m.moderationFlag);
  assert.deepEqual(flags, ['scam_suspected', 'scam_suspected', 'scam_suspected']);
});
test('a flagged message does not lower a ban', async () => {
  connection();
  db.seed('users/alice', { status: 'reported', ageConfirmedAt: 1, flagCount: 5 });
  await call(sendMessage, { connectionId: 'chat1', content: 'Share the OTP and send money to my UPI' });
  assert.equal(db.read('users/alice').status, 'reported');
});

test('rules catch common scam and abuse messages and leave normal ones alone', async () => {
  const { screenMessage } = require('../lib/moderation');
  const scams = [
    'Send me the OTP you received',
    'Please transfer 5000 rupees to my UPI, urgent',
    'Buy me a gift card and send the code',
    'Invest in crypto with me, guaranteed double returns',
    'Join my trading platform, 10% daily profit assured',
    'Bhai jaldi 2000 rupaye bhej do, emergency hai',
    'OTP batao jo abhi aaya',
    'Woh code batao jo SMS mein aaya',
    'Install AnyDesk so I can help you',
  ];
  const abuse = ['fuck you', 'you are a bitch', 'chutiya hai tu', 'send nudes', 'madarchod'];
  const normal = [
    'Hi, nice to meet you', 'Want to grab coffee tomorrow at 5?', 'I loved that bookshop',
    'Kal milte hain', 'My flight is at 6, see you after', 'I paid for the tickets already, no worries',
    'The cafe had a 10% discount', 'I work in banking', 'Assignment ka code kal bhejunga', 'class kab hai?',
  ];
  for (const text of scams) assert.equal((await screenMessage(text, 9999)).flag, 'scam_suspected', text);
  for (const text of abuse) assert.equal((await screenMessage(text, 9999)).flag, 'harassment_suspected', text);
  for (const text of normal) assert.equal((await screenMessage(text, 9999)).flag, 'none', text);
});

test('a reply stores only the ID of the earlier message', async () => {
  connection();
  db.seed('connections/chat1/messages/m1', { messageId: 'm1', senderId: other, content: 'Coffee at 5?', sentAt: Date.now() });
  await call(sendMessage, { connectionId: 'chat1', content: 'Yes!', replyTo: 'm1' });
  const reply = [...db.values.values()].find((value) => value.content === 'Yes!');
  assert.equal(reply.replyTo, 'm1');
  assert.equal(JSON.stringify(reply).includes('Coffee'), false);
});

test('a reply to a missing or badly named message is refused', async () => {
  connection();
  await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Yes', replyTo: 'gone' }), { code: 'failed-precondition' });
  await assert.rejects(call(sendMessage, { connectionId: 'chat1', content: 'Yes', replyTo: '../x' }), { code: 'invalid-argument' });
});

test('ending a chat removes both private notes about it', async () => {
  connection();
  db.seed('users/alice/notes/chat1', { note: 'Bob from the gym', updatedAt: 1 });
  db.seed('users/bob/notes/chat1', { note: 'Alice at the cafe', updatedAt: 1 });
  await call(endConnection, { connectionId: 'chat1' });
  assert.equal(db.read('users/alice/notes/chat1'), undefined);
  assert.equal(db.read('users/bob/notes/chat1'), undefined);
});

test('message retry key stores one message and one moderation increment', async () => {
  connection();const data={connectionId:'chat1',content:'share your OTP',clientMessageId:'retry-key-00000001'};
  const a=await call(sendMessage,data),b=await call(sendMessage,data);
  assert.deepEqual(a,b);assert.equal([...db.values.values()].filter(v=>v.messageId).length,1);assert.equal(db.read('users/alice').flagCount,1);
});
test('concurrent same-key message sends commit only once', async () => {
  connection();const data={connectionId:'chat1',content:'Hello',clientMessageId:'retry-key-00000002'};
  await Promise.all([call(sendMessage,data),call(sendMessage,data)]);
  assert.equal([...db.values.values()].filter(v=>v.messageId).length,1);
});
test('message retry keys cannot silently overwrite changed content', async () => {
  connection();const data={connectionId:'chat1',content:'Hello',clientMessageId:'retry-key-00000003'};
  await call(sendMessage,data);await assert.rejects(call(sendMessage,{...data,content:'Changed'}),{code:'failed-precondition'});
});
test('identical retry keys from different senders do not collide',async()=>{
  connection();const data={connectionId:'chat1',content:'Hello',clientMessageId:'retry-key-00000004'};
  await call(sendMessage,data,'alice');await call(sendMessage,data,'bob');assert.equal([...db.values.values()].filter(v=>v.messageId).length,2);
});
test('invalid message retry keys fail before writes',async()=>{
  connection();for(const key of ['short','x/y'.repeat(8),12])await assert.rejects(call(sendMessage,{connectionId:'chat1',content:'Hello',clientMessageId:key}),{code:'invalid-argument'});
  assert.equal([...db.values.values()].filter(v=>v.messageId).length,0);
});
test('replaying a delivered message does not send another push',async()=>{
  connection();db.seed('users/bob',{status:'active',ageConfirmedAt:1,pushToken:'ExpoPushToken[test-only]'});let sends=0;global.fetch=async()=>{sends++;return new Response('{"data":{"status":"ok"}}')};
  const data={connectionId:'chat1',content:'Hello',clientMessageId:'retry-key-00000005'};await call(sendMessage,data);await call(sendMessage,data);assert.equal(sends,1);
});
