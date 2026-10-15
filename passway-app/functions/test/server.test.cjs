process.env.MODERATION_PROVIDER = 'rules';
process.env.ENFORCE_APP_CHECK = 'false';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./support.cjs');
const firebase = require('../lib/lib/firebase');
const { handleCallable, callableNames } = require('../lib/http/server');

let db;
beforeEach(() => {
  db = new MemoryFirestore();
  firebase.db = db;
  firebase.auth.verifyIdToken = async (token) => {
    if (token !== 'good') throw Object.assign(new Error('bad token'), {code:'auth/invalid-id-token'});
    return { uid: 'alice', phone_number: '+919876543210' };
  };
});

const post = (name, body, headers = { authorization: 'Bearer good' }) => handleCallable(new Request(`https://example.test/api/${name}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
}), name);

test('every callable is served and background jobs are not', () => {
  for (const name of ['generateTid', 'redeemTid', 'deactivateTid', 'respondToRequest', 'endConnection', 'sendMessage', 'getMessages', 'fileReport', 'blockUser', 'confirmAge', 'deleteAccount']) {
    assert.ok(callableNames.includes(name), name);
  }
  assert.equal(callableNames.includes('closeIdleConnectionsJob'), false);
  assert.equal(callableNames.includes('syncConnectionRetention'), false);
});

test('unknown names return not found', async () => {
  const response = await post('nothing', { data: {} });
  assert.equal(response.status, 404);
});

test('a missing or invalid sign in token is rejected', async () => {
  let response = await post('confirmAge', { data: { birthDate: '2000-01-01' } }, {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.status, 'UNAUTHENTICATED');
  response = await post('confirmAge', { data: { birthDate: '2000-01-01' } }, { authorization: 'Bearer wrong' });
  assert.equal(response.status, 401);
});

test('a valid call returns the handler result in the callable format', async () => {
  db.seed('users/alice', { userId: 'alice', status: 'active', createdAt: Date.now() });
  const response = await post('confirmAge', { data: { birthDate: '1995-06-15' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok('result' in body);
  assert.equal(typeof db.read('users/alice').ageConfirmedAt, 'number');
});

test('handler errors keep their code and message', async () => {
  const response = await post('sendMessage', { data: { connectionId: 'missing', content: 'hi' } });
  const body = await response.json();
  assert.equal(response.status >= 400, true);
  assert.equal(typeof body.error.message, 'string');
  assert.notEqual(body.error.status, 'INTERNAL');
});

test('malformed bodies are rejected as invalid', async () => {
  const response = await handleCallable(new Request('https://example.test/api/confirmAge', { method: 'POST', headers: { authorization: 'Bearer good' }, body: 'not json' }), 'confirmAge');
  assert.equal(response.status, 400);
});

test('App Check is required unless turned off', async () => {
  process.env.ENFORCE_APP_CHECK = 'true';
  try {
    const response = await post('confirmAge', { data: { birthDate: '1995-06-15' } });
    assert.equal(response.status, 401);
  } finally {
    process.env.ENFORCE_APP_CHECK = 'false';
  }
});

test('only listed web origins may call from a browser', async () => {
  const { preflight, withCors } = require('../lib/http/server');
  process.env.ALLOWED_ORIGINS = 'https://preview.example';
  const ask = (origin) => new Request('https://example.test/api/confirmAge', { method: 'OPTIONS', headers: { origin } });
  assert.equal(preflight(ask('https://preview.example')).status, 204);
  assert.equal(preflight(ask('https://preview.example')).headers.get('access-control-allow-origin'), 'https://preview.example');
  assert.equal(preflight(ask('https://other.example')).status, 403);
  const allowed = withCors(ask('https://preview.example'), new Response('{}'));
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://preview.example');
  const denied = withCors(ask('https://other.example'), new Response('{}'));
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  delete process.env.ALLOWED_ORIGINS;
});

test('API responses containing private data are never cacheable', async () => {
  const response = await post('sendMessage', { data: { connectionId: 'missing', content: 'hi' } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});
test('API verifies token revocation and disabled-user status', async () => {
  let checkRevoked;
  firebase.auth.verifyIdToken = async (_token, revoked) => { checkRevoked = revoked; return {uid:'alice'}; };
  await post('sendMessage', { data: { connectionId: 'missing', content: 'hi' } });
  assert.equal(checkRevoked, true);
});
test('unlisted browser origins are rejected before a mutation runs', async () => {
  process.env.ALLOWED_ORIGINS = 'https://preview.example';
  try {
    db.seed('users/alice', {userId:'alice',status:'active',createdAt:Date.now()});
    const r = await post('confirmAge', {data:{birthDate:'1995-06-15'}}, {authorization:'Bearer good',origin:'https://evil.example'});
    assert.equal(r.status,403);assert.equal(db.read('users/alice').ageConfirmedAt,undefined);
  } finally { delete process.env.ALLOWED_ORIGINS; }
});
test('oversized callable bodies are rejected before business logic', async () => {
  const r = await post('confirmAge', { data: { birthDate: '1995-06-15', unused:'x'.repeat(17000) } });
  assert.equal(r.status,400);assert.match((await r.json()).error.message,/too large/i);
});
test('requests without credentials are rejected before consuming a body', async () => {
  let read = false;
  const request = new Request('https://example.test/api/confirmAge',{method:'POST',body:'{}'});
  request.json=async()=>{read=true;throw Error('must not read');};
  request.text=async()=>{read=true;throw Error('must not read');};
  assert.equal((await handleCallable(request,'confirmAge')).status,401);assert.equal(read,false);
});


test('revoked and disabled sessions fail closed without reaching business logic',async()=>{
 for(const code of ['auth/id-token-revoked','auth/user-disabled','auth/id-token-expired']){
  firebase.auth.verifyIdToken=async()=>{throw Object.assign(Error('private auth detail'),{code})};
  const r=await post('confirmAge',{data:{birthDate:'1995-06-15'}});assert.equal(r.status,401);assert.doesNotMatch(await r.text(),/private auth detail/);
 }
});
test('Auth outages fail closed as unavailable rather than demanding another SMS login',async()=>{
 firebase.auth.verifyIdToken=async()=>{throw Object.assign(Error('sensitive upstream detail'),{code:'auth/internal-error'})};
 const r=await post('confirmAge',{data:{birthDate:'1995-06-15'}});assert.equal(r.status,503);assert.equal((await r.json()).error.status,'UNAVAILABLE');assert.equal(db.values.size,0);
});
test('production cannot inherit the staging App Check bypass',async()=>{const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';try{const response=await post('getMessages',{data:{connectionId:'chat1'}});assert.equal(response.status,401);}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}});
