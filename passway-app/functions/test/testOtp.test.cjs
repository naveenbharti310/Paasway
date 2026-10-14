const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./support.cjs');
const firebase = require('../lib/lib/firebase');
const { handleTestOtp } = require('../lib/http/testOtp');
let db, calls, tokens, created, users, now;
const originalFetch = global.fetch, originalNow = Date.now;
const req = (name, data, headers = {}) => handleTestOtp(new Request(`https://test/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) }), name);
const phone = '+919876543210';
beforeEach(() => {
  now = originalNow(); Date.now = () => now;
  process.env.ENFORCE_APP_CHECK = 'false';
  process.env.TWOFACTOR_ENABLED = 'true'; process.env.TWOFACTOR_DAILY_LIMIT = '50';
  process.env.TWOFACTOR_TEST_ENABLED = 'true'; process.env.TWOFACTOR_API_KEY = 'SECRET_TEST_ONLY';
  process.env.TWOFACTOR_TEMPLATE_NAME = 'PASSWAY_OTP_2';
  process.env.ALLOWED_ORIGINS = 'https://preview.test';
  db = new MemoryFirestore(); firebase.db = db; calls = []; tokens = []; created = []; users = new Map();
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ Status: 'Success', Details: url.includes('/VERIFY/') ? 'OTP Matched' : 'provider-session' })); };
  firebase.auth.getUserByPhoneNumber = async (p) => { if (!users.has(p)) throw Object.assign(new Error(), { code: 'auth/user-not-found' }); return users.get(p); };
  firebase.auth.createUser = async (data) => { created.push(data); const u = { uid: 'existing-or-new', disabled: false, ...data }; users.set(data.phoneNumber, u); return u; };
  firebase.auth.createCustomToken = async (uid) => { tokens.push(uid); return 'firebase-custom-token'; };
});
after(() => { global.fetch = originalFetch; Date.now = originalNow; });
async function send(p = phone, headers = {}) { const r = await req('testOtpSend', { phone: p }, headers); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); return (await r.json()).result.challengeId; }

test('disabled or missing key never contacts provider', async () => {
  process.env.TWOFACTOR_ENABLED = 'false'; process.env.TWOFACTOR_TEST_ENABLED = 'false'; assert.equal((await req('testOtpSend', { phone })).status, 404);
  process.env.TWOFACTOR_TEST_ENABLED = 'true'; delete process.env.TWOFACTOR_API_KEY;
  assert.equal((await req('testOtpSend', { phone })).status, 404); assert.equal(calls.length, 0);
});
test('only valid Indian mobile numbers and allowed browser origins', async () => {
  for (const p of ['+14155551234', '9876543210', '+915123456789', null]) assert.equal((await req('testOtpSend', { phone: p })).status, 400);
  assert.equal((await req('testOtpSend', { phone }, { origin: 'https://evil.test' })).status, 403);
  assert.equal(calls.length, 0);
});
test('send uses exact approved template and returns no provider details or secrets', async () => {
  const id = await send(); assert.match(id, /^[0-9a-f-]{36}$/);
  assert.ok(calls[0].url.endsWith('/SMS/%2B919876543210/AUTOGEN/PASSWAY_OTP_2'));
  assert.equal(calls[0].options.redirect, 'error'); assert.equal(tokens.length, 0);
  assert.equal(JSON.stringify({ id }).includes('provider-session'), false);
});
test('successful OTP creates phone identity, consumes session, and signs in once', async () => {
  const id = await send(); const r = await req('testOtpVerify', { challengeId: id, code: '123456', phone: '+919999999999' });
  assert.equal(r.status, 200); assert.equal((await r.json()).result.token, 'firebase-custom-token');
  assert.deepEqual(created, [{ phoneNumber: phone }]); assert.deepEqual(tokens, ['existing-or-new']);
  assert.equal((await req('testOtpVerify', { challengeId: id, code: '123456' })).status, 400);
  assert.equal(tokens.length, 1);
  const session = db.read(`rateLimits/testOtp_session_${id}`); assert.equal(session.phone, null); assert.equal(session.providerSession, null);
});
test('existing phone UID is preserved for later Firebase SMS login', async () => {
  users.set(phone, { uid: 'original-firebase-uid', disabled: false });
  const id = await send(); assert.equal((await req('testOtpVerify', { challengeId: id, code: '123456' })).status, 200);
  assert.deepEqual(tokens, ['original-firebase-uid']); assert.equal(created.length, 0);
});
test('wrong OTP cannot create Firebase accounts or tokens; limited to five tries', async () => {
  const id = await send(); global.fetch = async () => { calls.push('verify'); return new Response(JSON.stringify({ Status: 'Error', Details: 'OTP Mismatch' })); };
  for (let n = 0; n < 5; n++) assert.equal((await req('testOtpVerify', { challengeId: id, code: '000000' })).status, 400);
  assert.equal((await req('testOtpVerify', { challengeId: id, code: '000000' })).status, 429);
  assert.equal(calls.length, 6); assert.equal(tokens.length, 0); assert.equal(created.length, 0);
});
test('expired, unknown, or replaced challenges are not verified', async () => {
  const id = await send(); now += 60001; await send();
  assert.equal((await req('testOtpVerify', { challengeId: id, code: '123456' })).status, 400);
  const id2 = await send('+919876543211'); now += 300001;
  assert.equal((await req('testOtpVerify', { challengeId: id2, code: '123456' })).status, 400);
  assert.equal((await req('testOtpVerify', { challengeId: '00000000-0000-0000-0000-000000000000', code: '123456' })).status, 400);
  assert.equal(calls.length, 3); assert.equal(tokens.length, 0);
});
test('60 second cooldown, five per phone daily, twenty per IP hourly', async () => {
  await send(); assert.equal((await req('testOtpSend', { phone })).status, 429);
  for (let n = 1; n < 5; n++) { now += 60001; await send(); }
  now += 60001; assert.equal((await req('testOtpSend', { phone })).status, 429);
  for (let n = 0; n < 15; n++) await send(`+91900000${String(n).padStart(4, '0')}`);
  assert.equal((await req('testOtpSend', { phone: '+919111112222' })).status, 429); assert.equal(calls.length, 20);
});
test('global 50 daily SMS budget works across phones and IPs', async () => {
  for (let n = 0; n < 50; n++) await send(`+91900000${String(n).padStart(4, '0')}`, { 'x-forwarded-for': `192.0.2.${n}` });
  assert.equal((await req('testOtpSend', { phone: '+919111112222' }, { 'x-forwarded-for': '192.0.2.200' })).status, 429); assert.equal(calls.length, 50);
});
test('concurrent sends and successful verifications do not bypass single use', async () => {
  const sends = await Promise.all([req('testOtpSend', { phone }), req('testOtpSend', { phone })]);
  assert.deepEqual(sends.map((r) => r.status).sort(), [200, 429]);
  const id = (await sends.find((r) => r.status === 200).json()).result.challengeId;
  const responses = await Promise.all([req('testOtpVerify', { challengeId: id, code: '123456' }), req('testOtpVerify', { challengeId: id, code: '123456' })]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]); assert.equal(tokens.length, 1);
});
test('provider errors do not leak keys and do not fall back to Firebase SMS', async () => {
  global.fetch = async () => { throw new Error('URL with SECRET_TEST_ONLY and OTP'); };
  const r = await req('testOtpSend', { phone }); assert.equal(r.status, 503); assert.equal((await r.text()).includes('SECRET_TEST_ONLY'), false);
  assert.equal(tokens.length, 0); assert.equal((await req('testOtpSend', { phone })).status, 429);
});
test('disabled Firebase users cannot receive custom tokens', async () => {
  users.set(phone, { uid: 'disabled-user', disabled: true }); const id = await send();
  assert.equal((await req('testOtpVerify', { challengeId: id, code: '123456' })).status, 403); assert.equal(tokens.length, 0);
});

test('release routes use explicit enable switch; legacy-only switch cannot enable release routes', async () => {
  assert.equal((await req('otpSend', { phone })).status, 200);
  process.env.TWOFACTOR_ENABLED = 'false';
  assert.equal((await req('otpSend', { phone: '+919876543211' })).status, 404);
  assert.equal((await req('otpVerify', {})).status, 404);
  assert.equal((await req('unknown', {})).status, 404);
});
test('daily budget is configurable and invalid safety settings fail closed', async () => {
  process.env.TWOFACTOR_DAILY_LIMIT = '2';
  await send(); await send('+919876543211');
  assert.equal((await req('otpSend', { phone: '+919876543212' })).status, 429);
  for (const invalid of ['0', '-1', 'unlimited', '5001', '1.5']) {
    process.env.TWOFACTOR_DAILY_LIMIT = invalid;
    assert.equal((await req('otpSend', { phone: '+919876543213' })).status, 400);
  }
  assert.equal(calls.length, 2);
});

test('OTP routes enforce App Check when enabled on the server', async () => {
  process.env.ENFORCE_APP_CHECK = 'true';
  assert.equal((await req('otpSend', { phone })).status, 401);
  assert.equal(calls.length, 0);
  process.env.ENFORCE_APP_CHECK = 'false';
});
