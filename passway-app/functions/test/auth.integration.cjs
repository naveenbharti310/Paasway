// Real local Auth + Firestore bridge; only the SMS provider is stubbed.
// Never run against production, accept credentials, or contact an SMS service.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
if (process.env.GCLOUD_PROJECT !== 'demo-passway' ||
 process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
 process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
 process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT ||
 process.env.VERCEL_ENV === 'production' || process.env.K_SERVICE) {
 throw Error('Strict local Auth/Firestore isolation required; no credentials accepted.');
}
process.env.METADATA_SERVER_DETECTION = 'none';
process.env.MODERATION_PROVIDER = 'rules'; process.env.ENFORCE_APP_CHECK = 'false';
process.env.TWOFACTOR_ENABLED = 'true'; process.env.TWOFACTOR_API_KEY = 'synthetic-emulator-only';
process.env.TWOFACTOR_DAILY_LIMIT = '5';
const { auth, db } = require('../lib/lib/firebase');
const { getApps } = require('firebase-admin/app');
const { handleTestOtp } = require('../lib/http/testOtp');
const { handleCallable } = require('../lib/http/server');
const { phoneHash } = require('../lib/lib/accounts');
const originalFetch = global.fetch;
const phone = '+919876540123';
let sends, verifications;
global.fetch = async (input, options) => {
 const url = new URL(typeof input === 'string' ? input : input.url);
 if (url.origin === 'https://2factor.in') {
  assert.equal(url.pathname.startsWith('/API/V1/synthetic-emulator-only/SMS/'), true);
  if (url.pathname.includes('/VERIFY/')) verifications++; else sends++;
  return new Response(JSON.stringify({ Status: 'Success', Details: url.pathname.includes('/VERIFY/') ? 'OTP Matched' : 'fake-provider-session' }));
 }
 assert.ok(['http://127.0.0.1:9099', 'http://127.0.0.1:8080'].includes(url.origin), 'No external HTTP requests allowed');
 return originalFetch(input, options);
};
beforeEach(async () => {
 sends = 0; verifications = 0;
 for (const url of ['http://127.0.0.1:9099/emulator/v1/projects/demo-passway/accounts', 'http://127.0.0.1:8080/emulator/v1/projects/demo-passway/databases/(default)/documents']) {
  const response = await fetch(url, { method: 'DELETE' }); assert.equal(response.ok, true);
 }
});
after(async () => { global.fetch = originalFetch; await db.terminate(); await Promise.all(getApps().map(app => app.delete())); });
const otp = (name, data) => handleTestOtp(new Request(`http://127.0.0.1/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }), name);
async function completeOtp() {
 const sent = await otp('otpSend', { phone }); assert.equal(sent.status, 200);
 const { challengeId } = (await sent.json()).result;
 const verified = await otp('otpVerify', { challengeId, code: '123456' }); assert.equal(verified.status, 200);
 const token = (await verified.json()).result.token;
 const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator-only', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }) });
 assert.equal(response.status, 200); const result = await response.json();
 return { ...result, challengeId };
}
const callAge = idToken => handleCallable(new Request('http://127.0.0.1/api/confirmAge', { method: 'POST', headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ data: { birthDate: '1990-01-01' } }) }), 'confirmAge');
test('actual 2Factor-handler custom-token exchange preserves verified phone claim and binds age policy', async () => {
 const result = await completeOtp(); const token = await auth.verifyIdToken(result.idToken, true);
 assert.equal(token.phone_number, phone); assert.equal(token.firebase.sign_in_provider, 'custom');
 const uid = token.uid; assert.equal((await auth.getUserByPhoneNumber(phone)).uid, uid);
 await db.collection('users').doc(uid).set({ userId: uid, status: 'active', createdAt: Date.now() });
 const response = await callAge(result.idToken); assert.equal(response.status, 200);
 assert.equal((await db.collection('users').doc(uid).get()).data().phoneHash, phoneHash(phone));
 assert.equal(sends, 1); assert.equal(verifications, 1);
 const replay = await otp('otpVerify', { challengeId: result.challengeId, code: '123456' });
 assert.equal(replay.status, 400); assert.equal(verifications, 1);
});
test('existing phone identity is reused through real Auth custom sign-in, not duplicated', async () => {
 const user = await auth.createUser({ uid: 'existing-phone-user', phoneNumber: phone });
 const result = await completeOtp(); const token = await auth.verifyIdToken(result.idToken, true);
 assert.equal(token.uid, user.uid); assert.equal(token.phone_number, phone);
 assert.equal((await auth.listUsers()).users.length, 1);
});
test('actual disabled Auth account cannot obtain an OTP custom token', async () => {
 await auth.createUser({ phoneNumber: phone, disabled: true });
 const sent = await otp('otpSend', { phone }); assert.equal(sent.status, 200);
 const verified = await otp('otpVerify', { challengeId: (await sent.json()).result.challengeId, code: '123456' });
 assert.equal(verified.status, 403); assert.equal((await verified.json()).result, undefined);
});
test('actual disabled Auth identity cannot reuse an already-issued token at candidate HTTP boundary', async () => {
 const result = await completeOtp(); const token = await auth.verifyIdToken(result.idToken, true);
 await db.collection('users').doc(token.uid).set({ userId: token.uid, status: 'active', createdAt: Date.now() });
 await auth.updateUser(token.uid, { disabled: true });
 const response = await callAge(result.idToken); assert.equal(response.status, 401);
 assert.equal((await response.json()).error.status, 'UNAUTHENTICATED');
 assert.equal((await db.collection('users').doc(token.uid).get()).data().ageConfirmedAt, undefined);
});
