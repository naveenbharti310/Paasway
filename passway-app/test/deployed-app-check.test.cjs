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
  assert.equal(requests.length, 28);
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


test('production monitor covers every exported callable, not triggers or legacy diagnostic aliases', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '../functions/src');
  const index = fs.readFileSync(path.join(root, 'index.ts'), 'utf8');
  const exported = [...index.matchAll(/export\s*\{([^}]+)\}/g)]
    .flatMap(match => match[1].split(',').map(name => name.trim()));
  const callables = fs.readdirSync(path.join(root, 'handlers')).flatMap(file =>
    [...fs.readFileSync(path.join(root, 'handlers', file), 'utf8')
      .matchAll(/export const (\w+)\s*=\s*authedCallable\(/g)].map(match => match[1]))
    .filter(name => exported.includes(name));
  assert.equal(callables.length, 12);
  const report = await runChecks({ fetchImpl: async () => denied() });
  assert.deepEqual([...new Set(report.checks.map(check => check.route))].sort(),
    [...callables, 'otpSend', 'otpVerify'].sort());
  for (const route of [...callables, 'otpSend', 'otpVerify']) {
    assert.deepEqual(report.checks.filter(check => check.route === route).map(check => check.token),
      ['missing', 'invalid']);
  }
});

test('monitor bounds concurrency and preserves complete deterministic results', async () => {
  let active = 0, maximum = 0;
  const requests = [];
  const report = await runChecks({ fetchImpl: async (url, options) => {
    active++;
    maximum = Math.max(maximum, active);
    requests.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    await new Promise(resolve => setTimeout(resolve, url.endsWith('/otpSend') ? 15 : 1));
    active--;
    return denied();
  } });
  assert.ok(maximum > 1, 'independent probes must not run serially');
  assert.ok(maximum <= 4, 'production probes must not flood the service');
  assert.equal(requests.length, 28);
  assert.equal(report.checks.length, 28);
  assert.equal(report.pass, true);
  assert.deepEqual(report.checks.slice(0, 2).map(c => [c.route, c.token]),
    [['otpSend', 'missing'], ['otpSend', 'invalid']]);
});

test('every omitted callable blocks deployment even when all other routes reject correctly', async () => {
  for (const route of ['redeemTid', 'deactivateTid', 'respondToRequest', 'endConnection',
    'sendMessage', 'fileReport', 'blockUser', 'confirmAge', 'deleteAccount']) {
    const report = await runChecks({ fetchImpl: async url => url.endsWith('/' + route)
      ? Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 }) : denied() });
    assert.equal(report.pass, false, route);
    assert.equal(report.checks.filter(check => check.route === route && !check.pass).length, 2);
  }
});

test('oversized and wrong-media responses fail closed without serializing body or credentials', async () => {
  const target = 'https://passway-abc123-naveenbharti310s-projects.vercel.app';
  for (const response of [
    () => new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED',
      message: 'This app could not be verified.' } }), { status: 401, headers: { 'content-type': 'text/html' } }),
    () => new Response(' '.repeat(8192) + JSON.stringify({ error: { status: 'UNAUTHENTICATED',
      message: 'This app could not be verified.' } }), { status: 401, headers: { 'content-type': 'application/json' } }),
  ]) {
    const report = await runChecks({ target, bypass: 'private-preview-value', fetchImpl: async () => response() });
    assert.equal(report.pass, false);
    assert.ok(!JSON.stringify(report).includes('private-preview-value'));
  }
});
