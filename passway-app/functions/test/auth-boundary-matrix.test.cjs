// Transport boundary regressions: actual HTTP handlers, no network/SMS/real credentials.
process.env.MODERATION_PROVIDER = 'rules';
process.env.ENFORCE_APP_CHECK = 'false';
process.env.TWOFACTOR_ENABLED = 'true';
process.env.TWOFACTOR_TEST_ENABLED = 'true';
process.env.TWOFACTOR_API_KEY = 'synthetic-test-only';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./support.cjs');
const firebase = require('../lib/lib/firebase');
const { getAppCheck } = require('firebase-admin/app-check');
const { handleCallable, callableNames } = require('../lib/http/server');
const { handleTestOtp } = require('../lib/http/testOtp');
const otpNames = ['otpSend', 'otpVerify', 'testOtpSend', 'testOtpVerify'];
let saved, appCheck, oldVerify, oldAuth, oldFetch, stats;
beforeEach(() => {
 saved = { VERCEL_ENV: process.env.VERCEL_ENV, K_SERVICE: process.env.K_SERVICE, FUNCTIONS_EMULATOR: process.env.FUNCTIONS_EMULATOR };
 process.env.VERCEL_ENV = 'production';
 firebase.db = new MemoryFirestore(); stats = { auth: 0, appCheck: 0, body: 0, network: 0 };
 appCheck = getAppCheck(); oldVerify = appCheck.verifyToken; oldAuth = firebase.auth.verifyIdToken; oldFetch = global.fetch;
 appCheck.verifyToken = async token => { stats.appCheck++; if (token !== 'accepted-test-attestation') throw Error('private-attestation-exception'); return { appId: 'test-app' }; };
 firebase.auth.verifyIdToken = async (_token, checkRevoked) => { stats.auth++; assert.equal(checkRevoked, true); throw Object.assign(Error('private-auth-exception'), { code: 'auth/id-token-revoked' }); };
 global.fetch = async () => { stats.network++; throw Error('Unexpected outbound request'); };
});
afterEach(() => {
 appCheck.verifyToken = oldVerify; firebase.auth.verifyIdToken = oldAuth; global.fetch = oldFetch;
 for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
function request(name, token) {
 const headers = { authorization: 'Bearer synthetic-revoked-token', 'content-type': 'application/json' };
 if (token !== undefined) headers['x-firebase-appcheck'] = token;
 const r = new Request(`https://example.invalid/api/${name}`, { method: 'POST', headers, body: JSON.stringify({ data: {} }) });
 // A real handler must reject before even obtaining the request-body reader.
 const body = r.body;
 Object.defineProperty(r, 'body', { get() { stats.body++; return body; } });
 return r;
}
for (const name of [...callableNames, ...otpNames]) {
 for (const token of [undefined, 'invalid-test-attestation']) {
  test(`production ${name}: ${token === undefined ? 'missing' : 'invalid'} App Check fails closed before Auth, body and provider`, async () => {
   const r = request(name, token);
   const response = await (otpNames.includes(name) ? handleTestOtp(r, name) : handleCallable(r, name));
   assert.equal(response.status, 401);
   const text = await response.text(), body = JSON.parse(text);
   assert.equal(body.error.status, 'UNAUTHENTICATED');
   assert.equal(body.error.message, 'This app could not be verified.');
   assert.doesNotMatch(text, /private-|synthetic-revoked-token|synthetic-test-only/);
   assert.equal(response.headers.get('cache-control'), 'no-store');
   assert.equal(stats.auth, 0); assert.equal(stats.body, 0); assert.equal(stats.network, 0);
   assert.equal(stats.appCheck, token === undefined ? 0 : 1);
   assert.equal(firebase.db.values.size, 0);
  });
 }
}
for (const name of callableNames) {
 test(`${name}: valid App Check never overrides a revoked Firebase identity`, async () => {
  const response = await handleCallable(request(name, 'accepted-test-attestation'), name);
  assert.equal(response.status, 401); const text = await response.text();
  assert.equal(JSON.parse(text).error.status, 'UNAUTHENTICATED');
  assert.doesNotMatch(text, /private-|synthetic-revoked-token/);
  assert.equal(stats.auth, 1); assert.equal(stats.appCheck, 1); assert.equal(stats.body, 0); assert.equal(stats.network, 0);
  assert.equal(firebase.db.values.size, 0);
 });
}
test('Cloud Run production cannot inherit an emulator/staging App Check bypass', async () => {
 delete process.env.VERCEL_ENV; process.env.K_SERVICE = 'passway-test-service'; delete process.env.FUNCTIONS_EMULATOR;
 const response = await handleCallable(request('getMessages'), 'getMessages');
 assert.equal(response.status, 401); assert.equal(stats.auth, 0); assert.equal(stats.body, 0);
});
