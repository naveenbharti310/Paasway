const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runChecks, validateTarget } = require('../scripts/check-deployed-app-check.cjs');

const denied = () => Response.json({
  error: { status: 'UNAUTHENTICATED', message: 'This app could not be verified.' },
}, { status: 401 });

test('deployment gate permits only HTTPS production and owner-scoped previews', () => {
  assert.equal(validateTarget('https://passway-api.vercel.app'), 'https://passway-api.vercel.app');
  assert.equal(validateTarget('https://passway-abc123-naveenbharti310s-projects.vercel.app/'),
    'https://passway-abc123-naveenbharti310s-projects.vercel.app');
  for (const value of [
    'http://passway-api.vercel.app', 'https://attacker.example',
    'https://passway-api.vercel.app.attacker.example',
    'https://user:password@passway-api.vercel.app',
    'https://passway-api.vercel.app/api/otpSend',
    'https://passway-api.vercel.app?secret=value',
    'https://passway-api.vercel.app#fragment',
    'https://passway-api.vercel.app:8443',
  ]) assert.throws(() => validateTarget(value));
});

test('deployment gate uses only fixed malformed fixtures without authentication', async () => {
  const requests = [];
  const report = await runChecks({ fetchImpl: async (url, options) => {
    requests.push({ url, ...options });
    return denied();
  } });
  assert.equal(report.pass, true);
  assert.equal(requests.length, 8);
  for (const request of requests) {
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.authorization, undefined);
    const body = JSON.parse(request.body);
    if (request.url.endsWith('otpSend')) assert.deepEqual(body, { phone: 'not-a-phone-number' });
    else if (request.url.endsWith('otpVerify')) assert.deepEqual(body, { challengeId: 'invalid', code: 'invalid' });
    else assert.deepEqual(body, { data: {} });
  }
});

test('an ordinary sign-in rejection is not accepted as App Check enforcement', async () => {
  const report = await runChecks({ fetchImpl: async () => Response.json({
    error: { status: 'UNAUTHENTICATED', message: 'Sign in first.' },
  }, { status: 401 }) });
  assert.equal(report.pass, false);
  assert.ok(report.checks.every(check => !check.pass));
});

test('payload validation, server errors, and successful responses fail the gate', async () => {
  for (const status of [200, 400, 404, 500, 503]) {
    const report = await runChecks({ fetchImpl: async () => Response.json({
      error: { status: 'UNAUTHENTICATED', message: 'This app could not be verified.' },
    }, { status }) });
    assert.equal(report.pass, false);
  }
});

test('network failures and non-JSON responses fail closed without leaking exceptions', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('sensitive-upstream-credential'); },
    async () => new Response('<html>Login</html>', { status: 401 }),
  ]) {
    const report = await runChecks({ fetchImpl });
    assert.equal(report.pass, false);
    assert.ok(!JSON.stringify(report).includes('sensitive-upstream-credential'));
  }
});

test('preview credentials cannot be forwarded to production', async () => {
  let called = false;
  await assert.rejects(runChecks({
    bypass: 'private-preview-value',
    fetchImpl: async () => { called = true; return denied(); },
  }));
  assert.equal(called, false);
});
test('deployment gate rejects an absent getMessages endpoint even if the older routes reject App Check correctly', async () => {
  const report = await runChecks({ fetchImpl: async url => url.endsWith('/getMessages')
    ? Response.json({ error: { status: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
    : denied() });
  assert.equal(report.pass, false);
  assert.equal(report.checks.filter(check => check.route === 'getMessages').length, 2);
  assert.ok(report.checks.some(check => check.route === 'getMessages' && check.status === 404 && !check.pass));
});
